<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chart_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->nullable();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('visit_type')->nullable(); // wellness, acute, chronic, procedure, followup
            $table->jsonb('fields'); // array of field definitions
            $table->boolean('is_active')->default(true);
            $table->boolean('is_system')->default(false);
            $table->integer('sort_order')->default(0);
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();

            $table->index(['tenant_id', 'is_active']);
            $table->index(['visit_type']);
            $table->index(['is_system']);
        });

        Schema::create('chart_template_responses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('encounter_id')->constrained('encounters')->cascadeOnDelete();
            $table->foreignUuid('template_id')->constrained('chart_templates')->cascadeOnDelete();
            $table->jsonb('responses'); // object mapping field_id to value
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->unique(['encounter_id', 'template_id']);
            $table->index(['tenant_id', 'encounter_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chart_template_responses');
        Schema::dropIfExists('chart_templates');
    }
};
