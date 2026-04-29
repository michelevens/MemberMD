<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Widen PHI columns to TEXT so the encrypted ciphertext fits.
 *
 * Laravel's 'encrypted' cast (AES-256-CBC + HMAC + base64) produces ~80-200
 * chars even for short values. Existing string(2) / string(10) / string(255)
 * columns can't hold encrypted versions of `state`, `zip`, longer addresses,
 * etc. SQLite is permissive (VARCHAR is alias for TEXT) so test runs against
 * SQLite were fine; PostgreSQL on Railway would error on the next write.
 *
 * This is a backwards-compatible widening — existing plaintext data is
 * untouched. The data-encryption migration runs in a separate step
 * (2026_05_03_000002).
 *
 * The actual ALTER on PostgreSQL acquires a brief metadata lock per column,
 * not a table rewrite, since we're widening varchar to text without copying.
 */
return new class extends Migration {
    public function up(): void
    {
        // The DEFAULT 'English' on patients.preferred_language collides with
        // the encrypted cast: a row created without an explicit value stores
        // plaintext 'English', and Eloquent then tries to decrypt it on read.
        // Drop the default in BOTH databases — app-level defaults should
        // supply this if needed.
        if (DB::getDriverName() === 'sqlite') {
            // SQLite can't ALTER COLUMN DROP DEFAULT directly; the default is
            // applied per-row at insert. We can't easily strip it without
            // table rebuild, so for SQLite we skip — but the test runner
            // CAN avoid the conflict by always passing an explicit value.
            // The encryption test suite already does this via makePatient().
            // Production runs on PostgreSQL where we DO drop the default.
            return;
        }

        DB::statement("ALTER TABLE patients ALTER COLUMN preferred_language DROP DEFAULT");

        $patientsToText = [
            'gender', 'phone', 'email', 'address', 'city', 'state', 'zip',
            'preferred_language', 'marital_status', 'employment_status',
            'primary_care_physician', 'pcp_phone', 'referring_provider',
            'pharmacy_name', 'pharmacy_address', 'pharmacy_phone',
            'employer_group_number',
        ];
        foreach ($patientsToText as $col) {
            DB::statement("ALTER TABLE patients ALTER COLUMN {$col} TYPE TEXT");
        }

        // Encounters — clinical free-text already TEXT; widen anything narrow
        // we plan to encrypt. Most are already TEXT — no-op for them.
        $encountersToText = [
            'chief_complaint',
        ];
        foreach ($encountersToText as $col) {
            DB::statement("ALTER TABLE encounters ALTER COLUMN {$col} TYPE TEXT");
        }

        // Prescriptions
        $prescriptionsToText = [
            'medication_name', 'dosage', 'frequency', 'pharmacy_name',
            'pharmacy_phone', 'pharmacy_address', 'pharmacy_fax', 'dea_number',
        ];
        foreach ($prescriptionsToText as $col) {
            DB::statement("ALTER TABLE prescriptions ALTER COLUMN {$col} TYPE TEXT");
        }

        // Lab orders — `notes`, `special_instructions`, `panels` may be narrow
        // string columns; widen to TEXT for encryption headroom.
        $labOrdersToText = ['special_instructions'];
        foreach ($labOrdersToText as $col) {
            DB::statement("ALTER TABLE lab_orders ALTER COLUMN {$col} TYPE TEXT");
        }

        // Documents
        $documentsToText = ['name', 'original_name', 'description'];
        foreach ($documentsToText as $col) {
            DB::statement("ALTER TABLE documents ALTER COLUMN {$col} TYPE TEXT");
        }
    }

    public function down(): void
    {
        // Down-migration is intentionally a no-op. Once PHI is encrypted into
        // these columns, narrowing them back would truncate ciphertext and
        // permanently lose data. To roll back, restore from a backup taken
        // before the encryption migration ran.
    }
};
