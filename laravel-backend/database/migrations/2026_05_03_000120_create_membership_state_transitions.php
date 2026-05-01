<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only history of every membership state transition.
 *
 * Distinct from membership_lifecycle_events (which is the per-membership
 * idempotency log for nudges with one row per event_type). This table is
 * the lifecycle TIMELINE: many rows per membership, ordered by created_at,
 * one row per transition, immutable.
 *
 * Drives:
 *   - Practice-facing membership detail "history" tab
 *   - Audit / dispute story ("when exactly did the system mark you cancelled?")
 *   - Replay for analytics
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('membership_state_transitions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('membership_id')->constrained('patient_memberships')->cascadeOnDelete();
            $table->string('from_status', 30);
            $table->string('to_status', 30);
            $table->string('event_name', 60)->nullable(); // e.g. membership.cancelled
            $table->foreignUuid('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('source', 60)->nullable();     // controller path / cron / webhook
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['membership_id', 'created_at']);
            $table->index(['tenant_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('membership_state_transitions');
    }
};
