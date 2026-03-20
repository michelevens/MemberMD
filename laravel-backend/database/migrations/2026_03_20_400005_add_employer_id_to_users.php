<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'employer_id')) {
                $table->uuid('employer_id')->nullable()->after('stripe_customer_id');
                $table->foreign('employer_id')->references('id')->on('employers')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'employer_id')) {
                $table->dropForeign(['employer_id']);
                $table->dropColumn('employer_id');
            }
        });
    }
};
