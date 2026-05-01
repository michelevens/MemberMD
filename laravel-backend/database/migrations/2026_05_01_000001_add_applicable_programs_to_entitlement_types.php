<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Schema drift fix: the original 2026_03_21 entitlement_types migration
 * defined applicable_programs but production was migrated against an
 * earlier version of that file that omitted it. EntitlementTypeSeeder
 * has been failing silently on every run because the INSERT references
 * a column that doesn't exist. Add it idempotently here so production
 * matches the model + seeder shape.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasColumn('entitlement_types', 'applicable_programs')) {
            Schema::table('entitlement_types', function (Blueprint $table) {
                $table->jsonb('applicable_programs')->nullable()->after('sort_order');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('entitlement_types', 'applicable_programs')) {
            Schema::table('entitlement_types', function (Blueprint $table) {
                $table->dropColumn('applicable_programs');
            });
        }
    }
};
