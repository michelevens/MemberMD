<?php

namespace App\Services;

use App\Events\MembershipStateChanged;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientEntitlement;
use App\Models\PatientMembership;
use App\Models\Practice;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Single source of truth for new-enrollment side effects.
 *
 * Both MembershipController::store (admin/staff direct enrollment) and
 * IntakeController::convert (widget-submission → membership) call into
 * here so billing_mode resolution, Stripe handoff, the state-machine
 * event, first-period entitlements, and the welcome email all happen
 * the same way regardless of which surface initiated the enrollment.
 *
 * Without this, IntakeController silently bypassed the billing_enforced
 * gate and created free memberships for practices that explicitly
 * required Stripe billing.
 */
class MembershipEnrollmentService
{
    public function __construct(
        private readonly StripeSubscriptionService $subscriptions,
    ) {
    }

    /**
     * Resolve which billing path to use for an enrollment.
     *
     * Returns one of:
     *   - 'stripe'   — bill via the practice's Connect account
     *   - 'comped'   — explicit comp, no billing
     *   - 'manual'   — practice/plan not Stripe-ready, billing_enforced=false
     *   - 'rejected' — practice/plan not Stripe-ready, billing_enforced=true
     */
    public function resolveBillingMode(
        Practice $practice,
        MembershipPlan $plan,
        string $billingFrequency,
        bool $isComp,
    ): string {
        if ($isComp) {
            return 'comped';
        }

        $priceId = $billingFrequency === 'annual'
            ? $plan->stripe_annual_price_id
            : $plan->stripe_monthly_price_id;

        $stripeReady = $practice->canAcceptPayments() && !empty($priceId);

        if ($stripeReady) {
            return 'stripe';
        }

        return $practice->billing_enforced ? 'rejected' : 'manual';
    }

