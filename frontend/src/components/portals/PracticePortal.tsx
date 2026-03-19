// ===== Practice Portal =====
// Main dashboard for DPC practice owners/admins — manage membership practice
// Tabs: Dashboard, Patient Roster, Membership Plans, Appointments, Messages, Invoices, + Coming Soon tabs

import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { HeaderToolbar } from "../shared/HeaderToolbar";
import { UserSettingsDropdown } from "../shared/UserSettingsDropdown";
import { PracticeSettings } from "../settings/PracticeSettings";
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
  ArrowLeft,
  Download,
  ChevronDown,
  ChevronUp,
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

interface MockPatient {
  id: string;
  name: string;
  preferredName?: string;
  plan: string;
  planPrice?: number;
  status: "active" | "paused" | "cancelled";
  phone: string;
  email: string;
  lastVisit: string;
  nextApt: string;
  memberId?: string;
  memberSince?: string;
  dob?: string;
  gender?: string;
  pronouns?: string;
  language?: string;
  address?: string;
  maritalStatus?: string;
  employment?: string;
  ssnLast4?: string;
  emergencyContacts?: { name: string; relationship: string; phone: string }[];
  pharmacy?: { name: string; address: string; phone: string };
  diagnoses?: { code: string; description: string; type: "primary" | "secondary" }[];
  allergies?: { allergen: string; reaction: string; severity: "mild" | "moderate" | "severe" }[];
  medicalNotes?: string;
  referringProvider?: { name: string; npi: string; phone: string };
  medications?: { name: string; dosage: string; frequency: string; prescriber: string; status: "active" | "discontinued"; startDate: string }[];
  visitsUsed?: number;
  visitsTotal?: number;
  provider?: string;
}

