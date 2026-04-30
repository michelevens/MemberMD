// ===== AuditDashboard =====
// HIPAA compliance dashboard backed by real backend data:
//   GET /api/audit/compliance-dashboard  → stats + MFA + consent rate
//   GET /api/audit/phi-access            → PHI access log (paginated)
//   GET /api/audit/security-events       → security events (paginated)
//   GET /api/audit/hipaa-checklist       → checklist with practice-config status
//   GET /api/audit/export?type=...       → CSV download
//
// Replaces the mock-data version. Practice admins + superadmins only.

import { useEffect, useState } from "react";
import {
  Shield,
  Eye,
  Users,
  FileCheck,
  Lock,
  AlertTriangle,
  Download,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  XCircle,
  Activity,
  Loader2,
} from "lucide-react";

import { colors as C } from "../ui/design-system";
import { apiFetch } from "../../lib/api";

// ─── Backend response shapes ─────────────────────────────────────────────────

interface ComplianceStats {
  phiAccess: {
    last24h: number;
    last7d: number;
    last30d: number;
  };
  consentRate: number;
  mfaRate: number;
  totalUsers: number;
  mfaUsers: number;
  failedLogins24h: number;
}

interface ChecklistEntry {
  category: string;
  item: string;
  status: "compliant" | "action_needed" | "review" | "optional";
  recommendation: string;
}

interface PhiEntry {
  id: string;
  userId: string | null;
  patientId: string | null;
  resourceType: string;
  resourceId: string | null;
  accessType: string;
  ipAddress: string | null;
  createdAt: string;
}

