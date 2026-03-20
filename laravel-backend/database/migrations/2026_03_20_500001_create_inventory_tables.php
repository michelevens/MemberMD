<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('name');
            $table->string('ndc')->nullable(); // National Drug Code
            $table->string('category'); // medication, supply, vaccine, other
            $table->integer('quantity_on_hand')->default(0);
            $table->integer('reorder_point')->default(10);
            $table->decimal('unit_cost', 10, 2)->nullable();
            $table->decimal('markup_percentage', 5, 2)->default(0);
            $table->decimal('sell_price', 10, 2)->nullable();
            $table->string('lot_number')->nullable();
            $table->date('expiration_date')->nullable();
            $table->string('supplier')->nullable();
            $table->string('location')->nullable(); // storage location within practice
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_restocked_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'ndc']);
            $table->index(['tenant_id', 'name']);
        });

        Schema::create('dispense_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('inventory_item_id')->constrained('inventory_items')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('provider_id')->constrained('users')->cascadeOnDelete();
            $table->uuid('encounter_id')->nullable();
            $table->integer('quantity');
            $table->decimal('unit_cost', 10, 2);
            $table->decimal('sell_price', 10, 2);
            $table->text('notes')->nullable();
            $table->timestamp('dispensed_at');
            $table->timestamps();

            $table->foreign('encounter_id')->references('id')->on('encounters')->nullOnDelete();

            $table->index(['tenant_id', 'patient_id']);
            $table->index(['tenant_id', 'inventory_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dispense_records');
        Schema::dropIfExists('inventory_items');
    }
};
