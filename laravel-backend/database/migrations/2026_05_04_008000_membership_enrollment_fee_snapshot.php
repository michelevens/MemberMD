<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Snapshot enrollment-fee state on each PatientMembership.
 *
 * The plan-level enrollment_fee can change over time (a practice raises
 * its intake fee from $349 to $499). Patients who already paid should
 * never be re-billed at the new amount, and the audit packet they
 * signed must remain truthful. Three columns capture this:
 *
 *   locked_enrollment_fee
 *     The dollar amount the patient was actually charged at sign-up.
 *     null = no enrollment fee at the time. Distinct from the plan's
 *     current enrollment_fee.
 *
 *   enrollment_fee_waived_at
 *     Set when an admin waives the fee at enrollment time (Founding
 *     Member, comp, retroactive correction). When set,
 *     locked_enrollment_fee is the *would-have-been* amount so the
 *     audit log can reconstruct the waiver.
 *
 *   enrollment_fee_waived_reason
 *     Free-text reason captured from the admin UI. Surfaces in the
 *     patient agreement PDF + the audit log.
 *
 *   enrollment_fee_waived_by_user_id
 *     Who clicked the waive button. FK to users.
 *
 * Same Postgres-friendly shape as the other 2026_05_04 migrations:
 * autocommit per statement, IF NOT EXISTS, no transaction cascade.
 */
return new class extends Migration {
    public $withinTransaction = false;

    private function safeStatement(string $sql, string $label): void
    {
        try {
            DB::statement($sql);
        } catch (\Throwable $e) {
            $msg = $e->getMessage();
            $benign = str_contains($msg, 'already exists')
                || str_contains($msg, 'duplicate');
            if (!$benign) {
                throw $e;
            }
            \Log::info("membership_enrollment_fee_snapshot: {$label} skipped — {$msg}");
        }
    }

    public function up(): void
    {
        $this->safeStatement(
            'ALTER TABLE patient_memberships ADD COLUMN IF NOT EXISTS locked_enrollment_fee numeric(8,2)',
            'col locked_enrollment_fee'
        );
        $this->safeStatement(
            'ALTER TABLE patient_memberships ADD COLUMN IF NOT EXISTS enrollment_fee_waived_at timestamp',
            'col enrollment_fee_waived_at'
        );
        $this->safeStatement(
            'ALTER TABLE patient_memberships ADD COLUMN IF NOT EXISTS enrollment_fee_waived_reason text',
            'col enrollment_fee_waived_reason'
        );
        $this->safeStatement(
            'ALTER TABLE patient_memberships ADD COLUMN IF NOT EXISTS enrollment_fee_waived_by_user_id uuid',
            'col enrollment_fee_waived_by_user_id'
        );

        // FK as a separate statement. Postgres has no native ADD CONSTRAINT
        // IF NOT EXISTS, so we check the catalog first.
        $fk = DB::selectOne(
            "SELECT 1 AS ok FROM pg_constraint WHERE conname = 'patient_memberships_enrollment_fee_waived_by_user_id_foreign'"
        );
        if (!$fk) {
            $this->safeStatement(
                'ALTER TABLE patient_memberships ADD CONSTRAINT patient_memberships_enrollment_fee_waived_by_user_id_foreign '
                . 'FOREIGN KEY (enrollment_fee_waived_by_user_id) REFERENCES users(id) ON DELETE SET NULL',
                'fk enrollment_fee_waived_by_user_id'
            );
        }
    }

    public function down(): void
    {
        $this->safeStatement(
            'ALTER TABLE patient_memberships DROP CONSTRAINT IF EXISTS patient_memberships_enrollment_fee_waived_by_user_id_foreign',
            'drop fk waiver_by_user'
        );
        foreach ([
            'enrollment_fee_waived_by_user_id',
            'enrollment_fee_waived_reason',
            'enrollment_fee_waived_at',
            'locked_enrollment_fee',
        ] as $col) {
            $this->safeStatement("ALTER TABLE patient_memberships DROP COLUMN IF EXISTS {$col}", "drop col {$col}");
        }
    }
};
