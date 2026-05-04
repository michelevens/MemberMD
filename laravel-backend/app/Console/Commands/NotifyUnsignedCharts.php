<?php

namespace App\Console\Commands;

use App\Models\Encounter;
use App\Notifications\UnsignedChartNudge;
use Illuminate\Console\Command;

/**
 * Nudges providers when a draft encounter has been sitting unsigned
 * past compliance thresholds. Three tiers — 3, 7, 14 days — chosen
 * because:
 *   - 3 days: gentle reminder, well within most state requirements
 *   - 7 days: many states require chart completion within 7 calendar days
 *   - 14 days: hard backstop — at this point billing claims may be
 *     held up and the encounter is at real audit risk
 *
 * Idempotent: each tier writes a marker into the encounter's
 * structured_data ('nudge_3d_at', 'nudge_7d_at', 'nudge_14d_at')
 * so subsequent runs skip rows already nudged at that tier.
 *
 * Daily cadence — encounters age in days, not hours.
 *
 * Skips encounters that have been signed since the last run.
 */
class NotifyUnsignedCharts extends Command
{
    protected $signature = 'encounters:notify-unsigned';
    protected $description = 'Nudge providers about unsigned draft encounters at 3/7/14 day thresholds (idempotent)';

    public function handle(): int
    {
        $thresholds = [
            ['days' => 3, 'marker' => 'nudge_3d_at'],
            ['days' => 7, 'marker' => 'nudge_7d_at'],
            ['days' => 14, 'marker' => 'nudge_14d_at'],
        ];

        $totalFired = 0;
        $totalSkipped = 0;

        foreach ($thresholds as $tier) {
            $cutoff = now()->subDays($tier['days']);

            $candidates = Encounter::query()
                ->where('status', '!=', 'signed')
                ->whereNull('signed_at')
                ->where('encounter_date', '<=', $cutoff->toDateString())
                ->with(['patient', 'provider.user'])
                ->get();

            foreach ($candidates as $enc) {
                $meta = (array) ($enc->structured_data ?? []);
                if (!empty($meta[$tier['marker']])) {
                    $totalSkipped++;
                    continue;
                }

                try {
                    $providerUser = $enc->provider?->user;
                    if ($providerUser) {
                        $providerUser->notify(new UnsignedChartNudge($enc, $tier['days']));
                        $enc->update([
                            'structured_data' => array_merge($meta, [
                                $tier['marker'] => now()->toIso8601String(),
                            ]),
                        ]);
                        $totalFired++;
                    } else {
                        $totalSkipped++;
                    }
                } catch (\Throwable $e) {
                    \Log::warning('UnsignedChartNudge notification failed', [
                        'encounter_id' => $enc->id,
                        'tier_days' => $tier['days'],
                        'error' => $e->getMessage(),
                    ]);
                    $totalSkipped++;
                }
            }
        }

        $this->info("Unsigned-chart nudges: fired {$totalFired}, skipped {$totalSkipped}");
        return Command::SUCCESS;
    }
}
