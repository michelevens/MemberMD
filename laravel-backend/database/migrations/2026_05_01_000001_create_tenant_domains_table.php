<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('tenant_domains', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('domain', 255)->unique();
            $table->string('verification_token', 64);
            $table->string('verification_method', 16)->default('txt'); // txt | manual
            $table->timestamp('verified_at')->nullable();
            $table->string('ssl_status', 16)->default('pending'); // pending | active | failed
            $table->boolean('is_primary')->default(false);
            $table->boolean('is_active')->default(true);
            $table->json('settings')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
            $table->index(['tenant_id', 'is_active']);
            $table->index('verified_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_domains');
    }
};
