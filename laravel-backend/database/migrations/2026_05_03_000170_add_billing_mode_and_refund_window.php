<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Switch enrollment from free-membership to immediate-charge billing.
 *
 *  - patient_memberships gets billing_mode (stripe | comped | manual) so the
 *    enrollment path knows whether to call Stripe, skip billing entirely, or
 *    fall back to manual practice-side invoicing.
 *  - practices gets billing_enforced — when true, MembershipController::store
 *    rejects enrollments that can't bill (no Connect, no Stripe price). When
 *    false, falls back to billing_mode='manual'. Default false so existing
 *    practices keep working until they finish Connect onboarding.
 *  - membership_plans gets refund_window_days (default 14) for the patient
 *    portal cancel-and-refund flow.
 *  - All existing memberships are backfilled to billing_mode='comped' with
 *    reason='pre-billing-launch' so the switchover doesn't retroactively
 *    bill anyone.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('patient_memberships', function (Blueprint $table) {
            if (!Schema::hasColumn('patient_memberships', 'billing_mode')) {
                $table->string('billing_mode', 16)->default('stripe')->after('status');
            }
            if (!Schema::hasColumn('patient_memberships', 'comp_reason')) {
                $table->string('comp_reason', 500)->nullable()->after('billing_mode');
            }
            if (!Schema::hasColumn('patient_memberships', 'comped_by_user_id')) {
                $table->foreignUuid('comped_by_user_id')->nullable()->after('comp_reason')
                    ->constrained('users')->nullOnDelete();
            }
        });

        Schema::table('practices', function (Blueprint $table) {
            if (!Schema::hasColumn('practices', 'billing_enforced')) {
                // Default false: existing tenants keep the current
                // free-membership behavior (now labeled billing_mode='manual')
                // until an operator flips them on. New tenants set this to
                // true at signup.
                $table->boolean('billing_enforced')->default(false)->after('subscription_status');
            }
        });

        Schema::table('membership_plans', function (Blueprint $table) {
            if (!Schema::hasColumn('membership_plans', 'refund_window_days')) {
                // 14 days is the industry standard for DPC satisfaction
                // guarantees. Plans can override per-product.
                $table->unsignedSmallInteger('refund_window_days')->default(14)
                    ->after('trial_days');
            }
        });

        // Backfill existing memberships as comped so the switchover is
        // non-retroactive. Anyone enrolled before this migration was running
        // pre-billing — they don't suddenly get charged.
        DB::table('patient_memberships')
            ->whereNull('comp_reason')
            ->where(function ($q) {
                $q->whereNull('stripe_subscription_id')
                  ->orWhere('stripe_subscription_id', '');
            })
            ->update([
                'billing_mode' => 'comped',
                'comp_reason' => 'pre-billing-launch',
            ]);

        // Memberships that DO have a Stripe subscription stay on billing_mode='stripe'
        // (the default). Nothing to do for them.
    }

    public function down(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            if (Schema::hasColumn('membership_plans', 'refund_window_days')) {
                $table->dropColumn('refund_window_days');
            }
        });

        Schema::table('practices', function (Blueprint $table) {
            if (Schema::hasColumn('practices', 'billing_enforced')) {
                $table->dropColumn('billing_enforced');
            }
        });

        Schema::table('patient_memberships', function (Blueprint $table) {
            if (Schema::hasColumn('patient_memberships', 'comped_by_user_id')) {
                $table->dropForeign(['comped_by_user_id']);
                $table->dropColumn('comped_by_user_id');
            }
            if (Schema::hasColumn('patient_memberships', 'comp_reason')) {
                $table->dropColumn('comp_reason');
            }
            if (Schema::hasColumn('patient_memberships', 'billing_mode')) {
                $table->dropColumn('billing_mode');
            }
        });
    }
};
