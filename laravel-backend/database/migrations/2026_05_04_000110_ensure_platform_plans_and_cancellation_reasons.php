<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Idempotent backfill — guarantees the Enterprise platform plan and the
 * default SuperAdmin cancellation reasons exist on every deploy boot,
 * regardless of whether `db:seed --force` actually ran the relevant
 * seeders.
 *
 * Why this exists: PlatformPlanSeeder + SuperAdminCancellationReasonSeeder
 * sit at the end of DatabaseSeeder's call() array. If any earlier seeder
 * fails (or db:seed itself is skipped), neither runs. On Railway we saw
 * platform_plans missing the 'enterprise' row and superadmin_cancellation_reasons
 * empty — both reproducible via the API.
 *
 * Migrations always run (boot command is `migrate --force && ...`), so
 * embedding the data here is the surest way to keep production aligned
 * with what the seeder declares.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->ensureEnterprisePlatformPlan();
        $this->ensureCancellationReasons();
    }

    public function down(): void
    {
        // Backfill — nothing to roll back.
    }

    private function ensureEnterprisePlatformPlan(): void
    {
        $exists = DB::table('platform_plans')->where('key', 'enterprise')->exists();
        if ($exists) return;

        $now = now();
        DB::table('platform_plans')->insert([
            'id' => (string) Str::uuid(),
            'key' => 'enterprise',
            'name' => 'Enterprise',
            'badge_text' => null,
            'description' => 'Custom integrations, SSO, EMR, white-label. Talk to us.',
            'is_quote_only' => true,
            'is_publicly_listed' => true,
            'is_active' => true,
            'monthly_price' => 0,
            'annual_price' => null,
            'max_members' => null,
            'max_providers' => null,
            'max_staff' => null,
            'max_active_programs' => null,
            'max_locations' => null,
            'max_employers' => null,
            'api_access_level' => 'full',
            'extra_seat_block_size' => null,
            'extra_seat_block_price' => null,
            'card_fee_bps' => 290,
            'card_fee_flat_cents' => 30,
            'ach_fee_bps' => 80,
            'ach_fee_flat_cents' => 25,
            'ach_fee_cap_cents' => 500,
            'trial_days' => 14,
            'features' => json_encode([
                'sso', 'emr_integrations', 'white_label', 'custom_baa',
                'webhook_endpoints', 'dedicated_am', 'priority_support',
            ]),
            'sort_order' => 4,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    private function ensureCancellationReasons(): void
    {
        $rows = [
            ['label' => 'Switching to another platform', 'sort_order' => 1],
            ['label' => 'Cost / pricing concerns', 'sort_order' => 2],
            ['label' => 'Missing features', 'sort_order' => 3],
            ['label' => 'Practice closing or pausing', 'sort_order' => 4],
            ['label' => 'Not enough members yet', 'sort_order' => 5],
            ['label' => 'Technical issues / bugs', 'sort_order' => 6],
            ['label' => 'Difficult to use', 'sort_order' => 7],
            ['label' => 'Support / responsiveness', 'sort_order' => 8],
            ['label' => 'Other', 'sort_order' => 99],
        ];

        $now = now();
        foreach ($rows as $row) {
            // Idempotent on label — partial unique index from migration 000020
            // already prevents dupes; this is just a defensive guard against
            // the insert error.
            $exists = DB::table('superadmin_cancellation_reasons')
                ->whereRaw('lower(label) = ?', [strtolower($row['label'])])
                ->exists();
            if ($exists) continue;

            DB::table('superadmin_cancellation_reasons')->insert([
                'id' => (string) Str::uuid(),
                'label' => $row['label'],
                'description' => null,
                'sort_order' => $row['sort_order'],
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
};
