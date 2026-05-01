<?php

namespace App\Services;

use App\Jobs\DeliverWebhook;
use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Fan a single domain event out to every webhook endpoint subscribed to
 * its event type. Each delivery is recorded and queued for an HTTP
 * worker that signs + posts and handles retries.
 *
 * Signing scheme (mirrors Stripe):
 *   X-MemberMD-Signature: t=<unix_ts>,v1=<hex_hmac_sha256(t.payload, secret)>
 * Practices verify by recomputing the HMAC server-side and constant-
 * time comparing. Replays are rejected by checking that t is within a
 * 5-min window.
 */
class WebhookDispatcher
{
    /**
     * Queue a delivery to every endpoint in the tenant subscribed to the
     * event type. Returns the number of deliveries queued.
     */
    public function fanOut(string $tenantId, string $eventType, array $payload): int
    {
        $endpoints = WebhookEndpoint::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('status', WebhookEndpoint::STATUS_ENABLED)
            ->get()
            ->filter(fn (WebhookEndpoint $e) => $e->subscribesTo($eventType));

        if ($endpoints->isEmpty()) {
            return 0;
        }

        // Use a single event_id across all deliveries so practices that
        // register multiple endpoints can still recognize "this is the
        // same business event" for idempotency on their side.
        $eventId = 'evt_' . Str::lower(Str::random(26));
        $envelope = array_merge(['id' => $eventId], $payload);

        $count = 0;
        foreach ($endpoints as $endpoint) {
            try {
                $body = json_encode($envelope, JSON_UNESCAPED_SLASHES);
                if ($body === false) {
                    Log::error('WebhookDispatcher: payload not JSON-encodable', [
                        'event_type' => $eventType,
                        'endpoint_id' => $endpoint->id,
                    ]);
                    continue;
                }

                $signature = $this->sign($body, $endpoint->signing_secret);

                $delivery = WebhookDelivery::create([
                    'endpoint_id' => $endpoint->id,
                    'tenant_id' => $endpoint->tenant_id,
                    'event_type' => $eventType,
                    'event_id' => $eventId,
                    'payload' => $envelope,
                    'signature' => $signature,
                    'status' => WebhookDelivery::STATUS_PENDING,
                    'attempts' => 0,
                ]);

                DeliverWebhook::dispatch($delivery->id);
                $count++;
            } catch (\Throwable $e) {
                Log::error('WebhookDispatcher: failed to enqueue delivery', [
                    'event_type' => $eventType,
                    'endpoint_id' => $endpoint->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $count;
    }

    /**
     * Sign the payload with HMAC-SHA256 keyed by the endpoint's secret.
     * Format: t=<unix_ts>,v1=<hex>. The timestamp is included inside
     * the signed material so a leaked sig can't be replayed indefinitely.
     */
    public function sign(string $payload, string $secret): string
    {
        $ts = time();
        $signedMaterial = "{$ts}.{$payload}";
        $hmac = hash_hmac('sha256', $signedMaterial, $secret);
        return "t={$ts},v1={$hmac}";
    }

    /**
     * Verify a signature header — used by tests + the practice-facing
     * "test verification" tool we expose in the dashboard.
     */
    public function verify(string $payload, string $signatureHeader, string $secret, int $toleranceSeconds = 300): bool
    {
        $parts = [];
        foreach (explode(',', $signatureHeader) as $segment) {
            [$k, $v] = array_pad(explode('=', trim($segment), 2), 2, null);
            if ($k && $v !== null) $parts[$k] = $v;
        }

        $ts = isset($parts['t']) ? (int) $parts['t'] : 0;
        $sig = $parts['v1'] ?? '';
        if (!$ts || !$sig) return false;
        if (abs(time() - $ts) > $toleranceSeconds) return false;

        $expected = hash_hmac('sha256', "{$ts}.{$payload}", $secret);
        return hash_equals($expected, $sig);
    }
}
