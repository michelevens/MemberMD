<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('kiosk_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('patient_id');
            // Hashed token presented by the kiosk on subsequent requests.
            // We never store the raw token — only its sha256 hash, like
            // Sanctum's PersonalAccessToken pattern.
            $table->string('token_hash', 64)->unique();
            $table->string('identification_method', 16); // pin | name_dob
            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
            $table->foreign('patient_id')->references('id')->on('patients')->cascadeOnDelete();
            $table->index(['tenant_id', 'patient_id']);
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kiosk_sessions');
    }
};
