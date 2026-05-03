<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Practice;
use App\Models\StripeConnectEvent;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Stripe\Account;
use Stripe\AccountLink;
use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;

/**
 * Stripe Connect Express account onboarding and lifecycle management.
 *
 * Each Practice (tenant) gets its own Connect Express account. Members'
 * subscriptions are processed as destination charges on the platform with
 * funds transferred to the practice's connected account, optionally with a
 * platform fee.
 *
 * Per ADR-0005, platform_fee_percent is configurable per-practice (default 0%).
 */
class StripeConnectService
{
    private ?StripeClient $stripe = null;

    public function __construct(?StripeClient $stripe = null)
    {
        // Lazy-initialize so the service can be instantiated by the DI
        // container even when STRIPE_SECRET is unconfigured (tests, dev with
        // Stripe disabled). Calls that need Stripe will throw clearly.
        $this->stripe = $stripe;
    }

    private function stripe(): StripeClient
    {
        if ($this->stripe !== null) {
            return $this->stripe;
        }

        $secret = (string) config('services.stripe.secret');
        if ($secret === '') {
            throw new RuntimeException('Stripe is not configured. Set STRIPE_SECRET to enable Connect.');
        }

        return $this->stripe = new StripeClient($secret);
    }

    /**
     * Create a new Connect Express account for the practice if one does not
     * already exist. Idempotent: returns existing account ID on subsequent calls.
     */
    public function createOrGetAccount(Practice $practice): string
    {
        if (!empty($practice->stripe_account_id)) {
            return $practice->stripe_account_id;
        }

        try {
            $account = $this->stripe()->accounts->create([
                'type' => 'express',
                'country' => 'US',
                'email' => $practice->email ?? $practice->owner_email,
                'business_type' => 'company',
                'business_profile' => array_filter([
                    'name' => $practice->name,
                    'url' => $practice->website ?: null,
                    'mcc' => '8011', // Doctors / Physicians (default; Stripe may reclassify)
                ]),
                'capabilities' => [
                    'card_payments' => ['requested' => true],
                    'transfers' => ['requested' => true],
                ],
                'metadata' => [
                    'practice_id' => $practice->id,
                    'tenant_code' => $practice->tenant_code,
                    'platform' => 'membermd',
                ],
            ]);
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create Connect account: {$e->getMessage()}", 0, $e);
        }

        $practice->update([
            'stripe_account_id' => $account->id,
            'stripe_connect_status' => 'pending_onboarding',
        ]);

        $this->audit($practice, 'stripe_connect_account_created', [
            'stripe_account_id' => $account->id,
        ]);

        return $account->id;
    }

    /**
     * Generate a one-time onboarding link the practice owner uses to complete
     * Stripe's hosted Express onboarding flow. Links expire in ~5 minutes;
     * always generate a fresh one when the user clicks "Set up payouts".
     */
    public function createOnboardingLink(Practice $practice): string
    {
        $accountId = $this->createOrGetAccount($practice);

        try {
            $link = $this->stripe()->accountLinks->create([
                'account' => $accountId,
                'refresh_url' => config('services.stripe.connect_refresh_url'),
                'return_url' => config('services.stripe.connect_return_url'),
                'type' => 'account_onboarding',
            ]);
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create onboarding link: {$e->getMessage()}", 0, $e);
        }

        return $link->url;
    }

    /**
     * Generate a one-time login link to the Stripe Express dashboard.
     * Practices use this to view payouts, update bank info, manage disputes.
     */
    public function createDashboardLink(Practice $practice): string
    {
        if (empty($practice->stripe_account_id)) {
            throw new RuntimeException('Practice has no Stripe Connect account.');
        }

        try {
            $link = $this->stripe()->accounts->createLoginLink($practice->stripe_account_id);
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create dashboard link: {$e->getMessage()}", 0, $e);
        }

        return $link->url;
    }

