<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('care_gaps', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->string('gap_type'); // screening_overdue, vaccination_due, lab_overdue, follow_up_needed, medication_review, referral_pending, chronic_disease_check
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('guideline_source')->nullable(); // USPSTF, CDC, ADA, AHA, custom
            $table->enum('severity', ['critical', 'high', 'medium', 'low']);
            $table->enum('status', ['open', 'addressed', 'dismissed']);
            $table->date('due_date')->nullable();
            $table->timestamp('addressed_at')->nullable();
            $table->uuid('addressed_by')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('addressed_by')->references('id')->on('users')->nullOnDelete();

            $table->index(['tenant_id', 'patient_id', 'status']);
            $table->index(['tenant_id', 'gap_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('care_gaps');
    }
};
