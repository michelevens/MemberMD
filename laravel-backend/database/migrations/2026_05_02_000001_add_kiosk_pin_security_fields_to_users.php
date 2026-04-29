<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Track failed PIN attempts so we can lock the user after N
            // wrong tries instead of relying on per-IP throttling alone
            // (an attacker rotating IPs would otherwise be uncapped).
            $table->integer('pin_failed_attempts')->default(0)->after('pin');
            $table->timestamp('pin_locked_until')->nullable()->after('pin_failed_attempts');
        });

        // Pre-existing plaintext PINs need to be hashed. Bcrypt them in place.
        // PINs are typically 4-8 digits — bcrypt is slow but kiosk identify
        // is rate-limited so the cost is acceptable. We do this in chunks
        // so a large users table doesn't OOM.
        DB::table('users')
            ->whereNotNull('pin')
            ->where('pin', '!=', '')
            ->orderBy('id')
            ->chunkById(500, function ($users) {
                foreach ($users as $u) {
                    // Skip rows that already look hashed (bcrypt hashes start
                    // with $2y$ or $2a$ and are 60 chars). This makes the
                    // migration idempotent for re-runs / partial state.
                    if (is_string($u->pin) && str_starts_with($u->pin, '$2') && strlen($u->pin) === 60) {
                        continue;
                    }
                    DB::table('users')
                        ->where('id', $u->id)
                        ->update(['pin' => password_hash((string) $u->pin, PASSWORD_BCRYPT)]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['pin_failed_attempts', 'pin_locked_until']);
        });
    }
};
