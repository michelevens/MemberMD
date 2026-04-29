<?php

namespace App\Services;

use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Aggregations across an operator's tenant scope.
 *
 * All methods accept an explicit array of tenant ids so the service is pure
 * (no implicit OperatorContext dependency) and can be unit-tested cleanly.
 *
 * Money is in cents throughout. Time-series uses 'YYYY-MM-DD' for daily and
 * 'YYYY-MM' for monthly bucket keys. Caller picks granularity.
 */
class NetworkMetricsService
{
    /**
     * Top-line snapshot for a window (default last 30 days) plus the prior
     * window for delta comparisons.
     *
     * @param  string[]  $tenantIds
     */
    public function snapshot(array $tenantIds, ?CarbonImmutable $now = null, int $windowDays = 30): array
    {
        $now = $now ?? CarbonImmutable::now();
        $windowStart = $now->subDays($windowDays);
        $priorStart = $windowStart->subDays($windowDays);

        $current = $this->compute($tenantIds, $now, $windowStart);
        $prior = $this->compute($tenantIds, $windowStart, $priorStart);

        return [
            'current' => $current,
            'prior' => $prior,
            'deltas' => $this->deltas($current, $prior),
            'window_days' => $windowDays,
            'as_of' => $now->toIso8601String(),
        ];
    }

    /**
     * Daily MRR + member count + new + cancelled, last N days.
     * Returns array of buckets keyed by YYYY-MM-DD ascending.
     *
     * @param  string[]  $tenantIds
     * @return array<int, array<string, mixed>>
     */
    public function daily(array $tenantIds, ?CarbonImmutable $now = null, int $days = 30): array
    {
        $now = $now ?? CarbonImmutable::now();
        $start = $now->subDays($days)->startOfDay();
        $buckets = [];

        // Pre-fetch all memberships once. With <50K active members per
        // operator this is fine; switch to scheduled snapshots if it grows.
        $memberships = $this->loadMembershipsForTenants($tenantIds);

        for ($i = 0; $i < $days; $i++) {
            $day = $start->addDays($i);
            $endOfDay = $day->endOfDay();
            $buckets[] = [
                'bucket' => $day->toDateString(),
                'mrr_cents' => $this->mrrAsOf($memberships, $endOfDay),
                'member_count' => $this->activeMemberCountAsOf($memberships, $endOfDay),
                'new_members' => $this->newMembersInRange($memberships, $day->startOfDay(), $endOfDay),
                'cancelled' => $this->cancelledInRange($memberships, $day->startOfDay(), $endOfDay),
            ];
        }

        return $buckets;
    }

    /**
     * Monthly MRR + member count, last N months. Bucket = first day of month.
     *
     * @param  string[]  $tenantIds
     * @return array<int, array<string, mixed>>
     */
    public function monthly(array $tenantIds, ?CarbonImmutable $now = null, int $months = 12): array
    {
        $now = $now ?? CarbonImmutable::now();
        $start = $now->subMonths($months - 1)->startOfMonth();
        $memberships = $this->loadMembershipsForTenants($tenantIds);
        $buckets = [];

        for ($i = 0; $i < $months; $i++) {
            $monthStart = $start->addMonths($i);
            $monthEnd = $monthStart->endOfMonth();
            $bucketEnd = $monthEnd->isAfter($now) ? $now : $monthEnd;
            $buckets[] = [
                'bucket' => $monthStart->format('Y-m'),
                'mrr_cents' => $this->mrrAsOf($memberships, $bucketEnd),
                'member_count' => $this->activeMemberCountAsOf($memberships, $bucketEnd),
                'new_members' => $this->newMembersInRange($memberships, $monthStart, $bucketEnd),
                'cancelled' => $this->cancelledInRange($memberships, $monthStart, $bucketEnd),
            ];
        }

        return $buckets;
    }

    /**
     * Simple cohort retention curve: for a cohort of new members from N
     * months ago, what % are still active today? Returns 0..N months back.
     *
     * @param  string[]  $tenantIds
     * @return array<int, array<string, mixed>>
     */
    public function cohortRetention(array $tenantIds, ?CarbonImmutable $now = null, int $months = 12): array
    {
        $now = $now ?? CarbonImmutable::now();
        $memberships = $this->loadMembershipsForTenants($tenantIds);
        $points = [];

        for ($i = 0; $i < $months; $i++) {
            $cohortStart = $now->subMonths($months - $i - 1)->startOfMonth();
            $cohortEnd = $cohortStart->endOfMonth();
            $cohortIds = $memberships
                ->filter(fn ($m) => $m->started_at && $m->started_at->between($cohortStart, $cohortEnd))
                ->pluck('id');

            $cohortSize = $cohortIds->count();
            $stillActive = $memberships
                ->filter(fn ($m) => $cohortIds->contains($m->id) && $this->isActiveAsOf($m, $now))
                ->count();

            $points[] = [
                'cohort' => $cohortStart->format('Y-m'),
                'months_aged' => $months - $i - 1,
                'cohort_size' => $cohortSize,
                'still_active' => $stillActive,
                'retention_rate' => $cohortSize > 0 ? round($stillActive / $cohortSize, 4) : null,
            ];
        }

        return $points;
    }

