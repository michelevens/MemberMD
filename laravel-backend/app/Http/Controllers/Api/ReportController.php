<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function __construct(
        private AnalyticsService $analytics,
    ) {}

    public function revenue(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $tenantId = $user->tenant_id;

        $mrr = $this->analytics->calculateMRR($tenantId);
        $arr = round($mrr * 12, 2);
        $revenueByMonth = $this->analytics->revenueByMonth($tenantId);
        $revenueByPlan = $this->analytics->revenueByPlan($tenantId);

        return response()->json([
            'data' => [
                'mrr' => $mrr,
                'arr' => $arr,
                'revenue_by_month' => $revenueByMonth,
                'revenue_by_plan' => $revenueByPlan,
            ],
        ]);
    }

    public function membership(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $tenantId = $user->tenant_id;
        $thirtyDaysAgo = now()->subDays(30)->toDateTimeString();

        $stats = DB::selectOne("
            SELECT
                COUNT(*) FILTER (WHERE pm.status = 'active') AS total_members,
                COUNT(*) FILTER (WHERE pm.started_at >= ?) AS new_enrollments,
                COUNT(*) FILTER (WHERE pm.status = 'cancelled' AND pm.cancelled_at >= ?) AS cancellations
            FROM patient_memberships pm
            WHERE pm.tenant_id = ?
        ", [$thirtyDaysAgo, $thirtyDaysAgo, $tenantId]);

        // churn_rate retained for back-compat; churn_breakdown is the
        // metric callers should pivot to (voluntary vs involuntary).
        $churnBreakdown = $this->analytics->churnRateBreakdown($tenantId);
        $membersByPlan = $this->analytics->membersByPlan($tenantId);
        $growthTrend = $this->analytics->membershipGrowth($tenantId);

        return response()->json([
            'data' => [
                'total_members' => (int) $stats->total_members,
                'new_enrollments' => (int) $stats->new_enrollments,
                'cancellations' => (int) $stats->cancellations,
                'churn_rate' => $churnBreakdown['rate'],
                'churn_breakdown' => $churnBreakdown,
                'members_by_plan' => $membersByPlan,
                'growth_trend' => $growthTrend,
            ],
        ]);
    }

    public function financial(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $tenantId = $user->tenant_id;

        $financials = DB::selectOne("
            SELECT
                COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0) AS total_collected,
                COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'pending'), 0) AS outstanding_balances
            FROM invoices i
            LEFT JOIN payments p ON p.invoice_id = i.id AND p.tenant_id = ?
            WHERE i.tenant_id = ?
        ", [$tenantId, $tenantId]);

        $arpm = $this->analytics->calculateARPM($tenantId);
        $ltv = $this->analytics->calculateLTV($tenantId);
        $paymentsByMethod = $this->analytics->paymentsByMethod($tenantId);

        return response()->json([
            'data' => [
                'total_collected' => round((float) $financials->total_collected, 2),
                'outstanding_balances' => round((float) $financials->outstanding_balances, 2),
                'arpm' => $arpm,
                'ltv' => $ltv,
                'payments_by_method' => $paymentsByMethod,
            ],
        ]);
    }

    /**
     * Monthly enrollment cohorts with N-month retention. Each row in the
     * returned data represents a cohort (enrollment month); the `retention`
     * array shows what fraction of that cohort was still active at month 0,
     * 1, 2 ... up to the requested horizon (default 12).
     *
     * Columns:
     *   cohort_month   "YYYY-MM"
     *   cohort_size    members enrolled that month
     *   retention      [r0, r1, r2, ...] in [0, 1]; null past the cohort age
     */
    public function cohorts(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $tenantId = $user->tenant_id;
        $horizon = max(1, min(24, (int) $request->input('horizon', 12)));

        // Cohort by the FIRST membership per patient — reactivations join
        // their original cohort instead of starting a new one. Without
        // this, a customer who churns and re-enrolls counts as a new
        // logo and inflates "growth" while inflating churn at the same
        // time. We use the patient's overall lifecycle: earliest
        // started_at, latest cancelled_at (or null if currently active).
        $rows = DB::select("
            WITH per_patient AS (
                SELECT
                    patient_id,
                    MIN(started_at) AS first_started_at,
                    MAX(CASE WHEN status = 'cancelled' THEN cancelled_at END) AS final_cancelled_at,
                    BOOL_OR(status = 'active') AS has_active_now
                FROM patient_memberships
                WHERE tenant_id = ?
                  AND started_at IS NOT NULL
                  AND parent_membership_id IS NULL
                GROUP BY patient_id
            )
            SELECT
                date_trunc('month', first_started_at)::date AS cohort_month,
                CASE
                    WHEN has_active_now THEN NULL
                    ELSE date_trunc('month', final_cancelled_at)::date
                END AS churn_month
            FROM per_patient
        ", [$tenantId]);

        // Bucket by cohort.
        $cohorts = [];
        foreach ($rows as $r) {
            $key = substr((string) $r->cohort_month, 0, 7);
            if (!isset($cohorts[$key])) {
                $cohorts[$key] = ['size' => 0, 'churns_at' => []];
            }
            $cohorts[$key]['size']++;

            if (!empty($r->churn_month)) {
                $cohortDate = new \DateTime($r->cohort_month);
                $churnDate = new \DateTime($r->churn_month);
                $monthsToChurn = ((int) $churnDate->format('Y') - (int) $cohortDate->format('Y')) * 12
                    + ((int) $churnDate->format('m') - (int) $cohortDate->format('m'));
                $cohorts[$key]['churns_at'][] = max(0, $monthsToChurn);
            }
        }

        // Sort cohorts oldest-first and compute retention vectors.
        ksort($cohorts);
        $now = now()->startOfMonth();
        $result = [];
        foreach ($cohorts as $key => $c) {
            $cohortDate = new \DateTime($key . '-01');
            $ageMonths = (int) $now->diffInMonths($cohortDate);

            $retention = [];
            for ($m = 0; $m <= $horizon; $m++) {
                if ($m > $ageMonths) {
                    $retention[] = null;
                    continue;
                }
                // Active at month $m = total - everyone who churned at or before $m
                $churnedByM = count(array_filter($c['churns_at'], fn ($x) => $x <= $m));
                $retention[] = $c['size'] > 0
                    ? round(($c['size'] - $churnedByM) / $c['size'], 4)
                    : 0.0;
            }

            $result[] = [
                'cohort_month' => $key,
                'cohort_size' => $c['size'],
                'retention' => $retention,
            ];
        }

        return response()->json([
            'data' => [
                'horizon_months' => $horizon,
                'cohorts' => $result,
            ],
        ]);
    }

    /**
     * Per-plan churn breakdown. For each plan, returns members count,
     * cancelled-in-last-30 count, churn rate, and the most common cancel
     * reasons (so the practice sees *why* a plan is bleeding).
     */
    public function churnByPlan(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $tenantId = $user->tenant_id;
        $thirtyDaysAgo = now()->subDays(30)->toDateTimeString();

        $rows = DB::select("
            SELECT
                mp.id AS plan_id,
                mp.name AS plan_name,
                COUNT(*) FILTER (WHERE pm.status = 'active') AS active_count,
                COUNT(*) FILTER (WHERE pm.status = 'cancelled' AND pm.cancelled_at >= ?) AS recent_cancellations,
                COUNT(*) FILTER (WHERE pm.cancelled_at IS NOT NULL) AS lifetime_cancellations,
                COUNT(*) AS total_ever
            FROM membership_plans mp
            LEFT JOIN patient_memberships pm
                   ON pm.plan_id = mp.id
                  AND pm.tenant_id = mp.tenant_id
                  AND pm.parent_membership_id IS NULL
            WHERE mp.tenant_id = ?
            GROUP BY mp.id, mp.name
            ORDER BY mp.sort_order
        ", [$thirtyDaysAgo, $tenantId]);

        $reasonRows = DB::select("
            SELECT
                pm.plan_id,
                split_part(coalesce(pm.cancel_reason, 'unknown'), ':', 1) AS reason,
                COUNT(*) AS n
            FROM patient_memberships pm
            WHERE pm.tenant_id = ?
              AND pm.status = 'cancelled'
              AND pm.cancelled_at >= ?
              AND pm.parent_membership_id IS NULL
            GROUP BY pm.plan_id, reason
        ", [$tenantId, now()->subDays(90)->toDateTimeString()]);

        $reasonsByPlan = [];
        foreach ($reasonRows as $r) {
            $reasonsByPlan[$r->plan_id][] = ['reason' => $r->reason, 'count' => (int) $r->n];
        }

        $data = array_map(function ($row) use ($reasonsByPlan) {
            $active = (int) $row->active_count;
            $recent = (int) $row->recent_cancellations;
            $denom = $active + $recent;
            $churnRate = $denom > 0 ? round($recent / $denom, 4) : 0.0;

            return [
                'plan_id' => $row->plan_id,
                'plan_name' => $row->plan_name,
                'active' => $active,
                'cancelled_30d' => $recent,
                'cancelled_lifetime' => (int) $row->lifetime_cancellations,
                'churn_rate_30d' => $churnRate,
                'top_reasons_90d' => $reasonsByPlan[$row->plan_id] ?? [],
            ];
        }, $rows);

        return response()->json(['data' => $data]);
    }

    public function export(Request $request): StreamedResponse|JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $type = $request->input('type', 'revenue');
        $tenantId = $user->tenant_id;

        $rows = match ($type) {
            'revenue' => $this->exportRevenue($tenantId),
            'membership' => $this->exportMembership($tenantId),
            'financial' => $this->exportFinancial($tenantId),
            default => null,
        };

        if ($rows === null) {
            return response()->json(['message' => 'Invalid export type. Use: revenue, membership, financial.'], 422);
        }

        $filename = "membermd_{$type}_report_" . now()->format('Y-m-d') . '.csv';

        return response()->streamDownload(function () use ($rows) {
            $handle = fopen('php://output', 'w');

            if (!empty($rows)) {
                // Write header
                fputcsv($handle, array_keys((array) $rows[0]));
                // Write rows
                foreach ($rows as $row) {
                    fputcsv($handle, (array) $row);
                }
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv',
        ]);
    }

    private function exportRevenue(string $tenantId): array
    {
        return DB::select("
            SELECT
                TO_CHAR(p.created_at, 'YYYY-MM') AS month,
                p.method,
                COUNT(*) AS payment_count,
                COALESCE(SUM(p.amount), 0) AS total_amount
            FROM payments p
            WHERE p.tenant_id = ?
              AND p.status = 'completed'
              AND p.created_at >= NOW() - INTERVAL '12 months'
            GROUP BY TO_CHAR(p.created_at, 'YYYY-MM'), p.method
            ORDER BY month ASC, p.method
        ", [$tenantId]);
    }

    private function exportMembership(string $tenantId): array
    {
        return DB::select("
            SELECT
                pa.first_name,
                pa.last_name,
                mp.name AS plan_name,
                pm.status,
                pm.billing_frequency,
                pm.started_at,
                pm.cancelled_at,
                CASE
                    WHEN pm.billing_frequency = 'annual' THEN mp.annual_price
                    ELSE mp.monthly_price
                END AS price
            FROM patient_memberships pm
            JOIN patients pa ON pa.id = pm.patient_id
            JOIN membership_plans mp ON mp.id = pm.plan_id
            WHERE pm.tenant_id = ?
            ORDER BY pm.started_at DESC
        ", [$tenantId]);
    }

    private function exportFinancial(string $tenantId): array
    {
        return DB::select("
            SELECT
                p.created_at AS payment_date,
                pa.first_name,
                pa.last_name,
                p.amount,
                p.method,
                p.status,
                i.description AS invoice_description,
                p.refund_amount,
                p.refunded_at
            FROM payments p
            JOIN patients pa ON pa.id = p.patient_id
            LEFT JOIN invoices i ON i.id = p.invoice_id
            WHERE p.tenant_id = ?
            ORDER BY p.created_at DESC
        ", [$tenantId]);
    }
}
