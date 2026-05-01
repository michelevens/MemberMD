<?php

namespace App\Services;

use App\Models\PushSubscription;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription as WebPushSubscription;
use Minishlink\WebPush\WebPush;

/**
 * Wraps Minishlink\WebPush construction so the job stays slim and the
 * service can be mocked in tests.
 *
 * Endpoints that come back as 404 or 410 are pruned automatically — those
 * status codes mean the browser revoked the subscription and we'll never
 * succeed sending to that endpoint again. 4xx other than 404/410 we leave
 * alone (could be transient — bad payload, rate limit). 5xx we leave for
 * the queue to retry.
 */
class PushNotificationDispatcher
{
    /**
     * Send a payload to all of a user's active push subscriptions.
     *
     * @param  array{title: string, body: string, url?: string, tag?: string}  $payload
     * @return array{sent: int, dropped: int, failed: int}
     */
    public function sendToUser(string $userId, array $payload): array
    {
        $subs = PushSubscription::where('user_id', $userId)->get();

        if ($subs->isEmpty()) {
            return ['sent' => 0, 'dropped' => 0, 'failed' => 0];
        }

        $auth = $this->vapidAuth();
        if (!$auth) {
            Log::warning('PushNotificationDispatcher: VAPID keys not configured; skipping send.', ['user_id' => $userId]);
            return ['sent' => 0, 'dropped' => 0, 'failed' => $subs->count()];
        }

        $webPush = new WebPush(['VAPID' => $auth]);
        $payloadJson = json_encode($this->normalizePayload($payload), JSON_UNESCAPED_SLASHES);

        $idMap = [];   // endpoint_hash → PushSubscription row
        foreach ($subs as $sub) {
            $idMap[$sub->endpoint_hash] = $sub;
            $wpSub = WebPushSubscription::create([
                'endpoint' => $sub->endpoint,
                'publicKey' => $sub->p256dh_key,
                'authToken' => $sub->auth_token,
                'contentEncoding' => 'aes128gcm',
            ]);
            $webPush->queueNotification($wpSub, $payloadJson);
        }

        $sent = 0;
        $dropped = 0;
        $failed = 0;

        foreach ($webPush->flush() as $report) {
            $endpoint = $report->getRequest()->getUri()->__toString();
            $endpointHash = PushSubscription::hashEndpoint($endpoint);
            $sub = $idMap[$endpointHash] ?? null;

            if ($report->isSuccess()) {
                $sent++;
                if ($sub) {
                    $sub->forceFill(['last_used_at' => now()])->save();
                }
                continue;
            }

            $statusCode = $report->getResponse()?->getStatusCode();
            if ($sub && in_array($statusCode, [404, 410], true)) {
                $sub->delete();
                $dropped++;
                continue;
            }

            $failed++;
            Log::warning('PushNotificationDispatcher: send failed', [
                'user_id' => $userId,
                'endpoint_hash' => substr($endpointHash, 0, 12),
                'status' => $statusCode,
                'reason' => $report->getReason(),
            ]);
        }

        return ['sent' => $sent, 'dropped' => $dropped, 'failed' => $failed];
    }

    /**
     * @return array{subject: string, publicKey: string, privateKey: string}|null
     */
    private function vapidAuth(): ?array
    {
        $public = config('services.webpush.public_key');
        $private = config('services.webpush.private_key');
        $subject = config('services.webpush.subject') ?: 'mailto:noreply@membermd.io';

        if (!$public || !$private) {
            return null;
        }

        return [
            'subject' => $subject,
            'publicKey' => $public,
            'privateKey' => $private,
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function normalizePayload(array $payload): array
    {
        return [
            'title' => (string) ($payload['title'] ?? 'MemberMD'),
            'body' => (string) ($payload['body'] ?? ''),
            'url' => isset($payload['url']) ? (string) $payload['url'] : '/',
            'tag' => isset($payload['tag']) ? (string) $payload['tag'] : null,
        ];
    }
}
