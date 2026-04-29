<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('tenant_plan_overrides', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');                    // practices.id
            $table->uuid('plan_id');                      // membership_plans.id
            $table->uuid('master_template_id');           // master_plan_templates.id
            $table->string('field_name', 64);             // e.g. monthly_price, telehealth_included
            $table->json('original_value')->nullable();   // template default at time of override
            $table->json('override_value');               // tenant's chosen value
            $table->uuid('overridden_by')->nullable();    // users.id
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
            $table->foreign('plan_id')->references('id')->on('membership_plans')->cascadeOnDelete();
            $table->foreign('master_template_id')->references('id')->on('master_plan_templates')->cascadeOnDelete();
            $table->foreign('overridden_by')->references('id')->on('users')->nullOnDelete();
            $table->unique(['plan_id', 'field_name']);
            $table->index(['tenant_id', 'master_template_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_plan_overrides');
    }
};
