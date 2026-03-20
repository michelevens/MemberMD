<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            if (!Schema::hasColumn('patients', 'employer_id')) {
                $table->uuid('employer_id')->nullable()->after('referral_source');
                $table->foreign('employer_id')->references('id')->on('employers')->nullOnDelete();
            }
            if (!Schema::hasColumn('patients', 'employer_group_number')) {
                $table->string('employer_group_number')->nullable()->after('employer_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            if (Schema::hasColumn('patients', 'employer_id')) {
                $table->dropForeign(['employer_id']);
                $table->dropColumn('employer_id');
            }
            if (Schema::hasColumn('patients', 'employer_group_number')) {
                $table->dropColumn('employer_group_number');
            }
        });
    }
};
