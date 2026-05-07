// ===== Operator Portal =====
// Multi-practice operator console — network-wide oversight across N tenants.
// Audience: VP Operations / COO / CFO at a multi-clinic operator
// (franchise, MSO, IPA, employer-direct network, PE-backed roll-up).
//
// Per ADR-0001, every Practice has an Operator (including solo practices).
// For solo customers this portal is technically reachable but the buyer
// won't be routed here — login routes by user role + operator membership.
// Per ADR-0006, healthcare-native names ("Practice") stay in core domain;
// the operator console uses "clinics" in copy where it reads better.

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  operatorService,
  type OperatorMe,
  type OperatorTenant,
  type OperatorMember,
  type OperatorUserMembership,
} from "../../lib/api";
import { OperatorNetworkDashboard } from "./operator/OperatorNetworkDashboard";
import { OperatorPlanTemplates } from "./operator/OperatorPlanTemplates";
import { PhoneField, EmailField } from "../shared/fields";
import { useConfirm } from "../shared/ConfirmDialog";
import { RefreshButton } from "../shared/RefreshButton";
import {
  LayoutDashboard,
  Building2,
  Search,
  Users,
  Settings as SettingsIcon,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Plus,
  Trash2,
  LogOut,
  Mail,
} from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

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
  amber800: "#92400e",
  green500: "#22c55e",
  green50: "#f0fdf4",
  green700: "#15803d",
};

// ─── Tab Definitions ─────────────────────────────────────────────────────────

