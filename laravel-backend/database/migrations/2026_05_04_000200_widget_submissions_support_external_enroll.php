<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Make widget_submissions usable for the public /external/enroll/{tenantCode}
 * flow (which has no WidgetConfig — it's a built-in route, not a builder
 * widget). Two changes:
 *
 *  - widget_config_id becomes nullable so external-enroll rows fit
 *  - pending_enrollment_id is added so the Stripe webhook can flip the
 *    submission to status=converted at the same time it claims the
 *    PendingEnrollment, without re-deriving from patient_id
 */
return new class extends Migration {
    public function up(): void
    {
        // Drop existing FK on widget_config_id, alter to nullable, re-add FK
        Schema::table('widget_submissions', function (Blueprint $table) {
            $table->dropForeign(['widget_config_id']);
        });

        // Postgres needs raw SQL to alter the NOT NULL constraint on a uuid
        // FK column without losing the column. Doctrine DBAL would handle
        // it but Laravel doesn't ship it on Railway by default.
        DB::statement('ALTER TABLE widget_submissions ALTER COLUMN widget_config_id DROP NOT NULL');

        Schema::table('widget_submissions', function (Blueprint $table) {
            $table->foreign('widget_config_id')
                ->references('id')->on('widget_configs')
                ->cascadeOnDelete();

            if (!Schema::hasColumn('widget_submissions', 'pending_enrollment_id')) {
                $table->foreignUuid('pending_enrollment_id')->nullable()
                    ->constrained('pending_enrollments')->nullOnDelete();
                $table->index(['tenant_id', 'pending_enrollment_id']);
            }
        });
    }

    public function down(): void
    {
        Schema::table('widget_submissions', function (Blueprint $table) {
            if (Schema::hasColumn('widget_submissions', 'pending_enrollment_id')) {
                $table->dropForeign(['pending_enrollment_id']);
                $table->dropIndex(['tenant_id', 'pending_enrollment_id']);
                $table->dropColumn('pending_enrollment_id');
            }
        });

        // Note: not restoring NOT NULL on widget_config_id — that would
        // fail if any external-enroll rows exist, and the looser constraint
        // is harmless going forward.
    }
};
