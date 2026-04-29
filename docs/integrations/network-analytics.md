# Network Analytics — Methodology and API

> **Status:** Shipped — Q2 2026
> **Owner:** Platform analytics
> **Related:** ROADMAP.md § Phase 1.3, docs/architecture/operator-rbac.md

This document covers the math behind operator-tier analytics (network rollups, time-series, cohort retention, per-clinic deep-dive) so operations leaders, finance, and engineering all share one source of truth on how the numbers are computed.

## Headline definitions

All money is in **cents** (integer) on the wire. Frontend formats for display.

| Metric | Formula |
|---|---|
| **MRR (cents)** | Sum across all *active* memberships in scope of: monthly plan price × 100 (monthly billing) **OR** annual plan price × 100 ÷ 12 (annual billing). |
| **ARR (cents)** | MRR × 12. |
| **ARPU (cents)** | MRR ÷ active member count, rounded. Zero when no members. |
| **Active member** | `started_at ≤ as_of` AND (`cancelled_at` is null OR `cancelled_at > as_of`) AND (`paused_at` is null OR `paused_at > as_of`). |
| **Churn rate (window)** | `cancelled_in_window ÷ (active_at_start_of_window + cancelled_in_window)`. Returns 0 when denominator is 0. |
| **Patient count** | Total patients in scope (regardless of membership status). |
| **New members (window)** | Memberships where `started_at` falls within the window. |
| **Cancelled (window)** | Memberships where `cancelled_at` falls within the window. |

### Why "paused" doesn't count toward MRR

Paused memberships aren't billing during the pause. Counting them inflates MRR vs. what hits Stripe. We treat them as inactive for MRR/member-count purposes but they remain in the database and resume normally.

### Why annual billing is divided by 12

Operators care about *recurring* revenue normalized to a monthly cadence. Annual customers are smoothed across the year so MRR doesn't spike when an annual subscription bills.

## Endpoints

All under `/api/operator/analytics/*` with `auth:sanctum` + `operator.scope` middleware. The OperatorContext (per `docs/architecture/operator-rbac.md`) determines which tenant ids are visible — every endpoint is automatically scoped to the current operator.

### `GET /network`

Top-line snapshot for the last 30 days plus the prior 30-day window for delta comparisons.

```jsonc
{
  "data": {
    "current": {
      "mrr_cents": 1250000,
      "arr_cents": 15000000,
      "arpu_cents": 25000,
      "member_count": 50,
      "patient_count": 78,
      "churn_rate": 0.02,
      "new_members": 5,
      "cancelled": 1,
      "tenant_count": 12,
      "active_tenant_count": 12
    },
    "prior": { /* same shape, prior 30d */ },
    "deltas": {
      "mrr_cents_delta": 100000,
      "mrr_pct_change": 0.087,    // 8.7% growth
      "member_count_delta": 4,
      "member_pct_change": 0.087,
      "arpu_cents_delta": 0,
      "churn_rate_delta": -0.015, // 1.5pp lower than prior
      "new_members_delta": 2
    },
    "window_days": 30,
    "as_of": "2026-04-29T01:23:45+00:00"
  }
}
```

`*_pct_change` is `null` when the prior value was 0 (avoid divide-by-zero).

### `GET /timeseries?granularity=daily|monthly|both&days=30&months=12`

Time-bucketed snapshots. Default returns both daily (last 30 days) and monthly (last 12 months) so the frontend can toggle without a re-fetch.

```jsonc
{
  "data": {
    "granularity": "both",
    "daily": [
      { "bucket": "2026-03-30", "mrr_cents": 1180000, "member_count": 47, "new_members": 0, "cancelled": 0 },
      { "bucket": "2026-03-31", "mrr_cents": 1200000, "member_count": 48, "new_members": 1, "cancelled": 0 }
      // ... 30 buckets total
    ],
    "monthly": [
      { "bucket": "2025-05", "mrr_cents": 800000, "member_count": 32, "new_members": 4, "cancelled": 1 },
      { "bucket": "2025-06", "mrr_cents": 900000, "member_count": 36, "new_members": 5, "cancelled": 1 }
      // ... 12 buckets total
    ]
  }
}
```

Validation:
- `granularity` ∈ `{daily, monthly, both}`, default `both`
- `days` ∈ `[7, 90]`, default `30`
- `months` ∈ `[3, 24]`, default `12`

### `GET /cohort-retention?months=12`

Simple cohort retention curve. For each of the last N months, what % of members who started in that month are still active today?

```jsonc
{
  "data": [
    { "cohort": "2025-05", "months_aged": 11, "cohort_size": 4, "still_active": 3, "retention_rate": 0.75 },
    { "cohort": "2025-06", "months_aged": 10, "cohort_size": 6, "still_active": 5, "retention_rate": 0.83 }
    // ...
  ]
}
```

