<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('practices', function (Blueprint $table) {
            $table->json('utilization_settings')->nullable()->after('settings');
        });
    }

    public function down(): void
    {
        Schema::table('practices', function (Blueprint $table) {
            $table->dropColumn('utilization_settings');
        });
    }
};
