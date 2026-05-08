// ===== Operator Network Dashboard =====
// Network-wide rollup: KPIs with trend deltas vs. prior period, MRR/member
// time-series charts (daily 30d / monthly 12mo toggle), top/bottom clinic
// leaderboards by MRR and growth, per-clinic drilldown drawer.

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  UserCheck,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Loader2,
  X,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  operatorService,
  utilizationService,
  type OperatorNetworkMetrics,
  type OperatorClinicMetric,
  type OperatorTimeseries,
  type OperatorClinicDetail,
  type OperatorTimeBucket,
  type OperatorCohortPoint,
  type OperatorUtilization,
} from "../../../lib/api";

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  navy700: "#334e68",
  teal500: "#27ab83",
  teal600: "#147d64",
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  red500: "#ef4444",
  red50: "#fef2f2",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  green500: "#22c55e",
  green50: "#f0fdf4",
  green700: "#15803d",
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatSignedPercent(rate: number | null): string {
  if (rate === null) return "—";
  const sign = rate > 0 ? "+" : "";
  return `${sign}${(rate * 100).toFixed(1)}%`;
}

function formatBucketLabel(bucket: string, granularity: "daily" | "monthly"): string {
  if (granularity === "monthly") {
    const [year, month] = bucket.split("-");
    return new Date(Number(year), Number(month) - 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  // daily YYYY-MM-DD
  const d = new Date(bucket + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OperatorNetworkDashboard() {
  const [metrics, setMetrics] = useState<OperatorNetworkMetrics | null>(null);
  const [clinics, setClinics] = useState<OperatorClinicMetric[]>([]);
  const [timeseries, setTimeseries] = useState<OperatorTimeseries | null>(null);
  const [cohort, setCohort] = useState<OperatorCohortPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [granularity, setGranularity] = useState<"daily" | "monthly">("monthly");
  const [drilldownTenantId, setDrilldownTenantId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [m, c, t, ch] = await Promise.all([
        operatorService.network(),
        operatorService.clinics(),
        operatorService.timeseries("both", { days: 30, months: 12 }),
        operatorService.cohortRetention(12),
      ]);
      if (cancelled) return;
      if (m.error) setError(m.error);
      if (m.data) setMetrics(m.data);
      if (c.data) setClinics(c.data);
      if (t.data) setTimeseries(t.data);
      if (ch.data) setCohort(ch.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  if (error || !metrics) {
    return <ErrorPanel message={error || "Could not load network metrics."} />;
  }

  const cur = metrics.current;
  const deltas = metrics.deltas;
  const buckets = (granularity === "daily" ? timeseries?.daily : timeseries?.monthly) ?? [];

  return (
    <div className="space-y-5">
      {/* Stripe-grade page header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Network</h2>
          <p className="text-sm text-slate-500 mt-0.5">MRR, members, retention, and clinic leaderboards across your network</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Network MRR"
          value={formatMoney(cur.mrrCents)}
          delta={deltas.mrrPctChange}
          icon={DollarSign}
          accent={C.teal600}
        />
        <KpiCard
          label="Active Members"
          value={formatNumber(cur.memberCount)}
          delta={deltas.memberPctChange}
          icon={UserCheck}
          accent={C.navy700}
        />
        <KpiCard
          label="ARPU"
          value={formatMoney(cur.arpuCents)}
          deltaAbsolute={deltas.arpuCentsDelta !== 0 ? formatMoney(deltas.arpuCentsDelta) : null}
          icon={TrendingUp}
          accent={C.teal600}
        />
        <KpiCard
          label="30-day Churn"
          value={formatPercent(cur.churnRate)}
          deltaAbsolute={deltas.churnRateDelta !== 0 ? formatSignedPercent(deltas.churnRateDelta) : null}
          deltaInverted
          icon={cur.churnRate > 0.05 ? TrendingDown : TrendingUp}
          accent={cur.churnRate > 0.05 ? C.red500 : C.green700}
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SmallStat label="Active clinics" value={`${cur.activeTenantCount} of ${cur.tenantCount}`} />
        <SmallStat label="New members (30d)" value={formatNumber(cur.newMembers)} delta={deltas.newMembersDelta} />
        <SmallStat label="Cancellations (30d)" value={formatNumber(cur.cancelled)} />
      </div>

      {/* Cash-value ROI rollup across the operator's tenants — H1
          wedge demo. Self-fetches; renders nothing if usage data
          hasn't accrued yet for a brand-new operator. */}
      <NetworkROISection />

      {/* MRR over time chart */}
      <div
        className="rounded-2xl border p-5"
        style={{ backgroundColor: C.white, borderColor: C.slate200 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: C.navy900 }}>
              Revenue & members over time
            </h3>
            <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
              {granularity === "daily" ? "Last 30 days, by day" : "Last 12 months, by month"}
            </p>
          </div>
          <GranularityToggle value={granularity} onChange={setGranularity} />
        </div>

        {buckets.length === 0 ? (
          <p className="text-xs py-12 text-center" style={{ color: C.slate400 }}>No data in this window.</p>
        ) : (
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <AreaChart data={buckets} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.teal500} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.teal500} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.slate100} vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(v) => formatBucketLabel(v, granularity)}
                  stroke={C.slate400}
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: C.slate200 }}
                />
                <YAxis
                  tickFormatter={(v: number) => formatMoney(v)}
                  stroke={C.slate400}
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: C.slate200 }}
                  width={60}
                />
                <Tooltip content={<MrrTooltip granularity={granularity} />} />
                <Area
                  type="monotone"
                  dataKey="mrrCents"
                  stroke={C.teal500}
                  strokeWidth={2}
                  fill="url(#mrrGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Member count + new/cancelled split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div
          className="rounded-2xl border p-5"
          style={{ backgroundColor: C.white, borderColor: C.slate200 }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: C.navy900 }}>
            Member count over time
          </h3>
          {buckets.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: C.slate400 }}>No data.</p>
          ) : (
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={buckets} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.slate100} vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(v) => formatBucketLabel(v, granularity)}
                    stroke={C.slate400}
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: C.slate200 }}
                  />
                  <YAxis
                    stroke={C.slate400}
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: C.slate200 }}
                    width={40}
                  />
                  <Tooltip
                    formatter={((v: unknown) => [formatNumber(Number(v ?? 0)), "Members"]) as never}
                    labelFormatter={(v) => formatBucketLabel(String(v), granularity)}
                    contentStyle={{ borderRadius: "8px", borderColor: C.slate200, fontSize: "12px" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="memberCount"
                    stroke={C.navy700}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div
          className="rounded-2xl border p-5"
          style={{ backgroundColor: C.white, borderColor: C.slate200 }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: C.navy900 }}>
            New vs. cancelled per period
          </h3>
          {buckets.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: C.slate400 }}>No data.</p>
          ) : (
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={buckets} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.slate100} vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(v) => formatBucketLabel(v, granularity)}
                    stroke={C.slate400}
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: C.slate200 }}
                  />
                  <YAxis
                    stroke={C.slate400}
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: C.slate200 }}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", borderColor: C.slate200, fontSize: "12px" }}
                    labelFormatter={(v) => formatBucketLabel(String(v), granularity)}
                  />
                  <Bar dataKey="newMembers" name="New" fill={C.teal500} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cancelled" name="Cancelled" fill={C.red500} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Cohort retention */}
      {cohort.length > 0 && (
        <div
          className="rounded-2xl border p-5"
          style={{ backgroundColor: C.white, borderColor: C.slate200 }}
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold" style={{ color: C.navy900 }}>Cohort retention</h3>
            <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
              % of members from each cohort still active today
            </p>
          </div>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={cohort} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.slate100} vertical={false} />
                <XAxis
                  dataKey="cohort"
                  tickFormatter={(v) => formatBucketLabel(v, "monthly")}
                  stroke={C.slate400}
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: C.slate200 }}
                />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  stroke={C.slate400}
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: C.slate200 }}
                  width={44}
                />
                <Tooltip
                  formatter={((value: unknown, _name: unknown, item: { payload: OperatorCohortPoint }) => {
                    const point = item.payload;
                    const v = value as number | null | undefined;
                    return [
                      v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`,
                      `${point.stillActive}/${point.cohortSize} active`,
                    ];
                  }) as never}
                  labelFormatter={(v) => formatBucketLabel(String(v), "monthly")}
                  contentStyle={{ borderRadius: "8px", borderColor: C.slate200, fontSize: "12px" }}
                />
                <Line
                  type="monotone"
                  dataKey="retentionRate"
                  stroke={C.teal600}
                  strokeWidth={2}
                  dot={{ r: 4, fill: C.teal600 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClinicLeaderboard
          title="Top clinics by MRR"
          data={[...clinics].sort((a, b) => b.mrrCents - a.mrrCents).slice(0, 5)}
          metric="mrr"
          onSelect={setDrilldownTenantId}
        />
        <ClinicLeaderboard
          title="Top growth (30 days)"
          data={[...clinics]
            .filter(c => c.growthRate30d !== null)
            .sort((a, b) => (b.growthRate30d ?? 0) - (a.growthRate30d ?? 0))
            .slice(0, 5)}
          metric="growth"
          onSelect={setDrilldownTenantId}
        />
      </div>

      {/* Lowest performers */}
      {clinics.length > 5 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ClinicLeaderboard
            title="Lowest clinics by MRR"
            data={[...clinics]
              .filter(c => c.mrrCents > 0)
              .sort((a, b) => a.mrrCents - b.mrrCents)
              .slice(0, 5)}
            metric="mrr"
            onSelect={setDrilldownTenantId}
          />
          <ClinicLeaderboard
            title="Highest churn (30 days)"
            data={[...clinics]
              .filter(c => c.churnRate30d > 0)
              .sort((a, b) => b.churnRate30d - a.churnRate30d)
              .slice(0, 5)}
            metric="churn"
            onSelect={setDrilldownTenantId}
          />
        </div>
      )}

      {/* Drilldown drawer */}
      {drilldownTenantId && (
        <ClinicDrilldownDrawer tenantId={drilldownTenantId} onClose={() => setDrilldownTenantId(null)} />
      )}
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function GranularityToggle({ value, onChange }: { value: "daily" | "monthly"; onChange: (g: "daily" | "monthly") => void }) {
  return (
    <div className="inline-flex rounded-lg border" style={{ borderColor: C.slate200, padding: "2px" }}>
      {(["daily", "monthly"] as const).map((g) => (
        <button
          key={g}
          onClick={() => onChange(g)}
          className="px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize"
          style={{
            backgroundColor: value === g ? C.navy700 : "transparent",
            color: value === g ? C.white : C.slate500,
          }}
        >
          {g === "daily" ? "30d" : "12mo"}
        </button>
      ))}
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  deltaAbsolute,
  deltaInverted = false,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaAbsolute?: string | null;
  deltaInverted?: boolean;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ backgroundColor: C.white, borderColor: C.slate200 }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.slate500 }}>{label}</p>
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <p className="text-2xl font-bold" style={{ color: C.navy900 }}>{value}</p>
      <DeltaBadge value={delta} absolute={deltaAbsolute} inverted={deltaInverted} />
    </div>
  );
}

function DeltaBadge({
  value,
  absolute,
  inverted = false,
}: {
  value?: number | null;
  absolute?: string | null;
  inverted?: boolean;
}) {
  if (value === undefined && absolute === undefined) return null;

  let direction: "up" | "down" | "flat" = "flat";
  if (value !== undefined && value !== null) {
    if (value > 0.0005) direction = "up";
    else if (value < -0.0005) direction = "down";
  } else if (absolute && absolute.startsWith("+")) {
    direction = "up";
  } else if (absolute && absolute.startsWith("-")) {
    direction = "down";
  }

  // For inverted metrics (e.g., churn), down is good and up is bad
  const isPositive = inverted ? direction === "down" : direction === "up";
  const isNegative = inverted ? direction === "up" : direction === "down";

  const color = isPositive ? C.green700 : isNegative ? C.red500 : C.slate500;
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  const display = absolute
    ? absolute
    : value === null || value === undefined
    ? "no prior data"
    : formatSignedPercent(value);

  return (
    <div className="flex items-center gap-1 mt-2 text-xs font-semibold" style={{ color }}>
      <Icon className="w-3.5 h-3.5" />
      <span>{display}</span>
      <span className="font-normal" style={{ color: C.slate400 }}>vs. prior 30d</span>
    </div>
  );
}

function SmallStat({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ backgroundColor: C.white, borderColor: C.slate200 }}
    >
      <p className="text-xs" style={{ color: C.slate500 }}>{label}</p>
      <div className="flex items-baseline gap-2 mt-0.5">
        <p className="text-base font-semibold" style={{ color: C.navy900 }}>{value}</p>
        {delta !== undefined && delta !== 0 && (
          <span className="text-xs font-medium" style={{ color: delta > 0 ? C.green700 : C.red500 }}>
            {delta > 0 ? "+" : ""}{delta}
          </span>
        )}
      </div>
    </div>
  );
}

function ClinicLeaderboard({
  title,
  data,
  metric,
  onSelect,
}: {
  title: string;
  data: OperatorClinicMetric[];
  metric: "mrr" | "growth" | "churn";
  onSelect: (tenantId: string) => void;
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ backgroundColor: C.white, borderColor: C.slate200 }}
    >
      <h3 className="text-sm font-semibold mb-4" style={{ color: C.navy900 }}>{title}</h3>
      {data.length === 0 ? (
        <p className="text-xs" style={{ color: C.slate400 }}>No clinics match this view.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.map((c) => (
            <li key={c.tenantId}>
              <button
                onClick={() => onSelect(c.tenantId)}
                className="w-full flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg transition-colors hover:bg-slate-50 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: C.navy900 }}>{c.name}</p>
                  <p className="text-xs truncate" style={{ color: C.slate500 }}>
                    {c.memberCount} members · ARPU {formatMoney(c.arpuCents)}
                  </p>
                </div>
                <p className="text-sm font-bold shrink-0" style={{ color: metricColor(metric, c) }}>
                  {metricValue(metric, c)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function metricValue(metric: "mrr" | "growth" | "churn", c: OperatorClinicMetric): string {
  if (metric === "mrr") return formatMoney(c.mrrCents);
  if (metric === "growth") return formatSignedPercent(c.growthRate30d);
  return formatPercent(c.churnRate30d);
}

function metricColor(metric: "mrr" | "growth" | "churn", c: OperatorClinicMetric): string {
  if (metric === "mrr") return C.teal600;
  if (metric === "growth") {
    if (c.growthRate30d === null || c.growthRate30d === 0) return C.slate500;
    return c.growthRate30d > 0 ? C.green700 : C.red500;
  }
  return c.churnRate30d > 0.05 ? C.red500 : C.slate500;
}

// ─── Drilldown Drawer ──────────────────────────────────────────────────────

function ClinicDrilldownDrawer({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<OperatorClinicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await operatorService.clinicDetail(tenantId);
    if (res.error) setError(res.error);
    if (res.data) setDetail(res.data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex" style={{ backgroundColor: "rgba(16,42,67,0.5)" }} onClick={onClose}>
      <div
        className="ml-auto w-full max-w-2xl h-full overflow-y-auto"
        style={{ backgroundColor: C.white, boxShadow: "-12px 0 32px rgba(16,42,67,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.slate500 }}>Clinic detail</p>
            <h3 className="text-base font-semibold mt-0.5" style={{ color: C.navy900 }}>
              {detail?.tenant.name ?? "Loading…"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <X className="w-5 h-5" style={{ color: C.slate500 }} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.slate400 }} />
            </div>
          )}

          {error && <ErrorPanel message={error} />}

          {detail && (
            <>
              {/* Tenant meta */}
              <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: C.slate500 }}>
                {detail.tenant.specialty && <span className="px-2 py-1 rounded-md" style={{ backgroundColor: C.slate100, color: C.slate600 }}>{detail.tenant.specialty}</span>}
                {detail.tenant.city && <span>{detail.tenant.city}{detail.tenant.state ? `, ${detail.tenant.state}` : ""}</span>}
                <span>·</span>
                <span>{detail.tenant.patientCount} patients</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {detail.tenant.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <DrilldownKpi label="MRR" value={formatMoney(detail.snapshot.current.mrrCents)} delta={detail.snapshot.deltas.mrrPctChange} />
                <DrilldownKpi label="Members" value={formatNumber(detail.snapshot.current.memberCount)} delta={detail.snapshot.deltas.memberPctChange} />
                <DrilldownKpi label="ARPU" value={formatMoney(detail.snapshot.current.arpuCents)} />
                <DrilldownKpi label="Churn (30d)" value={formatPercent(detail.snapshot.current.churnRate)} />
              </div>

              {/* Daily MRR */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: C.slate500 }}>
                  MRR — last 30 days
                </h4>
                <DrilldownChart data={detail.daily} dataKey="mrrCents" granularity="daily" formatValue={formatMoney} />
              </div>

              {/* Monthly MRR */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: C.slate500 }}>
                  MRR — last 12 months
                </h4>
                <DrilldownChart data={detail.monthly} dataKey="mrrCents" granularity="monthly" formatValue={formatMoney} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DrilldownKpi({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: C.slate200, backgroundColor: C.slate50 }}>
      <p className="text-xs" style={{ color: C.slate500 }}>{label}</p>
      <p className="text-lg font-semibold mt-1" style={{ color: C.navy900 }}>{value}</p>
      {delta !== undefined && (
        <p className="text-xs mt-0.5" style={{ color: delta && delta > 0 ? C.green700 : delta && delta < 0 ? C.red500 : C.slate500 }}>
          {delta === null ? "no prior" : formatSignedPercent(delta)}
        </p>
      )}
    </div>
  );
}

function DrilldownChart({
  data,
  dataKey,
  granularity,
  formatValue,
}: {
  data: OperatorTimeBucket[];
  dataKey: keyof OperatorTimeBucket;
  granularity: "daily" | "monthly";
  formatValue: (n: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-xs" style={{ color: C.slate400 }}>No data.</p>;
  }
  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.teal500} stopOpacity={0.3} />
              <stop offset="100%" stopColor={C.teal500} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.slate100} vertical={false} />
          <XAxis
            dataKey="bucket"
            tickFormatter={(v) => formatBucketLabel(v, granularity)}
            stroke={C.slate400}
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: C.slate200 }}
          />
          <YAxis
            tickFormatter={(v: number) => formatValue(v)}
            stroke={C.slate400}
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: C.slate200 }}
            width={56}
          />
          <Tooltip
            formatter={((v: unknown) => [formatValue(Number(v ?? 0)), ""]) as never}
            labelFormatter={(v) => formatBucketLabel(String(v), granularity)}
            contentStyle={{ borderRadius: "8px", borderColor: C.slate200, fontSize: "12px" }}
          />
          <Area type="monotone" dataKey={dataKey as string} stroke={C.teal500} strokeWidth={2} fill={`url(#grad-${String(dataKey)})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface MrrTooltipPayload {
  payload: OperatorTimeBucket;
  value: number;
}

function MrrTooltip({ active, payload, granularity }: { active?: boolean; payload?: MrrTooltipPayload[]; granularity: "daily" | "monthly" }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg shadow-lg border p-3" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
      <p className="text-xs font-semibold mb-1" style={{ color: C.navy900 }}>
        {formatBucketLabel(p.bucket, granularity)}
      </p>
      <div className="space-y-0.5 text-xs" style={{ color: C.slate600 }}>
        <p>MRR: <span className="font-semibold" style={{ color: C.teal600 }}>{formatMoney(p.mrrCents)}</span></p>
        <p>Members: <span className="font-medium" style={{ color: C.navy700 }}>{formatNumber(p.memberCount)}</span></p>
        <p>New: {p.newMembers} · Cancelled: {p.cancelled}</p>
      </div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: C.red50, borderColor: C.red500, color: C.red500 }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}

// Suppress unused-export warning for ArrowRight (reserved for future open-clinic CTA)
void ArrowRight;

// ─── Network ROI section ────────────────────────────────────────────────
//
// Aggregates entitlement_usage.cash_value_used across every tenant under
// the active operator. The H1 wedge demo number — what value did our
// memberships deliver across the whole portfolio? Self-fetches.

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function NetworkROISection() {
  const [data, setData] = useState<OperatorUtilization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await utilizationService.operator();
        if (!cancelled) setData(res.data ?? null);
      } catch {
        // Silent — section just hides if the endpoint hiccups.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div
        className="rounded-2xl border p-6 flex items-center justify-center"
        style={{ backgroundColor: C.white, borderColor: C.slate200 }}
      >
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  // apiFetch auto-camelCases the response. Defensive coercion below
  // so a partial / sparse response never crashes the network dashboard
  // (which the Practice portal also indirectly mounts via shared chunks).
  const tenantCount = Number(data?.tenantCount ?? 0);
  const savingsMonth = Number(data?.savingsThisMonth ?? 0);
  const savingsYear = Number(data?.savingsTrailingYear ?? 0);
  const usageEvents = Number(data?.usageEventsThisMonth ?? 0);
  const activeMembers = data?.totalActiveMembers ?? null;
  const topTenants = Array.isArray(data?.topTenantsThisMonth) ? data!.topTenantsThisMonth : [];

  // Hide when there's no usage history yet — a brand-new operator
  // shouldn't see a "$0 delivered" tile that looks broken.
  if (!data || (savingsMonth === 0 && savingsYear === 0)) {
    return null;
  }

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{ backgroundColor: C.white, borderColor: C.slate200 }}
    >
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4" style={{ color: C.teal600 }} />
        <h3 className="text-sm font-semibold" style={{ color: C.navy900 }}>
          Cash value delivered across {tenantCount} clinic{tenantCount === 1 ? "" : "s"}
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border p-3" style={{ borderColor: C.slate200, backgroundColor: C.green50 }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.green700 }}>
            This month
          </p>
          <p className="text-2xl font-bold mt-1" style={{ color: C.green700 }}>
            {fmtMoney(savingsMonth)}
          </p>
          <p className="text-[11px] mt-1" style={{ color: C.slate500 }}>
            {usageEvents} usage event{usageEvents === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: C.slate200 }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.slate500 }}>
            Trailing 12 mo
          </p>
          <p className="text-2xl font-bold mt-1" style={{ color: C.navy900 }}>
            {fmtMoney(savingsYear)}
          </p>
          <p className="text-[11px] mt-1" style={{ color: C.slate500 }}>
            in cash-equivalent care
          </p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: C.slate200 }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.slate500 }}>
            Active members
          </p>
          <p className="text-2xl font-bold mt-1" style={{ color: C.navy900 }}>
            {activeMembers ?? "—"}
          </p>
          <p className="text-[11px] mt-1" style={{ color: C.slate500 }}>
            across portfolio
          </p>
        </div>
      </div>

      {topTenants.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.slate500 }}>
            Top clinics by value delivered this month
          </p>
          <ul className="divide-y" style={{ borderColor: C.slate100 }}>
            {topTenants.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate" style={{ color: C.navy800 }}>{t.name}</span>
                <span style={{ color: C.slate600 }}>
                  {t.totalUsed} use{Number(t.totalUsed) === 1 ? "" : "s"} ·{" "}
                  <strong style={{ color: C.teal600 }}>{fmtMoney(Number(t.totalSavings))}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