`retention_rate` is `null` when `cohort_size = 0`. The most recent cohort (`months_aged = 0`) typically shows ~1.0 retention because most members haven't had time to churn.

### `GET /clinics`

Per-tenant rollup with growth and churn, used for ranking and benchmarking views.

```jsonc
{
  "data": [
    {
      "tenant_id": "...",
      "name": "Downtown DPC",
      "city": "Austin", "state": "TX",
      "is_active": true,
      "mrr_cents": 250000,
      "mrr_cents_30d_ago": 220000,
      "growth_rate_30d": 0.136,
      "member_count": 10,
      "new_members_30d": 2,
      "cancelled_30d": 0,
      "churn_rate_30d": 0.0,
      "patient_count": 18,
      "arpu_cents": 25000,
      "stripe_connect_status": "active"
    }
    // ... one entry per clinic in scope
  ]
}
```

`growth_rate_30d` is `null` when `mrr_cents_30d_ago = 0` (e.g., new clinic with no prior MRR).

### `GET /clinics/{tenantId}`

Per-clinic deep-dive. Returns the clinic's own snapshot + 30d daily + 12mo monthly. Returns 404 if the requested tenant is not in the operator's scope (defense against ID enumeration).

```jsonc
{
  "data": {
    "tenant": {
      "id": "...",
      "name": "Downtown DPC",
      "city": "Austin", "state": "TX",
      "specialty": "Family Medicine",
      "patient_count": 18,
      "stripe_connect_status": "active",
      "stripe_charges_enabled": true,
      "is_active": true,
      "subscription_status": "active",
      "tenant_code": "ABC123",
      "created_at": "2025-08-12T..."
    },
    "snapshot": { /* same shape as /network */ },
    "daily":   [ /* 30 buckets */ ],
    "monthly": [ /* 12 buckets */ ]
  }
}
```

## Implementation notes

### Pure service, easy to test

`App\Services\NetworkMetricsService` accepts an explicit `array $tenantIds` for every method (no implicit OperatorContext dependency). The controller pulls the scope from the context and passes it in. This makes the service unit-testable without a request lifecycle.

### Membership pre-fetch

Each endpoint loads the operator's full membership set **once** with the plan eagerly attached, then runs all bucket-level math in PHP collections. With <50K active members per operator this is fast (single query, in-memory filter). For larger operators, switch to:

1. A scheduled snapshot table (`operator_metrics_daily` keyed by `operator_id, bucket`).
2. Materialized views computed by a daily job.

The interface stays the same — only the internals of `NetworkMetricsService` change.

### Window math edge cases

- **Empty operator scope** (no tenants): all metrics return zero, no error. Deltas all zero.
- **Same-day start and cancel** (rare but possible): the membership counts as a "new member" and a "cancelled" in the same window, but is not active at end of window. MRR contribution: 0.
- **Membership with no plan** (orphaned plan_id): contributes 0 to MRR, still counted in member count if active. Logs a warning at the model level (not the service).

### As-of semantics

"Active as of T" means the membership is producing revenue at instant T. For monthly time-series, we use **end of bucket** as the as-of point — so a member who started on day 15 of the month appears in that month's MRR bucket. This matches how Stripe reports MRR.

## Frontend rendering

The `OperatorNetworkDashboard` component (`frontend/src/components/portals/operator/OperatorNetworkDashboard.tsx`) renders:

1. **4 KPI cards** with delta badges (↑/↓/= vs. prior 30d)
2. **MRR over time** area chart with daily/monthly toggle
3. **Member count** line chart + **new vs. cancelled** stacked bar chart
4. **Cohort retention** line chart
5. **Top 5 clinics by MRR** + **Top 5 by 30d growth** + **Lowest 5 by MRR** + **Highest 5 by churn**
6. **Clinic drilldown drawer** — click any clinic in any leaderboard to open a side drawer with the per-clinic snapshot + charts

All charts use Recharts.

## Operations

### "MRR doesn't match Stripe"

Possible causes, in order:
1. Stripe reports gross including failed charges; this metric reports plan price × active subscriptions. They diverge during a dunning cycle.
2. Paused memberships are excluded here; some Stripe MRR reports include them.
3. Annual subscriptions: we smooth to monthly; some Stripe views show full annual revenue in the month it billed.

For the operator audit trail, the source of truth is `audit_logs` + `payments` table. This dashboard is a forecast of recurring revenue at steady state, not a recap of cash collected.

### "New clinic doesn't show up"

`/clinics` and `/network` read from the operator's tenant scope (per `OperatorContext`). If a new Practice was provisioned under a different Operator, it won't appear. Check `practices.operator_id`.

### "Drilldown returns 404"

`/clinics/{tenantId}` validates tenant membership in the operator scope. 404 means either the tenant ID is wrong OR the tenant belongs to a sibling operator (intentional defense against ID enumeration).
