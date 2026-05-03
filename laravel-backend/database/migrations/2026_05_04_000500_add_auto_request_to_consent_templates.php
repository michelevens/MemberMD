<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `auto_request` flag on consent_templates so practices can mark which
 * templates should be automatically requested when a patient books an
 * appointment for the first time.
 *
 * Default false — practices have to opt in per template, and we only
 * fire on the patient's FIRST appointment so HIPAA isn't re-signed
 * every visit.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasColumn('consent_templates', 'auto_request')) {
            Schema::table('consent_templates', function (Blueprint $table) {
                $table->boolean('auto_request')->default(false)->after('is_required');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('consent_templates', 'auto_request')) {
            Schema::table('consent_templates', function (Blueprint $table) {
                $table->dropColumn('auto_request');
            });
        }
    }
};
