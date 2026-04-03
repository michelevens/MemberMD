<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('engagement_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('campaign_id')->nullable()->constrained('engagement_campaigns')->cascadeOnDelete();
            $table->string('event_type'); // appointment_reminder_sent, campaign_triggered, message_opened, etc.
            $table->jsonb('event_data')->nullable();
            $table->timestamp('triggered_at');
            $table->timestamps();

            $table->index(['tenant_id', 'patient_id']);
            $table->index(['campaign_id', 'event_type']);
            $table->index(['event_type', 'triggered_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('engagement_logs');
    }
};
