<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ===== Entitlement Types — catalog of all possible benefits =====
        Schema::create('entitlement_types', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('code', 50);
            $table->string('name', 200);
            $table->string('category', 50); // visit, communication, lab, procedure, rx, program, access
            $table->text('description')->nullable();
            $table->string('unit_of_measure', 50); // visit, panel, message, session, item, access
            $table->boolean('trackable')->default(true);
            $table->decimal('cash_value', 10, 2)->nullable();
            $table->integer('sort_order')->default(0);
            $table->jsonb('applicable_programs')->nullable(); // null = all programs
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->onDelete('cascade');
            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'category']);
            $table->index(['tenant_id', 'is_active']);
        });

        // ===== Plan Entitlements — line items defining what each plan covers =====
        Schema::create('plan_entitlements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('plan_id');
            $table->uuid('entitlement_type_id');

            // Quantity & limits
            $table->integer('quantity_limit')->nullable(); // null = unlimited
            $table->boolean('is_unlimited')->default(false);

            // Period
            $table->string('period_type', 20); // per_month, per_quarter, per_year, per_membership

            // Rollover
            $table->boolean('rollover_enabled')->default(false);
            $table->integer('rollover_max')->nullable();

            // Overage handling
            $table->string('overage_policy', 20)->default('notify'); // block, charge, notify, allow
            $table->decimal('overage_fee', 10, 2)->nullable();

            // Family sharing
            $table->boolean('family_shared')->default(false);

            // Value display
            $table->decimal('included_value', 10, 2)->nullable();
            $table->decimal('discount_percentage', 5, 2)->nullable();

            // Metadata
            $table->text('notes')->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->foreign('plan_id')->references('id')->on('membership_plans')->onDelete('cascade');
            $table->foreign('entitlement_type_id')->references('id')->on('entitlement_types')->onDelete('cascade');
            $table->unique(['plan_id', 'entitlement_type_id']);
        });

        // ===== Entitlement Usage — actual usage records =====
        Schema::create('entitlement_usage', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('patient_membership_id');
            $table->uuid('entitlement_type_id');
            $table->integer('quantity')->default(1);
            $table->date('period_start');
            $table->date('period_end');
            $table->string('source_type', 50)->nullable(); // appointment, encounter, prescription, lab_order, manual
            $table->uuid('source_id')->nullable();
            $table->uuid('recorded_by')->nullable();
            $table->text('notes')->nullable();
            $table->decimal('cash_value_used', 10, 2)->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->onDelete('cascade');
            $table->foreign('patient_membership_id')->references('id')->on('patient_memberships')->onDelete('cascade');
            $table->foreign('entitlement_type_id')->references('id')->on('entitlement_types')->onDelete('cascade');
            $table->foreign('recorded_by')->references('id')->on('users')->onDelete('set null');

            $table->index(['tenant_id', 'patient_membership_id', 'entitlement_type_id', 'period_start'], 'eu_lookup_idx');
            $table->index(['tenant_id', 'period_start', 'period_end']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entitlement_usage');
        Schema::dropIfExists('plan_entitlements');
        Schema::dropIfExists('entitlement_types');
    }
};
