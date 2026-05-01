<?php

namespace App\Jobs;

use App\Services\PushNotificationDispatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\ThrottlesExceptions;
use Illuminate\Support\Facades\Log;

/**
 * Fan a single notification payload out to every active push subscription
 * a user has across their devices.
 *
 * The dispatcher handles per-endpoint failure/cleanup (404/410 → drop the row).
 * This job exists to (a) defer the network calls off the request thread,
 * (b) provide a retry boundary for transient transport failures, and
 * (c) give us one place to bolt on rate limiting / batching later.
 */
class SendWebPushNotification implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 30;
    public int $backoff = 30;

    /**
     * @param array{title: string, body: string, url?: string, tag?: string} $payload
     */
    public function __construct(
        public readonly string $userId,
        public readonly array $payload,
    ) {
    }

    public function middleware(): array
    {
        // Throttle per-user so a notification storm doesn't flood transport providers.
        return [(new ThrottlesExceptions(10, 60))->backoff(60)];
    }

    public function handle(PushNotificationDispatcher $dispatcher): void
    {
        $result = $dispatcher->sendToUser($this->userId, $this->payload);

        if ($result['sent'] === 0 && $result['failed'] > 0 && $result['dropped'] === 0) {
            // All endpoints failed and none were "permanent" failures —
            // throw so the queue retries with backoff.
            throw new \RuntimeException(
                "Web push send-all-failed for user {$this->userId}: " . json_encode($result),
            );
        }

        Log::debug('SendWebPushNotification dispatched', [
            'user_id' => $this->userId,
            'result' => $result,
        ]);
    }
}
