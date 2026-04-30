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
        Schema::table('consent_signatures', function (Blueprint $table) {
            $table->integer('template_version')->nullable()->after('template_id');
            $table->uuid('membership_id')->nullable()->after('template_version');
            // Original migration didn't include these — needed for HIPAA/audit
            // forensics on a signed consent.
            $table->string('user_agent', 255)->nullable()->after('ip_address');
            $table->string('signature_image_url')->nullable()->after('signature_data');
            $table->softDeletes();
            $table->foreign('membership_id')
                ->references('id')->on('patient_memberships')
                ->nullOnDelete();
            $table->index(['patient_id', 'template_id', 'signed_at']);
            $table->index('membership_id');
        });
    }

    public function down(): void
    {
        Schema::table('consent_signatures', function (Blueprint $table) {
            $table->dropForeign(['membership_id']);
            $table->dropIndex(['patient_id', 'template_id', 'signed_at']);
            $table->dropIndex(['membership_id']);
            $table->dropSoftDeletes();
            $table->dropColumn([
                'template_version', 'membership_id',
                'user_agent', 'signature_image_url',
            ]);
        });
    }
};
