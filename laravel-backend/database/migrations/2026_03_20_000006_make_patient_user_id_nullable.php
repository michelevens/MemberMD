<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Make user_id nullable — patients can exist without a login account
        // (staff creates patient records; patient may optionally get a portal login later)
        DB::statement('ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_user_id_foreign');
        DB::statement('ALTER TABLE patients ALTER COLUMN user_id DROP NOT NULL');
        DB::statement('ALTER TABLE patients ADD CONSTRAINT patients_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_user_id_foreign');
        DB::statement('ALTER TABLE patients ALTER COLUMN user_id SET NOT NULL');
        DB::statement('ALTER TABLE patients ADD CONSTRAINT patients_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE');
    }
};
