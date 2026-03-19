<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('practices', 'selected_programs')) {
            Schema::table('practices', function (Blueprint $table) {
                $table->jsonb('selected_programs')->nullable()->after('specialty');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('practices', 'selected_programs')) {
            Schema::table('practices', function (Blueprint $table) {
                $table->dropColumn('selected_programs');
            });
        }
    }
};
