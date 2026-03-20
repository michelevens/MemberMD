<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('name');
            $table->string('legal_name')->nullable();
            $table->string('contact_name');
            $table->string('contact_email');
            $table->string('contact_phone')->nullable();
            $table->text('address')->nullable();
            $table->string('city')->nullable();
            $table->string('state')->nullable();
            $table->string('zip')->nullable();
            $table->integer('employee_count_cap')->nullable();
            $table->string('status')->default('pending'); // active, inactive, pending
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'name']);
        });

        Schema::create('employer_contracts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('employer_id')->constrained('employers')->cascadeOnDelete();
            $table->foreignUuid('membership_plan_id')->constrained('membership_plans')->cascadeOnDelete();
            $table->decimal('pepm_rate', 10, 2);
            $table->date('effective_date');
            $table->date('expiration_date')->nullable();
            $table->boolean('auto_renew')->default(true);
            $table->integer('payment_terms_days')->default(30);
            $table->string('status')->default('draft'); // draft, active, expired, cancelled
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'employer_id']);
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('employer_invoices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('employer_id')->constrained('employers')->cascadeOnDelete();
            $table->foreignUuid('contract_id')->constrained('employer_contracts')->cascadeOnDelete();
            $table->string('invoice_number');
            $table->date('period_start');
            $table->date('period_end');
            $table->integer('enrolled_count');
            $table->decimal('pepm_rate', 10, 2);
            $table->decimal('subtotal', 10, 2);
            $table->decimal('adjustments', 10, 2)->default(0);
            $table->decimal('total', 10, 2);
            $table->string('status')->default('draft'); // draft, sent, paid, overdue, void
            $table->date('due_date');
            $table->timestamp('paid_at')->nullable();
            $table->string('payment_method')->nullable();
            $table->string('payment_reference')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'employer_id']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'due_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employer_invoices');
        Schema::dropIfExists('employer_contracts');
        Schema::dropIfExists('employers');
    }
};