    /**
     * Create the membership row + run all side effects.
     *
     * Throws RuntimeException with a user-friendly message on:
     *   - already-active membership for this patient
     *   - rejected billing mode (practice has billing_enforced=true but
     *     Stripe isn't fully wired)
     *   - Stripe subscription creation failure on the stripe path
     *
     * The membership row is rolled back if Stripe fails so we never end
     * up with a half-billed enrollment.
     *
     * Pass $sourceUserId to stamp comped_by_user_id and the
     * MembershipStateChanged metadata. Null is fine (e.g. self-serve
     * enrollment with no actor).
     */
    public function enroll(
        Practice $practice,
        Patient $patient,
        MembershipPlan $plan,
        string $billingFrequency = 'monthly',
        bool $isComp = false,
        ?string $compReason = null,
        ?string $sourceUserId = null,
        ?string $paymentMethodId = null,
        string $source = 'membership.store',
        // When the caller has already created the Stripe subscription
        // out-of-band (e.g. checkout.session.completed webhook —
        // Stripe creates the subscription on Checkout completion, we
        // just need to record it locally), pass the subscription + customer
        // ids here. Skips the createSubscription call AND the
        // missing-payment-method guardrail, since payment is already in.
        ?string $existingStripeSubscriptionId = null,
        ?string $existingStripeCustomerId = null,
        // Founding-member / comp pattern — admin can waive the plan's
        // enrollment_fee at sign-up. When waived, we still snapshot the
        // would-have-been amount into locked_enrollment_fee so the audit
        // trail can reconstruct the waiver. Stripe charge for the
        // enrollment fee is suppressed by the caller (StripeSubscriptionService
        // checks for waiver before adding the line item).
        bool $waiveEnrollmentFee = false,
        ?string $waiverReason = null,
    ): PatientMembership {
        // Single-active-membership invariant. The DB partial unique index
        // (uniq_active_primary_membership) is the hard backstop; this is
        // the user-friendly preflight so we return 422 with a clear
        // message instead of letting the DB throw.
        $existing = PatientMembership::where('tenant_id', $practice->id)
            ->where('patient_id', $patient->id)
            ->where('status', 'active')
            ->exists();

        if ($existing) {
            throw new RuntimeException(
                'Patient already has an active membership. Cancel or update the existing one first.'
            );
        }

        $billingMode = $this->resolveBillingMode($practice, $plan, $billingFrequency, $isComp);

        if ($billingMode === 'rejected') {
            throw new RuntimeException(
                'Cannot enroll patient: practice requires billing but Stripe is not fully configured. '
                . 'Complete Stripe Connect onboarding and set a Stripe price on this plan, or comp the membership.'
            );
        }

        // Stripe path requires either a payment method (admin enrolls with
        // card on hand) OR a pre-existing subscription (post-checkout
        // webhook path — Stripe already charged + created the subscription).
        // Without one or the other, Stripe would create an 'incomplete'
        // subscription that silently dies in dunning. Reject up front.
        $hasExistingStripeSubscription = !empty($existingStripeSubscriptionId);
        if ($billingMode === 'stripe' && empty($paymentMethodId) && !$hasExistingStripeSubscription) {
            throw new RuntimeException(
                'A payment method is required to enroll this patient on a billed plan. '
                . 'Send them a payment link, collect a card in the dialog, or comp the membership.'
            );
        }

        $now = now();
        $periodEnd = $billingFrequency === 'annual'
            ? $now->copy()->addYear()
            : $now->copy()->addMonth();

        // Snapshot the enrollment fee at sign-up. Always captured as the
        // plan's CURRENT enrollment_fee (or 0 if not configured). When
        // waived, we still snapshot the amount so reports + audit logs
        // can answer "how much did we comp?" without reconstructing
        // history from plan-version edits.
        $planEnrollmentFee = (float) ($plan->enrollment_fee ?? 0);
        $lockedEnrollmentFee = $planEnrollmentFee > 0 ? $planEnrollmentFee : null;

        $membership = PatientMembership::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'billing_mode' => $billingMode,
            'comp_reason' => $isComp ? $compReason : null,
            'comped_by_user_id' => $isComp ? $sourceUserId : null,
            'billing_frequency' => $billingFrequency,
            'started_at' => $now,
            'current_period_start' => $now,
            'current_period_end' => $periodEnd,
            'last_state_change_at' => $now,
            // Snapshot the price + plan version this patient agreed to so
            // future plan edits don't retroactively rewrite their bill or
            // their portal display. Either price field can be null if that
            // frequency isn't offered.
            'locked_monthly_price' => $plan->monthly_price,
            'locked_annual_price' => $plan->annual_price,
            'locked_plan_version' => $plan->version ?? 1,
            'locked_enrollment_fee' => $lockedEnrollmentFee,
            'enrollment_fee_waived_at' => $waiveEnrollmentFee && $lockedEnrollmentFee ? $now : null,
            'enrollment_fee_waived_reason' => $waiveEnrollmentFee && $lockedEnrollmentFee ? $waiverReason : null,
            'enrollment_fee_waived_by_user_id' => $waiveEnrollmentFee && $lockedEnrollmentFee ? $sourceUserId : null,
            // If the caller already paid via Checkout, attach the
            // pre-existing Stripe IDs so Stripe is the source of truth
            // for billing and we don't double-create a subscription.
            'stripe_subscription_id' => $hasExistingStripeSubscription ? $existingStripeSubscriptionId : null,
            'stripe_customer_id' => $existingStripeCustomerId,
        ]);

        if ($billingMode === 'stripe' && !$hasExistingStripeSubscription) {
            try {
                $this->subscriptions->createSubscription($membership, $paymentMethodId);
                $membership->refresh();
            } catch (\Throwable $e) {
                Log::warning('Stripe subscription creation failed during enrollment', [
                    'membership_id' => $membership->id,
                    'patient_id' => $patient->id,
                    'plan_id' => $plan->id,
                    'source' => $source,
                    'error' => $e->getMessage(),
                ]);
                $membership->delete();
                throw new RuntimeException('Could not start the subscription. ' . $e->getMessage());
            }
        }

        // Synthetic prospect→active transition so outbound webhooks fire
        // member.activated regardless of which surface enrolled the patient.
        MembershipStateChanged::dispatch($membership, 'prospect', 'active', [
            'source' => $source,
            'created_by' => $sourceUserId,
            'billing_mode' => $billingMode,
        ]);

        PatientEntitlement::create([
            'tenant_id' => $practice->id,
            'membership_id' => $membership->id,
            'patient_id' => $patient->id,
            'period_start' => $now->toDateString(),
            'period_end' => $now->copy()->addMonth()->toDateString(),
            'visits_allowed' => $plan->visits_per_month,
            'visits_used' => 0,
            'telehealth_sessions_used' => 0,
            'messages_sent' => 0,
            'rollover_visits' => 0,
        ]);

        $membership->load(['patient', 'plan', 'entitlements']);

        if ($membership->patient && $membership->patient->email) {
            \App\Services\MailDispatcher::send(
                $membership->patient->email,
                new \App\Mail\MembershipActivated(membership: $membership),
                'membership.activated',
                $membership->tenant_id,
                $membership->patient_id,
            );
        }

        return $membership;
    }
}
