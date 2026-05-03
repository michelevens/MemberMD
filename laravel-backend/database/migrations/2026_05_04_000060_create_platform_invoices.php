<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Platform Invoices — practice-pays-MemberMD invoice history.
 *
 * Distinct from the existing `invoices` table (which is patient-pays-practice).
 * Mostly a local mirror of Stripe invoices on our platform account, denormalized
 * so we can render billing history without round-tripping Stripe.
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = 'platform_invoices';
        if (Schema::hasTable($table)) {
            return;
        }

        Schema::create($table, function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('practice_id');
            $t->uuid('practice_subscription_id');
            $t->string('stripe_invoice_id')->nullable();
            $t->string('stripe_invoice_number')->nullable();
            $t->integer('amount_subtotal_cents');
            $t->integer('amount_tax_cents')->default(0);
            $t->integer('amount_total_cents');
            $t->integer('amount_paid_cents')->default(0);
            $t->string('status', 20); // draft | open | paid | void | uncollectible
            // Line items: [{ type: 'base'|'seats'|'addon'|'transaction_fees', qty, unit_price, amount }]
            $t->jsonb('line_items');
            $t->timestamp('issued_at')->nullable();
            $t->timestamp('due_at')->nullable();
            $t->timestamp('paid_at')->nullable();
            $t->string('hosted_invoice_url')->nullable();
            $t->string('invoice_pdf_url')->nullable();
            $t->timestamps();

            $t->foreign('practice_id')->references('id')->on('practices')->onDelete('cascade');
            $t->foreign('practice_subscription_id')->references('id')->on('practice_subscriptions')->onDelete('cascade');

            $t->index(['practice_id', 'issued_at']);
            $t->index('stripe_invoice_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_invoices');
    }
};
