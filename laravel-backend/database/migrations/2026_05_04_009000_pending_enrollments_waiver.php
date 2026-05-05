<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Carry the enrollment-fee waiver decision through the payment-link
 * round trip.
 *
 * When a staff member sends a Founding Member a payment link, we need
 * the waiver decision to survive the user-time delay between
 * "checkout created" and "patient pays" — sometimes minutes, sometimes
 * days. The Stripe checkout already suppresses the fee line item; this
 * migration adds two columns so the checkout.session.completed webhook
 * can also stamp the resulting PatientMembership with waived_at and
 * waiver_reason (matching the direct-enroll path's behavior).
 *
 *   waive_enrollment_fee  bool, default false
 *   waiver_reason         text, nullable
 *
 * Nothing changes for non-waiver enrollments — both columns stay
 * default false / null and the webhook treats them as a no-op.
 */
return new class extends Migration {
    public $withinTransaction = false;

    private function safeStatement(string $sql, string $label): void
    {
        try {
            DB::statement($sql);
        } catch (\Throwable $e) {
            $msg = $e->getMessage();
            $benign = str_contains($msg, 'already exists')
                || str_contains($msg, 'duplicate');
            if (!$benign) {
                throw $e;
            }
            \Log::info("pending_enrollments_waiver: {$label} skipped — {$msg}");
        }
    }

    public function up(): void
    {
        $this->safeStatement(
            'ALTER TABLE pending_enrollments ADD COLUMN IF NOT EXISTS waive_enrollment_fee boolean DEFAULT false',
            'col waive_enrollment_fee'
        );
        $this->safeStatement(
            'ALTER TABLE pending_enrollments ADD COLUMN IF NOT EXISTS waiver_reason text',
            'col waiver_reason'
        );
    }

    public function down(): void
    {
        $this->safeStatement('ALTER TABLE pending_enrollments DROP COLUMN IF EXISTS waiver_reason', 'drop col waiver_reason');
        $this->safeStatement('ALTER TABLE pending_enrollments DROP COLUMN IF EXISTS waive_enrollment_fee', 'drop col waive_enrollment_fee');
    }
};
