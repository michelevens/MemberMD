// ===== SuperAdmin Portal =====
// Platform admin dashboard for managing all practices (tenants) on MemberMD

import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  LayoutDashboard,
  Building2,
  Users,
  DollarSign,
  Clock,
  ChevronRight,
  Eye,
  MoreHorizontal,
  LogOut,
  Menu,
  X,
  Shield,
  Stethoscope,
  Heart,
  Brain,
  Baby,
  Bone,
  Activity,
  Pill,
  Syringe,
  Scissors,
  Ear,
  Flower2,
  Microscope,
  Zap,
  FileText,
  BarChart3,
  CreditCard,
  HeadphonesIcon,
  Settings,
  ClipboardList,
  FileCheck,
  StickyNote,
  BookOpen,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter,
  Calendar,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId =
  | "dashboard"
  | "practices"
  | "pending-approvals"
  | "specialties"
  | "plan-templates"
  | "screening-library"
  | "consent-templates"
  | "note-templates"
  | "analytics"
  | "billing"
  | "support"
  | "audit-logs"
  | "settings";

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface MockPractice {
  id: string;
  name: string;
  specialty: string;
  model: string;
  providers: number;
  members: number;
  mrr: number;
  status: "active" | "trial" | "suspended";
  joinedAt: string;
  city: string;
  state: string;
}

interface MockSpecialty {
  id: string;
  name: string;
  code: string;
  icon: React.ElementType;
  practiceCount: number;
  screeningTools: number;
  category: string;
}

interface MockPlanTemplate {
  id: string;
  name: string;
  specialty: string;
  monthlyPrice: number;
  visitsPerMonth: number;
  telehealth: boolean;
  messaging: boolean;
  tier: "starter" | "professional" | "enterprise";
}

interface MockAuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  ipAddress: string;
}

