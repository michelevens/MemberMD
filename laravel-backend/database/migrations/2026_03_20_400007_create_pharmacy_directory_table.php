<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pharmacy_directory', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('ncpdp_id')->nullable(); // National Council for Prescription Drug Programs ID
            $table->string('npi')->nullable();
            $table->string('name');
            $table->text('address')->nullable();
            $table->string('city')->nullable();
            $table->string('state')->nullable();
            $table->string('zip')->nullable();
            $table->string('phone')->nullable();
            $table->string('fax')->nullable();
            $table->boolean('is_24_hour')->default(false);
            $table->boolean('accepts_eprescribe')->default(true);
            $table->string('chain')->nullable(); // CVS, Walgreens, etc.
            $table->timestamps();

            $table->index('ncpdp_id');
            $table->index('name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pharmacy_directory');
    }
};
