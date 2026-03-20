<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('referrals', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('referring_provider_id')->constrained('users')->cascadeOnDelete();
            $table->string('referred_to_name');
            $table->string('referred_to_specialty')->nullable();
            $table->string('referred_to_phone')->nullable();
            $table->string('referred_to_fax')->nullable();
            $table->string('referred_to_email')->nullable();
            $table->text('referred_to_address')->nullable();
            $table->uuid('encounter_id')->nullable();
            $table->text('reason');
            $table->string('urgency'); // routine, urgent, emergent
            $table->text('clinical_notes')->nullable();
            $table->string('status')->default('draft'); // draft, sent, acknowledged, scheduled, completed, cancelled
            $table->timestamp('sent_at')->nullable();
            $table->string('sent_method')->nullable(); // fax, email, portal
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->text('completion_notes')->nullable();
            $table->date('follow_up_date')->nullable();
            $table->jsonb('document_ids')->nullable();
            $table->timestamps();

            $table->foreign('encounter_id')->references('id')->on('encounters')->nullOnDelete();

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'patient_id']);
            $table->index(['tenant_id', 'referring_provider_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('referrals');
    }
};
