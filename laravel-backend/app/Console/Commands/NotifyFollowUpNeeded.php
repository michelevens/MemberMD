<?php

namespace App\Console\Commands;

use App\Models\Appointment;
use App\Notifications\FollowUpNeeded;
use Illuminate\Console\Command;

/**
 * Posts an in-app notification on the provider's bell ~24 hours
 * after a completed appointment if the patient has no future
 * appointment booked with that provider yet.
 *
 * Why: the highest-leverage moment to nudge a follow-up booking is
 * the day after a visit while the encounter is fresh — but
 * providers often forget to check the chart afterward. This makes
 * the "schedule a follow-up?" reminder ambient.
 *
 * Idempotent: writes a marker into the appointment's metadata
 * (followup_notified_at) on first fire so subsequent runs of the
 * command skip rows we've already nudged.
 *
 * Schedule: hourly. Each run looks at the 23h-25h-ago window so
 * we fire once per appointment within an hour of the 24-hour
 * mark. Wider window than 1h would risk multi-fire across runs.
 */
class NotifyFollowUpNeeded extends Command
{
    protected $signature = 'appointments:notify-followup-needed';
    protected $description = 'Nudge providers to book a follow-up 24h after a completed visit (idempotent)';

    public function handle(): int
    {
        $windowStart = now()->subHours(25);
        $windowEnd = now()->subHours(23);

        $candidates = Appointment::query()
            ->where('status', 'completed')
            ->whereBetween('completed_at', [$windowStart, $windowEnd])
            ->with(['patient', 'provider.user'])
            ->get();

        $fired = 0;
        $skipped = 0;
        foreach ($candidates as $apt) {
            $meta = (array) ($apt->metadata ?? []);
            if (!empty($meta['followup_notified_at'])) {
                $skipped++;
                continue;
            }

            // Does this patient have any future appointment with the
            // SAME provider (not cancelled / no_show)? If yes, no
            // nudge — they already booked one.
            $hasFollowup = Appointment::where('tenant_id', $apt->tenant_id)
                ->where('patient_id', $apt->patient_id)
                ->where('provider_id', $apt->provider_id)
                ->where('id', '!=', $apt->id)
                ->where('scheduled_at', '>', $apt->scheduled_at)
                ->whereNotIn('status', ['cancelled', 'no_show'])
                ->exists();

            if ($hasFollowup) {
                $skipped++;
                // Stamp anyway so we don't re-evaluate this row again.
                $apt->update(['metadata' => array_merge($meta, [
                    'followup_notified_at' => now()->toIso8601String(),
                    'followup_outcome' => 'already_booked',
                ])]);
                continue;
            }

            // Fire the bell on the provider's user account.
            try {
                $providerUser = $apt->provider?->user;
                if ($providerUser) {
                    $providerUser->notify(new FollowUpNeeded($apt));
                    $apt->update(['metadata' => array_merge($meta, [
                        'followup_notified_at' => now()->toIso8601String(),
                        'followup_outcome' => 'notified',
                    ])]);
                    $fired++;
                } else {
                    $skipped++;
                }
            } catch (\Throwable $e) {
                \Log::warning('FollowUpNeeded notification failed', [
                    'appointment_id' => $apt->id,
                    'error' => $e->getMessage(),
                ]);
                $skipped++;
            }
        }

        $this->info("Follow-up nudges: fired {$fired}, skipped {$skipped}");
        return Command::SUCCESS;
    }
}
