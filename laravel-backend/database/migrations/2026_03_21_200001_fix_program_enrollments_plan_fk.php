<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('program_enrollments', function (Blueprint $table) {
            // Drop old FK pointing to program_plans
            try {
                $table->dropForeign(['plan_id']);
            } catch (\Throwable $e) {
                // FK may not exist or have different name
            }
        });

        Schema::table('program_enrollments', function (Blueprint $table) {
            // Make plan_id nullable (enrollment can exist without a specific plan)
            $table->uuid('plan_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        // No rollback needed
    }
};
