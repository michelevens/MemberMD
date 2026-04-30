<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two related ledgers:
 *
 *   membership_scheduled_changes — future-dated changes (downgrade-at-renewal,
 *     scheduled cancel, plan switch on a specific date). A daily executor
 *     applies them at the boundary. Today every change is immediate; this
 *     unlocks "honor my committed rate then downgrade after."
 *
 *   membership_credits — per-membership credit balance for write-offs, comp
 *     months, refund-as-credit, downgrade-leftover. Webhook handler consumes
 *     credits before flipping past_due; analytics report credits separately
 *     from revenue so they don't inflate MRR.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('membership_scheduled_changes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('membership_id')->constrained('patient_memberships')->cascadeOnDelete();
            $table->string('change_type', 30); // plan_change, cancel, pause, resume, quantity
            $table->jsonb('payload');           // type-specific (new_plan_id, etc.)
            $table->date('effective_at');
            $table->timestamp('applied_at')->nullable();
            $table->string('status', 20)->default('pending'); // pending, applied, cancelled, failed
            $table->text('error_message')->nullable();
            $table->uuid('created_by_user_id')->nullable();
            $table->timestamps();
            $table->index(['effective_at', 'status']);
            $table->index('membership_id');
        });

        Schema::create('membership_credits', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('membership_id')->constrained('patient_memberships')->cascadeOnDelete();
            // Positive = credit owed to member; negative = balance owed (rare).
            $table->decimal('amount', 10, 2);
            $table->string('reason', 50); // comp, write_off, refund_as_credit, downgrade_leftover, manual
            $table->text('notes')->nullable();
            $table->date('expires_at')->nullable();
            $table->timestamp('applied_at')->nullable();
            $table->uuid('applied_invoice_id')->nullable();
            $table->uuid('created_by_user_id')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'expires_at']);
            $table->index(['membership_id', 'applied_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('membership_credits');
        Schema::dropIfExists('membership_scheduled_changes');
    }
};
