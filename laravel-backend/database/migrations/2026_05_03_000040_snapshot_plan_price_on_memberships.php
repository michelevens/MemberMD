<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Snapshot the plan's price + version onto PatientMembership at enrollment.
 *
 * Why: edits to a MembershipPlan today silently retroactively change every
 * existing membership's "what am I paying" because UI/analytics read live
 * plan.monthly_price. Stripe still bills the locked Price ID, so the
 * customer-facing price diverges from reality. This is dispute material.
 *
 * From here on, the membership row is the source of truth for what this
 * member pays. Plan edits create a new plan version; existing memberships
 * keep their snapshot until explicitly migrated.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->decimal('locked_monthly_price', 10, 2)->nullable()->after('plan_id');
            $table->decimal('locked_annual_price', 10, 2)->nullable()->after('locked_monthly_price');
            $table->integer('locked_plan_version')->nullable()->after('locked_annual_price');
        });

        Schema::table('membership_plans', function (Blueprint $table) {
            // Bump on any price-affecting edit. UI shows "v3" so practices
            // know they're editing a version, not retroactively rewriting
            // history.
            $table->integer('version')->default(1)->after('is_active');
        });

        // Backfill locked prices from current plan values for existing rows.
        // For going-forward correctness — old rows didn't have a snapshot,
        // so we assume current plan price reflected what they pay (best
        // guess). Practices should review and adjust where needed.
        \DB::statement(<<<SQL
            UPDATE patient_memberships pm
            SET locked_monthly_price = mp.monthly_price,
                locked_annual_price  = mp.annual_price,
                locked_plan_version  = COALESCE(mp.template_version_applied, 1)
            FROM membership_plans mp
            WHERE pm.plan_id = mp.id
              AND pm.locked_monthly_price IS NULL
        SQL);
    }

    public function down(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->dropColumn('version');
        });
        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->dropColumn(['locked_monthly_price', 'locked_annual_price', 'locked_plan_version']);
        });
    }
};
