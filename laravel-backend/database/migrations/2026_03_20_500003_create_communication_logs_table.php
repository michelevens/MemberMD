<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('communication_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->string('channel'); // portal, sms, email, telehealth, phone, fax
            $table->enum('direction', ['inbound', 'outbound']);
            $table->string('subject')->nullable();
            $table->text('summary')->nullable();
            $table->string('related_type')->nullable(); // message, telehealth_session, appointment, referral
            $table->uuid('related_id')->nullable();
            $table->uuid('provider_id')->nullable();
            $table->timestamp('logged_at');
            $table->integer('duration_seconds')->nullable(); // for calls/telehealth
            $table->timestamps();

            $table->foreign('provider_id')->references('id')->on('users')->nullOnDelete();

            $table->index(['tenant_id', 'patient_id']);
            $table->index(['tenant_id', 'channel']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('communication_logs');
    }
};
