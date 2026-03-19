// ===== Patient Portal =====
// Member-facing portal — what patients see when they log into their DPC membership
// Premium health app feel (One Medical / Forward inspired)
// Mobile-first: top header + bottom nav (no sidebar)

import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  Home,
  Calendar,
  MessageSquare,
  Heart,
  User,
  Bell,
  LogOut,
  Settings,
  ChevronRight,
  Send,
  Paperclip,
  Video,
  Clock,
  Check,
  CheckCircle,
  FileText,
  Download,
  Pill,
  Phone,
  MapPin,
  Mail,
  CreditCard,
  Shield,
  Star,
  X,
  ChevronDown,
  AlertCircle,
  Activity,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = "home" | "appointments" | "messages" | "health" | "account";

interface Appointment {
  id: string;
  date: string;
  time: string;
  provider: string;
  type: string;
  status: "upcoming" | "completed" | "cancelled";
  isVideo: boolean;
  chiefComplaint?: string;
  assessment?: string;
  plan?: string;
  followUp?: string;
  diagnoses?: string;
}

interface Message {
  id: string;
  text: string;
  sender: "patient" | "provider";
  timestamp: string;
}

interface MessageThread {
  id: string;
  providerName: string;
  providerRole: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  messages: Message[];
}

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  prescriber: string;
  status: "active" | "discontinued";
}

interface ScreeningScore {
  date: string;
  score: number;
  severity: "minimal" | "mild" | "moderate" | "severe";
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  navy900: "#102a43",
  navy800: "#243b53",
  navy700: "#334e68",
  navy600: "#486581",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal400: "#3ebd93",
  gold: "#e9b949",
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  slate700: "#334155",
  red500: "#ef4444",
  red50: "#fef2f2",
  green500: "#22c55e",
  green50: "#f0fdf4",
  orange500: "#f97316",
  orange50: "#fff7ed",
  yellow500: "#eab308",
  yellow50: "#fefce8",
};

// ─── Mock Data ───────────────────────────────────────────────────────────────

const PATIENT = {
  firstName: "James",
  lastName: "Wilson",
  email: "james.wilson@email.com",
  phone: "(443) 555-0187",
  dob: "1988-06-15",
  address: "2847 Lakewood Drive, Baltimore, MD 21224",
  memberId: "MBR-284719",
  memberSince: "2025-09-12",
  planName: "Complete Plan",
  planPrice: 199,
  billingFrequency: "monthly",
  nextPaymentDate: "2026-04-12",
  paymentMethod: "Visa ending in 4242",
  provider: "Dr. Nageley Michel, DNP, PMHNP",
  emergencyContact: {
    name: "Sarah Wilson",
    relationship: "Spouse",
    phone: "(443) 555-0192",
  },
  pharmacy: {
    name: "CVS Pharmacy #4821",
    address: "1200 Eastern Blvd, Baltimore, MD 21221",
    phone: "(410) 555-0234",
  },
};

const UPCOMING_APPOINTMENTS: Appointment[] = [
  {
    id: "apt-1",
    date: "2026-03-22",
    time: "10:00 AM",
    provider: "Dr. Nageley Michel, DNP, PMHNP",
    type: "Follow-up - Medication Management",
    status: "upcoming",
    isVideo: true,
  },
  {
    id: "apt-2",
    date: "2026-04-05",
    time: "2:30 PM",
    provider: "Dr. Nageley Michel, DNP, PMHNP",
    type: "Monthly Check-in",
    status: "upcoming",
    isVideo: false,
  },
  {
    id: "apt-3",
    date: "2026-04-19",
    time: "11:00 AM",
    provider: "Dr. Nageley Michel, DNP, PMHNP",
    type: "PHQ-9 / GAD-7 Screening",
    status: "upcoming",
    isVideo: true,
  },
];

