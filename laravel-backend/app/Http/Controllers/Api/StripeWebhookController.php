<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentRefund;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\StripeConnectEvent;
use App\Services\MembershipCreditService;
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

        return response()->json(['received' => true]);
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
                $this->handleInvoicePaid($event, $practice);
                break;

            case 'invoice.payment_failed':
                $this->handleInvoicePaymentFailed($event, $practice);
                break;

            case 'customer.subscription.deleted':
                $this->handleSubscriptionDeleted($event, $practice);
                break;

            case 'customer.subscription.updated':
                $this->handleSubscriptionUpdated($event, $practice);
                break;

            case 'charge.refunded':
                $this->handleChargeRefunded($event, $practice);
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
    private function handleInvoicePaid(Event $event, ?Practice $practice): void
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
    private function handleInvoicePaymentFailed(Event $event, ?Practice $practice): void
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
    private function handleSubscriptionDeleted(Event $event, ?Practice $practice): void
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
    private function handleSubscriptionUpdated(Event $event, ?Practice $practice): void
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
