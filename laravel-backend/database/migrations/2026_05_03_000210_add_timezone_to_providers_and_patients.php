<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Add a timezone column to providers and patients.
 *
 * MemberMD is telehealth-first. A Florida-licensed provider sees clients
 * across all five US zones. Provider working hours ("9–5") are
 * authoritative in the provider's local clock — not the practice's, not
 * the patient's. Without a per-provider tz, ProviderAvailability windows
 * either misinterpret afternoon bookings (the bug we just fixed by
 * pinning to practice tz) or break entirely when a provider works from a
 * state different than the practice HQ.
 *
 * Patient tz drives the labels they see in the booking widget and in
 * confirmation emails. Browser inference is correct most of the time
 * but storing the value lets emails sent days later still render in the
 * right zone, even if the patient travels.
 *
 * Both columns are nullable on purpose so existing rows survive. Read
 * sites should fall back: provider.timezone ?? practice.timezone, and
 * patient.timezone ?? practice.timezone (for emails) or browser tz (for
 * the live picker).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('providers', function (Blueprint $table) {
            if (!Schema::hasColumn('providers', 'timezone')) {
                $table->string('timezone', 50)->nullable()->after('telehealth_enabled');
            }
        });

        Schema::table('patients', function (Blueprint $table) {
            if (!Schema::hasColumn('patients', 'timezone')) {
                $table->string('timezone', 50)->nullable()->after('email');
            }
        });

        // Backfill provider.timezone from the practice's timezone so the
        // existing telehealth-from-FL providers don't see a behavior
        // change after deploy. Anyone who travels and needs a different
        // working tz can update it from the Profile tab.
        DB::statement("
            UPDATE providers
            SET timezone = practices.timezone
            FROM practices
            WHERE providers.tenant_id = practices.id
              AND providers.timezone IS NULL
        ");
    }

    public function down(): void
    {
        Schema::table('providers', function (Blueprint $table) {
            if (Schema::hasColumn('providers', 'timezone')) {
                $table->dropColumn('timezone');
            }
        });

        Schema::table('patients', function (Blueprint $table) {
            if (Schema::hasColumn('patients', 'timezone')) {
                $table->dropColumn('timezone');
            }
        });
    }
};
