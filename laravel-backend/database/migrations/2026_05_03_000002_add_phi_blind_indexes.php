<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add blind-index columns for PHI fields that need to remain searchable
 * after encryption.
 *
 * Pattern: store sha256(strtolower(trim(value))) in a separate column.
 *  - Exact-match equality: WHERE email_blind_index = sha256(lower($q))
 *  - Substring search: NOT possible — caller must accept exact match only
 *
 * After encryption, OperatorMemberController.search switches from
 *   WHERE email LIKE '%foo@bar%'   (returns 0 rows on ciphertext)
 * to
 *   WHERE email_blind_index = sha256(lower('foo@bar.com'))   (exact match)
 *
 * The 64-char string column holds a hex sha256 digest; index it for O(log n)
 * lookups even on tens of millions of rows.
 *
 * Backfill of existing data happens in 2026_05_03_000003_encrypt_existing_phi.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->string('email_blind_index', 64)->nullable()->after('email');
            $table->string('phone_blind_index', 64)->nullable()->after('phone');
            $table->index('email_blind_index');
            $table->index('phone_blind_index');
        });
    }

    public function down(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->dropIndex(['email_blind_index']);
            $table->dropIndex(['phone_blind_index']);
            $table->dropColumn(['email_blind_index', 'phone_blind_index']);
        });
    }
};
