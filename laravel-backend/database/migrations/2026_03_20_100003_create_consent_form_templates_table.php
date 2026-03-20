<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consent_form_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->nullable();
            $table->string('title');
            $table->text('description')->nullable();
            $table->text('body');
            $table->string('category'); // general, telehealth, treatment, hipaa, financial
            $table->boolean('is_active')->default(true);
            $table->boolean('requires_witness')->default(false);
            $table->integer('version')->default(1);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->nullOnDelete();
            $table->index(['tenant_id', 'category', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consent_form_templates');
    }
};
