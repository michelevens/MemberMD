<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Web Push subscription management.
 *
 *   GET    /api/push/vapid-key            — public VAPID key (auth required so we
 *                                           don't leak install-base size, but the
 *                                           key itself is non-sensitive)
 *   POST   /api/push/subscriptions        — register a subscription returned by
 *                                           pushManager.subscribe()
 *   DELETE /api/push/subscriptions        — revoke by endpoint (when user disables
 *                                           notifications in the OS or browser)
 *
 * Outbound dispatch (sending the actual push) is handled by a queued
 * job that reads notifications + push_subscriptions and signs payloads
 * via minishlink/web-push. This controller is just the registration
 * surface — keep it small and idempotent.
 */
class PushSubscriptionController extends Controller
{
    public function vapidKey(): JsonResponse
    {
        $key = config('services.webpush.public_key') ?: env('VAPID_PUBLIC_KEY');

        if (!$key) {
            return response()->json([
                'error' => 'Push notifications are not configured on this server.',
            ], 503);
        }

        return response()->json(['public_key' => $key]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => 'required|string|max:2000',
            'keys' => 'required|array',
            'keys.p256dh' => 'required|string|max:191',
            'keys.auth' => 'required|string|max:191',
            'platform' => 'nullable|string|in:ios,android,desktop',
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        $endpointHash = PushSubscription::hashEndpoint($data['endpoint']);

        // Idempotent: same device re-subscribing on a fresh page load
        // shouldn't create a duplicate row. Match on (user, endpoint_hash).
        $sub = PushSubscription::where('user_id', $user->id)
            ->where('endpoint_hash', $endpointHash)
            ->first();

        if ($sub) {
            $sub->update([
                'p256dh_key' => $data['keys']['p256dh'],
                'auth_token' => $data['keys']['auth'],
                'platform' => $data['platform'] ?? $sub->platform,
                'user_agent' => substr((string) $request->userAgent(), 0, 500) ?: null,
                'last_used_at' => now(),
            ]);
        } else {
            $sub = PushSubscription::create([
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'endpoint' => $data['endpoint'],
                'endpoint_hash' => $endpointHash,
                'p256dh_key' => $data['keys']['p256dh'],
                'auth_token' => $data['keys']['auth'],
                'platform' => $data['platform'] ?? null,
                'user_agent' => substr((string) $request->userAgent(), 0, 500) ?: null,
                'last_used_at' => now(),
            ]);
        }

        return response()->json([
            'data' => [
                'id' => $sub->id,
                'endpoint_hash' => $endpointHash,
                'created_at' => $sub->created_at,
            ],
        ], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => 'required|string|max:2000',
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        $endpointHash = PushSubscription::hashEndpoint($data['endpoint']);

        $deleted = PushSubscription::where('user_id', $user->id)
            ->where('endpoint_hash', $endpointHash)
            ->delete();

        return response()->json(['deleted' => $deleted]);
    }
}
