<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Make patients.preferred_language nullable.
 *
 * The original schema had this column NOT NULL with a DEFAULT 'English'.
 * The encryption rollout dropped the default (it would have collided with
 * the encrypted cast), but the NOT NULL stayed — meaning every Patient
 * INSERT had to remember to supply a value. The Add Patient form doesn't
 * collect this, so it became a footgun.
 *
 * Decision: preferred_language is optional metadata. Make it nullable.
 * App-level code can still default to 'English' where it matters.
 */
return new class extends Migration {
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }
        if (Schema::hasColumn('patients', 'preferred_language')) {
            DB::statement('ALTER TABLE patients ALTER COLUMN preferred_language DROP NOT NULL');
        }
    }

    public function down(): void
    {
        // No-op. We don't want to re-introduce the NOT NULL constraint
        // since rows created after this migration may legitimately have
        // a NULL preferred_language.
    }
};
