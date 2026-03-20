<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('incidents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->uuid('patient_id')->nullable();
            $table->uuid('provider_id')->nullable();
            $table->foreignUuid('reporter_id')->constrained('users')->cascadeOnDelete();
            $table->string('type'); // adverse_event, near_miss, patient_complaint, equipment_failure, medication_error, other
            $table->string('severity'); // low, medium, high, critical
            $table->string('title');
            $table->text('description');
            $table->text('actions_taken')->nullable();
            $table->jsonb('witnesses')->nullable();
            $table->string('status')->default('open'); // open, under_review, resolved, closed
            $table->uuid('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->foreign('patient_id')->references('id')->on('patients')->nullOnDelete();
            $table->foreign('provider_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'severity']);
            $table->index(['tenant_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('incidents');
    }
};
