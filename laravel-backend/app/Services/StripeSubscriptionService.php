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
            $product = $this->stripe()->products->create(
                [
                    'name' => $plan->name,
                    'description' => $plan->description ?: null,
                    'metadata' => [
                        'plan_id' => $plan->id,
                        'tenant_id' => $practice->id,
                        'platform' => 'membermd',
                    ],
                ],
                array_merge($stripeOpts, [
                    'idempotency_key' => "membermd-product-{$plan->id}",
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
