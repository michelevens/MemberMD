<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('medication_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->string('medication_name');
            $table->string('drug_ndc')->nullable();
            $table->string('prescriber')->nullable();
            $table->string('pharmacy')->nullable();
            $table->date('fill_date')->nullable();
            $table->integer('days_supply')->nullable();
            $table->string('quantity')->nullable();
            $table->integer('refills_remaining')->nullable();
            $table->string('status')->default('active'); // active, discontinued, expired
            $table->string('source')->default('manual'); // manual, surescripts, patient_reported
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'patient_id']);
            $table->index(['tenant_id', 'patient_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('medication_history');
    }
};
