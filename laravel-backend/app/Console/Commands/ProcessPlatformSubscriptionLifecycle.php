<?php

namespace App\Console\Commands;

use App\Mail\SlotDowngradedMail;
use App\Mail\TrialEndingSoonMail;
use App\Mail\TrialExpiredMail;
use App\Models\Practice;
use App\Models\PracticeSubscription;
use App\Services\MailDispatcher;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Nightly job for the Practice → MemberMD subscription tier.
 *
 * Three responsibilities:
 *   1. Refresh `current_member_count` on every subscription row from the
 *      live `patient_memberships` table — drives the dashboard usage badges
 *      without a query-per-pageload.
 *   2. Auto-downgrade slot blocks: if a practice has paid for capacity
 *      they aren't using for 60 consecutive days, step them down on next
 *      cycle. Tracks the eligibility window via `seats_eligible_for_downgrade_since`.
 *   3. Trial expiration: practices whose trial_ends_at < now (and who
 *      didn't pick a paid tier) flip to `cancelled` so the EnforcePlanCap
 *      middleware blocks creates. Webhook handles the same transition when
 *      Stripe is wired; this is the safety net for when it isn't.
 *
 * Idempotent — safe to run multiple times per day.
 */
class ProcessPlatformSubscriptionLifecycle extends Command
{
    protected $signature = 'platform-billing:lifecycle {--dry-run : Show what would change without writing}';

    protected $description = 'Refresh usage counts, auto-downgrade unused slots, expire trials for practice subscriptions.';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $now = now();

        $usageRefreshed = 0;
        $downgradeCandidates = 0;
        $downgradesApplied = 0;
        $trialsExpired = 0;
        $emailsSent = 0;
        $errors = 0;

        $subs = PracticeSubscription::with('plan')
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->cursor();

        foreach ($subs as $sub) {
            try {
                // 1. Refresh member count
                $count = DB::table('patient_memberships')
                    ->where('tenant_id', $sub->practice_id)
                    ->whereIn('status', ['active', 'trialing', 'past_due'])
                    ->count();
                if ($sub->current_member_count !== $count) {
                    if (!$dryRun) {
                        $sub->update(['current_member_count' => $count]);
                    }
                    $usageRefreshed++;
                }

                // 2. Slot auto-downgrade — only relevant for paid tiers with
                // a member cap and at least one purchased seat block
                $plan = $sub->plan;
                if ($plan && $plan->max_members !== null && $sub->purchased_seat_blocks > 0) {
                    $blockSize = (int) ($plan->extra_seat_block_size ?? 0);
                    $oneSlotLower = $plan->max_members + ($sub->purchased_seat_blocks - 1) * $blockSize;

                    if ($count <= $oneSlotLower) {
                        $downgradeCandidates++;
                        // Start the eligibility clock if it isn't already running
                        if (!$sub->seats_eligible_for_downgrade_since) {
                            if (!$dryRun) {
                                $sub->update(['seats_eligible_for_downgrade_since' => $now]);
                            }
                        } elseif ($sub->seats_eligible_for_downgrade_since->diffInDays($now) >= 60) {
                            // 60 days under threshold → step down a slot
                            $oldBlocks = $sub->purchased_seat_blocks;
                            $newBlocks = max(0, $oldBlocks - 1);
                            if (!$dryRun) {
                                $sub->update([
                                    'purchased_seat_blocks' => $newBlocks,
                                    'seats_eligible_for_downgrade_since' => null,
                                ]);
                                Log::info('Auto-downgraded seat slot', [
                                    'practice_subscription_id' => $sub->id,
                                    'new_blocks' => $newBlocks,
                                ]);
                                if ($this->sendBillingEmail($sub, 'slot_downgrade_' . $oldBlocks . '_to_' . $newBlocks, fn () => new SlotDowngradedMail($sub->fresh(), $oldBlocks, $newBlocks))) {
                                    $emailsSent++;
                                }
                            }
                            $downgradesApplied++;
                        }
                    } elseif ($sub->seats_eligible_for_downgrade_since) {
                        // Member count climbed back above threshold — reset the clock
                        if (!$dryRun) {
                            $sub->update(['seats_eligible_for_downgrade_since' => null]);
                        }
                    }
                }

                // 3. Trial reminders + expiration. Founder accounts skip
                //    — they never expire and never get billing emails.
                if ($sub->status === 'trial' && !$sub->is_founder_override && $sub->trial_ends_at) {
                    $daysUntilEnd = (int) round($now->floatDiffInDays($sub->trial_ends_at, false));

                    if ($sub->trial_ends_at->isPast()) {
                        if (!$dryRun) {
                            $sub->update([
                                'status' => 'cancelled',
                                'cancelled_at' => $now,
                            ]);
                            if ($this->sendBillingEmail($sub, 'trial_expired', fn () => new TrialExpiredMail($sub->fresh()))) {
                                $emailsSent++;
                            }
                        }
                        $trialsExpired++;
                    } elseif (!$dryRun) {
                        // T-30, T-7, T-1 reminders. Each fires at-or-before
                        // the milestone day so a cron started late still
                        // catches a sub that crossed the line yesterday.
                        foreach ([30, 7, 1] as $threshold) {
                            $key = "trial_t_minus_{$threshold}";
                            if ($daysUntilEnd <= $threshold && !$sub->hasSentNotification($key)) {
                                if ($this->sendBillingEmail($sub, $key, fn () => new TrialEndingSoonMail($sub->fresh(), max(1, $daysUntilEnd)))) {
                                    $emailsSent++;
                                }
                                break; // only one reminder per cron run per sub
                            }
                        }
                    }
                }
            } catch (\Throwable $e) {
                $errors++;
                Log::warning('Lifecycle processing failed for subscription', [
                    'practice_subscription_id' => $sub->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $prefix = $dryRun ? '[DRY-RUN] ' : '';
        $this->info("{$prefix}Platform-subscription lifecycle complete:");
        $this->info("  Usage refreshed: {$usageRefreshed}");
        $this->info("  Downgrade candidates (under threshold): {$downgradeCandidates}");
        $this->info("  Downgrades applied (60-day rule): {$downgradesApplied}");
        $this->info("  Trials expired: {$trialsExpired}");
        $this->info("  Emails sent: {$emailsSent}");
        $this->info("  Errors: {$errors}");

        return $errors > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Send a billing email to the practice owner, idempotent on the named
     * milestone key. Returns true if an email actually went out.
     */
    private function sendBillingEmail(PracticeSubscription $sub, string $key, callable $mailableFactory): bool
    {
        if ($sub->hasSentNotification($key)) {
            return false;
        }

        $practice = $sub->practice ?? Practice::find($sub->practice_id);
        $recipient = $practice?->owner_email ?? $practice?->email;
        if (!$recipient) {
            Log::info('Skipping billing email — no recipient', [
                'practice_subscription_id' => $sub->id,
                'milestone' => $key,
            ]);
            return false;
        }

        $sent = MailDispatcher::send($recipient, $mailableFactory(), "platform_billing.{$key}");
        if ($sent) {
            $sub->markNotificationSent($key);
        }
        return $sent;
    }
}
