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

        $churnRate = $this->analytics->calculateChurnRate($tenantId);
        $membersByPlan = $this->analytics->membersByPlan($tenantId);
        $growthTrend = $this->analytics->membershipGrowth($tenantId);

        return response()->json([
            'data' => [
                'total_members' => (int) $stats->total_members,
                'new_enrollments' => (int) $stats->new_enrollments,
                'cancellations' => (int) $stats->cancellations,
                'churn_rate' => $churnRate,
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
