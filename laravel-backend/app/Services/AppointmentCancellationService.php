<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\AuditLog;
use App\Models\PaymentRefund;
use App\Models\Practice;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Decides what happens — financially and on the schedule — when an
 * appointment gets cancelled.
 *
 * Two flavors:
 *   - Practice-initiated cancel  → ALWAYS full auto-refund. Their
 *                                  fault, not the patient's. No fees,
 *                                  no policy gates.
 *   - Patient-initiated cancel   → respects the practice's
 *                                  cancellation policy: free to
 *                                  cancel up to N hours before, then
 *                                  forfeits a fee (% of price OR
 *                                  fixed cents) past that.
 *
 * Policy fields live on practice.settings.scheduling:
 *   cancellation_deadline_hours  Integer hours before the appointment.
 *                                Default 24. Cancels before this
 *                                window get a full refund regardless
 *                                of who initiated.
 *   cancellation_fee_cents       Fixed fee charged on a late patient
 *                                cancel. Null = no fee (full refund
 *                                always for patient cancels too).
 *   cancellation_fee_percent     Alternative — % of amount_paid_cents.
 *                                Either can be set; if both are set
 *                                the higher one wins (practice
 *                                presumably configured one and forgot
 *                                the other was non-zero).
 *
 * No-shows aren't this service's job — those are flagged via
 * appointment.status = 'no_show' and forfeit by default (no refund
 * triggered, full payment retained).
 */
class AppointmentCancellationService
{
    public function __construct(
        private readonly StripeSubscriptionService $subscriptions,
    ) {}

