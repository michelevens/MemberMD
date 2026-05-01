<?php

namespace App\Listeners;

use App\Events\MembershipStateChanged;
use App\Models\MembershipStateTransition;
use Illuminate\Support\Facades\Log;

/**
 * Persist every membership state change to the immutable transition log.
 *
 * Synchronous (NOT ShouldQueue) so the row is durable before the request
 * thread returns — practices reading the history immediately after a
 * cancel call see the row. The webhook listener IS queued for the same
 * event so outbound delivery doesn't block the response.
 */
class LogMembershipTransition
{
    public function handle(MembershipStateChanged $event): void
    {
        try {
            $meta = $event->metadata;
            $actorId = $meta['actor_user_id'] ?? $meta['created_by'] ?? null;
            $source = $meta['source'] ?? null;
            unset($meta['actor_user_id'], $meta['created_by'], $meta['source']);

            MembershipStateTransition::create([
                'tenant_id' => $event->membership->tenant_id,
                'membership_id' => $event->membership->id,
                'from_status' => $event->fromStatus,
                'to_status' => $event->toStatus,
                'event_name' => $event->eventName(),
                'actor_user_id' => $actorId,
                'source' => $source,
                'metadata' => $meta,
            ]);
        } catch (\Throwable $e) {
            Log::warning('LogMembershipTransition failed', [
                'membership_id' => $event->membership->id,
                'event' => $event->eventName(),
                'error' => $e->getMessage(),
            ]);
        }
    }
}
