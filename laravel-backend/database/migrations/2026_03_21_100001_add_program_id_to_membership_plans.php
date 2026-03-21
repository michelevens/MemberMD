<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('membership_plans', 'program_id')) {
            Schema::table('membership_plans', function (Blueprint $table) {
                $table->uuid('program_id')->nullable()->after('tenant_id');
                $table->foreign('program_id')->references('id')->on('programs')->nullOnDelete();
                $table->index('program_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('membership_plans', 'program_id')) {
            Schema::table('membership_plans', function (Blueprint $table) {
                $table->dropForeign(['program_id']);
                $table->dropIndex(['program_id']);
                $table->dropColumn('program_id');
            });
        }
    }
};
