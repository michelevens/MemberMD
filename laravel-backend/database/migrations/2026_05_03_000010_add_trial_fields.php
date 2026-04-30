<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tier 2 trial period support.
 *
 * Plans declare an optional trial length; memberships in trial track when
 * the trial ends so the dashboard can surface "5 days left" and the dunning
 * executor knows not to fire during the trial window.
 *
 * Stripe handles the actual no-charge window via the Subscription's
 * trial_period_days param at creation time — these fields mirror that
 * locally so we don't have to call Stripe to render trial status.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            // 0 = no trial. Plans can override the default by setting any
            // positive integer (typical values: 7, 14, 30).
            $table->integer('trial_days')->default(0)->after('annual_price');
            // Some plans require a card up front even for the trial; others
            // (lower-friction lead-gen) skip card capture until conversion.
            $table->boolean('trial_requires_payment_method')->default(true)->after('trial_days');
        });

        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->timestamp('trial_ends_at')->nullable()->after('started_at');
            $table->index('trial_ends_at');
        });
    }

    public function down(): void
    {
        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->dropIndex(['trial_ends_at']);
            $table->dropColumn('trial_ends_at');
        });

        Schema::table('membership_plans', function (Blueprint $table) {
            $table->dropColumn(['trial_days', 'trial_requires_payment_method']);
        });
    }
};
