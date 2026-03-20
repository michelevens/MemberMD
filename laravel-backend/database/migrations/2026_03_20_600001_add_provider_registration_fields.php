<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('providers', function (Blueprint $table) {
            if (!Schema::hasColumn('providers', 'first_name')) {
                $table->string('first_name')->nullable()->after('user_id');
            }
            if (!Schema::hasColumn('providers', 'last_name')) {
                $table->string('last_name')->nullable()->after('first_name');
            }
            if (!Schema::hasColumn('providers', 'email')) {
                $table->string('email')->nullable()->after('last_name');
            }
            if (!Schema::hasColumn('providers', 'phone')) {
                $table->string('phone')->nullable()->after('email');
            }
            if (!Schema::hasColumn('providers', 'specialty')) {
                $table->string('specialty')->nullable()->after('bio');
            }
            if (!Schema::hasColumn('providers', 'status')) {
                $table->string('status')->default('active')->after('panel_status');
            }
            if (!Schema::hasColumn('providers', 'licensed_states')) {
                $table->jsonb('licensed_states')->nullable()->after('license_state');
            }
        });
    }

    public function down(): void
    {
        Schema::table('providers', function (Blueprint $table) {
            $cols = ['first_name', 'last_name', 'email', 'phone', 'specialty', 'status', 'licensed_states'];
            foreach ($cols as $col) {
                if (Schema::hasColumn('providers', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
