<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Track conversion + archival on widget_submissions so the practice
 * Intakes review queue can mark submissions as handled.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('widget_submissions', function (Blueprint $table) {
            if (!Schema::hasColumn('widget_submissions', 'converted_patient_id')) {
                $table->foreignUuid('converted_patient_id')->nullable()
                    ->constrained('patients')->nullOnDelete();
            }
            if (!Schema::hasColumn('widget_submissions', 'converted_at')) {
                $table->timestamp('converted_at')->nullable();
            }
            if (!Schema::hasColumn('widget_submissions', 'archived_reason')) {
                $table->string('archived_reason', 500)->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('widget_submissions', function (Blueprint $table) {
            if (Schema::hasColumn('widget_submissions', 'converted_patient_id')) {
                $table->dropForeign(['converted_patient_id']);
                $table->dropColumn('converted_patient_id');
            }
            if (Schema::hasColumn('widget_submissions', 'converted_at')) {
                $table->dropColumn('converted_at');
            }
            if (Schema::hasColumn('widget_submissions', 'archived_reason')) {
                $table->dropColumn('archived_reason');
            }
        });
    }
};
