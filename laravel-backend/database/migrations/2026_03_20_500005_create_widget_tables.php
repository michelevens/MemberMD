<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('widget_configs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('type'); // enrollment, plan_comparison, appointment_booking, contact
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->json('settings')->nullable(); // {title, intro_text, primary_color, success_message, visible_fields, required_fields}
            $table->json('allowed_domains')->nullable();
            $table->json('notification_emails')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'type']);
            $table->index(['tenant_id', 'is_active']);
        });

        Schema::create('widget_submissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('widget_config_id')->constrained('widget_configs')->cascadeOnDelete();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('type');
            $table->json('data');
            $table->string('status')->default('pending'); // pending, reviewed, accepted, rejected
            $table->string('ip_address')->nullable();
            $table->string('user_agent')->nullable();
            $table->string('referrer_url')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'type']);
            $table->index(['tenant_id', 'status']);
            $table->index(['widget_config_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('widget_submissions');
        Schema::dropIfExists('widget_configs');
    }
};
