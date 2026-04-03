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
import { providerAnalyticsService } from "../../lib/api";
import type {
  ProviderSummaryItem,
  PracticePerformanceMetrics,
} from "../../types";

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal50: "#e6fffa",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  slate700: "#334155",
  white: "#ffffff",
  red50: "#fef2f2",
  red500: "#ef4444",
  red600: "#dc2626",
  green50: "#ecfdf5",
  green500: "#22c55e",
  green600: "#16a34a",
  amber50: "#fffbeb",
  amber500: "#f59e0b",
  amber600: "#d97706",
  blue50: "#eff6ff",
  blue500: "#3b82f6",
  purple50: "#faf5ff",
  purple500: "#a855f7",
};

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

  const tabs: { id: SubTab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "providers", label: "Provider Breakdown", icon: Users },
    { id: "performance", label: "Performance", icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: C.slate100 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{ backgroundColor: subTab === t.id ? C.white : "transparent", color: subTab === t.id ? C.navy900 : C.slate500, boxShadow: subTab === t.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-sm" style={{ color: C.slate500 }}>Loading analytics data...</div>}

      {/* ─── Overview ─────────────────────────────────────────────────────── */}
      {subTab === "overview" && !loading && (
        <div className="space-y-6">
          {/* Top Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Monthly Recurring Revenue", value: `$${totalMRR.toLocaleString()}`, icon: DollarSign, color: C.green500, bg: C.green50 },
              { label: "Active Subscriptions", value: totalSubs, icon: Heart, color: C.teal500, bg: C.teal50 },
              { label: "Appointments This Month", value: totalAppts, icon: Calendar, color: C.blue500, bg: C.blue50 },
              { label: "Active Providers", value: providers.length, icon: Users, color: C.purple500, bg: C.purple50 },
            ].map((stat, i) => (
              <div key={i} className="rounded-xl p-5 shadow-sm border" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium uppercase tracking-wide" style={{ color: C.slate500 }}>{stat.label}</span>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: stat.bg }}>
                    <stat.icon size={18} style={{ color: stat.color }} />
                  </div>
                </div>
                <div className="text-2xl font-bold" style={{ color: C.navy900 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Practice Performance Summary */}
          <div className="rounded-xl shadow-sm border p-6" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: C.navy900 }}>Practice Performance (This Month)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: "Unique Patients", value: pm.totalUniquePatients, color: C.blue500 },
                { label: "Completed", value: pm.appointmentsCompleted, color: C.green500 },
                { label: "No-Shows", value: pm.noShows, color: C.red500 },
                { label: "Cancellations", value: pm.cancellations, color: C.amber500 },
                { label: "Completion Rate", value: `${pm.completionRatePercent.toFixed(1)}%`, color: C.green600 },
                { label: "No-Show Rate", value: `${pm.noShowRatePercent.toFixed(1)}%`, color: pm.noShowRatePercent > 10 ? C.red500 : C.amber500 },
              ].map((item, i) => (
                <div key={i} className="text-center p-3 rounded-lg" style={{ backgroundColor: C.slate50 }}>
                  <div className="text-xl font-bold" style={{ color: item.color }}>{item.value}</div>
                  <div className="text-xs mt-1" style={{ color: C.slate500 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Provider Leaderboard */}
          <div className="rounded-xl shadow-sm border p-6" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: C.navy900 }}>Provider MRR Leaderboard</h3>
            <div className="space-y-3">
              {providers.map((p, i) => {
                const maxMRR = Math.max(...providers.map(x => x.mrr), 1);
                const pct = (p.mrr / maxMRR) * 100;
                return (
                  <div key={p.providerId} className="flex items-center gap-4">
                    <span className="text-sm font-bold w-6 text-center" style={{ color: i === 0 ? C.teal500 : C.slate400 }}>#{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium" style={{ color: C.navy900 }}>{p.name}</span>
                        <span className="text-sm font-bold" style={{ color: C.green600 }}>${p.mrr.toLocaleString()}</span>
                      </div>
                      <div className="h-2 rounded-full" style={{ backgroundColor: C.slate100 }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: i === 0 ? C.teal500 : i === 1 ? C.blue500 : C.slate400 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Provider Breakdown ───────────────────────────────────────────── */}
      {subTab === "providers" && !loading && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold" style={{ color: C.navy900 }}>Provider Breakdown</h3>

          <div className="rounded-xl shadow-sm border overflow-hidden" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: C.slate50 }}>
                  <th className="text-left px-5 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: C.slate500 }}>Provider</th>
                  <th className="text-right px-5 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: C.slate500 }}>MRR</th>
                  <th className="text-right px-5 py-3 font-medium text-xs uppercase tracking-wide hidden md:table-cell" style={{ color: C.slate500 }}>Active Subs</th>
                  <th className="text-right px-5 py-3 font-medium text-xs uppercase tracking-wide hidden md:table-cell" style={{ color: C.slate500 }}>Appts/Mo</th>
                  <th className="text-right px-5 py-3 font-medium text-xs uppercase tracking-wide hidden lg:table-cell" style={{ color: C.slate500 }}>Avg Rev/Patient</th>
                  <th className="text-right px-5 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: C.slate500 }}></th>
                </tr>
              </thead>
              <tbody>
                {providers.map(p => {
                  const avgRev = p.activeSubscriptions > 0 ? (p.mrr / p.activeSubscriptions).toFixed(0) : "0";
                  const isExpanded = expandedProvider === p.providerId;
                  return (
                    <>
                      <tr key={p.providerId} className="border-t" style={{ borderColor: C.slate100 }}>
                        <td className="px-5 py-3 font-medium" style={{ color: C.navy900 }}>{p.name}</td>
                        <td className="px-5 py-3 text-right font-bold" style={{ color: C.green600 }}>${p.mrr.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right hidden md:table-cell" style={{ color: C.slate600 }}>{p.activeSubscriptions}</td>
                        <td className="px-5 py-3 text-right hidden md:table-cell" style={{ color: C.slate600 }}>{p.appointmentsThisMonth}</td>
                        <td className="px-5 py-3 text-right hidden lg:table-cell" style={{ color: C.slate600 }}>${avgRev}</td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => setExpandedProvider(isExpanded ? null : p.providerId)} className="p-1.5 rounded-lg hover:opacity-80" style={{ backgroundColor: C.slate50 }}>
                            {isExpanded ? <ChevronUp size={14} style={{ color: C.slate500 }} /> : <ChevronDown size={14} style={{ color: C.slate500 }} />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${p.providerId}-detail`}>
                          <td colSpan={6} className="px-5 py-4 border-t" style={{ backgroundColor: C.slate50, borderColor: C.slate100 }}>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                              <div className="rounded-lg p-3" style={{ backgroundColor: C.white }}>
                                <div className="text-xs" style={{ color: C.slate500 }}>MRR</div>
                                <div className="text-lg font-bold" style={{ color: C.green600 }}>${p.mrr.toLocaleString()}</div>
                              </div>
                              <div className="rounded-lg p-3" style={{ backgroundColor: C.white }}>
                                <div className="text-xs" style={{ color: C.slate500 }}>Active Members</div>
                                <div className="text-lg font-bold" style={{ color: C.teal500 }}>{p.activeSubscriptions}</div>
                              </div>
                              <div className="rounded-lg p-3" style={{ backgroundColor: C.white }}>
                                <div className="text-xs" style={{ color: C.slate500 }}>Appointments</div>
                                <div className="text-lg font-bold" style={{ color: C.blue500 }}>{p.appointmentsThisMonth}</div>
                              </div>
                              <div className="rounded-lg p-3" style={{ backgroundColor: C.white }}>
                                <div className="text-xs" style={{ color: C.slate500 }}>Avg Rev/Patient</div>
                                <div className="text-lg font-bold" style={{ color: C.navy900 }}>${avgRev}</div>
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
              <div className="text-center py-12 text-sm" style={{ color: C.slate400 }}>No provider data available.</div>
            )}
          </div>
        </div>
      )}

      {/* ─── Performance ──────────────────────────────────────────────────── */}
      {subTab === "performance" && !loading && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold" style={{ color: C.navy900 }}>Practice Performance Metrics</h3>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl shadow-sm border p-6" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.green50 }}>
                  <TrendingUp size={20} style={{ color: C.green500 }} />
                </div>
                <div>
                  <div className="text-xs" style={{ color: C.slate500 }}>Completion Rate</div>
                  <div className="text-2xl font-bold" style={{ color: C.green600 }}>{pm.completionRatePercent.toFixed(1)}%</div>
                </div>
              </div>
              <div className="h-3 rounded-full" style={{ backgroundColor: C.slate100 }}>
                <div className="h-full rounded-full" style={{ width: `${pm.completionRatePercent}%`, backgroundColor: C.green500 }} />
              </div>
              <div className="mt-2 text-xs" style={{ color: C.slate500 }}>
                {pm.appointmentsCompleted} of {pm.appointmentsCompleted + pm.noShows + pm.cancellations} appointments completed
              </div>
            </div>

            <div className="rounded-xl shadow-sm border p-6" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: pm.noShowRatePercent > 10 ? C.red50 : C.amber50 }}>
                  <AlertTriangle size={20} style={{ color: pm.noShowRatePercent > 10 ? C.red500 : C.amber500 }} />
                </div>
                <div>
                  <div className="text-xs" style={{ color: C.slate500 }}>No-Show Rate</div>
                  <div className="text-2xl font-bold" style={{ color: pm.noShowRatePercent > 10 ? C.red600 : C.amber600 }}>{pm.noShowRatePercent.toFixed(1)}%</div>
                </div>
              </div>
              <div className="h-3 rounded-full" style={{ backgroundColor: C.slate100 }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(pm.noShowRatePercent * 5, 100)}%`, backgroundColor: pm.noShowRatePercent > 10 ? C.red500 : C.amber500 }} />
              </div>
              <div className="mt-2 text-xs" style={{ color: C.slate500 }}>
                {pm.noShows} no-shows this month {pm.noShowRatePercent <= 5 ? "(within target)" : "(above 5% target)"}
              </div>
            </div>

            <div className="rounded-xl shadow-sm border p-6" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.blue50 }}>
                  <Users size={20} style={{ color: C.blue500 }} />
                </div>
                <div>
                  <div className="text-xs" style={{ color: C.slate500 }}>Total Unique Patients</div>
                  <div className="text-2xl font-bold" style={{ color: C.navy900 }}>{pm.totalUniquePatients}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="text-center p-2 rounded" style={{ backgroundColor: C.slate50 }}>
                  <div className="text-sm font-bold" style={{ color: C.navy900 }}>{pm.appointmentsCompleted}</div>
                  <div className="text-xs" style={{ color: C.slate500 }}>Completed</div>
                </div>
                <div className="text-center p-2 rounded" style={{ backgroundColor: C.slate50 }}>
                  <div className="text-sm font-bold" style={{ color: C.amber600 }}>{pm.cancellations}</div>
                  <div className="text-xs" style={{ color: C.slate500 }}>Cancelled</div>
                </div>
              </div>
            </div>
          </div>

          {/* Revenue per Provider */}
          <div className="rounded-xl shadow-sm border p-6" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: C.navy900 }}>Revenue Distribution by Provider</h3>
            <div className="space-y-4">
              {providers.map(p => {
                const pct = totalMRR > 0 ? (p.mrr / totalMRR) * 100 : 0;
                return (
                  <div key={p.providerId}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium" style={{ color: C.navy900 }}>{p.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: C.slate500 }}>{pct.toFixed(1)}%</span>
                        <span className="text-sm font-bold" style={{ color: C.green600 }}>${p.mrr.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="h-3 rounded-full" style={{ backgroundColor: C.slate100 }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: C.teal500 }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: C.slate200 }}>
              <span className="text-sm font-semibold" style={{ color: C.navy900 }}>Total MRR</span>
              <span className="text-lg font-bold" style={{ color: C.green600 }}>${totalMRR.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
