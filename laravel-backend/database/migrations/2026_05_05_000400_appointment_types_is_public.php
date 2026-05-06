<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `appointment_types.is_public` — practice-controlled flag that exposes
 * a visit type to the public booking widget. Default false so existing
 * practices don't suddenly accept public booking on every visit type
 * the moment the widget ships. Practice admin opts in per type.
 *
 * The widget shows `WHERE is_public = true AND is_active = true`. Staff-
 * facing surfaces ignore the flag entirely.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('appointment_types', function (Blueprint $table) {
            if (!Schema::hasColumn('appointment_types', 'is_public')) {
                $table->boolean('is_public')->default(false)->after('is_active');
            }
        });
    }

    public function down(): void
    {
        Schema::table('appointment_types', function (Blueprint $table) {
            if (Schema::hasColumn('appointment_types', 'is_public')) {
                $table->dropColumn('is_public');
            }
        });
    }
};
