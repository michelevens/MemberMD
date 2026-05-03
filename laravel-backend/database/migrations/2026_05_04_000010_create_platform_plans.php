<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Platform Plans — the SaaS tiers practices subscribe to (SuperAdmin → Practice billing layer).
 *
 * This is the OTHER side of the billing graph. We already had `membership_plans`
 * for Patient → Practice (DPC memberships). This adds `platform_plans` for
 * Practice → SuperAdmin (the practice's MemberMD bill).
 *
 * Tier model is resource-cap based, not feature-gated:
 *   Solo / Group / Multi-Site / Enterprise + internal Founder
 *   Every clinical/operational feature is available on every tier;
 *   tiers gate counts (members, providers, staff, programs, locations, employers)
 *   and a small set of integration features (SSO, EMR, white-label, custom BAA).
 *
 * Pricing layers:
 *   1. Subscription: monthly_price + annual_price
 *   2. Member-slot overage: extra_seat_block_size + extra_seat_block_price
 *   3. Transaction fees: card/ACH bps + flat cents (passed through Stripe with tiny margin)
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = 'platform_plans';
        if (Schema::hasTable($table)) {
            return;
        }

        Schema::create($table, function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->string('key', 50)->unique();
            $t->string('name', 100);
            $t->string('badge_text', 30)->nullable();
            $t->text('description')->nullable();
            $t->boolean('is_quote_only')->default(false);
            $t->boolean('is_publicly_listed')->default(true);

            $t->decimal('monthly_price', 10, 2)->default(0);
            $t->decimal('annual_price', 10, 2)->nullable();

            // Resource caps. null = unlimited.
            $t->integer('max_members')->nullable();
            $t->integer('max_providers')->nullable();
            $t->integer('max_staff')->nullable();
            $t->integer('max_active_programs')->nullable();
            $t->integer('max_locations')->nullable();
            $t->integer('max_employers')->nullable();
            $t->string('api_access_level', 20)->default('none'); // none | read | full

            // Member-slot overage
            $t->integer('extra_seat_block_size')->nullable();
            $t->decimal('extra_seat_block_price', 10, 2)->nullable();

            // Transaction fees (basis points + flat cents)
            $t->integer('card_fee_bps')->default(290);
            $t->integer('card_fee_flat_cents')->default(30);
            $t->integer('ach_fee_bps')->default(80);
            $t->integer('ach_fee_flat_cents')->default(25);
            $t->integer('ach_fee_cap_cents')->default(500);

            $t->integer('trial_days')->default(14);

            // Enterprise-only feature flags
            $t->jsonb('features')->nullable();

            // Stripe (platform account, NOT Connect)
            $t->string('stripe_monthly_price_id')->nullable();
            $t->string('stripe_annual_price_id')->nullable();
            $t->string('stripe_seat_price_id')->nullable();

            $t->boolean('is_active')->default(true);
            $t->integer('sort_order')->default(0);
            $t->timestamps();
            $t->softDeletes();

            $t->index(['is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_plans');
    }
};
