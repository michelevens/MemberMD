<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Add CMS Place of Service code to encounters.
 *
 * POS is required on every CMS-1500 / 837P claim. Two-character
 * code from the CMS code list. We default-fill it from the
 * encounter type at claim time, but the column lives on the
 * encounter so a provider can override (a "telehealth" encounter
 * conducted from a hospital would be 22, not 02).
 *
 * Common values:
 *   02  Telehealth (provider's location)
 *   10  Telehealth (patient's home) — newer CMS distinction
 *   11  Office
 *   12  Home
 *   21  Inpatient hospital
 *   22  On-campus outpatient hospital
 *   23  Emergency room
 *
 * Driver shape: Postgres uses raw SQL with IF NOT EXISTS for
 * partial-re-run resilience; SQLite (test suite) uses the portable
 * Schema builder with hasColumn() guards.
 */
return new class extends Migration {
    public $withinTransaction = false;

    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            try {
                DB::statement('ALTER TABLE encounters ADD COLUMN IF NOT EXISTS place_of_service varchar(4)');
            } catch (\Throwable $e) {
                $msg = $e->getMessage();
                if (!str_contains($msg, 'already exists') && !str_contains($msg, 'duplicate')) {
                    throw $e;
                }
            }
            return;
        }

        Schema::table('encounters', function (Blueprint $table) {
            if (!Schema::hasColumn('encounters', 'place_of_service')) {
                $table->string('place_of_service', 4)->nullable();
            }
        });
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            try {
                DB::statement('ALTER TABLE encounters DROP COLUMN IF EXISTS place_of_service');
            } catch (\Throwable) { /* fine */ }
            return;
        }

        Schema::table('encounters', function (Blueprint $table) {
            if (Schema::hasColumn('encounters', 'place_of_service')) {
                $table->dropColumn('place_of_service');
            }
        });
    }
};
