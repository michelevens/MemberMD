// ===== Care Coordination Tab =====
// Care gaps, population health registries, and overdue patient tracking

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/api";
import {
  AlertTriangle,
  RefreshCw,
  Users,
  ShieldAlert,
  ArrowUp,
  ArrowDown,
  Minus,
  Heart,
  Brain,
  Activity,
  Clock,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CareCoordinationDashboard {
  totalOpenGaps: number;
  criticalGaps: number;
  highPriority: number;
  patientsAffected: number;
  gapsByType: { type: string; count: number }[];
  gapsBySeverity: { severity: string; count: number }[];
  topPatients: TopPatientGaps[];
}

interface TopPatientGaps {
  id: string;
  patientName: string;
  gapCount: number;
  mostSevereGap: string;
  mostSevereSeverity: string;
}

interface PopulationHealth {
  diabetesRegistry: RegistryPatient[];
  hypertensionRegistry: RegistryPatient[];
  depressionRegistry: RegistryPatient[];
}

interface RegistryPatient {
  id: string;
  patientName: string;
  latestValue: string;
  latestDate: string;
  trend: "up" | "down" | "stable";
  unit: string;
}

interface OverdueData {
  over90Days: OverduePatient[];
  over180Days: OverduePatient[];
  over365Days: OverduePatient[];
}

interface OverduePatient {
  id: string;
  patientName: string;
  lastVisitDate: string | null;
  daysSinceVisit: number;
  phone: string | null;
}

type SubTab = "gaps" | "population" | "overdue";

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, React.CSSProperties> = {
  critical: { backgroundColor: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" },
  high: { backgroundColor: "#fff7ed", color: "#ea580c", border: "1px solid #fed7aa" },
  medium: { backgroundColor: "#fefce8", color: "#ca8a04", border: "1px solid #fef08a" },
  low: { backgroundColor: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe" },
};

const SEVERITY_BAR_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

const GAP_TYPE_COLORS: Record<string, string> = {
  screening_overdue: "#8b5cf6",
  lab_overdue: "#3b82f6",
  vaccination_due: "#22c55e",
  follow_up_overdue: "#f97316",
  referral_pending: "#ec4899",
  medication_review: "#14b8a6",
};

function formatGapType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CareCoordinationTab() {
  const [dashboard, setDashboard] = useState<CareCoordinationDashboard | null>(null);
  const [populationHealth, setPopulationHealth] = useState<PopulationHealth | null>(null);
  const [overdueData, setOverdueData] = useState<OverdueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("gaps");
  const [popLoading, setPopLoading] = useState(false);
  const [overdueLoading, setOverdueLoading] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<CareCoordinationDashboard>("/care-coordination/dashboard");
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setDashboard(res.data);
    }
    setLoading(false);
  }, []);

  const fetchPopulationHealth = useCallback(async () => {
    if (populationHealth) return;
    setPopLoading(true);
    const res = await apiFetch<PopulationHealth>("/care-coordination/population-health");
    if (res.data) {
      setPopulationHealth(res.data);
    }
    setPopLoading(false);
  }, [populationHealth]);

  const fetchOverdue = useCallback(async () => {
    if (overdueData) return;
    setOverdueLoading(true);
    const res = await apiFetch<OverdueData>("/care-coordination/overdue");
    if (res.data) {
      setOverdueData(res.data);
    }
    setOverdueLoading(false);
  }, [overdueData]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (subTab === "population") fetchPopulationHealth();
    if (subTab === "overdue") fetchOverdue();
  }, [subTab, fetchPopulationHealth, fetchOverdue]);

  // ─── Loading / Error ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mr-3" />
        <span className="text-gray-500">Loading care coordination data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-red-600">
        <AlertTriangle className="w-8 h-8 mb-2" />
        <p className="font-medium">{error}</p>
        <button
          onClick={fetchDashboard}
          className="mt-4 px-4 py-2 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!dashboard) return null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Top Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Open Gaps", value: dashboard.totalOpenGaps, color: "#6366f1", bgColor: "#eef2ff", Icon: ShieldAlert },
          { label: "Critical Gaps", value: dashboard.criticalGaps, color: "#dc2626", bgColor: "#fef2f2", Icon: AlertTriangle },
          { label: "High Priority", value: dashboard.highPriority, color: "#ea580c", bgColor: "#fff7ed", Icon: Activity },
          { label: "Patients Affected", value: dashboard.patientsAffected, color: "#2563eb", bgColor: "#eff6ff", Icon: Users },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: stat.bgColor }}
              >
                <stat.Icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── Sub-tab Toggle ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(["gaps", "population", "overdue"] as SubTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className="px-4 py-2 text-sm font-medium rounded-md transition-colors"
            style={
              subTab === tab
                ? { backgroundColor: "#fff", color: "#111827", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
                : { backgroundColor: "transparent", color: "#6b7280" }
            }
          >
            {tab === "gaps" ? "Care Gaps" : tab === "population" ? "Population Health" : "Overdue Patients"}
          </button>
        ))}
      </div>

      {/* ── Care Gaps View ──────────────────────────────────────────────────── */}
      {subTab === "gaps" && (
        <>
          {/* Gaps by Type */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Care Gaps by Type</h3>
            <div className="space-y-3">
              {dashboard.gapsByType.map((gap) => {
                const maxCount = Math.max(...dashboard.gapsByType.map((g) => g.count), 1);
                const barColor = GAP_TYPE_COLORS[gap.type] || "#6b7280";
                return (
                  <div key={gap.type} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-40 flex-shrink-0">
                      {formatGapType(gap.type)}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center justify-end pr-2 transition-all"
                        style={{
                          width: `${Math.max((gap.count / maxCount) * 100, 8)}%`,
                          backgroundColor: barColor,
                        }}
                      >
                        <span className="text-xs font-medium text-white">{gap.count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gaps by Severity */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Gaps by Severity</h3>
            <div className="flex flex-wrap gap-3">
              {dashboard.gapsBySeverity.map((item) => (
                <div
                  key={item.severity}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg"
                  style={SEVERITY_STYLES[item.severity] || {}}
                >
                  <span className="text-lg font-bold">{item.count}</span>
                  <span className="text-sm font-medium capitalize">{item.severity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top 10 Patients */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Top 10 Patients with Most Gaps</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Patient</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Gap Count</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Most Severe Gap</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.topPatients.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-gray-400">
                        No patient gaps found.
                      </td>
                    </tr>
                  ) : (
                    dashboard.topPatients.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{p.patientName}</td>
                        <td className="px-6 py-3">
                          <span
                            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white"
                            style={{ backgroundColor: SEVERITY_BAR_COLORS[p.mostSevereSeverity] || "#6b7280" }}
                          >
                            {p.gapCount}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-gray-600">{formatGapType(p.mostSevereGap)}</td>
                        <td className="px-6 py-3">
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
                            style={SEVERITY_STYLES[p.mostSevereSeverity] || {}}
                          >
                            {p.mostSevereSeverity}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Population Health View ──────────────────────────────────────────── */}
      {subTab === "population" && (
        <>
          {popLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-5 h-5 animate-spin text-gray-400 mr-2" />
              <span className="text-gray-500">Loading population health data...</span>
            </div>
          ) : populationHealth ? (
            <>
              {/* Diabetes Registry */}
              <RegistrySection
                title="Diabetes Registry"
                subtitle="Latest A1C"
                Icon={Activity}
                iconColor="#ef4444"
                iconBg="#fef2f2"
                patients={populationHealth.diabetesRegistry}
              />

              {/* Hypertension Registry */}
              <RegistrySection
                title="Hypertension Registry"
                subtitle="Latest Blood Pressure"
                Icon={Heart}
                iconColor="#f97316"
                iconBg="#fff7ed"
                patients={populationHealth.hypertensionRegistry}
              />

              {/* Depression Registry */}
              <RegistrySection
                title="Depression Registry"
                subtitle="Latest PHQ-9"
                Icon={Brain}
                iconColor="#8b5cf6"
                iconBg="#f5f3ff"
                patients={populationHealth.depressionRegistry}
              />
            </>
          ) : (
            <p className="text-center text-gray-400 py-16">No population health data available.</p>
          )}
        </>
      )}

      {/* ── Overdue Patients View ───────────────────────────────────────────── */}
      {subTab === "overdue" && (
        <>
          {overdueLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-5 h-5 animate-spin text-gray-400 mr-2" />
              <span className="text-gray-500">Loading overdue data...</span>
            </div>
          ) : overdueData ? (
            <>
              <OverdueSection
                title="90+ Days Without Visit"
                patients={overdueData.over90Days}
                badgeColor="#eab308"
                badgeBg="#fefce8"
              />
              <OverdueSection
                title="180+ Days Without Visit"
                patients={overdueData.over180Days}
                badgeColor="#ea580c"
                badgeBg="#fff7ed"
              />
              <OverdueSection
                title="365+ Days Without Visit"
                patients={overdueData.over365Days}
                badgeColor="#dc2626"
                badgeBg="#fef2f2"
              />
            </>
          ) : (
            <p className="text-center text-gray-400 py-16">No overdue data available.</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function RegistrySection({
  title,
  subtitle,
  Icon,
  iconColor,
  iconBg,
  patients,
}: {
  title: string;
  subtitle: string;
  Icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  patients: RegistryPatient[];
}) {
  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === "up") return <ArrowUp className="w-4 h-4" style={{ color: "#ef4444" }} />;
    if (trend === "down") return <ArrowDown className="w-4 h-4" style={{ color: "#22c55e" }} />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: iconBg }}>
          <Icon className="w-4 h-4" style={{ color: iconColor }} />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Patient</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Latest Value</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Date</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Trend</th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                  No patients in this registry.
                </td>
              </tr>
            ) : (
              patients.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{p.patientName}</td>
                  <td className="px-6 py-3 text-gray-700 font-mono">
                    {p.latestValue} {p.unit}
                  </td>
                  <td className="px-6 py-3 text-gray-600 text-sm">
                    {new Date(p.latestDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3">
                    <TrendIcon trend={p.trend} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OverdueSection({
  title,
  patients,
  badgeColor,
  badgeBg,
}: {
  title: string;
  patients: OverduePatient[];
  badgeColor: string;
  badgeBg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-400" />
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: badgeBg, color: badgeColor }}
        >
          {patients.length} patients
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Patient</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Days Since Visit</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Last Visit</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Phone</th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                  No overdue patients in this category.
                </td>
              </tr>
            ) : (
              patients.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{p.patientName}</td>
                  <td className="px-6 py-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                      style={{ backgroundColor: badgeBg, color: badgeColor }}
                    >
                      {p.daysSinceVisit} days
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-600 text-sm">
                    {p.lastVisitDate ? new Date(p.lastVisitDate).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-6 py-3 text-gray-600 text-sm">{p.phone || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