const PAST_APPOINTMENTS: Appointment[] = [
  {
    id: "apt-p1",
    date: "2026-03-08",
    time: "10:00 AM",
    provider: "Dr. Nageley Michel, DNP, PMHNP",
    type: "Follow-up",
    status: "completed",
    isVideo: true,
    chiefComplaint: "Follow-up for medication adjustment. Reports improved mood stability.",
    assessment: "PHQ-9: 7 (mild). GAD-7: 6 (mild). Patient showing consistent improvement. Sleep quality much better with current regimen.",
    plan: "Continue Sertraline 100mg, Bupropion 150mg XL. Reduce Hydroxyzine to PRN only. Maintain Melatonin 5mg QHS.",
    followUp: "4 weeks",
    diagnoses: "F32.1, F41.1, F90.0",
  },
  {
    id: "apt-p2",
    date: "2026-02-08",
    time: "2:00 PM",
    provider: "Dr. Nageley Michel, DNP, PMHNP",
    type: "Medication Management",
    status: "completed",
    isVideo: false,
    chiefComplaint: "Reports decreased anxiety but still some trouble concentrating. Appetite improved.",
    assessment: "PHQ-9: 9 (mild). GAD-7: 8 (mild). Significant improvement from baseline. ADHD symptoms partially managed.",
    plan: "Increase Bupropion to 150mg XL. Continue Sertraline 100mg. Hydroxyzine 25mg PRN for breakthrough anxiety.",
    followUp: "4 weeks",
    diagnoses: "F32.1, F41.1, F90.0",
  },
  {
    id: "apt-p3",
    date: "2026-01-11",
    time: "10:30 AM",
    provider: "Dr. Nageley Michel, DNP, PMHNP",
    type: "Follow-up",
    status: "completed",
    isVideo: true,
    chiefComplaint: "Mood improving since last visit. Less rumination. Still some generalized worry.",
    assessment: "PHQ-9: 14 (moderate). GAD-7: 12 (moderate). Trending improvement. Side effects minimal.",
    plan: "Continue current medications. Added Melatonin 5mg QHS for sleep onset. Refer to therapy.",
    followUp: "4 weeks",
    diagnoses: "F32.1, F41.1",
  },
  {
    id: "apt-p4",
    date: "2025-12-14",
    time: "3:00 PM",
    provider: "Dr. Nageley Michel, DNP, PMHNP",
    type: "New Patient Intake",
    status: "completed",
    isVideo: false,
    chiefComplaint: "Persistent low mood x 6 months, difficulty concentrating, excessive worry, poor sleep.",
    assessment: "PHQ-9: 18 (moderately severe). GAD-7: 15 (severe). History consistent with MDD, GAD, and possible ADHD.",
    plan: "Start Sertraline 50mg, titrate to 100mg in 2 weeks. Hydroxyzine 25mg PRN for acute anxiety. Safety plan discussed.",
    followUp: "2 weeks for medication check",
    diagnoses: "F32.1, F41.1, F90.0",
  },
  {
    id: "apt-p5",
    date: "2025-11-30",
    time: "1:00 PM",
    provider: "Care Team",
    type: "Initial Screening Call",
    status: "completed",
    isVideo: true,
    chiefComplaint: "New member screening and intake assessment.",
    assessment: "Patient appropriate for psychiatric services. Scheduled comprehensive intake.",
    plan: "Schedule intake appointment with Dr. Michel.",
    followUp: "Schedule intake",
    diagnoses: "—",
  },
];

const MESSAGE_THREADS: MessageThread[] = [
  {
    id: "thread-1",
    providerName: "Dr. Nageley Michel",
    providerRole: "DNP, PMHNP",
    lastMessage: "Your lab results look great. We'll review at your next visit.",
    timestamp: "2h ago",
    unread: true,
    messages: [
      {
        id: "m1",
        text: "Hi Dr. Michel, I got my bloodwork done yesterday at LabCorp. Should I expect results soon?",
        sender: "patient",
        timestamp: "Yesterday, 3:15 PM",
      },
      {
        id: "m2",
        text: "Hi James! Yes, I typically receive LabCorp results within 24-48 hours. I'll review them as soon as they come in.",
        sender: "provider",
        timestamp: "Yesterday, 4:02 PM",
      },
      {
        id: "m3",
        text: "Thank you! Also, I've been sleeping much better since starting the melatonin. The Sertraline side effects have mostly subsided too.",
        sender: "patient",
        timestamp: "Yesterday, 4:10 PM",
      },
      {
        id: "m4",
        text: "That's wonderful to hear! The adaptation period for Sertraline is usually 2-4 weeks, so it sounds like you're right on track. Keep up the melatonin at the same time each night.",
        sender: "provider",
        timestamp: "Yesterday, 4:25 PM",
      },
      {
        id: "m5",
        text: "Your lab results look great. We'll review at your next visit.",
        sender: "provider",
        timestamp: "Today, 9:30 AM",
      },
    ],
  },
  {
    id: "thread-2",
    providerName: "Care Team",
    providerRole: "MemberMD Support",
    lastMessage: "Your appointment on March 22 has been confirmed.",
    timestamp: "1d ago",
    unread: false,
    messages: [
      {
        id: "m6",
        text: "Hi James, this is a reminder that your follow-up appointment with Dr. Michel is scheduled for March 22 at 10:00 AM via telehealth.",
        sender: "provider",
        timestamp: "Mar 16, 10:00 AM",
      },
      {
        id: "m7",
        text: "Thank you! I'll be there. Do I need to do anything to prepare?",
        sender: "patient",
        timestamp: "Mar 16, 10:15 AM",
      },
      {
        id: "m8",
        text: "Just make sure you have a stable internet connection and a quiet space. You'll receive a video link 15 minutes before. If you have any medication questions, jot them down beforehand!",
        sender: "provider",
        timestamp: "Mar 16, 10:30 AM",
      },
      {
        id: "m9",
        text: "Your appointment on March 22 has been confirmed.",
        sender: "provider",
        timestamp: "Mar 17, 9:00 AM",
      },
    ],
  },
];

const MEDICATIONS: Medication[] = [
  {
    id: "med-1",
    name: "Sertraline",
    dosage: "100mg",
    frequency: "Once daily (morning)",
    prescriber: "Dr. Nageley Michel",
    status: "active",
  },
  {
    id: "med-2",
    name: "Bupropion XL",
    dosage: "150mg",
    frequency: "Once daily (morning)",
    prescriber: "Dr. Nageley Michel",
    status: "active",
  },
  {
    id: "med-3",
    name: "Hydroxyzine",
    dosage: "25mg",
    frequency: "As needed (PRN) for anxiety",
    prescriber: "Dr. Nageley Michel",
    status: "active",
  },
  {
    id: "med-4",
    name: "Melatonin",
    dosage: "5mg",
    frequency: "Nightly at bedtime (QHS)",
    prescriber: "Dr. Nageley Michel",
    status: "active",
  },
];

