<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * pending_bookings.date_of_birth was created as `date` but the model
 * encrypts it (see PendingBooking::$casts → 'date_of_birth' => 'encrypted').
 * The ciphertext is a long base64 string, not a parseable date, so strict
 * pg rejects the insert with "invalid input syntax for type date".
 *
 * Local dev pg accepted the writes (older/looser version) so the bug
 * was hidden; CI's pg surfaces it. Convert to text with USING null so
 * any pre-existing rows (none expected — the row is short-lived) get
 * cleared rather than failing the migration.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('pending_bookings')) {
            return;
        }

        // PostgreSQL needs USING when changing types if existing rows
        // can't auto-cast. PendingBooking rows expire in ~30 min so
        // any in-flight rows are safe to drop.
        DB::statement("ALTER TABLE pending_bookings ALTER COLUMN date_of_birth TYPE TEXT USING date_of_birth::text");
    }

    public function down(): void
    {
        if (!Schema::hasTable('pending_bookings')) {
            return;
        }

        // No clean reverse — encrypted blobs won't fit a date column.
        // Leaving as text is the safe default.
    }
};
