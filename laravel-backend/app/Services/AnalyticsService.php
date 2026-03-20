<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class AnalyticsService
{
    /**
     * Calculate Monthly Recurring Revenue: sum of all active membership monthly amounts.
     */
    public function calculateMRR(string $tenantId): float
    {
        $result = DB::selectOne("
            SELECT COALESCE(SUM(
                CASE
                    WHEN pm.billing_frequency = 'annual' THEN mp.annual_price / 12
                    ELSE mp.monthly_price
                END
            ), 0) AS mrr
            FROM patient_memberships pm
            JOIN membership_plans mp ON mp.id = pm.plan_id
            WHERE pm.tenant_id = ?
              AND pm.status = 'active'
        ", [$tenantId]);

        return round((float) $result->mrr, 2);
    }

    /**
     * Calculate churn rate: cancellations / total members in a period.
     */
    public function calculateChurnRate(string $tenantId, ?string $periodStart = null, ?string $periodEnd = null): float
    {
        $periodStart = $periodStart ?? now()->subDays(30)->toDateTimeString();
        $periodEnd = $periodEnd ?? now()->toDateTimeString();

        $result = DB::selectOne("
            SELECT
                COUNT(*) FILTER (WHERE pm.status = 'cancelled' AND pm.cancelled_at BETWEEN ? AND ?) AS cancelled,
                COUNT(*) AS total
            FROM patient_memberships pm
            WHERE pm.tenant_id = ?
              AND pm.started_at <= ?
        ", [$periodStart, $periodEnd, $tenantId, $periodEnd]);

        $total = (int) $result->total;
        if ($total === 0) {
            return 0.0;
        }

        return round(((int) $result->cancelled / $total) * 100, 2);
    }

    /**
     * Average Revenue Per Member: total revenue / active members.
     */
    public function calculateARPM(string $tenantId): float
    {
        $result = DB::selectOne("
            SELECT
                COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0) AS total_revenue,
                COUNT(DISTINCT pm.id) FILTER (WHERE pm.status = 'active') AS active_members
            FROM patient_memberships pm
            LEFT JOIN invoices i ON i.membership_id = pm.id
            LEFT JOIN payments p ON p.invoice_id = i.id
            WHERE pm.tenant_id = ?
        ", [$tenantId]);

        $activeMembers = (int) $result->active_members;
        if ($activeMembers === 0) {
            return 0.0;
        }

        return round((float) $result->total_revenue / $activeMembers, 2);
    }

    /**
     * Lifetime Value estimate: ARPM * average membership duration in months.
     */
    public function calculateLTV(string $tenantId): float
    {
        $arpm = $this->calculateARPM($tenantId);

        $avgDuration = DB::selectOne("
            SELECT COALESCE(AVG(
                EXTRACT(EPOCH FROM (COALESCE(pm.cancelled_at, NOW()) - pm.started_at)) / 2592000
            ), 0) AS avg_months
            FROM patient_memberships pm
            WHERE pm.tenant_id = ?
              AND pm.started_at IS NOT NULL
        ", [$tenantId]);

        $avgMonths = (float) $avgDuration->avg_months;

        return round($arpm * max($avgMonths, 1), 2);
    }

    /**
     * Revenue by month for the last 12 months.
     */
    public function revenueByMonth(string $tenantId): array
    {
        $results = DB::select("
            SELECT
                TO_CHAR(p.created_at, 'YYYY-MM') AS month,
                COALESCE(SUM(p.amount), 0) AS total
            FROM payments p
            WHERE p.tenant_id = ?
              AND p.status = 'completed'
              AND p.created_at >= NOW() - INTERVAL '12 months'
            GROUP BY TO_CHAR(p.created_at, 'YYYY-MM')
            ORDER BY month ASC
        ", [$tenantId]);

        return array_map(fn ($r) => [
            'month' => $r->month,
            'total' => round((float) $r->total, 2),
        ], $results);
    }

    /**
     * Net new members per month for the last 12 months.
     */
    public function membershipGrowth(string $tenantId): array
    {
        $results = DB::select("
            SELECT
                TO_CHAR(months.month, 'YYYY-MM') AS month,
                COALESCE(enrolled.cnt, 0) AS enrolled,
                COALESCE(cancelled.cnt, 0) AS cancelled,
                COALESCE(enrolled.cnt, 0) - COALESCE(cancelled.cnt, 0) AS net
            FROM generate_series(
                DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
                DATE_TRUNC('month', NOW()),
                '1 month'
            ) AS months(month)
            LEFT JOIN (
                SELECT DATE_TRUNC('month', started_at) AS m, COUNT(*) AS cnt
                FROM patient_memberships
                WHERE tenant_id = ? AND started_at >= NOW() - INTERVAL '12 months'
                GROUP BY DATE_TRUNC('month', started_at)
            ) enrolled ON enrolled.m = months.month
            LEFT JOIN (
                SELECT DATE_TRUNC('month', cancelled_at) AS m, COUNT(*) AS cnt
                FROM patient_memberships
                WHERE tenant_id = ? AND cancelled_at >= NOW() - INTERVAL '12 months'
                GROUP BY DATE_TRUNC('month', cancelled_at)
            ) cancelled ON cancelled.m = months.month
            ORDER BY month ASC
        ", [$tenantId, $tenantId]);

        return array_map(fn ($r) => [
            'month' => $r->month,
            'enrolled' => (int) $r->enrolled,
            'cancelled' => (int) $r->cancelled,
            'net' => (int) $r->net,
        ], $results);
    }

    /**
     * Revenue grouped by membership plan.
     */
    public function revenueByPlan(string $tenantId): array
    {
        $results = DB::select("
            SELECT
                mp.name AS plan_name,
                COUNT(DISTINCT pm.id) AS active_members,
                COALESCE(SUM(
                    CASE
                        WHEN pm.billing_frequency = 'annual' THEN mp.annual_price / 12
                        ELSE mp.monthly_price
                    END
                ), 0) AS monthly_revenue
            FROM patient_memberships pm
            JOIN membership_plans mp ON mp.id = pm.plan_id
            WHERE pm.tenant_id = ?
              AND pm.status = 'active'
            GROUP BY mp.id, mp.name
            ORDER BY monthly_revenue DESC
        ", [$tenantId]);

        return array_map(fn ($r) => [
            'plan_name' => $r->plan_name,
            'active_members' => (int) $r->active_members,
            'monthly_revenue' => round((float) $r->monthly_revenue, 2),
        ], $results);
    }

    /**
     * Members grouped by plan.
     */
    public function membersByPlan(string $tenantId): array
    {
        $results = DB::select("
            SELECT
                mp.name AS plan_name,
                COUNT(*) AS member_count
            FROM patient_memberships pm
            JOIN membership_plans mp ON mp.id = pm.plan_id
            WHERE pm.tenant_id = ?
              AND pm.status = 'active'
            GROUP BY mp.id, mp.name
            ORDER BY member_count DESC
        ", [$tenantId]);

        return array_map(fn ($r) => [
            'plan_name' => $r->plan_name,
            'member_count' => (int) $r->member_count,
        ], $results);
    }

    /**
     * Payments grouped by method.
     */
    public function paymentsByMethod(string $tenantId): array
    {
        $results = DB::select("
            SELECT
                method,
                COUNT(*) AS count,
                COALESCE(SUM(amount), 0) AS total
            FROM payments
            WHERE tenant_id = ?
              AND status = 'completed'
            GROUP BY method
            ORDER BY total DESC
        ", [$tenantId]);

        return array_map(fn ($r) => [
            'method' => $r->method,
            'count' => (int) $r->count,
            'total' => round((float) $r->total, 2),
        ], $results);
    }
}
