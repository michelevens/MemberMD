<?php

namespace App\Console\Commands;

use App\Models\Practice;
use App\Services\StripeConnectService;
use Illuminate\Console\Command;

/**
 * One-shot backfill: walk every Stripe-ready practice and sync any
 * MembershipPlan rows that have prices but no Stripe price IDs.
 *
 * Needed because:
 *   - AuthController + StarterPlanController only added Stripe sync
 *     in this commit; plans created before that have prices in our DB
 *     but no Stripe Product/Price.
 *   - The public enrollment flow falls back to free 'manual' mode when
 *     a plan has no Stripe price ID, so patients enroll without paying.
 *
 * Safe to run repeatedly. Plans whose Stripe price IDs are already
 * populated are no-ops (syncPlanPricesToStripe early-returns).
 *
 * Usage:
 *   php artisan plans:backfill-stripe-sync                # all practices
 *   php artisan plans:backfill-stripe-sync --practice=ID  # one practice
 */
class BackfillStripePlanSync extends Command
{
    protected $signature = 'plans:backfill-stripe-sync
                            {--practice= : Limit to a single practice id}';

    protected $description = 'Sync plan prices to Stripe for any plan with prices but no Stripe price IDs';

    public function handle(StripeConnectService $connect): int
    {
        $practiceFilter = $this->option('practice');

        $practices = Practice::query()
            ->whereNotNull('stripe_account_id')
            ->where('stripe_connect_status', 'active')
            ->when($practiceFilter, fn ($q) => $q->where('id', $practiceFilter))
            ->get();

        if ($practices->isEmpty()) {
            $this->warn('No Stripe-active practices matched.');
            return self::SUCCESS;
        }

        $totalSynced = 0;
        $totalFailed = 0;

        foreach ($practices as $practice) {
            $result = $connect->syncUnsyncedPlans($practice);
            if (!empty($result['skipped_reason'])) {
                $this->line("  {$practice->name}: skipped ({$result['skipped_reason']})");
                continue;
            }
            if ($result['synced'] > 0 || $result['failed'] > 0) {
                $this->info("  {$practice->name}: synced={$result['synced']} failed={$result['failed']}");
            }
            $totalSynced += $result['synced'];
            $totalFailed += $result['failed'];
        }

        $this->line('');
        $this->info("Done. synced={$totalSynced} failed={$totalFailed}");

        return $totalFailed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
