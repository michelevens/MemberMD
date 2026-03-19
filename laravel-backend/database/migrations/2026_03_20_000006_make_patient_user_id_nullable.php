<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Make user_id nullable — patients can exist without a login account
        // (staff creates patient records; patient may optionally get a portal login later)
        Schema::table('patients', function (Blueprint $table) {
            $table->uuid('user_id')->nullable()->change();
        });

        // Drop the existing FK constraint and re-add as nullable
        try {
            DB::statement('ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_user_id_foreign');
            DB::statement('ALTER TABLE patients ADD CONSTRAINT patients_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
        } catch (\Throwable $e) {
            // Constraint may not exist or already be correct
        }
    }

    public function down(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->uuid('user_id')->nullable(false)->change();
        });
    }
};
