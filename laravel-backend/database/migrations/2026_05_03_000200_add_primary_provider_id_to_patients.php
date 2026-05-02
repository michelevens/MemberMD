<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Patients can be assigned to a primary provider — what shows up on
 * the provider's "Panel" tab. Without this column the practice admin
 * UI showed "0 patients on this provider's panel" because the filter
 * `WHERE primary_provider_id = X` was hitting a column that didn't
 * exist (always null → empty result).
 *
 * Nullable + nullOnDelete so an unassigned patient stays in the
 * tenant when their provider is removed, and so the existing patient
 * roster can keep working without a backfill.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            if (!Schema::hasColumn('patients', 'primary_provider_id')) {
                $table->foreignUuid('primary_provider_id')->nullable()
                    ->after('user_id')
                    ->constrained('providers')->nullOnDelete();
                $table->index(['tenant_id', 'primary_provider_id']);
            }
        });
    }

    public function down(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            if (Schema::hasColumn('patients', 'primary_provider_id')) {
                $table->dropForeign(['primary_provider_id']);
                $table->dropIndex(['tenant_id', 'primary_provider_id']);
                $table->dropColumn('primary_provider_id');
            }
        });
    }
};
