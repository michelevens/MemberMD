<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Platform-level coupons (Practice → MemberMD billing). Distinct from
 * `coupons` (which is patient → practice). SuperAdmin-curated.
 *
 * Schema mirrors Stripe Coupon: percent_off OR amount_off (mutually exclusive),
 * duration is 'once' | 'repeating' (months) | 'forever'.
 *
 * Code is the practice-facing redemption string (e.g. EARLYBIRD).
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = 'platform_coupons';
        if (Schema::hasTable($table)) return;

        Schema::create($table, function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->string('code', 50)->unique();
            $t->string('name', 100);
            $t->text('description')->nullable();
            // Discount: exactly one of these populated
            $t->integer('percent_off')->nullable(); // 1..100
            $t->integer('amount_off_cents')->nullable(); // dollars * 100
            // Duration
            $t->string('duration', 20)->default('once'); // once | repeating | forever
            $t->integer('duration_in_months')->nullable(); // when duration=repeating
            // Limits
            $t->integer('max_redemptions')->nullable();
            $t->integer('redemptions_count')->default(0);
            $t->timestamp('expires_at')->nullable();
            // Restrictions: optional list of platform_plan_keys this coupon applies to
            // (null = all plans)
            $t->jsonb('applies_to_plan_keys')->nullable();
            // Stripe sync
            $t->string('stripe_coupon_id')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->softDeletes();

            $t->index('is_active');
        });

        // Track redemptions per practice — prevents reuse on the same sub
        // when the coupon is single-use, and powers the "who used what" report.
        if (!Schema::hasTable('platform_coupon_redemptions')) {
            Schema::create('platform_coupon_redemptions', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('platform_coupon_id');
                $t->uuid('practice_subscription_id');
                $t->uuid('practice_id');
                $t->timestamp('redeemed_at')->useCurrent();
                $t->foreign('platform_coupon_id')->references('id')->on('platform_coupons')->cascadeOnDelete();
                $t->foreign('practice_subscription_id')->references('id')->on('practice_subscriptions')->cascadeOnDelete();
                $t->foreign('practice_id')->references('id')->on('practices')->cascadeOnDelete();
                $t->index(['platform_coupon_id', 'practice_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_coupon_redemptions');
        Schema::dropIfExists('platform_coupons');
    }
};
