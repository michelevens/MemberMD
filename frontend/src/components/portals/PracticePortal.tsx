// ===== Practice Portal =====
// Main dashboard for DPC practice owners/admins — manage membership practice
// Tabs: Dashboard, Patient Roster, Membership Plans, Appointments, Messages, Invoices, + Coming Soon tabs

import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { HeaderToolbar } from "../shared/HeaderToolbar";
import { UserSettingsDropdown } from "../shared/UserSettingsDropdown";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Clock,
  Calendar,
  Stethoscope,
  Pill,
  Activity,
  CreditCard,
  FileText,
  Receipt,
  Ticket,
  UserCog,
  UsersRound,
  MessageSquare,
  Bell,
  Settings,
  Palette,
  Menu,
  X,
  DollarSign,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Send,
  Check,
  Star,
  Shield,
  Heart,
  Phone,
  Video,
  Crown,
  UserPlus,
  AlertCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId =
  | "dashboard"
  | "roster"
  | "intakes"
  | "waitlist"
  | "appointments"
  | "encounters"
  | "prescriptions"
  | "screenings"
  | "plans"
  | "invoices"
  | "payments"
  | "coupons"
  | "providers"
  | "staff"
  | "messages"
  | "notifications"
  | "practice-settings"
  | "branding";

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// ─── Navigation Config ──────────────────────────────────────────────────────

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Members",
    items: [
      { id: "roster", label: "Patient Roster", icon: Users },
      { id: "intakes", label: "Intake Submissions", icon: ClipboardList },
      { id: "waitlist", label: "Waitlist", icon: Clock },
    ],
  },
  {
    title: "Clinical",
    items: [
      { id: "appointments", label: "Appointments", icon: Calendar },
      { id: "encounters", label: "Encounters", icon: Stethoscope },
      { id: "prescriptions", label: "Prescriptions", icon: Pill },
      { id: "screenings", label: "Screenings", icon: Activity },
    ],
  },
  {
    title: "Billing",
    items: [
      { id: "plans", label: "Membership Plans", icon: CreditCard },
      { id: "invoices", label: "Invoices", icon: FileText },
      { id: "payments", label: "Payments", icon: Receipt },
      { id: "coupons", label: "Coupons", icon: Ticket },
    ],
  },
  {
    title: "Team",
    items: [
      { id: "providers", label: "Providers", icon: UserCog },
      { id: "staff", label: "Staff", icon: UsersRound },
    ],
  },
  {
    title: "Communications",
    items: [
      { id: "messages", label: "Messages", icon: MessageSquare },
      { id: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "Settings",
    items: [
      { id: "practice-settings", label: "Practice Settings", icon: Settings },
      { id: "branding", label: "Branding", icon: Palette },
    ],
  },
];

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_PLANS = [
  {
    id: "p1",
    name: "Essential",
    badge: null,
    monthlyPrice: 99,
    annualPrice: 1069,
    memberCount: 45,
    entitlements: [
      "2 office visits / month",
      "Unlimited messaging (48hr SLA)",
      "Annual wellness exam",
      "Basic lab panel included",
      "10% Rx discount",
    ],
  },
  {
    id: "p2",
    name: "Complete",
    badge: "Most Popular",
    monthlyPrice: 199,
    annualPrice: 2149,
    memberCount: 28,
    entitlements: [
      "4 office visits / month",
      "Telehealth visits included",
      "Unlimited messaging (24hr SLA)",
      "Comprehensive lab panel",
      "Mental health check-ins",
      "20% Rx discount",
    ],
  },
  {
    id: "p3",
    name: "Premium",
    badge: "VIP",
    monthlyPrice: 299,
    annualPrice: 3229,
    memberCount: 12,
    entitlements: [
      "Unlimited office visits",
      "Unlimited telehealth",
      "Priority messaging (4hr SLA)",
      "Full lab panel + imaging",
      "Crisis support line",
      "Same-day appointments",
      "30% Rx discount",
      "Specialist referral coordination",
    ],
  },
];

const MOCK_PATIENTS = [
  { id: "pt1", name: "Sarah Mitchell", plan: "Complete", status: "active" as const, phone: "(555) 234-5678", email: "sarah.m@email.com", lastVisit: "Mar 15, 2026", nextApt: "Mar 22, 2026" },
  { id: "pt2", name: "James Rivera", plan: "Premium", status: "active" as const, phone: "(555) 345-6789", email: "james.r@email.com", lastVisit: "Mar 14, 2026", nextApt: "Mar 20, 2026" },
  { id: "pt3", name: "Emily Chen", plan: "Essential", status: "active" as const, phone: "(555) 456-7890", email: "emily.c@email.com", lastVisit: "Mar 10, 2026", nextApt: "Mar 25, 2026" },
  { id: "pt4", name: "Michael Thompson", plan: "Complete", status: "paused" as const, phone: "(555) 567-8901", email: "michael.t@email.com", lastVisit: "Feb 28, 2026", nextApt: "—" },
  { id: "pt5", name: "Lisa Patel", plan: "Essential", status: "active" as const, phone: "(555) 678-9012", email: "lisa.p@email.com", lastVisit: "Mar 12, 2026", nextApt: "Mar 26, 2026" },
  { id: "pt6", name: "Robert Kim", plan: "Premium", status: "active" as const, phone: "(555) 789-0123", email: "robert.k@email.com", lastVisit: "Mar 16, 2026", nextApt: "Mar 19, 2026" },
  { id: "pt7", name: "Angela Foster", plan: "Complete", status: "cancelled" as const, phone: "(555) 890-1234", email: "angela.f@email.com", lastVisit: "Jan 15, 2026", nextApt: "—" },
  { id: "pt8", name: "David Nguyen", plan: "Essential", status: "active" as const, phone: "(555) 901-2345", email: "david.n@email.com", lastVisit: "Mar 8, 2026", nextApt: "Mar 28, 2026" },
  { id: "pt9", name: "Rachel Adams", plan: "Complete", status: "active" as const, phone: "(555) 012-3456", email: "rachel.a@email.com", lastVisit: "Mar 17, 2026", nextApt: "Mar 24, 2026" },
  { id: "pt10", name: "Carlos Mendez", plan: "Premium", status: "active" as const, phone: "(555) 123-4567", email: "carlos.m@email.com", lastVisit: "Mar 13, 2026", nextApt: "Mar 21, 2026" },
  { id: "pt11", name: "Jennifer Walsh", plan: "Essential", status: "paused" as const, phone: "(555) 234-5670", email: "jen.w@email.com", lastVisit: "Feb 20, 2026", nextApt: "—" },
  { id: "pt12", name: "Thomas Lee", plan: "Complete", status: "active" as const, phone: "(555) 345-6780", email: "thomas.l@email.com", lastVisit: "Mar 11, 2026", nextApt: "Mar 27, 2026" },
];

const MOCK_APPOINTMENTS = [
  { id: "a1", time: "8:00 AM", patient: "James Rivera", plan: "Premium", type: "Follow-up", duration: "30 min", provider: "Dr. Michel", status: "confirmed" as const },
  { id: "a2", time: "8:30 AM", patient: "Sarah Mitchell", plan: "Complete", type: "Telehealth", duration: "20 min", provider: "Dr. Michel", status: "confirmed" as const },
  { id: "a3", time: "9:15 AM", patient: "Emily Chen", plan: "Essential", type: "Office Visit", duration: "30 min", provider: "Dr. Michel", status: "pending" as const },
  { id: "a4", time: "10:00 AM", patient: "Robert Kim", plan: "Premium", type: "Annual Wellness", duration: "60 min", provider: "Dr. Michel", status: "confirmed" as const },
  { id: "a5", time: "11:00 AM", patient: "Lisa Patel", plan: "Essential", type: "Lab Review", duration: "15 min", provider: "NP Johnson", status: "confirmed" as const },
  { id: "a6", time: "1:00 PM", patient: "Rachel Adams", plan: "Complete", type: "Mental Health", duration: "45 min", provider: "Dr. Michel", status: "pending" as const },
  { id: "a7", time: "2:00 PM", patient: "Carlos Mendez", plan: "Premium", type: "Office Visit", duration: "30 min", provider: "NP Johnson", status: "confirmed" as const },
  { id: "a8", time: "3:30 PM", patient: "Thomas Lee", plan: "Complete", type: "Telehealth", duration: "20 min", provider: "Dr. Michel", status: "confirmed" as const },
];

const MOCK_DASHBOARD_APPOINTMENTS = MOCK_APPOINTMENTS.slice(0, 5);

const MOCK_ACTIVITY = [
  { id: "act1", text: "New member enrolled — Jane Smith (Complete Plan)", time: "2 min ago", icon: UserPlus },
  { id: "act2", text: "Appointment completed — John D. with Dr. Michel", time: "18 min ago", icon: Check },
  { id: "act3", text: "Payment received — $199.00 from Sarah Mitchell", time: "45 min ago", icon: DollarSign },
  { id: "act4", text: "Intake form submitted — Marcus Williams", time: "1 hour ago", icon: ClipboardList },
  { id: "act5", text: "Prescription renewed — Emily Chen (Lisinopril)", time: "2 hours ago", icon: Pill },
  { id: "act6", text: "Lab results uploaded — Robert Kim (CBC Panel)", time: "3 hours ago", icon: Activity },
  { id: "act7", text: "Member upgraded — Lisa Patel (Essential → Complete)", time: "4 hours ago", icon: TrendingUp },
  { id: "act8", text: "New message from Carlos Mendez", time: "5 hours ago", icon: MessageSquare },
];

const MOCK_INVOICES = [
  { id: "INV-1042", patient: "Sarah Mitchell", amount: 199.0, plan: "Complete", status: "paid" as const, date: "Mar 15, 2026" },
  { id: "INV-1041", patient: "James Rivera", amount: 299.0, plan: "Premium", status: "paid" as const, date: "Mar 15, 2026" },
  { id: "INV-1040", patient: "Emily Chen", amount: 99.0, plan: "Essential", status: "paid" as const, date: "Mar 15, 2026" },
  { id: "INV-1039", patient: "Michael Thompson", amount: 199.0, plan: "Complete", status: "overdue" as const, date: "Mar 1, 2026" },
  { id: "INV-1038", patient: "Lisa Patel", amount: 99.0, plan: "Essential", status: "paid" as const, date: "Mar 15, 2026" },
  { id: "INV-1037", patient: "Robert Kim", amount: 299.0, plan: "Premium", status: "paid" as const, date: "Mar 15, 2026" },
  { id: "INV-1036", patient: "Angela Foster", amount: 199.0, plan: "Complete", status: "overdue" as const, date: "Feb 15, 2026" },
  { id: "INV-1035", patient: "David Nguyen", amount: 99.0, plan: "Essential", status: "open" as const, date: "Mar 15, 2026" },
  { id: "INV-1034", patient: "Rachel Adams", amount: 199.0, plan: "Complete", status: "paid" as const, date: "Mar 15, 2026" },
  { id: "INV-1033", patient: "Carlos Mendez", amount: 299.0, plan: "Premium", status: "paid" as const, date: "Mar 15, 2026" },
];

const MOCK_THREADS = [
  {
    id: "t1",
    patient: "Sarah Mitchell",
    lastMessage: "Thank you, Dr. Michel! I'll see you Thursday.",
    time: "10 min ago",
    unread: 2,
    messages: [
      { id: "m1", sender: "Sarah Mitchell", text: "Hi Dr. Michel, I wanted to ask about my lab results from last week. Everything look okay?", time: "Yesterday 2:30 PM", isPatient: true },
      { id: "m2", sender: "Dr. Michel", text: "Hi Sarah! Your labs look great. Cholesterol is within normal range and your A1C improved. Keep up the good work with the diet changes.", time: "Yesterday 3:15 PM", isPatient: false },
      { id: "m3", sender: "Sarah Mitchell", text: "That's wonderful news! Should I continue the current medication?", time: "Today 9:00 AM", isPatient: true },
      { id: "m4", sender: "Dr. Michel", text: "Yes, continue the current dosage. We'll reassess at your next visit on Thursday.", time: "Today 9:45 AM", isPatient: false },
      { id: "m5", sender: "Sarah Mitchell", text: "Thank you, Dr. Michel! I'll see you Thursday.", time: "Today 10:02 AM", isPatient: true },
    ],
  },
  {
    id: "t2",
    patient: "Carlos Mendez",
    lastMessage: "Can I get a refill on my prescription?",
    time: "1 hour ago",
    unread: 1,
    messages: [
      { id: "m6", sender: "Carlos Mendez", text: "Good morning! I'm running low on my Metformin prescription. Can I get a refill?", time: "Today 8:30 AM", isPatient: true },
      { id: "m7", sender: "Dr. Michel", text: "Good morning Carlos! I'll send the refill to your pharmacy right away. Same pharmacy as usual?", time: "Today 9:00 AM", isPatient: false },
      { id: "m8", sender: "Carlos Mendez", text: "Yes, CVS on Main Street. Thank you!", time: "Today 9:15 AM", isPatient: true },
      { id: "m9", sender: "Carlos Mendez", text: "Can I get a refill on my prescription?", time: "Today 9:20 AM", isPatient: true },
    ],
  },
  {
    id: "t3",
    patient: "Robert Kim",
    lastMessage: "Sounds good, see you at 10 AM.",
    time: "3 hours ago",
    unread: 0,
    messages: [
      { id: "m10", sender: "Dr. Michel", text: "Hi Robert, just a reminder about your annual wellness exam tomorrow at 10 AM.", time: "Yesterday 4:00 PM", isPatient: false },
      { id: "m11", sender: "Robert Kim", text: "Thanks for the reminder! Should I fast for any blood work?", time: "Yesterday 5:30 PM", isPatient: true },
      { id: "m12", sender: "Dr. Michel", text: "Yes, please fast for 12 hours before. We'll do a comprehensive panel.", time: "Yesterday 6:00 PM", isPatient: false },
      { id: "m13", sender: "Robert Kim", text: "Sounds good, see you at 10 AM.", time: "Yesterday 6:15 PM", isPatient: true },
    ],
  },
];

// Coming-soon tabs
const COMING_SOON_TABS: TabId[] = [
  "intakes", "waitlist", "encounters", "prescriptions", "screenings",
  "payments", "coupons", "providers", "staff", "notifications",
  "practice-settings", "branding",
];

// ─── Helper Components ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string }> = {
    active: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" },
    confirmed: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" },
    paid: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" },
    paused: { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" },
    pending: { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" },
    open: { bg: "#e0e8f0", text: "#334e68", dot: "#486581" },
    cancelled: { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" },
    overdue: { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" },
  };
  const c = config[status] || config.active;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
      {status}
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    Essential: { bg: "#e0e8f0", text: "#334e68" },
    Complete: { bg: "#e6f7f2", text: "#147d64" },
    Premium: { bg: "#fffbeb", text: "#d97706" },
  };
  const c = config[plan] || config.Essential;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {plan}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  trend: string;
  trendColor?: string;
}) {
  return (
    <div className="glass rounded-xl p-5 hover-lift">
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "#e6f7f2" }}
        >
          <Icon className="w-5 h-5" style={{ color: "#147d64" }} />
        </div>
        <span className="text-xs font-medium" style={{ color: trendColor || "#27ab83" }}>
          {trend}
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function PracticePortal() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedThread, setSelectedThread] = useState(MOCK_THREADS[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");

  const practiceName = auth.user
    ? `${auth.user.firstName}'s Practice`
    : "My Practice";

  // Total members
  const totalMembers = MOCK_PLANS.reduce((s, p) => s + p.memberCount, 0);

  // ─── Sidebar ────────────────────────────────────────────────────────────

  function renderSidebar() {
    return (
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: "#102a43" }}
      >
        {/* Header */}
        <div className="p-5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#27ab83" }}
              >
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white truncate">{practiceName}</h2>
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs mt-0.5"
                  style={{ backgroundColor: "rgba(39,171,131,0.15)", color: "#27ab83" }}
                >
                  DPC Practice
                </span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p
                className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? "text-white" : "hover:text-white"
                      }`}
                      style={
                        isActive
                          ? { backgroundColor: "rgba(39,171,131,0.18)", color: "#ffffff" }
                          : { color: "rgba(255,255,255,0.55)" }
                      }
                    >
                      <item.icon className="w-4 h-4 shrink-0" style={isActive ? { color: "#27ab83" } : {}} />
                      {item.label}
                      {item.id === "messages" && (
                        <span
                          className="ml-auto text-xs rounded-full px-1.5 py-0.5 font-semibold"
                          style={{ backgroundColor: "#ef4444", color: "#ffffff" }}
                        >
                          3
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <UserSettingsDropdown variant="practice" />
        </div>
      </aside>
    );
  }

  // ─── Dashboard Tab ──────────────────────────────────────────────────────

  function renderDashboard() {
    return (
      <div className="space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Active Members" value="85" trend="+7 this month" />
          <StatCard icon={DollarSign} label="Monthly Revenue" value="$14,285" trend="+12% MoM" />
          <StatCard icon={Calendar} label="Appointments Today" value="8" trend="3 confirmed" trendColor="#334e68" />
          <StatCard icon={ClipboardList} label="Pending Intakes" value="4" trend="2 new today" trendColor="#d97706" />
        </div>

        {/* Plan Distribution */}
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Plan Distribution</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MOCK_PLANS.map((plan) => {
              const pct = Math.round((plan.memberCount / totalMembers) * 100);
              const planColors: Record<string, { accent: string; bg: string }> = {
                Essential: { accent: "#334e68", bg: "#e0e8f0" },
                Complete: { accent: "#147d64", bg: "#e6f7f2" },
                Premium: { accent: "#d97706", bg: "#fffbeb" },
              };
              const colors = planColors[plan.name] || planColors.Essential;
              return (
                <div key={plan.id} className="glass rounded-xl p-5 hover-lift">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-slate-800">{plan.name}</h4>
                    <span className="text-lg font-bold" style={{ color: colors.accent }}>
                      ${plan.monthlyPrice}
                      <span className="text-xs font-normal text-slate-400">/mo</span>
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-3">
                    {plan.memberCount} members
                  </p>
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: colors.bg }}>
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: colors.accent }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{pct}% of members</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Appointments + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Appointments */}
          <div className="lg:col-span-2">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Upcoming Appointments</h3>
            <div className="glass rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Time</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Patient</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Provider</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_DASHBOARD_APPOINTMENTS.map((apt) => (
                      <tr
                        key={apt.id}
                        className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-slate-700">{apt.time}</td>
                        <td className="px-4 py-3 text-slate-700">{apt.patient}</td>
                        <td className="px-4 py-3 text-slate-500">{apt.type}</td>
                        <td className="px-4 py-3 text-slate-500">{apt.provider}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={apt.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Activity */}
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Recent Activity</h3>
            <div className="glass rounded-xl p-4 space-y-3">
              {MOCK_ACTIVITY.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: "#e6f7f2" }}
                  >
                    <item.icon className="w-4 h-4" style={{ color: "#147d64" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 leading-snug">{item.text}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Patient Roster Tab ─────────────────────────────────────────────────

  function renderRoster() {
    const filtered = MOCK_PATIENTS.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.plan.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-800">Patient Roster</h2>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 bg-white"
                onFocus={(e) => (e.currentTarget.style.borderColor = "#27ab83")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "")}
              />
            </div>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors shrink-0"
              style={{ backgroundColor: "#27ab83" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
            >
              <Plus className="w-4 h-4" />
              Add Patient
            </button>
          </div>
        </div>

        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Plan</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Last Visit</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Next Apt</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((patient) => (
                  <tr
                    key={patient.id}
                    className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-slate-700">{patient.name}</td>
                    <td className="px-4 py-3">
                      <PlanBadge plan={patient.plan} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={patient.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{patient.phone}</td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{patient.email}</td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{patient.lastVisit}</td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{patient.nextApt}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No patients found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Membership Plans Tab ───────────────────────────────────────────────

  function renderPlans() {
    const planIcons: Record<string, React.ElementType> = {
      Essential: Heart,
      Complete: Star,
      Premium: Crown,
    };

    const planGradients: Record<string, { from: string; to: string; accent: string; light: string }> = {
      Essential: { from: "#334e68", to: "#486581", accent: "#334e68", light: "#e0e8f0" },
      Complete: { from: "#147d64", to: "#27ab83", accent: "#147d64", light: "#e6f7f2" },
      Premium: { from: "#d97706", to: "#f59e0b", accent: "#d97706", light: "#fffbeb" },
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Membership Plans</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {MOCK_PLANS.map((plan) => {
            const Icon = planIcons[plan.name] || Heart;
            const gradient = planGradients[plan.name] || planGradients.Essential;
            const revenue = plan.memberCount * plan.monthlyPrice;

            return (
              <div key={plan.id} className="glass rounded-2xl overflow-hidden hover-lift flex flex-col">
                {/* Header */}
                <div
                  className="p-5 text-white relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
                  }}
                >
                  <div className="absolute top-0 right-0 w-24 h-24 opacity-10">
                    <Icon className="w-24 h-24 -mt-4 -mr-4" />
                  </div>
                  <div className="relative">
                    {plan.badge && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mb-2"
                        style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#ffffff" }}
                      >
                        {plan.badge}
                      </span>
                    )}
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <div className="mt-2">
                      <span className="text-3xl font-bold">${plan.monthlyPrice}</span>
                      <span className="text-sm opacity-80">/month</span>
                    </div>
                    <p className="text-sm opacity-70 mt-1">
                      ${plan.annualPrice}/year (save {Math.round((1 - plan.annualPrice / (plan.monthlyPrice * 12)) * 100)}%)
                    </p>
                  </div>
                </div>

                {/* Entitlements */}
                <div className="p-5 flex-1">
                  <ul className="space-y-2.5">
                    {plan.entitlements.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                        <Check
                          className="w-4 h-4 shrink-0 mt-0.5"
                          style={{ color: gradient.accent }}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Footer */}
                <div className="px-5 pb-5 space-y-3">
                  <div
                    className="rounded-lg p-3 flex items-center justify-between"
                    style={{ backgroundColor: gradient.light }}
                  >
                    <div>
                      <p className="text-xs text-slate-500">Members</p>
                      <p className="text-lg font-bold" style={{ color: gradient.accent }}>
                        {plan.memberCount}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">MRR</p>
                      <p className="text-lg font-bold" style={{ color: gradient.accent }}>
                        ${revenue.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
                      style={{ borderColor: gradient.accent, color: gradient.accent }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = gradient.light;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "";
                      }}
                    >
                      Edit
                    </button>
                    <button className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                      Deactivate
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add Plan Card */}
          <div
            className="rounded-2xl flex flex-col items-center justify-center p-8 cursor-pointer transition-colors min-h-96"
            style={{
              border: "2px dashed #cbd5e1",
              backgroundColor: "transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#27ab83";
              e.currentTarget.style.backgroundColor = "rgba(39,171,131,0.03)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#cbd5e1";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "#e6f7f2" }}
            >
              <Plus className="w-7 h-7" style={{ color: "#27ab83" }} />
            </div>
            <p className="text-base font-semibold text-slate-600">Add New Plan</p>
            <p className="text-sm text-slate-400 mt-1 text-center">Create a membership tier</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Appointments Tab ───────────────────────────────────────────────────

  function renderAppointments() {
    const today = new Date();
    const dateStr = today.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return (
      <div className="space-y-4">
        {/* Day Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Appointments</h2>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <div className="px-4 py-2 rounded-lg glass text-sm font-medium text-slate-700">
              {dateStr}
            </div>
            <button className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden sm:table-cell">Plan</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Duration</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Provider</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_APPOINTMENTS.map((apt) => (
                  <tr
                    key={apt.id}
                    className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-slate-700">{apt.time}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700">{apt.patient}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <PlanBadge plan={apt.plan} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        {apt.type === "Telehealth" && <Video className="w-3.5 h-3.5" style={{ color: "#27ab83" }} />}
                        {apt.type}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{apt.duration}</td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{apt.provider}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={apt.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-slate-800">{MOCK_APPOINTMENTS.length}</p>
            <p className="text-xs text-slate-500 mt-1">Total</p>
          </div>
          <div className="glass rounded-lg p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: "#2f8132" }}>
              {MOCK_APPOINTMENTS.filter((a) => a.status === "confirmed").length}
            </p>
            <p className="text-xs text-slate-500 mt-1">Confirmed</p>
          </div>
          <div className="glass rounded-lg p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: "#d97706" }}>
              {MOCK_APPOINTMENTS.filter((a) => a.status === "pending").length}
            </p>
            <p className="text-xs text-slate-500 mt-1">Pending</p>
          </div>
          <div className="glass rounded-lg p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: "#27ab83" }}>
              {MOCK_APPOINTMENTS.filter((a) => a.type === "Telehealth").length}
            </p>
            <p className="text-xs text-slate-500 mt-1">Telehealth</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Messages Tab ───────────────────────────────────────────────────────

  function renderMessages() {
    const activeThread = MOCK_THREADS.find((t) => t.id === selectedThread) || MOCK_THREADS[0];

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Messages</h2>
        <div className="glass rounded-xl overflow-hidden flex" style={{ height: "600px" }}>
          {/* Thread List */}
          <div className="w-80 border-r border-slate-200 flex flex-col shrink-0 hidden sm:flex">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none bg-white"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {MOCK_THREADS.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThread(thread.id)}
                  className={`w-full text-left p-4 border-b border-slate-100 transition-colors ${
                    selectedThread === thread.id ? "bg-slate-50" : "hover:bg-slate-50"
                  }`}
                  style={
                    selectedThread === thread.id
                      ? { borderLeft: "3px solid #27ab83" }
                      : { borderLeft: "3px solid transparent" }
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-slate-800 truncate">
                          {thread.patient}
                        </p>
                        {thread.unread > 0 && (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: "#27ab83" }}
                          >
                            {thread.unread}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-1">{thread.lastMessage}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{thread.time}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Message View */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Thread header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                  style={{ backgroundColor: "#334e68" }}
                >
                  {activeThread.patient.split(" ").map((n) => n[0]).join("")}
                </div>
                <div>
                  <p className="font-medium text-sm text-slate-800">{activeThread.patient}</p>
                  <p className="text-xs text-slate-400">Member</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                  <Phone className="w-4 h-4" />
                </button>
                <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                  <Video className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeThread.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.isPatient ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className="max-w-xs lg:max-w-md rounded-2xl px-4 py-2.5"
                    style={
                      msg.isPatient
                        ? { backgroundColor: "#f1f5f9" }
                        : { backgroundColor: "#102a43", color: "#ffffff" }
                    }
                  >
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    <p
                      className="text-xs mt-1"
                      style={{ color: msg.isPatient ? "#94a3b8" : "rgba(255,255,255,0.5)" }}
                    >
                      {msg.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none bg-white"
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#27ab83")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "")}
                />
                <button
                  className="p-2.5 rounded-xl text-white transition-colors"
                  style={{ backgroundColor: "#27ab83" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Invoices Tab ───────────────────────────────────────────────────────

  function renderInvoices() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Invoices</h2>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "#27ab83" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
          >
            <Plus className="w-4 h-4" />
            New Invoice
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Total Invoiced</p>
            <p className="text-xl font-bold text-slate-800">
              ${MOCK_INVOICES.reduce((s, i) => s + i.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Paid</p>
            <p className="text-xl font-bold" style={{ color: "#2f8132" }}>
              ${MOCK_INVOICES.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Open</p>
            <p className="text-xl font-bold" style={{ color: "#334e68" }}>
              ${MOCK_INVOICES.filter((i) => i.status === "open").reduce((s, i) => s + i.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Overdue</p>
            <p className="text-xl font-bold" style={{ color: "#dc2626" }}>
              ${MOCK_INVOICES.filter((i) => i.status === "overdue").reduce((s, i) => s + i.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Invoice #</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden sm:table-cell">Plan</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_INVOICES.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-sm font-medium text-slate-700">{inv.id}</td>
                    <td className="px-4 py-3 text-slate-700">{inv.patient}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      ${inv.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <PlanBadge plan={inv.plan} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{inv.date}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
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

  // ─── Coming Soon Tab ────────────────────────────────────────────────────

  function renderComingSoon(tabId: TabId) {
    const item = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === tabId);
    const Icon = item?.icon || AlertCircle;
    const label = item?.label || tabId;

    return (
      <div className="flex items-center justify-center py-32">
        <div className="glass rounded-2xl p-12 text-center max-w-md">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: "#e6f7f2" }}
          >
            <Icon className="w-8 h-8" style={{ color: "#147d64" }} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">{label}</h2>
          <p className="text-slate-500">
            This feature is coming soon. We're building something great.
          </p>
          <button
            onClick={() => setActiveTab("dashboard")}
            className="mt-6 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "#27ab83" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ─── Tab Router ─────────────────────────────────────────────────────────

  function renderContent() {
    if (COMING_SOON_TABS.includes(activeTab)) return renderComingSoon(activeTab);

    switch (activeTab) {
      case "dashboard":
        return renderDashboard();
      case "roster":
        return renderRoster();
      case "plans":
        return renderPlans();
      case "appointments":
        return renderAppointments();
      case "messages":
        return renderMessages();
      case "invoices":
        return renderInvoices();
      default:
        return renderDashboard();
    }
  }

  // ─── Tab title for header ───────────────────────────────────────────────

  const activeLabel =
    NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === activeTab)?.label || "Dashboard";

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {renderSidebar()}

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Top Header */}
        <header className="sticky top-0 z-20 glass border-b border-slate-200">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-slate-800">{activeLabel}</h1>
                <p className="text-xs text-slate-400 hidden sm:block">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <HeaderToolbar variant="practice" onNavigate={(tab) => setActiveTab(tab as TabId)} />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6 lg:p-8">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