    /**
     * Cancel an appointment + apply the right refund policy.
     *
     * @param  string  $cancelledBy  "patient" | "practice"
     * @param  string|null  $reason   Free-text, lands on cancel_reason
     *
     * @return array {
     *     appointment: Appointment,
     *     refund_status: 'full' | 'partial' | 'none' | 'no_payment' | 'failed',
     *     refund_amount_cents: int,
     *     fee_cents: int,
     *     stripe_refund_id: string|null,
     * }
     */
    public function cancel(
        Appointment $appointment,
        Practice $practice,
        string $cancelledBy,
        ?string $reason = null,
    ): array {
        if (!in_array($cancelledBy, ['patient', 'practice'], true)) {
            throw new \InvalidArgumentException("cancelledBy must be 'patient' or 'practice'");
        }

        if ($appointment->status === 'cancelled') {
            // Idempotent — return current state so a duplicate click
            // on the cancel button doesn't double-refund.
            return [
                'appointment' => $appointment,
                'refund_status' => $appointment->amount_refunded_cents > 0 ? 'already_refunded' : 'none',
                'refund_amount_cents' => (int) $appointment->amount_refunded_cents,
                'fee_cents' => (int) ($appointment->amount_paid_cents ?? 0) - (int) $appointment->amount_refunded_cents,
                'stripe_refund_id' => null,
            ];
        }

        // Compute refund amount. Returns 0 → 'none' branch below.
        $refundDecision = $this->decideRefund($appointment, $practice, $cancelledBy);
        $refundAmount = $refundDecision['refund_cents'];
        $fee = $refundDecision['fee_cents'];

        $stripeRefundId = null;
        $refundStatus = 'none';

        // No payment intent → cash-pay wasn't used (free booking,
        // member entitlement, etc.). Just mark cancelled.
        if (empty($appointment->stripe_payment_intent_id) || empty($appointment->amount_paid_cents)) {
            $refundStatus = 'no_payment';
        } elseif ($refundAmount <= 0) {
            $refundStatus = 'none';
        } else {
            try {
                $result = $this->subscriptions->refundPaymentIntent(
                    practice: $practice,
                    paymentIntentId: $appointment->stripe_payment_intent_id,
                    amountCents: $refundAmount,
                    reason: $cancelledBy === 'practice'
                        ? 'requested_by_customer'
                        : 'requested_by_customer',
                );
                $stripeRefundId = $result['id'] ?? null;
                $refundStatus = $refundAmount === (int) $appointment->amount_paid_cents ? 'full' : 'partial';

                // Audit row + a refund-tracking row so the practice's
                // billing surfaces have a consistent history.
                try {
                    PaymentRefund::create([
                        'tenant_id' => $practice->id,
                        'patient_id' => $appointment->patient_id,
                        'amount' => $refundAmount / 100,
                        'reason' => $reason ?? "Appointment cancelled by {$cancelledBy}",
                        'stripe_refund_id' => $stripeRefundId,
                        'stripe_payment_intent_id' => $appointment->stripe_payment_intent_id,
                        'status' => 'succeeded',
                    ]);
                } catch (Throwable $e) {
                    Log::warning('PaymentRefund row create failed; continuing', [
                        'appointment_id' => $appointment->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            } catch (Throwable $e) {
                // Refund failed at Stripe — flag it but DON'T also
                // un-cancel the appointment. Practice can manually
                // refund from the Stripe Dashboard if needed.
                Log::error('Auto-refund on cancel failed', [
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
                $refundStatus = 'failed';
                $refundAmount = 0;
            }
        }

        $appointment->update([
            'status' => 'cancelled',
            'cancelled_at' => now(),
            'cancelled_by' => $cancelledBy,
            'cancel_reason' => $reason,
            'amount_refunded_cents' => (int) ($appointment->amount_refunded_cents ?? 0) + $refundAmount,
        ]);

        // Audit so we have a non-repudiable trail of who cancelled,
        // when, and what financial outcome resulted.
        try {
            AuditLog::create([
                'tenant_id' => $practice->id,
                'user_id' => null,
                'action' => 'appointment_cancelled',
                'resource' => 'Appointment',
                'resource_id' => $appointment->id,
                'changes' => [
                    'cancelled_by' => $cancelledBy,
                    'reason' => $reason,
                    'refund_status' => $refundStatus,
                    'refund_amount_cents' => $refundAmount,
                    'fee_cents' => $fee,
                    'stripe_refund_id' => $stripeRefundId,
                ],
            ]);
        } catch (Throwable $e) {
            Log::warning('AuditLog write failed during cancel', [
                'appointment_id' => $appointment->id,
                'error' => $e->getMessage(),
            ]);
        }

        return [
            'appointment' => $appointment->fresh(),
            'refund_status' => $refundStatus,
            'refund_amount_cents' => $refundAmount,
            'fee_cents' => $fee,
            'stripe_refund_id' => $stripeRefundId,
        ];
    }

    /**
     * Pure policy: "if we cancelled this right now, what would the
     * refund + fee math look like?" Used by the visitor-cancel preview
     * page to show the math BEFORE the visitor confirms.
     *
     * Returns the same shape as the financial portion of cancel(),
     * minus the stripe_refund_id (no Stripe call yet).
     */
    public function previewRefund(
        Appointment $appointment,
        Practice $practice,
        string $cancelledBy,
    ): array {
        return $this->decideRefund($appointment, $practice, $cancelledBy);
    }

    /**
     * The policy decision engine. Pure function — no side effects, no
     * Stripe calls. Used by both cancel() (to actually refund) and
     * previewRefund() (to show the math first).
     */
    private function decideRefund(
        Appointment $appointment,
        Practice $practice,
        string $cancelledBy,
    ): array {
        $paid = (int) ($appointment->amount_paid_cents ?? 0);
        if ($paid <= 0) {
            return [
                'refund_cents' => 0,
                'fee_cents' => 0,
                'is_late_cancel' => false,
                'deadline_hours' => 0,
            ];
        }

        $settings = (array) (($practice->settings ?? [])['scheduling'] ?? []);
        // Deadline hours — accept both the new explicit name AND the
        // legacy late_cancel_window_hours field that was already on
        // PracticeSettings (renaming would break existing tenants).
        $deadlineHours = (int) (
            $settings['cancellation_deadline_hours']
            ?? $settings['late_cancel_window_hours']
            ?? 24
        );
        // Fee — accept both an explicit cents field (preferred —
        // avoids float drift) and the legacy dollar-amount field.
        $feeCents = 0;
        if (isset($settings['cancellation_fee_cents'])) {
            $feeCents = (int) $settings['cancellation_fee_cents'];
        } elseif (isset($settings['late_cancel_fee'])) {
            $feeCents = (int) round(((float) $settings['late_cancel_fee']) * 100);
        }
        $feePercent = isset($settings['cancellation_fee_percent'])
            ? (float) $settings['cancellation_fee_percent']
            : 0.0;

        // Practice-initiated cancel = always full refund regardless
        // of timing. Practice eats the no-show on themselves.
        if ($cancelledBy === 'practice') {
            return [
                'refund_cents' => $paid,
                'fee_cents' => 0,
                'is_late_cancel' => false,
                'deadline_hours' => $deadlineHours,
            ];
        }

        // Patient cancel — within deadline = full, past deadline = fee.
        $hoursUntil = now()->diffInMinutes($appointment->scheduled_at, false) / 60;
        $isLate = $hoursUntil < $deadlineHours;

        if (!$isLate) {
            return [
                'refund_cents' => $paid,
                'fee_cents' => 0,
                'is_late_cancel' => false,
                'deadline_hours' => $deadlineHours,
            ];
        }

        // Fee cents wins if both are set (practice probably set one
        // and forgot the other was non-zero — pick the higher one).
        $percentFee = (int) floor(($paid * $feePercent) / 100);
        $effectiveFee = max($feeCents, $percentFee);

        // Cap fee at the paid amount — never more than they paid.
        $effectiveFee = min($effectiveFee, $paid);
        $refund = max(0, $paid - $effectiveFee);

        return [
            'refund_cents' => $refund,
            'fee_cents' => $effectiveFee,
            'is_late_cancel' => true,
            'deadline_hours' => $deadlineHours,
        ];
    }
}
