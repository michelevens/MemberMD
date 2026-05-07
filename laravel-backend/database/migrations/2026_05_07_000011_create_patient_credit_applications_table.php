<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-application ledger for patient_credits.
 *
 * Each row records "we used $X of credit Y to settle target Z". Lets us
 * answer "what did this credit pay for" and "what credits did this charge
 * consume" independently.
 *
 * target_type/target_id is polymorphic — today only ad_hoc_charge is
 * wired; future targets could be invoice, appointment_balance, etc.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('patient_credit_applications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_credit_id')->constrained('patient_credits')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();

            $table->integer('amount_applied_cents');

            // Polymorphic target. NOT a Laravel morph relation — keeping it
            // explicit so we can index target_type for "all credits applied
            // to ad_hoc_charge X" without scanning the whole table.
            $table->string('target_type', 40); // ad_hoc_charge, invoice, ...
            $table->uuid('target_id');

            $table->uuid('applied_by_user_id')->nullable();
            $table->timestamps();

            $table->index(['target_type', 'target_id']);
            $table->index('patient_credit_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('patient_credit_applications');
    }
};
