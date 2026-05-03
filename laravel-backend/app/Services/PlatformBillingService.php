<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\PlatformCoupon;
use App\Models\PlatformPlan;
use App\Models\Practice;
use App\Models\PracticeSubscription;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;

/**
 * Tier 1 (Practice → MemberMD SaaS) Stripe lifecycle.
 *
 * Distinct from StripeSubscriptionService which scopes every call to a
 * practice's connected Stripe account via the `Stripe-Account` header.
 * Operations here run on the **platform** account directly — practices are
 * Stripe customers of MemberMD itself, not customers of the platform's
 * Connect partners.
 *
 * Practices subscribe to PlatformPlans (Solo / Group / Multi-Site / Enterprise),
 * pay MemberMD a monthly subscription + slot overages on the platform account.
 */
class PlatformBillingService
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
            throw new RuntimeException('Stripe is not configured. Set STRIPE_SECRET to enable platform billing.');
        }
        return $this->stripe = new StripeClient($secret);
    }

    /**
     * Whether platform Stripe is configured. Lets callers gracefully no-op
     * (e.g. on Bella Care which is on the Founder override) without throwing.
     */
    public function isConfigured(): bool
    {
        return (string) config('services.stripe.secret') !== '';
    }

    /**
     * Ensure the Practice has a Stripe Customer on the platform account.
     * Idempotent. Stores the customer id on the PracticeSubscription row so
     * future calls reuse it.
     */
    public function ensureCustomer(PracticeSubscription $sub): string
    {
        if (!empty($sub->stripe_customer_id)) {
            return $sub->stripe_customer_id;
        }

        $practice = $sub->practice ?? Practice::findOrFail($sub->practice_id);

        try {
            $customer = $this->stripe()->customers->create(
                [
                    'email' => $practice->owner_email ?? $practice->email,
                    'name' => $practice->name,
                    'phone' => $practice->phone,
                    'metadata' => [
                        'practice_id' => $practice->id,
                        'platform' => 'membermd',
                        'tier' => 'platform_subscription',
                    ],
                ],
                ['idempotency_key' => "membermd-platform-customer-{$practice->id}"],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create platform Stripe customer: {$e->getMessage()}", 0, $e);
        }

        $sub->update(['stripe_customer_id' => $customer->id]);
        return $customer->id;
    }

    /**
     * Create or update the Practice's Stripe subscription on the platform
     * account, against the new tier's price.
     *
     * If the Practice already has a Stripe subscription, swap its price.
     * Otherwise create a fresh subscription.
     *
     * Returns the (possibly fresh) PracticeSubscription with stripe_subscription_id
     * stamped.
     */
    public function applyPlanChange(
        PracticeSubscription $sub,
        PlatformPlan $newPlan,
        string $billingCycle = 'monthly',
        ?string $defaultPaymentMethodId = null,
    ): PracticeSubscription {
        if ($sub->is_founder_override) {
            return $sub; // Founder accounts never bill — no Stripe round-trip
        }

        $priceId = $billingCycle === 'annual'
            ? $newPlan->stripe_annual_price_id
            : $newPlan->stripe_monthly_price_id;

        // Auto-sync the plan to Stripe if it has no price id yet — beats
        // making a SuperAdmin click "Sync to Stripe" the first time anyone
        // tries to subscribe to a fresh tier. Idempotent on price id metadata
        // so this won't create dupes if the row was partially synced earlier.
        if (empty($priceId)) {
            try {
                $newPlan = $this->syncPlanPricesToStripe($newPlan);
                $priceId = $billingCycle === 'annual'
                    ? $newPlan->stripe_annual_price_id
                    : $newPlan->stripe_monthly_price_id;
            } catch (\Throwable $e) {
                Log::warning('Auto-sync of platform plan to Stripe failed', [
                    'plan_key' => $newPlan->key,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        if (empty($priceId)) {
            throw new RuntimeException(
                "Platform plan {$newPlan->key} has no Stripe price for {$billingCycle} billing "
                . 'and could not be auto-created. SuperAdmin needs to manually sync this plan to Stripe.'
            );
        }

        $customerId = $this->ensureCustomer($sub);

        // Already has a subscription → swap price
        if (!empty($sub->stripe_subscription_id)) {
            return $this->swapSubscriptionPrice($sub, $priceId, $newPlan);
        }

        // Fresh subscription
        $params = [
            'customer' => $customerId,
            'items' => [['price' => $priceId]],
            'collection_method' => 'charge_automatically',
            'metadata' => [
                'practice_id' => $sub->practice_id,
                'practice_subscription_id' => $sub->id,
                'platform_plan_id' => $newPlan->id,
                'platform_plan_key' => $newPlan->key,
                'tier' => 'platform_subscription',
                'platform' => 'membermd',
            ],
        ];

        $trialDays = (int) ($newPlan->trial_days ?? 0);
        if ($trialDays > 0 && $sub->status === 'trial') {
            // Honor remaining trial window: Stripe trial ends when our local
            // trial_ends_at says it does. trial_end accepts a unix timestamp.
            if ($sub->trial_ends_at && $sub->trial_ends_at->isFuture()) {
                $params['trial_end'] = $sub->trial_ends_at->timestamp;
            } else {
                $params['trial_period_days'] = $trialDays;
            }
        }

        if ($defaultPaymentMethodId) {
            $params['default_payment_method'] = $defaultPaymentMethodId;
        }

        try {
            $stripeSub = $this->stripe()->subscriptions->create(
                $params,
                ['idempotency_key' => "membermd-platform-sub-{$sub->id}-{$newPlan->id}"],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create platform Stripe subscription: {$e->getMessage()}", 0, $e);
        }

        $sub->update([
            'platform_plan_id' => $newPlan->id,
            'billing_cycle' => $billingCycle,
            'stripe_subscription_id' => $stripeSub->id,
            'status' => $this->mapStripeStatus($stripeSub->status),
            'current_period_start' => $stripeSub->current_period_start
                ? now()->setTimestamp($stripeSub->current_period_start)
                : null,
            'current_period_end' => $stripeSub->current_period_end
                ? now()->setTimestamp($stripeSub->current_period_end)
                : null,
            'trial_ends_at' => $stripeSub->trial_end
                ? now()->setTimestamp($stripeSub->trial_end)
                : $sub->trial_ends_at,
        ]);

        $this->audit($sub, 'platform_subscription_created', [
            'stripe_subscription_id' => $stripeSub->id,
            'plan_key' => $newPlan->key,
            'billing_cycle' => $billingCycle,
        ]);

        return $sub->fresh();
    }

    /**
     * Swap the Stripe subscription's price (tier change). Stripe applies
     * proration to the next invoice via `proration_behavior=create_prorations`.
     */
    private function swapSubscriptionPrice(
        PracticeSubscription $sub,
        string $newPriceId,
        PlatformPlan $newPlan,
    ): PracticeSubscription {
        try {
            $stripeSub = $this->stripe()->subscriptions->retrieve($sub->stripe_subscription_id);
            $itemId = $stripeSub->items->data[0]->id ?? null;
            if (!$itemId) {
                throw new RuntimeException('Existing platform subscription has no items.');
            }

            $updated = $this->stripe()->subscriptions->update(
                $sub->stripe_subscription_id,
                [
                    'items' => [['id' => $itemId, 'price' => $newPriceId]],
                    'proration_behavior' => 'create_prorations',
                    'metadata' => [
                        'practice_id' => $sub->practice_id,
                        'practice_subscription_id' => $sub->id,
                        'platform_plan_id' => $newPlan->id,
                        'platform_plan_key' => $newPlan->key,
                        'tier' => 'platform_subscription',
                        'platform' => 'membermd',
                    ],
                ],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to swap platform subscription price: {$e->getMessage()}", 0, $e);
        }

        $sub->update([
            'platform_plan_id' => $newPlan->id,
            'status' => $this->mapStripeStatus($updated->status),
            'current_period_start' => $updated->current_period_start
                ? now()->setTimestamp($updated->current_period_start)
                : $sub->current_period_start,
            'current_period_end' => $updated->current_period_end
                ? now()->setTimestamp($updated->current_period_end)
                : $sub->current_period_end,
            // Clear any pending cancel — they just changed plan
            'cancels_at' => null,
            'cancelled_at' => null,
        ]);

        $this->audit($sub, 'platform_subscription_plan_swapped', [
            'stripe_subscription_id' => $sub->stripe_subscription_id,
            'new_plan_key' => $newPlan->key,
            'new_price_id' => $newPriceId,
        ]);

        return $sub->fresh();
    }

    /**
     * Create a Stripe Billing Customer Portal session and return the URL.
     * Practice admin gets redirected here from the "Update payment method"
     * button — Stripe hosts the entire UI for managing card on file,
     * downloading invoices, viewing billing history. Cleaner than embedding
     * Elements + matches the existing app's pattern of redirecting for
     * Connect onboarding.
     */
    public function createCustomerPortalSession(PracticeSubscription $sub, string $returnUrl): string
    {
        if ($sub->is_founder_override) {
            throw new RuntimeException('Founder accounts do not have a billing portal.');
        }

        $customerId = $this->ensureCustomer($sub);

        try {
            $session = $this->stripe()->billingPortal->sessions->create([
                'customer' => $customerId,
                'return_url' => $returnUrl,
            ]);
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to open billing portal: {$e->getMessage()}", 0, $e);
        }

        $this->audit($sub, 'platform_billing_portal_opened', [
            'customer_id' => $customerId,
        ]);

        return $session->url;
    }

    /**
     * Set the practice's purchased seat-block count on Stripe.
     *
     * Adds/updates a second subscription item using the plan's seat price id.
     * Quantity is the number of blocks (each block grants
     * extra_seat_block_size additional members at extra_seat_block_price each).
     *
     * Quantity = 0 removes the seat item entirely.
     *
     * Returns the updated PracticeSubscription. Updates purchased_seat_blocks
     * locally before the Stripe round-trip; the webhook reconciles drift.
     */
    public function setSeatBlocks(PracticeSubscription $sub, int $blocks): PracticeSubscription
    {
        if ($blocks < 0) {
            throw new RuntimeException('Seat block count cannot be negative.');
        }

        $sub->loadMissing('plan');
        $plan = $sub->plan;
        if (!$plan) {
            throw new RuntimeException('Subscription has no plan.');
        }
        if ($plan->extra_seat_block_size === null || $plan->extra_seat_block_size <= 0) {
            throw new RuntimeException('This plan does not support extra seat blocks.');
        }

        // Local update happens first — even without Stripe, the cap math
        // immediately respects the new ceiling.
        $sub->update([
            'purchased_seat_blocks' => $blocks,
            'seats_eligible_for_downgrade_since' => null,
        ]);

        // Founder accounts and unconfigured Stripe just stop here
        if ($sub->is_founder_override || empty($sub->stripe_subscription_id)) {
            $this->audit($sub, 'platform_seat_blocks_changed_local_only', ['blocks' => $blocks]);
            return $sub->fresh();
        }
        if (empty($plan->stripe_seat_price_id)) {
            throw new RuntimeException(
                'Plan has no Stripe seat-block price. SuperAdmin needs to sync the plan first.'
            );
        }

        try {
            $stripeSub = $this->stripe()->subscriptions->retrieve($sub->stripe_subscription_id);

            // Find the existing seat item (by price id), if any
            $seatItem = null;
            foreach (($stripeSub->items->data ?? []) as $item) {
                if (($item->price->id ?? null) === $plan->stripe_seat_price_id) {
                    $seatItem = $item;
                    break;
                }
            }

            $items = [];
            if ($seatItem) {
                if ($blocks === 0) {
                    // Remove the seat item
                    $items[] = ['id' => $seatItem->id, 'deleted' => true];
                } else {
                    $items[] = ['id' => $seatItem->id, 'quantity' => $blocks];
                }
            } elseif ($blocks > 0) {
                $items[] = ['price' => $plan->stripe_seat_price_id, 'quantity' => $blocks];
            }

            if (!empty($items)) {
                $this->stripe()->subscriptions->update(
                    $sub->stripe_subscription_id,
                    [
                        'items' => $items,
                        'proration_behavior' => 'create_prorations',
                    ],
                );
            }
        } catch (ApiErrorException $e) {
            // Local change stays — the practice has the capacity locally and
            // ops can reconcile via webhook + Stripe dashboard.
            Log::warning('Failed to sync seat blocks to Stripe (local change kept)', [
                'practice_subscription_id' => $sub->id,
                'blocks' => $blocks,
                'error' => $e->getMessage(),
            ]);
        }

        $this->audit($sub, 'platform_seat_blocks_changed', ['blocks' => $blocks]);
        return $sub->fresh();
    }

    /**
     * Cancel the Stripe subscription. Defaults to cancel_at_period_end.
     * Pass immediately=true to cut off mid-cycle (no refund).
     */
    public function cancel(PracticeSubscription $sub, bool $immediately = false): void
    {
        if ($sub->is_founder_override || empty($sub->stripe_subscription_id)) {
            return;
        }

        try {
            if ($immediately) {
                $this->stripe()->subscriptions->cancel($sub->stripe_subscription_id);
            } else {
                $this->stripe()->subscriptions->update(
                    $sub->stripe_subscription_id,
                    ['cancel_at_period_end' => true],
                );
            }
        } catch (ApiErrorException $e) {
            // Local state already updated by the controller — webhook will
            // reconcile if Stripe disagrees later. Log and continue.
            Log::warning('Platform Stripe cancel failed (continuing)', [
                'practice_subscription_id' => $sub->id,
                'stripe_subscription_id' => $sub->stripe_subscription_id,
                'error' => $e->getMessage(),
            ]);
        }

        $this->audit($sub, $immediately ? 'platform_subscription_cancelled_immediately' : 'platform_subscription_cancelled_at_period_end', [
            'stripe_subscription_id' => $sub->stripe_subscription_id,
        ]);
    }

    /**
     * Reverse a pending end-of-cycle cancellation.
     */
    public function reactivate(PracticeSubscription $sub): void
    {
        if ($sub->is_founder_override || empty($sub->stripe_subscription_id)) {
            return;
        }

        try {
            $this->stripe()->subscriptions->update(
                $sub->stripe_subscription_id,
                ['cancel_at_period_end' => false],
            );
        } catch (ApiErrorException $e) {
            Log::warning('Platform Stripe reactivate failed', [
                'practice_subscription_id' => $sub->id,
                'error' => $e->getMessage(),
            ]);
        }

        $this->audit($sub, 'platform_subscription_reactivated', [
            'stripe_subscription_id' => $sub->stripe_subscription_id,
        ]);
    }

    /**
     * Create Stripe Product + recurring Prices on the **platform** account
     * for a PlatformPlan. Idempotent — existing price ids are left alone.
     *
     * Used by the SuperAdmin "Sync to Stripe" admin action so we don't
     * have to manually create products in the Stripe Dashboard.
     */
    public function syncPlanPricesToStripe(PlatformPlan $plan): PlatformPlan
    {
        if ($plan->is_quote_only) {
            return $plan; // Enterprise / Founder don't need a public price
        }

        $needsMonthly = empty($plan->stripe_monthly_price_id) && $plan->monthly_price > 0;
        $needsAnnual = empty($plan->stripe_annual_price_id) && $plan->annual_price !== null && $plan->annual_price > 0;
        $needsSeat = empty($plan->stripe_seat_price_id)
            && $plan->extra_seat_block_price !== null
            && $plan->extra_seat_block_price > 0;

        if (!$needsMonthly && !$needsAnnual && !$needsSeat) {
            return $plan;
        }

        try {
            $productPayload = [
                'name' => "MemberMD {$plan->name}",
                'metadata' => [
                    'platform_plan_id' => $plan->id,
                    'platform_plan_key' => $plan->key,
                    'platform' => 'membermd',
                    'tier' => 'platform_subscription',
                ],
            ];
            if (!empty(trim((string) $plan->description))) {
                $productPayload['description'] = $plan->description;
            }

            $product = $this->stripe()->products->create(
                $productPayload,
                ['idempotency_key' => "membermd-platform-product-{$plan->id}-v1"],
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
                            'platform_plan_id' => $plan->id,
                            'platform_plan_key' => $plan->key,
                            'frequency' => 'monthly',
                        ],
                    ],
                    ['idempotency_key' => "membermd-platform-price-{$plan->id}-monthly"],
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
                            'platform_plan_id' => $plan->id,
                            'platform_plan_key' => $plan->key,
                            'frequency' => 'annual',
                        ],
                    ],
                    ['idempotency_key' => "membermd-platform-price-{$plan->id}-annual"],
                );
                $updates['stripe_annual_price_id'] = $annual->id;
            }

            if ($needsSeat) {
                // Per-seat-block "metered" price — practice buys N blocks of
                // extra_seat_block_size members at extra_seat_block_price each.
                // We use quantity-based pricing (not metered) so the practice
                // buys explicit seat blocks rather than us tracking usage.
                $seat = $this->stripe()->prices->create(
                    [
                        'product' => $product->id,
                        'unit_amount' => (int) round(((float) $plan->extra_seat_block_price) * 100),
                        'currency' => 'usd',
                        'recurring' => ['interval' => 'month'],
                        'metadata' => [
                            'platform_plan_id' => $plan->id,
                            'platform_plan_key' => $plan->key,
                            'kind' => 'seat_block',
                            'block_size' => (string) $plan->extra_seat_block_size,
                        ],
                    ],
                    ['idempotency_key' => "membermd-platform-price-{$plan->id}-seat"],
                );
                $updates['stripe_seat_price_id'] = $seat->id;
            }

            if (!empty($updates)) {
                $plan->update($updates);
            }
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to sync platform plan to Stripe: {$e->getMessage()}", 0, $e);
        }

        try {
            AuditLog::create([
                'tenant_id' => null, // platform-level event
                'action' => 'platform_plan_synced_to_stripe',
                'resource' => 'PlatformPlan',
                'resource_id' => $plan->id,
                'metadata' => [
                    'monthly_price_id' => $plan->stripe_monthly_price_id,
                    'annual_price_id' => $plan->stripe_annual_price_id,
                    'seat_price_id' => $plan->stripe_seat_price_id,
                ],
            ]);
        } catch (\Throwable) {
            // non-fatal
        }

        return $plan->fresh();
    }

    /**
     * Apply a platform coupon to a practice's existing Stripe subscription.
     *
     * Validates the coupon (active, not expired, plan-restriction satisfied,
     * max-redemptions remaining), syncs it to Stripe if not already, then
     * sets `discounts: [{ coupon }]` on the subscription. Stripe applies
     * the discount on the next invoice automatically.
     *
     * Records redemption in platform_coupon_redemptions.
     *
     * Returns the coupon row on success.
     */
    public function applyCoupon(PracticeSubscription $sub, string $code): PlatformCoupon
    {
        $sub->loadMissing('plan');
        $coupon = PlatformCoupon::where('code', $code)->first();
        if (!$coupon) {
            throw new RuntimeException("Coupon code '{$code}' not found.");
        }
        if (!$coupon->canRedeemFor($sub->plan?->key ?? '')) {
            throw new RuntimeException("Coupon '{$code}' isn't available for this plan or has expired.");
        }

        // Reject re-redemption by the same practice on the same coupon
        // (when coupon is duration=once or has max_redemptions=1)
        $alreadyRedeemed = DB::table('platform_coupon_redemptions')
            ->where('platform_coupon_id', $coupon->id)
            ->where('practice_id', $sub->practice_id)
            ->exists();
        if ($alreadyRedeemed && ($coupon->duration === 'once' || $coupon->max_redemptions === 1)) {
            throw new RuntimeException('This coupon has already been used on this practice.');
        }

        // Founder accounts and unconfigured Stripe just record locally
        if ($sub->is_founder_override || empty($sub->stripe_subscription_id) || !$this->isConfigured()) {
            $this->recordRedemption($coupon, $sub);
            return $coupon;
        }

        // Sync to Stripe if needed
        $this->ensureCouponOnStripe($coupon);

        try {
            $this->stripe()->subscriptions->update(
                $sub->stripe_subscription_id,
                ['discounts' => [['coupon' => $coupon->stripe_coupon_id]]],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to apply coupon to subscription: {$e->getMessage()}", 0, $e);
        }

        $this->recordRedemption($coupon, $sub);
        $this->audit($sub, 'platform_coupon_redeemed', [
            'coupon_code' => $code,
            'stripe_coupon_id' => $coupon->stripe_coupon_id,
        ]);

        return $coupon;
    }

    /**
     * Idempotent: ensure the platform coupon exists on Stripe. Stamps
     * stripe_coupon_id locally when created.
     */
    public function ensureCouponOnStripe(PlatformCoupon $coupon): PlatformCoupon
    {
        if (!empty($coupon->stripe_coupon_id)) {
            return $coupon;
        }

        $params = [
            'name' => $coupon->name,
            'duration' => $coupon->duration,
            'metadata' => [
                'platform' => 'membermd',
                'platform_coupon_id' => $coupon->id,
                'tier' => 'platform_subscription',
            ],
        ];

        if ($coupon->percent_off !== null) {
            $params['percent_off'] = $coupon->percent_off;
        } elseif ($coupon->amount_off_cents !== null) {
            $params['amount_off'] = $coupon->amount_off_cents;
            $params['currency'] = 'usd';
        } else {
            throw new RuntimeException('Coupon must specify either percent_off or amount_off.');
        }

        if ($coupon->duration === 'repeating' && $coupon->duration_in_months) {
            $params['duration_in_months'] = $coupon->duration_in_months;
        }
        if ($coupon->max_redemptions !== null) {
            $params['max_redemptions'] = $coupon->max_redemptions;
        }
        if ($coupon->expires_at) {
            $params['redeem_by'] = $coupon->expires_at->timestamp;
        }

        try {
            $stripeCoupon = $this->stripe()->coupons->create(
                $params,
                ['idempotency_key' => "membermd-platform-coupon-{$coupon->id}"],
            );
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create platform coupon on Stripe: {$e->getMessage()}", 0, $e);
        }

        $coupon->update(['stripe_coupon_id' => $stripeCoupon->id]);
        return $coupon->fresh();
    }

    private function recordRedemption(PlatformCoupon $coupon, PracticeSubscription $sub): void
    {
        DB::table('platform_coupon_redemptions')->insert([
            'id' => (string) Str::uuid(),
            'platform_coupon_id' => $coupon->id,
            'practice_subscription_id' => $sub->id,
            'practice_id' => $sub->practice_id,
            'redeemed_at' => now(),
        ]);
        $coupon->increment('redemptions_count');
    }

    /**
     * Map Stripe subscription status → our PracticeSubscription.status.
     */
    private function mapStripeStatus(string $stripeStatus): string
    {
        return match ($stripeStatus) {
            'trialing' => 'trial',
            'active' => 'active',
            'past_due', 'unpaid' => 'past_due',
            'canceled', 'incomplete_expired' => 'cancelled',
            'paused' => 'paused',
            default => 'active',
        };
    }

    private function audit(PracticeSubscription $sub, string $action, array $metadata): void
    {
        try {
            AuditLog::create([
                'tenant_id' => $sub->practice_id,
                'action' => $action,
                'resource' => 'PracticeSubscription',
                'resource_id' => $sub->id,
                'metadata' => $metadata,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Audit write failed for platform billing event', [
                'action' => $action,
                'practice_subscription_id' => $sub->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
