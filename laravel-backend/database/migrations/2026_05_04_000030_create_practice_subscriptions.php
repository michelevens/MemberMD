<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Practice Subscriptions — links a Practice to a PlatformPlan.
 *
 * One row per practice (the active subscription). On plan change, status flips
 * but we may keep history via state-transitions if needed; for now a single row.
 *
 * Status: trial | active | past_due | cancelled | paused
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = 'practice_subscriptions';
        if (Schema::hasTable($table)) {
            return;
        }

        Schema::create($table, function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('practice_id');
            $t->uuid('platform_plan_id');

            $t->string('status', 20)->default('trial');
            $t->string('billing_cycle', 10)->default('monthly');

            // Slot tracking
            $t->integer('purchased_seat_blocks')->default(0);
            $t->integer('current_member_count')->default(0);
            $t->timestamp('seats_eligible_for_downgrade_since')->nullable();

            // Trial
            $t->timestamp('trial_ends_at')->nullable();

            // Billing cycle
            $t->timestamp('current_period_start')->nullable();
            $t->timestamp('current_period_end')->nullable();

            // Stripe (platform account)
            $t->string('stripe_customer_id')->nullable();
            $t->string('stripe_subscription_id')->nullable();
            $t->string('stripe_payment_method_id')->nullable();

            // Cancellation
            $t->timestamp('cancelled_at')->nullable();
            $t->timestamp('cancels_at')->nullable();
            $t->boolean('cancel_immediately')->default(false);
            $t->uuid('cancellation_reason_id')->nullable();
            $t->string('cancellation_reason_other', 200)->nullable();
            $t->text('cancellation_notes')->nullable();

            // Founder override — true means subscription exists but never bills
            $t->boolean('is_founder_override')->default(false);

            $t->timestamps();
            $t->softDeletes();

            $t->foreign('practice_id')->references('id')->on('practices')->onDelete('cascade');
            $t->foreign('platform_plan_id')->references('id')->on('platform_plans');
            $t->foreign('cancellation_reason_id')->references('id')->on('superadmin_cancellation_reasons')->nullOnDelete();

            $t->index(['practice_id', 'status']);
            $t->index('trial_ends_at');
            $t->index('current_period_end');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_subscriptions');
    }
};
