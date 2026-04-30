<?php

namespace App\Console\Commands;

use App\Models\MembershipPlan;
use App\Models\Practice;
use App\Services\StripeConnectService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;

/**
 * One-shot setup: create a Stripe Connect Express account for the demo
 * practice and create Stripe Products + Prices for each demo plan.
 *
 * After this runs:
 *   - practices.stripe_account_id is populated for Clearstone
 *   - membership_plans.stripe_monthly_price_id + stripe_annual_price_id
 *     are populated for all 5 demo plans
 *   - The practice still needs to complete onboarding (test-mode shortcut
 *     accepted by the Stripe dashboard) before charges can clear, but the
 *     account exists and prices exist so subscription create calls work
 *     against test data.
 *
 * Idempotent: re-runs replace null values only. To force re-creation,
 * pass --force.
 *
 * Usage:
 *   php artisan demo:wire-stripe                 # set up missing pieces
 *   php artisan demo:wire-stripe --force         # rebuild even if present
 *   php artisan demo:wire-stripe --tenant=CLRSTN # specific tenant code
 */
class WireDemoStripe extends Command
{
    protected $signature = 'demo:wire-stripe
        {--force : Recreate Stripe objects even if IDs already exist}
        {--tenant=CLRSTN : Tenant code to wire up}';

    protected $description = 'Create Stripe Connect account + Products/Prices for the demo tenant';

    public function handle(StripeConnectService $connect): int
    {
        $secret = (string) config('services.stripe.secret');
        if ($secret === '') {
            $this->error('STRIPE_SECRET is not configured. Set it in .env (or Railway env vars) before running.');
            return self::FAILURE;
        }

        $tenantCode = (string) $this->option('tenant');
        $force = (bool) $this->option('force');

        $practice = Practice::where('tenant_code', $tenantCode)->first();
        if (!$practice) {
            $this->error("No practice found with tenant_code = {$tenantCode}. Run DemoSeeder first.");
            return self::FAILURE;
        }

        $stripe = new StripeClient($secret);

        // ─── 1. Connect Express account ─────────────────────────────────
        if (empty($practice->stripe_account_id) || $force) {
            $this->info("→ Creating Stripe Connect Express account for {$practice->name}...");
            try {
                $accountId = $connect->createOrGetAccount($practice);
                $this->info("  ✓ Account: {$accountId}");
            } catch (\Throwable $e) {
                $this->error("  ✗ Failed: {$e->getMessage()}");
                return self::FAILURE;
            }
        } else {
            $this->info("✓ Connect account already exists: {$practice->stripe_account_id}");
        }

        // ─── 2. Onboarding link (printed for the user to visit) ─────────
        try {
            $onboardingUrl = $connect->createOnboardingLink($practice);
            $this->info("→ Onboarding link (open this in a browser to complete setup):");
            $this->line("  {$onboardingUrl}");
        } catch (\Throwable $e) {
            $this->warn("  Could not generate onboarding link: {$e->getMessage()}");
            $this->warn('  Run again with the existing account or complete via Stripe dashboard.');
        }

        // ─── 3. Products + Prices for each plan ─────────────────────────
        $plans = MembershipPlan::where('tenant_id', $practice->id)->get();
        $this->info("→ Creating Stripe Products + Prices for {$plans->count()} plans...");

        // Until the practice completes onboarding, charges_enabled is false
        // and we can't create Prices on the connected account. But the
        // platform-account approach works in test mode: create products + prices
        // on the platform, then reference them when subscribing. For Connect
        // destination charges this isn't quite right (you'd want them on the
        // connected account), but for test-mode demo it's enough to prove the
        // flow.
        //
        // Detection: try platform first; fall back to nothing with a warning
        // if the practice's account isn't ready.

        foreach ($plans as $plan) {
            $needsMonthly = empty($plan->stripe_monthly_price_id) || $force;
            $needsAnnual = empty($plan->stripe_annual_price_id) || $force;
            if (!$needsMonthly && !$needsAnnual) {
                $this->line("  ✓ {$plan->name} — already has price IDs");
                continue;
            }

            try {
                // Product is shared across monthly + annual
                $product = $stripe->products->create([
                    'name' => "{$practice->name} — {$plan->name}",
                    'metadata' => [
                        'membermd_plan_id' => $plan->id,
                        'membermd_tenant_id' => $practice->id,
                        'membermd_tenant_code' => $practice->tenant_code,
                    ],
                ]);

                $updates = [];
                if ($needsMonthly && (float) $plan->monthly_price > 0) {
                    $monthlyPrice = $stripe->prices->create([
                        'product' => $product->id,
                        'unit_amount' => (int) round((float) $plan->monthly_price * 100),
                        'currency' => 'usd',
                        'recurring' => ['interval' => 'month'],
                        'metadata' => ['membermd_plan_id' => $plan->id, 'frequency' => 'monthly'],
                    ]);
                    $updates['stripe_monthly_price_id'] = $monthlyPrice->id;
                }
                if ($needsAnnual && (float) $plan->annual_price > 0) {
                    $annualPrice = $stripe->prices->create([
                        'product' => $product->id,
                        'unit_amount' => (int) round((float) $plan->annual_price * 100),
                        'currency' => 'usd',
                        'recurring' => ['interval' => 'year'],
                        'metadata' => ['membermd_plan_id' => $plan->id, 'frequency' => 'annual'],
                    ]);
                    $updates['stripe_annual_price_id'] = $annualPrice->id;
                }

                if (!empty($updates)) {
                    $plan->update($updates);
                    $this->info("  ✓ {$plan->name}: monthly={$updates['stripe_monthly_price_id']}, annual={$updates['stripe_annual_price_id']}");
                }
            } catch (ApiErrorException $e) {
                $this->error("  ✗ {$plan->name}: {$e->getMessage()}");
                Log::error('Stripe Price creation failed', [
                    'plan_id' => $plan->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        // ─── 4. Summary ────────────────────────────────────────────────
        $this->newLine();
        $this->info('═══ Wire-up complete ═══');
        $this->info("Practice: {$practice->name}");
        $this->info("  stripe_account_id: " . ($practice->fresh()->stripe_account_id ?? '(none)'));
        $this->info("  Connect status: " . ($practice->fresh()->stripe_connect_status ?? '(none)'));
        $this->newLine();
        $this->info('Next steps:');
        $this->line('  1. Open the onboarding URL above and complete test-mode onboarding.');
        $this->line('     Stripe accepts test values: SSN 000-00-0000, EIN 00-0000000, routing 110000000, account 000123456789.');
        $this->line('  2. Configure webhook endpoints in Stripe Dashboard:');
        $this->line('     Platform:  POST <APP_URL>/api/webhooks/stripe');
        $this->line('     Connect:   POST <APP_URL>/api/webhooks/stripe/connect');
        $this->line('  3. Copy each webhook signing secret to Railway env vars:');
        $this->line('     STRIPE_WEBHOOK_SECRET=whsec_...');
        $this->line('     STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...');
        $this->line('  4. Trigger a test enrollment via the public widget to see the loop end-to-end.');

        return self::SUCCESS;
    }
}
