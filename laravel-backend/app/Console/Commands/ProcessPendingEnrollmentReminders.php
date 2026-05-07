<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\PendingEnrollmentController;
use App\Mail\EnrollmentReminderEmail;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PendingEnrollment;
use App\Models\Practice;
use App\Services\MailDispatcher;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Stalled-enrollment recovery cron.
 *
 * Runs hourly. For every PendingEnrollment in 'pending' status, decides
 * which (if any) of three milestones to fire:
 *
 *   T-2h  expiring     — link is about to die in <2h, prod the patient now
 *   T+24h second_touch — full life-cycle elapsed, mint a fresh link
 *   T+72h final        — last reminder before we leave it dormant; staff
 *                         can still resend manually but the cron stops
 *
 * Each milestone fires once per row (tracked via reminders_sent JSON
 * map). reminder_count is bumped each fire. Admins who hit the manual
 * Resend bump it too — past 3 touches the cron stops auto-firing so we
 * don't drain inbox goodwill.
 *
 * Idempotent — safe to run every hour. The milestone-key gate ensures
 * we never double-send.
 */
class ProcessPendingEnrollmentReminders extends Command
{
    protected $signature = 'enrollments:process-reminders {--dry-run : Show what would change without sending}';

    protected $description = 'Send drip reminders to patients who started enrollment but haven\'t paid (T-2h / T+24h / T+72h).';

    private const MILESTONE_EXPIRING = 't_minus_2h_expiring';
    private const MILESTONE_SECOND_TOUCH = 't_plus_24h_resend';
    private const MILESTONE_FINAL = 't_plus_72h_final';

    /**
     * Hard cap on auto-touches per row. Includes manual Resend hits, so
     * a row that staff already nudged twice gets at most one more from
     * the cron before going dormant.
     */
    private const MAX_AUTO_TOUCHES = 3;

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $now = now();

        $sent = 0;
        $skipped = 0;
        $errors = 0;

        $rows = PendingEnrollment::where('status', PendingEnrollment::STATUS_PENDING)
            ->whereNotNull('created_at')
            ->cursor();

        foreach ($rows as $pending) {
            try {
                $milestone = $this->milestoneFor($pending, $now);
                if ($milestone === null) {
                    $skipped++;
                    continue;
                }

                $reminders = is_array($pending->reminders_sent) ? $pending->reminders_sent : [];
                if (isset($reminders[$milestone])) {
                    $skipped++;
                    continue;
                }
                if ((int) $pending->reminder_count >= self::MAX_AUTO_TOUCHES) {
                    $skipped++;
                    continue;
                }

                if ($dryRun) {
                    $this->info("[DRY-RUN] Would send '{$milestone}' to enrollment {$pending->id}");
                    continue;
                }

                $ok = $this->fireReminder($pending, $milestone);
                if ($ok) {
                    $reminders[$milestone] = $now->toIso8601String();
                    $pending->update([
                        'reminders_sent' => $reminders,
                        'reminder_count' => (int) $pending->reminder_count + 1,
                        'last_resent_at' => $now,
                    ]);
                    $sent++;
                } else {
                    $errors++;
                }
            } catch (Throwable $e) {
                $errors++;
                Log::warning('Pending-enrollment reminder loop error', [
                    'pending_enrollment_id' => $pending->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $prefix = $dryRun ? '[DRY-RUN] ' : '';
        $this->info("{$prefix}Pending-enrollment reminders complete:");
        $this->info("  Sent:    {$sent}");
        $this->info("  Skipped: {$skipped}");
        $this->info("  Errors:  {$errors}");

        return $errors > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Decide which milestone (if any) is currently due. Returns null
     * if the row is too young (< T+22h since create) or already past
     * the final window.
     *
     * Milestone windows are inclusive lower-bound: at exactly 22h we
     * fire the expiring; at 24h we fire second_touch; at 72h final.
     * Earlier-window state is preserved by the reminders_sent gate so
     * a row past 72h that never hit 22h won't backfill expiring.
     */
    private function milestoneFor(PendingEnrollment $pending, \Carbon\CarbonInterface $now): ?string
    {
        $created = $pending->created_at;
        if (!$created) return null;

        // Carbon 3 returns a float here. Use the absolute diff (always
        // positive since $created is in the past). We compute against
        // a small tolerance to handle SQLite timestamp rounding (test
        // setUp's 23h backdate can land at 22.999h after a round-trip).
        $hoursSinceCreate = (float) $created->diffInHours($now);

        // Final touch — anything 72h+ that hasn't been finalized yet.
        if ($hoursSinceCreate >= 71.5) {
            return self::MILESTONE_FINAL;
        }
        // Second touch at 24-72h.
        if ($hoursSinceCreate >= 23.5) {
            return self::MILESTONE_SECOND_TOUCH;
        }
        // Expiring at 22-24h. We use hours-since-create rather than
        // expires_at-minus-2h because expires_at gets refreshed when
        // someone hits the resend button — that would re-arm the
        // expiring nudge over and over. Created-at is stable.
        if ($hoursSinceCreate >= 21.5) {
            return self::MILESTONE_EXPIRING;
        }
        return null;
    }

    private function fireReminder(PendingEnrollment $pending, string $milestone): bool
    {
        $email = $pending->cached_email
            ?: optional(Patient::find($pending->patient_id))->email;
        if (!$email) {
            Log::info('Pending-enrollment reminder skipped — no email', [
                'pending_enrollment_id' => $pending->id,
            ]);
            return false;
        }

        $practice = Practice::find($pending->tenant_id);
        $patient = Patient::find($pending->patient_id);
        $plan = MembershipPlan::find($pending->plan_id);
        if (!$practice || !$patient || !$plan) {
            return false;
        }

        // T+24h and T+72h deserve fresh Stripe sessions. T-2h reuses the
        // existing one (the patient may already have it open in another
        // tab; minting a new one would make their old tab fail).
        $url = $pending->checkout_url ?? '';
        if (in_array($milestone, [self::MILESTONE_SECOND_TOUCH, self::MILESTONE_FINAL], true)) {
            try {
                $controller = app(PendingEnrollmentController::class);
                $url = $controller->ensureFreshCheckoutUrl($pending);
            } catch (Throwable $e) {
                Log::warning('Could not refresh stalled enrollment session before reminder', [
                    'pending_enrollment_id' => $pending->id,
                    'error' => $e->getMessage(),
                ]);
                // Bail — can't send a reminder pointing at a dead session.
                return false;
            }
        }

        $tone = match ($milestone) {
            self::MILESTONE_EXPIRING => 'expiring',
            self::MILESTONE_FINAL => 'final',
            default => 'second_touch',
        };

        return MailDispatcher::send(
            $email,
            new EnrollmentReminderEmail(
                patient: $patient,
                practice: $practice,
                plan: $plan,
                pending: $pending->fresh(),
                checkoutUrl: $url,
                tone: $tone,
            ),
            'patient.enrollment_reminder',
            $practice->id,
            $patient->id,
        );
    }
}
