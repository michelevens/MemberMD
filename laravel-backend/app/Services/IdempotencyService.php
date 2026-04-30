<?php

namespace App\Services;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Wrap a write handler in idempotency. First call runs the closure and
 * stashes the JsonResponse status+body. Subsequent calls within 24h return
 * the stashed response without re-executing.
 *
 * Concurrent-safe via a row-level lock: two simultaneous identical requests
 * race to insert; the loser blocks on the lock, then sees the stashed
 * response when the winner commits.
 */
class IdempotencyService
{
    public function execute(
        string $endpoint,
        string $key,
        ?string $tenantId,
        Closure $handler,
    ): JsonResponse {
        return DB::transaction(function () use ($endpoint, $key, $tenantId, $handler) {
            // Try to read an existing row with FOR UPDATE so we serialize.
            $existing = DB::table('idempotency_keys')
                ->where('endpoint', $endpoint)
                ->where('key', $key)
                ->where('expires_at', '>', now())
                ->lockForUpdate()
                ->first();

            if ($existing) {
                $body = json_decode($existing->response_body, true);
                return response()->json($body, $existing->response_status);
            }

            // First time through — run the handler and stash the result.
            /** @var JsonResponse $response */
            $response = $handler();

            DB::table('idempotency_keys')->insert([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'endpoint' => $endpoint,
                'key' => $key,
                'response_status' => $response->getStatusCode(),
                'response_body' => $response->getContent(),
                'expires_at' => now()->addDay(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return $response;
        });
    }
}
