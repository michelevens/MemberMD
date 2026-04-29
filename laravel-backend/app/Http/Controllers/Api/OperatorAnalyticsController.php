<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\NetworkMetricsService;
use App\Support\OperatorContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Network-wide analytics for operator-tier dashboards.
 *
 *   GET /api/operator/analytics/network                      — top-line snapshot + prior-period deltas
 *   GET /api/operator/analytics/clinics                      — per-tenant rollups for ranking
 *   GET /api/operator/analytics/clinics/{tenantId}           — per-clinic deep dive
 *   GET /api/operator/analytics/timeseries?granularity=...   — daily 30d or monthly 12mo
 *   GET /api/operator/analytics/cohort-retention             — simple retention curve
 */
class OperatorAnalyticsController extends Controller
{
    public function __construct(private readonly NetworkMetricsService $metrics)
    {
    }

    public function network(Request $request): JsonResponse
    {
        $ctx = $this->context();
        return response()->json([
            'data' => $this->metrics->snapshot($ctx->tenantIds()),
        ]);
    }

    public function clinics(Request $request): JsonResponse
    {
        $ctx = $this->context();
        return response()->json([
            'data' => $this->metrics->clinics($ctx->tenantIds()),
        ]);
    }

    public function clinicDetail(Request $request, string $tenantId): JsonResponse
    {
        $ctx = $this->context();
        $detail = $this->metrics->clinicDetail($ctx->tenantIds(), $tenantId);

        if (!$detail) {
            abort(404, 'Clinic not found in your scope.');
        }

        return response()->json(['data' => $detail]);
    }

    public function timeseries(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $request->validate([
            'granularity' => 'nullable|string|in:daily,monthly,both',
            'days' => 'nullable|integer|min:7|max:90',
            'months' => 'nullable|integer|min:3|max:24',
        ]);

        $granularity = $request->query('granularity', 'both');
        $days = (int) ($request->query('days') ?? 30);
        $months = (int) ($request->query('months') ?? 12);

        $payload = ['granularity' => $granularity];

        if (in_array($granularity, ['daily', 'both'], true)) {
            $payload['daily'] = $this->metrics->daily($ctx->tenantIds(), null, $days);
        }
        if (in_array($granularity, ['monthly', 'both'], true)) {
            $payload['monthly'] = $this->metrics->monthly($ctx->tenantIds(), null, $months);
        }

        return response()->json(['data' => $payload]);
    }

    public function cohortRetention(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $request->validate([
            'months' => 'nullable|integer|min:3|max:24',
        ]);
        $months = (int) ($request->query('months') ?? 12);

        return response()->json([
            'data' => $this->metrics->cohortRetention($ctx->tenantIds(), null, $months),
        ]);
    }

    private function context(): OperatorContext
    {
        abort_if(!app()->bound(OperatorContext::class), 403, 'Operator scope required.');
        return app(OperatorContext::class);
    }
}
