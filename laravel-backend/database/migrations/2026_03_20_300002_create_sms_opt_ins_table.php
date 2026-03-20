<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('sms_opt_ins')) {
            Schema::create('sms_opt_ins', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
                $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
                $table->string('phone_number');
                $table->boolean('opted_in')->default(true);
                $table->timestamp('opted_in_at');
                $table->timestamp('opted_out_at')->nullable();
                $table->timestamps();

                $table->unique(['tenant_id', 'phone_number']);
                $table->index(['patient_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_opt_ins');
    }
};
