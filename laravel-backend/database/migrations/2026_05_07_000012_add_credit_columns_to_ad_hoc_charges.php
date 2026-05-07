<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Track how much of an ad-hoc charge was settled via patient credit
 * vs. how much went to Stripe. Lets the cancel flow know what to
 * refund (Stripe portion only — credit reverses via the applications
 * ledger), and lets the patient-side receipt show "$50 credit applied".
 *
 * amount_cents stays as the gross / pre-credit total.
 *   amount_due_cents     = what actually went to Stripe (gross - credit)
 *   credit_applied_cents = total credit consumed against this charge
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('ad_hoc_charges', function (Blueprint $table) {
            $table->integer('credit_applied_cents')->default(0)->after('amount_cents');
            $table->integer('amount_due_cents')->nullable()->after('credit_applied_cents');
        });
    }

    public function down(): void
    {
        Schema::table('ad_hoc_charges', function (Blueprint $table) {
            $table->dropColumn(['credit_applied_cents', 'amount_due_cents']);
        });
    }
};
