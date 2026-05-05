<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Per-visit-type required-documents gate (Sprint 1 of the
 * required-documents work). When set, the booking widget runs a
 * pre-flight check before letting the patient pick a slot — any
 * missing or stale items get collected up-front.
 *
 * Shape:
 *   [
 *     {
 *       "kind": "consent_template" | "screening_template",
 *       "id": "<uuid of the template>",
 *       "freshness_days": 7,         // optional; null = signed-once-ever
 *       "blocks_booking": true        // false = warn but allow
 *     },
 *     ...
 *   ]
 *
 * Stored on appointment_types so a practice can configure once
 * and have it apply to every booking of that type. Per-appointment
 * overrides are Sprint 2 work.
 *
 * Driver shape: pgsql with raw IF NOT EXISTS for partial-run
 * resilience, sqlite with portable Schema builder for the test suite.
 */
return new class extends Migration {
    public $withinTransaction = false;

    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            try {
                DB::statement('ALTER TABLE appointment_types ADD COLUMN IF NOT EXISTS required_documents jsonb');
            } catch (\Throwable $e) {
                $msg = $e->getMessage();
                if (!str_contains($msg, 'already exists') && !str_contains($msg, 'duplicate')) {
                    throw $e;
                }
            }
            return;
        }

        Schema::table('appointment_types', function (Blueprint $table) {
            if (!Schema::hasColumn('appointment_types', 'required_documents')) {
                $table->json('required_documents')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            try {
                DB::statement('ALTER TABLE appointment_types DROP COLUMN IF EXISTS required_documents');
            } catch (\Throwable) {}
            return;
        }

        Schema::table('appointment_types', function (Blueprint $table) {
            if (Schema::hasColumn('appointment_types', 'required_documents')) {
                $table->dropColumn('required_documents');
            }
        });
    }
};
