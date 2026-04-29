<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('operator_users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('operator_id');
            $table->uuid('user_id');
            // owner — full operator control + can manage other operator users
            // admin — read all tenants, write operator config + master templates
            // viewer — read-only across operator scope
            $table->string('operator_role', 16);
            $table->timestamps();

            $table->foreign('operator_id')->references('id')->on('operators')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['operator_id', 'user_id']);
            $table->index('operator_role');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('operator_users');
    }
};
