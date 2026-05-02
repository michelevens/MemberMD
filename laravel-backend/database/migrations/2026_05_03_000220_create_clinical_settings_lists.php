<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Five practice-scoped clinical setting lists, each in its own table.
 *
 * Practice Settings → Clinical exposes five short configurable lists
 * (visit statuses, visit reasons, diagnosable conditions, treatment
 * modalities, patient populations). Until now these were React-state
 * only — admins typed values, page refresh threw them away. Each gets
 * its own table so individual lists can evolve independently (a
 * column the visit-reasons list needs later doesn't bloat the
 * conditions list) and so referencing FKs stay sharp:
 * `appointments.visit_reason_id` will eventually reference exactly
 * the visit-reasons table, not a polymorphic settings table.
 *
 * Common shape:
 *   - uuid id (HasUuids on the model)
 *   - tenant_id FK to practices
 *   - label (the user-visible string)
 *   - description nullable — short hint shown beside the label in
 *     pickers; cheap to add now and skip per-list back-fills later
 *   - sort_order — admin-controlled list order; UI uses this for
 *     drag-to-reorder
 *   - is_active — soft-disable so an item the admin no longer offers
 *     stops appearing on patient pickers without losing history
 *   - soft deletes — preserves rows that are referenced by encounters,
 *     appointments, or audit records when the admin "removes" them
 *
 * Per-tenant uniqueness on (tenant_id, label) at the index level so
 * the same list can't have "Anxiety" twice. Soft-deleted rows are
 * excluded from the unique index so re-adding a previously deleted
 * label works.
 */
return new class extends Migration
{
    public function up(): void
    {
        $tables = [
            'practice_visit_statuses',
            'practice_visit_reasons',
            'practice_conditions',
            'practice_treatment_modalities',
            'practice_patient_populations',
        ];

        foreach ($tables as $table) {
            if (Schema::hasTable($table)) continue;
            Schema::create($table, function (Blueprint $t) use ($table) {
                $t->uuid('id')->primary();
                $t->uuid('tenant_id');
                $t->string('label', 200);
                $t->text('description')->nullable();
                $t->integer('sort_order')->default(0);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
                $t->softDeletes();

                $t->foreign('tenant_id')->references('id')->on('practices')->onDelete('cascade');
                $t->index(['tenant_id', 'sort_order'], "{$table}_tenant_sort_idx");
                $t->index(['tenant_id', 'is_active'], "{$table}_tenant_active_idx");
                // Postgres partial unique on label per tenant, only when
                // not soft-deleted. SQLite (used in tests) doesn't
                // support partial indexes, so we skip there — the
                // controller validates uniqueness in app code anyway.
                if (\DB::getDriverName() !== 'sqlite') {
                    \DB::statement("CREATE UNIQUE INDEX {$table}_tenant_label_unique ON {$table} (tenant_id, lower(label)) WHERE deleted_at IS NULL");
                }
            });
        }
    }

    public function down(): void
    {
        foreach ([
            'practice_patient_populations',
            'practice_treatment_modalities',
            'practice_conditions',
            'practice_visit_reasons',
            'practice_visit_statuses',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
