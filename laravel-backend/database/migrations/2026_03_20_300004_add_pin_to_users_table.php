<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The users table already has a `pin` column from the initial migration.
     * This migration is a no-op safety check.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'pin')) {
                $table->string('pin')->nullable()->after('mfa_secret');
            }
        });
    }

    public function down(): void
    {
        // pin column was created in the initial migration; do not drop here.
    }
};
