// ===== Patient Portal =====
// Member-facing portal — what patients see when they log into their DPC membership.
// Now uses the shared PortalShell so it visually matches the EnnHealth
// product family: vertical sidebar at >=lg, mobile slide-out drawer below
// (replacing the older top-bar + bottom-nav layout). Same rendering
// functions and data hooks as before — just the chrome is different.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { AppointmentBookingWidget } from "../widgets/AppointmentBookingWidget";
import { ProfilePage } from "../profile/ProfilePage";
import { PortalShell, type NavItem } from "../shared/PortalShell";
import { CommandPalette, useCommandPaletteShortcut } from "../shared/CommandPalette";
import { RefreshButton } from "../shared/RefreshButton";
import { BillingTab } from "./patient/BillingTab";
import { EntitlementsTab } from "./patient/EntitlementsTab";
import { usePushNotifications } from "../../hooks/usePushNotifications";
import {
  familyService,
  appointmentService,
  messageService,
  prescriptionService,
  documentService,
  patientService,
  dashboardService,
  authService,
  telehealthService,
  membershipPlanService,
  apiFetch,
  isUsingMockData,
} from "../../lib/api";
import {
  Home,
  Calendar,
  MessageSquare,
  Heart,
  User,
  LogOut,
  ChevronRight,
  Send,
  Paperclip,
  Video,
  Clock,
  Check,
  X,
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
  ChevronDown,
  AlertCircle,
  Activity,
  Award,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = "home" | "appointments" | "messages" | "health" | "entitlements" | "account" | "profile";

interface Appointment {
  id: string;
  date: string;
  time: string;
  provider: string;
  type: string;
  status: "upcoming" | "completed" | "cancelled";
  isVideo: boolean;
  // Null = staff hasn't confirmed yet (patient self-booked, awaiting review).
  // Non-null = confirmed timestamp.
  confirmedAt?: string | null;
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
  /** Counterpart user id — needed when patient replies. Best-effort: set from
      the most recent inbound message's sender_id. May be null on demo data. */
  recipientId?: string | null;
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

/**
 * Build an empty patient profile from the authenticated user. Used when
 * the API returns no data and we are NOT in demo mode — without this
 * fallback, the UI would show fake "James Wilson" PHI to real patients
 * (audit finding B6, 2026-04-28).
 */
function buildEmptyPatientFromAuth(user: { firstName?: string; lastName?: string; email?: string; phone?: string | null } | null) {
  return {
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    dob: "",
    address: "",
    memberId: "",
    memberSince: "",
    planName: "",
    planPrice: 0,
    billingFrequency: "monthly",
    nextPaymentDate: "",
    paymentMethod: "",
    provider: "",
    emergencyContact: { name: "", relationship: "", phone: "" },
    pharmacy: { name: "", address: "", phone: "" },
  };
}

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
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Render a PlanEntitlement row as a human-readable bullet — what the
 * patient sees on the dashboard plan cards + the plan-detail modal.
 *
 * Reads quantity_limit + is_unlimited + period_type + entitlementType
 * .name + .unit_of_measure to produce strings like:
 *   - "Unlimited telehealth visits"
 *   - "5 office visits / month"
 *   - "Up to 10 messages / month"
 *   - "Lab discount" (when there's no quantity)
 *
 * Defensive on shape — we get either snake_case (legacy) or camelCase
 * (post apiFetch transform) keys depending on how the data arrived.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatEntitlementLabel(e: any): string {
  if (!e) return "";
  const name: string = e?.entitlementType?.name ?? e?.entitlement_type?.name ?? "Benefit";
  const unit: string = e?.entitlementType?.unitOfMeasure ?? e?.entitlement_type?.unit_of_measure ?? "";
  const qty: number | null = e?.quantityLimit ?? e?.quantity_limit ?? null;
  const unlimited: boolean = Boolean(e?.isUnlimited ?? e?.is_unlimited);
  const period: string = String(e?.periodType ?? e?.period_type ?? "").toLowerCase();

  // Pluralize unit when qty != 1.
  const unitDisplay = unit && qty !== 1 ? `${unit}s` : unit;
  // "/ month" suffix only when the cap is recurring (period present).
  const periodSuffix = period && period !== "lifetime" ? ` / ${period}` : "";

  if (unlimited) {
    return unit
      ? `Unlimited ${name.toLowerCase()} ${unitDisplay}`.trim()
      : `Unlimited ${name.toLowerCase()}`;
  }
  if (qty != null && qty > 0) {
    return unit
      ? `${qty} ${name.toLowerCase()} ${unitDisplay}${periodSuffix}`.trim()
      : `${qty} ${name.toLowerCase()}${periodSuffix}`.trim();
  }
  return name;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PatientPortal() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [showBookingWidget, setShowBookingWidget] = useState(false);
  const push = usePushNotifications();

  // Plan-detail modal opened from the dashboard "Choose your plan"
  // section. Holds the full plan record so the modal can render
  // features + an Enroll & Pay button that creates a Stripe Checkout
  // session via /memberships/self-enroll and redirects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedPlanForDetail, setSelectedPlanForDetail] = useState<any | null>(null);
  const [enrollingPlanId, setEnrollingPlanId] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Fallback: when the modal opens with a plan that doesn't include
  // its entitlements (e.g. cached older response shape), fetch the
  // full plan via getById and merge it in. The user sees the basic
  // info immediately and the bullets fill in once the fetch lands.
  useEffect(() => {
    if (!selectedPlanForDetail) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = selectedPlanForDetail;
    const hasEntitlements = (p.planEntitlements ?? p.plan_entitlements ?? []).length > 0;
    if (hasEntitlements) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await membershipPlanService.getById(p.id);
        if (!cancelled && res.data) {
          // Merge so we keep the original price/desc but get the
          // full relations (entitlements, addons, program).
          setSelectedPlanForDetail((prev: typeof p) =>
            prev?.id === p.id ? { ...prev, ...res.data } : prev,
          );
        }
      } catch { /* fall through with what we have */ }
    })();
    return () => { cancelled = true; };
  }, [selectedPlanForDetail]);

  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [refillingId, setRefillingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState<null | "personal" | "emergency" | "pharmacy">(null);
  // Lightweight flash banner — appears top-right, auto-dismisses in 3s.
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const showFlash = useCallback((kind: "success" | "error", text: string) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), 3000);
  }, []);
  const [notifPrefs, setNotifPrefs] = useState({
    appointments: true,
    billing: true,
    messages: true,
    marketing: false,
  });

  // ─── Family Members ──────────────────────────────────────────────────────
  interface FamilyMember {
    id: string;
    firstName: string;
    lastName: string;
    relationship: string;
    dateOfBirth: string;
    email?: string;
    phone?: string;
    status: string;
  }

  const MOCK_FAMILY_MEMBERS: FamilyMember[] = [
    { id: "fm1", firstName: "Sarah", lastName: "Wilson", relationship: "Spouse", dateOfBirth: "1990-03-22", status: "active" },
    { id: "fm2", firstName: "Emma", lastName: "Wilson", relationship: "Child", dateOfBirth: "2015-08-10", status: "active" },
  ];

  // Family-members starting state is empty in production. MOCK_FAMILY_MEMBERS
  // only seeds the demo experience; real users see their own roster from the
  // API (audit B6 — never bleed mock PHI into real accounts).
  const [_familyMembers, setFamilyMembers] = useState<FamilyMember[]>(
    isUsingMockData() ? MOCK_FAMILY_MEMBERS : []
  );
  const [_showAddFamily, setShowAddFamily] = useState(false);
  const [familyForm, _setFamilyForm] = useState({ firstName: "", lastName: "", dateOfBirth: "", relationship: "Spouse", email: "", phone: "" });
  const [_confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const loadFamilyMembers = useCallback(async () => {
    try {
      const res = await familyService.list();
      if (res.data && Array.isArray(res.data)) {
        setFamilyMembers(res.data);
      }
    } catch {
      // keep mock data
    }
  }, []);

  useEffect(() => { loadFamilyMembers(); }, [loadFamilyMembers]);

  // Open the telehealth room for an appointment. Resolves or creates the
  // session server-side, then navigates to the real session UUID. Replaces
  // the broken `/telehealth/session-${apt.id}` literal-concat URL pattern
  // (audit finding B10, 2026-04-28).
  const openTelehealth = useCallback(async (appointmentId: string) => {
    const res = await telehealthService.openForAppointment(appointmentId);
    if (res.error || !res.data?.sessionId) {
      // Surface failure instead of silently navigating to a broken URL
      window.alert(res.error || "Could not open the video room. Please try again.");
      return;
    }
    navigate(`/telehealth/${res.data.sessionId}`);
  }, [navigate]);

  // ─── API Data State ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiPatient, setApiPatient] = useState<any>(null);
  const [apiUpcoming, setApiUpcoming] = useState<Appointment[] | null>(null);
  const [apiPast, setApiPast] = useState<Appointment[] | null>(null);
  const [apiThreads, setApiThreads] = useState<MessageThread[] | null>(null);
  const [apiMedications, setApiMedications] = useState<Medication[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiDocuments, setApiDocuments] = useState<any[] | null>(null);

  // Plans + pending payment links — used by the no-active-membership
  // empty state so a fresh patient sees something actionable on login
  // instead of a blank "Welcome back" card.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingPaymentLinks, setPendingPaymentLinks] = useState<any[]>([]);

  const loadPatientData = useCallback(async () => {
    // In production we MUST avoid leaving the api* state slots null
    // when the API rejects — the useMemo fallbacks below would then
    // serve fictional demo PHI to a real patient (audit B6 regression
    // path). Default each slot to [] up front so a network failure
    // shows an empty section, not Wilson's records.
    const isDemo = isUsingMockData();
      if (!isDemo) {
        setApiUpcoming([]);
        setApiPast([]);
        setApiThreads([]);
        setApiMedications([]);
        setApiDocuments([]);
      }
      try {
        const results = await Promise.allSettled([
          // The Appointment.status enum is scheduled / confirmed /
          // checked_in / in_progress / completed / canceled / no_show.
          // "upcoming" is not a real status — it always returned an
          // empty list. Use scheduled+confirmed so a freshly-booked
          // appointment shows here; client-side time filter is below.
          appointmentService.list({ status: "scheduled" }),
          appointmentService.list({ status: "completed" }),
          messageService.list(),
          prescriptionService.list({ status: "active" }),
          documentService.list(),
          dashboardService.getPatientStats(),
          authService.me(),
        ]);

        // Upcoming appointments
        if (results[0].status === "fulfilled") {
          const r = results[0].value;
          if (r.data && Array.isArray(r.data)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setApiUpcoming(r.data.map((a: any) => ({
              id: (a.id as string) || "",
              date: (a.date as string) || (a.scheduledDate as string) || (a.scheduled_date as string) || "",
              time: (a.time as string) || (a.scheduledTime as string) || (a.scheduled_time as string) || "",
              provider: (a.providerName as string) || (a.provider_name as string) || (a.provider as string) || "",
              type: (a.type as string) || (a.appointmentType as string) || (a.appointment_type as string) || "",
              status: "upcoming" as const,
              isVideo: !!(a.isVideo ?? a.is_video ?? a.isTelehealth ?? a.is_telehealth),
              // Patient self-booked appointments land with confirmedAt=null
              // until staff confirms — surface that as a pending pill in the
              // UI so the patient knows the booking isn't final yet.
              confirmedAt: (a.confirmedAt as string | null) ?? (a.confirmed_at as string | null) ?? null,
            })));
          }
        }

        // Past appointments
        if (results[1].status === "fulfilled") {
          const r = results[1].value;
          if (r.data && Array.isArray(r.data)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setApiPast(r.data.map((a: any) => ({
              id: (a.id as string) || "",
              date: (a.date as string) || (a.scheduledDate as string) || (a.scheduled_date as string) || "",
              time: (a.time as string) || (a.scheduledTime as string) || (a.scheduled_time as string) || "",
              provider: (a.providerName as string) || (a.provider_name as string) || (a.provider as string) || "",
              type: (a.type as string) || (a.appointmentType as string) || (a.appointment_type as string) || "",
              status: "completed" as const,
              isVideo: !!(a.isVideo ?? a.is_video ?? a.isTelehealth ?? a.is_telehealth),
              chiefComplaint: (a.chiefComplaint as string) || (a.chief_complaint as string) || "",
              assessment: (a.assessment as string) || "",
              plan: (a.plan as string) || "",
              followUp: (a.followUp as string) || (a.follow_up as string) || "",
              diagnoses: (a.diagnoses as string) || "",
            })));
          }
        }

        // Messages → threads
        if (results[2].status === "fulfilled") {
          const r = results[2].value;
          if (r.data && Array.isArray(r.data)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const grouped: Record<string, any[]> = {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            r.data.forEach((m: any) => {
              const tid = m.threadId || m.thread_id || m.id;
              if (!grouped[tid]) grouped[tid] = [];
              grouped[tid].push(m);
            });
            const threads: MessageThread[] = Object.entries(grouped).map(([tid, msgs]) => {
              const last = msgs[msgs.length - 1];
              // Counterpart = sender_id of the latest inbound (provider->patient)
              // message. Used as the recipient_id when the patient replies.
              const inbound = [...msgs].reverse().find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (m: any) => ((m.senderType ?? m.sender_type) || "provider") !== "patient",
              );
              return {
                id: tid,
                providerName: last.senderName || last.sender_name || last.providerName || last.provider_name || "Provider",
                providerRole: last.senderRole || last.sender_role || "",
                lastMessage: last.body || last.text || last.content || "",
                timestamp: last.createdAt || last.created_at || last.timestamp || "",
                unread: msgs.some((m: Record<string, unknown>) => !(m.isRead ?? m.is_read)),
                recipientId: inbound?.senderId || inbound?.sender_id || null,
                messages: msgs.map((m: Record<string, unknown>) => ({
                  id: (m.id as string) || "",
                  text: (m.body as string) || (m.text as string) || (m.content as string) || "",
                  sender: ((m.senderType as string) || (m.sender_type as string) || "provider") === "patient" ? "patient" as const : "provider" as const,
                  timestamp: (m.createdAt as string) || (m.created_at as string) || (m.timestamp as string) || "",
                })),
              };
            });
            setApiThreads(threads);
          }
        }

        // Medications (from prescriptions)
        if (results[3].status === "fulfilled") {
          const r = results[3].value;
          if (r.data && Array.isArray(r.data)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setApiMedications(r.data.map((p: any) => ({
              id: (p.id as string) || "",
              name: (p.medicationName as string) || (p.medication_name as string) || (p.name as string) || "",
              dosage: (p.dosage as string) || (p.dose as string) || "",
              frequency: (p.frequency as string) || (p.sig as string) || "",
              prescriber: (p.prescriberName as string) || (p.prescriber_name as string) || (p.providerName as string) || (p.provider_name as string) || "",
              status: ((p.status as string) === "active" ? "active" : "discontinued") as "active" | "discontinued",
            })));
          }
        }

        // Documents
        if (results[4].status === "fulfilled") {
          const r = results[4].value;
          if (r.data && Array.isArray(r.data)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setApiDocuments(r.data.map((d: any) => ({
              id: (d.id as string) || "",
              name: (d.name as string) || (d.title as string) || (d.fileName as string) || (d.file_name as string) || "",
              date: (d.date as string) || (d.createdAt as string) || (d.created_at as string) || "",
              type: (d.type as string) || (d.fileType as string) || (d.file_type as string) || "PDF",
            })));
          }
        }

        // Dashboard / patient profile. /dashboard/patient returns a
        // composite { patient, membership, entitlement, ... } — merge the
        // dashboard fields AND the nested patient row onto apiPatient so
        // tabs that need patient.id (Entitlements, BillingTab) and DOB,
        // address, etc. have what they need.
        if (results[5].status === "fulfilled") {
          const r = results[5].value;
          if (r.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dash = r.data as any;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = dash.patient as any | undefined;
            setApiPatient((prev: Record<string, unknown> | null) => ({
              ...prev,
              ...dash,
              ...(p ?? {}),
              // Normalize the DOB field name the UI expects ("dob")
              // regardless of the API casing (dateOfBirth/date_of_birth).
              dob: p?.dateOfBirth ?? p?.date_of_birth ?? prev?.dob ?? "",
            }));
          }
        }

        // Auth me → patient profile info
        if (results[6].status === "fulfilled") {
          const r = results[6].value;
          if (r.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const u = r.data as any;
            setApiPatient((prev: Record<string, unknown> | null) => ({
              ...prev,
              firstName: u.firstName || u.first_name,
              lastName: u.lastName || u.last_name,
              email: u.email,
              phone: u.phone,
            }));
          }
        }
      } catch {
        // keep mock data on network failure
      }
  }, []);

  useEffect(() => { loadPatientData(); }, [loadPatientData]);

  // Fetch available plans + any pending payment links the patient has.
  // Surfaces both on the dashboard when there's no active membership so
  // a fresh patient (e.g. Jerry, who got a payment link from the practice
  // but never received the email) sees a "Choose your plan" hero or a
  // "complete your enrollment" banner instead of a blank welcome.
  useEffect(() => {
    if (isUsingMockData()) return;
    let cancelled = false;
    (async () => {
      try {
        const [plansRes, pendingsRes] = await Promise.allSettled([
          membershipPlanService.list(),
          apiFetch<unknown>("/memberships/pending"),
        ]);
        if (cancelled) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unwrap = (payload: any): any[] => {
          if (Array.isArray(payload)) return payload;
          if (Array.isArray(payload?.data)) return payload.data;
          if (Array.isArray(payload?.items)) return payload.items;
          return [];
        };

        if (plansRes.status === "fulfilled" && plansRes.value.data) {
          setAvailablePlans(unwrap(plansRes.value.data));
        }
        if (pendingsRes.status === "fulfilled" && pendingsRes.value.data) {
          // Only show rows that are still actionable (status=pending,
          // not yet expired). Anything claimed already has a real
          // membership and the patient should see that flow instead.
          const all = unwrap(pendingsRes.value.data);
          const live = all.filter((p) => {
            const status = String(p.status ?? "").toLowerCase();
            const expiresAt = p.expiresAt ?? p.expires_at;
            const notExpired = !expiresAt || new Date(expiresAt) > new Date();
            return status === "pending" && notExpired;
          });
          setPendingPaymentLinks(live);
        }
      } catch { /* silent — empty list is the safe default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Action handlers ─────────────────────────────────────────────────────

  // Patient self-enrollment from the "Choose your plan" modal. Creates
  // a Stripe Checkout session via /memberships/self-enroll and
  // redirects the patient straight to it. Webhook converts the pending
  // row into a real PatientMembership when payment lands, same flow
  // as the admin payment-link path.
  const handleSelfEnroll = useCallback(async (planId: string, billingFrequency: "monthly" | "annual" = "monthly") => {
    setEnrollingPlanId(planId);
    setEnrollError(null);
    try {
      const res = await apiFetch<{ checkoutUrl?: string }>("/memberships/self-enroll", {
        method: "POST",
        body: JSON.stringify({ plan_id: planId, billing_frequency: billingFrequency }),
      });
      if (res.error) {
        setEnrollError(res.error);
      } else if (res.data?.checkoutUrl) {
        // Redirect to Stripe Checkout. The patient pays, Stripe fires
        // checkout.session.completed, webhook creates the membership,
        // patient lands on /#/enrollment/success.
        window.location.href = res.data.checkoutUrl;
      } else {
        setEnrollError("Could not start checkout. Please try again.");
      }
    } catch {
      setEnrollError("Could not start checkout. Please try again.");
    }
    setEnrollingPlanId(null);
  }, []);

  const handleSendMessage = useCallback(async () => {
    const body = messageInput.trim();
    if (!body || sendingMessage) return;
    if (!activeThread) return;
    const thread = (apiThreads ?? []).find((t) => t.id === activeThread)
      ?? (isUsingMockData() ? MESSAGE_THREADS.find((t) => t.id === activeThread) : undefined);
    if (!thread?.recipientId) {
      // No counterpart user_id (demo data) — just append optimistically.
      setApiThreads((prev) => {
        const list = prev ?? [];
        return list.map((t) =>
          t.id === activeThread
            ? {
                ...t,
                messages: [
                  ...t.messages,
                  { id: `local-${Date.now()}`, text: body, sender: "patient" as const, timestamp: new Date().toISOString() },
                ],
                lastMessage: body,
                timestamp: new Date().toISOString(),
              }
            : t,
        );
      });
      setMessageInput("");
      return;
    }
    setSendingMessage(true);
    try {
      const r = await messageService.send({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recipientId: thread.recipientId as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        threadId: activeThread as any,
        body,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (r.error) {
        showFlash("error", r.error);
        return;
      }
      // Optimistic append + refresh in the background
      setApiThreads((prev) => {
        const list = prev ?? [];
        return list.map((t) =>
          t.id === activeThread
            ? {
                ...t,
                messages: [
                  ...t.messages,
                  { id: r.data?.id || `local-${Date.now()}`, text: body, sender: "patient" as const, timestamp: new Date().toISOString() },
                ],
                lastMessage: body,
                timestamp: new Date().toISOString(),
              }
            : t,
        );
      });
      setMessageInput("");
    } catch (e) {
      showFlash("error", e instanceof Error ? e.message : "Send failed");
    } finally {
      setSendingMessage(false);
    }
  }, [messageInput, sendingMessage, activeThread, apiThreads, showFlash]);

  const handleRefill = useCallback(async (medId: string) => {
    if (refillingId) return;
    setRefillingId(medId);
    try {
      const r = await prescriptionService.refill(medId);
      if (r.error) {
        showFlash("error", r.error);
        return;
      }
      showFlash("success", "Refill request sent — your provider will review shortly.");
    } catch (e) {
      showFlash("error", e instanceof Error ? e.message : "Refill request failed");
    } finally {
      setRefillingId(null);
    }
  }, [refillingId, showFlash]);

  const handleDownload = useCallback(async (docId: string, filename: string) => {
    if (downloadingId) return;
    setDownloadingId(docId);
    try {
      const r = await documentService.download(docId);
      if (r.error || !r.data) {
        showFlash("error", r.error || "Download failed");
        return;
      }
      const blob = r.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "document";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      showFlash("error", e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }, [downloadingId, showFlash]);

  // ─── Resolved data ───────────────────────────────────────────────────────
  // Mock fallbacks are demo-only. In production, real users with empty data
  // get empty arrays + their own auth identity — never another fictional
  // patient's PHI (audit finding B6, 2026-04-28).
  const demoMode = useMemo(() => isUsingMockData(), []);
  const patient = useMemo(
    () => {
      // Always merge API data on top of a safe base so nested objects
      // (emergencyContact, pharmacy) are guaranteed present. Without
      // this, JSX like patient.emergencyContact.name crashes when the
      // API response doesn't carry those fields.
      const base = demoMode ? PATIENT : buildEmptyPatientFromAuth(user);
      return apiPatient ? { ...base, ...apiPatient } : base;
    },
    [apiPatient, demoMode, user]
  );
  const upcomingAppointments = useMemo(
    () => apiUpcoming || (demoMode ? UPCOMING_APPOINTMENTS : []),
    [apiUpcoming, demoMode]
  );
  const pastAppointments = useMemo(
    () => apiPast || (demoMode ? PAST_APPOINTMENTS : []),
    [apiPast, demoMode]
  );
  const messageThreads = useMemo(
    () => apiThreads || (demoMode ? MESSAGE_THREADS : []),
    [apiThreads, demoMode]
  );
  const medications = useMemo(
    () => apiMedications || (demoMode ? MEDICATIONS : []),
    [apiMedications, demoMode]
  );
  const documents = useMemo(
    () => apiDocuments || (demoMode ? DOCUMENTS : []),
    [apiDocuments, demoMode]
  );

  // Family member handlers — will be wired when Family UI section is built
  void setFamilyMembers; void setShowAddFamily; void setConfirmRemoveId; void familyForm; void _setFamilyForm;

  const firstName = user?.firstName || patient.firstName || patient.firstName;
  const lastName = user?.lastName || patient.lastName || patient.lastName;

  // Practice branding pulled from auth/me's user.practice payload.
  // The User type doesn't yet declare `practice`, so cast loosely;
  // the API guarantees these fields when set on the practice row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const practice = (user as any)?.practice as
    | { name?: string; logoUrl?: string | null; primaryColor?: string | null }
    | undefined;
  const practiceName = practice?.name?.trim() || "";
  const practiceLogoUrl = practice?.logoUrl || "";
  const practiceAccent = practice?.primaryColor || "";

  // Active-membership detection. /dashboard/patient returns the active
  // membership inline; we also fall back to patient.planName for the
  // demo seed data path. Used to flip the dashboard between the
  // membership card (has plan) and the choose-a-plan empty state.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiMembership = (apiPatient as any)?.membership;
  const hasActiveMembership = Boolean(
    apiMembership && ["active", "past_due", "trialing"].includes(String(apiMembership.status ?? "").toLowerCase())
  ) || (demoMode && Boolean(patient.planName));
  // First live pending link surfaces in a banner above the dashboard
  // even when active membership exists (rare but possible mid-upgrade)
  // and especially when there's no membership (the new-patient case).
  const pendingLink = pendingPaymentLinks[0];

  // Sidebar nav for the patient portal — single flat list since the
  // patient surface only has a handful of areas. Layout matches the
  // pattern EnnHealth ClientPortalV3 uses (Dashboard, Appointments,
  // Records, Messages, etc.). Badges show unread message + upcoming
  // appointment counts so they're visible without entering the tab.
  const sidebarNav: NavItem[] = [
    { id: "home", label: "Dashboard", icon: Home },
    { id: "appointments", label: "Appointments", icon: Calendar },
    { id: "messages", label: "Messages", icon: MessageSquare, badge: messageThreads.filter((t) => t.unread).length || undefined },
    { id: "health", label: "Health Records", icon: Heart },
    { id: "entitlements", label: "Entitlements", icon: Award },
    { id: "account", label: "Billing & Account", icon: CreditCard },
    { id: "profile", label: "Profile", icon: User },
  ];

  const unreadCount = useMemo(() => messageThreads.filter((t) => t.unread).length, [messageThreads]);

  // Header / sidebar / mobile drawer are all rendered by PortalShell now.

  // ─── Home Tab ──────────────────────────────────────────────────────────

  const renderHome = () => (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: COLORS.navy800 }}>
          Welcome back, {firstName}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: COLORS.slate500 }}>
          Here&apos;s your health summary
        </p>
      </div>

      {/* Pending payment link banner — surfaces when the practice sent
          an admin-created Stripe Checkout link but the patient hasn't
          completed payment yet. The email may have failed to deliver
          (Resend outage, blocked recipient, typo) so the in-app surface
          here is the safety net the user reported was missing. */}
      {pendingLink && pendingLink.checkoutUrl && (
        <div
          className="rounded-2xl p-5 border"
          style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#fef3c7" }}
            >
              <CreditCard className="w-5 h-5" style={{ color: "#92400e" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#78350f" }}>
                Complete your enrollment
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: "#92400e" }}>
                {practiceName || "Your practice"} sent you a secure payment link
                {pendingLink.plan?.name ? ` for the ${pendingLink.plan.name} plan` : ""}. Tap below to finish enrolling.
              </p>
              <a
                href={pendingLink.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: "#d97706" }}
              >
                Complete enrollment
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Membership Card — only when the patient actually has an active
          membership. Without this gate, fresh patients (e.g. Jerry,
          enrolled-but-unpaid) saw an empty navy gradient with blank
          plan name + member id, which read as "broken portal" rather
          than "you haven't picked a plan yet." */}
      {hasActiveMembership && (
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
            <span className="text-white text-lg font-bold tracking-wide">{practiceName || "MemberMD"}</span>
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
              {patient.planName}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wider">Member Since</p>
              <p className="text-white font-medium">{formatDate(patient.memberSince)}</p>
            </div>
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wider">Member ID</p>
              <p className="text-white font-medium">{patient.memberId}</p>
            </div>
            <div className="col-span-2">
              <p className="text-white/50 text-xs uppercase tracking-wider">Provider</p>
              <p className="text-white font-medium">{patient.provider}</p>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Choose Your Plan empty state — shown when no active membership.
          Replaces the misleading blank membership card with a real CTA.
          Each plan card opens the Billing tab where the patient can
          enroll via Stripe Checkout (or contact the practice). */}
      {!hasActiveMembership && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#e6f7f2" }}
            >
              <Star className="w-5 h-5" style={{ color: COLORS.teal500 }} />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: COLORS.navy800 }}>
                {pendingLink ? "Pick a different plan?" : "Choose your plan"}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: COLORS.slate500 }}>
                {availablePlans.length === 0
                  ? `${practiceName || "Your practice"} hasn't published any plans yet. Reach out to schedule directly.`
                  : `${practiceName || "Your practice"} offers ${availablePlans.length} membership ${availablePlans.length === 1 ? "plan" : "plans"}. Pick one to get started.`}
              </p>
            </div>
          </div>

          {availablePlans.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availablePlans.slice(0, 4).map((plan) => {
                const planName = plan.name || "Membership";
                const monthly = plan.monthlyPrice ?? plan.monthly_price ?? null;
                const annual = plan.annualPrice ?? plan.annual_price ?? null;
                const description = plan.description || plan.tagline || "";
                // Top 3 entitlements as preview bullets so the patient
                // sees what they get before clicking into the modal.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const entRows: any[] = (plan.planEntitlements ?? plan.plan_entitlements ?? []) as any[];
                const previewLabels = entRows.map(formatEntitlementLabel).filter(Boolean).slice(0, 3);
                const moreCount = Math.max(0, entRows.length - previewLabels.length);
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanForDetail(plan)}
                    className="text-left rounded-xl border p-4 transition-colors hover:border-teal-400"
                    style={{ borderColor: COLORS.slate200 }}
                  >
                    <p className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>{planName}</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      {monthly !== null && (
                        <>
                          <span className="text-xl font-bold" style={{ color: COLORS.navy900 }}>
                            ${Number(monthly).toFixed(0)}
                          </span>
                          <span className="text-xs" style={{ color: COLORS.slate500 }}>/month</span>
                        </>
                      )}
                      {monthly === null && annual !== null && (
                        <>
                          <span className="text-xl font-bold" style={{ color: COLORS.navy900 }}>
                            ${Number(annual).toFixed(0)}
                          </span>
                          <span className="text-xs" style={{ color: COLORS.slate500 }}>/year</span>
                        </>
                      )}
                    </div>
                    {description && (
                      <p className="text-xs mt-2 line-clamp-2" style={{ color: COLORS.slate500 }}>
                        {description}
                      </p>
                    )}
                    {previewLabels.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {previewLabels.map((label, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: COLORS.slate600 }}>
                            <Check className="w-3 h-3 mt-0.5 shrink-0" style={{ color: COLORS.teal500 }} />
                            <span className="truncate">{label}</span>
                          </li>
                        ))}
                        {moreCount > 0 && (
                          <li className="text-xs pl-4.5" style={{ color: COLORS.slate400, paddingLeft: "18px" }}>
                            +{moreCount} more
                          </li>
                        )}
                      </ul>
                    )}
                    <div className="mt-3 flex items-center gap-1 text-xs font-semibold" style={{ color: COLORS.teal500 }}>
                      View details <ChevronRight className="w-3 h-3" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Benefits Tracker — only when there's an active membership.
          Without this gate, fresh patients saw "1/2 visits used" with
          a fake "Next renewal" date pulled from the empty fallback,
          which read as broken state. */}
      {hasActiveMembership && (
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
            Next renewal: {formatDate(patient.nextPaymentDate)}
          </span>
          <span className="font-semibold" style={{ color: COLORS.navy800 }}>
            ${patient.planPrice}/mo
          </span>
        </div>
      </div>
      )}

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
          {upcomingAppointments.slice(0, 2).map((apt) => (
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
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate" style={{ color: COLORS.navy800 }}>
                    {apt.type}
                  </p>
                  {!apt.confirmedAt && (
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold"
                      style={{ backgroundColor: "#fef3c7", color: "#92400e", fontSize: "10px" }}
                      title="Awaiting practice confirmation"
                    >
                      PENDING
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: COLORS.slate500 }}>
                  {apt.time} &middot; {apt.provider.split(",")[0]}
                </p>
              </div>
              {apt.isVideo ? (
                <button
                  onClick={() => openTelehealth(apt.id)}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1"
                  style={{ backgroundColor: COLORS.teal500 }}
                >
                  <Video className="w-3 h-3" /> Join
                </button>
              ) : (
                <button
                  onClick={() => { setActiveTab("appointments"); setExpandedVisit(apt.id); }}
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
          onClick={() => setShowBookingWidget(true)}
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
          {messageThreads.map((thread) => (
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
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: COLORS.navy800 }}>
            Appointments
          </h1>
          <p className="text-sm mt-0.5" style={{ color: COLORS.slate500 }}>
            Upcoming and past visits with your care team
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={loadPatientData} title="Refresh appointments" />
          <button
            onClick={() => setShowBookingWidget(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5"
            style={{ backgroundColor: COLORS.teal500 }}
          >
            + Book Appointment
          </button>
        </div>
      </div>

      {/* Upcoming */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: COLORS.slate500 }}>
          UPCOMING
        </h2>
        <div className="space-y-3">
          {upcomingAppointments.map((apt) => (
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
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
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
                    {!apt.confirmedAt && (
                      <span
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
                        title="Awaiting practice confirmation"
                      >
                        Pending confirmation
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t" style={{ borderColor: COLORS.slate200 }}>
                {apt.isVideo && (
                  <button
                    onClick={() => openTelehealth(apt.id)}
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
          {pastAppointments.map((apt) => (
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

  const selectedThread = messageThreads.find((t) => t.id === activeThread);

  const renderMessages = () => (
    <div className="space-y-0">
      {!activeThread ? (
        /* Thread List */
        <div>
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: COLORS.navy800 }}>
                Messages
              </h1>
              <p className="text-sm mt-0.5" style={{ color: COLORS.slate500 }}>
                Your conversations with the care team
              </p>
            </div>
            <div className="flex items-center gap-2">
              <RefreshButton onRefresh={loadPatientData} title="Refresh messages" />
              <button
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: COLORS.teal500 }}
              >
                + New Message
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {messageThreads.map((thread) => (
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
            <button
              onClick={() => showFlash("error", "File attachments are coming soon — for now please paste a description in the message body.")}
              className="p-2 rounded-full hover:bg-slate-100"
              title="Attach a file (coming soon)"
            >
              <Paperclip className="w-5 h-5" style={{ color: COLORS.slate400 }} />
            </button>
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && messageInput.trim() && !sendingMessage) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-sm outline-none"
              style={{ color: COLORS.navy800 }}
            />
            <button
              onClick={() => void handleSendMessage()}
              disabled={!messageInput.trim() || sendingMessage}
              className="p-2.5 rounded-full text-white disabled:opacity-50"
              style={{ backgroundColor: COLORS.teal500 }}
              aria-label="Send message"
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
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: COLORS.navy800 }}>
          Health records
        </h1>
        <p className="text-sm mt-0.5" style={{ color: COLORS.slate500 }}>
          Medications, screenings, allergies, and documents on file
        </p>
      </div>

      {/* Active Medications */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Pill className="w-4 h-4" style={{ color: COLORS.teal500 }} />
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Active Medications
          </h3>
        </div>
        <div className="space-y-3">
          {medications.map((med) => (
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
                onClick={() => void handleRefill(med.id)}
                disabled={refillingId === med.id}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50"
                style={{ borderColor: COLORS.teal500, color: COLORS.teal600 }}
              >
                {refillingId === med.id ? "..." : "Refill"}
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
            {/* PHQ-9 mock data renders only in demo mode. Real patients
                see an empty state until ScreeningResponse + screening
                history APIs are wired (audit B6). */}
            {(demoMode ? PHQ9_SCORES : []).map((score, i) => (
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
            {(demoMode ? GAD7_SCORES : []).map((score, i) => (
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
          {(demoMode ? DIAGNOSES : []).map((dx, i) => (
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
          {documents.map((doc) => (
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
              <button
                onClick={() => void handleDownload(doc.id, doc.name)}
                disabled={downloadingId === doc.id}
                className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50"
                aria-label={`Download ${doc.name}`}
              >
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
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: COLORS.navy800 }}>
          Account
        </h1>
        <p className="text-sm mt-0.5" style={{ color: COLORS.slate500 }}>
          Personal info, billing, and emergency contacts
        </p>
      </div>

      {/* Personal Info */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Personal Information
          </h3>
          <button
            onClick={() => setActiveTab("profile")}
            className="text-xs font-semibold"
            style={{ color: COLORS.teal500 }}
          >
            Edit
          </button>
        </div>
        <div className="space-y-3">
          {[
            { icon: User, label: "Name", value: `${patient.firstName} ${patient.lastName}` },
            { icon: Calendar, label: "Date of Birth", value: formatDate(patient.dob) },
            { icon: Phone, label: "Phone", value: patient.phone },
            { icon: Mail, label: "Email", value: patient.email },
            { icon: MapPin, label: "Address", value: patient.address },
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

      {/* Membership / Billing — backed by real API endpoints. Trial countdown,
          plan card, visits-this-period meter, card-on-file rotation via Stripe
          Elements, invoice history, and self-service end-of-period cancel all
          live in BillingTab. */}
      <BillingTab />

      {/* Emergency Contact */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.navy800 }}>
            Emergency Contact
          </h3>
          <button
            onClick={() => setProfileEditOpen("emergency")}
            className="text-xs font-semibold"
            style={{ color: COLORS.teal500 }}
          >
            Edit
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <User className="w-4 h-4" style={{ color: COLORS.slate400 }} />
            <div>
              <p className="text-sm font-medium" style={{ color: COLORS.navy800 }}>
                {patient.emergencyContact.name}
              </p>
              <p className="text-xs" style={{ color: COLORS.slate400 }}>
                {patient.emergencyContact.relationship}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4" style={{ color: COLORS.slate400 }} />
            <p className="text-sm" style={{ color: COLORS.navy800 }}>
              {patient.emergencyContact.phone}
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
          <button
            onClick={() => setProfileEditOpen("pharmacy")}
            className="text-xs font-semibold"
            style={{ color: COLORS.teal500 }}
          >
            Change
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium" style={{ color: COLORS.navy800 }}>
            {patient.pharmacy.name}
          </p>
          <div className="flex items-center gap-2">
            <MapPin className="w-3 h-3" style={{ color: COLORS.slate400 }} />
            <p className="text-xs" style={{ color: COLORS.slate500 }}>
              {patient.pharmacy.address}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-3 h-3" style={{ color: COLORS.slate400 }} />
            <p className="text-xs" style={{ color: COLORS.slate500 }}>
              {patient.pharmacy.phone}
            </p>
          </div>
        </div>
      </div>

      {/* Push Notifications — device-level enablement */}
      {push.status !== "unsupported" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Push notifications on this device</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {push.status === "subscribed" && "You'll get instant alerts on this device for appointments, messages, and refills."}
                {push.status === "granted" && "Notifications are allowed but not yet enabled for this device. Tap Enable to start receiving them."}
                {push.status === "default" && "Get instant alerts for appointments, messages, and refill approvals — even when your browser is closed."}
                {push.status === "denied" && "Notifications are blocked. Open your browser's site settings to allow them, then return here."}
                {push.status === "subscribing" && "Setting up notifications…"}
                {push.status === "unsubscribing" && "Disabling notifications…"}
                {push.status === "error" && (push.error || "Something went wrong enabling notifications.")}
              </p>
            </div>
            <div className="shrink-0">
              {push.status === "subscribed" && (
                <button
                  onClick={() => void push.unsubscribe()}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Disable
                </button>
              )}
              {(push.status === "default" || push.status === "granted" || push.status === "error") && (
                <button
                  onClick={() => void push.subscribe()}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-white transition-colors"
                  style={{ backgroundColor: "#635bff" }}
                >
                  Enable
                </button>
              )}
              {(push.status === "subscribing" || push.status === "unsubscribing") && (
                <span className="text-xs text-slate-400">Working…</span>
              )}
            </div>
          </div>
        </div>
      )}

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
      case "entitlements":
        return <EntitlementsTab patientId={patient.id} />;
      case "account":
        return renderAccount();
      case "profile":
        return <ProfilePage onBack={() => setActiveTab("home")} />;
      default:
        return renderHome();
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  // Title shown in the header — mirrors the active tab so the user
  // always knows where they are.
  const headerTitleByTab: Record<TabId, string> = {
    home: "Dashboard",
    appointments: "Appointments",
    messages: "Messages",
    health: "Health Records",
    entitlements: "Entitlements",
    account: "Billing & Account",
    profile: "Profile",
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ")
    || patient.firstName
    || "Member";

  // Command palette wiring — same Cmd+K shortcut as the practice portal
  // so the gesture is consistent across portals.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteShortcut(() => setPaletteOpen(true));

  return (
    <>
      <PortalShell
        // Practice name as the title so the patient sees "BellaCare"
        // (or whatever) instead of the generic "Patient Portal" — the
        // single biggest "this feels like an app" signal. Falls back
        // to "Patient Portal" when practice info hasn't loaded yet.
        portalTitle={practiceName || "Patient Portal"}
        portalIcon={Heart}
        portalColor="stripe"
        accentColor={practiceAccent || undefined}
        brandLogoUrl={practiceLogoUrl || undefined}
        userName={fullName}
        userSubtitle={user?.email || patient.email || undefined}
        nav={sidebarNav}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        onLogout={logout}
        notificationCount={unreadCount}
        headerTitle={headerTitleByTab[activeTab] ?? "Dashboard"}
        // Mobile bottom tab bar — 5 most-used tabs, left→right.
        // Entitlements + Profile remain reachable via the in-app surfaces
        // (Account → Entitlements section, header avatar dropdown).
        mobileBottomNav={[
          { id: "home", label: "Home", icon: Home },
          { id: "appointments", label: "Visits", icon: Calendar },
          { id: "messages", label: "Messages", icon: MessageSquare, badge: unreadCount || undefined },
          { id: "health", label: "Health", icon: Heart },
          { id: "account", label: "Account", icon: CreditCard },
        ]}
      >
        {renderContent()}
      </PortalShell>
      {showBookingWidget && (
        <AppointmentBookingWidget
          onClose={() => setShowBookingWidget(false)}
          onBooked={() => setShowBookingWidget(false)}
        />
      )}

      {/* Plan-detail modal — opened from the dashboard "Choose your plan"
          empty state. Renders full plan info (name + price + description
          + features list) and an Enroll & Pay button that creates a
          Stripe Checkout session and redirects. */}
      {selectedPlanForDetail && (() => {
        const plan = selectedPlanForDetail;
        const planName = plan.name || "Membership";
        const monthly = plan.monthlyPrice ?? plan.monthly_price ?? null;
        const annual = plan.annualPrice ?? plan.annual_price ?? null;
        const description = plan.description || plan.tagline || "";
        // features_list is a JSON column on membership_plans; normalize
        // to an array of strings.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawFeatures: any = plan.featuresList ?? plan.features_list ?? plan.features ?? [];
        const features: string[] = Array.isArray(rawFeatures)
          ? rawFeatures.map((f) => typeof f === "string" ? f : (f?.label ?? f?.name ?? ""))
          : [];
        // Plan entitlements (visits/telehealth/messaging) are surfaced
        // inline as bullets — they're the real value drivers. Uses the
        // formatEntitlementLabel helper so the modal and the small
        // dashboard preview render the same vocabulary.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entLabels: string[] = (plan.planEntitlements ?? plan.plan_entitlements ?? [])
          .map(formatEntitlementLabel)
          .filter(Boolean);
        const isLoading = enrollingPlanId === plan.id;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}
            onClick={() => { setSelectedPlanForDetail(null); setEnrollError(null); }}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{planName}</h3>
                <button
                  onClick={() => { setSelectedPlanForDetail(null); setEnrollError(null); }}
                  className="p-1 rounded hover:bg-slate-100 text-slate-400"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex items-baseline gap-1">
                  {monthly !== null && (
                    <>
                      <span className="text-3xl font-bold text-slate-900">${Number(monthly).toFixed(0)}</span>
                      <span className="text-sm text-slate-500">/month</span>
                    </>
                  )}
                  {monthly === null && annual !== null && (
                    <>
                      <span className="text-3xl font-bold text-slate-900">${Number(annual).toFixed(0)}</span>
                      <span className="text-sm text-slate-500">/year</span>
                    </>
                  )}
                </div>

                {description && (
                  <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
                )}

                {(entLabels.length > 0 || features.length > 0) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      What's included
                    </p>
                    <ul className="space-y-1.5">
                      {entLabels.map((label, i) => (
                        <li key={`e-${i}`} className="flex items-start gap-2 text-sm text-slate-700">
                          <Check className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                          <span>{label}</span>
                        </li>
                      ))}
                      {features.map((f, i) => (
                        <li key={`f-${i}`} className="flex items-start gap-2 text-sm text-slate-700">
                          <Check className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {enrollError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {enrollError}
                  </div>
                )}

                <p className="text-xs text-slate-400 leading-relaxed">
                  You'll be redirected to Stripe to enter payment details. You can cancel any time before completing payment.
                </p>
              </div>

              <div className="px-6 pb-6 flex flex-col gap-2">
                <button
                  onClick={() => handleSelfEnroll(plan.id, "monthly")}
                  disabled={isLoading || (monthly === null && annual === null)}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: COLORS.teal500 }}
                >
                  {isLoading ? "Opening Stripe…" : "Enroll & pay"}
                </button>
                <button
                  onClick={() => { setSelectedPlanForDetail(null); setEnrollError(null); }}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={sidebarNav.map((it) => ({
          id: it.id,
          label: it.label,
          icon: it.icon,
        }))}
        onSelect={(id) => setActiveTab(id as TabId)}
      />

      {/* Flash banner (top-right). 3s auto-dismiss; setFlash(null) on click. */}
      {flash && (
        <div
          onClick={() => setFlash(null)}
          className="fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium cursor-pointer max-w-sm"
          style={{
            backgroundColor: flash.kind === "success" ? "#ecf9ec" : "#fef2f2",
            color: flash.kind === "success" ? "#147d64" : "#b91c1c",
            border: `1px solid ${flash.kind === "success" ? "#a7e3c4" : "#fecaca"}`,
          }}
          role="alert"
        >
          {flash.text}
        </div>
      )}

      {/* Emergency contact / pharmacy edit dialog — minimal inline form
          that updates the patient profile via patientService.update.
          Falls back to a "contact your practice" message if the patient
          row hasn't loaded (demo-only path). */}
      {profileEditOpen && (
        <PatientFieldEditDialog
          mode={profileEditOpen}
          patient={patient}
          onClose={() => setProfileEditOpen(null)}
          onSaved={(text) => {
            setProfileEditOpen(null);
            showFlash("success", text);
            loadPatientData();
          }}
          onError={(text) => showFlash("error", text)}
        />
      )}
    </>
  );
}

// ─── Inline edit dialog for emergency contact / pharmacy ────────────────────
//
// Renders a simple modal with the relevant fields, calls patientService.update
// with the right payload shape on save. Kept inline because no other portal
// page needs this; if a third call site appears, lift it into shared/.

interface PatientFieldEditDialogProps {
  mode: "personal" | "emergency" | "pharmacy";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patient: any;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}

function PatientFieldEditDialog({ mode, patient, onClose, onSaved, onError }: PatientFieldEditDialogProps) {
  const initial: Record<string, string> = mode === "emergency"
    ? {
        emergency_contact_name: String(patient.emergencyContact?.name ?? ""),
        emergency_contact_relationship: String(patient.emergencyContact?.relationship ?? ""),
        emergency_contact_phone: String(patient.emergencyContact?.phone ?? ""),
      }
    : {
        pharmacy_name: String(patient.pharmacy?.name ?? ""),
        pharmacy_address: String(patient.pharmacy?.address ?? ""),
        pharmacy_phone: String(patient.pharmacy?.phone ?? ""),
      };
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!patient.id) {
      onError("No patient record found — please contact your practice to update this.");
      return;
    }
    setSaving(true);
    try {
      const r = await patientService.update(patient.id, values);
      if (r.error) {
        onError(r.error);
        return;
      }
      onSaved(mode === "emergency" ? "Emergency contact updated." : "Pharmacy updated.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  // Field metadata. `kind: "select"` triggers a dropdown; `options`
  // populates it. Mirrors the choices from the public EnrollmentWidget
  // so the patient sees the same vocabulary at signup vs in-portal edit.
  type Field = { key: string; label: string; kind?: "text" | "select"; options?: { value: string; label: string }[] };
  const fields: Field[] = mode === "emergency"
    ? [
        { key: "emergency_contact_name", label: "Name" },
        {
          key: "emergency_contact_relationship",
          label: "Relationship",
          kind: "select",
          options: [
            { value: "spouse", label: "Spouse" },
            { value: "parent", label: "Parent" },
            { value: "child", label: "Child" },
            { value: "sibling", label: "Sibling" },
            { value: "partner", label: "Partner" },
            { value: "friend", label: "Friend" },
            { value: "guardian", label: "Legal guardian" },
            { value: "other", label: "Other" },
          ],
        },
        { key: "emergency_contact_phone", label: "Phone" },
      ]
    : [
        { key: "pharmacy_name", label: "Pharmacy name" },
        { key: "pharmacy_address", label: "Address" },
        { key: "pharmacy_phone", label: "Phone" },
      ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(16, 42, 67, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4" style={{ color: "#102a43" }}>
          {mode === "emergency" ? "Edit Emergency Contact" : "Change Preferred Pharmacy"}
        </h3>
        <div className="space-y-3">
          {fields.map((f) => {
            // Select fields render a dropdown with prepopulated options
            // (e.g. the relationship field for emergency contact). Without
            // this, patients had to type "spouse" / "parent" by hand and
            // the resulting free-text values were inconsistent across the
            // tenant. The select normalizes the vocabulary.
            if (f.kind === "select") {
              return (
                <div key={f.key}>
                  <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>
                    {f.label}
                  </label>
                  <select
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="">Select…</option>
                    {(f.options ?? []).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              );
            }

            // Pick the right HTML input type + mobile keyboard based on
            // the field key so iOS/Android pop the right keyboard:
            // tel keypad for phone, email pad for email, default text
            // otherwise. autoComplete tokens let password managers and
            // OS autofill do the right thing.
            const isPhone = f.key.includes("phone");
            const isEmail = f.key.includes("email");
            const isName = f.key.includes("name");
            const inputType = isPhone ? "tel" : isEmail ? "email" : "text";
            const inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"] =
              isPhone ? "tel" : isEmail ? "email" : "text";
            const autoComplete = isPhone ? "tel" : isEmail ? "email" : isName ? "name" : undefined;
            return (
              <div key={f.key}>
                <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>
                  {f.label}
                </label>
                <input
                  type={inputType}
                  inputMode={inputMode}
                  autoComplete={autoComplete}
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#635bff" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
