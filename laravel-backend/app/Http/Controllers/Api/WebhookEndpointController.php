<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Practice-facing CRUD for webhook endpoints + delivery log.
 *
 *   GET    /api/webhooks/endpoints                 — list
 *   POST   /api/webhooks/endpoints                 — create (returns secret ONCE)
 *   GET    /api/webhooks/endpoints/{id}            — show
 *   PATCH  /api/webhooks/endpoints/{id}            — update url/event_types/status
 *   DELETE /api/webhooks/endpoints/{id}            — remove
 *   POST   /api/webhooks/endpoints/{id}/regenerate — rotate signing secret
 *   GET    /api/webhooks/endpoints/{id}/deliveries — paginated delivery log
 *
 * The signing_secret is returned ONLY on create + regenerate. After
 * that the practice has to store it themselves; we never echo it back.
 */
class WebhookEndpointController extends Controller
{
    private const ALLOWED_EVENT_TYPES = [
        '*',
        'membership.*',
        'membership.activated',
        'membership.cancelled',
        'membership.paused',
        'membership.resumed',
        'membership.reactivated',
        'membership.expired',
        'membership.payment_failed',
        'membership.payment_recovered',
        'membership.status_changed',
    ];

    public function index(Request $request): JsonResponse
    {
        $this->assertCanManage($request);
        $endpoints = WebhookEndpoint::where('tenant_id', $request->user()->tenant_id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'data' => $endpoints->map(fn ($e) => $this->serialize($e))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertCanManage($request);

        $data = $request->validate([
            'url' => 'required|url|max:2000',
            'description' => 'nullable|string|max:255',
            'event_types' => 'required|array|min:1',
            'event_types.*' => 'string|max:60',
        ]);

        $this->assertValidEventTypes($data['event_types']);

        $endpoint = WebhookEndpoint::create([
            'tenant_id' => $request->user()->tenant_id,
            'url' => $data['url'],
            'description' => $data['description'] ?? null,
            'event_types' => array_values(array_unique($data['event_types'])),
            'signing_secret' => WebhookEndpoint::generateSecret(),
            'status' => WebhookEndpoint::STATUS_ENABLED,
            'created_by' => $request->user()->id,
        ]);

        return response()->json([
            'data' => $this->serialize($endpoint, includeSecret: true),
            'message' => 'Save the signing secret now — it will not be shown again.',
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $endpoint = $this->findOwned($request, $id);
        return response()->json(['data' => $this->serialize($endpoint)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->assertCanManage($request);
        $endpoint = $this->findOwned($request, $id);

        $data = $request->validate([
            'url' => 'sometimes|url|max:2000',
            'description' => 'nullable|string|max:255',
            'event_types' => 'sometimes|array|min:1',
            'event_types.*' => 'string|max:60',
            'status' => 'sometimes|string|in:enabled,disabled',
        ]);

        if (isset($data['event_types'])) {
            $this->assertValidEventTypes($data['event_types']);
            $data['event_types'] = array_values(array_unique($data['event_types']));
        }

        // Re-enabling resets the failure counter so the auto-disable
        // threshold doesn't fire on the very next bad delivery.
        if (($data['status'] ?? null) === 'enabled' && $endpoint->status !== 'enabled') {
            $data['consecutive_failures'] = 0;
        }

        $endpoint->update($data);
        return response()->json(['data' => $this->serialize($endpoint->fresh())]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->assertCanManage($request);
        $endpoint = $this->findOwned($request, $id);
        $endpoint->delete();
        return response()->json(['message' => 'Endpoint removed.']);
    }

    public function regenerate(Request $request, string $id): JsonResponse
    {
        $this->assertCanManage($request);
        $endpoint = $this->findOwned($request, $id);
        $endpoint->update(['signing_secret' => WebhookEndpoint::generateSecret()]);

        return response()->json([
            'data' => $this->serialize($endpoint->fresh(), includeSecret: true),
            'message' => 'New secret issued. Update your verifier — old one no longer works.',
        ]);
    }

    public function deliveries(Request $request, string $id): JsonResponse
    {
        $endpoint = $this->findOwned($request, $id);

        $query = WebhookDelivery::where('endpoint_id', $endpoint->id);
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('event_type')) {
            $query->where('event_type', $request->event_type);
        }

        $deliveries = $query->orderBy('created_at', 'desc')
            ->limit(min((int) $request->query('limit', 50), 200))
            ->get(['id', 'event_id', 'event_type', 'status', 'attempts',
                   'response_status', 'error_message', 'next_attempt_at',
                   'delivered_at', 'created_at']);

        $stats = DB::table('webhook_deliveries')
            ->where('endpoint_id', $endpoint->id)
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        return response()->json([
            'data' => $deliveries,
            'stats' => $stats,
        ]);
    }

    /**
     * POST /api/webhooks/endpoints/{id}/deliveries/{deliveryId}/retry
     *
     * Manually re-queue a failed delivery. Superadmin or practice admin
     * for that tenant. Doesn't reset the attempt counter — keeps the
     * exponential-backoff history intact so we can see how many times
     * we've already tried.
     */
    public function retryDelivery(Request $request, string $endpointId, string $deliveryId): JsonResponse
    {
        $this->assertCanManage($request);
        $endpoint = $this->findOwned($request, $endpointId);

        $delivery = WebhookDelivery::where('endpoint_id', $endpoint->id)
            ->where('id', $deliveryId)
            ->firstOrFail();

        if ($delivery->status === WebhookDelivery::STATUS_DELIVERED) {
            return response()->json([
                'message' => 'Delivery already succeeded — nothing to retry.',
            ], 422);
        }

        // Re-queue immediately. The job preserves the existing payload
        // + signature so the practice's idempotency layer keeps working.
        \App\Jobs\DeliverWebhook::dispatch($delivery->id);

        $delivery->update([
            'status' => WebhookDelivery::STATUS_PENDING,
            'next_attempt_at' => now(),
        ]);

        return response()->json([
            'data' => $delivery->fresh(),
            'message' => 'Retry queued.',
        ]);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private function assertCanManage(Request $request): void
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin'], true), 403,
            'Only practice admins can manage webhook endpoints.');
    }

    private function assertValidEventTypes(array $types): void
    {
        foreach ($types as $t) {
            if (!in_array($t, self::ALLOWED_EVENT_TYPES, true)) {
                abort(422, "Unknown event type: {$t}");
            }
        }
    }

    private function findOwned(Request $request, string $id): WebhookEndpoint
    {
        return WebhookEndpoint::where('tenant_id', $request->user()->tenant_id)
            ->findOrFail($id);
    }

    private function serialize(WebhookEndpoint $e, bool $includeSecret = false): array
    {
        $out = [
            'id' => $e->id,
            'url' => $e->url,
            'description' => $e->description,
            'event_types' => $e->event_types,
            'status' => $e->status,
            'consecutive_failures' => $e->consecutive_failures,
            'last_success_at' => $e->last_success_at,
            'last_failure_at' => $e->last_failure_at,
            'last_failure_reason' => $e->last_failure_reason,
            'created_at' => $e->created_at,
        ];
        if ($includeSecret) {
            $out['signing_secret'] = $e->signing_secret;
        }
        return $out;
    }
}