const PHQ9_SCORES: ScreeningScore[] = [
  { date: "2025-12-14", score: 18, severity: "severe" },
  { date: "2026-01-11", score: 14, severity: "moderate" },
  { date: "2026-02-08", score: 9, severity: "mild" },
  { date: "2026-03-08", score: 7, severity: "mild" },
];

const GAD7_SCORES: ScreeningScore[] = [
  { date: "2025-12-14", score: 15, severity: "severe" },
  { date: "2026-01-11", score: 12, severity: "moderate" },
  { date: "2026-02-08", score: 8, severity: "mild" },
  { date: "2026-03-08", score: 6, severity: "mild" },
];

const DIAGNOSES = [
  { code: "F32.1", name: "Major Depressive Disorder, recurrent, moderate", since: "2025-12-14" },
  { code: "F41.1", name: "Generalized Anxiety Disorder", since: "2025-12-14" },
  { code: "F90.0", name: "Attention-Deficit Hyperactivity Disorder, predominantly inattentive", since: "2025-12-14" },
];

const DOCUMENTS = [
  { id: "doc-1", name: "Intake Assessment Form", date: "2025-12-14", type: "PDF" },
  { id: "doc-2", name: "Consent for Treatment", date: "2025-11-30", type: "PDF" },
  { id: "doc-3", name: "Lab Results - Metabolic Panel", date: "2026-03-16", type: "PDF" },
  { id: "doc-4", name: "Treatment Plan Summary", date: "2026-03-08", type: "PDF" },
];

// ─── Helper Components ───────────────────────────────────────────────────────

