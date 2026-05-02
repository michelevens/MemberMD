<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Side table for the send-payment-link enrollment flow.
 *
 * When an admin clicks "Send payment link", we don't create a real
 * PatientMembership yet — that would put a half-real row in the
 * primary table and mess with the active-membership uniqueness
 * invariant. Instead we stash the intent here, generate a Stripe
 * Checkout session, and let the checkout.session.completed webhook
 * convert this row into a real membership atomically.
 *
 * Idempotent per (patient_id, plan_id) where status='pending' — a
 * second "Send payment link" click for the same patient/plan reuses
 * the existing row if it's still alive (not expired, not claimed).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('pending_enrollments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('plan_id')->constrained('membership_plans')->cascadeOnDelete();
            $table->string('billing_frequency', 16)->default('monthly');

            // Stripe-side identifiers. checkout_session_id is what the
            // webhook uses to find this row when payment lands.
            $table->string('stripe_checkout_session_id', 255)->nullable();
            $table->string('stripe_customer_id', 255)->nullable();
            $table->text('checkout_url')->nullable();

            // pending → claimed (paid + membership created)
            // pending → expired (24h passed, no payment)
            // pending → cancelled (admin cancelled the link)
            $table->string('status', 16)->default('pending');

            // The membership that got created when the patient paid.
            // Only set when status='claimed'.
            $table->foreignUuid('claimed_membership_id')->nullable()
                ->constrained('patient_memberships')->nullOnDelete();
            $table->timestamp('claimed_at')->nullable();

            $table->foreignUuid('created_by_user_id')->nullable()
                ->constrained('users')->nullOnDelete();
            $table->timestamp('expires_at');
            $table->timestamps();

            // Lookup by checkout session id (webhook path) — must be fast.
            $table->index('stripe_checkout_session_id');
            // Lookup for idempotency check (patient_id + plan_id + pending).
            $table->index(['tenant_id', 'patient_id', 'plan_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pending_enrollments');
    }
};
