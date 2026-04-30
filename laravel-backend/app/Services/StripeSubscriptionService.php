<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;

/**
 * Tier 2 subscription lifecycle on the practice's Connect account.
 *
 * Tier 2 = Patient → Practice DPC subscription. Operations execute on the
 * practice's connected Stripe account via the `Stripe-Account` header so
 * the customer, payment method, and subscription all live there. Funds
 * stay with the practice; the platform takes an optional `application_fee_percent`
 * skim per ADR-0005.
 *
 * Tier 1 (Practice → Superadmin SaaS) is handled separately on the platform
 * account — do NOT route Tier 1 calls through this service.
 */
class StripeSubscriptionService
{
    private ?StripeClient $stripe = null;

    public function __construct(?StripeClient $stripe = null)
    {
        $this->stripe = $stripe;
    }

    private function stripe(): StripeClient
    {
        if ($this->stripe !== null) {
            return $this->stripe;
        }

        $secret = (string) config('services.stripe.secret');
        if ($secret === '') {
            throw new RuntimeException('Stripe is not configured. Set STRIPE_SECRET to enable subscriptions.');
        }

        return $this->stripe = new StripeClient($secret);
    }

    /**
     * Create a Stripe Customer on the practice's connected account if the
     * patient doesn't already have one. Idempotent.
     */
    public function ensureCustomer(Practice $practice, Patient $patient): string
    {
        $this->assertPracticeReady($practice);

        if (!empty($patient->stripe_customer_id)) {
            return $patient->stripe_customer_id;
        }

        try {
            $customer = $this->stripe()->customers->create(
                [
                    'email' => $patient->email,
                    'name' => trim($patient->first_name . ' ' . $patient->last_name),
                    'phone' => $patient->phone,
                    'metadata' => [
                        'patient_id' => $patient->id,
                        'tenant_id' => $practice->id,
                        'platform' => 'membermd',
                    ],
                ],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create Stripe customer: {$e->getMessage()}", 0, $e);
        }

        $patient->update(['stripe_customer_id' => $customer->id]);

        return $customer->id;
    }

    /**
     * Create a Stripe Subscription for the patient against the plan's
     * monthly/annual price. The subscription lives on the practice's connected
     * account; we record the IDs locally for webhook reconciliation.
     *
     * The plan must already have a Stripe Price ID for the chosen frequency.
     * Practices wire those up at plan publish time (separate flow).
     */
    public function createSubscription(
        PatientMembership $membership,
        ?string $defaultPaymentMethodId = null,
    ): PatientMembership {
        $practice = $membership->tenant ?? Practice::findOrFail($membership->tenant_id);
        $patient = $membership->patient ?? Patient::findOrFail($membership->patient_id);
        $plan = $membership->plan ?? MembershipPlan::findOrFail($membership->plan_id);

        $this->assertPracticeReady($practice);

        $priceId = $membership->billing_frequency === 'annual'
            ? $plan->stripe_annual_price_id
            : $plan->stripe_monthly_price_id;

        if (empty($priceId)) {
            throw new RuntimeException(
                "Plan {$plan->id} has no Stripe price for {$membership->billing_frequency} billing. "
                . 'Configure prices in plan settings before enrolling.'
            );
        }

        $customerId = $this->ensureCustomer($practice, $patient);

        // Application fee in basis points (per Practice). Convert to percent
        // for application_fee_percent (Stripe accepts 0–100, decimal allowed).
        $applicationFeePercent = $practice->platformFeeBps() / 100;

        $params = [
            'customer' => $customerId,
            'items' => [['price' => $priceId]],
            'collection_method' => 'charge_automatically',
            'metadata' => [
                'membership_id' => $membership->id,
                'patient_id' => $patient->id,
                'plan_id' => $plan->id,
                'tenant_id' => $practice->id,
                'platform' => 'membermd',
            ],
        ];

        // Honor the plan's trial window (if any). Trial happens on Stripe's
        // side via trial_period_days; we mirror trial_ends_at locally below
        // so the patient portal can render a countdown without an extra API
        // call.
        $trialDays = (int) ($plan->trial_days ?? 0);
        if ($trialDays > 0) {
            $params['trial_period_days'] = $trialDays;

            // If the plan does NOT require a payment method during trial,
            // tell Stripe so the trial doesn't fail-to-start without a card.
            // (Plan default is true — most practices want card up front.)
            if (!$plan->trial_requires_payment_method) {
                $params['trial_settings'] = [
                    'end_behavior' => ['missing_payment_method' => 'pause'],
                ];
            }
        }

        if ($defaultPaymentMethodId) {
            $params['default_payment_method'] = $defaultPaymentMethodId;
        }

        if ($applicationFeePercent > 0) {
            $params['application_fee_percent'] = $applicationFeePercent;
        }

        try {
            $subscription = $this->stripe()->subscriptions->create(
                $params,
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create subscription: {$e->getMessage()}", 0, $e);
        }

        $membership->update([
            'stripe_subscription_id' => $subscription->id,
            'stripe_customer_id' => $customerId,
            'current_period_start' => $subscription->current_period_start
                ? now()->setTimestamp($subscription->current_period_start)
                : $membership->current_period_start,
            'current_period_end' => $subscription->current_period_end
                ? now()->setTimestamp($subscription->current_period_end)
                : $membership->current_period_end,
            'trial_ends_at' => $subscription->trial_end
                ? now()->setTimestamp($subscription->trial_end)
                : null,
        ]);

        $this->audit($practice, $membership, 'subscription_created', [
            'stripe_subscription_id' => $subscription->id,
            'stripe_customer_id' => $customerId,
            'price_id' => $priceId,
        ]);

        return $membership->fresh();
    }

    /**
     * Cancel a Stripe Subscription. Defaults to cancel_at_period_end so the
     * patient keeps coverage they paid for; pass immediately=true for hard cuts
     * (e.g., fraud, comp removal).
     */
    public function cancelSubscription(PatientMembership $membership, bool $immediately = false): void
    {
        if (empty($membership->stripe_subscription_id)) {
            return; // local-only membership; nothing to cancel on Stripe side
        }

        $practice = $membership->tenant ?? Practice::findOrFail($membership->tenant_id);

        try {
            if ($immediately) {
                $this->stripe()->subscriptions->cancel(
                    $membership->stripe_subscription_id,
                    [],
                    ['stripe_account' => $practice->stripe_account_id],
                );
            } else {
                $this->stripe()->subscriptions->update(
                    $membership->stripe_subscription_id,
                    ['cancel_at_period_end' => true],
                    ['stripe_account' => $practice->stripe_account_id],
                );
            }
        } catch (ApiErrorException $e) {
            // Membership-side state still flips to cancelled — webhook will
            // reconcile. Log and continue rather than blocking the user.
            Log::warning('Stripe subscription cancel failed (continuing)', [
                'membership_id' => $membership->id,
                'subscription_id' => $membership->stripe_subscription_id,
                'error' => $e->getMessage(),
            ]);
        }

        $this->audit($practice, $membership, $immediately ? 'subscription_cancelled_immediately' : 'subscription_cancelled_at_period_end', [
            'stripe_subscription_id' => $membership->stripe_subscription_id,
        ]);
    }

    /**
     * Switch a subscription to a new plan + frequency, with proration.
     * Stripe applies its own proration credit to the next invoice.
     */
    public function changePlan(PatientMembership $membership, MembershipPlan $newPlan, string $newFrequency): void
    {
        if (empty($membership->stripe_subscription_id)) {
            return;
        }

        $practice = $membership->tenant ?? Practice::findOrFail($membership->tenant_id);
        $newPriceId = $newFrequency === 'annual' ? $newPlan->stripe_annual_price_id : $newPlan->stripe_monthly_price_id;

        if (empty($newPriceId)) {
            throw new RuntimeException(
                "Target plan {$newPlan->id} has no Stripe price for {$newFrequency} billing."
            );
        }

        try {
            $sub = $this->stripe()->subscriptions->retrieve(
                $membership->stripe_subscription_id,
                [],
                ['stripe_account' => $practice->stripe_account_id],
            );

            $currentItemId = $sub->items->data[0]->id ?? null;
            if (!$currentItemId) {
                throw new RuntimeException('Subscription has no items.');
            }

            $this->stripe()->subscriptions->update(
                $membership->stripe_subscription_id,
                [
                    'items' => [[
                        'id' => $currentItemId,
                        'price' => $newPriceId,
                    ]],
                    'proration_behavior' => 'create_prorations',
                ],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to change plan on Stripe: {$e->getMessage()}", 0, $e);
        }

        $this->audit($practice, $membership, 'subscription_plan_changed', [
            'new_plan_id' => $newPlan->id,
            'new_frequency' => $newFrequency,
            'new_price_id' => $newPriceId,
        ]);
    }

    /**
     * Pay an open invoice immediately — used by manual "Retry now" admin actions
     * and the dunning executor's retry steps.
     */
    public function retryInvoice(PatientMembership $membership, string $stripeInvoiceId): bool
    {
        $practice = $membership->tenant ?? Practice::findOrFail($membership->tenant_id);

        try {
            $invoice = $this->stripe()->invoices->pay(
                $stripeInvoiceId,
                [],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            Log::info('Stripe invoice retry failed', [
                'invoice_id' => $stripeInvoiceId,
                'membership_id' => $membership->id,
                'error' => $e->getMessage(),
            ]);
            return false;
        }

        $this->audit($practice, $membership, 'invoice_retry_succeeded', [
            'stripe_invoice_id' => $stripeInvoiceId,
            'paid' => (bool) ($invoice->paid ?? false),
        ]);

        return (bool) ($invoice->paid ?? false);
    }

    private function assertPracticeReady(Practice $practice): void
    {
        if (empty($practice->stripe_account_id)) {
            throw new RuntimeException("Practice {$practice->id} is not connected to Stripe.");
        }
        if (!$practice->canAcceptPayments()) {
            throw new RuntimeException(
                "Practice {$practice->id} cannot accept payments yet. Connect status: {$practice->stripe_connect_status}"
            );
        }
    }

    private function audit(Practice $practice, PatientMembership $membership, string $action, array $metadata): void
    {
        try {
            AuditLog::create([
                'tenant_id' => $practice->id,
                'action' => $action,
                'resource' => 'PatientMembership',
                'resource_id' => $membership->id,
                'metadata' => $metadata,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Audit write failed for subscription event', [
                'action' => $action,
                'membership_id' => $membership->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
