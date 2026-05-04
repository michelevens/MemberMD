<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
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
 * Postgres transactional-DDL note: $withinTransaction = false is set
 * because we want each ALTER TABLE to commit independently. Without
 * it, ANY caught throwable (e.g. FK already-exists) poisons the
 * surrounding transaction and every subsequent statement fails with
 * "current transaction is aborted". Same fix as the entitlement_types
 * catalog migration (commit 4a42428).
 */
return new class extends Migration {
    public $withinTransaction = false;

    /** Run a DDL statement; swallow only "already exists" / duplicate
     * errors. Each call uses its own autocommit so prior failures
     * don't poison subsequent statements. */
    private function safeStatement(string $sql, string $label): void
    {
        try {
            DB::statement($sql);
        } catch (\Throwable $e) {
            $msg = $e->getMessage();
            $benign = str_contains($msg, 'already exists')
                || str_contains($msg, 'duplicate')
                || str_contains($msg, 'does not exist'); // for IF EXISTS guards
            if (!$benign) {
                throw $e;
            }
            // Otherwise treat as a no-op — already in the desired state.
            \Log::info("encounters billing migration: {$label} skipped — {$msg}");
        }
    }

    public function up(): void
    {
        // Add columns one statement at a time so a benign collision
        // on one column doesn't abort the rest. IF NOT EXISTS is
        // Postgres-native and idempotent.
        $this->safeStatement(
            'ALTER TABLE encounters ADD COLUMN IF NOT EXISTS duration_minutes_actual integer',
            'col duration_minutes_actual'
        );
        $this->safeStatement(
            'ALTER TABLE encounters ADD COLUMN IF NOT EXISTS time_spent_documenting integer',
            'col time_spent_documenting'
        );
        $this->safeStatement(
            'ALTER TABLE encounters ADD COLUMN IF NOT EXISTS total_time_minutes integer',
            'col total_time_minutes'
        );
        $this->safeStatement(
            'ALTER TABLE encounters ADD COLUMN IF NOT EXISTS cpt_codes jsonb',
            'col cpt_codes'
        );
        $this->safeStatement(
            'ALTER TABLE encounters ADD COLUMN IF NOT EXISTS units_billed integer',
            'col units_billed'
        );
        $this->safeStatement(
            "ALTER TABLE encounters ADD COLUMN IF NOT EXISTS bill_status varchar(20) DEFAULT 'not_billed'",
            'col bill_status'
        );
        $this->safeStatement(
            'ALTER TABLE encounters ADD COLUMN IF NOT EXISTS cosigner_user_id uuid',
            'col cosigner_user_id'
        );
        $this->safeStatement(
            'ALTER TABLE encounters ADD COLUMN IF NOT EXISTS cosigned_at timestamp',
            'col cosigned_at'
        );

        // FK constraint as its own statement. Postgres has no native
        // ADD CONSTRAINT IF NOT EXISTS, so we check the catalog first.
        if (!Schema::hasColumn('encounters', 'cosigner_user_id')) {
            return; // column add must've truly failed — bail without FK.
        }
        $fkExists = DB::selectOne(
            "SELECT 1 AS ok FROM pg_constraint WHERE conname = 'encounters_cosigner_user_id_foreign'"
        );
        if (!$fkExists) {
            $this->safeStatement(
                'ALTER TABLE encounters ADD CONSTRAINT encounters_cosigner_user_id_foreign '
                . 'FOREIGN KEY (cosigner_user_id) REFERENCES users(id) ON DELETE SET NULL',
                'fk cosigner_user_id'
            );
        }

        // Indexes for the most common queries:
        //   "show me unsigned charts older than X days"
        //   "show me encounters not yet billed"
        $this->safeStatement(
            'CREATE INDEX IF NOT EXISTS encounters_tenant_status_signed_idx '
            . 'ON encounters (tenant_id, status, signed_at)',
            'idx tenant_status_signed'
        );
        $this->safeStatement(
            'CREATE INDEX IF NOT EXISTS encounters_tenant_bill_status_idx '
            . 'ON encounters (tenant_id, bill_status)',
            'idx tenant_bill_status'
        );
    }

    public function down(): void
    {
        $this->safeStatement('DROP INDEX IF EXISTS encounters_tenant_bill_status_idx', 'drop idx bill_status');
        $this->safeStatement('DROP INDEX IF EXISTS encounters_tenant_status_signed_idx', 'drop idx status_signed');
        $this->safeStatement(
            'ALTER TABLE encounters DROP CONSTRAINT IF EXISTS encounters_cosigner_user_id_foreign',
            'drop fk cosigner_user_id'
        );
        foreach ([
            'cosigned_at', 'cosigner_user_id', 'bill_status', 'units_billed',
            'cpt_codes', 'total_time_minutes', 'time_spent_documenting',
            'duration_minutes_actual',
        ] as $col) {
            $this->safeStatement("ALTER TABLE encounters DROP COLUMN IF EXISTS {$col}", "drop col {$col}");
        }
    }
};
