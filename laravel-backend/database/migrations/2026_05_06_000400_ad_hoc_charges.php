<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ad-hoc charges — one-time, non-membership, non-appointment fees the
 * practice bills a patient for. Examples: FMLA / disability / ESA
 * letter completion, after-hours phone consult, copy of records,
 * concierge upgrade.
 *
 * Same Stripe Checkout (mode: payment) primitive the cash-pay
 * appointment flow uses, but freed from the appointment context —
 * the practice composes a line-item bill and sends the patient a
 * payment link. Patient clicks → pays → webhook marks paid.
 *
 * Rows are immutable financial documents — no edit endpoint, only
 * cancel-before-pay. Audit trail is enforced via the AuditLog event
 * shipped on create.
 *
 * Lifecycle:
 *   draft       Just-created, hasn't been sent yet. Allows the
 *               practice to compose multi-line items + review before
 *               firing the email.
 *   sent        Sent to the patient (Stripe session URL emailed).
 *   paid        Webhook fired with a successful payment.
 *   cancelled   Practice cancelled before payment.
 *   expired     Stripe session expired (24h default).
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('ad_hoc_charges')) {
            Schema::create('ad_hoc_charges', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tenant_id');
                $table->uuid('patient_id');
                $table->uuid('created_by_user_id');
                // Multi-line invoices: array of {description, amount_cents}.
                // We keep this denormalized rather than a child line-items
                // table because ad-hoc charges are immutable documents and
                // we never query individual line items separately.
                $table->jsonb('line_items');
                // Total in the smallest currency unit. Computed server-
                // side from line_items at create — never trust a client
                // to total their own bill.
                $table->integer('amount_cents');
                $table->string('currency', 3)->default('usd');
                // Practice-facing label (e.g. "FMLA form completion").
                // Surfaced on the patient's payment screen too via
                // Stripe's product_data.name.
                $table->string('description', 255);
                // Free-text notes — only shown to the practice, not
                // included in the patient-facing payment screen.
                $table->text('notes')->nullable();
                $table->string('status', 16)->default('draft');
                $table->string('stripe_session_id')->nullable()->unique();
                $table->string('stripe_payment_intent_id')->nullable();
                $table->timestamp('sent_at')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->timestamp('cancelled_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamps();

                $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
                $table->foreign('patient_id')->references('id')->on('patients')->cascadeOnDelete();
                $table->foreign('created_by_user_id')->references('id')->on('users')->nullOnDelete();
                $table->index(['tenant_id', 'status'], 'ahc_tenant_status_idx');
                $table->index(['tenant_id', 'patient_id'], 'ahc_tenant_patient_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_hoc_charges');
    }
};
