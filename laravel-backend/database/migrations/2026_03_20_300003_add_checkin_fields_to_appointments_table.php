<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            if (!Schema::hasColumn('appointments', 'check_in_method')) {
                $table->string('check_in_method')->nullable()->after('checked_in_at'); // pin, qr, name_dob
            }
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            if (Schema::hasColumn('appointments', 'check_in_method')) {
                $table->dropColumn('check_in_method');
            }
        });
    }
};
