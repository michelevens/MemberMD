// ===== Employer Portal =====
//
// HR-side portal for sponsoring employers. Lives at /#/employer/* and
// is the default landing page for users with role=employer_admin.
//
// Four tabs:
//   Dashboard  — enrolled count vs cap, outstanding balance, recent invoices
//   Eligible   — manage the pre-enrollment allow-list (skip-Stripe employees)
//   Enrolled   — read-only roster of currently-enrolled employees
//   Invoices   — past PEPM invoices, status + payment terms
//
// Distinct from PracticePortal's EmployerManagementTab — that one is the
// PRACTICE viewing all their employer accounts. This one is the EMPLOYER
// (specifically their HR contact) viewing only their own data.
//
// Read-only on invoices — employer doesn't mark their own invoices paid;
// the practice does that after they receive payment.

import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard, UserCheck, Users, FileText, Loader2,
  AlertTriangle, CheckCircle2, Clock, Building2, DollarSign, Mail, Download,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { PortalShell, type NavItem } from "../shared/PortalShell";
import {
  employerPortalService,
  employerBillingService,
  type EmployerDashboard,
  type EmployerEmployeeRow,
  type EmployerInvoiceRow,
} from "../../lib/api";
import { EmployerEligibilityPanel } from "../practice/EmployerEligibilityPanel";

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal50: "#f0fdf9",
  teal100: "#d1fae5",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  amber800: "#92400e",
  red500: "#ef4444",
  red50: "#fef2f2",
  red800: "#7f1d1d",
  green500: "#22c55e",
  green50: "#dcfce7",
  green800: "#166534",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  white: "#ffffff",
};

const fmtMoney = (v: number | null | undefined) => {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(v);
};

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

type TabId = "dashboard" | "eligible" | "enrolled" | "invoices";

const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "eligible", label: "Eligible Employees", icon: UserCheck },
  { id: "enrolled", label: "Enrolled Employees", icon: Users },
  { id: "invoices", label: "Invoices", icon: FileText },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Toast = { message: string; type: "success" | "error" } | null;

