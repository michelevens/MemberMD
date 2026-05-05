<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentRefund;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Mail\PlatformPaymentFailedMail;
use App\Models\PendingEnrollment;
use App\Models\PlatformInvoice;
use App\Models\Practice;
use App\Models\PracticeSubscription;
use App\Models\StripeConnectEvent;
use App\Services\MailDispatcher;
use App\Services\MembershipCreditService;
use App\Services\MembershipEnrollmentService;
use App\Services\MembershipStateMachine;
use App\Services\StripeConnectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Stripe\Account;
use Stripe\Event;
use Stripe\Exception\SignatureVerificationException;
use Stripe\Webhook;
use Throwable;

/**
 * Stripe webhook receivers.
 *
 *   POST /api/webhooks/stripe          — platform-account events (existing platform Stripe key)
 *   POST /api/webhooks/stripe/connect  — Connect events (events on connected accounts)
 *
 * Both endpoints verify signatures against their respective webhook secrets.
 * Connect events are recorded for replay/audit, then dispatched to handlers.
 */
class StripeWebhookController extends Controller
{
    public function __construct(
        private readonly StripeConnectService $connect,
        private readonly MembershipStateMachine $states,
        private readonly MembershipCreditService $credits,
        private readonly MembershipEnrollmentService $enrollment,
    ) {
    }

