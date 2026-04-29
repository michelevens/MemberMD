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
 * Filter every column through Schema::hasColumn first — some columns
 * appear in model fillable arrays but were never created by any
 * migration (e.g., prescriptions.pharmacy_address / pharmacy_fax /
 * dea_number). Skipping them is safe and lets this migration succeed
 * on environments with partial schemas.
 */
return new class extends Migration {
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            // SQLite is permissively typed; no widening needed. Defaults
            // can't easily be stripped without a table rebuild, so the
            // test suite uses makePatient() helpers that pass explicit
            // values for every encrypted column.
            return;
        }

        // Drop the DEFAULT 'English' on patients.preferred_language —
        // the literal default would collide with the encrypted cast.
        // (preferred_language ended up staying plaintext in the model
        // anyway, so this is belt-and-suspenders.)
        if (Schema::hasColumn('patients', 'preferred_language')) {
            DB::statement("ALTER TABLE patients ALTER COLUMN preferred_language DROP DEFAULT");
        }

        $this->widen('patients', [
            'gender', 'phone', 'email', 'address', 'city', 'state', 'zip',
            'preferred_language', 'marital_status', 'employment_status',
            'primary_care_physician', 'pcp_phone', 'referring_provider',
            'pharmacy_name', 'pharmacy_address', 'pharmacy_phone',
            'employer_group_number',
        ]);

        $this->widen('encounters', ['chief_complaint']);

        $this->widen('prescriptions', [
            'medication_name', 'dosage', 'frequency', 'pharmacy_name',
            'pharmacy_phone', 'pharmacy_address', 'pharmacy_fax', 'dea_number',
        ]);

        $this->widen('lab_orders', ['special_instructions']);

        $this->widen('documents', ['name', 'original_name', 'description']);
    }

    public function down(): void
    {
        // Down-migration is intentionally a no-op. Once PHI is encrypted into
        // these columns, narrowing them back would truncate ciphertext and
        // permanently lose data. To roll back, restore from a backup taken
        // before the encryption migration ran.
    }

    /**
     * ALTER each column to TEXT, but only if the table and column actually
     * exist on this database. Lets the migration succeed on schemas where
     * some "fillable" columns were never created.
     */
    private function widen(string $table, array $columns): void
    {
        if (!Schema::hasTable($table)) return;
        foreach ($columns as $col) {
            if (!Schema::hasColumn($table, $col)) continue;
            DB::statement("ALTER TABLE {$table} ALTER COLUMN {$col} TYPE TEXT");
        }
    }
};
