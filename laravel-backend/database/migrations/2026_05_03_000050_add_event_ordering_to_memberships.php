<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Webhook event ordering safeguard.
 *
 * Stripe doesn't guarantee event delivery order. Today our handlers each
 * read current local state and overwrite, so an old event arriving late
 * can trample a newer one. We stamp last_stripe_event_at on the membership
 * each time we apply a Stripe-derived update, and reject older events.
 *
 * Also adds last_state_change_at for the simple state machine — every
 * status transition records when it happened.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->timestamp('last_stripe_event_at')->nullable()
                ->after('current_period_end');
            $table->timestamp('last_state_change_at')->nullable()
                ->after('last_stripe_event_at');
        });
    }

    public function down(): void
    {
        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->dropColumn(['last_stripe_event_at', 'last_state_change_at']);
        });
    }
};
