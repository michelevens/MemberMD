<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('compliance_requirements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->nullable(); // null = system-wide
            $table->string('category', 100); // administrative, physical, technical, organizational
            $table->string('title', 255);
            $table->text('description');
            $table->string('severity', 50)->default('medium'); // critical, high, medium, low
            $table->boolean('is_required')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->onDelete('cascade');

            $table->index(['tenant_id', 'category']);
            $table->index('severity');
        });

        Schema::create('compliance_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('requirement_id');
            $table->string('status', 50)->default('non_compliant'); // compliant, partial, non_compliant, not_applicable
            $table->text('evidence')->nullable();
            $table->text('notes')->nullable();
            $table->uuid('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->date('next_review_date')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->onDelete('cascade');
            $table->foreign('requirement_id')->references('id')->on('compliance_requirements')->onDelete('cascade');
            $table->foreign('reviewed_by')->references('id')->on('users')->onDelete('set null');

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'requirement_id']);
            $table->unique(['tenant_id', 'requirement_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('compliance_records');
        Schema::dropIfExists('compliance_requirements');
    }
};