    /**
     * Per-clinic deep dive — full snapshot + 30d daily + 12mo monthly for one
     * tenant, scoped to caller's allowed list.
     *
     * @param  string[]  $tenantIds
     */
    public function clinicDetail(array $tenantIds, string $tenantId, ?CarbonImmutable $now = null): ?array
    {
        if (!in_array($tenantId, $tenantIds, true)) {
            return null;
        }

        $now = $now ?? CarbonImmutable::now();
        $practice = Practice::find($tenantId);
        if (!$practice) {
            return null;
        }

        $singleScope = [$tenantId];
        return [
            'tenant' => [
                'id' => $practice->id,
                'name' => $practice->name,
                'city' => $practice->city,
                'state' => $practice->state,
                'specialty' => $practice->specialty,
                'tenant_code' => $practice->tenant_code,
                'is_active' => $practice->is_active,
                'subscription_status' => $practice->subscription_status,
                'stripe_connect_status' => $practice->stripe_connect_status,
                'stripe_charges_enabled' => (bool) $practice->stripe_charges_enabled,
                'patient_count' => Patient::where('tenant_id', $practice->id)->count(),
                'created_at' => $practice->created_at,
            ],
            'snapshot' => $this->snapshot($singleScope, $now, 30),
            'daily' => $this->daily($singleScope, $now, 30),
            'monthly' => $this->monthly($singleScope, $now, 12),
        ];
    }

    /**
     * Per-clinic rollups for a leaderboard / benchmarking view. Adds growth
     * rate vs. prior 30d so the UI can rank by trend, not just absolute MRR.
     *
     * @param  string[]  $tenantIds
     */
    public function clinics(array $tenantIds, ?CarbonImmutable $now = null): array
    {
        if (empty($tenantIds)) {
            return [];
        }

        $now = $now ?? CarbonImmutable::now();
        $thirtyAgo = $now->subDays(30);
        $sixtyAgo = $now->subDays(60);

        $tenants = Practice::whereIn('id', $tenantIds)
            ->withCount(['patients'])
            ->orderBy('name')
            ->get();

        $memberships = $this->loadMembershipsForTenants($tenantIds);

        return $tenants->map(function (Practice $p) use ($memberships, $now, $thirtyAgo, $sixtyAgo) {
            $tenantMemberships = $memberships->where('tenant_id', $p->id);
            $mrrNow = $this->mrrFromCollection($tenantMemberships, $now);
            $mrrThirty = $this->mrrFromCollection($tenantMemberships, $thirtyAgo);
            $memberCount = $this->countActiveFromCollection($tenantMemberships, $now);

            $growthPercent = $mrrThirty > 0
                ? round((($mrrNow - $mrrThirty) / $mrrThirty), 4)
                : null;

            $newLast30 = $tenantMemberships
                ->filter(fn ($m) => $m->started_at && $m->started_at->between($thirtyAgo, $now))
                ->count();
            $cancelledLast30 = $tenantMemberships
                ->filter(fn ($m) => $m->cancelled_at && $m->cancelled_at->between($thirtyAgo, $now))
                ->count();

            // Crude churn over last 30d
            $atStart = $this->countActiveFromCollection($tenantMemberships, $thirtyAgo);
            $churnRate = ($atStart + $cancelledLast30) > 0
                ? round($cancelledLast30 / ($atStart + $cancelledLast30), 4)
                : 0.0;

            return [
                'tenant_id' => $p->id,
                'name' => $p->name,
                'city' => $p->city,
                'state' => $p->state,
                'is_active' => $p->is_active,
                'mrr_cents' => $mrrNow,
                'mrr_cents_30d_ago' => $mrrThirty,
                'growth_rate_30d' => $growthPercent,
                'member_count' => $memberCount,
                'new_members_30d' => $newLast30,
                'cancelled_30d' => $cancelledLast30,
                'churn_rate_30d' => $churnRate,
                'patient_count' => $p->patients_count ?? 0,
                'arpu_cents' => $memberCount > 0 ? (int) round($mrrNow / $memberCount) : 0,
                'stripe_connect_status' => $p->stripe_connect_status,
            ];
        })->values()->all();
    }

    // ─── Internals ──────────────────────────────────────────────────────────

    /**
     * Load memberships for the tenant scope with their plan attached. We pull
     * BOTH active and historical so the as-of calculations work without N
     * queries per bucket.
     *
     * @param  string[]  $tenantIds
     */
    private function loadMembershipsForTenants(array $tenantIds): Collection
    {
        if (empty($tenantIds)) {
            return collect();
        }

        return PatientMembership::whereIn('tenant_id', $tenantIds)
            ->with('plan:id,monthly_price,annual_price')
            ->get();
    }

