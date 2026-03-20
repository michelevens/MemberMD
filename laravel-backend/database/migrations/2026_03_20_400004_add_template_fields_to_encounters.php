<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('encounters', function (Blueprint $table) {
            if (!Schema::hasColumn('encounters', 'template_id')) {
                $table->uuid('template_id')->nullable()->after('screening_scores');
                $table->foreign('template_id')->references('id')->on('chart_templates')->nullOnDelete();
            }
            if (!Schema::hasColumn('encounters', 'structured_data')) {
                $table->jsonb('structured_data')->nullable()->after('template_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('encounters', function (Blueprint $table) {
            if (Schema::hasColumn('encounters', 'template_id')) {
                $table->dropForeign(['template_id']);
                $table->dropColumn('template_id');
            }
            if (Schema::hasColumn('encounters', 'structured_data')) {
                $table->dropColumn('structured_data');
            }
        });
    }
};
