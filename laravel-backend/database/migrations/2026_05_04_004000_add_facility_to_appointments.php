<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Multi-location appointments — pin each in-person visit to a
 * specific practice_facility.
 *
 *   facility_id  nullable FK to practice_facilities. NULL means
 *                "default location" or telehealth (which doesn't
 *                need a facility). The booking widget will show a
 *                facility picker when a practice has 2+ active
 *                facilities; single-facility practices are
 *                unaffected — the column just stays null.
 *
 * Why nullable + non-required: most practices today are single-
 * facility and we don't want to backfill or force-pick on
 * existing rows. Multi-location practices opt in by selecting at
 * booking time.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            if (!Schema::hasColumn('appointments', 'facility_id')) {
                $table->foreignUuid('facility_id')->nullable()
                    ->after('provider_id')
                    ->constrained('practice_facilities')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            if (Schema::hasColumn('appointments', 'facility_id')) {
                try { $table->dropForeign(['facility_id']); } catch (\Throwable) {}
                $table->dropColumn('facility_id');
            }
        });
    }
};
