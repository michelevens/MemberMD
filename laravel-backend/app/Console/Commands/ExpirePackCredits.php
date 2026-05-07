<?php

namespace App\Console\Commands;

use App\Models\PatientVisitPackCredit;
use Illuminate\Console\Command;

/**
 * Daily sweep that zeroes out expired visit-pack credits.
 *
 * UtilizationTrackingService::checkEntitlement and consumePackCredits
 * already filter on `expires_at > now()`, so expired rows are
 * functionally inert at consume-time. But:
 *
 *   - SUM(credits_remaining) over the table for reporting includes
 *     the still-non-zero expired rows, overstating "credits on the
 *     books" — bad for AR-aging-style dashboards
 *   - The patient portal's "credits available" badge reads the row
 *     value directly, not the consume-time filter, so a patient sees
 *     "5 visits available" until they try to use one and get blocked
 *
 * Zeroing credits_remaining at expiry time is the cheap fix. The row
 * stays for audit (purchased_at, original credits_total preserved);
 * only the spendable counter goes to zero.
 */
class ExpirePackCredits extends Command
{
    protected $signature = 'entitlements:expire-pack-credits {--dry-run : Print what would change without writing}';

    protected $description = 'Zero credits_remaining on visit-pack credits past their expires_at.';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $query = PatientVisitPackCredit::query()
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->where('credits_remaining', '>', 0);

        $count = $query->count();

        if ($dryRun) {
            $this->info("[DRY-RUN] {$count} pack-credit row(s) would be zeroed.");
            $query->limit(10)->get()->each(function ($r) {
                $this->line("  · {$r->id} (expired {$r->expires_at}, remaining {$r->credits_remaining})");
            });
            return self::SUCCESS;
        }

        $updated = $query->update([
            'credits_remaining' => 0,
            'updated_at' => now(),
        ]);

        $this->info("Zeroed {$updated} expired pack-credit row(s).");
        return self::SUCCESS;
    }
}
