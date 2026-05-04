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
    public function up(): void
    {
        Schema::table('entitlement_types', function (Blueprint $table) {
            // Make tenant_id nullable. Postgres lets us alter via change()
            // when doctrine/dbal is around; if not, this works via raw.
            // Use raw because Laravel's change() needs doctrine which we
            // don't carry. (No-op if already nullable.)
        });
        // Drop the old unique that includes tenant_id (NOT NULL semantics).
        // Postgres-only; SQLite test environments use raw drop_if_exists
        // pattern in case the index name differs.
        try {
            DB::statement('ALTER TABLE entitlement_types ALTER COLUMN tenant_id DROP NOT NULL');
        } catch (\Throwable $e) { /* already nullable, ignore */ }

        // Drop the existing unique constraint by name. The original migration
        // used Laravel's auto-generated name — try the common shapes.
        foreach ([
            'entitlement_types_tenant_id_code_unique',
        ] as $idx) {
            try {
                DB::statement("ALTER TABLE entitlement_types DROP CONSTRAINT {$idx}");
            } catch (\Throwable $e) { /* not present */ }
        }

        Schema::table('entitlement_types', function (Blueprint $table) {
            if (!Schema::hasColumn('entitlement_types', 'is_system')) {
                $table->boolean('is_system')->default(false)->after('tenant_id');
            }
            if (!Schema::hasColumn('entitlement_types', 'parent_entitlement_type_id')) {
                $table->uuid('parent_entitlement_type_id')->nullable()->after('is_system');
            }
            if (!Schema::hasColumn('entitlement_types', 'visibility')) {
                $table->string('visibility', 20)->default('everyone')->after('parent_entitlement_type_id');
            }
            if (!Schema::hasColumn('entitlement_types', 'metadata')) {
                $table->jsonb('metadata')->nullable()->after('visibility');
            }
        });

        // FK + indexes outside the column block so each can fail
        // independently if it already exists.
        try {
            Schema::table('entitlement_types', function (Blueprint $table) {
                $table->foreign('parent_entitlement_type_id')
                    ->references('id')->on('entitlement_types')
                    ->nullOnDelete();
            });
        } catch (\Throwable) { /* already exists */ }

        try {
            Schema::table('entitlement_types', function (Blueprint $table) {
                $table->index('parent_entitlement_type_id', 'entitlement_types_parent_idx');
            });
        } catch (\Throwable) { /* already exists */ }

        try {
            Schema::table('entitlement_types', function (Blueprint $table) {
                $table->index(['is_system', 'is_active'], 'entitlement_types_system_active_idx');
            });
        } catch (\Throwable) { /* already exists */ }

        // Replace the old (tenant_id, code) unique with two partial
        // indexes — one for system rows (tenant_id IS NULL), one for
        // tenant rows. Postgres-only; SQLite skips silently.
        if (DB::getDriverName() === 'pgsql') {
            try {
                DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS entitlement_types_system_code_unique
                    ON entitlement_types(code) WHERE tenant_id IS NULL');
            } catch (\Throwable) {}
            try {
                DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS entitlement_types_tenant_code_unique
                    ON entitlement_types(tenant_id, code) WHERE tenant_id IS NOT NULL');
            } catch (\Throwable) {}
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