    /**
     * Mint a short-lived AccountSession client_secret used by the embedded
     * Stripe Connect components (@stripe/connect-js). The session declares
     * which embedded components the practice's session is allowed to load.
     *
     * Returns the client_secret + the publishable key the frontend needs
     * to instantiate loadConnectAndInitialize(). Sessions expire in ~30
     * minutes; the frontend should always fetch a fresh one on mount.
     *
     * @return array{client_secret: string, publishable_key: string|null, account: string}
     */
    public function createAccountSession(Practice $practice): array
    {
        $accountId = $this->createOrGetAccount($practice);

        try {
            $session = $this->stripe()->accountSessions->create([
                'account' => $accountId,
                'components' => [
                    'account_onboarding' => ['enabled' => true],
                    'payouts' => ['enabled' => true],
                    'payments' => ['enabled' => true],
                    'account_management' => ['enabled' => true],
                ],
            ]);
        } catch (ApiErrorException $e) {
            throw new RuntimeException("Failed to create Connect account session: {$e->getMessage()}", 0, $e);
        }

        return [
            'client_secret' => $session->client_secret,
            'publishable_key' => config('services.stripe.key'),
            'account' => $accountId,
        ];
    }

    /**
     * Refresh the practice's local copy of Connect account state from Stripe.
     * Called from webhook handlers and on-demand from the practice settings UI.
     */
    public function syncAccountStatus(Practice $practice, ?Account $account = null): Practice
    {
        if (empty($practice->stripe_account_id)) {
            return $practice;
        }

        if (!$account) {
            try {
                $account = $this->stripe()->accounts->retrieve($practice->stripe_account_id);
            } catch (ApiErrorException $e) {
                Log::warning('Failed to retrieve Connect account', [
                    'practice_id' => $practice->id,
                    'stripe_account_id' => $practice->stripe_account_id,
                    'error' => $e->getMessage(),
                ]);
                return $practice;
            }
        }

        $previousStatus = $practice->stripe_connect_status;
        $newStatus = $this->deriveStatus($account);

        $updates = [
            'stripe_connect_status' => $newStatus,
            'stripe_charges_enabled' => $account->charges_enabled,
            'stripe_payouts_enabled' => $account->payouts_enabled,
            'stripe_details_submitted' => $account->details_submitted,
            'stripe_requirements' => $account->requirements ? $account->requirements->toArray() : null,
            'stripe_disabled_reason' => $account->requirements->disabled_reason ?? null,
        ];

        if ($newStatus === 'active' && !$practice->stripe_connect_onboarded_at) {
            $updates['stripe_connect_onboarded_at'] = now();
        }

        $practice->update($updates);

        if ($previousStatus !== $newStatus) {
            $this->audit($practice, 'stripe_connect_status_changed', [
                'from' => $previousStatus,
                'to' => $newStatus,
                'charges_enabled' => $account->charges_enabled,
                'payouts_enabled' => $account->payouts_enabled,
            ]);
        }

        // On transition INTO 'active', sync any plans that have prices but
        // no Stripe price IDs yet. Practices typically create plans (or get
        // starter plans forked) before completing Connect onboarding, so
        // without this hook the public enrollment flow falls back to free
        // 'manual' mode — patients enroll without paying. Best-effort: a
        // sync failure logs but doesn't unwind the status transition.
        if ($previousStatus !== 'active' && $newStatus === 'active') {
            $this->syncUnsyncedPlans($practice->fresh());
        }

        return $practice->fresh();
    }

