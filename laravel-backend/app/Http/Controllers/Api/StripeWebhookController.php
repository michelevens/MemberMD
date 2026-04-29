<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Practice;
use App\Models\StripeConnectEvent;
use App\Services\StripeConnectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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
    public function __construct(private readonly StripeConnectService $connect)
    {
    }

    public function platform(Request $request): JsonResponse
    {
        // Reserved for platform-account events (subscription lifecycle on the
        // platform itself, e.g., MemberMD's own billing of operators). Stub
        // returns 200 so Stripe stops retrying; real handlers ship with
        // subscription billing work.
        try {
            $this->verifyAndConstructEvent($request, (string) config('services.stripe.webhook_secret'));
        } catch (SignatureVerificationException $e) {
            return response()->json(['error' => 'invalid_signature'], 400);
        }

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

        $eventRecord = $this->connect->recordWebhookEvent(
            $event->id,
            $event->type,
            $accountId,
            $practice,
            $event->toArray()
        );

        // Idempotency: if this event was already processed, ack and stop.
        if ($eventRecord->processing_status === 'processed') {
            return response()->json(['received' => true, 'duplicate' => true]);
        }

        try {
            $this->dispatch($event, $practice);
            $this->connect->markEventProcessed($eventRecord);
        } catch (Throwable $e) {
            Log::error('Stripe Connect webhook handler failed', [
                'event_id' => $event->id,
                'event_type' => $event->type,
                'error' => $e->getMessage(),
            ]);
            $this->connect->markEventProcessed($eventRecord, $e->getMessage());

            // Return 500 so Stripe retries. Don't leak internals.
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

            default:
                // Unknown but valid event — recorded, no-op.
                break;
        }
    }
}
