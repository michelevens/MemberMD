<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sixth practice-scoped clinical settings list — cancellation reasons.
 *
 * Why this exists separately from the five we shipped in 2026_05_03_000220
 * (visit_statuses, visit_reasons, conditions, treatment_modalities,
 * patient_populations): cancel reasons live alongside membership-cancel
 * UX rather than clinical taxonomy. Same shape (label + description +
 * sort_order + is_active + soft delete + per-tenant case-insensitive
 * unique label) so it fits the existing ClinicalSettingsListController
 * pattern with one new entry in its MODELS map.
 *
 * Hint Health surfaces this as a structured pick-list on their cancel
 * dialog (Moved/Relocated, Financial, Deceased, Dissatisfied, etc.) so
 * the practice can answer "why are we losing members?" with categorical
 * data instead of free-text. We had a free-text cancel_reason column
 * on PatientMembership already (still kept for the actual reason text
 * tied to the cancellation) — this list is what powers the dropdown.
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = 'practice_cancellation_reasons';
        if (!Schema::hasTable($table)) {
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
            });
        }

        // Postgres-only partial unique index on (tenant_id, lower(label))
        // where deleted_at IS NULL. Same pattern as 000220, kept defensive
        // (IF NOT EXISTS + try/catch + warning log) after the boot-loop
        // we hit on first deploy.
        if (\DB::getDriverName() !== 'sqlite') {
            try {
                \DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS {$table}_tenant_label_unique ON {$table} (tenant_id, lower(label)) WHERE deleted_at IS NULL");
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning(
                    "Skipped partial unique index for {$table}: " . $e->getMessage()
                );
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_cancellation_reasons');
    }
};