const MOCK_PATIENTS: MockPatient[] = [
  {
    id: "pt1", name: "James Wilson", preferredName: "Jim", plan: "Complete", planPrice: 199, status: "active",
    phone: "(555) 100-2001", email: "james.w@email.com", lastVisit: "Mar 12, 2026", nextApt: "Mar 25, 2026",
    memberId: "MBR-JW2026", memberSince: "Jan 15, 2026", dob: "1988-06-15", gender: "Male", pronouns: "He/Him",
    language: "English", address: "4521 Lakewood Dr, Clermont, FL 34711",
    maritalStatus: "Married", employment: "Software Engineer — Remote", ssnLast4: "1234",
    emergencyContacts: [{ name: "Sarah Wilson", relationship: "Wife", phone: "(555) 100-3001" }],
    pharmacy: { name: "CVS Pharmacy", address: "1234 Main St, Clermont, FL 34711", phone: "(352) 555-0100" },
    diagnoses: [
      { code: "F32.1", description: "Major Depressive Disorder, single episode, moderate", type: "primary" },
      { code: "F41.1", description: "Generalized Anxiety Disorder", type: "primary" },
      { code: "F90.0", description: "Attention-Deficit Hyperactivity Disorder, predominantly inattentive", type: "secondary" },
    ],
    allergies: [{ allergen: "Penicillin", reaction: "Rash", severity: "moderate" }],
    medicalNotes: "Patient presents with comorbid depression and anxiety. Responding well to current SSRI regimen. ADHD managed with non-stimulant approach per patient preference. Regular follow-ups every 4 weeks. No substance use history. Family history of depression (mother). Sleep improving with trazodone discontinued and melatonin added.",
    referringProvider: { name: "Dr. Amanda Torres", npi: "1234567890", phone: "(352) 555-0200" },
    medications: [
      { name: "Sertraline", dosage: "100mg", frequency: "Daily", prescriber: "Dr. Michel", status: "active", startDate: "Jan 20, 2026" },
      { name: "Bupropion XL", dosage: "150mg", frequency: "Daily", prescriber: "Dr. Michel", status: "active", startDate: "Feb 5, 2026" },
      { name: "Hydroxyzine", dosage: "25mg", frequency: "As needed", prescriber: "Dr. Michel", status: "active", startDate: "Jan 20, 2026" },
      { name: "Trazodone", dosage: "50mg", frequency: "Bedtime", prescriber: "Dr. Michel", status: "discontinued", startDate: "Jan 20, 2026" },
      { name: "Melatonin", dosage: "5mg", frequency: "Bedtime", prescriber: "Dr. Michel", status: "active", startDate: "Feb 15, 2026" },
    ],
    visitsUsed: 1, visitsTotal: 2, provider: "Dr. Nageley Michel",
  },
  { id: "pt2", name: "Sarah Mitchell", plan: "Complete", planPrice: 199, status: "active", phone: "(555) 234-5678", email: "sarah.m@email.com", lastVisit: "Mar 15, 2026", nextApt: "Mar 22, 2026", memberId: "MBR-SM2026", memberSince: "Feb 1, 2026", visitsUsed: 2, visitsTotal: 4, provider: "Dr. Nageley Michel" },
  { id: "pt3", name: "James Rivera", plan: "Premium", planPrice: 299, status: "active", phone: "(555) 345-6789", email: "james.r@email.com", lastVisit: "Mar 14, 2026", nextApt: "Mar 20, 2026", memberId: "MBR-JR2026", memberSince: "Jan 10, 2026", visitsUsed: 3, visitsTotal: 999, provider: "Dr. Nageley Michel" },
  { id: "pt4", name: "Emily Chen", plan: "Essential", planPrice: 99, status: "active", phone: "(555) 456-7890", email: "emily.c@email.com", lastVisit: "Mar 10, 2026", nextApt: "Mar 25, 2026", memberId: "MBR-EC2026", memberSince: "Mar 1, 2026", visitsUsed: 1, visitsTotal: 2, provider: "Dr. Nageley Michel" },
  { id: "pt5", name: "Michael Thompson", plan: "Complete", planPrice: 199, status: "paused", phone: "(555) 567-8901", email: "michael.t@email.com", lastVisit: "Feb 28, 2026", nextApt: "—", memberId: "MBR-MT2026", memberSince: "Dec 15, 2025", visitsUsed: 0, visitsTotal: 4, provider: "Dr. Nageley Michel" },
  { id: "pt6", name: "Lisa Patel", plan: "Essential", planPrice: 99, status: "active", phone: "(555) 678-9012", email: "lisa.p@email.com", lastVisit: "Mar 12, 2026", nextApt: "Mar 26, 2026", memberId: "MBR-LP2026", memberSince: "Feb 20, 2026", visitsUsed: 1, visitsTotal: 2, provider: "NP Johnson" },
  { id: "pt7", name: "Robert Kim", plan: "Premium", planPrice: 299, status: "active", phone: "(555) 789-0123", email: "robert.k@email.com", lastVisit: "Mar 16, 2026", nextApt: "Mar 19, 2026", memberId: "MBR-RK2026", memberSince: "Nov 1, 2025", visitsUsed: 5, visitsTotal: 999, provider: "Dr. Nageley Michel" },
  { id: "pt8", name: "Angela Foster", plan: "Complete", planPrice: 199, status: "cancelled", phone: "(555) 890-1234", email: "angela.f@email.com", lastVisit: "Jan 15, 2026", nextApt: "—", memberId: "MBR-AF2026", memberSince: "Oct 1, 2025", visitsUsed: 0, visitsTotal: 4, provider: "Dr. Nageley Michel" },
  { id: "pt9", name: "David Nguyen", plan: "Essential", planPrice: 99, status: "active", phone: "(555) 901-2345", email: "david.n@email.com", lastVisit: "Mar 8, 2026", nextApt: "Mar 28, 2026", memberId: "MBR-DN2026", memberSince: "Jan 5, 2026", visitsUsed: 2, visitsTotal: 2, provider: "NP Johnson" },
  { id: "pt10", name: "Rachel Adams", plan: "Complete", planPrice: 199, status: "active", phone: "(555) 012-3456", email: "rachel.a@email.com", lastVisit: "Mar 17, 2026", nextApt: "Mar 24, 2026", memberId: "MBR-RA2026", memberSince: "Feb 10, 2026", visitsUsed: 3, visitsTotal: 4, provider: "Dr. Nageley Michel" },
  { id: "pt11", name: "Carlos Mendez", plan: "Premium", planPrice: 299, status: "active", phone: "(555) 123-4567", email: "carlos.m@email.com", lastVisit: "Mar 13, 2026", nextApt: "Mar 21, 2026", memberId: "MBR-CM2026", memberSince: "Dec 1, 2025", visitsUsed: 4, visitsTotal: 999, provider: "Dr. Nageley Michel" },
  { id: "pt12", name: "Jennifer Walsh", plan: "Essential", planPrice: 99, status: "paused", phone: "(555) 234-5670", email: "jen.w@email.com", lastVisit: "Feb 20, 2026", nextApt: "—", memberId: "MBR-JW2026b", memberSince: "Jan 25, 2026", visitsUsed: 0, visitsTotal: 2, provider: "NP Johnson" },
  { id: "pt13", name: "Thomas Lee", plan: "Complete", planPrice: 199, status: "active", phone: "(555) 345-6780", email: "thomas.l@email.com", lastVisit: "Mar 11, 2026", nextApt: "Mar 27, 2026", memberId: "MBR-TL2026", memberSince: "Feb 15, 2026", visitsUsed: 1, visitsTotal: 4, provider: "Dr. Nageley Michel" },
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
  const [selectedPatient, setSelectedPatient] = useState<MockPatient | null>(null);
  const [patientDetailTab, setPatientDetailTab] = useState("demographics");
  const [expandedEncounters, setExpandedEncounters] = useState<string[]>([]);

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
                        setSelectedPatient(null);
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
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setSelectedPatient(patient); setPatientDetailTab("demographics"); }}
                        className="font-medium hover:underline transition-colors"
                        style={{ color: "#334e68" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#27ab83")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#334e68")}
                      >
                        {patient.name}
                      </button>
                    </td>
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
                        <button
                          onClick={() => { setSelectedPatient(patient); setPatientDetailTab("demographics"); }}
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
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

  // ─── Patient Detail Page ────────────────────────────────────────────────

  function renderPatientDetail() {
    const pt = selectedPatient;
    if (!pt) return null;

    const detailTabs = [
      "demographics", "medical", "medications", "appointments",
      "encounters", "screenings", "billing", "documents", "messages",
    ];

    // Mock encounters for this patient
    const mockEncounters = [
      {
        id: "enc1", date: "Mar 12, 2026", type: "Med Management", provider: "Dr. Nageley Michel",
        chiefComplaint: "Follow-up for depression and anxiety management",
        signed: true,
        subjective: "Patient reports improved mood over the past 4 weeks. Sleep has stabilized with melatonin replacing trazodone. Anxiety remains situational, primarily work-related. PHQ-9 score improved from 14 to 9. Denies SI/HI. Appetite and energy improving.",
        objective: "MSE: Alert, oriented x4. Appearance: Well-groomed, appropriate dress. Behavior: Cooperative, good eye contact. Speech: Normal rate/rhythm/volume. Mood: 'Better.' Affect: Euthymic, reactive, congruent. Thought process: Linear, goal-directed. Thought content: No SI/HI, no delusions. Cognition: Intact. Insight/Judgment: Good/Good.",
        assessment: "F32.1 MDD — Improving, partial remission. F41.1 GAD — Stable, mild symptoms. Risk level: Low.",
        plan: "1. Continue Sertraline 100mg daily — effective, well-tolerated. 2. Continue Bupropion 150mg XL — augmentation benefit noted. 3. Trazodone discontinued — replaced with Melatonin 5mg QHS for sleep. 4. Hydroxyzine 25mg PRN anxiety — using 2-3x/week. 5. Follow-up in 4 weeks. 6. Continue therapy referral.",
      },
      {
        id: "enc2", date: "Feb 12, 2026", type: "Med Management", provider: "Dr. Nageley Michel",
        chiefComplaint: "Depression and anxiety follow-up, sleep difficulties",
        signed: true,
        subjective: "Patient reports moderate improvement since adding Bupropion. Energy levels better but sleep remains disrupted — trazodone causing morning grogginess. PHQ-9: 14 (down from 18). GAD-7: 12. Denies SI. Reports difficulty concentrating at work.",
        objective: "MSE: Alert, oriented x4. Mildly fatigued appearance. Cooperative. Speech normal. Mood: 'Getting there.' Affect: Slightly flat but reactive. Thought process: Linear. No SI/HI. Cognition: Mild inattention noted. Insight: Good.",
        assessment: "F32.1 MDD — Improving but residual symptoms. F41.1 GAD — Moderate. F90.0 ADHD — Contributing to concentration difficulties. Risk: Low.",
        plan: "1. Continue Sertraline 100mg. 2. Continue Bupropion 150mg XL. 3. Taper Trazodone — discontinue over 1 week. 4. Start Melatonin 5mg QHS for sleep. 5. Hydroxyzine 25mg PRN. 6. Discuss non-stimulant ADHD options at next visit. 7. F/U 4 weeks.",
      },
      {
        id: "enc3", date: "Jan 20, 2026", type: "Initial Evaluation", provider: "Dr. Nageley Michel",
        chiefComplaint: "New patient evaluation for depression and anxiety",
        signed: true,
        subjective: "35-year-old male presenting with 6-month history of worsening depressed mood, persistent anxiety, and difficulty concentrating. Reports low energy, poor sleep (initial insomnia), decreased motivation, and social withdrawal. PHQ-9: 18 (moderately severe). GAD-7: 15 (severe). Denies SI/HI. No prior psychiatric treatment. Family history: mother with MDD. No substance use. Remote work as software engineer — performance declining.",
        objective: "MSE: Alert, oriented x4. Appearance: Casually dressed, mild psychomotor retardation. Behavior: Cooperative but subdued. Speech: Slightly slowed. Mood: 'Overwhelmed and sad.' Affect: Constricted, tearful at times. Thought process: Linear but ruminative. No SI/HI, no psychosis. Cognition: Intact but reports poor concentration. Insight: Good. Judgment: Good.",
        assessment: "F32.1 Major Depressive Disorder, single episode, moderate. F41.1 Generalized Anxiety Disorder. F90.0 ADHD, predominantly inattentive type (by history, to reassess). Risk level: Low-moderate.",
        plan: "1. Start Sertraline 50mg daily x 1 week, then increase to 100mg daily. 2. Start Trazodone 50mg QHS for insomnia. 3. Hydroxyzine 25mg PRN for acute anxiety (max 3x/day). 4. Psychotherapy referral — CBT. 5. Lab work: CBC, CMP, TSH, lipid panel. 6. Follow-up in 3 weeks to assess tolerance and response.",
      },
    ];

    // Mock screening scores
    const phq9Scores = [
      { date: "Jan 20, 2026", score: 18, severity: "Moderately Severe" },
      { date: "Feb 12, 2026", score: 14, severity: "Moderate" },
      { date: "Mar 12, 2026", score: 9, severity: "Mild" },
      { date: "Apr 9, 2026", score: 7, severity: "Mild" },
    ];
    const gad7Scores = [
      { date: "Jan 20, 2026", score: 15, severity: "Severe" },
      { date: "Feb 12, 2026", score: 12, severity: "Moderate" },
      { date: "Mar 12, 2026", score: 8, severity: "Mild" },
      { date: "Apr 9, 2026", score: 6, severity: "Mild" },
    ];

    // Mock patient appointments
    const mockPtAppointments = {
      upcoming: [
        { id: "pa1", date: "Mar 25, 2026", time: "2:00 PM", type: "Med Management", provider: "Dr. Nageley Michel", telehealth: true },
      ],
      past: [
        { id: "pa2", date: "Mar 12, 2026", type: "Med Management", provider: "Dr. Nageley Michel", duration: "30 min", status: "completed" as const, notes: true },
        { id: "pa3", date: "Feb 12, 2026", type: "Med Management", provider: "Dr. Nageley Michel", duration: "30 min", status: "completed" as const, notes: true },
        { id: "pa4", date: "Jan 20, 2026", type: "Initial Evaluation", provider: "Dr. Nageley Michel", duration: "60 min", status: "completed" as const, notes: true },
        { id: "pa5", date: "Feb 26, 2026", type: "Therapy", provider: "Dr. Nageley Michel", duration: "45 min", status: "cancelled" as const, notes: false },
        { id: "pa6", date: "Mar 5, 2026", type: "Lab Review", provider: "NP Johnson", duration: "15 min", status: "completed" as const, notes: true },
        { id: "pa7", date: "Jan 28, 2026", type: "Lab Work", provider: "NP Johnson", duration: "15 min", status: "completed" as const, notes: false },
      ],
    };

    // Mock invoices for this patient
    const mockPtInvoices = [
      { id: "INV-1050", date: "Mar 15, 2026", amount: 199.00, status: "paid" as const, description: "Complete Plan — March 2026" },
      { id: "INV-1038", date: "Feb 15, 2026", amount: 199.00, status: "paid" as const, description: "Complete Plan — February 2026" },
      { id: "INV-1025", date: "Jan 15, 2026", amount: 199.00, status: "paid" as const, description: "Complete Plan — January 2026" },
      { id: "INV-1026", date: "Jan 20, 2026", amount: 75.00, status: "paid" as const, description: "Initial Evaluation Copay" },
      { id: "INV-1030", date: "Jan 28, 2026", amount: 25.00, status: "paid" as const, description: "Lab Work — CBC Panel" },
      { id: "INV-1045", date: "Mar 10, 2026", amount: 15.00, status: "open" as const, description: "Lab Results Review" },
    ];

    // Mock documents
    const mockDocuments = [
      { id: "d1", name: "Intake Form", type: "PDF", date: "Jan 15, 2026", status: "uploaded" },
      { id: "d2", name: "HIPAA Consent", type: "PDF", date: "Jan 15, 2026", status: "signed" },
      { id: "d3", name: "Treatment Consent", type: "PDF", date: "Jan 15, 2026", status: "signed" },
      { id: "d4", name: "Lab Results — CBC Panel", type: "PDF", date: "Jan 30, 2026", status: "uploaded" },
      { id: "d5", name: "Provider Letter", type: "PDF", date: "Mar 15, 2026", status: "generated" },
    ];

    // Mock messages for this patient
    const mockPtMessages = [
      { id: "pm1", sender: "James Wilson", text: "Hi Dr. Michel, I wanted to let you know the melatonin is working much better than the trazodone for sleep. No more morning grogginess.", time: "Mar 14, 2026 9:15 AM", isPatient: true },
      { id: "pm2", sender: "Dr. Michel", text: "Great to hear, James! That's exactly what we were hoping for. How's your mood been overall this past week?", time: "Mar 14, 2026 10:30 AM", isPatient: false },
      { id: "pm3", sender: "James Wilson", text: "Definitely better. I've been more productive at work and my wife noticed I'm more engaged at home. Still some anxious days but the hydroxyzine helps.", time: "Mar 14, 2026 11:00 AM", isPatient: true },
      { id: "pm4", sender: "Dr. Michel", text: "That's wonderful progress. We'll review everything in detail at your appointment on the 25th. Keep up with the therapy sessions too.", time: "Mar 14, 2026 2:00 PM", isPatient: false },
      { id: "pm5", sender: "James Wilson", text: "Will do. Thanks, Dr. Michel!", time: "Mar 14, 2026 2:15 PM", isPatient: true },
      { id: "pm6", sender: "James Wilson", text: "Quick question — is it okay to take the hydroxyzine and melatonin on the same night?", time: "Mar 17, 2026 8:00 PM", isPatient: true },
    ];

    // PHQ-9 questions for screening detail
    const phq9Questions = [
      { q: "Little interest or pleasure in doing things", a: 1 },
      { q: "Feeling down, depressed, or hopeless", a: 1 },
      { q: "Trouble falling or staying asleep, or sleeping too much", a: 1 },
      { q: "Feeling tired or having little energy", a: 1 },
      { q: "Poor appetite or overeating", a: 0 },
      { q: "Feeling bad about yourself", a: 1 },
      { q: "Trouble concentrating on things", a: 1 },
      { q: "Moving or speaking slowly / being fidgety", a: 0 },
      { q: "Thoughts that you would be better off dead", a: 0 },
    ];
    const phq9Labels = ["Not at all", "Several days", "More than half the days", "Nearly every day"];

    const severityColor = (sev: string) => {
      if (sev === "Mild") return { bg: "#fffbeb", text: "#d97706" };
      if (sev === "Moderate") return { bg: "#fef2f2", text: "#dc2626" };
      if (sev === "Moderately Severe" || sev === "Severe") return { bg: "#fef2f2", text: "#dc2626" };
      return { bg: "#ecf9ec", text: "#2f8132" };
    };

    const toggleEncounter = (id: string) => {
      setExpandedEncounters((prev) =>
        prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
      );
    };

    // Progress ring SVG helper
    const ProgressRing = ({ used, total }: { used: number; total: number }) => {
      const isUnlimited = total >= 999;
      const pct = isUnlimited ? 100 : total > 0 ? (used / total) * 100 : 0;
      const r = 20;
      const circ = 2 * Math.PI * r;
      const offset = circ - (pct / 100) * circ;
      return (
        <svg width="52" height="52" className="shrink-0">
          <circle cx="26" cy="26" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
          <circle
            cx="26" cy="26" r={r} fill="none" strokeWidth="4"
            stroke="#27ab83"
            strokeDasharray={`${circ}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 26 26)"
          />
          <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#334e68">
            {isUnlimited ? "\u221E" : `${used}/${total}`}
          </text>
        </svg>
      );
    };

    return (
      <div className="space-y-6">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <button
            onClick={() => setSelectedPatient(null)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">
                {pt.name}
                {pt.preferredName && (
                  <span className="text-lg font-normal text-slate-400 ml-2">({pt.preferredName})</span>
                )}
              </h1>
              <PlanBadge plan={pt.plan} />
              <StatusBadge status={pt.status} />
            </div>
            {pt.memberSince && (
              <p className="text-sm text-slate-400 mt-1">Member since {pt.memberSince}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: "#27ab83" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
            >
              <Send className="w-4 h-4" /> Send Message
            </button>
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: "#334e68", color: "#334e68" }}
            >
              <Calendar className="w-4 h-4" /> Book Appointment
            </button>
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <Download className="w-4 h-4" /> Download Records
            </button>
          </div>
        </div>

        {/* ── Quick Stats ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Member ID</p>
            <p className="text-sm font-bold font-mono text-slate-800">{pt.memberId || "—"}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Plan</p>
            <p className="text-sm font-bold text-slate-800">
              {pt.plan} {pt.planPrice ? `($${pt.planPrice}/mo)` : ""}
            </p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Visits Used</p>
            <div className="flex items-center gap-2">
              {pt.visitsUsed !== undefined && pt.visitsTotal !== undefined && (
                <ProgressRing used={pt.visitsUsed} total={pt.visitsTotal} />
              )}
              <span className="text-sm font-bold text-slate-800">
                {pt.visitsTotal && pt.visitsTotal >= 999
                  ? `${pt.visitsUsed || 0} used`
                  : `${pt.visitsUsed || 0} of ${pt.visitsTotal || 0}`}
              </span>
            </div>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Next Appointment</p>
            <p className="text-sm font-bold text-slate-800">{pt.nextApt === "—" ? "None scheduled" : pt.nextApt}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Last Visit</p>
            <p className="text-sm font-bold text-slate-800">{pt.lastVisit}</p>
          </div>
        </div>

        {/* ── Detail Tab Bar ──────────────────────────────────────────── */}
        <div className="border-b border-slate-200 overflow-x-auto">
          <div className="flex gap-0 min-w-max">
            {detailTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setPatientDetailTab(tab)}
                className="px-4 py-2.5 text-sm font-medium capitalize transition-colors whitespace-nowrap"
                style={
                  patientDetailTab === tab
                    ? { color: "#27ab83", borderBottom: "2px solid #27ab83" }
                    : { color: "#64748b", borderBottom: "2px solid transparent" }
                }
                onMouseEnter={(e) => {
                  if (patientDetailTab !== tab) e.currentTarget.style.color = "#334e68";
                }}
                onMouseLeave={(e) => {
                  if (patientDetailTab !== tab) e.currentTarget.style.color = "#64748b";
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* ── Sub-tab Content ─────────────────────────────────────────── */}

        {/* Demographics */}
        {patientDetailTab === "demographics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left column */}
              <div className="glass rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-slate-800">Personal Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-slate-400 text-xs">Full Name</p><p className="text-slate-700 font-medium">{pt.name}</p></div>
                  <div><p className="text-slate-400 text-xs">Date of Birth</p><p className="text-slate-700 font-medium">{pt.dob || "—"}</p></div>
                  <div><p className="text-slate-400 text-xs">Gender</p><p className="text-slate-700 font-medium">{pt.gender || "—"}</p></div>
                  <div><p className="text-slate-400 text-xs">Pronouns</p><p className="text-slate-700 font-medium">{pt.pronouns || "—"}</p></div>
                  <div><p className="text-slate-400 text-xs">Phone</p><p className="text-slate-700 font-medium">{pt.phone}</p></div>
                  <div><p className="text-slate-400 text-xs">Email</p><p className="text-slate-700 font-medium">{pt.email}</p></div>
                  <div><p className="text-slate-400 text-xs">Language</p><p className="text-slate-700 font-medium">{pt.language || "English"}</p></div>
                </div>
              </div>
              {/* Right column */}
              <div className="glass rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-slate-800">Address & Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="col-span-2"><p className="text-slate-400 text-xs">Address</p><p className="text-slate-700 font-medium">{pt.address || "—"}</p></div>
                  <div><p className="text-slate-400 text-xs">Marital Status</p><p className="text-slate-700 font-medium">{pt.maritalStatus || "—"}</p></div>
                  <div><p className="text-slate-400 text-xs">Employment</p><p className="text-slate-700 font-medium">{pt.employment || "—"}</p></div>
                  <div><p className="text-slate-400 text-xs">SSN</p><p className="text-slate-700 font-medium font-mono">{pt.ssnLast4 ? `****-**-${pt.ssnLast4}` : "—"}</p></div>
                </div>
              </div>
            </div>

            {/* Emergency Contacts */}
            <div className="glass rounded-xl p-6">
              <h3 className="font-semibold text-slate-800 mb-4">Emergency Contacts</h3>
              {pt.emergencyContacts && pt.emergencyContacts.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                      <th className="text-left px-4 py-2 font-medium text-slate-500">Name</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-500">Relationship</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-500">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pt.emergencyContacts.map((ec, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-700">{ec.name}</td>
                        <td className="px-4 py-2 text-slate-500">{ec.relationship}</td>
                        <td className="px-4 py-2 text-slate-500">{ec.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-slate-400">No emergency contacts on file.</p>
              )}
            </div>

            {/* Pharmacy */}
            <div className="glass rounded-xl p-6">
              <h3 className="font-semibold text-slate-800 mb-3">Pharmacy</h3>
              {pt.pharmacy ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-slate-400 text-xs">Name</p><p className="text-slate-700 font-medium">{pt.pharmacy.name}</p></div>
                  <div><p className="text-slate-400 text-xs">Address</p><p className="text-slate-700 font-medium">{pt.pharmacy.address}</p></div>
                  <div><p className="text-slate-400 text-xs">Phone</p><p className="text-slate-700 font-medium">{pt.pharmacy.phone}</p></div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">No pharmacy on file.</p>
              )}
            </div>
          </div>
        )}

        {/* Medical */}
        {patientDetailTab === "medical" && (
          <div className="space-y-6">
            {/* Diagnoses */}
            <div className="glass rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Diagnoses</h3>
                <button
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                  style={{ backgroundColor: "#27ab83" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Diagnosis
                </button>
              </div>
              {pt.diagnoses && pt.diagnoses.length > 0 ? (
                <div className="space-y-3">
                  {pt.diagnoses.filter(d => d.type === "primary").length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Primary</p>
                      <div className="space-y-2">
                        {pt.diagnoses.filter(d => d.type === "primary").map((dx, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold" style={{ backgroundColor: "#e6f7f2", color: "#147d64" }}>{dx.code}</span>
                            <span className="text-sm text-slate-700">{dx.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {pt.diagnoses.filter(d => d.type === "secondary").length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-4">Secondary</p>
                      <div className="space-y-2">
                        {pt.diagnoses.filter(d => d.type === "secondary").map((dx, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold" style={{ backgroundColor: "#e0e8f0", color: "#334e68" }}>{dx.code}</span>
                            <span className="text-sm text-slate-700">{dx.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No diagnoses recorded.</p>
              )}
            </div>

            {/* Allergies */}
            <div className="glass rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Allergies</h3>
                <button
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                  style={{ backgroundColor: "#27ab83" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Allergy
                </button>
              </div>
              {pt.allergies && pt.allergies.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                      <th className="text-left px-4 py-2 font-medium text-slate-500">Allergen</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-500">Reaction</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-500">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pt.allergies.map((al, i) => {
                      const sevColors: Record<string, { bg: string; text: string }> = {
                        mild: { bg: "#fffbeb", text: "#d97706" },
                        moderate: { bg: "#fef2f2", text: "#dc2626" },
                        severe: { bg: "#fef2f2", text: "#991b1b" },
                      };
                      const sc = sevColors[al.severity] || sevColors.mild;
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-4 py-2 font-medium text-slate-700">{al.allergen}</td>
                          <td className="px-4 py-2 text-slate-500">{al.reaction}</td>
                          <td className="px-4 py-2">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize" style={{ backgroundColor: sc.bg, color: sc.text }}>{al.severity}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-slate-400">No known allergies.</p>
              )}
            </div>

            {/* Medical History Notes */}
            <div className="glass rounded-xl p-6">
              <h3 className="font-semibold text-slate-800 mb-3">Medical History Notes</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{pt.medicalNotes || "No medical history notes."}</p>
            </div>

            {/* Referring Provider */}
            <div className="glass rounded-xl p-6">
              <h3 className="font-semibold text-slate-800 mb-3">Referring Provider</h3>
              {pt.referringProvider ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-slate-400 text-xs">Name</p><p className="text-slate-700 font-medium">{pt.referringProvider.name}</p></div>
                  <div><p className="text-slate-400 text-xs">NPI</p><p className="text-slate-700 font-medium font-mono">{pt.referringProvider.npi}</p></div>
                  <div><p className="text-slate-400 text-xs">Phone</p><p className="text-slate-700 font-medium">{pt.referringProvider.phone}</p></div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">No referring provider on file.</p>
              )}
            </div>
          </div>
        )}

        {/* Medications */}
        {patientDetailTab === "medications" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Current Medications</h3>
              <button
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                style={{ backgroundColor: "#27ab83" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
              >
                <Plus className="w-3.5 h-3.5" /> Add Medication
              </button>
            </div>
            <div className="glass rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Medication</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Dosage</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Frequency</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Prescriber</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Start Date</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pt.medications || []).map((med, i) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700">{med.name}</td>
                        <td className="px-4 py-3 text-slate-600">{med.dosage}</td>
                        <td className="px-4 py-3 text-slate-500">{med.frequency}</td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{med.prescriber}</td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                            style={med.status === "active" ? { backgroundColor: "#ecf9ec", color: "#2f8132" } : { backgroundColor: "#f1f5f9", color: "#64748b" }}
                          >
                            {med.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{med.startDate}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {med.status === "active" && (
                              <>
                                <button className="px-2 py-1 rounded text-xs font-medium" style={{ color: "#27ab83" }}>Refill</button>
                                <button className="px-2 py-1 rounded text-xs font-medium text-slate-400">Discontinue</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(!pt.medications || pt.medications.length === 0) && (
                <div className="py-8 text-center text-slate-400 text-sm">No medications on file.</div>
              )}
            </div>
          </div>
        )}

        {/* Appointments */}
        {patientDetailTab === "appointments" && (
          <div className="space-y-6">
            {/* Upcoming */}
            <div>
              <h3 className="font-semibold text-slate-800 mb-3">Upcoming Appointments</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {mockPtAppointments.upcoming.map((apt) => (
                  <div key={apt.id} className="glass rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-slate-800">{apt.date}</p>
                        <p className="text-sm text-slate-500">{apt.time}</p>
                      </div>
                      {apt.telehealth && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: "#e6f7f2", color: "#147d64" }}>
                          <Video className="w-3 h-3" /> Telehealth
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mb-1">{apt.type}</p>
                    <p className="text-xs text-slate-400">{apt.provider}</p>
                    <button className="mt-3 px-3 py-1 rounded text-xs font-medium" style={{ color: "#dc2626" }}>Cancel</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Past */}
            <div>
              <h3 className="font-semibold text-slate-800 mb-3">Past Appointments</h3>
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Date</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Type</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Provider</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Duration</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockPtAppointments.past.map((apt) => (
                        <tr key={apt.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700">{apt.date}</td>
                          <td className="px-4 py-3 text-slate-600">{apt.type}</td>
                          <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{apt.provider}</td>
                          <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{apt.duration}</td>
                          <td className="px-4 py-3"><StatusBadge status={apt.status} /></td>
                          <td className="px-4 py-3">
                            {apt.notes ? (
                              <button className="text-xs font-medium" style={{ color: "#27ab83" }}>View Notes</button>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Encounters */}
        {patientDetailTab === "encounters" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800">Visit Notes (SOAP)</h3>
            {mockEncounters.map((enc) => {
              const isExpanded = expandedEncounters.includes(enc.id);
              const typeBg: Record<string, { bg: string; text: string }> = {
                "Initial Evaluation": { bg: "#e6f7f2", text: "#147d64" },
                "Med Management": { bg: "#e0e8f0", text: "#334e68" },
                "Therapy": { bg: "#fffbeb", text: "#d97706" },
              };
              const tb = typeBg[enc.type] || typeBg["Med Management"];
              return (
                <div key={enc.id} className="glass rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleEncounter(enc.id)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium text-slate-700">{enc.date}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: tb.bg, color: tb.text }}>{enc.type}</span>
                      <span className="text-sm text-slate-500">{enc.provider}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${enc.signed ? "" : ""}`} style={enc.signed ? { backgroundColor: "#ecf9ec", color: "#2f8132" } : { backgroundColor: "#fffbeb", color: "#d97706" }}>
                        {enc.signed ? "Signed" : "Draft"}
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
                      {enc.chiefComplaint && (
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Chief Complaint</p>
                          <p className="text-sm text-slate-600">{enc.chiefComplaint}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#27ab83" }}>S — Subjective</p>
                        <p className="text-sm text-slate-600 leading-relaxed">{enc.subjective}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#334e68" }}>O — Objective</p>
                        <p className="text-sm text-slate-600 leading-relaxed">{enc.objective}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#d97706" }}>A — Assessment</p>
                        <p className="text-sm text-slate-600 leading-relaxed">{enc.assessment}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#147d64" }}>P — Plan</p>
                        <p className="text-sm text-slate-600 leading-relaxed">{enc.plan}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Screenings */}
        {patientDetailTab === "screenings" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Screening Score History</h3>
              <button
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                style={{ backgroundColor: "#27ab83" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                onClick={() => alert("Coming soon")}
              >
                <Plus className="w-3.5 h-3.5" /> Administer Screening
              </button>
            </div>

            {/* PHQ-9 Trend */}
            <div className="glass rounded-xl p-6">
              <h4 className="font-semibold text-slate-700 mb-4">PHQ-9 — Patient Health Questionnaire</h4>
              <div className="flex items-end gap-3 mb-4" style={{ height: "120px" }}>
                {phq9Scores.map((s, i) => {
                  const maxScore = 27;
                  const heightPct = (s.score / maxScore) * 100;
                  const sc = severityColor(s.severity);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-bold text-slate-700">{s.score}</span>
                      <div className="w-full flex items-end" style={{ height: "80px" }}>
                        <div
                          className="w-full rounded-t-md transition-all duration-500"
                          style={{ height: `${heightPct}%`, backgroundColor: sc.text, opacity: 0.7 }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 text-center leading-tight">{s.date.split(",")[0].replace("2026", "").trim()}</span>
                      <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>{s.severity}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* GAD-7 Trend */}
            <div className="glass rounded-xl p-6">
              <h4 className="font-semibold text-slate-700 mb-4">GAD-7 — Generalized Anxiety Disorder</h4>
              <div className="flex items-end gap-3 mb-4" style={{ height: "120px" }}>
                {gad7Scores.map((s, i) => {
                  const maxScore = 21;
                  const heightPct = (s.score / maxScore) * 100;
                  const sc = severityColor(s.severity);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-bold text-slate-700">{s.score}</span>
                      <div className="w-full flex items-end" style={{ height: "80px" }}>
                        <div
                          className="w-full rounded-t-md transition-all duration-500"
                          style={{ height: `${heightPct}%`, backgroundColor: sc.text, opacity: 0.7 }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 text-center leading-tight">{s.date.split(",")[0].replace("2026", "").trim()}</span>
                      <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>{s.severity}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Most Recent PHQ-9 Detail */}
            <div className="glass rounded-xl p-6">
              <h4 className="font-semibold text-slate-700 mb-1">Most Recent PHQ-9 Detail</h4>
              <p className="text-xs text-slate-400 mb-4">Administered {phq9Scores[phq9Scores.length - 1].date} — Score: {phq9Scores[phq9Scores.length - 1].score}/27</p>
              <div className="space-y-3">
                {phq9Questions.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: "rgba(16,42,67,0.02)" }}>
                    <span className="text-xs font-bold text-slate-400 mt-0.5 shrink-0 w-5">{i + 1}.</span>
                    <div className="flex-1">
                      <p className="text-sm text-slate-700 mb-1">{item.q}</p>
                      <div className="flex gap-2 flex-wrap">
                        {phq9Labels.map((label, li) => (
                          <span
                            key={li}
                            className="px-2 py-0.5 rounded-full text-xs"
                            style={
                              li === item.a
                                ? { backgroundColor: "#102a43", color: "#ffffff", fontWeight: 600 }
                                : { backgroundColor: "#f1f5f9", color: "#94a3b8" }
                            }
                          >
                            {label} ({li})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Billing */}
        {patientDetailTab === "billing" && (
          <div className="space-y-6">
            {/* Membership Card */}
            <div className="glass rounded-xl p-6">
              <h3 className="font-semibold text-slate-800 mb-4">Membership</h3>
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <div
                  className="rounded-xl p-5 flex-1"
                  style={{ background: "linear-gradient(135deg, #147d64, #27ab83)" }}
                >
                  <p className="text-white text-sm opacity-80">Current Plan</p>
                  <p className="text-white text-xl font-bold mt-1">{pt.plan} Plan</p>
                  <p className="text-white text-lg font-semibold mt-2">${pt.planPrice || 199}/mo</p>
                  <p className="text-white text-xs opacity-70 mt-2">Next billing: Mar 25, 2026</p>
                  <p className="text-white text-xs opacity-70">Visa ending 4242</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={{ borderColor: "#27ab83", color: "#27ab83" }}
                  >
                    Change Plan
                  </button>
                  <button className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                    Update Payment
                  </button>
                </div>
              </div>
            </div>

            {/* Invoice History */}
            <div className="glass rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Invoice History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Invoice #</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Amount</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Description</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockPtInvoices.map((inv) => (
                      <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-sm font-medium text-slate-700">{inv.id}</td>
                        <td className="px-4 py-3 text-slate-500">{inv.date}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">${inv.amount.toFixed(2)}</td>
                        <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{inv.description}</td>
                        <td className="px-4 py-3">
                          <button className="p-1 rounded hover:bg-slate-100 text-slate-400 transition-colors">
                            <Download className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Methods */}
            <div className="glass rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Payment Methods</h3>
                <button
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                  style={{ backgroundColor: "#27ab83" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Payment Method
                </button>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-lg border border-slate-200">
                <CreditCard className="w-8 h-8 text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">Visa ending in 4242</p>
                  <p className="text-xs text-slate-400">Expires 08/2028</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: "#e6f7f2", color: "#147d64" }}>Default</span>
              </div>
            </div>
          </div>
        )}

        {/* Documents */}
        {patientDetailTab === "documents" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800">Documents</h3>
            <div className="glass rounded-xl divide-y divide-slate-100">
              {mockDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#e0e8f0" }}>
                      <FileText className="w-4 h-4" style={{ color: "#334e68" }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">{doc.name}</p>
                      <p className="text-xs text-slate-400 capitalize">{doc.status} — {doc.date}</p>
                    </div>
                  </div>
                  <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {patientDetailTab === "messages" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800">Messages with {pt.name}</h3>
            <div className="glass rounded-xl overflow-hidden flex flex-col" style={{ height: "500px" }}>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {mockPtMessages.map((msg) => (
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
                      <p className="text-xs font-medium mb-1" style={{ color: msg.isPatient ? "#334e68" : "rgba(255,255,255,0.7)" }}>{msg.sender}</p>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      <p className="text-xs mt-1" style={{ color: msg.isPatient ? "#94a3b8" : "rgba(255,255,255,0.5)" }}>{msg.time}</p>
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
        )}
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
    if (selectedPatient) return renderPatientDetail();
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
      case "practice-settings":
        return <PracticeSettings />;
      case "branding":
        return <PracticeSettings initialTab="branding" />;
      default:
        return renderDashboard();
    }
  }

  // ─── Tab title for header ───────────────────────────────────────────────

  const activeLabel = selectedPatient
    ? `Patient: ${selectedPatient.name}`
    : NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === activeTab)?.label || "Dashboard";

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
