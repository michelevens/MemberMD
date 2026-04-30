<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Consent signature versioning + membership link.
 *
 * Adds two fields to consent_signatures:
 *   - template_version: snapshots the version of the consent text the
 *     patient saw at signing time. Without this, edits to a template
 *     retroactively rewrite history.
 *   - membership_id: links the consent to a specific membership so audits
 *     can answer "which version of the HIPAA consent applied to this
 *     subscription?". Nullable for legacy consents and consents that
 *     aren't membership-scoped (one-off ROIs, etc.).
 *
 * Also adds an index on (patient_id, template_id, signed_at) for the
 * most common audit query: "show me everything this patient signed,
 * newest first."
 */
return new class extends Migration {
    public function up(): void
    {
        // Idempotent: the original 2026_03_18_000001 migration ALREADY
        // includes some of the columns this migration originally tried to
        // add (user_agent, signature_image_url, soft deletes, depending
        // on the deployed schema). Production environments that ran the
        // original schema have those; fresh dev DBs reseeded from the
        // current schema may not. Each addition is guarded by hasColumn
        // so the migration is safe to run on any state.
        Schema::table('consent_signatures', function (Blueprint $table) {
            if (!Schema::hasColumn('consent_signatures', 'template_version')) {
                $table->integer('template_version')->nullable()->after('template_id');
            }
            if (!Schema::hasColumn('consent_signatures', 'membership_id')) {
                $table->uuid('membership_id')->nullable()->after('template_version');
            }
            if (!Schema::hasColumn('consent_signatures', 'user_agent')) {
                $table->string('user_agent', 255)->nullable()->after('ip_address');
            }
            if (!Schema::hasColumn('consent_signatures', 'signature_image_url')) {
                $table->string('signature_image_url')->nullable()->after('signature_data');
            }
            if (!Schema::hasColumn('consent_signatures', 'deleted_at')) {
                $table->softDeletes();
            }
        });

        // Foreign key + indexes outside the column block so we can wrap
        // each in its own try/catch — Postgres will throw if the
        // constraint already exists, and we want each guard independent.
        try {
            Schema::table('consent_signatures', function (Blueprint $table) {
                $table->foreign('membership_id')
                    ->references('id')->on('patient_memberships')
                    ->nullOnDelete();
            });
        } catch (\Throwable) { /* already exists */ }

        try {
            Schema::table('consent_signatures', function (Blueprint $table) {
                $table->index(['patient_id', 'template_id', 'signed_at']);
            });
        } catch (\Throwable) { /* already exists */ }

        try {
            Schema::table('consent_signatures', function (Blueprint $table) {
                $table->index('membership_id');
            });
        } catch (\Throwable) { /* already exists */ }
    }

    public function down(): void
    {
        Schema::table('consent_signatures', function (Blueprint $table) {
            try { $table->dropForeign(['membership_id']); } catch (\Throwable) {}
            try { $table->dropIndex(['patient_id', 'template_id', 'signed_at']); } catch (\Throwable) {}
            try { $table->dropIndex(['membership_id']); } catch (\Throwable) {}
            try { $table->dropSoftDeletes(); } catch (\Throwable) {}
            $cols = ['template_version', 'membership_id', 'user_agent', 'signature_image_url'];
            $present = array_filter($cols, fn ($c) => Schema::hasColumn('consent_signatures', $c));
            if ($present) $table->dropColumn($present);
        });
    }
};
