<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('provider_credentials', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('provider_id');
            $table->string('type', 100); // medical_license, dea, board_cert, malpractice, cpr, npi
            $table->string('name', 255);
            $table->string('credential_number', 100)->nullable();
            $table->string('issuer', 255)->nullable();
            $table->date('issued_date')->nullable();
            $table->date('expiration_date')->nullable();
            $table->string('status', 50)->default('active'); // active, expired, expiring_soon, pending, revoked
            $table->string('document_url', 500)->nullable();
            $table->text('notes')->nullable();
            $table->uuid('verified_by')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('reminder_sent_at')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->onDelete('cascade');
            $table->foreign('provider_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('verified_by')->references('id')->on('users')->onDelete('set null');

            $table->index(['tenant_id', 'provider_id']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'expiration_date']);
            $table->index(['tenant_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('provider_credentials');
    }
};
