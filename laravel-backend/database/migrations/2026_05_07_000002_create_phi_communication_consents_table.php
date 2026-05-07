<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * phi_communication_consents — per-patient HIPAA waiver granting the
 * practice permission to send unencrypted electronic communications
 * (email / SMS) that may contain PHI (visit type, provider name,
 * appointment date, billing line items).
 *
 * Patients without a granted consent here will NOT receive notifications
 * flagged as PHI-bearing in NotificationRegistry. Non-PHI emails (e.g.
 * password reset, account creation) ignore this gate.
 *
 * Granted via three paths, all tracked:
 *   - patient self-serves through the portal (granted_by_method='self')
 *   - practice records consent collected on paper (granted_by_method='practice_admin')
 *   - patient signed a SignatureRequest containing the ePHI clause
 *     (granted_by_method='signature_request' with reference to the
 *     consent_signature row)
 *
 * Revoked via update — granted_at is nulled and revoked_at stamped.
 * History is preserved via the auditable trait + migration audit on
 * every change.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('phi_communication_consents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();

            // Null = not yet granted. We keep the row so revocation
            // can be tracked without losing the original grant timestamp.
            $table->timestamp('granted_at')->nullable();
            $table->timestamp('revoked_at')->nullable();

            // 'self' | 'practice_admin' | 'signature_request' | 'imported'
            $table->string('granted_by_method', 32)->nullable();
            // Foreign-keyless link to consent_signatures row when
            // the consent came via a signed e-form. String to avoid
            // a hard FK that complicates teardown of test data.
            $table->string('granted_by_reference')->nullable();

            // Stamp who in the practice recorded the consent (when
            // method=practice_admin); null otherwise.
            $table->foreignUuid('granted_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->unique(['tenant_id', 'patient_id']);
            $table->index(['tenant_id', 'granted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('phi_communication_consents');
    }
};
