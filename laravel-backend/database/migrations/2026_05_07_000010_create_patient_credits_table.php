<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Patient-level credit balance.
 *
 * Distinct from membership_credits (which is keyed off membership_id and
 * pushed into Stripe customer balance for recurring-invoice offset). This
 * surface is for credits that:
 *   - apply to ad-hoc charges (form fees, after-hours visits)
 *   - persist beyond a membership lifecycle (former member with a refund
 *     balance, cash-pay-only patient with a goodwill credit)
 *   - are visible in both the practice's patient profile and the
 *     patient's own portal billing tab
 *
 * Schema choice — separate "issued amount" from "remaining balance":
 *   We could shoehorn partial application by mutating amount_cents in
 *   place, but that loses the audit trail. Instead, amount_cents is
 *   immutable (the original credit issued) and balance_cents tracks how
 *   much is left after applications. The patient_credit_applications
 *   ledger holds the per-application history.
 *
 * Why not reuse membership_credits — patient-level credits don't have a
 * membership_id when issued (a former member or a never-member can hold
 * one), and the consumption logic differs (we apply to AdHocCharge.row
 * directly, not via Stripe customer balance).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('patient_credits', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();

            // Original amount issued. Immutable after creation. Stored in
            // cents to match the rest of our money columns (ad_hoc_charges,
            // platform_invoices, etc. are all cents-based).
            $table->integer('amount_cents');

            // Remaining balance after any partial applications. Decremented
            // by patient_credit_applications.amount_applied_cents.
            $table->integer('balance_cents');

            $table->string('currency', 3)->default('usd');

            // 'manual'      = practice admin issued from the UI
            // 'refund'      = posted as a refund-as-credit instead of cash refund
            // 'goodwill'    = comp / make-good
            // 'overpayment' = patient paid more than the charge
            $table->string('source', 30)->default('manual');

            // Free-form (e.g. "Refund for missed visit 2026-04-30").
            $table->text('notes')->nullable();

            // Optional expiry. Null = no expiration.
            $table->date('expires_at')->nullable();

            // Voided credits are kept for audit but excluded from balance.
            // void_reason answers "why was this voided" (typo, fraud, refunded).
            $table->timestamp('voided_at')->nullable();
            $table->text('void_reason')->nullable();
            $table->uuid('voided_by_user_id')->nullable();

            $table->uuid('created_by_user_id')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'patient_id']);
            $table->index(['patient_id', 'voided_at']);
            $table->index(['tenant_id', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('patient_credits');
    }
};
