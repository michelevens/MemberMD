<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('engagement_campaigns', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('trigger_type'); // no_visit, no_message_response, low_engagement, manual
            $table->jsonb('trigger_config'); // { days: 60, engagement_score: 30, ... }
            $table->string('action_type'); // send_email, send_sms, send_message
            $table->jsonb('action_config'); // { template_id, channels: ['email', 'in_app'] }
            $table->string('audience_filter'); // all, by_plan, by_provider, custom
            $table->jsonb('audience_config')->nullable(); // { plan_ids: [], provider_ids: [] }
            $table->enum('status', ['active', 'inactive', 'paused'])->default('active');
            $table->timestamp('activated_at')->nullable();
            $table->foreignUuid('created_by')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'status']);
            $table->index(['trigger_type', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('engagement_campaigns');
    }
};
