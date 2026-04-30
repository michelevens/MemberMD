<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Persist platform-account webhooks.
 *
 * The Connect endpoint already records into stripe_connect_events, but the
 * platform endpoint just acks 200 with no audit trail. Tier 1 events
 * (Practice→Superadmin SaaS billing) need the same replay/audit safety net
 * — if a payout fails or a platform-side subscription event fires we want
 * a record we can replay.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('stripe_platform_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('stripe_event_id')->unique();
            $table->string('event_type');
            $table->jsonb('payload');
            $table->string('processing_status')->default('received'); // received, processed, failed
            $table->text('error_message')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
            $table->index(['event_type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stripe_platform_events');
    }
};
