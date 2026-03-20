<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_preferences', function (Blueprint $table) {
            if (!Schema::hasColumn('notification_preferences', 'categories')) {
                $table->jsonb('categories')->nullable()->after('push_enabled');
            }
            if (!Schema::hasColumn('notification_preferences', 'quiet_hours_start')) {
                $table->time('quiet_hours_start')->nullable()->after('categories');
            }
            if (!Schema::hasColumn('notification_preferences', 'quiet_hours_end')) {
                $table->time('quiet_hours_end')->nullable()->after('quiet_hours_start');
            }
            if (!Schema::hasColumn('notification_preferences', 'digest_frequency')) {
                $table->string('digest_frequency')->default('immediate')->after('quiet_hours_end');
            }
        });
    }

    public function down(): void
    {
        Schema::table('notification_preferences', function (Blueprint $table) {
            $table->dropColumn(['categories', 'quiet_hours_start', 'quiet_hours_end', 'digest_frequency']);
        });
    }
};
