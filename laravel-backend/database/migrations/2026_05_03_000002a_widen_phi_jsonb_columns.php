<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Widen jsonb PHI columns to TEXT so encrypted ciphertext can be stored.
 *
 * The original widen migration (000001) only handled scalar columns. PG
 * jsonb refuses any value that isn't valid JSON — and Laravel's encrypted
 * cast emits a base64 string (starts with `eyJ`) that, while it begins
 * with `{` after base64-decode, is not valid JSON as written. The
 * encryption migration (000003) hit this on lab_orders.panels and
 * crashed the deploy.
 *
 * Fix: change the column type from jsonb to TEXT for every column that
 * carries an `encrypted:array` cast in the model. After this migration
 * runs, 000003 can re-run successfully. Any pre-existing JSON data in
 * these columns survives — PG silently casts jsonb -> text by
 * serializing the value.
 *
 * Ordering: this migration MUST run before 000003. Filename uses
 * `000002a` so it sorts between 000002 and 000003.
 */
return new class extends Migration {
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        $this->widen('patients', [
            'emergency_contacts', 'primary_diagnoses', 'allergies', 'medications',
            'insurance_primary', 'insurance_secondary',
        ]);

        $this->widen('encounters', [
            'diagnoses', 'vitals', 'labs_ordered', 'screening_scores',
        ]);

        $this->widen('lab_orders', [
            'panels', 'diagnosis_codes',
        ]);
    }

    public function down(): void
    {
        // No-op. Once ciphertext lives in these columns, casting back to
        // jsonb would fail (ciphertext is not valid JSON).
    }

    private function widen(string $table, array $columns): void
    {
        if (!Schema::hasTable($table)) return;
        foreach ($columns as $col) {
            if (!Schema::hasColumn($table, $col)) continue;
            // USING clause needed because PG can't auto-cast jsonb->text
            // for some PG versions. Explicit cast is always safe.
            DB::statement("ALTER TABLE {$table} ALTER COLUMN {$col} TYPE TEXT USING {$col}::text");
        }
    }
};
