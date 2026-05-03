<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * SuperAdmin-curated cancellation reasons — shown when a practice cancels
 * their MemberMD subscription. Distinct from `practice_cancellation_reasons`
 * (tenant-scoped, practice-curated, shown to patients). This list is
 * platform-wide, no tenant_id, curated from SuperAdminPortal.
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = 'superadmin_cancellation_reasons';
        if (Schema::hasTable($table)) {
            return;
        }

        Schema::create($table, function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->string('label', 200);
            $t->text('description')->nullable();
            $t->integer('sort_order')->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->softDeletes();

            $t->index(['is_active', 'sort_order']);
        });

        // Partial unique index on lower(label) where deleted_at IS NULL
        if (\DB::getDriverName() !== 'sqlite') {
            try {
                \DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS {$table}_label_unique ON {$table} (lower(label)) WHERE deleted_at IS NULL");
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning(
                    "Skipped partial unique index for {$table}: " . $e->getMessage()
                );
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('superadmin_cancellation_reasons');
    }
};
