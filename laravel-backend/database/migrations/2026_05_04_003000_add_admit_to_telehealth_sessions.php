<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Provider admit-from-queue waiting room.
 *
 * Patient joins the telehealth session and lands in a "waiting"
 * state until the provider clicks Admit. Until then they see a
 * branded waiting overlay; afterwards the normal active layout.
 *
 *   admitted_at       null = patient is still in the waiting room.
 *                     non-null = provider clicked Admit at this time.
 *   admitted_by_user_id  who admitted (almost always the provider on
 *                        the appointment, but practice admins can
 *                        admit too — useful for front-desk workflow).
 *
 * The waiting state is computed from `patient_joined_at IS NOT NULL
 * AND admitted_at IS NULL`. Provider's calendar surfaces a "N
 * patients waiting" badge by counting that condition across active
 * appointment sessions.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('telehealth_sessions', function (Blueprint $table) {
            if (!Schema::hasColumn('telehealth_sessions', 'admitted_at')) {
                $table->timestamp('admitted_at')->nullable()->after('patient_joined_at');
            }
            if (!Schema::hasColumn('telehealth_sessions', 'admitted_by_user_id')) {
                $table->foreignUuid('admitted_by_user_id')->nullable()
                    ->after('admitted_at')
                    ->constrained('users')->nullOnDelete();
            }
        });

        try {
            Schema::table('telehealth_sessions', function (Blueprint $table) {
                // Index for the "patients currently waiting" provider
                // dashboard query — `admitted_at IS NULL AND
                // patient_joined_at IS NOT NULL`.
                $table->index(['tenant_id', 'admitted_at'], 'telehealth_sessions_tenant_admitted_idx');
            });
        } catch (\Throwable) { /* already exists */ }
    }

    public function down(): void
    {
        Schema::table('telehealth_sessions', function (Blueprint $table) {
            try { $table->dropIndex('telehealth_sessions_tenant_admitted_idx'); } catch (\Throwable) {}
            try { $table->dropForeign(['admitted_by_user_id']); } catch (\Throwable) {}
            $cols = ['admitted_at', 'admitted_by_user_id'];
            $present = array_filter($cols, fn ($c) => Schema::hasColumn('telehealth_sessions', $c));
            if ($present) $table->dropColumn($present);
        });
    }
};
