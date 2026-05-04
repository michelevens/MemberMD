<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Convert entitlement_types from per-tenant only into a hybrid
 * platform-catalog + per-tenant fork model.
 *
 * Before: every row had tenant_id NOT NULL + UNIQUE(tenant_id, code).
 *         Practices invented their own list from scratch on enrollment.
 *
 * After:  tenant_id is NULLABLE — NULL = platform-provided default
 *         that every practice sees but can't edit. Practices fork a
 *         system row to customize (creates a tenant-scoped copy with
 *         parent_entitlement_type_id pointing at the original).
 *
 * Schema additions:
 *   tenant_id                       now nullable; NULL = system row
 *   is_system (bool)                true on platform-default rows;
 *                                   false on tenant-owned rows
 *                                   (forks or from-scratch). Drives
 *                                   "lock the edit form" UX.
 *   parent_entitlement_type_id      FK to entitlement_types.id; set
 *                                   when a tenant forked a system row
 *                                   so the UI can show "Based on
 *                                   Platform default: [name]"
 *   visibility                      'everyone' | 'admin_only' |
 *                                   'superadmin_only'. Patient
 *                                   endpoint filters out non-'everyone'.
 *   metadata (jsonb)                free-form for future fields
 *                                   without another migration.
 *
 * Constraints:
 *   - Old UNIQUE(tenant_id, code) dropped — Postgres treats two NULLs
 *     as distinct so platform rows are still unique-by-code among
 *     themselves. We add two partial uniques to enforce that.
 *
 * Idempotent: hasColumn / try-catch around index ops so re-running
 * is safe.
 */
return new class extends Migration {
    /**
     * Don't wrap the whole migration in one transaction. Postgres
     * marks the entire transaction as failed when ANY statement
     * throws, even when we catch the PHP exception — every
     * subsequent statement then errors with "current transaction is
     * aborted, commands ignored until end of transaction block."
     * Per-statement autocommit lets each guarded ALTER fail
     * independently and keep going.
     */
    public $withinTransaction = false;

    public function up(): void
    {
        $isPg = DB::getDriverName() === 'pgsql';

        // 1. Make tenant_id nullable — guarded; no-op if already so.
        $this->safeStatement('ALTER TABLE entitlement_types ALTER COLUMN tenant_id DROP NOT NULL');

        // 2. Drop the old (tenant_id, code) UNIQUE if it still exists.
        //    Postgres uses IF EXISTS for clean idempotency.
        if ($isPg) {
            $this->safeStatement('ALTER TABLE entitlement_types DROP CONSTRAINT IF EXISTS entitlement_types_tenant_id_code_unique');
        }

        // 3. Add new columns. Each is hasColumn-guarded so re-runs are
        //    no-ops. Wrapped per-column so one failure doesn't break
        //    the rest.
        $this->safeColumn('is_system', function (Blueprint $t) {
            $t->boolean('is_system')->default(false)->after('tenant_id');
        });
        $this->safeColumn('parent_entitlement_type_id', function (Blueprint $t) {
            $t->uuid('parent_entitlement_type_id')->nullable()->after('is_system');
        });
        $this->safeColumn('visibility', function (Blueprint $t) {
            $t->string('visibility', 20)->default('everyone')->after('parent_entitlement_type_id');
        });
        $this->safeColumn('metadata', function (Blueprint $t) {
            $t->jsonb('metadata')->nullable()->after('visibility');
        });

        // 4. FK on parent_entitlement_type_id — guarded.
        $this->safeStatement('ALTER TABLE entitlement_types
            ADD CONSTRAINT entitlement_types_parent_fk
            FOREIGN KEY (parent_entitlement_type_id)
            REFERENCES entitlement_types(id) ON DELETE SET NULL');

        // 5. Indexes — each idempotent via IF NOT EXISTS.
        if ($isPg) {
            $this->safeStatement('CREATE INDEX IF NOT EXISTS entitlement_types_parent_idx
                ON entitlement_types(parent_entitlement_type_id)');
            $this->safeStatement('CREATE INDEX IF NOT EXISTS entitlement_types_system_active_idx
                ON entitlement_types(is_system, is_active)');
            // Two partial uniques replacing the old combined one.
            $this->safeStatement('CREATE UNIQUE INDEX IF NOT EXISTS entitlement_types_system_code_unique
                ON entitlement_types(code) WHERE tenant_id IS NULL');
            $this->safeStatement('CREATE UNIQUE INDEX IF NOT EXISTS entitlement_types_tenant_code_unique
                ON entitlement_types(tenant_id, code) WHERE tenant_id IS NOT NULL');
        }
    }

    /**
     * Run a raw statement, swallow exceptions. With $withinTransaction
     * false at the migration level, each call gets its own autocommit
     * so a failure here doesn't poison subsequent statements.
     */
    private function safeStatement(string $sql): void
    {
        try {
            DB::statement($sql);
        } catch (\Throwable $e) {
            \Log::info('Migration safeStatement skipped', [
                'sql' => $sql,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Add a column via Schema::table — guarded by hasColumn so
     * re-runs are no-ops.
     */
    private function safeColumn(string $name, \Closure $cb): void
    {
        if (Schema::hasColumn('entitlement_types', $name)) return;
        try {
            Schema::table('entitlement_types', $cb);
        } catch (\Throwable $e) {
            \Log::info('Migration safeColumn skipped', [
                'column' => $name,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('entitlement_types', function (Blueprint $table) {
            try { $table->dropIndex('entitlement_types_system_active_idx'); } catch (\Throwable) {}
            try { $table->dropIndex('entitlement_types_parent_idx'); } catch (\Throwable) {}
            try { $table->dropForeign(['parent_entitlement_type_id']); } catch (\Throwable) {}
            $cols = ['metadata', 'visibility', 'parent_entitlement_type_id', 'is_system'];
            $present = array_filter($cols, fn ($c) => Schema::hasColumn('entitlement_types', $c));
            if ($present) $table->dropColumn($present);
        });

        if (DB::getDriverName() === 'pgsql') {
            try { DB::statement('DROP INDEX IF EXISTS entitlement_types_system_code_unique'); } catch (\Throwable) {}
            try { DB::statement('DROP INDEX IF EXISTS entitlement_types_tenant_code_unique'); } catch (\Throwable) {}
        }
        // Don't restore NOT NULL on tenant_id in down() — destructive on
        // any platform rows.
    }
};
