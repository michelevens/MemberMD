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
  type OperatorNetworkMetrics,
  type OperatorClinicMetric,
  type OperatorMember,
  type OperatorUserMembership,
} from "../../lib/api";
import {
  LayoutDashboard,
  Building2,
  Search,
  Users,
  Settings as SettingsIcon,
  TrendingUp,
  TrendingDown,
  DollarSign,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
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

type TabId = "dashboard" | "clinics" | "members" | "users" | "settings";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Network Dashboard", icon: LayoutDashboard },
  { id: "clinics", label: "Clinics", icon: Building2 },
  { id: "members", label: "Member Search", icon: Search },
  { id: "users", label: "Operator Users", icon: Users },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
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
        return <NetworkDashboard />;
      case "clinics":
        return <ClinicsTab me={me} />;
      case "members":
        return <MemberSearchTab />;
      case "users":
        return <OperatorUsersTab me={me} />;
      case "settings":
        return <OperatorSettingsTab me={me} onSaved={loadMe} />;
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: C.slate50 }}>
      {/* Sidebar */}
      <aside
        className="w-64 shrink-0 flex flex-col"
        style={{ background: `linear-gradient(180deg, ${C.navy900}, ${C.navy800})`, color: C.white }}
      >
        <div className="px-5 pt-6 pb-4 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-semibold tracking-wider opacity-70">OPERATOR CONSOLE</p>
          <h1 className="text-lg font-bold mt-1 truncate">{me.operator.name}</h1>
          <div className="flex items-center gap-1.5 mt-1.5 text-xs opacity-80">
            <Building2 className="w-3 h-3" />
            <span>{me.operator.tenantCount} {me.operator.tenantCount === 1 ? "clinic" : "clinics"}</span>
            <span className="mx-1">·</span>
            <span className="capitalize">{me.role}</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: isActive ? "rgba(39,171,131,0.18)" : "transparent",
                  color: isActive ? C.teal500 : "rgba(255,255,255,0.85)",
                }}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{auth.user?.firstName} {auth.user?.lastName}</p>
            <p className="text-xs opacity-70 truncate">{auth.user?.email}</p>
          </div>
          <button
            onClick={() => auth.logout()}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-8 py-4 border-b"
          style={{ backgroundColor: C.white, borderColor: C.slate200 }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: C.navy900 }}>
              {TABS.find(t => t.id === activeTab)?.label}
            </h2>
          </div>
          <button
            onClick={toggleTheme}
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-slate-50"
            style={{ color: C.slate500, borderColor: C.slate200 }}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </header>
        <div className="p-8">{renderContent()}</div>
      </main>
    </div>
  );
}

export default OperatorPortal;

// ─── Network Dashboard ──────────────────────────────────────────────────────

function NetworkDashboard() {
  const [metrics, setMetrics] = useState<OperatorNetworkMetrics | null>(null);
  const [clinics, setClinics] = useState<OperatorClinicMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [m, c] = await Promise.all([
        operatorService.network(),
        operatorService.clinics(),
      ]);
      if (cancelled) return;
      if (m.error) setError(m.error);
      if (m.data) setMetrics(m.data);
      if (c.data) setClinics(c.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.slate400 }} />;
  }

  if (error || !metrics) {
    return <ErrorPanel message={error || "Could not load network metrics."} />;
  }

  const topByMrr = useMemo(() => [...clinics].sort((a, b) => b.mrrCents - a.mrrCents).slice(0, 5), [clinics]);
  const bottomByMrr = useMemo(() => [...clinics].filter(c => c.mrrCents > 0).sort((a, b) => a.mrrCents - b.mrrCents).slice(0, 5), [clinics]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Network MRR" value={formatMoney(metrics.mrrCents)} icon={DollarSign} accent={C.teal600} />
        <Kpi label="Active Members" value={formatNumber(metrics.memberCount)} icon={UserCheck} accent={C.navy700} />
        <Kpi label="ARPU" value={formatMoney(metrics.arpuCents)} icon={TrendingUp} accent={C.teal600} />
        <Kpi
          label="30-day Churn"
          value={formatPercent(metrics.churnRate30d)}
          icon={metrics.churnRate30d > 0.05 ? TrendingDown : TrendingUp}
          accent={metrics.churnRate30d > 0.05 ? C.red500 : C.green700}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SmallStat label="Active clinics" value={`${metrics.activeTenantCount} of ${metrics.tenantCount}`} />
        <SmallStat label="New members (30d)" value={formatNumber(metrics.newMembers30d)} />
        <SmallStat label="Cancellations (30d)" value={formatNumber(metrics.cancelled30d)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClinicLeaderboard title="Top clinics by MRR" data={topByMrr} />
        <ClinicLeaderboard title="Lowest clinics by MRR" data={bottomByMrr} />
      </div>
    </div>
  );
}

// ─── Clinics Tab ────────────────────────────────────────────────────────────

function ClinicsTab({ me }: { me: OperatorMe }) {
  const auth = useAuth();
  const [tenants, setTenants] = useState<OperatorTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
      </div>

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
                        if (!window.confirm(`Remove ${u.email} from this operator?`)) return;
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

// ─── Operator Settings ──────────────────────────────────────────────────────

function OperatorSettingsTab({ me, onSaved }: { me: OperatorMe; onSaved: () => void }) {
  const [name, setName] = useState(me.operator.name);
  const [contactEmail, setContactEmail] = useState(me.operator.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(me.operator.contactPhone || "");
  const [website, setWebsite] = useState(me.operator.website || "");
  const [saving, setSaving] = useState(false);

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
        <Field label="Contact email">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            disabled={!me.canWrite}
            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50"
            style={{ borderColor: C.slate200 }}
          />
        </Field>
        <Field label="Contact phone">
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            disabled={!me.canWrite}
            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50"
            style={{ borderColor: C.slate200 }}
          />
        </Field>
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

function Kpi({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ElementType; accent: string }) {
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
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ backgroundColor: C.white, borderColor: C.slate200 }}
    >
      <p className="text-xs" style={{ color: C.slate500 }}>{label}</p>
      <p className="text-base font-semibold mt-0.5" style={{ color: C.navy900 }}>{value}</p>
    </div>
  );
}

function ClinicLeaderboard({ title, data }: { title: string; data: OperatorClinicMetric[] }) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ backgroundColor: C.white, borderColor: C.slate200 }}
    >
      <h3 className="text-sm font-semibold mb-4" style={{ color: C.navy900 }}>{title}</h3>
      {data.length === 0 ? (
        <p className="text-xs" style={{ color: C.slate400 }}>No data yet.</p>
      ) : (
        <ul className="space-y-2">
          {data.map((c) => (
            <li key={c.tenantId} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: C.navy900 }}>{c.name}</p>
                <p className="text-xs truncate" style={{ color: C.slate500 }}>
                  {c.memberCount} members · ARPU {formatMoney(c.arpuCents)}
                </p>
              </div>
              <p className="text-sm font-bold shrink-0" style={{ color: C.teal600 }}>
                {formatMoney(c.mrrCents)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: C.slate600 }}>{label}</label>
      {children}
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

// Suppress unused-export warning for ExternalLink import (reserved for future drilldown links)
void ExternalLink;
