// ===== ProviderAnalyticsSection =====
// Provider analytics dashboard: revenue, patient panels, performance comparison

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Users,
  TrendingUp,
  BarChart3,
  Calendar,
  AlertTriangle,
  Heart,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { providerAnalyticsService } from "../../lib/api";
import type {
  ProviderSummaryItem,
  PracticePerformanceMetrics,
} from "../../types";
import {
  colors,
  StatCard,
  SubTabNav,
  ProgressBar,
  Skeleton,
  EmptyIllustration,
  SectionHeader,
} from "../../components/ui/design-system";

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_PROVIDERS: ProviderSummaryItem[] = [
  { providerId: "prov1", name: "Dr. Sarah Johnson", activeSubscriptions: 42, mrr: 6258, appointmentsThisMonth: 68 },
  { providerId: "prov2", name: "Dr. Michael Chen", activeSubscriptions: 35, mrr: 5425, appointmentsThisMonth: 52 },
  { providerId: "prov3", name: "Dr. Emily Rodriguez", activeSubscriptions: 28, mrr: 4172, appointmentsThisMonth: 41 },
];

const MOCK_PERFORMANCE: PracticePerformanceMetrics = {
  practiceMetrics: {
    totalUniquePatients: 105,
    appointmentsCompleted: 161,
    noShows: 8,
    cancellations: 14,
    completionRatePercent: 87.98,
    noShowRatePercent: 4.37,
  },
};

// ─── Sub-tabs ────────────────────────────────────────────────────────────────

type SubTab = "overview" | "providers" | "performance";

// ─── Chart Colors ────────────────────────────────────────────────────────────

const PROVIDER_COLORS = [colors.teal500, colors.blue500, colors.purple500];

const PIE_COLORS = [colors.green500, colors.red500, colors.amber500];

// ─── Component ───────────────────────────────────────────────────────────────

