<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('master_plan_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('operator_id');
            $table->string('name');
            $table->string('slug');
            $table->text('description')->nullable();
            $table->string('badge_text', 30)->nullable();

            // Default plan values — applied on first attach to a tenant plan
            $table->decimal('default_monthly_price', 10, 2);
            $table->decimal('default_annual_price', 10, 2)->nullable();
            $table->integer('default_visits_per_month')->default(0);
            $table->boolean('default_telehealth_included')->default(true);
            $table->boolean('default_messaging_included')->default(true);
            $table->integer('default_messaging_response_sla_hours')->nullable();
            $table->boolean('default_crisis_support')->default(false);
            $table->integer('default_lab_discount_pct')->nullable();
            $table->boolean('default_prescription_management')->default(true);
            $table->boolean('default_specialist_referrals')->default(false);
            $table->boolean('default_care_plan_included')->default(false);
            $table->boolean('default_visit_rollover')->default(false);
            $table->decimal('default_overage_fee', 10, 2)->nullable();
            $table->boolean('default_family_eligible')->default(false);
            $table->decimal('default_family_member_price', 10, 2)->nullable();
            $table->integer('default_min_commitment_months')->nullable();
            $table->json('default_features_list')->nullable();

            // Lock matrix — JSON map of field_name => bool. Locked fields cannot
            // be overridden by tenants. Unlocked fields can. See PlanSyncService.
            $table->json('locked_fields');

            // Price bounds — optional min/max range tenants may price within.
            // null = no bound. Only applies if monthly_price/annual_price are
            // not in locked_fields.
            $table->decimal('monthly_price_min', 10, 2)->nullable();
            $table->decimal('monthly_price_max', 10, 2)->nullable();
            $table->decimal('annual_price_min', 10, 2)->nullable();
            $table->decimal('annual_price_max', 10, 2)->nullable();

            $table->string('status', 16)->default('draft'); // draft | published | archived
            $table->integer('version')->default(1);
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('operator_id')->references('id')->on('operators')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->unique(['operator_id', 'slug']);
            $table->index(['operator_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('master_plan_templates');
    }
};