    /**
     * Sync every MembershipPlan for this practice that has prices set but
     * no Stripe price IDs yet. Idempotent: syncPlanPricesToStripe early-
     * returns when both price IDs are already populated.
     *
     * Called from refreshStatus on Connect activation, and exposed
     * publicly so artisan backfills + the manual "Sync to Stripe" button
     * can reuse it.
     */
    public function syncUnsyncedPlans(Practice $practice): array
    {
        if (!$practice->canAcceptPayments()) {
            return ['synced' => 0, 'failed' => 0, 'skipped_reason' => 'practice_not_billing_ready'];
        }

        $subscriptions = app(StripeSubscriptionService::class);
        $synced = 0;
        $failed = 0;

        $plans = \App\Models\MembershipPlan::where('tenant_id', $practice->id)
            ->where('is_active', true)
            ->where(function ($q) {
                $q->where('monthly_price', '>', 0)
                  ->orWhere('annual_price', '>', 0);
            })
            ->where(function ($q) {
                $q->whereNull('stripe_monthly_price_id')
                  ->orWhereNull('stripe_annual_price_id');
            })
            ->get();

        foreach ($plans as $plan) {
            try {
                $subscriptions->syncPlanPricesToStripe($practice, $plan);
                $synced++;
            } catch (\Throwable $e) {
                $failed++;
                Log::warning('Plan auto-sync to Stripe failed', [
                    'practice_id' => $practice->id,
                    'plan_id' => $plan->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return ['synced' => $synced, 'failed' => $failed];
    }

    /**
     * Disconnect a Connect account. Used when a practice leaves the platform
     * or in response to account.application.deauthorized webhook.
     *
     * Note: this does not delete the Stripe account itself (Stripe doesn't
     * allow that for Express accounts) — it just clears our local linkage.
     */
    public function disconnect(Practice $practice, string $reason = 'manual'): void
    {
        $previousAccountId = $practice->stripe_account_id;

        $practice->update([
            'stripe_account_id' => null,
            'stripe_connect_status' => 'disconnected',
            'stripe_charges_enabled' => false,
            'stripe_payouts_enabled' => false,
            'stripe_details_submitted' => false,
            'stripe_requirements' => null,
            'stripe_disabled_reason' => null,
        ]);

        $this->audit($practice, 'stripe_connect_disconnected', [
            'previous_stripe_account_id' => $previousAccountId,
            'reason' => $reason,
        ]);
    }

    /**
     * Compute destination-charge parameters for a payment to a connected
     * account. Returns the array fragment to merge into a Stripe charge or
     * subscription create call.
     *
     * Throws if the practice can't accept payments yet.
     */
    public function destinationChargeParams(Practice $practice, int $amountCents): array
    {
        if (!$practice->canAcceptPayments()) {
            throw new RuntimeException(
                "Practice {$practice->id} cannot accept payments yet. Connect status: {$practice->stripe_connect_status}"
            );
        }

        $params = [
            'transfer_data' => [
                'destination' => $practice->stripe_account_id,
            ],
        ];

        $feeBps = $practice->platformFeeBps();
        if ($feeBps > 0) {
            // application_fee_amount is in the smallest currency unit (cents)
            $params['application_fee_amount'] = (int) floor($amountCents * $feeBps / 10000);
        }

        return $params;
    }

    /**
     * Record a webhook event for replay/audit. Returns true on first receipt,
     * false if the event has already been processed (Stripe may retry).
     */
    public function recordWebhookEvent(string $eventId, string $eventType, ?string $accountId, ?Practice $practice, array $payload): StripeConnectEvent
    {
        return StripeConnectEvent::firstOrCreate(
            ['stripe_event_id' => $eventId],
            [
                'event_type' => $eventType,
                'stripe_account_id' => $accountId,
                'practice_id' => $practice?->id,
                'payload' => $payload,
                'processing_status' => 'received',
            ]
        );
    }

    public function markEventProcessed(StripeConnectEvent $event, ?string $error = null): void
    {
        $event->update([
            'processing_status' => $error ? 'failed' : 'processed',
            'error_message' => $error,
            'processed_at' => now(),
        ]);
    }

    /**
     * Map a Stripe Account snapshot into the local lifecycle state machine.
     *
     * not_started → no account
     * pending_onboarding → account exists, owner has not completed Stripe form
     * pending_verification → details submitted, awaiting Stripe review
     * restricted → account exists but Stripe disabled charges/payouts
     * active → charges_enabled && payouts_enabled
     */
    private function deriveStatus(Account $account): string
    {
        if ($account->charges_enabled && $account->payouts_enabled) {
            return 'active';
        }

        if (!empty($account->requirements->disabled_reason)) {
            return 'restricted';
        }

        if ($account->details_submitted) {
            return 'pending_verification';
        }

        return 'pending_onboarding';
    }

    private function audit(Practice $practice, string $action, array $metadata): void
    {
        try {
            AuditLog::create([
                'tenant_id' => $practice->id,
                'action' => $action,
                'resource' => 'Practice',
                'resource_id' => $practice->id,
                'metadata' => $metadata,
            ]);
        } catch (\Throwable $e) {
            // Audit failures must never break the primary flow
            Log::warning('Failed to write Connect audit log', [
                'practice_id' => $practice->id,
                'action' => $action,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
