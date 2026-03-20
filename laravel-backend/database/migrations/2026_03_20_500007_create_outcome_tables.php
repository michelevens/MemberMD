<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('health_metrics', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->string('metric_type'); // weight, bmi, blood_pressure_systolic, blood_pressure_diastolic, heart_rate, a1c, cholesterol_total, cholesterol_ldl, cholesterol_hdl, triglycerides, phq9, gad7, glucose_fasting, vitamin_d
            $table->decimal('value', 10, 3);
            $table->string('unit')->nullable();
            $table->timestamp('recorded_at');
            $table->string('source')->default('encounter'); // encounter, lab, patient_reported, device
            $table->uuid('encounter_id')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'patient_id', 'metric_type']);
            $table->index(['tenant_id', 'patient_id', 'recorded_at']);
            $table->index('encounter_id');
        });

        Schema::create('value_reports', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('title');
            $table->string('report_type'); // individual, employer_aggregate, practice_summary
            $table->uuid('target_id')->nullable(); // patient_id or employer_id
            $table->date('period_start');
            $table->date('period_end');
            $table->json('data'); // all calculated metrics
            $table->foreignUuid('generated_by')->constrained('users')->cascadeOnDelete();
            $table->timestamp('generated_at');
            $table->timestamps();

            $table->index(['tenant_id', 'report_type']);
            $table->index(['tenant_id', 'target_id']);
            $table->index(['tenant_id', 'generated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('value_reports');
        Schema::dropIfExists('health_metrics');
    }
};