    public function platform(Request $request): JsonResponse
    {
        // Tier 1 platform events (Practice→Superadmin SaaS billing). We
        // persist every received event for replay/audit even though most
        // handlers haven't been written yet — it's the audit trail that
        // matters; specific handlers light up as Tier 1 features ship.
        $secret = (string) config('services.stripe.webhook_secret');
        if ($secret === '') {
            Log::error('STRIPE_WEBHOOK_SECRET not configured');
            return response()->json(['error' => 'webhook_not_configured'], 500);
        }

        try {
            $event = $this->verifyAndConstructEvent($request, $secret);
        } catch (SignatureVerificationException) {
            return response()->json(['error' => 'invalid_signature'], 400);
        }

        // firstOrCreate gives us idempotency: a duplicate Stripe delivery
        // returns the existing row without re-inserting.
        DB::table('stripe_platform_events')->updateOrInsert(
            ['stripe_event_id' => $event->id],
            [
                'event_type' => $event->type,
                'payload' => json_encode($event->toArray()),
                'processing_status' => 'received',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );

        // Dispatch to platform-billing handlers (practice→MemberMD direction).
        // Wrapped: a handler error must not 500 the webhook (Stripe would retry
        // forever); we log + mark the row as failed and continue.
        try {
            $this->dispatchPlatformEvent($event);
            DB::table('stripe_platform_events')
                ->where('stripe_event_id', $event->id)
                ->update(['processing_status' => 'processed', 'updated_at' => now()]);
        } catch (Throwable $e) {
            Log::warning('Platform webhook handler failed', [
                'event_id' => $event->id,
                'event_type' => $event->type,
                'error' => $e->getMessage(),
            ]);
            DB::table('stripe_platform_events')
                ->where('stripe_event_id', $event->id)
                ->update([
                    'processing_status' => 'failed',
                    'updated_at' => now(),
                ]);
        }

        return response()->json(['received' => true]);
    }

    /**
     * Dispatch the verified platform event to the right handler. Only events
     * whose metadata.tier === 'platform_subscription' (set by PlatformBillingService
     * when creating subscriptions) are routed — other platform events are recorded
     * but ignored.
     */
    private function dispatchPlatformEvent(Event $event): void
    {
        $obj = $event->data->object ?? null;
        if (!$obj) {
            return;
        }

        // Pull metadata. For invoices, the subscription metadata isn't on the
        // invoice itself — we look the subscription up by id below.
        $isOurEvent = false;
        $subscriptionId = null;

        if (in_array($event->type, ['invoice.paid', 'invoice.payment_failed', 'invoice.finalized', 'invoice.voided'], true)) {
            $subscriptionId = $obj->subscription ?? null;
            if ($subscriptionId) {
                $sub = PracticeSubscription::where('stripe_subscription_id', $subscriptionId)->first();
                $isOurEvent = $sub !== null;
            }
        } elseif (str_starts_with($event->type, 'customer.subscription.')) {
            $subscriptionId = $obj->id ?? null;
            $metaTier = $obj->metadata->tier ?? null;
            $isOurEvent = $metaTier === 'platform_subscription'
                || PracticeSubscription::where('stripe_subscription_id', $subscriptionId)->exists();
        } elseif ($event->type === 'checkout.session.completed') {
            // Checkout sessions carry our metadata.tier when we created them
            $metaTier = $obj->metadata->tier ?? null;
            $isOurEvent = $metaTier === 'platform_subscription';
        }

        if (!$isOurEvent) {
            return;
        }

        match ($event->type) {
            'checkout.session.completed' => $this->handleCheckoutSessionCompleted($obj),
            'invoice.paid' => $this->handleInvoicePaid($obj),
            'invoice.payment_failed' => $this->handleInvoicePaymentFailed($obj),
            'invoice.finalized' => $this->handleInvoiceFinalized($obj),
            'invoice.voided' => $this->handleInvoiceVoided($obj),
            'customer.subscription.updated' => $this->handleSubscriptionUpdated($obj),
            'customer.subscription.deleted' => $this->handleSubscriptionDeleted($obj),
            'customer.subscription.trial_will_end' => null, // Email reminder handled via cron, not webhook
            default => null,
        };
    }

    /**
     * Stripe Checkout completed for a platform subscription. Stamp the new
     * subscription id on the practice_subscriptions row + flip status to
     * active. The subscription was created on Stripe's side as part of
     * Checkout — we just need to mirror it locally.
     */
    private function handleCheckoutSessionCompleted($session): void
    {
        $practiceSubId = $session->metadata->practice_subscription_id ?? null;
        $sub = $practiceSubId ? PracticeSubscription::find($practiceSubId) : null;
        if (!$sub) return;

        $stripeSubId = $session->subscription ?? null;
        $customerId = $session->customer ?? null;

        $sub->update([
            'stripe_subscription_id' => $stripeSubId ?: $sub->stripe_subscription_id,
            'stripe_customer_id' => $customerId ?: $sub->stripe_customer_id,
            'status' => 'active',
        ]);

        // Sync period dates from the Stripe subscription so the UI shows
        // the next-billing date immediately rather than waiting for the
        // first invoice.paid webhook.
        if ($stripeSubId && $this->billingService()) {
            try {
                $stripeSub = $this->billingService()->stripeRetrieveSubscription($stripeSubId);
                if ($stripeSub) {
                    $sub->update([
                        'current_period_start' => $stripeSub->current_period_start
                            ? now()->setTimestamp($stripeSub->current_period_start) : null,
                        'current_period_end' => $stripeSub->current_period_end
                            ? now()->setTimestamp($stripeSub->current_period_end) : null,
                        'trial_ends_at' => $stripeSub->trial_end
                            ? now()->setTimestamp($stripeSub->trial_end) : $sub->trial_ends_at,
                    ]);
                }
            } catch (\Throwable $e) {
                Log::warning('Failed to sync period dates after checkout', [
                    'practice_subscription_id' => $sub->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    /**
     * Lazily resolve PlatformBillingService for the post-checkout subscription
     * details fetch. We don't constructor-inject because StripeWebhookController
     * is one of Laravel's earliest-bound controllers and adding deps there
     * is risky; resolving on demand is fine.
     */
    private function billingService(): ?\App\Services\PlatformBillingService
    {
        try {
            return app(\App\Services\PlatformBillingService::class);
        } catch (\Throwable) {
            return null;
        }
    }

    private function handleInvoicePaid($invoice): void
    {
        $sub = PracticeSubscription::where('stripe_subscription_id', $invoice->subscription)->first();
        if (!$sub) return;

        $this->upsertPlatformInvoice($sub, $invoice, status: 'paid', paidAt: now());

        // If we were past_due and just got paid, flip back to active.
        if ($sub->status === 'past_due') {
            $sub->update(['status' => 'active']);
        }
    }

    private function handleInvoicePaymentFailed($invoice): void
    {
        $sub = PracticeSubscription::where('stripe_subscription_id', $invoice->subscription)->first();
        if (!$sub) return;

        $this->upsertPlatformInvoice($sub, $invoice, status: 'open');

        if ($sub->status === 'active' || $sub->status === 'trial') {
            $sub->update(['status' => 'past_due']);
        }

        // Notify the practice. Idempotent on stripe_invoice_id so a retry of
        // the same invoice doesn't double-mail; Stripe sends a new event id
        // per attempt but the underlying invoice id stays the same.
        $key = "payment_failed_invoice_{$invoice->id}";
        if (!$sub->hasSentNotification($key)) {
            $platformInvoice = PlatformInvoice::where('stripe_invoice_id', $invoice->id)->first();
            $practice = $sub->practice ?? Practice::find($sub->practice_id);
            $recipient = $practice?->owner_email ?? $practice?->email;
            if ($platformInvoice && $recipient) {
                $sent = MailDispatcher::send(
                    $recipient,
                    new PlatformPaymentFailedMail($sub, $platformInvoice),
                    "platform_billing.{$key}",
                );
                if ($sent) {
                    $sub->markNotificationSent($key);
                }
            }
        }
    }

    private function handleInvoiceFinalized($invoice): void
    {
        $sub = PracticeSubscription::where('stripe_subscription_id', $invoice->subscription)->first();
        if (!$sub) return;

        $this->upsertPlatformInvoice($sub, $invoice, status: $invoice->status ?? 'open');
    }

    private function handleInvoiceVoided($invoice): void
    {
        $sub = PracticeSubscription::where('stripe_subscription_id', $invoice->subscription)->first();
        if (!$sub) return;

        $this->upsertPlatformInvoice($sub, $invoice, status: 'void');
    }

    private function handleSubscriptionUpdated($stripeSub): void
    {
        $sub = PracticeSubscription::where('stripe_subscription_id', $stripeSub->id)->first();
        if (!$sub) return;

        $newStatus = match ($stripeSub->status ?? 'active') {
            'trialing' => 'trial',
            'active' => 'active',
            'past_due', 'unpaid' => 'past_due',
            'canceled', 'incomplete_expired' => 'cancelled',
            'paused' => 'paused',
            default => $sub->status,
        };

        $updates = [
            'status' => $newStatus,
            'current_period_start' => $stripeSub->current_period_start
                ? now()->setTimestamp($stripeSub->current_period_start) : $sub->current_period_start,
            'current_period_end' => $stripeSub->current_period_end
                ? now()->setTimestamp($stripeSub->current_period_end) : $sub->current_period_end,
            'trial_ends_at' => $stripeSub->trial_end
                ? now()->setTimestamp($stripeSub->trial_end) : $sub->trial_ends_at,
        ];

        // cancel_at_period_end → mirror to local cancels_at
        if (!empty($stripeSub->cancel_at_period_end) && empty($sub->cancels_at)) {
            $updates['cancels_at'] = $stripeSub->cancel_at
                ? now()->setTimestamp($stripeSub->cancel_at)
                : ($stripeSub->current_period_end ? now()->setTimestamp($stripeSub->current_period_end) : now());
        } elseif (empty($stripeSub->cancel_at_period_end) && !empty($sub->cancels_at) && empty($sub->cancelled_at)) {
            // Reactivated on Stripe side — clear local pending cancel
            $updates['cancels_at'] = null;
        }

        $sub->update($updates);
    }

    private function handleSubscriptionDeleted($stripeSub): void
    {
        $sub = PracticeSubscription::where('stripe_subscription_id', $stripeSub->id)->first();
        if (!$sub) return;

        $sub->update([
            'status' => 'cancelled',
            'cancelled_at' => $sub->cancelled_at ?? now(),
        ]);
    }

    /**
     * Mirror a Stripe invoice into platform_invoices. Idempotent on stripe_invoice_id.
     */
    private function upsertPlatformInvoice(
        PracticeSubscription $sub,
        $invoice,
        string $status,
        ?\Illuminate\Support\Carbon $paidAt = null,
    ): void {
        $lineItems = [];
        foreach (($invoice->lines->data ?? []) as $line) {
            $lineItems[] = [
                'description' => $line->description ?? '',
                'amount' => ($line->amount ?? 0) / 100,
                'quantity' => $line->quantity ?? 1,
                'price_id' => $line->price->id ?? null,
                'period_start' => isset($line->period->start) ? now()->setTimestamp($line->period->start)->toIso8601String() : null,
                'period_end' => isset($line->period->end) ? now()->setTimestamp($line->period->end)->toIso8601String() : null,
            ];
        }

        PlatformInvoice::updateOrCreate(
            ['stripe_invoice_id' => $invoice->id],
            [
                'practice_id' => $sub->practice_id,
                'practice_subscription_id' => $sub->id,
                'stripe_invoice_number' => $invoice->number ?? null,
                'amount_subtotal_cents' => $invoice->subtotal ?? 0,
                'amount_tax_cents' => $invoice->tax ?? 0,
                'amount_total_cents' => $invoice->total ?? 0,
                'amount_paid_cents' => $invoice->amount_paid ?? 0,
                'status' => $status,
                'line_items' => $lineItems,
                'issued_at' => $invoice->created ? now()->setTimestamp($invoice->created) : null,
                'due_at' => $invoice->due_date ? now()->setTimestamp($invoice->due_date) : null,
                'paid_at' => $paidAt,
                'hosted_invoice_url' => $invoice->hosted_invoice_url ?? null,
                'invoice_pdf_url' => $invoice->invoice_pdf ?? null,
            ],
        );
    }

    public function connect(Request $request): JsonResponse
    {
        $secret = (string) config('services.stripe.connect_webhook_secret');
        if ($secret === '') {
            // Avoid blindly accepting events when the secret is unconfigured —
            // refuse so misconfiguration is loud.
            Log::error('STRIPE_CONNECT_WEBHOOK_SECRET not configured');
            return response()->json(['error' => 'webhook_not_configured'], 500);
        }

        try {
            $event = $this->verifyAndConstructEvent($request, $secret);
        } catch (SignatureVerificationException $e) {
            return response()->json(['error' => 'invalid_signature'], 400);
        }

        $accountId = $event->account ?? null;
        $practice = $accountId
            ? Practice::where('stripe_account_id', $accountId)->first()
            : null;

        $this->connect->recordWebhookEvent(
            $event->id,
            $event->type,
            $accountId,
            $practice,
            $event->toArray()
        );

        // Idempotency under concurrency: re-fetch the event row inside a
        // transaction with a row-level lock. Two simultaneous Stripe deliveries
        // of the same event_id will block on the same row; the first to win
        // the lock processes, the second sees status='processed' and acks.
        $alreadyProcessed = false;
        $handlerError = null;

        try {
            DB::transaction(function () use ($event, $practice, &$alreadyProcessed, &$handlerError) {
                $locked = StripeConnectEvent::where('stripe_event_id', $event->id)
                    ->lockForUpdate()
                    ->first();

                if (!$locked) {
                    // Should be impossible — recordWebhookEvent just inserted it.
                    $handlerError = 'event row missing after insert';
                    return;
                }

                if ($locked->processing_status === 'processed') {
                    $alreadyProcessed = true;
                    return;
                }

                try {
                    $this->dispatch($event, $practice);
                    $this->connect->markEventProcessed($locked);
                } catch (Throwable $e) {
                    Log::error('Stripe Connect webhook handler failed', [
                        'event_id' => $event->id,
                        'event_type' => $event->type,
                        'error' => $e->getMessage(),
                    ]);
                    $this->connect->markEventProcessed($locked, $e->getMessage());
                    $handlerError = $e->getMessage();
                }
            });
        } catch (Throwable $e) {
            Log::error('Stripe Connect webhook transaction failed', [
                'event_id' => $event->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['error' => 'handler_failed'], 500);
        }

        if ($alreadyProcessed) {
            return response()->json(['received' => true, 'duplicate' => true]);
        }

        if ($handlerError !== null) {
            return response()->json(['error' => 'handler_failed'], 500);
        }

        return response()->json(['received' => true]);
    }

    private function verifyAndConstructEvent(Request $request, string $secret): Event
    {
        $payload = $request->getContent();
        $signature = $request->header('Stripe-Signature', '');

        return Webhook::constructEvent($payload, $signature, $secret);
    }

    private function dispatch(Event $event, ?Practice $practice): void
    {
        switch ($event->type) {
            case 'account.updated':
                if ($practice && $event->data->object instanceof Account) {
                    $this->connect->syncAccountStatus($practice, $event->data->object);
                }
                break;

            case 'account.application.deauthorized':
                if ($practice) {
                    $this->connect->disconnect($practice, 'stripe_deauthorized');
                }
                break;

            case 'capability.updated':
                // Capability changes (card_payments / transfers) flip
                // charges_enabled / payouts_enabled — refresh from source.
                if ($practice) {
                    $this->connect->syncAccountStatus($practice);
                }
                break;

            case 'payout.created':
            case 'payout.paid':
            case 'payout.failed':
                // Recorded in stripe_connect_events for now; payout reporting
                // UI consumes from there. No additional action.
                break;

            // ─── Tier 2 subscription / invoice events ─────────────────────
            case 'invoice.paid':
            case 'invoice.payment_succeeded':
                $this->handleInvoicePaidForConnect($event, $practice);
                break;

            case 'invoice.payment_failed':
                $this->handleInvoicePaymentFailedForConnect($event, $practice);
                break;

            case 'customer.subscription.deleted':
                $this->handleSubscriptionDeletedForConnect($event, $practice);
                break;

            case 'customer.subscription.updated':
                $this->handleSubscriptionUpdatedForConnect($event, $practice);
                break;

            case 'charge.refunded':
                $this->handleChargeRefunded($event, $practice);
                break;

            case 'checkout.session.completed':
                $this->handleCheckoutSessionCompletedForConnect($event, $practice);
                break;

            default:
                // Unknown but valid event — recorded, no-op.
                break;
        }
    }

    // ─── Tier 2 handlers ─────────────────────────────────────────────────────

    /**
     * Successful periodic charge. Persist a paid Invoice + Payment locally,
     * extend the membership's current_period_end, and roll entitlements.
     */
    private function handleInvoicePaidForConnect(Event $event, ?Practice $practice): void
    {
        if (!$practice) return;

        $stripeInvoice = $event->data->object;
        $subscriptionId = $stripeInvoice->subscription ?? null;
        if (!$subscriptionId) return; // ignore one-off invoices not tied to a sub

        $membership = PatientMembership::where('tenant_id', $practice->id)
            ->where('stripe_subscription_id', $subscriptionId)
            ->first();
        if (!$membership) return;

        // Reject stale events — Stripe doesn't guarantee delivery order, so
        // an old event arriving late could overwrite fresher state. Compare
        // event.created against the membership's last-processed timestamp.
        if (!$this->states->ifStripeEventNewerThanLast($membership, $event->created ?? null)) {
            return;
        }

        $amount = ($stripeInvoice->amount_paid ?? 0) / 100;

        $invoice = Invoice::firstOrCreate(
            [
                'tenant_id' => $practice->id,
                'stripe_invoice_id' => $stripeInvoice->id,
            ],
            [
                'patient_id' => $membership->patient_id,
                'membership_id' => $membership->id,
                'amount' => $amount,
                'tax' => 0,
                'status' => 'paid',
                'paid_at' => now(),
                'pdf_url' => $stripeInvoice->hosted_invoice_url ?? null,
                'line_items' => $this->extractLineItems($stripeInvoice),
            ],
        );

        // Defensive: an existing draft/open invoice flips to paid on subsequent
        // attempts. Don't double-create payments — match by stripe id.
        if ($invoice->status !== 'paid') {
            $invoice->update([
                'status' => 'paid',
                'paid_at' => now(),
            ]);
        }

        $chargeId = $stripeInvoice->charge ?? null;
        if ($chargeId) {
            Payment::firstOrCreate(
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
        }

        // Roll the membership period forward and clear any dunning state.
        $updates = [];
        if (!empty($stripeInvoice->period_end)) {
            $updates['current_period_end'] = now()->setTimestamp($stripeInvoice->period_end);
        }
        if (!empty($stripeInvoice->period_start)) {
            $updates['current_period_start'] = now()->setTimestamp($stripeInvoice->period_start);
        }
        if (!empty($updates)) {
            $membership->update($updates);
        }
        // If the membership had been past_due, this charge brings it back.
        // Routed through the state machine so an admin-driven 'paused' or
        // 'cancelled' is preserved (those transitions aren't allowed back to
        // active via this path).
        if ($membership->status === 'past_due') {
            $this->states->transition($membership->fresh(), 'active');
        }
        $this->states->stampStripeEventAt($membership->fresh(), $event->created ?? null);

        // Reconcile any membership credits this invoice consumed (QA
        // scenario #10). starting_balance / ending_balance on the Stripe
        // invoice tell us how much customer-balance credit was applied.
        // This is the read-side bookkeeping; the actual offset to the
        // charge already happened on Stripe via the customer balance.
        $this->credits->reconcileFromInvoice(
            $membership->fresh(),
            $stripeInvoice->id,
            $stripeInvoice->starting_balance ?? null,
            $stripeInvoice->ending_balance ?? null,
        );

        $this->audit($practice, 'tier2_invoice_paid', [
            'membership_id' => $membership->id,
            'stripe_invoice_id' => $stripeInvoice->id,
            'amount' => $amount,
        ]);
    }

    /**
     * Charge failed. Mark membership past_due and let the dunning executor
     * (scheduled job) take it from there per the practice's policy.
     */
    private function handleInvoicePaymentFailedForConnect(Event $event, ?Practice $practice): void
    {
        if (!$practice) return;

        $stripeInvoice = $event->data->object;
        $subscriptionId = $stripeInvoice->subscription ?? null;
        if (!$subscriptionId) return;

        $membership = PatientMembership::where('tenant_id', $practice->id)
            ->where('stripe_subscription_id', $subscriptionId)
            ->first();
        if (!$membership) return;

        if (!$this->states->ifStripeEventNewerThanLast($membership, $event->created ?? null)) {
            return;
        }

        // Persist an Invoice row so admins can see the open balance.
        $amount = ($stripeInvoice->amount_due ?? 0) / 100;
        Invoice::firstOrCreate(
            [
                'tenant_id' => $practice->id,
                'stripe_invoice_id' => $stripeInvoice->id,
            ],
            [
                'patient_id' => $membership->patient_id,
                'membership_id' => $membership->id,
                'amount' => $amount,
                'tax' => 0,
                'status' => 'pending',
                'pdf_url' => $stripeInvoice->hosted_invoice_url ?? null,
                'line_items' => $this->extractLineItems($stripeInvoice),
            ],
        );

        // Routed through the state machine — only legal transitions apply,
        // so an admin-paused or cancelled membership is left alone.
        $this->states->transition($membership, 'past_due');
        $this->states->stampStripeEventAt($membership->fresh(), $event->created ?? null);

        $this->audit($practice, 'tier2_invoice_payment_failed', [
            'membership_id' => $membership->id,
            'stripe_invoice_id' => $stripeInvoice->id,
            'amount_due' => $amount,
            'attempt_count' => $stripeInvoice->attempt_count ?? null,
        ]);
    }

    /**
     * Subscription deleted on Stripe (either expired after cancel_at_period_end
     * or hard-cancelled). Mirror locally; preserve any existing cancel_reason.
     */
    private function handleSubscriptionDeletedForConnect(Event $event, ?Practice $practice): void
    {
        if (!$practice) return;

        $sub = $event->data->object;
        $membership = PatientMembership::where('tenant_id', $practice->id)
            ->where('stripe_subscription_id', $sub->id)
            ->first();
        if (!$membership) return;

        if (!$this->states->ifStripeEventNewerThanLast($membership, $event->created ?? null)) {
            return;
        }

        // State machine takes care of the cascade to dependents and rejects
        // the no-op when already cancelled.
        $this->states->transition($membership, 'cancelled', [
            'cancelled_at' => $membership->cancelled_at ?? now(),
            'cancel_reason' => $membership->cancel_reason ?? 'stripe_subscription_deleted',
        ]);
        $this->states->stampStripeEventAt($membership->fresh(), $event->created ?? null);

        $this->audit($practice, 'tier2_subscription_deleted', [
            'membership_id' => $membership->id,
            'stripe_subscription_id' => $sub->id,
        ]);
    }

    /**
     * Subscription state change (status, period, cancel_at_period_end flag).
     * Most-useful: track impending cancellation set via the Stripe Dashboard
     * or a downstream support tool.
     */
    private function handleSubscriptionUpdatedForConnect(Event $event, ?Practice $practice): void
    {
        if (!$practice) return;

        $sub = $event->data->object;
        $membership = PatientMembership::where('tenant_id', $practice->id)
            ->where('stripe_subscription_id', $sub->id)
            ->first();
        if (!$membership) return;

        if (!$this->states->ifStripeEventNewerThanLast($membership, $event->created ?? null)) {
            return;
        }

        // Field updates that don't affect status (period dates).
        $updates = [];
        if (!empty($sub->current_period_end)) {
            $updates['current_period_end'] = now()->setTimestamp($sub->current_period_end);
        }
        if (!empty($sub->current_period_start)) {
            $updates['current_period_start'] = now()->setTimestamp($sub->current_period_start);
        }
        if (!empty($updates)) {
            $membership->update($updates);
        }

        // Status changes via the state machine — admin-set 'paused' stays
        // sticky because past_due isn't a legal transition out of paused.
        $stripeStatus = $sub->status ?? null;
        if (in_array($stripeStatus, ['past_due', 'unpaid'], true)) {
            $this->states->transition($membership->fresh(), 'past_due');
        } elseif ($stripeStatus === 'active') {
            $this->states->transition($membership->fresh(), 'active');
        }
        $this->states->stampStripeEventAt($membership->fresh(), $event->created ?? null);
    }

    /**
     * A charge was refunded on Stripe — could be from our PaymentController,
     * the Stripe Dashboard, or a dispute. Reconcile the local Payment row.
     */
    private function handleChargeRefunded(Event $event, ?Practice $practice): void
    {
        if (!$practice) return;

        $charge = $event->data->object;
        $payment = Payment::where('tenant_id', $practice->id)
            ->where('stripe_payment_id', $charge->id)
            ->first();
        if (!$payment) return;

        // Stripe sends one charge.refunded event per charge state change,
        // and `charge.refunds.data` holds every individual refund. We
        // upsert each refund row by stripe_refund_id so manual refunds
        // (already written by PaymentController) and dashboard/dispute
        // refunds all land here exactly once.
        $refunds = $charge->refunds->data ?? [];
        foreach ($refunds as $r) {
            if (empty($r->id)) continue;
            $existing = PaymentRefund::where('stripe_refund_id', $r->id)->first();
            if ($existing) continue; // already recorded (manual or earlier webhook)

            PaymentRefund::create([
                'tenant_id' => $practice->id,
                'payment_id' => $payment->id,
                'amount' => ($r->amount ?? 0) / 100,
                'reason' => $r->reason ?? null,
                'source' => 'webhook',
                'stripe_refund_id' => $r->id,
                'refunded_at' => $r->created
                    ? now()->setTimestamp($r->created)
                    : now(),
            ]);
        }

        // Refund total = SUM of ledger, not the latest single value.
        $totalRefunded = (float) PaymentRefund::where('payment_id', $payment->id)->sum('amount');
        $isFull = $totalRefunded >= (float) $payment->amount - 0.005;

        $payment->update([
            'status' => $isFull ? 'refunded' : $payment->status,
            'refund_amount' => $totalRefunded,
            'refunded_at' => now(),
        ]);

        if ($payment->invoice_id) {
            $invoice = Invoice::find($payment->invoice_id);
            if ($invoice) {
                $totalCompleted = $invoice->payments()
                    ->where('status', 'completed')
                    ->sum('amount');
                if ($totalCompleted < $invoice->amount) {
                    $invoice->update(['status' => 'pending', 'paid_at' => null]);
                }
            }
        }

        $this->audit($practice, 'tier2_charge_refunded', [
            'payment_id' => $payment->id,
            'stripe_charge_id' => $charge->id,
            'total_refunded' => $totalRefunded,
            'full' => $isFull,
        ]);
    }

    /**
     * checkout.session.completed → convert PendingEnrollment into a real
     * PatientMembership. The session metadata carries pending_enrollment_id
     * (we set it at create time) so we look up the side row, run the
     * shared enrollment service, and stamp the resulting membership back.
     *
     * Idempotent: if the pending row was already claimed (webhook
     * delivered twice), we no-op. Stripe webhooks can fire duplicates,
     * and we don't want to create two memberships for one paid session.
     */
    private function handleCheckoutSessionCompletedForConnect(Event $event, ?Practice $practice): void
    {
        if (!$practice) return;
        $this->convertCheckoutSession($event->data->object, $practice, 'checkout.session.completed');
    }

    /**
     * Conversion logic shared between the webhook handler and the admin
     * reconcile endpoint. Takes a Stripe Checkout Session object (live
     * from Stripe API or from a webhook payload) and converts the linked
     * PendingEnrollment into a real PatientMembership.
     *
     * Returns the resulting membership on success, null on any no-op
     * outcome (already claimed, unpaid, missing references). Throws on
     * unexpected errors so the caller can decide how to surface.
     *
     * Idempotent: safe to call repeatedly with the same session.
     */
    public function convertCheckoutSession(
        object $session,
        Practice $practice,
        string $source,
    ): ?PatientMembership {
        $pendingId = is_object($session->metadata ?? null)
            ? ($session->metadata->pending_enrollment_id ?? null)
            : (is_array($session->metadata ?? null) ? ($session->metadata['pending_enrollment_id'] ?? null) : null);

        if (empty($pendingId)) {
            return null;
        }

        if (($session->payment_status ?? '') !== 'paid') {
            Log::info('Checkout session not paid — skipping enrollment', [
                'pending_enrollment_id' => $pendingId,
                'payment_status' => $session->payment_status ?? null,
                'source' => $source,
            ]);
            return null;
        }

        $pending = PendingEnrollment::where('tenant_id', $practice->id)
            ->where('id', $pendingId)
            ->first();
        if (!$pending) {
            Log::warning('PendingEnrollment not found for checkout session', [
                'pending_enrollment_id' => $pendingId,
                'tenant_id' => $practice->id,
                'source' => $source,
            ]);
            return null;
        }

        if ($pending->status !== PendingEnrollment::STATUS_PENDING) {
            // Already claimed — return the existing membership for the caller.
            return $pending->claimed_membership_id
                ? PatientMembership::find($pending->claimed_membership_id)
                : null;
        }

        $patient = Patient::find($pending->patient_id);
        $plan = MembershipPlan::find($pending->plan_id);
        if (!$patient || !$plan) {
            Log::warning('PendingEnrollment refers to missing patient or plan', [
                'pending_enrollment_id' => $pending->id,
            ]);
            return null;
        }

        try {
            $membership = $this->enrollment->enroll(
                practice: $practice,
                patient: $patient,
                plan: $plan,
                billingFrequency: $pending->billing_frequency ?? 'monthly',
                isComp: false,
                compReason: null,
                sourceUserId: $pending->created_by_user_id,
                paymentMethodId: null,
                source: $source,
                existingStripeSubscriptionId: $session->subscription ?? null,
                existingStripeCustomerId: $session->customer ?? $pending->stripe_customer_id,
                // Carry the Founding Member / comp waiver decision
                // from the pending row through to the membership
                // snapshot. The Stripe checkout already suppressed
                // the line item; this captures the audit trail.
                waiveEnrollmentFee: (bool) ($pending->waive_enrollment_fee ?? false),
                waiverReason: $pending->waiver_reason,
            );
        } catch (\Throwable $e) {
            Log::error('Failed to convert PendingEnrollment to membership after paid checkout', [
                'pending_enrollment_id' => $pending->id,
                'stripe_session_id' => $session->id,
                'source' => $source,
                'error' => $e->getMessage(),
            ]);
            $this->audit($practice, 'tier2_pending_enrollment_conversion_failed', [
                'pending_enrollment_id' => $pending->id,
                'stripe_session_id' => $session->id,
                'source' => $source,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }

        $pending->update([
            'status' => PendingEnrollment::STATUS_CLAIMED,
            'claimed_membership_id' => $membership->id,
            'claimed_at' => now(),
        ]);

        // Flip the mirrored widget_submission row (written at /external/enroll
        // time) so the practice's Intake tab shows the enrollment as converted
        // instead of indefinitely pending. Keyed on pending_enrollment_id
        // rather than patient_id to avoid colliding with other in-flight
        // submissions for the same patient.
        try {
            \App\Models\WidgetSubmission::withoutGlobalScope('tenant')
                ->where('tenant_id', $practice->id)
                ->where('pending_enrollment_id', $pending->id)
                ->update([
                    'status' => 'converted',
                    'converted_patient_id' => $patient->id,
                    'converted_at' => now(),
                ]);
        } catch (\Throwable $e) {
            Log::warning('WidgetSubmission flip-to-converted failed after Checkout', [
                'pending_enrollment_id' => $pending->id,
                'membership_id' => $membership->id,
                'error' => $e->getMessage(),
            ]);
        }

        $consentPayload = $pending->consent_payload ?? null;
        if (is_array($consentPayload) && !empty($consentPayload['types'])) {
            try {
                \App\Http\Controllers\Api\ExternalController::writeConsentSignatures(
                    practice: $practice,
                    patient: $patient,
                    membership: $membership,
                    consentTypes: (array) $consentPayload['types'],
                    signatureData: (string) ($consentPayload['signature_data'] ?? ''),
                    ip: $pending->signed_ip,
                    userAgent: $pending->signed_user_agent,
                    timezone: $consentPayload['timezone'] ?? null,
                    tzOffsetMinutes: isset($consentPayload['tz_offset_minutes']) ? (int) $consentPayload['tz_offset_minutes'] : null,
                );
            } catch (\Throwable $e) {
                Log::warning('Consent replay failed after Checkout conversion', [
                    'pending_enrollment_id' => $pending->id,
                    'membership_id' => $membership->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        try {
            $patient->loadMissing('user');
            \App\Http\Controllers\Api\ExternalController::firePostEnrollmentNotifications(
                practice: $practice,
                patient: $patient,
                user: $patient->user,
                membership: $membership,
                patientEmail: $patient->email,
                patientName: trim(($patient->first_name ?? '') . ' ' . ($patient->last_name ?? '')),
            );
        } catch (\Throwable $e) {
            Log::warning('Post-enrollment notifications failed after Checkout conversion', [
                'pending_enrollment_id' => $pending->id,
                'membership_id' => $membership->id,
                'error' => $e->getMessage(),
            ]);
        }

        $this->audit($practice, 'tier2_payment_link_claimed', [
            'pending_enrollment_id' => $pending->id,
            'membership_id' => $membership->id,
            'stripe_session_id' => $session->id,
            'stripe_subscription_id' => $session->subscription ?? null,
            'origin' => $consentPayload ? 'external_widget' : 'admin_payment_link',
            'source' => $source,
        ]);

        return $membership;
    }

    private function extractLineItems(object $stripeInvoice): array
    {
        $items = [];
        $rows = $stripeInvoice->lines->data ?? [];
        foreach ($rows as $row) {
            $items[] = [
                'description' => $row->description ?? '',
                'amount' => ($row->amount ?? 0) / 100,
                'quantity' => $row->quantity ?? 1,
                'period_start' => $row->period->start ?? null,
                'period_end' => $row->period->end ?? null,
            ];
        }
        return $items;
    }

    private function audit(Practice $practice, string $action, array $metadata): void
    {
        try {
            AuditLog::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $practice->id,
                'action' => $action,
                'resource' => 'PatientMembership',
                'resource_id' => $metadata['membership_id'] ?? null,
                'metadata' => $metadata,
            ]);
        } catch (Throwable $e) {
            Log::warning('Audit write failed for Tier 2 webhook event', [
                'action' => $action,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
