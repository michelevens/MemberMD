<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * One-time data migration: encrypt existing plaintext PHI in place and
 * populate blind-index columns where applicable.
 *
 * Design constraints:
 *  - **Idempotent**: skip rows where the field already looks like Laravel
 *    ciphertext (Laravel's encrypter emits a base64-JSON envelope that
 *    always starts with `eyJ`). This makes the migration safe to re-run
 *    after a partial failure.
 *  - **Chunked**: 500-row batches per table — bounded memory, bounded
 *    transaction size.
 *  - **Per-chunk transactional**: a single bad row inside a chunk rolls
 *    back only that chunk. Subsequent chunks proceed.
 *  - **Failure-tolerant logging**: rows that fail encryption (e.g.,
 *    invalid UTF-8) are logged and skipped, not retried in a tight loop.
 *
 * Rollback: there is no down-migration. To revert, restore from a backup
 * taken before this migration ran.
 *
 * SOC 2 / HIPAA: addresses audit finding B2 — Patient demographics +
 * Encounter SOAP notes + Prescription clinical fields previously stored
 * in plaintext.
 */
return new class extends Migration {
    /** @var int batch size for chunked iteration */
    private const CHUNK = 500;

    /**
     * Fields encrypted as scalars (string) on Patient. Excludes
     * preferred_language because the column has a `DEFAULT 'English'`
     * that would collide with the encrypted cast (see Patient::$casts).
     */
    private const PATIENT_SCALARS = [
        'gender', 'phone', 'email', 'address', 'city', 'state', 'zip',
        'marital_status', 'employment_status',
        'primary_care_physician', 'pcp_phone', 'referring_provider',
        'pharmacy_name', 'pharmacy_address', 'pharmacy_phone',
        'employer_group_number',
    ];

    /** Fields encrypted as scalars on Encounter. */
    private const ENCOUNTER_SCALARS = [
        'chief_complaint', 'subjective', 'objective', 'assessment', 'plan',
        'discharge_instructions',
    ];

    /** Fields encrypted as JSON arrays on Encounter. */
    private const ENCOUNTER_ARRAYS = [
        'diagnoses', 'vitals', 'labs_ordered', 'screening_scores',
    ];

    private const PRESCRIPTION_SCALARS = [
        'medication_name', 'dosage', 'frequency', 'pharmacy_name',
        'pharmacy_phone', 'pharmacy_address', 'pharmacy_fax',
        'dea_number', 'notes',
    ];

    private const LAB_ORDER_SCALARS = ['special_instructions', 'notes'];

    private const LAB_ORDER_ARRAYS = ['panels', 'diagnosis_codes'];

    private const DOCUMENT_SCALARS = ['name', 'original_name', 'description'];

    private const MESSAGE_SCALARS = []; // Message.body is already encrypted via cast pre-existing

    public function up(): void
    {
        $this->encryptTableScalars('patients', self::PATIENT_SCALARS);
        $this->populatePatientBlindIndexes();

        if (DB::getSchemaBuilder()->hasTable('encounters')) {
            $this->encryptTableScalars('encounters', self::ENCOUNTER_SCALARS);
            $this->encryptTableArrays('encounters', self::ENCOUNTER_ARRAYS);
        }

        if (DB::getSchemaBuilder()->hasTable('prescriptions')) {
            $this->encryptTableScalars('prescriptions', self::PRESCRIPTION_SCALARS);
        }

        if (DB::getSchemaBuilder()->hasTable('lab_orders')) {
            $this->encryptTableScalars('lab_orders', self::LAB_ORDER_SCALARS);
            $this->encryptTableArrays('lab_orders', self::LAB_ORDER_ARRAYS);
        }

        if (DB::getSchemaBuilder()->hasTable('documents')) {
            $this->encryptTableScalars('documents', self::DOCUMENT_SCALARS);
        }
    }

    public function down(): void
    {
        // Intentional no-op. Reverting requires restore from backup.
    }

    /**
     * Iterate $table in CHUNK-sized batches, encrypting each scalar column
     * in place. Skips rows where the field is null, empty, or already
     * encrypted (Laravel ciphertext begins with `eyJ`).
     */
    private function encryptTableScalars(string $table, array $columns): void
    {
        if (empty($columns)) return;
        if (!DB::getSchemaBuilder()->hasTable($table)) return;

        // Filter to columns that actually exist on this DB schema (defends
        // against running on partial-state DBs).
        $existing = collect($columns)->filter(
            fn ($c) => DB::getSchemaBuilder()->hasColumn($table, $c)
        )->values()->all();
        if (empty($existing)) return;

        DB::table($table)
            ->select(array_merge(['id'], $existing))
            ->orderBy('id')
            ->chunk(self::CHUNK, function ($rows) use ($table, $existing) {
                DB::transaction(function () use ($table, $existing, $rows) {
                    foreach ($rows as $row) {
                        $update = [];
                        foreach ($existing as $col) {
                            $val = $row->{$col} ?? null;
                            if ($val === null || $val === '') continue;
                            if ($this->looksEncrypted($val)) continue;
                            try {
                                $update[$col] = Crypt::encryptString((string) $val);
                            } catch (\Throwable $e) {
                                Log::warning("encrypt skip {$table}.{$col} id={$row->id}: {$e->getMessage()}");
                            }
                        }
                        if (!empty($update)) {
                            DB::table($table)->where('id', $row->id)->update($update);
                        }
                    }
                });
            });
    }

    /**
     * Encrypt JSON-array columns. Existing values may be:
     *   - null (skip)
     *   - JSON string from jsonb column → decode, encrypt(json_encode(...))
     *   - already-encrypted ciphertext → skip
     */
    private function encryptTableArrays(string $table, array $columns): void
    {
        if (empty($columns)) return;
        if (!DB::getSchemaBuilder()->hasTable($table)) return;

        $existing = collect($columns)->filter(
            fn ($c) => DB::getSchemaBuilder()->hasColumn($table, $c)
        )->values()->all();
        if (empty($existing)) return;

        DB::table($table)
            ->select(array_merge(['id'], $existing))
            ->orderBy('id')
            ->chunk(self::CHUNK, function ($rows) use ($table, $existing) {
                DB::transaction(function () use ($table, $existing, $rows) {
                    foreach ($rows as $row) {
                        $update = [];
                        foreach ($existing as $col) {
                            $raw = $row->{$col} ?? null;
                            if ($raw === null || $raw === '') continue;
                            if (is_string($raw) && $this->looksEncrypted($raw)) continue;

                            // jsonb columns return arrays already on PG, strings on MySQL/SQLite
                            $decoded = is_string($raw) ? json_decode($raw, true) : $raw;
                            if ($decoded === null && is_string($raw) && trim($raw) !== '') {
                                Log::warning("encrypt skip non-json {$table}.{$col} id={$row->id}");
                                continue;
                            }
                            try {
                                $update[$col] = Crypt::encryptString(json_encode($decoded));
                            } catch (\Throwable $e) {
                                Log::warning("encrypt-array skip {$table}.{$col} id={$row->id}: {$e->getMessage()}");
                            }
                        }
                        if (!empty($update)) {
                            DB::table($table)->where('id', $row->id)->update($update);
                        }
                    }
                });
            });
    }

    /**
     * Populate email_blind_index + phone_blind_index for existing patients.
     * MUST run BEFORE the email/phone columns are encrypted, OR after — we
     * detect the case-by-case by attempting decrypt; if decrypt succeeds use
     * decrypted value, else use raw. Idempotent: skips rows that already
     * have a blind index populated.
     */
    private function populatePatientBlindIndexes(): void
    {
        if (!DB::getSchemaBuilder()->hasTable('patients')) return;
        if (!DB::getSchemaBuilder()->hasColumn('patients', 'email_blind_index')) return;

        DB::table('patients')
            ->select(['id', 'email', 'phone', 'email_blind_index', 'phone_blind_index'])
            ->orderBy('id')
            ->chunk(self::CHUNK, function ($rows) {
                DB::transaction(function () use ($rows) {
                    foreach ($rows as $row) {
                        $update = [];
                        if (empty($row->email_blind_index) && !empty($row->email)) {
                            $val = $this->maybeDecrypt((string) $row->email);
                            $update['email_blind_index'] = self::blindHash($val);
                        }
                        if (empty($row->phone_blind_index) && !empty($row->phone)) {
                            $val = $this->maybeDecrypt((string) $row->phone);
                            $update['phone_blind_index'] = self::blindHash($val);
                        }
                        if (!empty($update)) {
                            DB::table('patients')->where('id', $row->id)->update($update);
                        }
                    }
                });
            });
    }

    public static function blindHash(?string $value): ?string
    {
        if ($value === null) return null;
        $normalized = strtolower(trim($value));
        if ($normalized === '') return null;
        return hash('sha256', $normalized);
    }

    private function looksEncrypted(mixed $value): bool
    {
        // Laravel 12 emits base64-encoded JSON beginning with "eyJ" (the
        // standard base64 encoding of `{"`)
        return is_string($value) && str_starts_with($value, 'eyJ') && strlen($value) > 100;
    }

    private function maybeDecrypt(string $value): string
    {
        if (!$this->looksEncrypted($value)) return $value;
        try {
            return Crypt::decryptString($value);
        } catch (\Throwable) {
            return $value;
        }
    }
};
