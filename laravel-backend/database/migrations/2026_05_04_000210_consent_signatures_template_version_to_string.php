<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * consent_signatures.template_version was created as INTEGER, but
 * consent_templates.version is a STRING with default '1.0'. Public
 * enrollment crashed with 22P02 ("invalid input syntax for type integer:
 * '1.0'") trying to copy the template's version onto the signature row.
 *
 * Aligning the type to TEXT preserves "1.0", "2.1", etc. without lossy
 * casts. Existing integer values cast cleanly to text. Postgres allows
 * integer→text without a USING clause, but we provide one to be explicit.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasColumn('consent_signatures', 'template_version')) {
            return;
        }

        // SQLite (test suite) has no ALTER COLUMN. The column already
        // accepts string values via Laravel's Eloquent layer, and the
        // base create migration could be patched to use string() if
        // needed for fresh test schemas. Skipping is safe.
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE consent_signatures ALTER COLUMN template_version TYPE TEXT USING template_version::text');
    }

    public function down(): void
    {
        if (!Schema::hasColumn('consent_signatures', 'template_version')) {
            return;
        }

        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        // Best-effort revert. Will fail if any non-numeric values exist;
        // that's acceptable since we only forward-migrate in practice.
        DB::statement("ALTER TABLE consent_signatures ALTER COLUMN template_version TYPE INTEGER USING NULLIF(template_version, '')::integer");
    }
};