interface SecurityEntry {
  id: string;
  userId: string | null;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// Laravel pagination wrapper. The list endpoints return:
//   { data: { current_page, data: [...], total, ... } }
// apiFetch unwraps the outer .data, so we get the inner pagination obj.
interface Paginated<T> {
  data?: T[];
  currentPage?: number;
  total?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function shortenId(id: string | null): string {
  if (!id) return "—";
  return id.slice(0, 8);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AuditDashboard() {
  const [stats, setStats] = useState<ComplianceStats | null>(null);
  const [checklist, setChecklist] = useState<ChecklistEntry[]>([]);
  const [phiLog, setPhiLog] = useState<PhiEntry[]>([]);
  const [securityLog, setSecurityLog] = useState<SecurityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"audit" | "phi" | "security" | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Single load on mount — practice admin lands here, sees real data.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, checklistRes, phiRes, secRes] = await Promise.all([
          apiFetch<ComplianceStats>("/audit/compliance-dashboard"),
          apiFetch<ChecklistEntry[]>("/audit/hipaa-checklist"),
          apiFetch<Paginated<PhiEntry>>("/audit/phi-access?per_page=20"),
          apiFetch<Paginated<SecurityEntry>>("/audit/security-events?per_page=20"),
        ]);
        if (cancelled) return;
        if (statsRes.error) throw new Error(statsRes.error);
        if (statsRes.data) setStats(statsRes.data);
        if (checklistRes.data) setChecklist(checklistRes.data);
        // PHI + security endpoints return Laravel paginated payloads.
        // apiFetch unwraps the outer envelope; the inner `.data` is the
        // page array. Defend against shape drift.
        const phiInner = phiRes.data?.data;
        if (Array.isArray(phiInner)) setPhiLog(phiInner);
        const secInner = secRes.data?.data;
        if (Array.isArray(secInner)) setSecurityLog(secInner);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load audit data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Group checklist by category for the collapsible UI.
  const categories = Array.from(new Set(checklist.map((c) => c.category)));
  const compliantCount = checklist.filter((c) => c.status === "compliant").length;
  const actionNeededCount = checklist.filter((c) => c.status === "action_needed").length;
  const reviewCount = checklist.filter((c) => c.status === "review" || c.status === "optional").length;

  // ─── Export handler — streams CSV from backend, browser downloads ──────────

  async function handleExport(type: "audit" | "phi" | "security") {
    setExporting(type);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
      const token = localStorage.getItem("token");
      const url = `${apiBase}/audit/export?type=${type}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${type}_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  // ─── Status badge for checklist items ──────────────────────────────────────

  function StatusBadge({ status }: { status: ChecklistEntry["status"] }) {
    const config: Record<ChecklistEntry["status"], { bg: string; color: string; icon: typeof CheckCircle; label: string }> = {
      compliant: { bg: C.green50, color: C.green600, icon: CheckCircle, label: "Compliant" },
      review: { bg: C.amber50, color: C.amber600, icon: AlertCircle, label: "Review" },
      action_needed: { bg: C.red50, color: C.red600, icon: XCircle, label: "Action Needed" },
      optional: { bg: C.slate100, color: C.slate600, icon: AlertCircle, label: "Optional" },
    };
    const c = config[status];
    const Icon = c.icon;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
        style={{ backgroundColor: c.bg, color: c.color }}
      >
        <Icon className="w-3 h-3" /> {c.label}
      </span>
    );
  }

  function EventBadge({ type }: { type: string }) {
    const config: Record<string, { bg: string; color: string }> = {
      login_success: { bg: C.green50, color: C.green600 },
      login_failed: { bg: C.red50, color: C.red600 },
      login_throttled: { bg: C.red50, color: C.red600 },
      password_change: { bg: C.blue50, color: C.blue500 },
      password_changed: { bg: C.blue50, color: C.blue500 },
      password_reset_requested: { bg: C.amber50, color: C.amber600 },
      password_reset_success: { bg: C.green50, color: C.green600 },
      session_timeout: { bg: C.amber50, color: C.amber600 },
      mfa_enabled: { bg: C.teal50, color: C.teal600 },
      mfa_challenge_issued: { bg: C.teal50, color: C.teal600 },
      logout: { bg: C.slate100, color: C.slate600 },
    };
    const c = config[type] || { bg: C.slate100, color: C.slate600 };
    return (
      <span
        className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: c.bg, color: c.color }}
      >
        {type.replace(/_/g, " ")}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.teal500 }} />
        <span className="ml-3 text-sm" style={{ color: C.slate500 }}>Loading audit data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl p-6" style={{ backgroundColor: C.red50, border: `1px solid ${C.red500}` }}>
        <div className="flex items-start gap-3">
          <XCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: C.red500 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: C.red600 }}>Could not load audit dashboard</p>
            <p className="text-xs mt-1" style={{ color: C.slate600 }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.teal50 }}>
              <Eye className="w-4 h-4" style={{ color: C.teal500 }} />
            </div>
            <span className="text-xs font-medium" style={{ color: C.slate400 }}>PHI Accesses (24h)</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: C.navy800 }}>{stats?.phiAccess.last24h ?? 0}</p>
          <p className="text-xs mt-1" style={{ color: C.slate400 }}>{stats?.phiAccess.last7d ?? 0} in 7 days</p>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.blue50 }}>
              <Users className="w-4 h-4" style={{ color: C.blue500 }} />
            </div>
            <span className="text-xs font-medium" style={{ color: C.slate400 }}>Failed Logins (24h)</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: C.navy800 }}>{stats?.failedLogins24h ?? 0}</p>
          <p className="text-xs mt-1" style={{ color: C.slate400 }}>across {stats?.totalUsers ?? 0} active users</p>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.green50 }}>
              <FileCheck className="w-4 h-4" style={{ color: C.green500 }} />
            </div>
            <span className="text-xs font-medium" style={{ color: C.slate400 }}>Telehealth Consent</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: C.navy800 }}>{stats?.consentRate ?? 0}%</p>
          <div className="w-full h-2 rounded-full mt-2" style={{ backgroundColor: C.slate100 }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${stats?.consentRate ?? 0}%`, backgroundColor: C.green500 }}
            />
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.amber50 }}>
              <Lock className="w-4 h-4" style={{ color: C.amber500 }} />
            </div>
            <span className="text-xs font-medium" style={{ color: C.slate400 }}>MFA Adoption</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: C.navy800 }}>{stats?.mfaRate ?? 0}%</p>
          <p className="text-xs mt-1" style={{ color: C.slate400 }}>{stats?.mfaUsers ?? 0} of {stats?.totalUsers ?? 0} users</p>
        </div>
      </div>

      {/* Anomaly Alert — high failed login count */}
      {stats && stats.failedLogins24h >= 10 && (
        <div
          className="flex items-start gap-3 p-3 rounded-xl"
          style={{ backgroundColor: C.red50, border: `1px solid ${C.red500}` }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.red500 }} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: C.red600 }}>HIGH</span>
              <span className="text-xs font-medium" style={{ color: C.slate600 }}>Unusual login activity</span>
            </div>
            <p className="text-sm mt-0.5" style={{ color: C.slate700 }}>
              {stats.failedLogins24h} failed login attempts in the last 24 hours. Review the security log below.
            </p>
          </div>
        </div>
      )}

      {/* HIPAA Checklist */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${C.slate200}` }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: C.navy800 }}>
            <Shield className="w-4 h-4" style={{ color: C.teal500 }} />
            HIPAA Compliance Checklist
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <span style={{ color: C.green600 }}>{compliantCount} Compliant</span>
            <span style={{ color: C.amber600 }}>{reviewCount} Review</span>
            <span style={{ color: C.red600 }}>{actionNeededCount} Action Needed</span>
          </div>
        </div>

        {categories.map((cat) => {
          const items = checklist.filter((c) => c.category === cat);
          const isExpanded = expandedCategory === cat;
          return (
            <div key={cat}>
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50"
                style={{ borderBottom: `1px solid ${C.slate100}` }}
              >
                <span className="text-sm font-medium" style={{ color: C.navy700 }}>
                  {cat}
                  <span className="ml-2 text-xs font-normal" style={{ color: C.slate400 }}>
                    ({items.length} {items.length === 1 ? "item" : "items"})
                  </span>
                </span>
                <ChevronDown
                  className="w-4 h-4 transition-transform"
                  style={{ color: C.slate400, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              {isExpanded && (
                <div className="divide-y" style={{ borderColor: C.slate100 }}>
                  {items.map((item, i) => (
                    <div key={`${cat}-${i}`} className="px-6 py-3 flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color: C.navy800 }}>{item.item}</p>
                        <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>{item.recommendation}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* PHI Access Log */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${C.slate200}` }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: C.navy800 }}>
            <Eye className="w-4 h-4" style={{ color: C.teal500 }} />
            Recent PHI Access (last 20)
          </h3>
          <button
            onClick={() => handleExport("phi")}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50"
            style={{ color: C.slate600 }}
          >
            {exporting === "phi" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Export CSV
          </button>
        </div>
        {phiLog.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: C.slate400 }}>
            No PHI access events recorded yet. Logs appear here as users view patient records.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: C.slate50 }}>
                  <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>Timestamp</th>
                  <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>User</th>
                  <th className="text-left px-4 py-2 font-medium text-xs hidden sm:table-cell" style={{ color: C.slate500 }}>Patient</th>
                  <th className="text-left px-4 py-2 font-medium text-xs hidden md:table-cell" style={{ color: C.slate500 }}>Resource</th>
                  <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>Type</th>
                  <th className="text-left px-4 py-2 font-medium text-xs hidden lg:table-cell" style={{ color: C.slate500 }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {phiLog.map((entry) => (
                  <tr key={entry.id} className="border-t hover:bg-slate-50 transition-colors" style={{ borderColor: C.slate100 }}>
                    <td className="px-4 py-2.5 text-xs font-mono" style={{ color: C.slate500 }}>{formatTimestamp(entry.createdAt)}</td>
                    <td className="px-4 py-2.5 text-xs font-mono" style={{ color: C.navy800 }} title={entry.userId ?? ""}>{shortenId(entry.userId)}</td>
                    <td className="px-4 py-2.5 text-xs font-mono hidden sm:table-cell" style={{ color: C.slate600 }} title={entry.patientId ?? ""}>{shortenId(entry.patientId)}</td>
                    <td className="px-4 py-2.5 text-xs hidden md:table-cell" style={{ color: C.slate600 }}>{entry.resourceType || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: entry.accessType === "export" || entry.accessType === "print" ? C.amber50 : C.slate100,
                          color: entry.accessType === "export" || entry.accessType === "print" ? C.amber600 : C.slate600,
                        }}
                      >
                        {entry.accessType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono hidden lg:table-cell" style={{ color: C.slate400 }}>{entry.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security Events */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${C.slate200}` }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: C.navy800 }}>
            <Activity className="w-4 h-4" style={{ color: C.teal500 }} />
            Recent Security Events (last 20)
          </h3>
          <button
            onClick={() => handleExport("security")}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50"
            style={{ color: C.slate600 }}
          >
            {exporting === "security" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Export CSV
          </button>
        </div>
        {securityLog.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: C.slate400 }}>
            No security events recorded yet. Login attempts, MFA changes, and password resets appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: C.slate50 }}>
                  <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>Timestamp</th>
                  <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>Event</th>
                  <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>User</th>
                  <th className="text-left px-4 py-2 font-medium text-xs hidden sm:table-cell" style={{ color: C.slate500 }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {securityLog.map((event) => (
                  <tr key={event.id} className="border-t hover:bg-slate-50 transition-colors" style={{ borderColor: C.slate100 }}>
                    <td className="px-4 py-2.5 text-xs font-mono" style={{ color: C.slate500 }}>{formatTimestamp(event.createdAt)}</td>
                    <td className="px-4 py-2.5"><EventBadge type={event.eventType} /></td>
                    <td className="px-4 py-2.5 text-xs font-mono" style={{ color: C.navy800 }} title={event.userId ?? ""}>{shortenId(event.userId)}</td>
                    <td className="px-4 py-2.5 text-xs font-mono hidden sm:table-cell" style={{ color: C.slate400 }}>{event.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export full audit log */}
      <div className="flex justify-end">
        <button
          onClick={() => handleExport("audit")}
          disabled={exporting !== null}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: C.navy700 }}
        >
          {exporting === "audit" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export Audit Log (CSV)
        </button>
      </div>
    </div>
  );
}