export function EmployerPortal() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [dashboard, setDashboard] = useState<EmployerDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const res = await employerPortalService.dashboard();
      setDashboard(res.data ?? null);
    } catch {
      setToast({ message: "Could not load dashboard.", type: "error" });
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // Auto-dismiss toast.
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const employerId = user?.employerId ?? null;
  const employerName = dashboard?.employer_name ?? "";
  const userName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email
    : "Employer Admin";

  const renderContent = () => {
    if (!employerId) {
      return (
        <div className="rounded-xl border bg-white p-12 text-center" style={{ borderColor: C.slate200 }}>
          <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: C.amber500 }} />
          <p className="text-sm font-semibold" style={{ color: C.navy900 }}>
            Your account isn't linked to an employer.
          </p>
          <p className="text-xs mt-2" style={{ color: C.slate500 }}>
            Contact the practice that issued your portal access — they need to set your employer association.
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case "dashboard":
        return (
          <DashboardSection
            dashboard={dashboard}
            loading={dashboardLoading}
            onRefresh={loadDashboard}
          />
        );
      case "eligible":
        return (
          <EmployerEligibilityPanel
            employerId={employerId}
            employerName={employerName || "your employees"}
            setToast={setToast}
          />
        );
      case "enrolled":
        return <EnrolledSection setToast={setToast} />;
      case "invoices":
        return <InvoicesSection setToast={setToast} />;
      default:
        return null;
    }
  };

  return (
    <>
      <PortalShell
        portalTitle="Employer Portal"
        portalIcon={Building2}
        portalColor="teal"
        userName={userName}
        userSubtitle={employerName || "Employer Admin"}
        nav={NAV}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        onLogout={logout}
        headerTitle={NAV.find((n) => n.id === activeTab)?.label ?? "Employer"}
      >
        <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-4">
          {renderContent()}
        </div>
      </PortalShell>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium"
          style={{
            backgroundColor: toast.type === "success" ? C.green50 : C.red50,
            color: toast.type === "success" ? C.green800 : C.red800,
            border: `1px solid ${toast.type === "success" ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}

// Default export for the App.tsx lazy-import shape.
export default EmployerPortal;

// ─── Dashboard ───────────────────────────────────────────────────────────

function DashboardSection({
  dashboard, loading, onRefresh,
}: {
  dashboard: EmployerDashboard | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading || !dashboard) {
    return (
      <div className="rounded-xl border bg-white p-12 flex items-center justify-center" style={{ borderColor: C.slate200 }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  const capPct = dashboard.employee_count_cap
    ? Math.min(100, Math.round((dashboard.enrolled_count / dashboard.employee_count_cap) * 100))
    : null;
  const overdue = dashboard.outstanding_invoices_total > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: C.navy900 }}>
            {dashboard.employer_name}
          </h2>
          <p className="text-sm" style={{ color: C.slate500 }}>
            Sponsored membership account · Status at a glance
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white"
          style={{ borderColor: C.slate200, color: C.slate600 }}
        >
          Refresh
        </button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          icon={Users}
          label="Enrolled employees"
          value={String(dashboard.enrolled_count)}
          hint={
            dashboard.employee_count_cap
              ? `of ${dashboard.employee_count_cap} cap (${capPct}%)`
              : "no cap set"
          }
          color={C.teal600}
          bg={C.teal50}
        />
        <StatTile
          icon={CheckCircle2}
          label="Active contracts"
          value={String(dashboard.active_contracts)}
          hint={dashboard.active_contracts > 0 ? "PEPM billing in effect" : "no active contract"}
          color={C.navy900}
        />
        <StatTile
          icon={Clock}
          label="Outstanding invoices"
          value={String(dashboard.outstanding_invoices_count)}
          hint={dashboard.outstanding_invoices_count === 0 ? "all paid" : "pending payment"}
          color={overdue ? C.amber800 : C.slate600}
          bg={overdue ? C.amber50 : C.white}
        />
        <StatTile
          icon={DollarSign}
          label="Outstanding balance"
          value={fmtMoney(dashboard.outstanding_invoices_total)}
          hint={overdue ? "due to practice" : "—"}
          color={overdue ? C.red800 : C.slate600}
          bg={overdue ? C.red50 : C.white}
        />
      </div>

      {/* Plan-cap progress bar */}
      {dashboard.employee_count_cap && (
        <div className="rounded-xl border bg-white p-5" style={{ borderColor: C.slate200 }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold" style={{ color: C.navy900 }}>
              Employee headcount
            </span>
            <span className="text-xs" style={{ color: C.slate500 }}>
              {dashboard.enrolled_count} / {dashboard.employee_count_cap}
            </span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.slate100 }}>
            <div
              className="h-full transition-all"
              style={{
                width: `${capPct}%`,
                backgroundColor: capPct! >= 90 ? C.amber500 : C.teal500,
              }}
            />
          </div>
          {capPct! >= 90 && (
            <p className="text-xs mt-2" style={{ color: C.amber800 }}>
              Approaching headcount cap. Contact your practice to renegotiate the contract if you need more seats.
            </p>
          )}
        </div>
      )}

      {/* What you can do */}
      <div className="rounded-xl border p-4" style={{ borderColor: C.slate200, backgroundColor: C.teal50 }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color: C.teal600 }}>
          Next steps
        </h3>
        <ul className="text-xs space-y-1" style={{ color: C.slate600 }}>
          <li>· Pre-stage employee emails on the <strong>Eligible Employees</strong> tab so they can self-enroll without paying.</li>
          <li>· Watch the <strong>Enrolled Employees</strong> tab as employees sign up.</li>
          <li>· Review monthly <strong>Invoices</strong> from your practice — payment terms are 30 days by default.</li>
        </ul>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon, label, value, hint, color, bg,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  color?: string;
  bg?: string;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: C.slate200, backgroundColor: bg ?? C.white }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: color ?? C.slate400 }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: color ?? C.slate500 }}>
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold" style={{ color: color ?? C.navy900 }}>{value}</div>
      {hint && <div className="text-xs mt-1" style={{ color: C.slate400 }}>{hint}</div>}
    </div>
  );
}

// ─── Enrolled Employees ──────────────────────────────────────────────────

function EnrolledSection({ setToast }: { setToast: (t: Toast) => void }) {
  const [rows, setRows] = useState<EmployerEmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await employerPortalService.employees();
        if (cancelled) return;
        // Server returns Laravel paginator: { data: { data: [...], ... } }.
        // apiFetch unwraps the outer body.data so res.data here is the
        // paginator wrapper.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paginator = res.data as any;
        const list: EmployerEmployeeRow[] = Array.isArray(paginator)
          ? paginator
          : paginator?.data ?? [];
        setRows(list);
      } catch {
        setToast({ message: "Could not load employees.", type: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [setToast]);

  const filtered = search.trim()
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return (
          r.first_name.toLowerCase().includes(q)
          || r.last_name.toLowerCase().includes(q)
          || (r.email ?? "").toLowerCase().includes(q)
        );
      })
    : rows;

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-12 flex items-center justify-center" style={{ borderColor: C.slate200 }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold" style={{ color: C.navy900 }}>Enrolled employees</h2>
          <p className="text-xs" style={{ color: C.slate500 }}>
            {rows.length} {rows.length === 1 ? "employee" : "employees"} currently enrolled
          </p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="px-3 py-1.5 rounded-lg border text-sm w-full sm:w-64"
          style={{ borderColor: C.slate300 }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center" style={{ borderColor: C.slate200 }}>
          <Users className="w-8 h-8 mx-auto mb-2" style={{ color: C.slate300 }} />
          <p className="text-sm" style={{ color: C.slate500 }}>
            {rows.length === 0 ? "No employees enrolled yet." : "No matches."}
          </p>
          {rows.length === 0 && (
            <p className="text-xs mt-1" style={{ color: C.slate400 }}>
              Add eligible emails on the Eligible Employees tab so your team can self-enroll.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: C.slate200 }}>
          <ul className="divide-y" style={{ borderColor: C.slate100 }}>
            {filtered.map((r) => {
              const fullName = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "Employee";
              const planName = r.active_membership?.plan?.name ?? "—";
              const startedAt = r.active_membership?.started_at ?? null;
              return (
                <li key={r.id} className="px-4 py-3 flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
                  >
                    {fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: C.navy900 }}>{fullName}</span>
                      {r.active_membership ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                          style={{ backgroundColor: C.teal50, color: C.teal600 }}
                        >
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                          style={{ backgroundColor: C.slate100, color: C.slate500 }}
                        >
                          Pending
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
                      {r.email ?? "(no email)"} · {planName}
                      {startedAt && <> · since {fmtDate(startedAt)}</>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Invoices ────────────────────────────────────────────────────────────

function InvoicesSection({ setToast }: { setToast: (t: Toast) => void }) {
  const [rows, setRows] = useState<EmployerInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await employerPortalService.invoices();
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paginator = res.data as any;
        const list: EmployerInvoiceRow[] = Array.isArray(paginator)
          ? paginator
          : paginator?.data ?? [];
        setRows(list);
      } catch {
        setToast({ message: "Could not load invoices.", type: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [setToast]);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-12 flex items-center justify-center" style={{ borderColor: C.slate200 }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  const statusColor = (s: EmployerInvoiceRow["status"]): { bg: string; color: string; label: string } => {
    switch (s) {
      case "paid": return { bg: C.green50, color: C.green800, label: "Paid" };
      case "sent": return { bg: C.amber50, color: C.amber800, label: "Awaiting payment" };
      case "overdue": return { bg: C.red50, color: C.red800, label: "Overdue" };
      case "draft": return { bg: C.slate100, color: C.slate600, label: "Draft" };
      case "void": return { bg: C.slate100, color: C.slate500, label: "Void" };
      default: return { bg: C.slate100, color: C.slate500, label: s };
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold" style={{ color: C.navy900 }}>Invoices</h2>
        <p className="text-xs" style={{ color: C.slate500 }}>
          PEPM (per-employee-per-month) invoices from your practice. Payment terms are set per contract.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center" style={{ borderColor: C.slate200 }}>
          <Mail className="w-8 h-8 mx-auto mb-2" style={{ color: C.slate300 }} />
          <p className="text-sm" style={{ color: C.slate500 }}>No invoices issued yet.</p>
          <p className="text-xs mt-1" style={{ color: C.slate400 }}>
            Your practice will generate the first invoice once your contract starts.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: C.slate200 }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: C.slate100 }}>
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.slate500 }}>Invoice #</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.slate500 }}>Period</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.slate500 }}>Headcount</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.slate500 }}>Total</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.slate500 }}>Due</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.slate500 }}>Status</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.slate500 }}>PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: C.slate100 }}>
              {rows.map((inv) => {
                const sc = statusColor(inv.status);
                return (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: C.navy900 }}>{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.slate600 }}>
                      {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs" style={{ color: C.slate600 }}>
                      {inv.enrolled_count} @ ${Number(inv.pepm_rate).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: C.navy900 }}>
                      {fmtMoney(Number(inv.total))}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.slate500 }}>
                      {fmtDate(inv.due_date)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                        style={{ backgroundColor: sc.bg, color: sc.color }}
                      >
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await employerBillingService.downloadPdf(inv.id);
                          if (res.error || !res.url) {
                            setToast({ message: res.error ?? "Could not download PDF.", type: "error" });
                            return;
                          }
                          const a = document.createElement("a");
                          a.href = res.url;
                          a.target = "_blank";
                          a.rel = "noopener noreferrer";
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(res.url!), 60_000);
                        }}
                        title="Download PDF"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border bg-white hover:bg-slate-50"
                        style={{ borderColor: C.slate200, color: C.slate600 }}
                      >
                        <Download className="w-3 h-3" />
                        PDF
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
