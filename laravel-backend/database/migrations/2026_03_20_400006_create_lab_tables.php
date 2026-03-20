<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lab_orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('provider_id')->constrained('users')->cascadeOnDelete();
            $table->uuid('encounter_id')->nullable();
            $table->string('lab_partner')->default('manual'); // manual, quest, labcorp, other
            $table->string('order_number')->nullable(); // external order ID
            $table->string('status')->default('draft'); // draft, pending, sent, in_progress, resulted, cancelled
            $table->string('priority')->default('routine'); // routine, urgent, stat
            $table->jsonb('panels'); // array of {code, name, cpt}
            $table->jsonb('diagnosis_codes')->nullable(); // array of ICD-10 codes
            $table->boolean('fasting_required')->default(false);
            $table->text('special_instructions')->nullable();
            $table->timestamp('ordered_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('resulted_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('encounter_id')->references('id')->on('encounters')->nullOnDelete();

            $table->index(['tenant_id', 'patient_id']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'provider_id']);
        });

        Schema::create('lab_results', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('lab_order_id')->constrained('lab_orders')->cascadeOnDelete();
            $table->string('test_name');
            $table->string('test_code')->nullable(); // LOINC code
            $table->string('value');
            $table->string('unit')->nullable();
            $table->decimal('reference_range_low', 10, 3)->nullable();
            $table->decimal('reference_range_high', 10, 3)->nullable();
            $table->string('reference_range_text')->nullable(); // for non-numeric ranges
            $table->string('flag')->nullable(); // normal, abnormal, critical, low, high
            $table->text('notes')->nullable();
            $table->timestamp('resulted_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lab_results');
        Schema::dropIfExists('lab_orders');
    }
};
