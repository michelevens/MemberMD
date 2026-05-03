<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-practice locale preference. Drives platform-billing email language
 * (English by default, Spanish when set to 'es'). Future: drives the
 * practice portal UI language too.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('practices', 'locale')) {
            Schema::table('practices', function (Blueprint $t) {
                $t->string('locale', 8)->default('en')->after('timezone');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('practices', 'locale')) {
            Schema::table('practices', function (Blueprint $t) {
                $t->dropColumn('locale');
            });
        }
    }
};
