<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * One-time backfill: redact decrypted PHI from audit_logs.changes that
 * leaked between commit 4 (PHI encryption rollout) and the
 * Auditable-trait redaction fix.
 *
 * Background: the Auditable trait used getDirty() which returns
 * already-decrypted values for `encrypted` cast columns. Every Patient
 * / Encounter / Prescription / LabOrder / Document update during that
 * window wrote plaintext PHI into audit_logs.changes — defeating the
 * encryption-at-rest goal for anyone with audit-log read access.
 *
 * This migration walks every audit_logs row, looks up which columns on
 * its `resource` type were/are encrypted, and rewrites those entries
 * to {old: '[redacted]', new: '[redacted]'}. Field name STAYS so the
 * audit trail still records THAT a field changed.
 *
 * Idempotent: a row whose changes are already fully redacted produces
 * the same output and the UPDATE is skipped if no fields changed.
 *
 * Bypasses the AuditLog model's Immutable trait by going through
 * DB::table() directly. This is the one and only sanctioned mutation
 * of audit_logs — a tightly-scoped, audited cleanup of a known leak.
 */
return new class extends Migration {
    /** Per-resource list of column names that have encrypted casts. */
    private const ENCRYPTED_COLUMNS = [
        'Patient' => [
            'gender', 'phone', 'email', 'address', 'city', 'state', 'zip',
            'marital_status', 'employment_status',
            'primary_care_physician', 'pcp_phone', 'referring_provider',
            'pharmacy_name', 'pharmacy_address', 'pharmacy_phone',
            'employer_group_number',
            'emergency_contacts', 'primary_diagnoses', 'allergies', 'medications',
            'insurance_primary', 'insurance_secondary',
            'ssn_encrypted', 'medicaid_number_encrypted', 'medicare_number_encrypted',
        ],
        'Encounter' => [
            'chief_complaint', 'subjective', 'objective', 'assessment', 'plan',
            'diagnoses', 'vitals', 'labs_ordered', 'screening_scores',
        ],
        'Prescription' => [
            'medication_name', 'dosage', 'frequency',
            'pharmacy_name', 'pharmacy_phone', 'notes',
        ],
        'LabOrder' => [
            'special_instructions', 'notes', 'panels', 'diagnosis_codes',
        ],
        'Document' => [
            'name', 'original_name', 'description',
        ],
    ];

    public function up(): void
    {
        if (!Schema::hasTable('audit_logs')) return;

        $totalScanned = 0;
        $totalRedacted = 0;

        // Chunk by id to bound memory. Order doesn't matter for redaction.
        DB::table('audit_logs')
            ->select(['id', 'resource', 'changes'])
            ->whereNotNull('changes')
            ->orderBy('id')
            ->chunk(500, function ($rows) use (&$totalScanned, &$totalRedacted) {
                foreach ($rows as $row) {
                    $totalScanned++;

                    $resource = (string) $row->resource;
                    $encryptedCols = self::ENCRYPTED_COLUMNS[$resource] ?? null;
                    if (!$encryptedCols) continue;

                    // changes is jsonb on PG → comes back as string; decode.
                    $changes = is_string($row->changes)
                        ? json_decode($row->changes, true)
                        : $row->changes;
                    if (!is_array($changes)) continue;

                    $modified = false;
                    foreach ($encryptedCols as $col) {
                        if (!isset($changes[$col]) || !is_array($changes[$col])) continue;
                        // Skip rows that were already redacted (idempotent).
                        if (($changes[$col]['old'] ?? null) === '[redacted]'
                            && ($changes[$col]['new'] ?? null) === '[redacted]') {
                            continue;
                        }
                        $changes[$col] = ['old' => '[redacted]', 'new' => '[redacted]'];
                        $modified = true;
                    }

                    if ($modified) {
                        DB::table('audit_logs')
                            ->where('id', $row->id)
                            ->update(['changes' => json_encode($changes)]);
                        $totalRedacted++;
                    }
                }
            });

        Log::info('PHI redaction sweep over audit_logs.changes complete', [
            'scanned' => $totalScanned,
            'redacted' => $totalRedacted,
        ]);
    }

    public function down(): void
    {
        // No-op. There is no way to recover the original plaintext
        // values; the migration is destructive by design (that IS the
        // privacy fix). To revert, restore audit_logs from a backup
        // taken before the migration ran — but doing so re-introduces
        // the PHI leak.
    }
};
