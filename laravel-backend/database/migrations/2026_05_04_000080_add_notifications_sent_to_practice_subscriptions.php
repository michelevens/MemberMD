<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Track which billing-cadence emails have been sent for a subscription so the
 * nightly lifecycle cron doesn't re-send daily.
 *
 * JSON map: { "trial_t_minus_30": "2026-05-04T03:14:00Z", "trial_t_minus_7": ..., ... }
 *
 * Using a column rather than querying mail_dispatch_logs because the cron
 * runs against every subscription nightly — a per-row JSON read is
 * straight-forward and idempotent without a join.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('practice_subscriptions', 'notifications_sent')) {
            Schema::table('practice_subscriptions', function (Blueprint $table) {
                $table->jsonb('notifications_sent')->nullable()->after('cancellation_notes');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('practice_subscriptions', 'notifications_sent')) {
            Schema::table('practice_subscriptions', function (Blueprint $table) {
                $table->dropColumn('notifications_sent');
            });
        }
    }
};
