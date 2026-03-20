<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patient_engagements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->integer('score')->default(0); // 0-100
            $table->json('factors')->nullable(); // {visit_frequency, message_responsiveness, screening_completion, portal_activity, no_show_rate}
            $table->string('risk_level')->default('medium'); // high, medium, low
            $table->timestamp('last_visit_at')->nullable();
            $table->integer('days_since_last_visit')->nullable();
            $table->timestamp('calculated_at');
            $table->timestamps();

            $table->unique(['tenant_id', 'patient_id']);
            $table->index(['tenant_id', 'risk_level']);
            $table->index(['tenant_id', 'score']);
        });

        Schema::create('engagement_rules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('name');
            $table->string('trigger_condition'); // no_visit_30d, no_visit_60d, no_visit_90d, missed_screening, low_score, no_show_streak
            $table->string('action_type'); // send_message, create_task, notify_provider, send_email
            $table->json('action_config')->nullable(); // {message_template, recipient, subject}
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_triggered_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'is_active']);
            $table->index(['tenant_id', 'trigger_condition']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('engagement_rules');
        Schema::dropIfExists('patient_engagements');
    }
};
