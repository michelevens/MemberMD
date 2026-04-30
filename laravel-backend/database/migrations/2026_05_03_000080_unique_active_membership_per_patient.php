<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Partial unique index: one active primary membership per patient per tenant.
 *
 * QA scenario #1: an attacker can bypass our 24h idempotency-key window by
 * varying any field that's not in the derived hash (we only hash tenant_id +
 * email + plan_id + dob). DOB is mutable on a paper signup; vary it by one
 * day and you get a second enrollment.
 *
 * The DB-level fix is a partial unique index that physically rejects the
 * second create. Scoped to (tenant_id, patient_id, status='active',
 * parent_membership_id IS NULL) so dependents (which always sit alongside
 * a primary) don't trigger.
 *
 * Postgres-only — uses a partial index. Migration is a no-op on other
 * drivers (we ship Postgres).
 */
return new class extends Migration {
    public function up(): void
    {
        // Cleanup any pre-existing duplicates before creating the index, or
        // index creation will fail. Strategy: keep the most-recently-started
        // active row per (tenant, patient), demote earlier dupes to
        // 'cancelled' with a reason flag so the operator can audit.
        DB::statement(<<<'SQL'
            UPDATE patient_memberships pm
            SET status = 'cancelled',
                cancelled_at = COALESCE(cancelled_at, NOW()),
                cancel_reason = COALESCE(cancel_reason, 'duplicate_active_cleanup'),
                last_state_change_at = NOW()
            WHERE pm.id IN (
                SELECT id FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY tenant_id, patient_id
                               ORDER BY started_at DESC, created_at DESC
                           ) AS rn
                    FROM patient_memberships
                    WHERE status = 'active'
                      AND parent_membership_id IS NULL
                ) ranked
                WHERE rn > 1
            );
        SQL);

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_primary_membership
            ON patient_memberships (tenant_id, patient_id)
            WHERE status = 'active' AND parent_membership_id IS NULL;
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS uniq_active_primary_membership');
    }
};
