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

    /**
     * GET /api/operator/analytics/reconciliation
     *
     * Central billing reconciliation across all clinics in the
     * operator's scope. Replaces the spreadsheet that operator
     * finance teams currently maintain by hand: "what was processed
     * this month, what's outstanding, what fees did Stripe take,
     * what hit each clinic's payout."
     *
     * Query params:
     *   - period: 'mtd' | 'qtd' | 'ytd' | 'last_30d' (default: mtd)
     *
     * Returns:
     *   - totals: { processed_cents, refunded_cents, net_cents,
     *               outstanding_cents, payment_count }
     *   - by_tenant: per-clinic breakdown
     */
    public function reconciliation(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $request->validate([
            'period' => 'nullable|string|in:mtd,qtd,ytd,last_30d',
        ]);
        $period = $request->query('period', 'mtd');

        [$start, $end] = $this->resolvePeriod($period);
        $tenantIds = $ctx->tenantIds();

        if (empty($tenantIds)) {
            return response()->json([
                'data' => [
                    'period' => $period,
                    'period_start' => $start->toIso8601String(),
                    'period_end' => $end->toIso8601String(),
                    'totals' => $this->emptyTotals(),
                    'by_tenant' => [],
                ],
            ]);
        }

        // Single grouped query — payments table is tenant-scoped.
        // Amounts in `payments` are stored as decimal dollars; sum
        // and convert to cents at the edge for currency-safe math.
        $rows = \App\Models\Payment::whereIn('tenant_id', $tenantIds)
            ->whereBetween('created_at', [$start, $end])
            ->selectRaw('tenant_id')
            ->selectRaw("SUM(CASE WHEN status = 'completed' OR status = 'succeeded' THEN amount ELSE 0 END) AS processed")
            ->selectRaw("SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) AS refunded_total")
            ->selectRaw('SUM(COALESCE(refund_amount, 0)) AS partial_refund_sum')
            ->selectRaw("SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS outstanding")
            ->selectRaw('COUNT(*) AS payment_count')
            ->groupBy('tenant_id')
            ->get();

        // Hydrate names so the UI doesn't have to do a second round-trip.
        $tenantNames = \App\Models\Practice::whereIn('id', $tenantIds)
            ->pluck('name', 'id');

        $byTenant = [];
        $totals = $this->emptyTotals();

        foreach ($rows as $row) {
            $processedCents = (int) round(((float) $row->processed) * 100);
            $refundedCents = (int) round((((float) $row->refunded_total) + ((float) $row->partial_refund_sum)) * 100);
            $netCents = $processedCents - $refundedCents;
            $outstandingCents = (int) round(((float) $row->outstanding) * 100);

            $byTenant[] = [
                'tenant_id' => $row->tenant_id,
                'tenant_name' => $tenantNames[$row->tenant_id] ?? null,
                'processed_cents' => $processedCents,
                'refunded_cents' => $refundedCents,
                'net_cents' => $netCents,
                'outstanding_cents' => $outstandingCents,
                'payment_count' => (int) $row->payment_count,
            ];

            $totals['processed_cents'] += $processedCents;
            $totals['refunded_cents'] += $refundedCents;
            $totals['net_cents'] += $netCents;
            $totals['outstanding_cents'] += $outstandingCents;
            $totals['payment_count'] += (int) $row->payment_count;
        }

        // Tenants with no activity in the period — surface them with
        // zeros so the operator sees the full network at a glance,
        // not just the active clinics.
        $activeTenantIds = collect($byTenant)->pluck('tenant_id')->all();
        foreach ($tenantIds as $tid) {
            if (!in_array($tid, $activeTenantIds, true)) {
                $byTenant[] = array_merge(
                    ['tenant_id' => $tid, 'tenant_name' => $tenantNames[$tid] ?? null],
                    array_map(fn () => 0, $this->emptyTotals()),
                );
            }
        }

        // Sort by net descending — operator's biggest revenue clinics
        // surface first.
        usort($byTenant, fn ($a, $b) => $b['net_cents'] <=> $a['net_cents']);

        return response()->json([
            'data' => [
                'period' => $period,
                'period_start' => $start->toIso8601String(),
                'period_end' => $end->toIso8601String(),
                'totals' => $totals,
                'by_tenant' => $byTenant,
            ],
        ]);
    }

    private function emptyTotals(): array
    {
        return [
            'processed_cents' => 0,
            'refunded_cents' => 0,
            'net_cents' => 0,
            'outstanding_cents' => 0,
            'payment_count' => 0,
        ];
    }

    private function resolvePeriod(string $period): array
    {
        $now = now();
        switch ($period) {
            case 'qtd':
                $start = $now->copy()->firstOfQuarter();
                break;
            case 'ytd':
                $start = $now->copy()->startOfYear();
                break;
            case 'last_30d':
                $start = $now->copy()->subDays(30);
                break;
            case 'mtd':
            default:
                $start = $now->copy()->startOfMonth();
                break;
        }
        return [$start, $now];
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