export function ProviderAnalyticsSection() {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [providers, setProviders] = useState<ProviderSummaryItem[]>(MOCK_PROVIDERS);
  const [performance, setPerformance] = useState<PracticePerformanceMetrics>(MOCK_PERFORMANCE);
  const [loading, setLoading] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [provRes, perfRes] = await Promise.allSettled([
        providerAnalyticsService.getProvidersSummary(),
        providerAnalyticsService.getPerformanceComparison(),
      ]);
      if (provRes.status === "fulfilled" && provRes.value.data && Array.isArray(provRes.value.data)) setProviders(provRes.value.data);
      if (perfRes.status === "fulfilled" && perfRes.value.data) setPerformance(perfRes.value.data);
    } catch { /* mock fallback */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const totalMRR = providers.reduce((sum, p) => sum + p.mrr, 0);
  const totalSubs = providers.reduce((sum, p) => sum + p.activeSubscriptions, 0);
  const totalAppts = providers.reduce((sum, p) => sum + p.appointmentsThisMonth, 0);
  const pm = performance.practiceMetrics;

  const tabs: { id: string; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "providers", label: "Provider Breakdown", icon: Users },
    { id: "performance", label: "Performance", icon: TrendingUp },
  ];

  // Chart data for MRR bar chart
  const mrrChartData = providers.map((p) => ({
    name: p.name.replace(/^Dr\.\s*/, ""),
    mrr: p.mrr,
  }));

  // Chart data for completion pie chart
  const completionPieData = [
    { name: "Completed", value: pm.appointmentsCompleted },
    { name: "No-Shows", value: pm.noShows },
    { name: "Cancellations", value: pm.cancellations },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <SubTabNav
        tabs={tabs}
        activeTab={subTab}
        onChange={(id) => setSubTab(id as SubTab)}
      />

      {/* Loading State — skeleton loaders */}
      {loading && (
        <div className="space-y-6 animate-fade-in-up">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} type="stat" />
            ))}
          </div>
          <Skeleton type="card" />
          <Skeleton type="card" />
        </div>
      )}

      {/* ─── Overview ─────────────────────────────────────────────────────── */}
      {subTab === "overview" && !loading && (
        <div className="space-y-6 animate-fade-in-up" role="tabpanel" id="panel-overview" aria-label="Overview tab content">
          {/* Top Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Monthly Recurring Revenue", value: `$${totalMRR.toLocaleString()}`, icon: DollarSign, color: colors.green500, bg: colors.green50 },
              { label: "Active Subscriptions", value: totalSubs, icon: Heart, color: colors.teal500, bg: colors.teal50 },
              { label: "Appointments This Month", value: totalAppts, icon: Calendar, color: colors.blue500, bg: colors.blue50 },
              { label: "Active Providers", value: providers.length, icon: Users, color: colors.purple500, bg: colors.purple50 },
            ].map((stat, i) => (
              <div key={i} className="animate-count-pop" style={{ animationDelay: `${i * 80}ms` }}>
                <StatCard
                  label={stat.label}
                  value={stat.value}
                  icon={stat.icon}
                  color={stat.color}
                  bg={stat.bg}
                />
              </div>
            ))}
          </div>

          {/* Practice Performance Summary */}
          <div className="rounded-xl shadow-sm border p-6 animate-fade-in-up" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
            <SectionHeader title="Practice Performance (This Month)" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
              {[
                { label: "Unique Patients", value: pm.totalUniquePatients, color: colors.blue500 },
                { label: "Completed", value: pm.appointmentsCompleted, color: colors.green500 },
                { label: "No-Shows", value: pm.noShows, color: colors.red500 },
                { label: "Cancellations", value: pm.cancellations, color: colors.amber500 },
                { label: "Completion Rate", value: `${pm.completionRatePercent.toFixed(1)}%`, color: colors.green600 },
                { label: "No-Show Rate", value: `${pm.noShowRatePercent.toFixed(1)}%`, color: pm.noShowRatePercent > 10 ? colors.red500 : colors.amber500 },
              ].map((item, i) => (
                <div key={i} className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.slate50 }}>
                  <div className="text-xl font-bold animate-count-pop" style={{ color: item.color }}>{item.value}</div>
                  <div className="text-xs mt-1" style={{ color: colors.slate500 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Provider MRR Bar Chart */}
          <div className="rounded-xl shadow-sm border p-6 animate-fade-in-up" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
            <SectionHeader title="Provider MRR Leaderboard" />
            {providers.length === 0 ? (
              <EmptyIllustration
                icon={BarChart3}
                title="No provider data"
                description="Provider MRR data will appear here once available."
              />
            ) : (
              <div className="mt-4" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mrrChartData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.slate200} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: colors.slate600, fontSize: 12 }}
                      axisLine={{ stroke: colors.slate200 }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: colors.slate600, fontSize: 12 }}
                      axisLine={{ stroke: colors.slate200 }}
                      tickLine={false}
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                    />
                    <Tooltip
                      formatter={(value) => [`$${Number(value).toLocaleString()}`, "MRR"]}
                      contentStyle={{
                        backgroundColor: colors.white,
                        border: `1px solid ${colors.slate200}`,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                    <Bar dataKey="mrr" radius={[6, 6, 0, 0]} maxBarSize={64}>
                      {mrrChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PROVIDER_COLORS[index % PROVIDER_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Provider Breakdown ───────────────────────────────────────────── */}
      {subTab === "providers" && !loading && (
        <div className="space-y-4 animate-fade-in-up" role="tabpanel" id="panel-providers" aria-label="Provider Breakdown tab content">
          <SectionHeader title="Provider Breakdown" />

          <div className="rounded-xl shadow-sm border overflow-hidden" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: colors.slate50 }}>
                  <th className="text-left px-5 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: colors.slate500 }}>Provider</th>
                  <th className="text-right px-5 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: colors.slate500 }}>MRR</th>
                  <th className="text-right px-5 py-3 font-medium text-xs uppercase tracking-wide hidden md:table-cell" style={{ color: colors.slate500 }}>Active Subs</th>
                  <th className="text-right px-5 py-3 font-medium text-xs uppercase tracking-wide hidden md:table-cell" style={{ color: colors.slate500 }}>Appts/Mo</th>
                  <th className="text-right px-5 py-3 font-medium text-xs uppercase tracking-wide hidden lg:table-cell" style={{ color: colors.slate500 }}>Avg Rev/Patient</th>
                  <th className="text-right px-5 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: colors.slate500 }}></th>
                </tr>
              </thead>
              <tbody>
                {providers.map(p => {
                  const avgRev = p.activeSubscriptions > 0 ? (p.mrr / p.activeSubscriptions).toFixed(0) : "0";
                  const isExpanded = expandedProvider === p.providerId;
                  return (
                    <>
                      <tr key={p.providerId} className="border-t" style={{ borderColor: colors.slate100 }}>
                        <td className="px-5 py-3 font-medium" style={{ color: colors.navy900 }}>{p.name}</td>
                        <td className="px-5 py-3 text-right font-bold" style={{ color: colors.green600 }}>${p.mrr.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right hidden md:table-cell" style={{ color: colors.slate600 }}>{p.activeSubscriptions}</td>
                        <td className="px-5 py-3 text-right hidden md:table-cell" style={{ color: colors.slate600 }}>{p.appointmentsThisMonth}</td>
                        <td className="px-5 py-3 text-right hidden lg:table-cell" style={{ color: colors.slate600 }}>${avgRev}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => setExpandedProvider(isExpanded ? null : p.providerId)}
                            className="p-1.5 rounded-lg hover:opacity-80"
                            style={{ backgroundColor: colors.slate50 }}
                            aria-label={isExpanded ? `Collapse details for ${p.name}` : `Expand details for ${p.name}`}
                          >
                            {isExpanded ? <ChevronUp size={14} style={{ color: colors.slate500 }} /> : <ChevronDown size={14} style={{ color: colors.slate500 }} />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${p.providerId}-detail`}>
                          <td colSpan={6} className="px-5 py-4 border-t" style={{ backgroundColor: colors.slate50, borderColor: colors.slate100 }}>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                              <div className="rounded-lg p-3" style={{ backgroundColor: colors.white }}>
                                <div className="text-xs" style={{ color: colors.slate500 }}>MRR</div>
                                <div className="text-lg font-bold animate-count-pop" style={{ color: colors.green600 }}>${p.mrr.toLocaleString()}</div>
                              </div>
                              <div className="rounded-lg p-3" style={{ backgroundColor: colors.white }}>
                                <div className="text-xs" style={{ color: colors.slate500 }}>Active Members</div>
                                <div className="text-lg font-bold animate-count-pop" style={{ color: colors.teal500 }}>{p.activeSubscriptions}</div>
                              </div>
                              <div className="rounded-lg p-3" style={{ backgroundColor: colors.white }}>
                                <div className="text-xs" style={{ color: colors.slate500 }}>Appointments</div>
                                <div className="text-lg font-bold animate-count-pop" style={{ color: colors.blue500 }}>{p.appointmentsThisMonth}</div>
                              </div>
                              <div className="rounded-lg p-3" style={{ backgroundColor: colors.white }}>
                                <div className="text-xs" style={{ color: colors.slate500 }}>Avg Rev/Patient</div>
                                <div className="text-lg font-bold animate-count-pop" style={{ color: colors.navy900 }}>${avgRev}</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            {providers.length === 0 && (
              <EmptyIllustration
                icon={Users}
                title="No provider data available"
                description="Provider information will appear here once providers are added to the practice."
              />
            )}
          </div>
        </div>
      )}

      {/* ─── Performance ──────────────────────────────────────────────────── */}
      {subTab === "performance" && !loading && (
        <div className="space-y-6 animate-fade-in-up" role="tabpanel" id="panel-performance" aria-label="Performance tab content">
          <SectionHeader title="Practice Performance Metrics" />

          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Completion Rate Card */}
            <div className="rounded-xl shadow-sm border p-6" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.green50 }}>
                  <TrendingUp size={20} style={{ color: colors.green500 }} />
                </div>
                <div>
                  <div className="text-xs" style={{ color: colors.slate500 }}>Completion Rate</div>
                  <div className="text-2xl font-bold animate-count-pop" style={{ color: colors.green600 }}>{pm.completionRatePercent.toFixed(1)}%</div>
                </div>
              </div>
              <ProgressBar value={pm.completionRatePercent} max={100} color={colors.green500} height="h-3" />
              <div className="mt-2 text-xs" style={{ color: colors.slate500 }}>
                {pm.appointmentsCompleted} of {pm.appointmentsCompleted + pm.noShows + pm.cancellations} appointments completed
              </div>
            </div>

            {/* No-Show Rate Card */}
            <div className="rounded-xl shadow-sm border p-6" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: pm.noShowRatePercent > 10 ? colors.red50 : colors.amber50 }}>
                  <AlertTriangle size={20} style={{ color: pm.noShowRatePercent > 10 ? colors.red500 : colors.amber500 }} />
                </div>
                <div>
                  <div className="text-xs" style={{ color: colors.slate500 }}>No-Show Rate</div>
                  <div className="text-2xl font-bold animate-count-pop" style={{ color: pm.noShowRatePercent > 10 ? colors.red600 : colors.amber600 }}>{pm.noShowRatePercent.toFixed(1)}%</div>
                </div>
              </div>
              <ProgressBar
                value={pm.noShowRatePercent * 5}
                max={100}
                color={pm.noShowRatePercent > 10 ? colors.red500 : colors.amber500}
                height="h-3"
              />
              <div className="mt-2 text-xs" style={{ color: colors.slate500 }}>
                {pm.noShows} no-shows this month {pm.noShowRatePercent <= 5 ? "(within target)" : "(above 5% target)"}
              </div>
            </div>

            {/* Total Unique Patients Card */}
            <div className="rounded-xl shadow-sm border p-6" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.blue50 }}>
                  <Users size={20} style={{ color: colors.blue500 }} />
                </div>
                <div>
                  <div className="text-xs" style={{ color: colors.slate500 }}>Total Unique Patients</div>
                  <div className="text-2xl font-bold animate-count-pop" style={{ color: colors.navy900 }}>{pm.totalUniquePatients}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="text-center p-2 rounded" style={{ backgroundColor: colors.slate50 }}>
                  <div className="text-sm font-bold" style={{ color: colors.navy900 }}>{pm.appointmentsCompleted}</div>
                  <div className="text-xs" style={{ color: colors.slate500 }}>Completed</div>
                </div>
                <div className="text-center p-2 rounded" style={{ backgroundColor: colors.slate50 }}>
                  <div className="text-sm font-bold" style={{ color: colors.amber600 }}>{pm.cancellations}</div>
                  <div className="text-xs" style={{ color: colors.slate500 }}>Cancelled</div>
                </div>
              </div>
            </div>
          </div>

          {/* Appointment Outcome Pie Chart */}
          <div className="rounded-xl shadow-sm border p-6 animate-fade-in-up" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
            <SectionHeader title="Appointment Outcomes" />
            <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
              <div style={{ width: 220, height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={completionPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {completionPieData.map((_, index) => (
                        <Cell key={`pie-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [`${value}`, `${name}`]}
                      contentStyle={{
                        backgroundColor: colors.white,
                        border: `1px solid ${colors.slate200}`,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-3">
                {completionPieData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                    <span className="text-sm" style={{ color: colors.slate600 }}>{entry.name}</span>
                    <span className="text-sm font-bold" style={{ color: colors.navy900 }}>{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Revenue Distribution by Provider */}
          <div className="rounded-xl shadow-sm border p-6 animate-fade-in-up" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
            <SectionHeader title="Revenue Distribution by Provider" />
            <div className="space-y-4 mt-4">
              {providers.map(p => {
                const pct = totalMRR > 0 ? (p.mrr / totalMRR) * 100 : 0;
                return (
                  <div key={p.providerId}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium" style={{ color: colors.navy900 }}>{p.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: colors.slate500 }}>{pct.toFixed(1)}%</span>
                        <span className="text-sm font-bold" style={{ color: colors.green600 }}>${p.mrr.toLocaleString()}</span>
                      </div>
                    </div>
                    <ProgressBar value={pct} max={100} color={colors.teal500} height="h-3" />
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: colors.slate200 }}>
              <span className="text-sm font-semibold" style={{ color: colors.navy900 }}>Total MRR</span>
              <span className="text-lg font-bold animate-count-pop" style={{ color: colors.green600 }}>${totalMRR.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