// ─── Navigation Config ───────────────────────────────────────────────────────

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Practices",
    items: [
      { id: "practices", label: "All Practices", icon: Building2 },
      { id: "pending-approvals", label: "Pending Approvals", icon: ClipboardList },
    ],
  },
  {
    title: "Master Data",
    items: [
      { id: "specialties", label: "Specialties", icon: Stethoscope },
      { id: "plan-templates", label: "Plan Templates", icon: FileText },
      { id: "screening-library", label: "Screening Library", icon: BookOpen },
      { id: "consent-templates", label: "Consent Templates", icon: FileCheck },
      { id: "note-templates", label: "Note Templates", icon: StickyNote },
    ],
  },
  {
    title: "Platform",
    items: [
      { id: "analytics", label: "Analytics", icon: BarChart3 },
      { id: "billing", label: "Billing", icon: CreditCard },
      { id: "support", label: "Support", icon: HeadphonesIcon },
    ],
  },
  {
    title: "System",
    items: [
      { id: "audit-logs", label: "Audit Logs", icon: Shield },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_PRACTICES: MockPractice[] = [
  { id: "1", name: "Evergreen Family Health", specialty: "Family Medicine", model: "Hybrid DPC", providers: 4, members: 620, mrr: 93000, status: "active", joinedAt: "2025-08-15", city: "Austin", state: "TX" },
  { id: "2", name: "Summit Cardiology Group", specialty: "Cardiology", model: "Pure DPC", providers: 3, members: 340, mrr: 68000, status: "active", joinedAt: "2025-09-22", city: "Denver", state: "CO" },
  { id: "3", name: "Bright Horizons Pediatrics", specialty: "Pediatrics", model: "Hybrid DPC", providers: 5, members: 890, mrr: 71200, status: "active", joinedAt: "2025-10-01", city: "Nashville", state: "TN" },
  { id: "4", name: "Coastal Dermatology", specialty: "Dermatology", model: "Membership Add-on", providers: 2, members: 210, mrr: 31500, status: "active", joinedAt: "2025-11-10", city: "Miami", state: "FL" },
  { id: "5", name: "Pacific Orthopedics", specialty: "Orthopedics", model: "Pure DPC", providers: 6, members: 480, mrr: 96000, status: "active", joinedAt: "2025-12-05", city: "Portland", state: "OR" },
  { id: "6", name: "Tranquil Mind Psychiatry", specialty: "Psychiatry", model: "Hybrid DPC", providers: 2, members: 150, mrr: 37500, status: "trial", joinedAt: "2026-02-18", city: "Seattle", state: "WA" },
  { id: "7", name: "Pinnacle Internal Medicine", specialty: "Internal Medicine", model: "Pure DPC", providers: 3, members: 410, mrr: 61500, status: "active", joinedAt: "2025-07-30", city: "Chicago", state: "IL" },
  { id: "8", name: "Sunrise Women's Health", specialty: "OB/GYN", model: "Hybrid DPC", providers: 4, members: 520, mrr: 78000, status: "active", joinedAt: "2025-10-20", city: "Phoenix", state: "AZ" },
  { id: "9", name: "NeuroVista Clinic", specialty: "Neurology", model: "Pure DPC", providers: 2, members: 180, mrr: 45000, status: "trial", joinedAt: "2026-03-01", city: "Boston", state: "MA" },
  { id: "10", name: "ClearView ENT", specialty: "ENT", model: "Membership Add-on", providers: 1, members: 85, mrr: 12750, status: "suspended", joinedAt: "2025-06-12", city: "Atlanta", state: "GA" },
];

const MOCK_SPECIALTIES: MockSpecialty[] = [
  { id: "1", name: "Family Medicine", code: "FM", icon: Heart, practiceCount: 24, screeningTools: 12, category: "Primary Care" },
  { id: "2", name: "Internal Medicine", code: "IM", icon: Activity, practiceCount: 18, screeningTools: 10, category: "Primary Care" },
  { id: "3", name: "Pediatrics", code: "PED", icon: Baby, practiceCount: 15, screeningTools: 14, category: "Primary Care" },
  { id: "4", name: "Cardiology", code: "CARD", icon: Heart, practiceCount: 9, screeningTools: 8, category: "Specialty" },
  { id: "5", name: "Dermatology", code: "DERM", icon: Flower2, practiceCount: 7, screeningTools: 6, category: "Specialty" },
  { id: "6", name: "Orthopedics", code: "ORTH", icon: Bone, practiceCount: 6, screeningTools: 5, category: "Specialty" },
  { id: "7", name: "Psychiatry", code: "PSYCH", icon: Brain, practiceCount: 11, screeningTools: 9, category: "Behavioral Health" },
  { id: "8", name: "OB/GYN", code: "OBGYN", icon: Baby, practiceCount: 8, screeningTools: 7, category: "Women's Health" },
  { id: "9", name: "Neurology", code: "NEURO", icon: Brain, practiceCount: 4, screeningTools: 6, category: "Specialty" },
  { id: "10", name: "ENT", code: "ENT", icon: Ear, practiceCount: 3, screeningTools: 4, category: "Specialty" },
  { id: "11", name: "Endocrinology", code: "ENDO", icon: Pill, practiceCount: 5, screeningTools: 7, category: "Specialty" },
  { id: "12", name: "Urgent Care", code: "UC", icon: Zap, practiceCount: 12, screeningTools: 8, category: "Primary Care" },
  { id: "13", name: "Allergy & Immunology", code: "AI", icon: Syringe, practiceCount: 4, screeningTools: 5, category: "Specialty" },
  { id: "14", name: "General Surgery", code: "GS", icon: Scissors, practiceCount: 3, screeningTools: 3, category: "Surgical" },
];

const MOCK_PLAN_TEMPLATES: MockPlanTemplate[] = [
  { id: "1", name: "Family Essentials", specialty: "Family Medicine", monthlyPrice: 89, visitsPerMonth: 4, telehealth: true, messaging: true, tier: "starter" },
  { id: "2", name: "Family Premium", specialty: "Family Medicine", monthlyPrice: 149, visitsPerMonth: 8, telehealth: true, messaging: true, tier: "professional" },
  { id: "3", name: "Peds Basic", specialty: "Pediatrics", monthlyPrice: 69, visitsPerMonth: 3, telehealth: true, messaging: true, tier: "starter" },
  { id: "4", name: "Peds Complete", specialty: "Pediatrics", monthlyPrice: 129, visitsPerMonth: 6, telehealth: true, messaging: true, tier: "professional" },
  { id: "5", name: "Cardio Monitor", specialty: "Cardiology", monthlyPrice: 199, visitsPerMonth: 2, telehealth: true, messaging: true, tier: "professional" },
  { id: "6", name: "Cardio Intensive", specialty: "Cardiology", monthlyPrice: 349, visitsPerMonth: 4, telehealth: true, messaging: true, tier: "enterprise" },
  { id: "7", name: "Derm Access", specialty: "Dermatology", monthlyPrice: 119, visitsPerMonth: 2, telehealth: true, messaging: false, tier: "starter" },
  { id: "8", name: "Mental Wellness", specialty: "Psychiatry", monthlyPrice: 179, visitsPerMonth: 4, telehealth: true, messaging: true, tier: "professional" },
  { id: "9", name: "Ortho Recovery", specialty: "Orthopedics", monthlyPrice: 159, visitsPerMonth: 3, telehealth: false, messaging: true, tier: "professional" },
  { id: "10", name: "IM Comprehensive", specialty: "Internal Medicine", monthlyPrice: 129, visitsPerMonth: 6, telehealth: true, messaging: true, tier: "professional" },
];

const MOCK_AUDIT_LOGS: MockAuditLog[] = [
  { id: "1", timestamp: "2026-03-18 09:42:15", user: "admin@membermd.com", action: "practice.approved", resource: "NeuroVista Clinic", ipAddress: "192.168.1.42" },
  { id: "2", timestamp: "2026-03-18 09:15:03", user: "admin@membermd.com", action: "plan_template.created", resource: "Cardio Intensive Plan", ipAddress: "192.168.1.42" },
  { id: "3", timestamp: "2026-03-18 08:55:22", user: "system", action: "subscription.renewed", resource: "Evergreen Family Health", ipAddress: "10.0.0.1" },
  { id: "4", timestamp: "2026-03-17 17:30:11", user: "admin@membermd.com", action: "practice.suspended", resource: "ClearView ENT", ipAddress: "192.168.1.42" },
  { id: "5", timestamp: "2026-03-17 16:12:45", user: "admin@membermd.com", action: "specialty.updated", resource: "Endocrinology", ipAddress: "192.168.1.42" },
  { id: "6", timestamp: "2026-03-17 14:08:33", user: "system", action: "trial.expiring_soon", resource: "Tranquil Mind Psychiatry", ipAddress: "10.0.0.1" },
  { id: "7", timestamp: "2026-03-17 11:22:01", user: "admin@membermd.com", action: "user.role_changed", resource: "dr.smith@summit.com", ipAddress: "192.168.1.42" },
  { id: "8", timestamp: "2026-03-17 09:45:18", user: "system", action: "payment.processed", resource: "Pacific Orthopedics", ipAddress: "10.0.0.1" },
  { id: "9", timestamp: "2026-03-16 20:10:55", user: "admin@membermd.com", action: "consent_template.created", resource: "HIPAA Authorization v2", ipAddress: "73.42.15.88" },
  { id: "10", timestamp: "2026-03-16 15:33:42", user: "system", action: "backup.completed", resource: "Full platform backup", ipAddress: "10.0.0.1" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function StatusBadge({ status }: { status: "active" | "trial" | "suspended" }) {
  const config = {
    active: { label: "Active", bg: "#ecf9ec", color: "#2f8132", border: "#3f9142" },
    trial: { label: "Trial", bg: "#e0f2fe", color: "#0369a1", border: "#38bdf8" },
    suspended: { label: "Suspended", bg: "#fef2f2", color: "#dc2626", border: "#ef4444" },
  };
  const c = config[status];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: c.bg, color: c.color, border: `1px solid ${c.border}` }}
    >
      {c.label}
    </span>
  );
}

function TierBadge({ tier }: { tier: "starter" | "professional" | "enterprise" }) {
  const config = {
    starter: { label: "Starter", bg: "#f1f5f9", color: "#475569" },
    professional: { label: "Professional", bg: "#e0f2fe", color: "#0369a1" },
    enterprise: { label: "Enterprise", bg: "#f3e8ff", color: "#7c3aed" },
  };
  const c = config[tier];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

// ─── Coming Soon Placeholder ─────────────────────────────────────────────────

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center min-h-96">
      <div className="glass rounded-2xl p-12 text-center max-w-md">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: "#e0e8f0" }}
        >
          <Microscope className="w-8 h-8" style={{ color: "#334e68" }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: "#102a43" }}>
          {title}
        </h2>
        <p className="text-slate-500">
          This section is under development and will be available soon.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SuperAdminPortal() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [practiceSearch, setPracticeSearch] = useState("");

  const userName = auth.user
    ? `${auth.user.firstName} ${auth.user.lastName}`
    : "Platform Admin";

  // ─── Computed stats ──────────────────────────────────────────────────────

  const totalPractices = MOCK_PRACTICES.length;
  const totalMembers = MOCK_PRACTICES.reduce((sum, p) => sum + p.members, 0);
  const platformMRR = MOCK_PRACTICES.reduce((sum, p) => sum + p.mrr, 0);
  const activeTrials = MOCK_PRACTICES.filter((p) => p.status === "trial").length;

  // ─── Filtered practices ──────────────────────────────────────────────────

  const filteredPractices = practiceSearch
    ? MOCK_PRACTICES.filter(
        (p) =>
          p.name.toLowerCase().includes(practiceSearch.toLowerCase()) ||
          p.specialty.toLowerCase().includes(practiceSearch.toLowerCase()) ||
          p.city.toLowerCase().includes(practiceSearch.toLowerCase())
      )
    : MOCK_PRACTICES;

  // ─── Sidebar ─────────────────────────────────────────────────────────────

  function renderSidebar() {
    return (
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "linear-gradient(180deg, #102a43 0%, #1a2f45 100%)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              MemberMD
            </h1>
            <p className="text-xs font-medium mt-0.5" style={{ color: "#27ab83" }}>
              Platform Admin
            </p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? "text-white"
                          : "text-slate-300 hover:text-white hover:bg-white/5"
                      }`}
                      style={
                        isActive
                          ? {
                              background:
                                "linear-gradient(135deg, rgba(39,171,131,0.2), rgba(20,125,100,0.15))",
                              borderLeft: "3px solid #27ab83",
                            }
                          : undefined
                      }
                    >
                      <Icon className="w-4.5 h-4.5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{
                background: "linear-gradient(135deg, #27ab83, #147d64)",
              }}
            >
              {auth.user?.firstName?.charAt(0) || "A"}
              {auth.user?.lastName?.charAt(0) || "D"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {userName}
              </p>
              <p className="text-xs text-slate-400">Super Admin</p>
            </div>
          </div>
          <button
            onClick={() => auth.logout()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    );
  }

  // ─── Dashboard Tab ───────────────────────────────────────────────────────

  function renderDashboard() {
    const stats = [
      {
        label: "Total Practices",
        value: formatNumber(totalPractices),
        icon: Building2,
        change: "+3",
        changeLabel: "this month",
        positive: true,
        gradient: "linear-gradient(135deg, #334e68, #243b53)",
      },
      {
        label: "Total Members",
        value: formatNumber(totalMembers),
        icon: Users,
        change: "+142",
        changeLabel: "this month",
        positive: true,
        gradient: "linear-gradient(135deg, #27ab83, #147d64)",
      },
      {
        label: "Platform MRR",
        value: formatCurrency(platformMRR),
        icon: DollarSign,
        change: "+8.3%",
        changeLabel: "vs last month",
        positive: true,
        gradient: "linear-gradient(135deg, #0369a1, #0c4a6e)",
      },
      {
        label: "Active Trials",
        value: formatNumber(activeTrials),
        icon: Clock,
        change: "2",
        changeLabel: "expiring soon",
        positive: false,
        gradient: "linear-gradient(135deg, #d97706, #92400e)",
      },
    ];

    const recentPractices = MOCK_PRACTICES.slice(0, 6);

    return (
      <div className="animate-page-in space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="glass hover-lift rounded-xl p-5 relative overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      {stat.label}
                    </p>
                    <p
                      className="text-2xl font-bold mt-1"
                      style={{ color: "#102a43" }}
                    >
                      {stat.value}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      {stat.positive ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 text-amber-600" />
                      )}
                      <span
                        className="text-xs font-semibold"
                        style={{
                          color: stat.positive ? "#2f8132" : "#d97706",
                        }}
                      >
                        {stat.change}
                      </span>
                      <span className="text-xs text-slate-400">
                        {stat.changeLabel}
                      </span>
                    </div>
                  </div>
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: stat.gradient }}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <button
            onClick={() => setActiveTab("pending-approvals")}
            className="glass hover-lift rounded-xl p-4 flex items-center gap-4 text-left transition-all"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#e0e8f0" }}
            >
              <ClipboardList className="w-5 h-5" style={{ color: "#334e68" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: "#102a43" }}>
                Pending Approvals
              </p>
              <p className="text-xs text-slate-500">
                2 practices awaiting review
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          <button
            onClick={() => setActiveTab("specialties")}
            className="glass hover-lift rounded-xl p-4 flex items-center gap-4 text-left transition-all"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#e6f7f2" }}
            >
              <Stethoscope className="w-5 h-5" style={{ color: "#147d64" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: "#102a43" }}>
                Manage Specialties
              </p>
              <p className="text-xs text-slate-500">
                {MOCK_SPECIALTIES.length} active specialties
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          <button
            onClick={() => setActiveTab("audit-logs")}
            className="glass hover-lift rounded-xl p-4 flex items-center gap-4 text-left transition-all"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#fef2f2" }}
            >
              <Shield className="w-5 h-5" style={{ color: "#dc2626" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: "#102a43" }}>
                Audit Logs
              </p>
              <p className="text-xs text-slate-500">
                {MOCK_AUDIT_LOGS.length} recent events
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        </div>

        {/* Recent Practices + Platform Health */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Recent Practices Table */}
          <div className="xl:col-span-2 glass rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200/60 flex items-center justify-between">
              <div>
                <h3
                  className="text-base font-semibold"
                  style={{ color: "#102a43" }}
                >
                  Recent Practices
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Latest practices on the platform
                </p>
              </div>
              <button
                onClick={() => setActiveTab("practices")}
                className="text-sm font-medium flex items-center gap-1 transition-colors"
                style={{ color: "#27ab83" }}
              >
                View All
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc" }}>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Practice
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Specialty
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Model
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Members
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      MRR
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentPractices.map((practice) => (
                    <tr
                      key={practice.id}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-3.5">
                        <div>
                          <p
                            className="text-sm font-medium"
                            style={{ color: "#102a43" }}
                          >
                            {practice.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {practice.city}, {practice.state}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">
                        {practice.specialty}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">
                        {practice.model}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-right font-medium text-slate-700">
                        {formatNumber(practice.members)}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-right font-medium text-slate-700">
                        {formatCurrency(practice.mrr)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge status={practice.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Platform Health */}
          <div className="glass rounded-xl p-6">
            <h3
              className="text-base font-semibold mb-4"
              style={{ color: "#102a43" }}
            >
              Platform Health
            </h3>
            <div className="space-y-4">
              {[
                { label: "API Uptime", value: "99.97%", color: "#2f8132" },
                { label: "Avg Response", value: "142ms", color: "#27ab83" },
                { label: "Active Sessions", value: "1,247", color: "#0369a1" },
                { label: "Error Rate", value: "0.03%", color: "#2f8132" },
                { label: "DB Connections", value: "34/100", color: "#d97706" },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0"
                >
                  <span className="text-sm text-slate-600">{metric.label}</span>
                  <span
                    className="text-sm font-bold"
                    style={{ color: metric.color }}
                  >
                    {metric.value}
                  </span>
                </div>
              ))}
            </div>

            {/* MRR Trend */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-600">
                  MRR Trend
                </span>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" style={{ color: "#27ab83" }} />
                  <span
                    className="text-sm font-bold"
                    style={{ color: "#27ab83" }}
                  >
                    +8.3%
                  </span>
                </div>
              </div>
              <div className="flex items-end gap-1.5 h-16">
                {[35, 42, 38, 55, 48, 60, 52, 65, 70, 68, 78, 85].map(
                  (val, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t transition-all"
                      style={{
                        height: `${val}%`,
                        background:
                          i === 11
                            ? "linear-gradient(180deg, #27ab83, #147d64)"
                            : "#e0e8f0",
                      }}
                    />
                  )
                )}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-slate-400">Apr</span>
                <span className="text-xs text-slate-400">Mar</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── All Practices Tab ───────────────────────────────────────────────────

  function renderPractices() {
    return (
      <div className="animate-page-in space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2
              className="text-xl font-bold"
              style={{ color: "#102a43" }}
            >
              All Practices
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {MOCK_PRACTICES.length} practices on the platform
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search practices..."
                value={practiceSearch}
                onChange={(e) => setPracticeSearch(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 w-64"
              />
            </div>
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <Filter className="w-4 h-4" />
              Filter
            </button>
          </div>
        </div>

        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "#f8fafc" }}>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Practice
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Specialty
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Model
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Providers
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Members
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    MRR
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPractices.map((practice) => (
                  <tr
                    key={practice.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold text-white"
                          style={{
                            background:
                              "linear-gradient(135deg, #334e68, #243b53)",
                          }}
                        >
                          {practice.name.charAt(0)}
                        </div>
                        <div>
                          <p
                            className="text-sm font-medium"
                            style={{ color: "#102a43" }}
                          >
                            {practice.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {practice.city}, {practice.state}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">
                      {practice.specialty}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">
                      {practice.model}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-right font-medium text-slate-700">
                      {practice.providers}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-right font-medium text-slate-700">
                      {formatNumber(practice.members)}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-right font-medium text-slate-700">
                      {formatCurrency(practice.mrr)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge status={practice.status} />
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">
                      {new Date(practice.joinedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                          title="View practice"
                        >
                          <Eye className="w-4 h-4 text-slate-500" />
                        </button>
                        <button
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                          title="More actions"
                        >
                          <MoreHorizontal className="w-4 h-4 text-slate-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredPractices.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate-500">
                No practices match your search.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Specialties Tab ─────────────────────────────────────────────────────

  function renderSpecialties() {
    const categories = [...new Set(MOCK_SPECIALTIES.map((s) => s.category))];

    return (
      <div className="animate-page-in space-y-6">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "#102a43" }}>
            Specialties
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {MOCK_SPECIALTIES.length} specialties configured across the platform
          </p>
        </div>

        {categories.map((category) => (
          <div key={category}>
            <h3
              className="text-sm font-semibold uppercase tracking-wider mb-3"
              style={{ color: "#334e68" }}
            >
              {category}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {MOCK_SPECIALTIES.filter((s) => s.category === category).map(
                (spec) => {
                  const Icon = spec.icon;
                  return (
                    <div
                      key={spec.id}
                      className="glass hover-lift rounded-xl p-5 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{
                            background:
                              "linear-gradient(135deg, rgba(39,171,131,0.1), rgba(20,125,100,0.08))",
                          }}
                        >
                          <Icon
                            className="w-5 h-5"
                            style={{ color: "#147d64" }}
                          />
                        </div>
                        <span
                          className="text-xs font-mono font-medium px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: "#f1f5f9",
                            color: "#475569",
                          }}
                        >
                          {spec.code}
                        </span>
                      </div>
                      <h4
                        className="text-sm font-semibold mb-3"
                        style={{ color: "#102a43" }}
                      >
                        {spec.name}
                      </h4>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5" />
                          <span>
                            {spec.practiceCount}{" "}
                            {spec.practiceCount === 1
                              ? "practice"
                              : "practices"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ClipboardList className="w-3.5 h-3.5" />
                          <span>{spec.screeningTools} tools</span>
                        </div>
                      </div>
                      <button
                        className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{
                          backgroundColor: "#e6f7f2",
                          color: "#147d64",
                        }}
                      >
                        Edit Specialty
                      </button>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Plan Templates Tab ──────────────────────────────────────────────────

  function renderPlanTemplates() {
    return (
      <div className="animate-page-in space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold" style={{ color: "#102a43" }}>
              Plan Templates
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Suggested membership plans for practices to adopt
            </p>
          </div>
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
          >
            <FileText className="w-4 h-4" />
            Add Template
          </button>
        </div>

        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "#f8fafc" }}>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Template Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Specialty
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Monthly Price
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Visits/Month
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Telehealth
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Messaging
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MOCK_PLAN_TEMPLATES.map((template) => (
                  <tr
                    key={template.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "#102a43" }}
                      >
                        {template.name}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">
                      {template.specialty}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <TierBadge tier={template.tier} />
                    </td>
                    <td className="px-4 py-3.5 text-sm text-right font-semibold" style={{ color: "#102a43" }}>
                      {formatCurrency(template.monthlyPrice)}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-right text-slate-600">
                      {template.visitsPerMonth}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {template.telehealth ? (
                        <span className="text-green-600 font-medium text-sm">
                          Yes
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {template.messaging ? (
                        <span className="text-green-600 font-medium text-sm">
                          Yes
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                          title="View template"
                        >
                          <Eye className="w-4 h-4 text-slate-500" />
                        </button>
                        <button
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                          title="More actions"
                        >
                          <MoreHorizontal className="w-4 h-4 text-slate-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ─── Audit Logs Tab ──────────────────────────────────────────────────────

  function renderAuditLogs() {
    return (
      <div className="animate-page-in space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold" style={{ color: "#102a43" }}>
              Audit Logs
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Platform activity and security events
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <Calendar className="w-4 h-4" />
              Date Range
            </button>
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <Filter className="w-4 h-4" />
              Filter
            </button>
          </div>
        </div>

        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "#f8fafc" }}>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Resource
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    IP Address
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MOCK_AUDIT_LOGS.map((log) => {
                  const actionColor = log.action.includes("suspended")
                    ? "#dc2626"
                    : log.action.includes("approved") ||
                        log.action.includes("created")
                      ? "#2f8132"
                      : log.action.includes("expiring")
                        ? "#d97706"
                        : "#475569";
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-3.5">
                        <span className="text-sm text-slate-600 font-mono">
                          {log.timestamp}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="text-sm font-medium"
                          style={{
                            color:
                              log.user === "system" ? "#94a3b8" : "#102a43",
                          }}
                        >
                          {log.user}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono"
                          style={{
                            backgroundColor: `${actionColor}12`,
                            color: actionColor,
                          }}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">
                        {log.resource}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-slate-400 font-mono">
                          {log.ipAddress}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ─── Tab Router ──────────────────────────────────────────────────────────

  function renderContent() {
    switch (activeTab) {
      case "dashboard":
        return renderDashboard();
      case "practices":
        return renderPractices();
      case "specialties":
        return renderSpecialties();
      case "plan-templates":
        return renderPlanTemplates();
      case "audit-logs":
        return renderAuditLogs();
      case "pending-approvals":
        return <ComingSoon title="Pending Approvals" />;
      case "screening-library":
        return <ComingSoon title="Screening Library" />;
      case "consent-templates":
        return <ComingSoon title="Consent Templates" />;
      case "note-templates":
        return <ComingSoon title="Note Templates" />;
      case "analytics":
        return <ComingSoon title="Analytics" />;
      case "billing":
        return <ComingSoon title="Platform Billing" />;
      case "support":
        return <ComingSoon title="Support" />;
      case "settings":
        return <ComingSoon title="Platform Settings" />;
      default:
        return renderDashboard();
    }
  }

  // ─── Page Title ──────────────────────────────────────────────────────────

  const currentNavItem = NAV_SECTIONS.flatMap((s) => s.items).find(
    (i) => i.id === activeTab
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f8fafc" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {renderSidebar()}

      {/* Main Content */}
      <div className="lg:pl-64 min-h-screen flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-20 glass border-b border-slate-200/60">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <Menu className="w-5 h-5 text-slate-600" />
              </button>
              <div>
                <h2
                  className="text-lg font-bold"
                  style={{ color: "#102a43" }}
                >
                  {currentNavItem?.label || "Dashboard"}
                </h2>
                <p className="text-xs text-slate-500 hidden sm:block">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: "#e6f7f2" }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#27ab83" }} />
                <span className="text-xs font-medium" style={{ color: "#147d64" }}>
                  All Systems Operational
                </span>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #27ab83, #147d64)",
                }}
              >
                {auth.user?.firstName?.charAt(0) || "A"}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {renderContent()}
        </main>

        {/* Footer */}
        <footer className="px-4 sm:px-6 lg:px-8 py-4 border-t border-slate-200/60">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>MemberMD Platform Admin v1.0</span>
            <span>
              {totalPractices} practices | {formatNumber(totalMembers)} members
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
