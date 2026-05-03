<?php

namespace Database\Seeders;

use App\Models\PlatformPlan;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seed the four public PlatformPlan tiers (Solo / Group / Multi-Site / Enterprise)
 * plus the internal Founder tier for EnnHealth-owned practices.
 *
 * Idempotent — keyed on `key`, so re-running updates pricing/caps without
 * creating duplicates. Stripe price ids stay null at seed time; populated by
 * a separate "sync to Stripe" admin action that creates the platform-side
 * Products/Prices once Stripe keys are configured.
 */
class PlatformPlanSeeder extends Seeder
{
    public function run(): void
    {
        $rows = [
            [
                'key' => 'solo',
                'name' => 'Solo',
                'badge_text' => null,
                'description' => 'For solo practitioners running their own DPC practice.',
                'is_quote_only' => false,
                'is_publicly_listed' => true,
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
                'features' => null,
                'sort_order' => 1,
            ],
            [
                'key' => 'group',
                'name' => 'Group',
                'badge_text' => 'Most Popular',
                'description' => 'For multi-provider practices running multiple programs.',
                'is_quote_only' => false,
                'is_publicly_listed' => true,
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
                'features' => null,
                'sort_order' => 2,
            ],
            [
                'key' => 'multi_site',
                'name' => 'Multi-Site',
                'badge_text' => null,
                'description' => 'For multi-location practices and growing networks.',
                'is_quote_only' => false,
                'is_publicly_listed' => true,
                'monthly_price' => 249.00,
                'annual_price' => 2490.00,
                'max_members' => 1000,
                'max_providers' => null,
                'max_staff' => null,
                'max_active_programs' => null,
                'max_locations' => null,
                'max_employers' => null,
                'api_access_level' => 'full',
                'extra_seat_block_size' => 100,
                'extra_seat_block_price' => 25.00,
                'features' => ['webhook_endpoints'],
                'sort_order' => 3,
            ],
            [
                'key' => 'enterprise',
                'name' => 'Enterprise',
                'badge_text' => null,
                'description' => 'Custom integrations, SSO, EMR, white-label. Talk to us.',
                'is_quote_only' => true,
                'is_publicly_listed' => true,
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
                'features' => [
                    'sso', 'emr_integrations', 'white_label', 'custom_baa',
                    'webhook_endpoints', 'dedicated_am', 'priority_support',
                ],
                'sort_order' => 4,
            ],
            [
                'key' => 'founder',
                'name' => 'Founder',
                'badge_text' => 'Internal',
                'description' => 'EnnHealth-owned practices. Never billed.',
                'is_quote_only' => false,
                'is_publicly_listed' => false,
                'monthly_price' => 0,
                'annual_price' => 0,
                'max_members' => null,
                'max_providers' => null,
                'max_staff' => null,
                'max_active_programs' => null,
                'max_locations' => null,
                'max_employers' => null,
                'api_access_level' => 'full',
                'extra_seat_block_size' => null,
                'extra_seat_block_price' => null,
                'features' => [
                    'sso', 'emr_integrations', 'white_label', 'custom_baa',
                    'webhook_endpoints', 'dedicated_am', 'priority_support',
                ],
                'sort_order' => 99,
            ],
        ];

        foreach ($rows as $row) {
            PlatformPlan::updateOrCreate(['key' => $row['key']], $row);
        }

        $this->command->info('Seeded ' . count($rows) . ' platform plans.');
    }
}
