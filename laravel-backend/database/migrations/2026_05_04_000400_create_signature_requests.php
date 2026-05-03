<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Practice-initiated e-signature requests.
 *
 * Until now, the only moment a patient could sign a consent/agreement was
 * during the public enrollment widget flow. That doesn't cover:
 *   - re-signing after a practice publishes a new agreement version
 *   - signing a Release of Information (ROI) for a third-party PCP
 *   - signing additional agreements added after enrollment
 *
 * This table is the request queue: the practice creates a row pointing at
 * a (template, patient) pair; the patient signs from their portal; on
 * sign we create a normal ConsentSignature row + mark the request fulfilled.
 *
 * Public-facing token allows email-link signing without auth (matching
 * the EnrollmentWidget pattern). The token is cryptographically random
 * + opaque so a forwarded email can't be guessed.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('signature_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('template_id')->constrained('consent_templates')->restrictOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            // Optional — set when this signature is associated with a
            // specific membership (e.g. signing the agreement for that
            // membership). Helps the PDF generator know which membership
            // header to render.
            $table->foreignUuid('membership_id')->nullable()->constrained('patient_memberships')->nullOnDelete();
            $table->foreignUuid('requested_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            // Public sign-without-login token. Hashed-in-DB style isn't
            // strictly needed here since the token IS the auth, but it's
            // long enough that brute-force is impractical.
            $table->string('public_token', 64)->unique();
            // pending | signed | expired | cancelled
            $table->string('status', 20)->default('pending');
            $table->text('message')->nullable();           // optional note from staff to patient
            $table->timestamp('expires_at')->nullable();   // null = never expires
            $table->timestamp('reminded_at')->nullable();
            // Set on sign — links back to the resulting ConsentSignature
            // so we can resolve "what got signed" without re-deriving.
            $table->foreignUuid('consent_signature_id')->nullable()
                ->constrained('consent_signatures')->nullOnDelete();
            $table->timestamp('signed_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'patient_id', 'status']);
            $table->index(['status', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('signature_requests');
    }
};
