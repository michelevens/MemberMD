<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use Illuminate\Support\Facades\DB;
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

        // Race-safe customer creation (QA scenario #15). Two concurrent
        // requests (enroll + payment-method-setup from another tab) both
        // saw stripe_customer_id = null and each created a new Stripe
        // customer. Last write won locally; the other customer became an
        // orphan that future webhooks couldn't resolve. We now lock the
        // patient row inside a transaction — the second caller blocks
        // until the first commits, then sees the populated customer_id.
        return DB::transaction(function () use ($practice, $patient) {
            $locked = Patient::where('id', $patient->id)
                ->lockForUpdate()
                ->first();

            if (!empty($locked->stripe_customer_id)) {
                return $locked->stripe_customer_id;
            }

            try {
                $customer = $this->stripe()->customers->create(
                    [
                        'email' => $locked->email,
                        'name' => trim($locked->first_name . ' ' . $locked->last_name),
                        'phone' => $locked->phone,
                        'metadata' => [
                            'patient_id' => $locked->id,
                            'tenant_id' => $practice->id,
                            'platform' => 'membermd',
                        ],
                    ],
                    [
                        'stripe_account' => $practice->stripe_account_id,
                        // Stripe-side idempotency too — same patient retry
                        // hitting Stripe directly returns the existing
                        // customer instead of creating a second one.
                        'idempotency_key' => "membermd-customer-{$locked->id}",
                    ],
                );
            } catch (ApiErrorException $e) {
                throw new RuntimeException("Failed to create Stripe customer: {$e->getMessage()}", 0, $e);
            }

            $locked->update(['stripe_customer_id' => $customer->id]);

            return $customer->id;
        });
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
     * Cancel a Stripe Subscription. Three modes, mirroring Stripe's own
     * cancel-subscription dialog:
     *
     *   immediately=true        Hard cut today (fraud, comp removal).
     *   immediately=false +
     *     cancelAt=null         Cancel at end of current period (default
     *                           — patient keeps coverage they paid for).
     *   immediately=false +
     *     cancelAt=<timestamp>  Schedule a cancel for a specific future
     *                           date (Stripe's "On a custom date" option).
     *
     * cancelAt is silently ignored when immediately=true.
     */
    public function cancelSubscription(
        PatientMembership $membership,
        bool $immediately = false,
        ?\DateTimeInterface $cancelAt = null,
    ): void {
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
            } elseif ($cancelAt !== null) {
                // Custom-date cancel — Stripe schedules the cancellation
                // for the supplied timestamp. cancel_at supersedes
                // cancel_at_period_end if both are set, so we send only
                // one of the two.
                $this->stripe()->subscriptions->update(
                    $membership->stripe_subscription_id,
                    ['cancel_at' => $cancelAt->getTimestamp()],
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

        $auditAction = $immediately
            ? 'subscription_cancelled_immediately'
            : ($cancelAt !== null ? 'subscription_cancel_scheduled' : 'subscription_cancelled_at_period_end');

        $this->audit($practice, $membership, $auditAction, [
            'stripe_subscription_id' => $membership->stripe_subscription_id,
            'cancel_at' => $cancelAt?->format(\DateTime::ATOM),
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
            // Preserve quantity across plan change (QA scenario #14). Without
            // this, a primary with N family members has its quantity silently
            // reset to default when the plan price ID is swapped — Stripe
            // would then bill for one seat covering N people, and dependents
            // get free coverage until next renewal exposes the mismatch.
            $currentQuantity = (int) ($sub->items->data[0]->quantity ?? 1);
            if (!$currentItemId) {
                throw new RuntimeException('Subscription has no items.');
            }

            $this->stripe()->subscriptions->update(
                $membership->stripe_subscription_id,
                [
                    'items' => [[
                        'id' => $currentItemId,
                        'price' => $newPriceId,
                        'quantity' => $currentQuantity,
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
     * Bump the primary subscription's quantity by `delta` (positive = add a
     * dependent, negative = remove one). Stripe's invoice math handles the
     * pricing — each `quantity` unit charges at the plan's price-per-seat.
     *
     * For practices that price family members at a different rate than the
     * primary, we swap to a per-seat price model in a follow-up — for now the
     * simplifying assumption is that the family_member_price equals the main
     * plan price (each seat charged once).
     */
    public function adjustSubscriptionQuantity(PatientMembership $primaryMembership, int $delta): void
    {
        if (empty($primaryMembership->stripe_subscription_id) || $delta === 0) {
            return;
        }

        $practice = $primaryMembership->tenant ?? Practice::findOrFail($primaryMembership->tenant_id);
        $stripeOpts = ['stripe_account' => $practice->stripe_account_id];

        try {
            $sub = $this->stripe()->subscriptions->retrieve(
                $primaryMembership->stripe_subscription_id,
                [],
                $stripeOpts,
            );

            $itemId = $sub->items->data[0]->id ?? null;
            $currentQty = (int) ($sub->items->data[0]->quantity ?? 1);
            $newQty = max(1, $currentQty + $delta);
            if (!$itemId) {
                throw new RuntimeException('Subscription has no items.');
            }

            $this->stripe()->subscriptions->update(
                $primaryMembership->stripe_subscription_id,
                [
                    'items' => [[
                        'id' => $itemId,
                        'quantity' => $newQty,
                    ]],
                    'proration_behavior' => 'create_prorations',
                ],
                $stripeOpts,
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to adjust subscription quantity: {$e->getMessage()}", 0, $e);
        }

        $this->audit($practice, $primaryMembership, 'subscription_quantity_adjusted', [
            'delta' => $delta,
            'new_quantity_target' => $currentQty + $delta,
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

    /**
     * Refund the most recent paid invoice on this subscription. Used by the
     * patient-portal "cancel and refund within window" flow.
     *
     * Stripe-side: looks up the latest paid invoice for the subscription,
     * pulls its payment_intent, calls refunds->create with reason='requested_by_customer'.
     * Idempotency-keyed by membership id so re-clicks within the window
     * don't double-refund.
     *
     * Local-side: stamps the matching Invoice row with refunded_at +
     * refund_amount and flips its status to 'refunded'.
     *
     * Returns the refunded amount in dollars (0 if nothing to refund).
     */
    public function refundLatestInvoice(PatientMembership $membership): float
    {
        if (empty($membership->stripe_subscription_id)) {
            return 0.0;
        }

        $practice = $membership->tenant ?? Practice::findOrFail($membership->tenant_id);
        $stripeOpts = ['stripe_account' => $practice->stripe_account_id];

        try {
            $invoices = $this->stripe()->invoices->all(
                [
                    'subscription' => $membership->stripe_subscription_id,
                    'status' => 'paid',
                    'limit' => 1,
                ],
                $stripeOpts,
            );

            $latest = $invoices->data[0] ?? null;
            if (!$latest || empty($latest->payment_intent)) {
                return 0.0;
            }

            $refund = $this->stripe()->refunds->create(
                [
                    'payment_intent' => $latest->payment_intent,
                    'reason' => 'requested_by_customer',
                    'metadata' => [
                        'membership_id' => $membership->id,
                        'platform' => 'membermd',
                        'flow' => 'self_cancel_within_window',
                    ],
                ],
                array_merge($stripeOpts, [
                    'idempotency_key' => "membermd-refund-{$membership->id}",
                ]),
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to issue refund: {$e->getMessage()}", 0, $e);
        }

        $refundedDollars = ($refund->amount ?? 0) / 100;

        // Stamp the local Invoice row so the patient portal + practice
        // billing tab reflect the refund without waiting for the
        // charge.refunded webhook.
        \App\Models\Invoice::where('tenant_id', $practice->id)
            ->where('stripe_invoice_id', $latest->id)
            ->update([
                'status' => 'refunded',
                'refund_amount' => $refundedDollars,
                'refunded_at' => now(),
            ]);

        $this->audit($practice, $membership, 'subscription_refunded_within_window', [
            'stripe_invoice_id' => $latest->id,
            'stripe_refund_id' => $refund->id,
            'amount' => $refundedDollars,
        ]);

        return $refundedDollars;
    }

    /**
     * Record an overage charge on a membership.
     *
     * Always writes a local Invoice row first (`status='pending'`) so the
     * practice has a record even if Stripe isn't reachable or the
     * practice hasn't finished Connect onboarding. If Stripe is wired up,
     * we also create an InvoiceItem on the practice's connected account
     * which Stripe will roll into the patient's next subscription
     * invoice — no separate charge attempt, no surprise card prompt.
     *
     * Returns the local Invoice row. The `stripe_invoice_id` field is
     * populated only when Stripe accepted the InvoiceItem.
     */
    public function recordOverageCharge(
        PatientMembership $membership,
        float $amount,
        string $description,
        array $metadata = [],
    ): \App\Models\Invoice {
        $practice = Practice::findOrFail($membership->tenant_id);

        // Always write the local row — practice's records are the source
        // of truth for "what is owed", Stripe is the transport.
        $invoice = \App\Models\Invoice::create([
            'tenant_id' => $practice->id,
            'patient_id' => $membership->patient_id,
            'membership_id' => $membership->id,
            'amount' => $amount,
            'tax' => 0,
            'status' => 'pending',
            'description' => $description,
            'line_items' => [[
                'description' => $description,
                'amount' => $amount,
                'quantity' => 1,
                'metadata' => $metadata,
            ]],
            'due_date' => now()->addDays(30)->toDateString(),
        ]);

        // Best-effort Stripe push. Failure is non-fatal — the local row
        // remains, dunning can pick it up later, the practice can manually
        // sync if needed.
        if (empty($practice->stripe_account_id)
            || empty($membership->stripe_customer_id)
            || empty($membership->stripe_subscription_id)
            || (string) config('services.stripe.secret') === '') {
            $this->audit($practice, $membership, 'overage_recorded_local_only', [
                'invoice_id' => $invoice->id,
                'amount' => $amount,
                'reason' => 'stripe_not_configured_or_missing_subscription',
            ]);
            return $invoice;
        }

        try {
            $item = $this->stripe()->invoiceItems->create(
                [
                    'customer' => $membership->stripe_customer_id,
                    'subscription' => $membership->stripe_subscription_id,
                    'amount' => (int) round($amount * 100),
                    'currency' => 'usd',
                    'description' => $description,
                    'metadata' => array_merge([
                        'membership_id' => $membership->id,
                        'invoice_local_id' => $invoice->id,
                        'kind' => 'overage',
                    ], $metadata),
                ],
                ['stripe_account' => $practice->stripe_account_id],
            );

            // Stripe doesn't issue an invoice_id at item creation; that
            // arrives on the next finalize. Stash the item id so webhook
            // reconciliation can match it back to this row.
            $invoice->update([
                'stripe_invoice_id' => $item->id,
            ]);

            $this->audit($practice, $membership, 'overage_invoice_item_created', [
                'invoice_id' => $invoice->id,
                'stripe_invoice_item_id' => $item->id,
                'amount' => $amount,
            ]);
        } catch (ApiErrorException $e) {
            Log::warning('Overage Stripe push failed; local invoice retained', [
                'membership_id' => $membership->id,
                'invoice_id' => $invoice->id,
                'error' => $e->getMessage(),
            ]);
            $this->audit($practice, $membership, 'overage_stripe_push_failed', [
                'invoice_id' => $invoice->id,
                'amount' => $amount,
                'error' => $e->getMessage(),
            ]);
        }

        return $invoice;
    }

    /**
     * Create a Stripe Checkout session in subscription mode for the
     * send-payment-link flow. The patient lands on Stripe-hosted Checkout,
     * enters their card, and on completion Stripe both creates the
     * Subscription and fires checkout.session.completed back to our
     * webhook — which then converts the PendingEnrollment into a real
     * PatientMembership via MembershipEnrollmentService.
     *
     * Returns the checkout URL + session id. The pending_enrollment_id
     * is stamped into session metadata so the webhook can find the
     * pending row at completion time.
     */
    public function createPaymentLinkSession(
        Practice $practice,
        Patient $patient,
        MembershipPlan $plan,
        string $billingFrequency,
        string $pendingEnrollmentId,
        string $successUrl,
        string $cancelUrl,
        // When true, suppresses the one-time enrollment fee on the
        // first invoice. Used for Founding Member / comp scenarios
        // where the admin has waived the registration fee. Default
        // false so the regular path still charges it.
        bool $waiveEnrollmentFee = false,
    ): array {
        $this->assertPracticeReady($practice);

        $priceId = $billingFrequency === 'annual'
            ? $plan->stripe_annual_price_id
            : $plan->stripe_monthly_price_id;

        if (empty($priceId)) {
            throw new RuntimeException(
                "Plan {$plan->id} has no Stripe price for {$billingFrequency} billing."
            );
        }

        // Reuse customer if we've billed this patient before — keeps card
        // on file and consolidates billing history. ensureCustomer is
        // race-safe + idempotent.
        $customerId = $this->ensureCustomer($practice, $patient);

        $applicationFeePercent = $practice->platformFeeBps() / 100;

        $params = [
            'mode' => 'subscription',
            'customer' => $customerId,
            // Offer card + ACH + Cash App + Link. Stripe auto-renders the
            // wallet/save-info options based on what the connected account
            // has enabled — practices that haven't toggled on US bank
            // accounts in their Connect dashboard will see card-only.
            'payment_method_types' => ['card', 'us_bank_account', 'cashapp', 'link'],
            'line_items' => [[
                'price' => $priceId,
                'quantity' => 1,
            ]],
            'success_url' => $successUrl,
            'cancel_url' => $cancelUrl,
            'metadata' => [
                'pending_enrollment_id' => $pendingEnrollmentId,
                'membership_plan_id' => $plan->id,
                'patient_id' => $patient->id,
                'tenant_id' => $practice->id,
                'platform' => 'membermd',
            ],
            'subscription_data' => [
                'metadata' => [
                    'pending_enrollment_id' => $pendingEnrollmentId,
                    'membership_plan_id' => $plan->id,
                    'patient_id' => $patient->id,
                    'tenant_id' => $practice->id,
                    'platform' => 'membermd',
                ],
            ],
        ];

        // One-time enrollment fee (Initial Psychiatric Evaluation, intake
        // visit, registration fee — practices vary on what they call it).
        // Only billed when the plan has an enrollment_fee > 0 AND this
        // particular enrollment isn't being waived. Lives on the SAME
        // checkout so the patient pays subscription + fee in one flow,
        // not two separate transactions.
        //
        // Stripe deprecated subscription_data[add_invoice_items] in 2025
        // (caught 2026-05-08 prod blocker: "Received unknown parameter:
        // subscription_data[add_invoice_items]"). The replacement: append
        // the one-time fee as a second top-level line_items entry with
        // a one-time price_data. In mode=subscription Checkout, Stripe
        // accepts one-time prices alongside the recurring one and bills
        // both together on the subscription's first invoice.
        $enrollmentFee = (float) ($plan->enrollment_fee ?? 0);
        if ($enrollmentFee > 0 && !$waiveEnrollmentFee) {
            $params['line_items'][] = [
                'price_data' => [
                    'currency' => 'usd',
                    // Recurring is omitted → Stripe treats this as a
                    // one-time price. The subscription Checkout mode
                    // attaches it to the first invoice.
                    'unit_amount' => (int) round($enrollmentFee * 100),
                    'product_data' => [
                        'name' => 'Initial enrollment fee — ' . $plan->name,
                    ],
                ],
                'quantity' => 1,
            ];
        }

        if ($applicationFeePercent > 0) {
            $params['subscription_data']['application_fee_percent'] = $applicationFeePercent;
        }

        try {
            $session = $this->stripe()->checkout->sessions->create(
                $params,
                array_merge(
                    ['stripe_account' => $practice->stripe_account_id],
                    ['idempotency_key' => "membermd-checkout-{$pendingEnrollmentId}"],
                ),
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create payment link: {$e->getMessage()}", 0, $e);
        }

        return [
            'session_id' => $session->id,
            'url' => $session->url,
            'customer_id' => $customerId,
            'expires_at' => $session->expires_at
                ? now()->setTimestamp($session->expires_at)
                : now()->addHours(24),
        ];
    }

    /**
     * Create a Stripe Checkout session for a ONE-TIME payment (mode:
     * payment, not subscription). Used for cash-pay appointment booking
     * and any other ad-hoc charge a practice wants to collect upfront.
     *
     * Differs from createPaymentLinkSession:
     *  - mode: 'payment' instead of 'subscription'
     *  - no Customer needed (visitor isn't necessarily a tenant patient
     *    yet — they're a lead until payment succeeds)
     *  - takes a single line item with explicit amount + currency, not
     *    a Stripe Price ID — practices set per-appointment-type prices
     *    in their MemberMD admin, not in Stripe Dashboard
     *  - applies platform fee directly via application_fee_amount on
     *    the PaymentIntent metadata
     *
     * @param array  $metadata    arbitrary key/values, surfaced on the
     *                            session + payment_intent for webhook
     *                            reconciliation. Always include
     *                            tenant_id + a stable idempotency key
     *                            (e.g. pending_booking_id).
     */
    public function createOneTimeCheckoutSession(
        Practice $practice,
        string $idempotencyKey,
        int $amountCents,
        string $currency,
        string $productName,
        string $productDescription,
        string $customerEmail,
        string $successUrl,
        string $cancelUrl,
        array $metadata = [],
    ): array {
        $this->assertPracticeReady($practice);

        // Platform fee — same calc as subscription mode but expressed
        // as a fixed cents value (Stripe requires this for one-time
        // payments instead of the percent it accepts on subscriptions).
        $applicationFeeBps = $practice->platformFeeBps();
        $applicationFeeCents = (int) floor(($amountCents * $applicationFeeBps) / 10_000);

        $params = [
            'mode' => 'payment',
            // No customer — leave it on Stripe to email-match. We CAN
            // pass customer_email to pre-fill, which dramatically cuts
            // friction and helps Stripe Radar flag duplicates.
            'customer_email' => $customerEmail,
            'payment_method_types' => ['card', 'us_bank_account', 'cashapp', 'link'],
            'line_items' => [[
                'price_data' => [
                    'currency' => $currency,
                    'unit_amount' => $amountCents,
                    'product_data' => [
                        'name' => $productName,
                        'description' => $productDescription,
                    ],
                ],
                'quantity' => 1,
            ]],
            'success_url' => $successUrl,
            'cancel_url' => $cancelUrl,
            'metadata' => array_merge(
                ['platform' => 'membermd', 'tenant_id' => $practice->id],
                $metadata,
            ),
        ];

        // Application fee on direct charges flows back to the platform
        // automatically. We mirror the metadata onto the PaymentIntent
        // so the webhook handler can reconcile from either object.
        if ($applicationFeeCents > 0) {
            $params['payment_intent_data'] = [
                'application_fee_amount' => $applicationFeeCents,
                'metadata' => array_merge(
                    ['platform' => 'membermd', 'tenant_id' => $practice->id],
                    $metadata,
                ),
            ];
        } else {
            $params['payment_intent_data'] = [
                'metadata' => array_merge(
                    ['platform' => 'membermd', 'tenant_id' => $practice->id],
                    $metadata,
                ),
            ];
        }

        try {
            $session = $this->stripe()->checkout->sessions->create(
                $params,
                [
                    'stripe_account' => $practice->stripe_account_id,
                    'idempotency_key' => "membermd-onetime-{$idempotencyKey}",
                ],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create one-time checkout: {$e->getMessage()}", 0, $e);
        }

        return [
            'session_id' => $session->id,
            'url' => $session->url,
            'expires_at' => $session->expires_at
                ? now()->setTimestamp($session->expires_at)
                : now()->addHours(24),
        ];
    }

    /**
     * Pull the latest state of a Stripe Checkout Session from the
     * practice's Connect account. Used by the admin reconcile flow when
     * the checkout.session.completed webhook never arrived (event not
     * subscribed in Stripe Connect, transient outage) and we need to
     * re-check whether the patient actually paid.
     */
    public function retrieveCheckoutSession(Practice $practice, string $sessionId): \Stripe\Checkout\Session
    {
        $this->assertPracticeReady($practice);

        try {
            return $this->stripe()->checkout->sessions->retrieve(
                $sessionId,
                [],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to retrieve Checkout session: {$e->getMessage()}", 0, $e);
        }
    }

    /**
     * Force-expire a Stripe Checkout Session before its natural 24h
     * expiry. Used when the practice cancels an ad-hoc charge — we
     * want to make sure a patient who finds the email later can't
     * still pay against a cancelled bill.
     *
     * Stripe's `expire` API only works on sessions that haven't
     * completed yet. Already-paid sessions throw — caller must
     * check status first.
     */
    public function expireCheckoutSession(Practice $practice, string $sessionId): void
    {
        $this->assertPracticeReady($practice);

        try {
            $this->stripe()->checkout->sessions->expire(
                $sessionId,
                [],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to expire Checkout session: {$e->getMessage()}", 0, $e);
        }
    }

    /**
     * Convenience: just the URL of an existing session, fetched live.
     * Wraps retrieveCheckoutSession to avoid every caller re-implementing
     * the property pluck.
     */
    public function getCheckoutSessionUrl(Practice $practice, string $sessionId): string
    {
        $session = $this->retrieveCheckoutSession($practice, $sessionId);
        if (empty($session->url)) {
            throw new RuntimeException('Stripe Checkout session has no URL (likely already completed or expired).');
        }
        return $session->url;
    }

    /**
     * Defensive check: does a stored Checkout Session actually carry the
     * one-time enrollment fee line item?
     *
     * Why this exists: when Stripe deprecated `subscription_data
     * [add_invoice_items]` in 2025 we patched mint to use a top-level
     * line_items entry instead, but pending_enrollments rows minted
     * BEFORE that patch hold session URLs that quietly succeeded at
     * Stripe — minus the fee. Patient pays subscription, fee is lost.
     *
     * This helper retrieves the session with line_items expanded and
     * verifies the fee line is present. Reuse-existing-session call
     * sites (MembershipController::createPaymentLink and
     * PendingEnrollmentController::resolveCheckoutUrl) call this
     * before serving a stored URL — if it fails the check, they
     * mint a fresh session that DOES include the fee.
     *
     * Returns true when the session is fine to reuse, false when the
     * caller should mint fresh. Returns true on Stripe errors (fail-open
     * — better to serve a maybe-stale URL than to break enrollment when
     * Stripe is having a moment).
     */
    public function sessionHasEnrollmentFee(
        Practice $practice,
        string $sessionId,
        float $expectedFeeDollars,
    ): bool {
        if ($expectedFeeDollars <= 0) {
            return true;
        }
        try {
            $session = $this->stripe()->checkout->sessions->retrieve(
                $sessionId,
                ['expand' => ['line_items']],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            Log::warning('sessionHasEnrollmentFee fail-open', [
                'session_id' => $sessionId,
                'error' => $e->getMessage(),
            ]);
            return true;
        }

        $items = $session->line_items?->data ?? [];
        $expectedCents = (int) round($expectedFeeDollars * 100);
        foreach ($items as $li) {
            // The fee line is a one-time price — recurring=null. The
            // subscription line has recurring set. Match on amount AND
            // shape so we don't false-match a $349 monthly plan.
            $isOneTime = ($li->price?->recurring ?? null) === null;
            if ($isOneTime && (int) ($li->amount_total ?? 0) === $expectedCents) {
                return true;
            }
        }
        return false;
    }

    /**
     * Backfill local Invoice + Payment rows for a membership by listing
     * the Stripe subscription's invoices live and mirroring each one.
     *
     * Same dual-purpose tool as retrieveCheckoutSession: covers the case
     * where invoice.paid webhooks aren't subscribed (or fired during a
     * Railway outage) and a real Stripe payment never made it into our
     * local Invoice table. The patient's Billing tab shows "No invoices
     * yet" even though Stripe charged the card.
     *
     * Idempotent on stripe_invoice_id (firstOrCreate) so calling this
     * after the webhook is enabled won't duplicate anything.
     *
     * Returns a count of invoices+payments created.
     */
    public function backfillInvoicesFromStripe(PatientMembership $membership): array
    {
        if (empty($membership->stripe_subscription_id)) {
            return ['invoices_created' => 0, 'payments_created' => 0, 'invoices_seen' => 0];
        }

        $practice = $membership->tenant ?? Practice::findOrFail($membership->tenant_id);
        $this->assertPracticeReady($practice);
        $stripeOpts = ['stripe_account' => $practice->stripe_account_id];

        $invoicesCreated = 0;
        $paymentsCreated = 0;
        $invoicesSeen = 0;
        $startingAfter = null;

        do {
            $params = [
                'subscription' => $membership->stripe_subscription_id,
                'limit' => 100,
            ];
            if ($startingAfter) {
                $params['starting_after'] = $startingAfter;
            }

            try {
                $page = $this->stripe()->invoices->all($params, $stripeOpts);
            } catch (ApiErrorException $e) {
                throw new RuntimeException("Failed to list Stripe invoices: {$e->getMessage()}", 0, $e);
            }

            foreach ($page->data as $stripeInvoice) {
                $invoicesSeen++;
                $amount = ($stripeInvoice->amount_paid ?? 0) / 100;
                $isPaid = ($stripeInvoice->status ?? '') === 'paid';

                $invoice = \App\Models\Invoice::firstOrCreate(
                    [
                        'tenant_id' => $practice->id,
                        'stripe_invoice_id' => $stripeInvoice->id,
                    ],
                    [
                        'patient_id' => $membership->patient_id,
                        'membership_id' => $membership->id,
                        'amount' => $amount,
                        'tax' => 0,
                        'status' => $isPaid ? 'paid' : ($stripeInvoice->status ?? 'open'),
                        'paid_at' => $isPaid && !empty($stripeInvoice->status_transitions->paid_at)
                            ? now()->setTimestamp($stripeInvoice->status_transitions->paid_at)
                            : ($isPaid ? now() : null),
                        'pdf_url' => $stripeInvoice->hosted_invoice_url ?? null,
                        'line_items' => method_exists($this, 'extractLineItems')
                            ? [] // service doesn't have access — leave empty for now
                            : [],
                    ],
                );

                if ($invoice->wasRecentlyCreated) {
                    $invoicesCreated++;
                }

                $chargeId = $stripeInvoice->charge ?? null;
                if ($chargeId && $isPaid) {
                    $payment = \App\Models\Payment::firstOrCreate(
                        [
                            'tenant_id' => $practice->id,
                            'stripe_payment_id' => $chargeId,
                        ],
                        [
                            'patient_id' => $membership->patient_id,
                            'invoice_id' => $invoice->id,
                            'amount' => $amount,
                            'method' => 'card',
                            'status' => 'completed',
                        ],
                    );
                    if ($payment->wasRecentlyCreated) {
                        $paymentsCreated++;
                    }
                }
            }

            $startingAfter = $page->has_more && !empty($page->data)
                ? end($page->data)->id
                : null;
        } while ($startingAfter);

        return [
            'invoices_created' => $invoicesCreated,
            'payments_created' => $paymentsCreated,
            'invoices_seen' => $invoicesSeen,
        ];
    }

    /**
     * Create Stripe Product + recurring Prices on the practice's Connect
     * account so this plan can be sold via subscriptions. Idempotent: if
     * the plan already has stripe_monthly_price_id / stripe_annual_price_id
     * those are left alone. Missing ones are created.
     *
     * One Product per plan, one Price per (plan × frequency). Prices are
     * billed in USD on the practice's connected account; the platform skim
     * is applied per-subscription via application_fee_percent.
     */
    public function syncPlanPricesToStripe(Practice $practice, MembershipPlan $plan): MembershipPlan
    {
        $this->assertPracticeReady($practice);

        $stripeOpts = ['stripe_account' => $practice->stripe_account_id];

        // Reuse an existing Product across re-syncs by storing its id in
        // the plan's metadata bag — Stripe doesn't have a native "lookup
        // by metadata" call so we cache locally. First sync creates it.
        // (We tuck it into the price ids — no separate column needed since
        // Stripe accepts product_data inline on price creation.)
        $needsMonthly = empty($plan->stripe_monthly_price_id) && $plan->monthly_price > 0;
        $needsAnnual = empty($plan->stripe_annual_price_id) && $plan->annual_price > 0;

        if (!$needsMonthly && !$needsAnnual) {
            return $plan;
        }

        try {
            // Create or reuse the Product. Stripe upserts via metadata aren't
            // a thing, so we always create on first sync. Re-syncs hit the
            // early-return above unless the plan was nulled out manually.
            // Stripe rejects an empty 'description' value (it interprets ''
            // as an unset attempt, which Product doesn't allow). Only
            // include the key when we actually have copy to send.
            $productPayload = [
                'name' => $plan->name,
                'metadata' => [
                    'plan_id' => $plan->id,
                    'tenant_id' => $practice->id,
                    'platform' => 'membermd',
                ],
            ];
            if (!empty(trim((string) $plan->description))) {
                $productPayload['description'] = $plan->description;
            }

            $product = $this->stripe()->products->create(
                $productPayload,
                array_merge($stripeOpts, [
                    // v2 suffix busts the idempotency cache after the
                    // empty-description fix — earlier failed attempts
                    // would otherwise replay forever with the same error.
                    'idempotency_key' => "membermd-product-{$plan->id}-v2",
                ]),
            );

            $updates = [];

            if ($needsMonthly) {
                $monthly = $this->stripe()->prices->create(
                    [
                        'product' => $product->id,
                        'unit_amount' => (int) round(((float) $plan->monthly_price) * 100),
                        'currency' => 'usd',
                        'recurring' => ['interval' => 'month'],
                        'metadata' => [
                            'plan_id' => $plan->id,
                            'frequency' => 'monthly',
                        ],
                    ],
                    array_merge($stripeOpts, [
                        'idempotency_key' => "membermd-price-{$plan->id}-monthly",
                    ]),
                );
                $updates['stripe_monthly_price_id'] = $monthly->id;
            }

            if ($needsAnnual) {
                $annual = $this->stripe()->prices->create(
                    [
                        'product' => $product->id,
                        'unit_amount' => (int) round(((float) $plan->annual_price) * 100),
                        'currency' => 'usd',
                        'recurring' => ['interval' => 'year'],
                        'metadata' => [
                            'plan_id' => $plan->id,
                            'frequency' => 'annual',
                        ],
                    ],
                    array_merge($stripeOpts, [
                        'idempotency_key' => "membermd-price-{$plan->id}-annual",
                    ]),
                );
                $updates['stripe_annual_price_id'] = $annual->id;
            }

            if (!empty($updates)) {
                $plan->update($updates);
            }
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to sync plan prices to Stripe: {$e->getMessage()}", 0, $e);
        }

        try {
            AuditLog::create([
                'tenant_id' => $practice->id,
                'action' => 'plan_synced_to_stripe',
                'resource' => 'MembershipPlan',
                'resource_id' => $plan->id,
                'metadata' => [
                    'product_id' => $product->id ?? null,
                    'monthly_price_id' => $plan->stripe_monthly_price_id,
                    'annual_price_id' => $plan->stripe_annual_price_id,
                ],
            ]);
        } catch (\Throwable) {
            // non-fatal
        }

        return $plan->fresh();
    }

    /**
     * Open a Stripe-hosted Customer Portal session on the practice's
     * Connect account. Patients use this to update their card on file,
     * download past invoices, or cancel their subscription without
     * having to call the practice.
     *
     * Returns the portal URL — the caller redirects the patient there.
     * Stripe terminates the session on its side; we don't track it.
     */
    public function createCustomerPortalSession(
        Practice $practice,
        Patient $patient,
        string $returnUrl,
    ): string {
        $this->assertPracticeReady($practice);

        $customerId = $patient->stripe_customer_id;
        if (empty($customerId)) {
            // The patient may have a customer record on the connected
            // account from a prior enrollment. ensureCustomer is
            // idempotent + race-safe so calling it here just resolves
            // the existing id without creating a duplicate.
            $customerId = $this->ensureCustomer($practice, $patient);
        }

        try {
            $session = $this->stripe()->billingPortal->sessions->create(
                [
                    'customer' => $customerId,
                    'return_url' => $returnUrl,
                ],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to open billing portal: {$e->getMessage()}", 0, $e);
        }

        return $session->url;
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

    // ─── Stripe-dashboard parity helpers (2026-05-05) ──────────────────
    //
    // Each method mirrors a Stripe customer-page action so the practice
    // admin can do everything from MemberMD's Billing tab without
    // bouncing into Stripe directly.

    /**
     * Create a Stripe Billing Portal session for the patient. The portal
     * is Stripe-hosted and lets the patient swap their card, view
     * invoices, and cancel — without us needing to build any of those
     * surfaces. Returns the URL; caller emails or SMS-es it.
     *
     * Why short-lived: portal sessions auto-expire (default 5 min from
     * Stripe). The patient must use it within the window. We don't
     * persist these — generate fresh on each "send link" click.
     */
    public function createBillingPortalSession(
        Practice $practice,
        Patient $patient,
        string $returnUrl,
    ): string {
        $this->assertPracticeReady($practice);

        // Patient must already have a Stripe customer record. If not,
        // we can't open a portal session — they have nothing to manage.
        $customerId = $patient->stripe_customer_id ?: $this->ensureCustomer($practice, $patient);

        try {
            $session = $this->stripe()->billingPortal->sessions->create(
                [
                    'customer' => $customerId,
                    'return_url' => $returnUrl,
                ],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create billing portal session: {$e->getMessage()}", 0, $e);
        }

        return $session->url;
    }

    /**
     * Pause billing collection on a subscription without cancelling it.
     * Distinct from membership.pause — the membership stays active in
     * MemberMD; only Stripe stops attempting to charge until we resume.
     *
     * behavior values mirror Stripe's:
     *   keep_as_draft  invoices created but not finalized (most common)
     *   mark_uncollectible    finalized but treated as bad debt
     *   void           voided immediately (rare)
     *
     * Default keep_as_draft handles the typical "patient on a hardship
     * grace period — don't charge, don't lose the subscription".
     */
    public function pauseSubscriptionCollection(
        Practice $practice,
        PatientMembership $membership,
        string $behavior = 'keep_as_draft',
        ?\DateTimeInterface $resumeAt = null,
    ): void {
        $this->assertPracticeReady($practice);

        if (empty($membership->stripe_subscription_id)) {
            throw new RuntimeException('Membership has no Stripe subscription to pause.');
        }
        if (!in_array($behavior, ['keep_as_draft', 'mark_uncollectible', 'void'], true)) {
            throw new RuntimeException("Invalid pause behavior: {$behavior}");
        }

        $params = ['behavior' => $behavior];
        if ($resumeAt !== null) {
            $params['resumes_at'] = $resumeAt->getTimestamp();
        }

        try {
            $this->stripe()->subscriptions->update(
                $membership->stripe_subscription_id,
                ['pause_collection' => $params],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to pause subscription: {$e->getMessage()}", 0, $e);
        }

        $this->auditEvent($membership, 'pause_collection', [
            'behavior' => $behavior,
            'resumes_at' => $resumeAt?->format(\DateTime::ATOM),
        ]);
    }

    /**
     * Resume previously-paused subscription collection. Setting
     * pause_collection to null tells Stripe to start charging again
     * on the next invoice cycle.
     */
    public function resumeSubscriptionCollection(
        Practice $practice,
        PatientMembership $membership,
    ): void {
        $this->assertPracticeReady($practice);

        if (empty($membership->stripe_subscription_id)) {
            throw new RuntimeException('Membership has no Stripe subscription to resume.');
        }

        try {
            $this->stripe()->subscriptions->update(
                $membership->stripe_subscription_id,
                ['pause_collection' => ''],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to resume subscription: {$e->getMessage()}", 0, $e);
        }

        $this->auditEvent($membership, 'resume_collection', []);
    }

    /**
     * Refund a single PaymentIntent (Stripe charge) by id. Distinct from
     * the subscription-level refund-on-cancel flow — this lets the
     * admin refund any individual past payment without touching the
     * subscription.
     *
     * amountCents = null refunds the full charge; supply for partial.
     */
    public function refundPaymentIntent(
        Practice $practice,
        string $paymentIntentId,
        ?int $amountCents = null,
        string $reason = 'requested_by_customer',
    ): array {
        $this->assertPracticeReady($practice);

        $params = [
            'payment_intent' => $paymentIntentId,
            'reason' => $reason,
            'metadata' => [
                'tenant_id' => $practice->id,
                'platform' => 'membermd',
                'flow' => 'admin_per_payment_refund',
            ],
        ];
        if ($amountCents !== null && $amountCents > 0) {
            $params['amount'] = $amountCents;
        }

        try {
            $refund = $this->stripe()->refunds->create(
                $params,
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Refund failed: {$e->getMessage()}", 0, $e);
        }

        return [
            'id' => $refund->id,
            'amount' => ($refund->amount ?? 0) / 100,
            'status' => $refund->status,
        ];
    }

    /**
     * Resend a Stripe-hosted receipt for an existing payment. Stripe
     * generates the receipt + emails it to the customer's
     * address-on-file (which we keep aligned with billingEmail()).
     */
    public function sendPaymentReceipt(
        Practice $practice,
        string $paymentIntentId,
    ): void {
        $this->assertPracticeReady($practice);

        try {
            // Re-send by setting receipt_email to the customer's address
            // on the underlying Charge. Stripe queues a fresh receipt.
            $intent = $this->stripe()->paymentIntents->retrieve(
                $paymentIntentId,
                ['expand' => ['latest_charge']],
                ['stripe_account' => $practice->stripe_account_id],
            );
            $chargeId = is_object($intent->latest_charge) ? $intent->latest_charge->id : $intent->latest_charge;
            if (!$chargeId) {
                throw new RuntimeException('No charge associated with this payment.');
            }
            $this->stripe()->charges->update(
                $chargeId,
                ['receipt_email' => $intent->receipt_email ?? null],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to send receipt: {$e->getMessage()}", 0, $e);
        }
    }

    /**
     * Fetch the upcoming invoice for a subscription — what Stripe will
     * charge on the next billing cycle. Read-only preview; doesn't
     * commit anything. Useful for the "Next charge: $X on YYYY-MM-DD"
     * panel on the patient billing tab.
     */
    public function retrieveUpcomingInvoice(
        Practice $practice,
        PatientMembership $membership,
    ): ?array {
        $this->assertPracticeReady($practice);

        if (empty($membership->stripe_subscription_id)) {
            return null;
        }

        try {
            // Different Stripe SDK versions expose this method with
            // different names. Use the documented createPreview path
            // (Stripe API 2024-09+) but fall back to the legacy upcoming
            // method when the installed SDK is older.
            if (method_exists($this->stripe()->invoices, 'createPreview')) {
                $invoice = $this->stripe()->invoices->createPreview(
                    ['subscription' => $membership->stripe_subscription_id],
                    ['stripe_account' => $practice->stripe_account_id],
                );
            } else {
                /** @phpstan-ignore-next-line legacy SDK fallback */
                $invoice = $this->stripe()->invoices->upcoming(
                    ['subscription' => $membership->stripe_subscription_id],
                    ['stripe_account' => $practice->stripe_account_id],
                );
            }
        } catch (ApiErrorException $e) {
            // No upcoming invoice (e.g. cancelled subscription) is a
            // normal not-found, not an error. Return null.
            if ($e->getStripeCode() === 'invoice_upcoming_none') {
                return null;
            }
            throw new RuntimeException("Failed to fetch upcoming invoice: {$e->getMessage()}", 0, $e);
        }

        return [
            'amount_due' => ($invoice->amount_due ?? 0) / 100,
            'currency' => strtoupper($invoice->currency ?? 'USD'),
            'period_start' => $invoice->period_start ? date('c', $invoice->period_start) : null,
            'period_end' => $invoice->period_end ? date('c', $invoice->period_end) : null,
            'next_payment_attempt' => $invoice->next_payment_attempt ? date('c', $invoice->next_payment_attempt) : null,
        ];
    }

    /**
     * Update the Stripe Customer's email address (where receipts +
     * dunning emails go). Used by the per-patient billing-email
     * override workflow.
     */
    public function updateCustomerBillingEmail(
        Practice $practice,
        Patient $patient,
        string $newEmail,
    ): void {
        $this->assertPracticeReady($practice);

        $customerId = $patient->stripe_customer_id;
        if (empty($customerId)) {
            // No Stripe customer yet — nothing to update remotely.
            // The local override still applies via Patient::billingEmail()
            // for any non-Stripe receipt path.
            return;
        }

        try {
            $this->stripe()->customers->update(
                $customerId,
                ['email' => $newEmail],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to update Stripe customer email: {$e->getMessage()}", 0, $e);
        }
    }
}
