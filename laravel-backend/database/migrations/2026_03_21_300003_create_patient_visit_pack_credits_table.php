<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patient_visit_pack_credits', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('visit_pack_id')->constrained('visit_packs')->cascadeOnDelete();
            $table->foreignUuid('entitlement_type_id')->constrained('entitlement_types')->cascadeOnDelete();
            $table->integer('credits_total');
            $table->integer('credits_remaining');
            $table->timestamp('purchased_at');
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'patient_id', 'entitlement_type_id'], 'pvpc_tenant_patient_type_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('patient_visit_pack_credits');
    }
};
