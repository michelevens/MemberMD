<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Backfill: every existing practice gets a PracticeSubscription row.
 *
 * Required because we can't gate access on a subscription row that doesn't
 * exist — the EnforcePlanCap middleware would deny everything for any pre-
 * existing practice. Runs on Railway's deploy boot via `migrate --force`.
 *
 * Bella Care (slug 'bella-care' or owner email michelevens@gmail.com) →
 * Founder tier override (never billed, all caps unlimited).
 *
 * All other practices → tier matched to their CURRENT usage:
 *   - ≤50 members AND ≤1 provider → Solo trial
 *   - ≤250 members AND ≤5 providers → Group trial
 *   - else → Multi-Site trial
 * 30-day trial window because they didn't opt in to this; gives time to email
 * them and let them choose.
 *
 * Idempotent — checks for existing practice_subscriptions row before insert.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Step 1: ensure platform_plans rows exist. Migration runs before
        // seeders on a fresh deploy, so we inline the minimum needed plans.
        // Idempotent — keyed on `key`, so repeat runs no-op.
        $this->ensurePlatformPlans();

        // Step 2: pull plan ids
        $planByKey = DB::table('platform_plans')->pluck('id', 'key');
        $founderId = $planByKey['founder'] ?? null;
        $soloId = $planByKey['solo'] ?? null;
        $groupId = $planByKey['group'] ?? null;
        $multiSiteId = $planByKey['multi_site'] ?? null;

        if (!$founderId || !$soloId || !$groupId || !$multiSiteId) {
            \Illuminate\Support\Facades\Log::warning(
                'Skipping practice_subscriptions backfill: required platform_plans rows missing.'
            );
            return;
        }

        // Step 3: walk practices, classify, insert
        $practices = DB::table('practices')->select('id', 'slug', 'owner_email', 'name')->get();
        $now = now();
        $trialEndsAt = $now->copy()->addDays(30);
        $inserted = 0;

        foreach ($practices as $practice) {
            // Skip if already has a subscription row
            $exists = DB::table('practice_subscriptions')
                ->where('practice_id', $practice->id)
                ->exists();
            if ($exists) {
                continue;
            }

            // Bella Care + EnnHealth-owned practices → Founder
            $isFounder = $this->isFounderPractice($practice);

            if ($isFounder) {
                $planId = $founderId;
                $status = 'active';
                $trialEnds = null;
                $isFounderOverride = true;
            } else {
                // Classify by usage
                $memberCount = DB::table('patient_memberships')
                    ->where('tenant_id', $practice->id)
                    ->whereIn('status', ['active', 'trialing', 'past_due'])
                    ->count();
                // providers has no is_active column — every row is a real
                // provider. Count by tenant alone for cap-classification.
                $providerCount = DB::table('providers')
                    ->where('tenant_id', $practice->id)
                    ->count();

                if ($memberCount > 250 || $providerCount > 5) {
                    $planId = $multiSiteId;
                } elseif ($memberCount > 50 || $providerCount > 1) {
                    $planId = $groupId;
                } else {
                    $planId = $soloId;
                }
                $status = 'trial';
                $trialEnds = $trialEndsAt;
                $isFounderOverride = false;
            }

            DB::table('practice_subscriptions')->insert([
                'id' => (string) Str::uuid(),
                'practice_id' => $practice->id,
                'platform_plan_id' => $planId,
                'status' => $status,
                'billing_cycle' => 'monthly',
                'purchased_seat_blocks' => 0,
                'current_member_count' => 0,
                'trial_ends_at' => $trialEnds,
                'is_founder_override' => $isFounderOverride,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $inserted++;
        }

        \Illuminate\Support\Facades\Log::info("Backfilled {$inserted} practice subscriptions.");
    }

    public function down(): void
    {
        // Backfill is data-only; nothing to roll back without dropping rows
        // that may have been edited post-backfill. Keep the no-op.
    }

    private function isFounderPractice(object $practice): bool
    {
        $slugMatches = ['bella-care', 'bellacare', 'ennhealth', 'enn-health'];
        $emailMatches = ['michelevens@gmail.com', 'nageley@ennhealth.com'];

        if ($practice->slug && in_array(strtolower($practice->slug), $slugMatches, true)) {
            return true;
        }
        if ($practice->owner_email && in_array(strtolower($practice->owner_email), $emailMatches, true)) {
            return true;
        }
        return false;
    }

    /**
     * Inline-ensure the platform_plans rows exist before backfill runs.
     * Idempotent. Subset of PlatformPlanSeeder — only the minimum the
     * backfill needs (founder/solo/group/multi_site). Enterprise + full
     * pricing details land via PlatformPlanSeeder when seeders run.
     */
    private function ensurePlatformPlans(): void
    {
        $rows = [
            [
                'key' => 'solo',
                'name' => 'Solo',
                'description' => 'For solo practitioners.',
                'monthly_price' => 19.00,
                'annual_price' => 190.00,
                'max_members' => 50,
                'max_providers' => 1,
                'max_staff' => 1,
                'max_active_programs' => 1,
                'max_locations' => 1,
                'max_employers' => 0,
                'api_access_level' => 'none',
                'extra_seat_block_size' => 25,
                'extra_seat_block_price' => 15.00,
                'sort_order' => 1,
            ],
            [
                'key' => 'group',
                'name' => 'Group',
                'badge_text' => 'Most Popular',
                'description' => 'For multi-provider practices.',
                'monthly_price' => 79.00,
                'annual_price' => 790.00,
                'max_members' => 250,
                'max_providers' => 5,
                'max_staff' => 5,
                'max_active_programs' => 3,
                'max_locations' => 1,
                'max_employers' => 5,
                'api_access_level' => 'read',
                'extra_seat_block_size' => 50,
                'extra_seat_block_price' => 25.00,
                'sort_order' => 2,
            ],
            [
                'key' => 'multi_site',
                'name' => 'Multi-Site',
                'description' => 'For multi-location practices.',
                'monthly_price' => 249.00,
                'annual_price' => 2490.00,
                'max_members' => 1000,
                'api_access_level' => 'full',
                'extra_seat_block_size' => 100,
                'extra_seat_block_price' => 25.00,
                'features' => json_encode(['webhook_endpoints']),
                'sort_order' => 3,
            ],
            [
                'key' => 'founder',
                'name' => 'Founder',
                'badge_text' => 'Internal',
                'description' => 'EnnHealth-owned. Never billed.',
                'is_publicly_listed' => false,
                'monthly_price' => 0,
                'annual_price' => 0,
                'api_access_level' => 'full',
                'features' => json_encode([
                    'sso', 'emr_integrations', 'white_label', 'custom_baa',
                    'webhook_endpoints', 'dedicated_am', 'priority_support',
                ]),
                'sort_order' => 99,
            ],
        ];

        $now = now();
        foreach ($rows as $row) {
            $existing = DB::table('platform_plans')->where('key', $row['key'])->first();
            if ($existing) {
                continue;
            }
            DB::table('platform_plans')->insert(array_merge([
                'id' => (string) Str::uuid(),
                'is_quote_only' => false,
                'is_publicly_listed' => true,
                'is_active' => true,
                'card_fee_bps' => 290,
                'card_fee_flat_cents' => 30,
                'ach_fee_bps' => 80,
                'ach_fee_flat_cents' => 25,
                'ach_fee_cap_cents' => 500,
                'trial_days' => 14,
                'created_at' => $now,
                'updated_at' => $now,
            ], $row));
        }
    }
};
