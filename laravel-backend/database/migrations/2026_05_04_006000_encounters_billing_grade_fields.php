<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Billing-grade fields on encounters.
 *
 * MemberMD doesn't bill insurance today (pure-DPC subscription
 * model), but adding the columns now means the future flip is a
 * deploy, not a rebuild. All columns are nullable so existing rows
 * keep working unchanged.
 *
 * What each one earns its keep doing:
 *
 *   duration_minutes_actual   Time the provider actually spent in
 *                             the visit. Distinct from
 *                             appointment.duration_minutes (which is
 *                             SCHEDULED time). Insurance reads this.
 *
 *   time_spent_documenting    Minutes the provider spent on the chart
 *                             AFTER the visit. Counts toward CPT E/M
 *                             total-time billing (99213-99215).
 *
 *   total_time_minutes        Auto-computed convenience —
 *                             duration_minutes_actual + time_spent_
 *                             documenting. Stored, not derived, so
 *                             reports can sort/filter on it.
 *
 *   cpt_codes (jsonb array)   Codes this encounter generates. Prefilled
 *                             by encounter_type defaults; provider can
 *                             override.
 *
 *   units_billed              For time-based codes (CCM 99490, RPM,
 *                             prolonged service): how many billable
 *                             units were captured.
 *
 *   bill_status (string enum) not_billed | queued | submitted | paid |
 *                             denied. Hooks the future clearinghouse
 *                             integration. Defaults not_billed.
 *
 *   cosigner_user_id          PMHNP supervised-by-MD scope rules.
 *                             Reserved column; NULL today.
 *
 *   cosigned_at               When the supervisor signed off.
 *
 * Idempotent — every column wrapped in hasColumn so re-running this
 * migration on an environment where it partially applied is safe.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('encounters', function (Blueprint $table) {
            if (!Schema::hasColumn('encounters', 'duration_minutes_actual')) {
                $table->integer('duration_minutes_actual')->nullable()->after('encounter_type');
            }
            if (!Schema::hasColumn('encounters', 'time_spent_documenting')) {
                $table->integer('time_spent_documenting')->nullable()->after('duration_minutes_actual');
            }
            if (!Schema::hasColumn('encounters', 'total_time_minutes')) {
                $table->integer('total_time_minutes')->nullable()->after('time_spent_documenting');
            }
            if (!Schema::hasColumn('encounters', 'cpt_codes')) {
                $table->jsonb('cpt_codes')->nullable()->after('diagnoses');
            }
            if (!Schema::hasColumn('encounters', 'units_billed')) {
                $table->integer('units_billed')->nullable()->after('cpt_codes');
            }
            if (!Schema::hasColumn('encounters', 'bill_status')) {
                $table->string('bill_status', 20)->default('not_billed')->after('units_billed');
            }
            if (!Schema::hasColumn('encounters', 'cosigner_user_id')) {
                $table->foreignUuid('cosigner_user_id')->nullable()
                    ->after('signed_by')
                    ->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('encounters', 'cosigned_at')) {
                $table->timestamp('cosigned_at')->nullable()->after('cosigner_user_id');
            }
        });

        // Indexes for the most common queries:
        //   "show me unsigned charts older than X days"
        //   "show me encounters not yet billed"
        try {
            Schema::table('encounters', function (Blueprint $table) {
                $table->index(['tenant_id', 'status', 'signed_at'], 'encounters_tenant_status_signed_idx');
            });
        } catch (\Throwable) { /* already exists */ }

        try {
            Schema::table('encounters', function (Blueprint $table) {
                $table->index(['tenant_id', 'bill_status'], 'encounters_tenant_bill_status_idx');
            });
        } catch (\Throwable) { /* already exists */ }
    }

    public function down(): void
    {
        Schema::table('encounters', function (Blueprint $table) {
            try { $table->dropIndex('encounters_tenant_bill_status_idx'); } catch (\Throwable) {}
            try { $table->dropIndex('encounters_tenant_status_signed_idx'); } catch (\Throwable) {}
            try { $table->dropForeign(['cosigner_user_id']); } catch (\Throwable) {}
            $cols = [
                'cosigned_at', 'cosigner_user_id', 'bill_status', 'units_billed',
                'cpt_codes', 'total_time_minutes', 'time_spent_documenting',
                'duration_minutes_actual',
            ];
            $present = array_filter($cols, fn ($c) => Schema::hasColumn('encounters', $c));
            if ($present) $table->dropColumn($present);
        });
    }
};
