<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patient_engagement_scores', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->integer('overall_score')->default(50); // 0-100
            $table->integer('visit_frequency_score')->default(50);
            $table->integer('message_responsiveness_score')->default(50);
            $table->integer('screening_completion_score')->default(50);
            $table->integer('portal_login_score')->default(50);
            $table->integer('no_show_rate_score')->default(50);
            $table->integer('last_visit_days_ago')->nullable();
            $table->integer('appointments_this_month')->default(0);
            $table->integer('messages_response_time_hours')->nullable();
            $table->integer('no_show_count_6m')->default(0);
            $table->string('risk_level')->default('normal'); // low, normal, high, at_risk
            $table->jsonb('engagement_flags')->nullable(); // ['no_visit_60d', 'high_no_show_rate', ...]
            $table->timestamp('last_calculated_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'patient_id']);
            $table->index('risk_level');
            $table->index(['tenant_id', 'last_calculated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('patient_engagement_scores');
    }
};
