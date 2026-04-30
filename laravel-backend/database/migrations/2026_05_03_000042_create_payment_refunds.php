<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only ledger of refund events.
 *
 * Today Payment.refund_amount is a single column overwritten by the latest
 * event. If an admin partial-refunds $20, then a Stripe Dashboard refund
 * adds another $30, the webhook handler will overwrite the local row with
 * $30 and we lose history of the $20.
 *
 * Each refund (manual via PaymentController, dashboard, dispute, webhook
 * reconcile) gets its own immutable row. Payment.refund_amount becomes a
 * SUM, never a single source. Reports and reconciliation read from here.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('payment_refunds', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('payment_id')->constrained('payments')->cascadeOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('reason', 50)->nullable(); // duplicate, fraudulent, requested_by_customer, dispute, ...
            $table->string('source', 30); // manual, webhook, dispute
            $table->string('stripe_refund_id')->nullable();
            $table->uuid('issued_by_user_id')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('refunded_at');
            $table->timestamps();

            $table->index(['tenant_id', 'refunded_at']);
            $table->index('payment_id');
            $table->unique('stripe_refund_id'); // partial-uniqueness via filter on real DBs
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_refunds');
    }
};
