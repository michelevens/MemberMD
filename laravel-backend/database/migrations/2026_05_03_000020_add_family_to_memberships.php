<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Family memberships.
 *
 * Adds parent_membership_id to patient_memberships so a dependent's
 * membership knows it belongs to a primary's family group. The primary
 * keeps a normal membership row (parent_membership_id null) — only the
 * dependents reference it. Stripe-side, all charges land on the primary's
 * subscription; dependent rows have stripe_subscription_id null because
 * they aren't independently billed.
 *
 * Whether a family entitlement is shared (single visit pool) or
 * individual (each dependent has their own allotment) is controlled
 * per-PlanEntitlement via the existing family_shared flag.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->uuid('parent_membership_id')->nullable()->after('plan_id');
            $table->foreign('parent_membership_id')
                ->references('id')->on('patient_memberships')
                ->nullOnDelete();
            $table->index('parent_membership_id');
        });
    }

    public function down(): void
    {
        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->dropForeign(['parent_membership_id']);
            $table->dropIndex(['parent_membership_id']);
            $table->dropColumn('parent_membership_id');
        });
    }
};
