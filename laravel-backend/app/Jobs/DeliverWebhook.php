<?php

namespace App\Jobs;

use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Worker for a single WebhookDelivery row. Signs + POSTs the payload
 * and updates the row with the response. Retries with exponential
 * backoff up to MAX_ATTEMPTS; permanent failure auto-disables the
 * endpoint after AUTO_DISABLE_THRESHOLD consecutive failures.
 *
 * Backoff schedule (seconds): 30, 60, 300, 900, 3600, 7200, 18000, 43200
 *   ~ 30s, 1m, 5m, 15m, 1h, 2h, 5h, 12h — Stripe's pattern.
 *
 * 2xx responses mark the delivery delivered. 4xx (except 408/429) are
 * permanent failures — practice's endpoint rejected the payload, retrying
 * won't help. 408/429/5xx are transient — schedule the next retry.
 */
class DeliverWebhook implements ShouldQueue
{
    use Queueable;

    public int $tries = 1; // we manage retries inside handle() for finer control
    public int $timeout = 30;

    private const BACKOFF_SECONDS = [30, 60, 300, 900, 3600, 7200, 18000, 43200];

    public function __construct(public readonly string $deliveryId)
    {
    }

    public function handle(): void
    {
        $delivery = WebhookDelivery::find($this->deliveryId);
        if (!$delivery) return;
        if ($delivery->status === WebhookDelivery::STATUS_DELIVERED) return;
        if ($delivery->status === WebhookDelivery::STATUS_FAILED) return;

        $endpoint = WebhookEndpoint::withoutGlobalScope('tenant')->find($delivery->endpoint_id);
        if (!$endpoint || !$endpoint->isDeliverable()) {
            $delivery->update([
                'status' => WebhookDelivery::STATUS_FAILED,
                'error_message' => 'Endpoint disabled or removed',
            ]);
            return;
        }

        $delivery->increment('attempts');
        $delivery->update(['status' => WebhookDelivery::STATUS_RETRYING]);

        try {
            $response = Http::withHeaders([
                'Content-Type' => 'application/json',
                'User-Agent' => 'MemberMD-Webhook/1.0',
                'X-MemberMD-Event-Id' => $delivery->event_id,
                'X-MemberMD-Event-Type' => $delivery->event_type,
                'X-MemberMD-Signature' => $delivery->signature,
            ])
                ->timeout($this->timeout)
                ->retry(0)              // we manage retries ourselves
                ->withBody(
                    json_encode($delivery->payload, JSON_UNESCAPED_SLASHES) ?: '{}',
                    'application/json',
                )
                ->post($endpoint->url);

            $status = $response->status();
            $body = substr((string) $response->body(), 0, 2000);

            if ($status >= 200 && $status < 300) {
                $delivery->update([
                    'status' => WebhookDelivery::STATUS_DELIVERED,
                    'response_status' => $status,
                    'response_body' => $body,
                    'delivered_at' => now(),
                ]);
                $endpoint->update([
                    'consecutive_failures' => 0,
                    'last_success_at' => now(),
                    'status' => $endpoint->status === WebhookEndpoint::STATUS_FAILING
                        ? WebhookEndpoint::STATUS_ENABLED
                        : $endpoint->status,
                ]);
                return;
            }

            $isTransient = in_array($status, [408, 429], true) || $status >= 500;
            if (!$isTransient) {
                $this->markPermanentFailure($delivery, $endpoint, "HTTP {$status}: {$body}", $status, $body);
                return;
            }

            $this->scheduleRetryOrFail($delivery, $endpoint, "HTTP {$status}", $status, $body);
        } catch (\Throwable $e) {
            $this->scheduleRetryOrFail($delivery, $endpoint, $e->getMessage(), null, null);
        }
    }

    private function scheduleRetryOrFail(
        WebhookDelivery $delivery,
        WebhookEndpoint $endpoint,
        string $reason,
        ?int $status,
        ?string $body,
    ): void {
        if ($delivery->attempts >= WebhookDelivery::MAX_ATTEMPTS) {
            $this->markPermanentFailure($delivery, $endpoint, "Max attempts reached. Last reason: {$reason}", $status, $body);
            return;
        }

        $idx = min($delivery->attempts - 1, count(self::BACKOFF_SECONDS) - 1);
        $delay = self::BACKOFF_SECONDS[$idx];

        $delivery->update([
            'status' => WebhookDelivery::STATUS_PENDING,
            'response_status' => $status,
            'response_body' => $body,
            'error_message' => substr($reason, 0, 500),
            'next_attempt_at' => now()->addSeconds($delay),
        ]);

        $this->bumpFailures($endpoint, $reason);

        self::dispatch($delivery->id)->delay(now()->addSeconds($delay));
    }

    private function markPermanentFailure(
        WebhookDelivery $delivery,
        WebhookEndpoint $endpoint,
        string $reason,
        ?int $status,
        ?string $body,
    ): void {
        $delivery->update([
            'status' => WebhookDelivery::STATUS_FAILED,
            'response_status' => $status,
            'response_body' => $body,
            'error_message' => substr($reason, 0, 500),
        ]);
        $this->bumpFailures($endpoint, $reason);
    }

    private function bumpFailures(WebhookEndpoint $endpoint, string $reason): void
    {
        $endpoint->increment('consecutive_failures');
        $endpoint->update([
            'last_failure_at' => now(),
            'last_failure_reason' => substr($reason, 0, 500),
        ]);

        // Auto-disable runaway-broken endpoints to stop hammering the
        // practice's server. They re-enable manually from settings.
        if ($endpoint->fresh()?->consecutive_failures >= WebhookEndpoint::AUTO_DISABLE_THRESHOLD) {
            $endpoint->update(['status' => WebhookEndpoint::STATUS_DISABLED]);
            Log::warning('Webhook endpoint auto-disabled after consecutive failures', [
                'endpoint_id' => $endpoint->id,
                'tenant_id' => $endpoint->tenant_id,
                'failures' => $endpoint->consecutive_failures,
            ]);
        } elseif ($endpoint->status === WebhookEndpoint::STATUS_ENABLED && $endpoint->consecutive_failures >= 3) {
            $endpoint->update(['status' => WebhookEndpoint::STATUS_FAILING]);
        }
    }
}
