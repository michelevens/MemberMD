<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Idempotency table for membership lifecycle nudges.
 *
 * Each row says: this membership got *this* nudge (e.g. first_visit_nudge,
 * win_back) at this time, with this outcome (sent / skipped_already_visited
 * / etc). The lifecycle service consults this table to avoid double-sending.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('membership_lifecycle_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('membership_id')->constrained('patient_memberships')->cascadeOnDelete();
            $table->string('event_type'); // first_visit_nudge, win_back, ...
            $table->string('outcome');    // sent, skipped_already_visited, error
            $table->jsonb('metadata')->nullable();
            $table->timestamps();
            $table->unique(['membership_id', 'event_type']);
            $table->index(['tenant_id', 'event_type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('membership_lifecycle_events');
    }
};
