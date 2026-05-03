<?php

namespace App\Console\Commands;

use App\Models\PlatformPlan;
use App\Models\PracticeSubscription;
use App\Services\PlatformBillingService;
use Illuminate\Console\Command;
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

    public function handle(PlatformBillingService $billing): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $now = now();

        $usageRefreshed = 0;
        $downgradeCandidates = 0;
        $downgradesApplied = 0;
        $trialsExpired = 0;
        $errors = 0;

        $subs = PracticeSubscription::with('plan')
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->cursor();

        foreach ($subs as $sub) {
            try {
                // 1. Refresh member count
                $count = \DB::table('patient_memberships')
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
                            if (!$dryRun) {
                                $sub->update([
                                    'purchased_seat_blocks' => max(0, $sub->purchased_seat_blocks - 1),
                                    'seats_eligible_for_downgrade_since' => null,
                                ]);
                                Log::info('Auto-downgraded seat slot', [
                                    'practice_subscription_id' => $sub->id,
                                    'new_blocks' => $sub->purchased_seat_blocks - 1,
                                ]);
                                // TODO: send "your slot was auto-downgraded" email
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

                // 3. Trial expiration. Founder accounts skip — they never expire.
                if (
                    $sub->status === 'trial'
                    && !$sub->is_founder_override
                    && $sub->trial_ends_at
                    && $sub->trial_ends_at->isPast()
                ) {
                    if (!$dryRun) {
                        $sub->update([
                            'status' => 'cancelled',
                            'cancelled_at' => $now,
                        ]);
                        // TODO: send "trial expired" email + reactivation link
                    }
                    $trialsExpired++;
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
        $this->info("  Errors: {$errors}");

        return $errors > 0 ? self::FAILURE : self::SUCCESS;
    }
}
