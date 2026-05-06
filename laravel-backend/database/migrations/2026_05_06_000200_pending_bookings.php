<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * pending_bookings — the cash-pay equivalent of pending_enrollments.
 *
 * Two-phase booking flow:
 *   1. Visitor submits the cash-pay booking form. We validate the
 *      slot, hold the form data + price snapshot here, mint a
 *      Stripe Checkout session, return its URL to the widget.
 *   2. Stripe webhook (checkout.session.completed) fires after the
 *      visitor pays → we look up the row by stripe_session_id,
 *      create the User/Patient/Appointment in confirmed state, and
 *      mark this row as 'claimed'.
 *
 * Why a separate table (vs. just creating the Appointment up front
 * and confirming on webhook):
 * - The Appointment row would block the slot before payment
 *   succeeded. Visitors who close the Stripe tab (huge % on mobile)
 *   would silently lock the time forever.
 * - We can sweep stale pending_bookings older than 30 min, freeing
 *   the slot for the next visitor without touching the appointments
 *   table.
 *
 * The column shape mirrors pending_enrollments where it makes sense
 * so the sweep / reconcile patterns we already have for enrollment
 * can be ported over later.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('pending_bookings')) {
            Schema::create('pending_bookings', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tenant_id');
                // Snapshot of the form. Sensitive fields (email, phone,
                // DOB) are encrypted at the model level.
                $table->string('first_name');
                $table->string('last_name');
                $table->text('email');
                $table->text('phone');
                $table->date('date_of_birth');
                $table->text('reason')->nullable();
                $table->uuid('provider_id');
                $table->uuid('appointment_type_id');
                $table->timestamp('scheduled_at');
                $table->integer('duration_minutes');
                $table->boolean('is_telehealth')->default(false);
                // Price snapshot — locks in the cash price at the
                // moment of submit so a practice changing the price
                // mid-checkout doesn't change what the visitor pays.
                $table->integer('amount_cents');
                $table->string('currency', 3)->default('usd');
                // Stripe Checkout session id. Webhook lookups join
                // here to find the right pending_bookings row.
                $table->string('stripe_session_id')->nullable()->unique();
                $table->string('stripe_payment_intent_id')->nullable();
                // pending = awaiting payment, claimed = converted to
                // appointment, expired = swept after 30 min,
                // cancelled = visitor abandoned (rare, only via
                // Stripe explicit cancel hooks).
                $table->string('status', 16)->default('pending');
                // Set when convertCheckoutSession runs — points at
                // the created appointment for traceability.
                $table->uuid('appointment_id')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamps();

                $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
                $table->index(['tenant_id', 'status'], 'pb_tenant_status_idx');
                $table->index(['provider_id', 'scheduled_at'], 'pb_provider_window_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('pending_bookings');
    }
};
