<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            if (!Schema::hasColumn('messages', 'priority')) {
                $table->string('priority')->nullable()->after('delivery_status'); // normal, urgent, stat
            }
            if (!Schema::hasColumn('messages', 'sla_deadline')) {
                $table->timestamp('sla_deadline')->nullable()->after('priority');
            }
            if (!Schema::hasColumn('messages', 'response_time_seconds')) {
                $table->integer('response_time_seconds')->nullable()->after('sla_deadline');
            }
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            if (Schema::hasColumn('messages', 'priority')) {
                $table->dropColumn('priority');
            }
            if (Schema::hasColumn('messages', 'sla_deadline')) {
                $table->dropColumn('sla_deadline');
            }
            if (Schema::hasColumn('messages', 'response_time_seconds')) {
                $table->dropColumn('response_time_seconds');
            }
        });
    }
};
