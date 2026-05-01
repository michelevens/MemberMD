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
        //
        // Driver-portable: stream rows in batches and use individual UPDATEs.
        // Postgres' UPDATE…FROM syntax doesn't exist in SQLite; the loop is
        // fine here because (a) backfill runs once, (b) cardinality is the
        // existing membership count which is bounded.
        \DB::table('patient_memberships')
            ->select('patient_memberships.id as id', 'plan_id')
            ->whereNull('locked_monthly_price')
            ->orderBy('patient_memberships.id')
            ->chunkById(500, function ($rows) {
                $planIds = $rows->pluck('plan_id')->filter()->unique()->all();
                if (empty($planIds)) return;

                $plans = \DB::table('membership_plans')
                    ->whereIn('id', $planIds)
                    ->get(['id', 'monthly_price', 'annual_price', 'template_version_applied'])
                    ->keyBy('id');

                foreach ($rows as $row) {
                    $plan = $plans->get($row->plan_id);
                    if (!$plan) continue;
                    \DB::table('patient_memberships')->where('id', $row->id)->update([
                        'locked_monthly_price' => $plan->monthly_price,
                        'locked_annual_price' => $plan->annual_price,
                        'locked_plan_version' => $plan->template_version_applied ?? 1,
                    ]);
                }
            });
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
