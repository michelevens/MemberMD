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
        // Three correctness fixes:
        //   1. Use locked_*_price snapshots (the real per-member price)
        //      with COALESCE back to plan price for legacy rows.
        //   2. Exclude memberships still inside a trial — no money has
        //      been collected, including them inflates MRR.
        //   3. Exclude dependent rows (parent_membership_id IS NOT NULL)
        //      because the primary's price already covers them.
        $result = DB::selectOne("
            SELECT COALESCE(SUM(
                CASE
                    WHEN pm.billing_frequency = 'annual'
                        THEN COALESCE(pm.locked_annual_price, mp.annual_price) / 12
                    ELSE COALESCE(pm.locked_monthly_price, mp.monthly_price)
                END
            ), 0) AS mrr
            FROM patient_memberships pm
            JOIN membership_plans mp ON mp.id = pm.plan_id
            WHERE pm.tenant_id = ?
              AND pm.status = 'active'
              AND pm.parent_membership_id IS NULL
              AND (pm.trial_ends_at IS NULL OR pm.trial_ends_at <= NOW())
        ", [$tenantId]);

        return round((float) $result->mrr, 2);
    }

    /**
     * Calculate churn rate: cancellations / total members in a period.
     * Aggregate (voluntary + involuntary). Use churnRateBreakdown() for
     * the split, which is the metric you actually want for product
     * decisions.
     */
    public function calculateChurnRate(string $tenantId, ?string $periodStart = null, ?string $periodEnd = null): float
    {
        $b = $this->churnRateBreakdown($tenantId, $periodStart, $periodEnd);
        return $b['rate'];
    }

    /**
     * Voluntary vs involuntary churn split.
     *
     * Voluntary  = patient chose to leave (moved, cost, switched provider, ...)
     * Involuntary = card failed, dunning cancelled, fraud reversal
     *
     * Mixing them was hiding a critical signal: a 5% churn that's all
     * involuntary means a payment-method problem (card-update emails fix
     * it), while 5% voluntary means a product/price problem (different fix).
     */
    public function churnRateBreakdown(string $tenantId, ?string $periodStart = null, ?string $periodEnd = null): array
    {
        $periodStart = $periodStart ?? now()->subDays(30)->toDateTimeString();
        $periodEnd = $periodEnd ?? now()->toDateTimeString();

        $involuntaryReasons = [
            'dunning_non_payment',
            'stripe_subscription_deleted',
            'card_expired',
            'fraud',
            'roster_removed',
            'eligibility_lost',
        ];

        // SQL ANY() for the array predicate. Reasons are stored as freeform
        // text starting with the canonical reason; LIKE-prefix match keeps
        // it tolerant of the appended notes/retention markers.
        $likes = collect($involuntaryReasons)->map(fn ($r) => "%{$r}%")->all();
        $placeholders = implode(',', array_fill(0, count($likes), '?'));

        // Trial abandonment != churn (QA #12). A patient who signs up for a
        // trial and cancels before the trial ends never paid us anything —
        // counting them as a "churned customer" inflates voluntary churn at
        // exactly the rate of trial signups, hiding the real product/price
        // signal. We split them out: trial_abandonment_count tracks them
        // separately, and they're EXCLUDED from voluntary/involuntary
        // numerators AND denominators.
        //
        // "Was in trial when cancelled" = cancelled_at < trial_ends_at.
        $result = DB::selectOne("
            SELECT
                COUNT(*) FILTER (
                    WHERE pm.status = 'cancelled'
                      AND pm.cancelled_at BETWEEN ? AND ?
                      AND pm.trial_ends_at IS NOT NULL
                      AND pm.cancelled_at < pm.trial_ends_at
                ) AS trial_abandonments,
                COUNT(*) FILTER (
                    WHERE pm.status = 'cancelled'
                      AND pm.cancelled_at BETWEEN ? AND ?
                      AND (pm.trial_ends_at IS NULL OR pm.cancelled_at >= pm.trial_ends_at)
                      AND COALESCE(pm.cancel_reason, '') ILIKE ANY (ARRAY[{$placeholders}])
                ) AS involuntary,
                COUNT(*) FILTER (
                    WHERE pm.status = 'cancelled'
                      AND pm.cancelled_at BETWEEN ? AND ?
                      AND (pm.trial_ends_at IS NULL OR pm.cancelled_at >= pm.trial_ends_at)
                      AND NOT (COALESCE(pm.cancel_reason, '') ILIKE ANY (ARRAY[{$placeholders}]))
                ) AS voluntary,
                COUNT(*) FILTER (
                    WHERE pm.trial_ends_at IS NULL OR pm.trial_ends_at <= NOW()
                ) AS post_trial_total
            FROM patient_memberships pm
            WHERE pm.tenant_id = ?
              AND pm.started_at <= ?
              AND pm.parent_membership_id IS NULL
        ", [
            $periodStart, $periodEnd,
            $periodStart, $periodEnd, ...$likes,
            $periodStart, $periodEnd, ...$likes,
            $tenantId, $periodEnd,
        ]);

        // Denominator is the post-trial cohort — members who actually entered
        // the paying lifecycle. Trial-only signups don't get to dilute the
        // churn rate.
        $denom = (int) $result->post_trial_total;
        $vol = (int) $result->voluntary;
        $invol = (int) $result->involuntary;
        $trialAbandonments = (int) $result->trial_abandonments;

        if ($denom === 0) {
            return [
                'rate' => 0.0, 'voluntary_rate' => 0.0, 'involuntary_rate' => 0.0,
                'voluntary_count' => 0, 'involuntary_count' => 0,
                'trial_abandonment_count' => $trialAbandonments,
                'total' => 0,
            ];
        }

        return [
            'rate' => round((($vol + $invol) / $denom) * 100, 2),
            'voluntary_rate' => round(($vol / $denom) * 100, 2),
            'involuntary_rate' => round(($invol / $denom) * 100, 2),
            'voluntary_count' => $vol,
            'involuntary_count' => $invol,
            'trial_abandonment_count' => $trialAbandonments,
            'total' => $denom,
        ];
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
