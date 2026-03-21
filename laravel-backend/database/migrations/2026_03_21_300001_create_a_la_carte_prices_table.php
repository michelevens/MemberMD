<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('a_la_carte_prices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('entitlement_type_id')->constrained('entitlement_types')->cascadeOnDelete();
            $table->decimal('price', 10, 2);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'entitlement_type_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('a_la_carte_prices');
    }
};
