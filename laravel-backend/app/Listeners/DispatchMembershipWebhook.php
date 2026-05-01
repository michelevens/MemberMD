<?php

namespace App\Listeners;

use App\Events\MembershipStateChanged;
use App\Services\WebhookDispatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * Bridge between domain events and outbound webhooks.
 *
 * Every membership state transition fires MembershipStateChanged. This
 * listener converts the event into a webhook envelope and asks the
 * dispatcher to fan it out to every endpoint in the tenant subscribed
 * to the event type. Implements ShouldQueue so the practice's render
 * thread isn't blocked on dispatcher writes.
 */
class DispatchMembershipWebhook implements ShouldQueue
{
    public function handle(MembershipStateChanged $event): void
    {
        try {
            $dispatcher = app(WebhookDispatcher::class);
            $dispatcher->fanOut(
                tenantId: $event->membership->tenant_id,
                eventType: $event->eventName(),
                payload: $event->toWebhookPayload(),
            );
        } catch (\Throwable $e) {
            Log::error('DispatchMembershipWebhook failed', [
                'event' => $event->eventName(),
                'membership_id' => $event->membership->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
