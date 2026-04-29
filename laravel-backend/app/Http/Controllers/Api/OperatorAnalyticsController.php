<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Support\OperatorContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Network-wide rollup analytics for operator-tier dashboards.
 *
 *   GET /api/operator/analytics/network    — top-line MRR, members, ARPU, churn
 *   GET /api/operator/analytics/clinics    — per-tenant rollups for ranking/benchmarking
 */
class OperatorAnalyticsController extends Controller
{
    public function network(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $tenantIds = $ctx->tenantIds();

        if (empty($tenantIds)) {
            return response()->json(['data' => $this->emptyNetworkPayload()]);
        }

        $activeMemberships = PatientMembership::whereIn('tenant_id', $tenantIds)
            ->where('status', 'active')
            ->with('plan:id,monthly_price,annual_price')
            ->get();

        $mrrCents = 0;
        foreach ($activeMemberships as $m) {
            if (!$m->plan) {
                continue;
            }
            if ($m->billing_frequency === 'annual') {
                $mrrCents += (int) round(((float) $m->plan->annual_price) * 100 / 12);
            } else {
                $mrrCents += (int) round(((float) $m->plan->monthly_price) * 100);
            }
        }

        $memberCount = $activeMemberships->count();
        $patientCount = Patient::whereIn('tenant_id', $tenantIds)->count();

        // Churn: last 30 days cancelled / (active at start of window + cancelled in window)
        $windowStart = now()->subDays(30);
        $cancelledInWindow = PatientMembership::whereIn('tenant_id', $tenantIds)
            ->where('status', 'cancelled')
            ->where('cancelled_at', '>=', $windowStart)
            ->count();
        $denominator = $memberCount + $cancelledInWindow;
        $churnRate = $denominator > 0 ? round($cancelledInWindow / $denominator, 4) : 0.0;

        $arpuCents = $memberCount > 0 ? (int) round($mrrCents / $memberCount) : 0;

        $tenantCount = Practice::whereIn('id', $tenantIds)->count();
        $activeTenantCount = Practice::whereIn('id', $tenantIds)->where('is_active', true)->count();

        $newMembersWindow = PatientMembership::whereIn('tenant_id', $tenantIds)
            ->where('created_at', '>=', $windowStart)
            ->count();

        return response()->json([
            'data' => [
                'mrr_cents' => $mrrCents,
                'arr_cents' => $mrrCents * 12,
                'arpu_cents' => $arpuCents,
                'member_count' => $memberCount,
                'patient_count' => $patientCount,
                'churn_rate_30d' => $churnRate,
                'new_members_30d' => $newMembersWindow,
                'cancelled_30d' => $cancelledInWindow,
                'tenant_count' => $tenantCount,
                'active_tenant_count' => $activeTenantCount,
                'window' => '30d',
                'as_of' => now()->toIso8601String(),
            ],
        ]);
    }

    public function clinics(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $tenantIds = $ctx->tenantIds();

        if (empty($tenantIds)) {
            return response()->json(['data' => []]);
        }

        $tenants = Practice::whereIn('id', $tenantIds)
            ->withCount(['patients'])
            ->orderBy('name')
            ->get();

        // Per-tenant active membership rollup
        $membershipRollups = PatientMembership::whereIn('tenant_id', $tenantIds)
            ->where('status', 'active')
            ->with('plan:id,monthly_price,annual_price')
            ->get()
            ->groupBy('tenant_id')
            ->map(function ($memberships) {
                $mrrCents = 0;
                foreach ($memberships as $m) {
                    if (!$m->plan) continue;
                    if ($m->billing_frequency === 'annual') {
                        $mrrCents += (int) round(((float) $m->plan->annual_price) * 100 / 12);
                    } else {
                        $mrrCents += (int) round(((float) $m->plan->monthly_price) * 100);
                    }
                }
                return [
                    'mrr_cents' => $mrrCents,
                    'member_count' => $memberships->count(),
                ];
            });

        $payload = $tenants->map(function (Practice $p) use ($membershipRollups) {
            $rollup = $membershipRollups->get($p->id, ['mrr_cents' => 0, 'member_count' => 0]);
            return [
                'tenant_id' => $p->id,
                'name' => $p->name,
                'city' => $p->city,
                'state' => $p->state,
                'is_active' => $p->is_active,
                'mrr_cents' => $rollup['mrr_cents'],
                'member_count' => $rollup['member_count'],
                'patient_count' => $p->patients_count ?? 0,
                'arpu_cents' => $rollup['member_count'] > 0
                    ? (int) round($rollup['mrr_cents'] / $rollup['member_count'])
                    : 0,
                'stripe_connect_status' => $p->stripe_connect_status,
            ];
        })->values();

        return response()->json(['data' => $payload]);
    }

    private function context(): OperatorContext
    {
        abort_if(!app()->bound(OperatorContext::class), 403, 'Operator scope required.');
        return app(OperatorContext::class);
    }

    private function emptyNetworkPayload(): array
    {
        return [
            'mrr_cents' => 0,
            'arr_cents' => 0,
            'arpu_cents' => 0,
            'member_count' => 0,
            'patient_count' => 0,
            'churn_rate_30d' => 0,
            'new_members_30d' => 0,
            'cancelled_30d' => 0,
            'tenant_count' => 0,
            'active_tenant_count' => 0,
            'window' => '30d',
            'as_of' => now()->toIso8601String(),
        ];
    }
}