function CircularProgress({ used, total, label }: { used: number; total: number; label: string }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = (used / total) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={radius} fill="none" stroke={COLORS.slate200} strokeWidth="4" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={COLORS.teal500}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color: COLORS.navy800 }}>
            {used}/{total}
          </span>
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color: COLORS.slate500 }}>{label}</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: ScreeningScore["severity"] }) {
  const config = {
    minimal: { bg: COLORS.green50, text: COLORS.green500, label: "Minimal" },
    mild: { bg: COLORS.yellow50, text: COLORS.yellow500, label: "Mild" },
    moderate: { bg: COLORS.orange50, text: COLORS.orange500, label: "Moderate" },
    severe: { bg: COLORS.red50, text: COLORS.red500, label: "Severe" },
  };
  const c = config[severity];
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PatientPortal() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [notifPrefs, setNotifPrefs] = useState({
    appointments: true,
    billing: true,
    messages: true,
    marketing: false,
  });

  const firstName = user?.firstName || PATIENT.firstName;
  const lastName = user?.lastName || PATIENT.lastName;
  const initials = `${firstName[0]}${lastName[0]}`;

  const desktopNavItems: { id: TabId; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "appointments", label: "Appointments" },
    { id: "messages", label: "Messages" },
    { id: "health", label: "Health Records" },
    { id: "account", label: "My Account" },
  ];

  const mobileNavItems: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "home", label: "Home", icon: Home },
    { id: "appointments", label: "Appts", icon: Calendar },
    { id: "messages", label: "Messages", icon: MessageSquare },
    { id: "health", label: "Health", icon: Heart },
    { id: "account", label: "Account", icon: User },
  ];

  const unreadCount = MESSAGE_THREADS.filter((t) => t.unread).length;

  // ─── Header ──────────────────────────────────────────────────────────────

  const renderHeader = () => (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        backgroundColor: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: COLORS.slate200,
      }}
    >
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${COLORS.navy800}, ${COLORS.teal500})` }}
          >
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold" style={{ color: COLORS.navy800 }}>
            MemberMD
          </span>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {desktopNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className="px-3 py-2 text-sm font-medium rounded-lg transition-colors relative"
              style={{
                color: activeTab === item.id ? COLORS.teal600 : COLORS.slate500,
              }}
            >
              {item.label}
              {activeTab === item.id && (
                <div
                  className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                  style={{ backgroundColor: COLORS.teal500 }}
                />
              )}
            </button>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}
              className="relative p-2 rounded-full transition-colors hover:bg-slate-100"
            >
              <Bell className="w-5 h-5" style={{ color: COLORS.slate500 }} />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1 right-1 w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold"
                  style={{ backgroundColor: COLORS.red500, fontSize: "10px" }}
                >
                  {unreadCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <div
                className="absolute right-0 top-12 w-72 rounded-xl shadow-xl border p-3 z-50"
                style={{ backgroundColor: COLORS.white, borderColor: COLORS.slate200 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>Notifications</span>
                  <button onClick={() => setShowNotifications(false)}>
                    <X className="w-4 h-4" style={{ color: COLORS.slate400 }} />
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.slate50 }}>
                    <p className="text-xs font-medium" style={{ color: COLORS.navy800 }}>New lab results available</p>
                    <p className="text-xs" style={{ color: COLORS.slate400 }}>2 hours ago</p>
                  </div>
                  <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.slate50 }}>
                    <p className="text-xs font-medium" style={{ color: COLORS.navy800 }}>Appointment reminder: Mar 22</p>
                    <p className="text-xs" style={{ color: COLORS.slate400 }}>1 day ago</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User avatar + dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white transition-transform hover:scale-105"
              style={{ background: `linear-gradient(135deg, ${COLORS.navy700}, ${COLORS.teal500})` }}
            >
              {initials}
            </button>
            {showUserMenu && (
              <div
                className="absolute right-0 top-12 w-48 rounded-xl shadow-xl border py-1 z-50"
                style={{ backgroundColor: COLORS.white, borderColor: COLORS.slate200 }}
              >
                <button
                  onClick={() => { setActiveTab("account"); setShowUserMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                  style={{ color: COLORS.slate600 }}
                >
                  <User className="w-4 h-4" /> Profile
                </button>
                <button
                  onClick={() => { setActiveTab("account"); setShowUserMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                  style={{ color: COLORS.slate600 }}
                >
                  <Settings className="w-4 h-4" /> Settings
                </button>
                <hr style={{ borderColor: COLORS.slate200 }} />
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 flex items-center gap-2"
                  style={{ color: COLORS.red500 }}
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );

  // ─── Bottom Mobile Nav ─────────────────────────────────────────────────

  const renderMobileNav = () => (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t"
      style={{
        backgroundColor: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderColor: COLORS.slate200,
      }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
            >
              <div className="relative">
                <Icon
                  className="w-5 h-5 transition-colors"
                  style={{ color: isActive ? COLORS.teal500 : COLORS.slate400 }}
                />
                {item.id === "messages" && unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS.red500 }}
                  />
                )}
              </div>
              <span
                className="text-xs font-medium transition-colors"
                style={{ color: isActive ? COLORS.teal500 : COLORS.slate400 }}
              >
                {item.label}
              </span>
              {isActive && (
                <div
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{ backgroundColor: COLORS.teal500 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );

  // ─── Home Tab ──────────────────────────────────────────────────────────

  const renderHome = () => (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: COLORS.navy800 }}>
          Welcome back, {firstName}
        </h1>
        <p className="text-sm mt-1" style={{ color: COLORS.slate500 }}>
          Here&apos;s your health summary
        </p>
      </div>

      {/* Membership Card */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 shadow-xl"
        style={{
          background: `linear-gradient(135deg, ${COLORS.navy900} 0%, ${COLORS.navy700} 40%, ${COLORS.teal600} 100%)`,
          minHeight: "200px",
        }}
      >
        {/* Watermark */}
        <div className="absolute top-4 right-4 opacity-10">
          <Shield className="w-20 h-20 text-white" />
        </div>
        {/* Decorative circles */}
        <div
          className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full opacity-10"
          style={{ backgroundColor: COLORS.teal400 }}
        />
        <div
          className="absolute -top-6 -left-6 w-24 h-24 rounded-full opacity-5"
          style={{ backgroundColor: COLORS.white }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-white text-lg font-bold tracking-wide">MemberMD</span>
          </div>
          <h2 className="text-white text-xl font-bold mb-1">
            {firstName} {lastName}
          </h2>
          <div className="flex items-center gap-2 mb-4">
            <span
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
              style={{ backgroundColor: "rgba(233,185,73,0.2)", color: COLORS.gold }}
            >
              <Star className="w-3 h-3" />
              {PATIENT.planName}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wider">Member Since</p>
              <p className="text-white font-medium">{formatDate(PATIENT.memberSince)}</p>
            </div>
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wider">Member ID</p>
              <p className="text-white font-medium">{PATIENT.memberId}</p>
            </div>
            <div className="col-span-2">
              <p className="text-white/50 text-xs uppercase tracking-wider">Provider</p>
              <p className="text-white font-medium">{PATIENT.provider}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Benefits Tracker */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold mb-4" style={{ color: COLORS.navy800 }}>
          Your Benefits
        </h3>
        <div className="grid grid-cols-4 gap-2">
          <CircularProgress used={1} total={2} label="Visits" />
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: COLORS.green50 }}
            >
              <CheckCircle className="w-6 h-6" style={{ color: COLORS.green500 }} />
            </div>
            <span className="text-xs font-medium text-center" style={{ color: COLORS.slate500 }}>Telehealth</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: COLORS.slate50 }}
            >
              <Clock className="w-5 h-5" style={{ color: COLORS.teal500 }} />
            </div>
            <span className="text-xs font-medium text-center" style={{ color: COLORS.slate500 }}>4hr Reply</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: COLORS.green50 }}
            >
              <Phone className="w-5 h-5" style={{ color: COLORS.green500 }} />
            </div>
            <span className="text-xs font-medium text-center" style={{ color: COLORS.slate500 }}>24/7 Crisis</span>
          </div>
        </div>
        <div
          className="mt-4 pt-3 border-t flex items-center justify-between text-xs"
          style={{ borderColor: COLORS.slate200 }}
        >
          <span style={{ color: COLORS.slate500 }}>
            Next renewal: {formatDate(PATIENT.nextPaymentDate)}
          </span>
          <span className="font-semibold" style={{ color: COLORS.navy800 }}>
            ${PATIENT.planPrice}/mo
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Calendar, label: "Book Appointment", color: COLORS.teal500, bg: COLORS.teal500, textWhite: true },
          { icon: MessageSquare, label: "Send Message", color: COLORS.navy700, bg: COLORS.slate100, textWhite: false },
          { icon: Pill, label: "Request Refill", color: COLORS.navy700, bg: COLORS.slate100, textWhite: false },
          { icon: FileText, label: "View Records", color: COLORS.navy700, bg: COLORS.slate100, textWhite: false },
        ].map((action, i) => {
          const Icon = action.icon;
          return (
            <button
              key={i}
              onClick={() => {
                if (action.label === "Book Appointment") setActiveTab("appointments");
                else if (action.label === "Send Message") setActiveTab("messages");
                else if (action.label === "Request Refill") setActiveTab("health");
                else if (action.label === "View Records") setActiveTab("health");
              }}
              className="glass rounded-xl p-4 flex flex-col items-center gap-2 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              style={{
                backgroundColor: action.textWhite ? action.bg : action.bg,
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: action.textWhite ? "rgba(255,255,255,0.2)" : COLORS.white,
                }}
              >
                <Icon
                  className="w-5 h-5"
                  style={{ color: action.textWhite ? COLORS.white : action.color }}
                />
              </div>
              <span
                className="text-sm font-medium"
                style={{ color: action.textWhite ? COLORS.white : COLORS.navy800 }}
              >
                {action.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Upcoming Appointments */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Upcoming Appointments
          </h3>
          <button
            onClick={() => setActiveTab("appointments")}
            className="text-xs font-medium flex items-center gap-1"
            style={{ color: COLORS.teal500 }}
          >
            View all <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-3">
          {UPCOMING_APPOINTMENTS.slice(0, 2).map((apt) => (
            <div
              key={apt.id}
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ backgroundColor: COLORS.slate50 }}
            >
              <div
                className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0"
                style={{ backgroundColor: COLORS.white }}
              >
                <span className="text-xs font-bold" style={{ color: COLORS.teal500 }}>
                  {new Date(apt.date).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                </span>
                <span className="text-lg font-bold leading-none" style={{ color: COLORS.navy800 }}>
                  {new Date(apt.date).getDate()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: COLORS.navy800 }}>
                  {apt.type}
                </p>
                <p className="text-xs" style={{ color: COLORS.slate500 }}>
                  {apt.time} &middot; {apt.provider.split(",")[0]}
                </p>
              </div>
              {apt.isVideo ? (
                <button
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1"
                  style={{ backgroundColor: COLORS.teal500 }}
                >
                  <Video className="w-3 h-3" /> Join
                </button>
              ) : (
                <button
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{ color: COLORS.teal600, borderColor: COLORS.teal500 }}
                >
                  Details
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setActiveTab("appointments")}
          className="w-full mt-3 py-2 text-sm font-medium rounded-lg transition-colors hover:bg-slate-50"
          style={{ color: COLORS.teal500 }}
        >
          + Book New Appointment
        </button>
      </div>

      {/* Recent Messages */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Recent Messages
          </h3>
          <button
            onClick={() => setActiveTab("messages")}
            className="text-xs font-medium flex items-center gap-1"
            style={{ color: COLORS.teal500 }}
          >
            View all <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-2">
          {MESSAGE_THREADS.map((thread) => (
            <button
              key={thread.id}
              onClick={() => {
                setActiveTab("messages");
                setActiveThread(thread.id);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors hover:bg-slate-50"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${COLORS.navy700}, ${COLORS.teal500})` }}
              >
                {thread.providerName[0]}
                {thread.providerName.split(" ")[1]?.[0] || ""}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate" style={{ color: COLORS.navy800 }}>
                    {thread.providerName}
                  </span>
                  <span className="text-xs shrink-0" style={{ color: COLORS.slate400 }}>
                    {thread.timestamp}
                  </span>
                </div>
                <p className="text-xs truncate" style={{ color: COLORS.slate500 }}>
                  {thread.lastMessage}
                </p>
              </div>
              {thread.unread && (
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS.teal500 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── Appointments Tab ──────────────────────────────────────────────────

  const renderAppointments = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: COLORS.navy800 }}>
          Appointments
        </h1>
        <button
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5"
          style={{ backgroundColor: COLORS.teal500 }}
        >
          + Book Appointment
        </button>
      </div>

      {/* Upcoming */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: COLORS.slate500 }}>
          UPCOMING
        </h2>
        <div className="space-y-3">
          {UPCOMING_APPOINTMENTS.map((apt) => (
            <div key={apt.id} className="glass rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0"
                  style={{ backgroundColor: COLORS.slate50 }}
                >
                  <span className="text-xs font-bold" style={{ color: COLORS.teal500 }}>
                    {new Date(apt.date).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                  </span>
                  <span className="text-xl font-bold leading-none" style={{ color: COLORS.navy800 }}>
                    {new Date(apt.date).getDate()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
                    {apt.type}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: COLORS.slate500 }}>
                    {apt.time} &middot; {apt.provider.split(",")[0]}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {apt.isVideo ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: COLORS.green50, color: COLORS.green500 }}
                      >
                        <Video className="w-3 h-3" /> Telehealth
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: COLORS.slate100, color: COLORS.slate500 }}
                      >
                        <MapPin className="w-3 h-3" /> In-Office
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t" style={{ borderColor: COLORS.slate200 }}>
                {apt.isVideo && (
                  <button
                    className="flex-1 py-2 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-1"
                    style={{ backgroundColor: COLORS.teal500 }}
                  >
                    <Video className="w-4 h-4" /> Join Video Call
                  </button>
                )}
                <button
                  className="flex-1 py-2 rounded-lg text-sm font-medium border"
                  style={{ borderColor: COLORS.slate300, color: COLORS.slate600 }}
                >
                  Reschedule
                </button>
                <button
                  className="py-2 px-3 rounded-lg text-sm font-medium"
                  style={{ color: COLORS.red500 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Past Visits */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: COLORS.slate500 }}>
          PAST VISITS
        </h2>
        <div className="space-y-2">
          {PAST_APPOINTMENTS.map((apt) => (
            <div key={apt.id} className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedVisit(expandedVisit === apt.id ? null : apt.id)}
                className="w-full p-4 flex items-center gap-3 text-left"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: COLORS.slate50 }}
                >
                  <Check className="w-4 h-4" style={{ color: COLORS.green500 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: COLORS.navy800 }}>
                    {apt.type}
                  </p>
                  <p className="text-xs" style={{ color: COLORS.slate500 }}>
                    {formatDate(apt.date)} &middot; {apt.provider.split(",")[0]}
                  </p>
                </div>
                <ChevronDown
                  className="w-4 h-4 shrink-0 transition-transform"
                  style={{
                    color: COLORS.slate400,
                    transform: expandedVisit === apt.id ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
              {expandedVisit === apt.id && (
                <div
                  className="px-4 pb-4 space-y-3 border-t"
                  style={{ borderColor: COLORS.slate100 }}
                >
                  <div className="pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: COLORS.slate400 }}>
                      Chief Complaint
                    </p>
                    <p className="text-sm" style={{ color: COLORS.slate600 }}>{apt.chiefComplaint}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: COLORS.slate400 }}>
                      Assessment
                    </p>
                    <p className="text-sm" style={{ color: COLORS.slate600 }}>{apt.assessment}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: COLORS.slate400 }}>
                      Plan
                    </p>
                    <p className="text-sm" style={{ color: COLORS.slate600 }}>{apt.plan}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: COLORS.slate400 }}>
                        Follow-up
                      </p>
                      <p className="text-sm" style={{ color: COLORS.slate600 }}>{apt.followUp}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: COLORS.slate400 }}>
                        Diagnoses
                      </p>
                      <p className="text-sm font-mono" style={{ color: COLORS.slate600 }}>{apt.diagnoses}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── Messages Tab ──────────────────────────────────────────────────────

  const selectedThread = MESSAGE_THREADS.find((t) => t.id === activeThread);

  const renderMessages = () => (
    <div className="space-y-0">
      {!activeThread ? (
        /* Thread List */
        <div>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold" style={{ color: COLORS.navy800 }}>
              Messages
            </h1>
            <button
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: COLORS.teal500 }}
            >
              + New Message
            </button>
          </div>
          <div className="space-y-2">
            {MESSAGE_THREADS.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setActiveThread(thread.id)}
                className="w-full glass rounded-xl p-4 flex items-center gap-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${COLORS.navy700}, ${COLORS.teal500})` }}
                >
                  {thread.providerName[0]}
                  {thread.providerName.split(" ")[1]?.[0] || ""}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
                      {thread.providerName}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: COLORS.slate400 }}>
                      {thread.timestamp}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: COLORS.slate400 }}>
                    {thread.providerRole}
                  </p>
                  <p className="text-sm truncate mt-1" style={{ color: COLORS.slate500 }}>
                    {thread.lastMessage}
                  </p>
                </div>
                {thread.unread && (
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS.teal500 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Conversation View */
        <div className="flex flex-col" style={{ height: "calc(100vh - 180px)" }}>
          {/* Conversation Header */}
          <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: COLORS.slate200 }}>
            <button
              onClick={() => setActiveThread(null)}
              className="p-1 rounded-lg hover:bg-slate-100"
            >
              <ChevronRight className="w-5 h-5 rotate-180" style={{ color: COLORS.slate500 }} />
            </button>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${COLORS.navy700}, ${COLORS.teal500})` }}
            >
              {selectedThread?.providerName[0]}
              {selectedThread?.providerName.split(" ")[1]?.[0] || ""}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
                {selectedThread?.providerName}
              </p>
              <p className="text-xs" style={{ color: COLORS.slate400 }}>
                {selectedThread?.providerRole}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {selectedThread?.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === "patient" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-xs lg:max-w-md px-4 py-2.5"
                  style={{
                    backgroundColor: msg.sender === "patient" ? COLORS.teal500 : COLORS.slate100,
                    color: msg.sender === "patient" ? COLORS.white : COLORS.slate700,
                    borderRadius:
                      msg.sender === "patient"
                        ? "16px 16px 4px 16px"
                        : "16px 16px 16px 4px",
                  }}
                >
                  <p className="text-sm">{msg.text}</p>
                  <p
                    className="text-xs mt-1"
                    style={{
                      color: msg.sender === "patient" ? "rgba(255,255,255,0.6)" : COLORS.slate400,
                    }}
                  >
                    {msg.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Message Input */}
          <div
            className="pt-3 border-t flex items-center gap-2"
            style={{ borderColor: COLORS.slate200 }}
          >
            <button className="p-2 rounded-full hover:bg-slate-100">
              <Paperclip className="w-5 h-5" style={{ color: COLORS.slate400 }} />
            </button>
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-sm outline-none"
              style={{ color: COLORS.navy800 }}
            />
            <button
              className="p-2.5 rounded-full text-white"
              style={{ backgroundColor: COLORS.teal500 }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Health Records Tab ────────────────────────────────────────────────

  const renderHealth = () => (
    <div className="space-y-6">
      <h1 className="text-xl font-bold" style={{ color: COLORS.navy800 }}>
        Health Records
      </h1>

      {/* Active Medications */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Pill className="w-4 h-4" style={{ color: COLORS.teal500 }} />
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Active Medications
          </h3>
        </div>
        <div className="space-y-3">
          {MEDICATIONS.map((med) => (
            <div
              key={med.id}
              className="rounded-xl p-3 border-l-4 flex items-center justify-between"
              style={{
                backgroundColor: COLORS.slate50,
                borderLeftColor: COLORS.teal500,
              }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
                  {med.name} {med.dosage}
                </p>
                <p className="text-xs mt-0.5" style={{ color: COLORS.slate500 }}>
                  {med.frequency}
                </p>
                <p className="text-xs" style={{ color: COLORS.slate400 }}>
                  Prescribed by {med.prescriber}
                </p>
              </div>
              <button
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                style={{ borderColor: COLORS.teal500, color: COLORS.teal600 }}
              >
                Refill
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Screening History */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4" style={{ color: COLORS.teal500 }} />
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Screening History
          </h3>
        </div>

        {/* PHQ-9 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: COLORS.slate600 }}>
              PHQ-9 (Depression)
            </span>
            <span className="text-xs" style={{ color: COLORS.slate400 }}>
              Range: 0-27
            </span>
          </div>
          <div className="space-y-2">
            {PHQ9_SCORES.map((score, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 rounded-lg"
                style={{ backgroundColor: COLORS.slate50 }}
              >
                <span className="text-xs w-20 shrink-0" style={{ color: COLORS.slate500 }}>
                  {formatDate(score.date)}
                </span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.slate200 }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(score.score / 27) * 100}%`,
                      backgroundColor:
                        score.severity === "severe" ? COLORS.red500
                        : score.severity === "moderate" ? COLORS.orange500
                        : score.severity === "mild" ? COLORS.yellow500
                        : COLORS.green500,
                    }}
                  />
                </div>
                <span className="text-sm font-bold w-6 text-right" style={{ color: COLORS.navy800 }}>
                  {score.score}
                </span>
                <SeverityBadge severity={score.severity} />
              </div>
            ))}
          </div>
        </div>

        {/* GAD-7 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: COLORS.slate600 }}>
              GAD-7 (Anxiety)
            </span>
            <span className="text-xs" style={{ color: COLORS.slate400 }}>
              Range: 0-21
            </span>
          </div>
          <div className="space-y-2">
            {GAD7_SCORES.map((score, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 rounded-lg"
                style={{ backgroundColor: COLORS.slate50 }}
              >
                <span className="text-xs w-20 shrink-0" style={{ color: COLORS.slate500 }}>
                  {formatDate(score.date)}
                </span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.slate200 }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(score.score / 21) * 100}%`,
                      backgroundColor:
                        score.severity === "severe" ? COLORS.red500
                        : score.severity === "moderate" ? COLORS.orange500
                        : score.severity === "mild" ? COLORS.yellow500
                        : COLORS.green500,
                    }}
                  />
                </div>
                <span className="text-sm font-bold w-6 text-right" style={{ color: COLORS.navy800 }}>
                  {score.score}
                </span>
                <SeverityBadge severity={score.severity} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Diagnoses */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4" style={{ color: COLORS.teal500 }} />
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Current Diagnoses
          </h3>
        </div>
        <div className="space-y-2">
          {DIAGNOSES.map((dx, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{ backgroundColor: COLORS.slate50 }}
            >
              <span
                className="shrink-0 px-2 py-0.5 rounded text-xs font-mono font-bold"
                style={{ backgroundColor: COLORS.navy800, color: COLORS.white }}
              >
                {dx.code}
              </span>
              <div>
                <p className="text-sm font-medium" style={{ color: COLORS.navy800 }}>
                  {dx.name}
                </p>
                <p className="text-xs" style={{ color: COLORS.slate400 }}>
                  Since {formatDate(dx.since)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Documents */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4" style={{ color: COLORS.teal500 }} />
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Documents
          </h3>
        </div>
        <div className="space-y-2">
          {DOCUMENTS.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: COLORS.slate100 }}
                >
                  <FileText className="w-4 h-4" style={{ color: COLORS.slate500 }} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: COLORS.navy800 }}>
                    {doc.name}
                  </p>
                  <p className="text-xs" style={{ color: COLORS.slate400 }}>
                    {formatDate(doc.date)} &middot; {doc.type}
                  </p>
                </div>
              </div>
              <button className="p-2 rounded-lg hover:bg-slate-100">
                <Download className="w-4 h-4" style={{ color: COLORS.teal500 }} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── Account Tab ───────────────────────────────────────────────────────

  const renderAccount = () => (
    <div className="space-y-6">
      <h1 className="text-xl font-bold" style={{ color: COLORS.navy800 }}>
        My Account
      </h1>

      {/* Personal Info */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Personal Information
          </h3>
          <button className="text-xs font-semibold" style={{ color: COLORS.teal500 }}>
            Edit
          </button>
        </div>
        <div className="space-y-3">
          {[
            { icon: User, label: "Name", value: `${PATIENT.firstName} ${PATIENT.lastName}` },
            { icon: Calendar, label: "Date of Birth", value: formatDate(PATIENT.dob) },
            { icon: Phone, label: "Phone", value: PATIENT.phone },
            { icon: Mail, label: "Email", value: PATIENT.email },
            { icon: MapPin, label: "Address", value: PATIENT.address },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="flex items-start gap-3">
                <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: COLORS.slate400 }} />
                <div>
                  <p className="text-xs" style={{ color: COLORS.slate400 }}>{item.label}</p>
                  <p className="text-sm font-medium" style={{ color: COLORS.navy800 }}>{item.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Membership */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold mb-4" style={{ color: COLORS.navy800 }}>
          My Membership
        </h3>
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: `linear-gradient(135deg, ${COLORS.navy800}, ${COLORS.teal600})` }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold">{PATIENT.planName}</span>
                <Star className="w-4 h-4" style={{ color: COLORS.gold }} />
              </div>
              <p className="text-white/60 text-xs mt-1">
                Billed {PATIENT.billingFrequency}
              </p>
            </div>
            <span className="text-white text-2xl font-bold">${PATIENT.planPrice}</span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: COLORS.slate500 }}>Next Payment</span>
            <span className="font-medium" style={{ color: COLORS.navy800 }}>
              {formatDate(PATIENT.nextPaymentDate)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: COLORS.slate500 }}>Payment Method</span>
            <span className="font-medium flex items-center gap-1" style={{ color: COLORS.navy800 }}>
              <CreditCard className="w-4 h-4" style={{ color: COLORS.slate400 }} />
              {PATIENT.paymentMethod}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-3 border-t" style={{ borderColor: COLORS.slate200 }}>
          <button
            className="flex-1 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: COLORS.teal500, color: COLORS.teal600 }}
          >
            Change Plan
          </button>
          <button
            className="flex-1 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: COLORS.slate300, color: COLORS.slate600 }}
          >
            Update Payment
          </button>
        </div>
        <button
          className="w-full mt-2 py-2 rounded-lg text-sm font-medium"
          style={{ color: COLORS.red500 }}
        >
          Cancel Membership
        </button>
      </div>

      {/* Emergency Contact */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Emergency Contact
          </h3>
          <button className="text-xs font-semibold" style={{ color: COLORS.teal500 }}>
            Edit
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <User className="w-4 h-4" style={{ color: COLORS.slate400 }} />
            <div>
              <p className="text-sm font-medium" style={{ color: COLORS.navy800 }}>
                {PATIENT.emergencyContact.name}
              </p>
              <p className="text-xs" style={{ color: COLORS.slate400 }}>
                {PATIENT.emergencyContact.relationship}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4" style={{ color: COLORS.slate400 }} />
            <p className="text-sm" style={{ color: COLORS.navy800 }}>
              {PATIENT.emergencyContact.phone}
            </p>
          </div>
        </div>
      </div>

      {/* Pharmacy */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Preferred Pharmacy
          </h3>
          <button className="text-xs font-semibold" style={{ color: COLORS.teal500 }}>
            Change
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium" style={{ color: COLORS.navy800 }}>
            {PATIENT.pharmacy.name}
          </p>
          <div className="flex items-center gap-2">
            <MapPin className="w-3 h-3" style={{ color: COLORS.slate400 }} />
            <p className="text-xs" style={{ color: COLORS.slate500 }}>
              {PATIENT.pharmacy.address}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-3 h-3" style={{ color: COLORS.slate400 }} />
            <p className="text-xs" style={{ color: COLORS.slate500 }}>
              {PATIENT.pharmacy.phone}
            </p>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold mb-4" style={{ color: COLORS.navy800 }}>
          Notification Preferences
        </h3>
        <div className="space-y-3">
          {[
            { key: "appointments" as const, label: "Appointment Reminders", desc: "Get notified before appointments" },
            { key: "billing" as const, label: "Billing Alerts", desc: "Payment confirmations and reminders" },
            { key: "messages" as const, label: "New Messages", desc: "When your provider sends a message" },
            { key: "marketing" as const, label: "Health Tips & Updates", desc: "Wellness content and practice news" },
          ].map((pref) => (
            <div key={pref.key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: COLORS.navy800 }}>
                  {pref.label}
                </p>
                <p className="text-xs" style={{ color: COLORS.slate400 }}>
                  {pref.desc}
                </p>
              </div>
              <button
                onClick={() =>
                  setNotifPrefs((prev) => ({ ...prev, [pref.key]: !prev[pref.key] }))
                }
                className="w-11 h-6 rounded-full p-0.5 transition-colors"
                style={{
                  backgroundColor: notifPrefs[pref.key] ? COLORS.teal500 : COLORS.slate300,
                }}
              >
                <div
                  className="w-5 h-5 rounded-full bg-white shadow transition-transform"
                  style={{
                    transform: notifPrefs[pref.key] ? "translateX(20px)" : "translateX(0)",
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="w-full py-3 rounded-xl text-sm font-semibold border-2 flex items-center justify-center gap-2 transition-colors hover:bg-red-50"
        style={{ borderColor: COLORS.red500, color: COLORS.red500 }}
      >
        <LogOut className="w-4 h-4" /> Log Out
      </button>

      {/* Bottom spacer for mobile nav */}
      <div className="h-20 lg:h-0" />
    </div>
  );

  // ─── Tab Content ───────────────────────────────────────────────────────

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return renderHome();
      case "appointments":
        return renderAppointments();
      case "messages":
        return renderMessages();
      case "health":
        return renderHealth();
      case "account":
        return renderAccount();
      default:
        return renderHome();
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.slate50 }}>
      {renderHeader()}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 lg:pb-6">
        {renderContent()}
      </main>
      {renderMobileNav()}
    </div>
  );
}