type TabId = "dashboard" | "clinics" | "templates" | "members" | "users" | "settings";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Network Dashboard", icon: LayoutDashboard },
  { id: "clinics", label: "Clinics", icon: Building2 },
  { id: "templates", label: "Plan Templates", icon: FileText },
  { id: "members", label: "Member Search", icon: Search },
  { id: "users", label: "Operator Users", icon: Users },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function toast(msg: string, kind: "success" | "error" = "success") {
  const el = document.createElement("div");
  el.textContent = msg;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: kind === "success" ? C.navy900 : C.red500,
    color: C.white,
    padding: "10px 20px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "500",
    zIndex: "9999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    transition: "opacity 0.3s",
    opacity: "1",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OperatorPortal() {
  const auth = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [me, setMe] = useState<OperatorMe | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    setMeLoading(true);
    const res = await operatorService.me();
    if (res.error) {
      setMeError(res.error);
    } else if (res.data) {
      setMe(res.data);
      setMeError(null);
    }
    setMeLoading(false);
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  if (meLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.slate50 }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.teal500 }} />
      </div>
    );
  }

  if (meError || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: C.slate50 }}>
        <div
          className="rounded-2xl border p-8 max-w-md text-center"
          style={{ backgroundColor: C.white, borderColor: C.red500 }}
        >
          <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: C.red500 }} />
          <h2 className="text-lg font-semibold" style={{ color: C.navy900 }}>
            Operator scope unavailable
          </h2>
          <p className="text-sm mt-2" style={{ color: C.slate500 }}>
            {meError || "Your account is not a member of any operator. Contact support."}
          </p>
          <button
            onClick={() => auth.logout()}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-slate-50"
            style={{ color: C.slate600, borderColor: C.slate200 }}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const renderContent = (): ReactNode => {
    switch (activeTab) {
      case "dashboard":
        return <OperatorNetworkDashboard />;
      case "clinics":
        return <ClinicsTab me={me} />;
      case "templates":
        return <OperatorPlanTemplates me={me} />;
      case "members":
        return <MemberSearchTab />;
      case "users":
        return <OperatorUsersTab me={me} />;
      case "settings":
        return <OperatorSettingsTab me={me} onSaved={loadMe} />;
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar — flat Stripe-style by default, but operator can
          override the sigil + accent color via default_branding.
          When a logo_url is set, use it instead of the icon-tile;
          when primary_color is set, color the active-tab strip and
          icon-tile background. The "Operator" eyebrow and operator
          name stay (consistent navigation hierarchy). */}
      {(() => {
        const branding = (me.operator.defaultBranding ?? {}) as {
          logo_url?: string;
          primary_color?: string;
          brand_name?: string;
        };
        const accent = branding.primary_color || "#635bff";
        return (
      <aside className="w-60 shrink-0 flex flex-col bg-white border-r border-slate-200">
        <div className="px-4 py-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt={`${me.operator.name} logo`}
                className="w-7 h-7 rounded-md object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-white font-semibold text-[13px]"
                style={{ backgroundColor: accent }}
              >
                <Building2 className="w-3.5 h-3.5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                {branding.brand_name ?? "Operator"}
              </p>
              <p className="text-[13px] text-slate-900 font-semibold tracking-tight truncate">{me.operator.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-500">
            <span>{me.operator.tenantCount} {me.operator.tenantCount === 1 ? "clinic" : "clinics"}</span>
            <span className="text-slate-300">·</span>
            <span className="capitalize">{me.role}</span>
          </div>
        </div>

        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 pl-2.5 pr-2 py-1.5 rounded-md text-[13px] transition-colors ${
                  isActive
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-slate-700" : "text-slate-400"}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] text-slate-700 font-medium truncate">{auth.user?.firstName} {auth.user?.lastName}</p>
            <p className="text-[11px] text-slate-400 truncate">{auth.user?.email}</p>
          </div>
          <button
            onClick={() => auth.logout()}
            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
        );
      })()}

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-6 lg:px-8 h-14 border-b bg-white"
          style={{ borderColor: C.slate200 }}
        >
          <h1 className="text-[15px] text-slate-900 font-semibold tracking-tight truncate">
            {TABS.find(t => t.id === activeTab)?.label}
          </h1>
          <button
            onClick={toggleTheme}
            className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </header>
        <div className="p-6 lg:p-8">{renderContent()}</div>
      </main>
    </div>
  );
}

export default OperatorPortal;

// Network dashboard moved to ./operator/OperatorNetworkDashboard.tsx

// ─── Clinics Tab ────────────────────────────────────────────────────────────

function ClinicsTab({ me }: { me: OperatorMe }) {
  const auth = useAuth();
  const [tenants, setTenants] = useState<OperatorTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);

  const reloadTenants = useCallback(async () => {
    const res = await operatorService.tenants();
    if (res.error) setError(res.error);
    if (res.data) setTenants(res.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await operatorService.tenants();
      if (cancelled) return;
      if (res.error) setError(res.error);
      if (res.data) setTenants(res.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => search
      ? tenants.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
      : tenants,
    [tenants, search]
  );

  const drillIn = (tenantId: string) => {
    auth.switchTenant(tenantId);
    toast("Switched to clinic. Opening practice console…");
    setTimeout(() => {
      window.location.hash = "#/practice";
    }, 400);
  };

  if (loading) return <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.slate400 }} />;
  if (error) return <ErrorPanel message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm" style={{ color: C.slate500 }}>
          {tenants.length} {tenants.length === 1 ? "clinic" : "clinics"} in {me.operator.name}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search clinics…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 w-64"
              style={{ borderColor: C.slate200 }}
            />
          </div>
          {me.canWrite && (
            <button
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
            >
              <Plus className="w-4 h-4" />
              New clinic
            </button>
          )}
        </div>
      </div>

      {wizardOpen && (
        <NewClinicWizard
          onClose={() => setWizardOpen(false)}
          onCreated={async (newTenant) => {
            await reloadTenants();
            setWizardOpen(false);
            toast(`Clinic "${newTenant.name}" created.`);
          }}
        />
      )}

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: C.white, borderColor: C.slate200 }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: C.slate50 }}>
              <Th>Clinic</Th>
              <Th>Specialty</Th>
              <Th align="right">Patients</Th>
              <Th align="center">Connect</Th>
              <Th align="center">Status</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: C.slate100 }}>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm" style={{ color: C.slate400 }}>
                  No clinics match your search.
                </td>
              </tr>
            )}
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white"
                      style={{ background: `linear-gradient(135deg, ${C.navy700}, ${C.navy800})` }}
                    >
                      {t.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: C.navy900 }}>{t.name}</p>
                      <p className="text-xs truncate" style={{ color: C.slate500 }}>
                        {t.city ? `${t.city}${t.state ? `, ${t.state}` : ""}` : t.tenantCode}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm" style={{ color: C.slate600 }}>{t.specialty || "—"}</td>
                <td className="px-4 py-3.5 text-sm text-right font-medium" style={{ color: C.navy700 }}>
                  {t.patientCount !== null ? formatNumber(t.patientCount) : "—"}
                </td>
                <td className="px-4 py-3.5 text-center">
                  <ConnectBadge status={t.stripeConnectStatus} chargesEnabled={t.stripeChargesEnabled} />
                </td>
                <td className="px-4 py-3.5 text-center">
                  <StatusBadge active={t.isActive} />
                </td>
                <td className="px-4 py-3.5 text-right">
                  <button
                    onClick={() => drillIn(t.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:bg-slate-100"
                    style={{ color: C.teal600 }}
                  >
                    Open
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Member Search ──────────────────────────────────────────────────────────

function MemberSearchTab() {
  const auth = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<OperatorMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const submit = async () => {
    if (q.trim().length < 2) {
      toast("Search needs at least 2 characters.", "error");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await operatorService.searchMembers(q.trim(), 50);
    setLoading(false);
    setHasSearched(true);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResults(res.data ?? []);
  };

  const openMember = (m: OperatorMember) => {
    auth.switchTenant(m.tenantId);
    toast(`Switched to ${m.tenantName}. Opening member…`);
    setTimeout(() => {
      window.location.hash = "#/practice";
    }, 400);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xl">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Search any member across all clinics — name, email, phone…"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
            style={{ borderColor: C.slate200 }}
          />
        </div>
        <button
          onClick={submit}
          disabled={loading}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
        </button>
      </div>

      {error && <ErrorPanel message={error} />}

      {hasSearched && !loading && results.length === 0 && !error && (
        <div className="text-center py-12" style={{ color: C.slate400 }}>
          <p className="text-sm">No members found.</p>
        </div>
      )}

      {results.length > 0 && (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: C.white, borderColor: C.slate200 }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: C.slate50 }}>
                <Th>Member</Th>
                <Th>Clinic</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: C.slate100 }}>
              {results.map((m) => (
                <tr key={m.patientId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3 text-sm font-medium" style={{ color: C.navy900 }}>
                    {m.firstName} {m.lastName}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: C.slate600 }}>{m.tenantName || "—"}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: C.slate600 }}>{m.email || "—"}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: C.slate600 }}>{m.phone || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openMember(m)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:bg-slate-100"
                      style={{ color: C.teal600 }}
                    >
                      Open in clinic
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Operator Users ─────────────────────────────────────────────────────────

function OperatorUsersTab({ me }: { me: OperatorMe }) {
  const [users, setUsers] = useState<OperatorUserMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await operatorService.listUsers();
    if (res.error) setError(res.error);
    if (res.data) setUsers(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.slate400 }} />;
  if (error) return <ErrorPanel message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: C.slate500 }}>
          {users.length} operator {users.length === 1 ? "member" : "members"}
        </p>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={load} title="Refresh operator users" />
          {me.canManageUsers && (
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
              style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
            >
              <Plus className="w-4 h-4" />
              Add user
            </button>
          )}
        </div>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: C.white, borderColor: C.slate200 }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: C.slate50 }}>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th align="center">Role</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: C.slate100 }}>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-3 text-sm font-medium" style={{ color: C.navy900 }}>
                  {u.firstName} {u.lastName}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: C.slate600 }}>{u.email}</td>
                <td className="px-4 py-3 text-center">
                  <RoleBadge role={u.operatorRole} />
                </td>
                <td className="px-4 py-3 text-right">
                  {me.canManageUsers && (
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Remove user from operator?",
                          message: `${u.email} will lose access to this operator. They can be re-added later.`,
                          confirmLabel: "Remove",
                          variant: "danger",
                        });
                        if (!ok) return;
                        const res = await operatorService.removeUser(u.userId);
                        if (res.error) {
                          toast(res.error, "error");
                        } else {
                          toast("User removed.");
                          void load();
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-red-50"
                      style={{ color: C.red500 }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm" style={{ color: C.slate400 }}>
                  No operator users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); void load(); }}
        />
      )}
    </div>
  );
}

function AddUserModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "admin" | "viewer">("admin");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!email.trim()) {
      toast("Email is required.", "error");
      return;
    }
    setSubmitting(true);
    const res = await operatorService.addUser({ email: email.trim(), operatorRole: role });
    setSubmitting(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast("User added to operator.");
    onAdded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(16,42,67,0.5)" }}>
      <div className="rounded-2xl shadow-xl w-full max-w-md" style={{ backgroundColor: C.white }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: C.slate200 }}>
          <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>Add operator user</h3>
          <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
            User must already exist on the platform — they will be added to this operator's membership.
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: C.slate600 }}>Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                style={{ borderColor: C.slate200 }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: C.slate600 }}>Operator role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "owner" | "admin" | "viewer")}
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
              style={{ borderColor: C.slate200 }}
            >
              <option value="viewer">Viewer — read-only across all clinics</option>
              <option value="admin">Admin — read all + write operator config</option>
              <option value="owner">Owner — full control + manage users</option>
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: C.slate200 }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50"
            style={{ color: C.slate600 }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Add user
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Clinic Wizard ──────────────────────────────────────────────────────

function NewClinicWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (tenant: OperatorTenant) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tenantCode, setTenantCode] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [specialty, setSpecialty] = useState("");
  const [practiceModel, setPracticeModel] = useState("pure_dpc");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-derive slug + tenant code as they type the name. They can
  // override either; we just save them the keystrokes.
  const onNameChange = (v: string) => {
    setName(v);
    if (!slug) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60));
    }
    if (!tenantCode) {
      setTenantCode(v.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6));
    }
  };

  const submit = async () => {
    setErrors({});
    const fieldErrors: Record<string, string> = {};
    if (!name.trim()) fieldErrors.name = "Required";
    if (!slug.trim()) fieldErrors.slug = "Required";
    if (slug && !/^[a-z0-9-]+$/.test(slug)) fieldErrors.slug = "Lowercase letters, numbers, hyphens only";
    if (!tenantCode.trim()) fieldErrors.tenantCode = "Required";
    if (tenantCode.length > 6) fieldErrors.tenantCode = "Max 6 characters";
    if (!timezone.trim()) fieldErrors.timezone = "Required";
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    const res = await operatorService.createTenant({
      name: name.trim(),
      slug: slug.trim(),
      tenantCode: tenantCode.trim(),
      timezone: timezone.trim(),
      specialty: specialty.trim() || null,
      practiceModel: practiceModel || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
    });
    setSubmitting(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    if (res.data?.tenant) {
      onCreated(res.data.tenant);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(16,42,67,0.5)" }}>
      <div className="rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ backgroundColor: C.white }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: C.slate200 }}>
          <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>New clinic</h3>
          <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
            Creates a Practice under this operator and seeds default programs, screening templates, and consent forms.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Clinic name" error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Riverside Family Medicine"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              style={{ borderColor: errors.name ? "#ef4444" : C.slate200 }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="URL slug" error={errors.slug}>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="riverside-family"
                className="w-full px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-400"
                style={{ borderColor: errors.slug ? "#ef4444" : C.slate200 }}
              />
            </Field>
            <Field label="Tenant code" hint="Max 6 chars, A-Z 0-9" error={errors.tenantCode}>
              <input
                type="text"
                value={tenantCode}
                onChange={(e) => setTenantCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="RVFM"
                maxLength={6}
                className="w-full px-3 py-2 rounded-lg border text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-teal-400"
                style={{ borderColor: errors.tenantCode ? "#ef4444" : C.slate200 }}
              />
            </Field>
          </div>

          <Field label="Timezone" error={errors.timezone}>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
              style={{ borderColor: C.slate200 }}
            >
              <option value="America/New_York">Eastern (America/New_York)</option>
              <option value="America/Chicago">Central (America/Chicago)</option>
              <option value="America/Denver">Mountain (America/Denver)</option>
              <option value="America/Phoenix">Arizona (America/Phoenix)</option>
              <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
              <option value="America/Anchorage">Alaska (America/Anchorage)</option>
              <option value="Pacific/Honolulu">Hawaii (Pacific/Honolulu)</option>
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Specialty (optional)">
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="primary_care"
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                style={{ borderColor: C.slate200 }}
              />
            </Field>
            <Field label="Model">
              <select
                value={practiceModel}
                onChange={(e) => setPracticeModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                style={{ borderColor: C.slate200 }}
              >
                <option value="pure_dpc">Pure DPC</option>
                <option value="hybrid">Hybrid</option>
                <option value="concierge">Concierge</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact email (optional)">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@clinic.com"
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                style={{ borderColor: C.slate200 }}
              />
            </Field>
            <Field label="Contact phone (optional)">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="555-0100"
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                style={{ borderColor: C.slate200 }}
              />
            </Field>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: C.slate200 }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50"
            style={{ color: C.slate600 }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Create clinic
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Operator Settings ──────────────────────────────────────────────────────

function OperatorSettingsTab({ me, onSaved }: { me: OperatorMe; onSaved: () => void }) {
  const [name, setName] = useState(me.operator.name);
  const [contactEmail, setContactEmail] = useState(me.operator.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(me.operator.contactPhone || "");
  const [website, setWebsite] = useState(me.operator.website || "");
  const [saving, setSaving] = useState(false);

  // White-label branding fields. Stored in operator.default_branding
  // jsonb; convention: { logo_url, primary_color, brand_name }.
  // Empty values are stored as null to keep the json clean.
  const branding = (me.operator.defaultBranding ?? {}) as {
    logo_url?: string;
    primary_color?: string;
    brand_name?: string;
  };
  const [logoUrl, setLogoUrl] = useState(branding.logo_url ?? "");
  const [primaryColor, setPrimaryColor] = useState(branding.primary_color ?? "");
  const [brandName, setBrandName] = useState(branding.brand_name ?? "");
  const [savingBrand, setSavingBrand] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await operatorService.update({
      name,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      website: website || null,
    } as Partial<OperatorMe["operator"]>);
    setSaving(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast("Operator settings saved.");
    onSaved();
  };

  const saveBranding = async () => {
    setSavingBrand(true);
    const cleaned: Record<string, string> = {};
    if (logoUrl.trim()) cleaned.logo_url = logoUrl.trim();
    if (primaryColor.trim()) cleaned.primary_color = primaryColor.trim();
    if (brandName.trim()) cleaned.brand_name = brandName.trim();

    const res = await operatorService.update({
      defaultBranding: Object.keys(cleaned).length > 0 ? cleaned : null,
    } as Partial<OperatorMe["operator"]>);
    setSavingBrand(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast("Branding saved. Reload to see chrome update.");
    onSaved();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div
        className="rounded-2xl border p-6 space-y-4"
        style={{ backgroundColor: C.white, borderColor: C.slate200 }}
      >
        <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>Operator profile</h3>

        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!me.canWrite}
            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50"
            style={{ borderColor: C.slate200 }}
          />
        </Field>
        <EmailField
          label="Contact email"
          value={contactEmail}
          onChange={(v) => setContactEmail(v)}
          disabled={!me.canWrite}
        />
        <PhoneField
          label="Contact phone"
          value={contactPhone}
          onChange={(v) => setContactPhone(v)}
          disabled={!me.canWrite}
        />
        <Field label="Website">
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            disabled={!me.canWrite}
            placeholder="https://"
            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50"
            style={{ borderColor: C.slate200 }}
          />
        </Field>

        {me.canWrite && (
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save changes
            </button>
          </div>
        )}

        {!me.canWrite && (
          <p className="text-xs" style={{ color: C.slate500 }}>
            Read-only role. Ask an operator owner or admin to make changes.
          </p>
        )}
      </div>

      {/* White-label branding — operator-supplied logo + accent color
          shown in the operator console chrome (sidebar sigil + brand
          name eyebrow). Tenant-level practice branding is separate. */}
      <div
        className="rounded-2xl border p-6 space-y-4"
        style={{ backgroundColor: C.white, borderColor: C.slate200 }}
      >
        <div>
          <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>White-label branding</h3>
          <p className="text-xs mt-1" style={{ color: C.slate500 }}>
            Replaces the default purple sigil and "Operator" label in the operator console with your brand. Tenant-level practice branding is configured separately per clinic.
          </p>
        </div>

        <Field label="Logo URL">
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            disabled={!me.canWrite}
            placeholder="https://yourbrand.com/logo.svg"
            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50"
            style={{ borderColor: C.slate200 }}
          />
        </Field>

        <Field label="Primary color (hex)">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              disabled={!me.canWrite}
              placeholder="#635bff"
              className="flex-1 px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50"
              style={{ borderColor: C.slate200 }}
            />
            {primaryColor && (
              <div
                className="w-9 h-9 rounded-lg border flex-shrink-0"
                style={{ backgroundColor: primaryColor, borderColor: C.slate200 }}
                title="Color preview"
              />
            )}
          </div>
        </Field>

        <Field label="Brand label">
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            disabled={!me.canWrite}
            placeholder="Network · Group · etc. (defaults to 'Operator')"
            maxLength={32}
            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50"
            style={{ borderColor: C.slate200 }}
          />
        </Field>

        {me.canWrite && (
          <div className="flex justify-end">
            <button
              onClick={saveBranding}
              disabled={savingBrand}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
            >
              {savingBrand && <Loader2 className="w-4 h-4 animate-spin" />}
              Save branding
            </button>
          </div>
        )}
      </div>

      <div
        className="rounded-2xl border p-6"
        style={{ backgroundColor: C.slate50, borderColor: C.slate200 }}
      >
        <h4 className="text-sm font-semibold mb-2" style={{ color: C.navy900 }}>Operator metadata</h4>
        <dl className="text-xs space-y-1.5" style={{ color: C.slate600 }}>
          <DefRow label="Operator ID" value={me.operator.id} mono />
          <DefRow label="Slug" value={me.operator.slug} />
          <DefRow label="Clinics" value={String(me.operator.tenantCount)} />
          <DefRow label="Status" value={me.operator.isActive ? "Active" : "Inactive"} />
        </dl>
      </div>
    </div>
  );
}

// ─── Atoms ──────────────────────────────────────────────────────────────────

function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "center" | "right" }) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider ${alignClass}`} style={{ color: C.slate500 }}>
      {children}
    </th>
  );
}

function ConnectBadge({ status, chargesEnabled }: { status: string | null; chargesEnabled: boolean }) {
  const s = status ?? "not_started";
  const effective = s === "active" && !chargesEnabled ? "restricted" : s;
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    active: { label: "Active", bg: C.green50, color: C.green700 },
    pending_verification: { label: "Verifying", bg: C.amber50, color: C.amber800 },
    pending_onboarding: { label: "Onboarding", bg: C.amber50, color: C.amber800 },
    restricted: { label: "Restricted", bg: C.red50, color: C.red500 },
    disconnected: { label: "Disconnected", bg: C.slate100, color: C.slate500 },
    not_started: { label: "Not set up", bg: C.slate100, color: C.slate500 },
  };
  const c = cfg[effective] ?? cfg.not_started;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: c.bg, color: c.color }}>
      {c.label}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: active ? C.green50 : C.slate100, color: active ? C.green700 : C.slate500 }}
    >
      {active ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function RoleBadge({ role }: { role: "owner" | "admin" | "viewer" }) {
  const cfg = {
    owner: { label: "Owner", bg: "rgba(39,171,131,0.15)", color: C.teal600 },
    admin: { label: "Admin", bg: "rgba(51,78,104,0.12)", color: C.navy700 },
    viewer: { label: "Viewer", bg: C.slate100, color: C.slate500 },
  }[role];
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: C.slate600 }}>{label}</label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-[11px]" style={{ color: C.slate400 }}>{hint}</p>
      )}
      {error && (
        <p className="mt-1 text-[11px]" style={{ color: "#dc2626" }}>{error}</p>
      )}
    </div>
  );
}

function DefRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className={mono ? "font-mono" : "font-medium"} style={{ color: C.navy700 }}>{value}</dd>
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