    /**
     * "Snapshot" math for a window: counts + MRR at the END of the window,
     * plus rates over the window itself.
     */
    private function compute(array $tenantIds, CarbonImmutable $end, CarbonImmutable $start): array
    {
        $memberships = $this->loadMembershipsForTenants($tenantIds);

        $mrrCents = $this->mrrAsOf($memberships, $end);
        $memberCount = $this->activeMemberCountAsOf($memberships, $end);
        $patientCount = empty($tenantIds) ? 0 : Patient::whereIn('tenant_id', $tenantIds)->count();

        $newMembers = $this->newMembersInRange($memberships, $start, $end);
        $cancelled = $this->cancelledInRange($memberships, $start, $end);

        $atStart = $this->activeMemberCountAsOf($memberships, $start);
        $churnRate = ($atStart + $cancelled) > 0
            ? round($cancelled / ($atStart + $cancelled), 4)
            : 0.0;

        $tenantCount = empty($tenantIds) ? 0 : Practice::whereIn('id', $tenantIds)->count();
        $activeTenantCount = empty($tenantIds) ? 0 : Practice::whereIn('id', $tenantIds)->where('is_active', true)->count();

        return [
            'mrr_cents' => $mrrCents,
            'arr_cents' => $mrrCents * 12,
            'arpu_cents' => $memberCount > 0 ? (int) round($mrrCents / $memberCount) : 0,
            'member_count' => $memberCount,
            'patient_count' => $patientCount,
            'churn_rate' => $churnRate,
            'new_members' => $newMembers,
            'cancelled' => $cancelled,
            'tenant_count' => $tenantCount,
            'active_tenant_count' => $activeTenantCount,
        ];
    }

    /**
     * Compute deltas for headline metrics. Money/counts as raw integer diffs;
     * rates as percentage-point diffs.
     */
    private function deltas(array $current, array $prior): array
    {
        return [
            'mrr_cents_delta' => $current['mrr_cents'] - $prior['mrr_cents'],
            'mrr_pct_change' => $this->pctChange($prior['mrr_cents'], $current['mrr_cents']),
            'member_count_delta' => $current['member_count'] - $prior['member_count'],
            'member_pct_change' => $this->pctChange($prior['member_count'], $current['member_count']),
            'arpu_cents_delta' => $current['arpu_cents'] - $prior['arpu_cents'],
            'churn_rate_delta' => round($current['churn_rate'] - $prior['churn_rate'], 4),
            'new_members_delta' => $current['new_members'] - $prior['new_members'],
        ];
    }

    private function pctChange(int|float $from, int|float $to): ?float
    {
        if ($from <= 0) {
            return null;
        }
        return round(($to - $from) / $from, 4);
    }

    private function mrrAsOf(Collection $memberships, CarbonImmutable $when): int
    {
        return (int) $memberships
            ->filter(fn ($m) => $this->isActiveAsOf($m, $when))
            ->reduce(fn ($carry, $m) => $carry + $this->monthlyValueCents($m), 0);
    }

    private function mrrFromCollection(Collection $memberships, CarbonImmutable $when): int
    {
        return $this->mrrAsOf($memberships, $when);
    }

    private function activeMemberCountAsOf(Collection $memberships, CarbonImmutable $when): int
    {
        return $memberships->filter(fn ($m) => $this->isActiveAsOf($m, $when))->count();
    }

    private function countActiveFromCollection(Collection $memberships, CarbonImmutable $when): int
    {
        return $this->activeMemberCountAsOf($memberships, $when);
    }

    private function newMembersInRange(Collection $memberships, CarbonImmutable $start, CarbonImmutable $end): int
    {
        return $memberships
            ->filter(fn ($m) => $m->started_at && $m->started_at->between($start, $end))
            ->count();
    }

    private function cancelledInRange(Collection $memberships, CarbonImmutable $start, CarbonImmutable $end): int
    {
        return $memberships
            ->filter(fn ($m) => $m->cancelled_at && $m->cancelled_at->between($start, $end))
            ->count();
    }

    /**
     * "Active" means: started before $when AND (not cancelled OR cancelled
     * after $when). Treats `paused` as inactive for MRR purposes — paused
     * members aren't billing.
     */
    private function isActiveAsOf(PatientMembership $m, CarbonImmutable $when): bool
    {
        if (!$m->started_at || $m->started_at->greaterThan($when)) {
            return false;
        }
        if ($m->cancelled_at && $m->cancelled_at->lessThanOrEqualTo($when)) {
            return false;
        }
        // Paused: treat as not contributing to MRR
        if ($m->paused_at && $m->paused_at->lessThanOrEqualTo($when)) {
            return false;
        }
        return true;
    }

    /**
     * Annual plans contribute monthly_price ≈ annual / 12.
     */
    private function monthlyValueCents(PatientMembership $m): int
    {
        if (!$m->plan) {
            return 0;
        }
        if ($m->billing_frequency === 'annual') {
            return (int) round(((float) $m->plan->annual_price) * 100 / 12);
        }
        return (int) round(((float) $m->plan->monthly_price) * 100);
    }
}
