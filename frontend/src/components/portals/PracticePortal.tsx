// ===== Practice Portal =====
// Main dashboard for DPC practice owners/admins — manage membership practice
// Tabs: Dashboard, Patient Roster, Membership Plans, Appointments, Messages, Invoices, + Coming Soon tabs

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { dashboardService, membershipPlanService, messageService, patientService, appointmentService, encounterService, prescriptionService, invoiceService, programService } from "../../lib/api";
import { HeaderToolbar } from "../shared/HeaderToolbar";
import { UserSettingsDropdown } from "../shared/UserSettingsDropdown";
import { PracticeSettings } from "../settings/PracticeSettings";
import { CalendarView } from "../shared/CalendarView";
import { AppointmentBookingWidget } from "../widgets/AppointmentBookingWidget";
import { AuditDashboard } from "../shared/AuditDashboard";
import { ProgramsSection } from "./ProgramsSection";
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
  ArrowLeft,
  Download,
  ChevronDown,
  ChevronUp,
  Mail,
  Layers,
  Copy,
  Wifi,
  XCircle,
  AlertTriangle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId =
  | "dashboard"
  | "programs"
  | "roster"
  | "intakes"
  | "waitlist"
  | "appointments"
  | "telehealth"
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
  | "compliance"
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
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "programs", label: "Programs", icon: Layers },
    ],
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
      { id: "telehealth", label: "Telehealth", icon: Video },
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
    title: "Compliance",
    items: [
      { id: "compliance", label: "HIPAA & Audit", icon: Shield },
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

interface MockProgramEnrollment {
  programName: string;
  planName?: string;
  status: "active" | "paused" | "completed";
  fundingSource: string;
  monthlyAmount?: string;
  usageLabel?: string;
  usageUsed?: number;
  usageTotal?: number;
  nextAppointment?: string;
}

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
  programEnrollments?: MockProgramEnrollment[];
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
    programEnrollments: [
      { programName: "DPC Membership", planName: "Complete", status: "active", fundingSource: "$199/mo", monthlyAmount: "$199", usageLabel: "visits", usageUsed: 2, usageTotal: 4, nextAppointment: "Mar 25, 2:00 PM — CCM Care Coordination" },
      { programName: "CCM", status: "active", fundingSource: "Medicare", usageLabel: "min", usageUsed: 12, usageTotal: 20 },
      { programName: "RPM", status: "active", fundingSource: "Medicare", usageLabel: "readings", usageUsed: 22, usageTotal: 30 },
    ],
  },
  { id: "pt2", name: "Sarah Mitchell", plan: "Complete", planPrice: 199, status: "active", phone: "(555) 234-5678", email: "sarah.m@email.com", lastVisit: "Mar 15, 2026", nextApt: "Mar 22, 2026", memberId: "MBR-SM2026", memberSince: "Feb 1, 2026", visitsUsed: 2, visitsTotal: 4, provider: "Dr. Nageley Michel",
    programEnrollments: [
      { programName: "DPC Membership", planName: "Complete", status: "active", fundingSource: "$199/mo", usageLabel: "visits", usageUsed: 2, usageTotal: 4 },
    ],
  },
  { id: "pt3", name: "James Rivera", plan: "Premium", planPrice: 299, status: "active", phone: "(555) 345-6789", email: "james.r@email.com", lastVisit: "Mar 14, 2026", nextApt: "Mar 20, 2026", memberId: "MBR-JR2026", memberSince: "Jan 10, 2026", visitsUsed: 3, visitsTotal: 999, provider: "Dr. Nageley Michel",
    programEnrollments: [
      { programName: "DPC Membership", planName: "Premium", status: "active", fundingSource: "$299/mo", usageLabel: "visits", usageUsed: 3, usageTotal: 999 },
      { programName: "RPM", status: "active", fundingSource: "Medicare", usageLabel: "readings", usageUsed: 18, usageTotal: 30 },
    ],
  },
  { id: "pt4", name: "Emily Chen", plan: "Essential", planPrice: 99, status: "active", phone: "(555) 456-7890", email: "emily.c@email.com", lastVisit: "Mar 10, 2026", nextApt: "Mar 25, 2026", memberId: "MBR-EC2026", memberSince: "Mar 1, 2026", visitsUsed: 1, visitsTotal: 2, provider: "Dr. Nageley Michel",
    programEnrollments: [
      { programName: "DPC Membership", planName: "Essential", status: "active", fundingSource: "$99/mo", usageLabel: "visits", usageUsed: 1, usageTotal: 2 },
      { programName: "CCM", status: "active", fundingSource: "Medicare", usageLabel: "min", usageUsed: 8, usageTotal: 20 },
    ],
  },
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
  { id: "a1", time: "8:00 AM", patient: "James Wilson", plan: "Complete", program: "DPC Membership", type: "Follow-Up", duration: "30 min", provider: "Dr. Michel", status: "confirmed" as const, isTelehealth: false, sessionId: "" },
  { id: "a2", time: "8:30 AM", patient: "Sarah Mitchell", plan: "Complete", program: "DPC Membership", type: "Telehealth", duration: "20 min", provider: "Dr. Michel", status: "confirmed" as const, isTelehealth: true, sessionId: "th-session-001" },
  { id: "a3", time: "9:15 AM", patient: "Maria Garcia", plan: "Essential", program: "CCM", type: "Care Coordination", duration: "30 min", provider: "Dr. Michel", status: "pending" as const, isTelehealth: false, sessionId: "" },
  { id: "a4", time: "10:00 AM", patient: "Robert Chen", plan: "Premium", program: "RPM", type: "Telehealth", duration: "30 min", provider: "Dr. Michel", status: "confirmed" as const, isTelehealth: true, sessionId: "th-session-002" },
  { id: "a5", time: "11:00 AM", patient: "Lisa Patel", plan: "Essential", program: "DPC Membership", type: "Lab Review", duration: "15 min", provider: "NP Johnson", status: "confirmed" as const, isTelehealth: false, sessionId: "" },
  { id: "a6", time: "1:00 PM", patient: "Rachel Adams", plan: "Complete", program: "Employer Wellness", type: "Wellness Check", duration: "45 min", provider: "Dr. Michel", status: "pending" as const, isTelehealth: false, sessionId: "" },
  { id: "a7", time: "2:00 PM", patient: "James Wilson", plan: "Complete", program: "CCM", type: "Care Coordination", duration: "20 min", provider: "NP Johnson", status: "confirmed" as const, isTelehealth: false, sessionId: "" },
  { id: "a8", time: "3:30 PM", patient: "Thomas Lee", plan: "Complete", program: "DPC Membership", type: "Telehealth", duration: "20 min", provider: "Dr. Michel", status: "confirmed" as const, isTelehealth: true, sessionId: "th-session-003" },
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

// All tabs are now implemented — no coming-soon tabs remain

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

// ─── MoreActionsDropdown ──────────────────────────────────────────────────────

function MoreActionsDropdown({ actions }: { actions: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-40">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick(); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors"
              style={action.danger ? { color: "#dc2626" } : { color: "#334e68" }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ConfirmDialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel, danger }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void; confirmLabel?: string; danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: danger ? "#fef2f2" : "#fffbeb" }}>
            <AlertTriangle className="w-5 h-5" style={{ color: danger ? "#dc2626" : "#d97706" }} />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        </div>
        <p className="text-sm text-slate-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: danger ? "#dc2626" : "#27ab83" }}
          >
            {confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function PracticePortal() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedThread, setSelectedThread] = useState(MOCK_THREADS[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<MockPatient | null>(null);
  const [patientDetailTab, setPatientDetailTab] = useState("demographics");
  const [expandedEncounters, setExpandedEncounters] = useState<string[]>([]);
  const [notificationFilter, setNotificationFilter] = useState<"all" | "members" | "appointments" | "billing" | "system">("all");
  const [showBookingWidget, setShowBookingWidget] = useState(false);
  const [telehealthMode, setTelehealthMode] = useState<"builtin" | "external">("builtin");
  const [externalPlatform, setExternalPlatform] = useState<"zoom" | "doxy" | "teams" | "google_meet" | "custom">("zoom");
  const [externalUrl, setExternalUrl] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiDashStats, setApiDashStats] = useState<Record<string, any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiPlans, setApiPlans] = useState<any[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(3);
  const [isRealApi, setIsRealApi] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiThreads, setApiThreads] = useState<any[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiMessages, setApiMessages] = useState<any[] | null>(null);
  const [apiPatients, setApiPatients] = useState<MockPatient[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiAppointments, setApiAppointments] = useState<any[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiEncounters, setApiEncounters] = useState<any[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiPrescriptions, setApiPrescriptions] = useState<any[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiInvoices, setApiInvoices] = useState<any[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [addPatientForm, setAddPatientForm] = useState<{ firstName: string; lastName: string; email: string; phone: string; dateOfBirth: string; gender: "male" | "female" | "other" | "prefer_not_to_say" }>({ firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", gender: "male" });
  const [addPatientLoading, setAddPatientLoading] = useState(false);
  const [addPatientError, setAddPatientError] = useState<string | null>(null);

  // ─── Toast ──────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } }, [toast]);

  // ─── Confirm Dialog ─────────────────────────────────────────────────
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; confirmLabel?: string; danger?: boolean } | null>(null);

  // ─── Book Appointment Modal ─────────────────────────────────────────
  const [showBookAppointment, setShowBookAppointment] = useState(false);
  const [bookApptForm, setBookApptForm] = useState({ patientId: "", appointmentTypeId: "", scheduledAt: "", scheduledTime: "09:00", durationMinutes: "30", providerId: "", isTeleHealth: false, programId: "", notes: "" });
  const [bookApptLoading, setBookApptLoading] = useState(false);

  // ─── New Encounter Modal ────────────────────────────────────────────
  const [showNewEncounter, setShowNewEncounter] = useState(false);
  const [encounterForm, setEncounterForm] = useState({ patientId: "", encounterType: "follow_up", programId: "", encounterDate: new Date().toISOString().split("T")[0] });
  const [encounterLoading, setEncounterLoading] = useState(false);
  // Encounter editor (inline SOAP)
  const [editingEncounterId, setEditingEncounterId] = useState<string | null>(null);
  const [soapForm, setSoapForm] = useState({ subjective: "", objective: "", assessment: "", plan: "", chiefComplaint: "" });
  const [soapLoading, setSoapLoading] = useState(false);

  // ─── New Prescription Modal ─────────────────────────────────────────
  const [showNewPrescription, setShowNewPrescription] = useState(false);
  const [rxForm, setRxForm] = useState({ patientId: "", medicationName: "", dosage: "", frequency: "", route: "oral", quantity: "30", refills: "3", isControlled: false, schedule: "", pharmacyName: "", pharmacyPhone: "", notes: "" });
  const [rxLoading, setRxLoading] = useState(false);

  // ─── eFax Modal ───────────────────────────────────────────────────────
  const [showEfaxModal, setShowEfaxModal] = useState(false);
  const [efaxTarget, setEfaxTarget] = useState<{ id: string; medication: string; dosage: string; patient: string; pharmacyPhone: string }>({ id: "", medication: "", dosage: "", patient: "", pharmacyPhone: "" });
  const [efaxFaxNumber, setEfaxFaxNumber] = useState("");
  const [efaxLoading, setEfaxLoading] = useState(false);

  // ─── Edit Patient Modal ─────────────────────────────────────────────
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [editPatientForm, setEditPatientForm] = useState<{ id: string; firstName: string; lastName: string; email: string; phone: string; dateOfBirth: string; gender: string; addressLine1: string; city: string; state: string; zip: string; preferredLanguage: string }>({ id: "", firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", gender: "male", addressLine1: "", city: "", state: "", zip: "", preferredLanguage: "English" });
  const [editPatientLoading, setEditPatientLoading] = useState(false);

  // ─── Inline Invoice Detail ──────────────────────────────────────────
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  // ─── API Programs for dropdowns ─────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiPrograms, setApiPrograms] = useState<any[]>([]);

  const loadPracticeData = useCallback(async () => {
    setDataLoading(true);
    const [statsRes, plansRes, threadsRes, patientsRes, appointmentsRes, encountersRes, prescriptionsRes, invoicesRes, programsRes] = await Promise.allSettled([
      dashboardService.getPracticeStats(),
      membershipPlanService.list(),
      messageService.list(),
      patientService.list(),
      appointmentService.list(),
      encounterService.list(),
      prescriptionService.list(),
      invoiceService.list(),
      programService.list(),
    ]);
    // Dashboard stats
    if (statsRes.status === "fulfilled" && statsRes.value.data && typeof statsRes.value.data === "object" && Object.keys(statsRes.value.data).length > 0) {
      setApiDashStats(statsRes.value.data);
      setIsRealApi(true);
    }
    // Plans
    if (plansRes.status === "fulfilled" && plansRes.value.data && Array.isArray(plansRes.value.data) && plansRes.value.data.length > 0) {
      setApiPlans(plansRes.value.data);
    }
    // Threads
    if (threadsRes.status === "fulfilled" && threadsRes.value.data && Array.isArray(threadsRes.value.data) && threadsRes.value.data.length > 0) {
      setApiThreads(threadsRes.value.data);
    }
    // Patients
    if (patientsRes.status === "fulfilled" && patientsRes.value.data && Array.isArray(patientsRes.value.data) && patientsRes.value.data.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiPatients(patientsRes.value.data.map((p: any) => ({
        id: p.id,
        name: [p.firstName, p.lastName].filter(Boolean).join(" ") || p.name || "",
        preferredName: p.preferredName || undefined,
        plan: p.activeMembership?.plan?.name || p.planName || "No Plan",
        planPrice: p.activeMembership?.plan?.monthlyPrice || p.planPrice || 0,
        status: p.isActive === false ? "cancelled" : (p.activeMembership?.status === "paused" ? "paused" : "active") as "active" | "paused" | "cancelled",
        phone: p.phone || "",
        email: p.email || "",
        lastVisit: p.lastVisitAt || "N/A",
        nextApt: p.nextAppointmentAt || "N/A",
        memberId: p.activeMembership?.memberNumber || p.memberId || "",
        memberSince: p.createdAt || "",
        dob: p.dateOfBirth || p.dob || "",
        gender: p.gender || "",
        pronouns: p.pronouns || "",
        language: p.language || "",
        address: [p.addressLine1, p.addressLine2, p.city, p.state, p.zip].filter(Boolean).join(", ") || p.address || "",
        visitsUsed: p.activeMembership?.visitsUsed ?? 0,
        visitsTotal: p.activeMembership?.visitsTotal ?? 0,
        provider: p.primaryProvider?.name || p.providerName || "",
      })));
    }
    // Appointments
    if (appointmentsRes.status === "fulfilled" && appointmentsRes.value.data && Array.isArray(appointmentsRes.value.data) && appointmentsRes.value.data.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiAppointments(appointmentsRes.value.data.map((a: any) => ({
        id: a.id,
        time: a.scheduledAt ? new Date(a.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : a.time || "",
        patient: a.patient ? [a.patient.firstName, a.patient.lastName].filter(Boolean).join(" ") : a.patientName || "",
        plan: a.patient?.activeMembership?.plan?.name || a.planName || "",
        program: a.program?.name || a.programName || "DPC Membership",
        type: a.appointmentType?.name || a.type || a.typeName || "Visit",
        duration: a.durationMinutes ? `${a.durationMinutes} min` : a.duration || "30 min",
        provider: a.provider ? `${a.provider.title || ""} ${a.provider.lastName || ""}`.trim() : a.providerName || "",
        status: a.status || "confirmed",
        isTelehealth: a.isTelehealth ?? a.is_telehealth ?? false,
        sessionId: a.telehealthSessionId || a.sessionId || "",
      })));
    }
    // Encounters
    if (encountersRes.status === "fulfilled" && encountersRes.value.data && Array.isArray(encountersRes.value.data) && encountersRes.value.data.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiEncounters(encountersRes.value.data.map((e: any) => ({
        id: e.id,
        date: e.encounterDate ? new Date(e.encounterDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : e.date || "",
        patient: e.patient ? [e.patient.firstName, e.patient.lastName].filter(Boolean).join(" ") : e.patientName || "",
        provider: e.provider ? `${e.provider.title || ""} ${e.provider.lastName || ""}`.trim() : e.providerName || "",
        type: e.encounterType || e.type || "Follow-Up",
        program: e.program?.name || e.programName || "DPC Membership",
        noteTemplate: e.noteTemplate || e.templateType || "SOAP",
        duration: e.durationMinutes ? `${e.durationMinutes} min` : e.duration || "30 min",
        status: e.status || "draft",
      })));
    }
    // Prescriptions
    if (prescriptionsRes.status === "fulfilled" && prescriptionsRes.value.data && Array.isArray(prescriptionsRes.value.data) && prescriptionsRes.value.data.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiPrescriptions(prescriptionsRes.value.data.map((rx: any) => ({
        id: rx.id,
        patient: rx.patient ? [rx.patient.firstName, rx.patient.lastName].filter(Boolean).join(" ") : rx.patientName || "",
        medication: rx.medicationName || rx.medication || "",
        dosage: rx.dosage || "",
        frequency: rx.frequency || "",
        prescriber: rx.prescriber ? `${rx.prescriber.title || ""} ${rx.prescriber.lastName || ""}`.trim() : rx.prescriberName || "",
        status: rx.status || "active",
        refillsLeft: rx.refillsRemaining ?? rx.refillsLeft ?? 0,
      })));
    }
    // Invoices
    if (invoicesRes.status === "fulfilled" && invoicesRes.value.data && Array.isArray(invoicesRes.value.data) && invoicesRes.value.data.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiInvoices(invoicesRes.value.data.map((inv: any) => ({
        id: inv.invoiceNumber || inv.id || "",
        patient: inv.patient ? [inv.patient.firstName, inv.patient.lastName].filter(Boolean).join(" ") : inv.patientName || "",
        amount: inv.totalAmount ?? inv.amount ?? 0,
        plan: inv.plan?.name || inv.planName || "",
        status: inv.status || "open",
        date: inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : inv.date || "",
      })));
    }
    // Programs
    if (programsRes.status === "fulfilled" && programsRes.value.data && Array.isArray(programsRes.value.data) && programsRes.value.data.length > 0) {
      setApiPrograms(programsRes.value.data);
    }
    setDataLoading(false);
  }, []);

  useEffect(() => { loadPracticeData(); }, [loadPracticeData]);

  const handleAddPatient = async () => {
    if (!addPatientForm.firstName || !addPatientForm.lastName || !addPatientForm.dateOfBirth) {
      setAddPatientError("First name, last name, and date of birth are required.");
      return;
    }
    setAddPatientLoading(true);
    setAddPatientError(null);
    try {
      const res = await patientService.create(addPatientForm);
      if (res.data) {
        // Refresh patient list
        loadPracticeData();
        setShowAddPatient(false);
        setAddPatientForm({ firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", gender: "male" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create patient. Please try again.";
      setAddPatientError(msg);
    }
    setAddPatientLoading(false);
  };

  // ─── Book Appointment Handler ──────────────────────────────────────
  const handleBookAppointment = async () => {
    if (!bookApptForm.patientId || !bookApptForm.scheduledAt) {
      setToast({ message: "Patient and date are required.", type: "error" });
      return;
    }
    setBookApptLoading(true);
    try {
      const scheduledAt = `${bookApptForm.scheduledAt}T${bookApptForm.scheduledTime}:00`;
      const res = await appointmentService.create({
        patientId: bookApptForm.patientId,
        appointmentTypeId: bookApptForm.appointmentTypeId || undefined,
        scheduledAt,
        durationMinutes: parseInt(bookApptForm.durationMinutes) || 30,
        providerId: bookApptForm.providerId || undefined,
        isTeleHealth: bookApptForm.isTeleHealth,
        notes: bookApptForm.notes || undefined,
      });
      if (res.data || !res.error) {
        setToast({ message: "Appointment booked successfully.", type: "success" });
        setShowBookAppointment(false);
        setBookApptForm({ patientId: "", appointmentTypeId: "", scheduledAt: "", scheduledTime: "09:00", durationMinutes: "30", providerId: "", isTeleHealth: false, programId: "", notes: "" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to book appointment.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to book appointment.", type: "error" });
    }
    setBookApptLoading(false);
  };

  // ─── New Encounter Handler ─────────────────────────────────────────
  const handleCreateEncounter = async () => {
    if (!encounterForm.patientId) {
      setToast({ message: "Patient is required.", type: "error" });
      return;
    }
    setEncounterLoading(true);
    try {
      const res = await encounterService.create({
        patientId: encounterForm.patientId,
        encounterDate: encounterForm.encounterDate,
        status: "in_progress",
      });
      if (res.data || !res.error) {
        setToast({ message: "Encounter created. Fill in the SOAP note below.", type: "success" });
        setShowNewEncounter(false);
        const encId = res.data?.id || `new-enc-${Date.now()}`;
        setEditingEncounterId(encId);
        setSoapForm({ subjective: "", objective: "", assessment: "", plan: "", chiefComplaint: "" });
        setEncounterForm({ patientId: "", encounterType: "follow_up", programId: "", encounterDate: new Date().toISOString().split("T")[0] });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to create encounter.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to create encounter.", type: "error" });
    }
    setEncounterLoading(false);
  };

  // ─── Save SOAP Note Handler ────────────────────────────────────────
  const handleSaveSoap = async (sign?: boolean) => {
    if (!editingEncounterId) return;
    setSoapLoading(true);
    try {
      const updateData: Record<string, unknown> = {
        subjective: soapForm.subjective,
        objective: soapForm.objective,
        assessment: soapForm.assessment,
        plan: soapForm.plan,
        chiefComplaint: soapForm.chiefComplaint,
      };
      if (sign) updateData.status = "signed";
      const res = await encounterService.update(editingEncounterId, updateData);
      if (res.data || !res.error) {
        setToast({ message: sign ? "Encounter signed successfully." : "SOAP note saved.", type: "success" });
        if (sign) setEditingEncounterId(null);
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to save note.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to save note.", type: "error" });
    }
    setSoapLoading(false);
  };

  // ─── New Prescription Handler ──────────────────────────────────────
  const handleCreatePrescription = async () => {
    if (!rxForm.patientId || !rxForm.medicationName || !rxForm.dosage) {
      setToast({ message: "Patient, medication, and dosage are required.", type: "error" });
      return;
    }
    setRxLoading(true);
    try {
      const res = await prescriptionService.create({
        patientId: rxForm.patientId,
        medicationName: rxForm.medicationName,
        dosage: rxForm.dosage,
        frequency: rxForm.frequency,
        route: rxForm.route,
        quantity: parseInt(rxForm.quantity) || 30,
        refills: parseInt(rxForm.refills) || 0,
        pharmacy: rxForm.pharmacyName || undefined,
        notes: rxForm.notes || undefined,
        startDate: new Date().toISOString().split("T")[0],
        status: "active",
      });
      if (res.data || !res.error) {
        setToast({ message: "Prescription created successfully.", type: "success" });
        setShowNewPrescription(false);
        setRxForm({ patientId: "", medicationName: "", dosage: "", frequency: "", route: "oral", quantity: "30", refills: "3", isControlled: false, schedule: "", pharmacyName: "", pharmacyPhone: "", notes: "" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to create prescription.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to create prescription.", type: "error" });
    }
    setRxLoading(false);
  };

  // ─── Edit Patient Handler ─────────────────────────────────────────
  const handleEditPatient = async () => {
    if (!editPatientForm.id || !editPatientForm.firstName || !editPatientForm.lastName) {
      setToast({ message: "First and last name are required.", type: "error" });
      return;
    }
    setEditPatientLoading(true);
    try {
      const res = await patientService.update(editPatientForm.id, {
        firstName: editPatientForm.firstName,
        lastName: editPatientForm.lastName,
        email: editPatientForm.email || undefined,
        phone: editPatientForm.phone || undefined,
        dateOfBirth: editPatientForm.dateOfBirth || undefined,
        gender: editPatientForm.gender as "male" | "female" | "other" | "prefer_not_to_say",
        addressLine1: editPatientForm.addressLine1 || undefined,
        city: editPatientForm.city || undefined,
        state: editPatientForm.state || undefined,
        zip: editPatientForm.zip || undefined,
      });
      if (res.data || !res.error) {
        setToast({ message: "Patient updated successfully.", type: "success" });
        setShowEditPatient(false);
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to update patient.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to update patient.", type: "error" });
    }
    setEditPatientLoading(false);
  };

  // ─── Open Edit Patient Modal ──────────────────────────────────────
  const openEditPatient = (patient: MockPatient) => {
    const nameParts = patient.name.split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    const addrParts = (patient.address || "").split(", ");
    setEditPatientForm({
      id: patient.id,
      firstName,
      lastName,
      email: patient.email || "",
      phone: patient.phone || "",
      dateOfBirth: patient.dob || "",
      gender: (patient.gender || "male").toLowerCase(),
      addressLine1: addrParts[0] || "",
      city: addrParts[1] || "",
      state: addrParts[2] || "",
      zip: addrParts[3] || "",
      preferredLanguage: patient.language || "English",
    });
    setShowEditPatient(true);
  };

  // ─── Appointment Actions ──────────────────────────────────────────
  const handleCheckIn = useCallback(async (aptId: string) => {
    try {
      const res = await appointmentService.checkIn(aptId);
      if (res.data || !res.error) {
        setToast({ message: "Patient checked in.", type: "success" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to check in.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Check-in failed.", type: "error" });
    }
  }, [loadPracticeData]);

  const handleCancelAppointment = useCallback(async (aptId: string) => {
    try {
      const res = await appointmentService.cancel(aptId, "Cancelled by practice");
      if (res.data || !res.error) {
        setToast({ message: "Appointment cancelled.", type: "success" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to cancel appointment.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Cancel failed.", type: "error" });
    }
  }, [loadPracticeData]);

  // ─── Encounter Actions ─────────────────────────────────────────────
  const handleSignEncounter = useCallback(async (encId: string) => {
    try {
      const res = await encounterService.update(encId, { status: "signed" });
      if (res.data || !res.error) {
        setToast({ message: "Encounter signed.", type: "success" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to sign encounter.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Sign failed.", type: "error" });
    }
  }, [loadPracticeData]);

  // ─── Prescription Actions ──────────────────────────────────────────
  const handleRefillPrescription = useCallback(async (rxId: string) => {
    try {
      const res = await prescriptionService.refill(rxId);
      if (res.data || !res.error) {
        setToast({ message: "Refill processed successfully.", type: "success" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Refill failed.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Refill failed.", type: "error" });
    }
  }, [loadPracticeData]);

  const handleDiscontinuePrescription = useCallback(async (rxId: string) => {
    try {
      const res = await prescriptionService.cancel(rxId);
      if (res.data || !res.error) {
        setToast({ message: "Prescription discontinued.", type: "success" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to discontinue.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to discontinue.", type: "error" });
    }
  }, [loadPracticeData]);

  // ─── eFax Prescription ──────────────────────────────────────────────
  const handleOpenEfax = (rx: { id: string; medication: string; dosage: string; patient: string; pharmacyPhone?: string }) => {
    setEfaxTarget({ id: rx.id, medication: rx.medication, dosage: rx.dosage, patient: rx.patient, pharmacyPhone: rx.pharmacyPhone || "" });
    setEfaxFaxNumber(rx.pharmacyPhone || "");
    setShowEfaxModal(true);
  };

  const handleSendEfax = async () => {
    if (!efaxFaxNumber.trim()) {
      setToast({ message: "Pharmacy fax number is required.", type: "error" });
      return;
    }
    setEfaxLoading(true);
    try {
      const res = await prescriptionService.efax(efaxTarget.id, efaxFaxNumber.trim());
      if (res.data || !res.error) {
        setToast({ message: "Prescription eFaxed successfully.", type: "success" });
        setShowEfaxModal(false);
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to send eFax.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "eFax failed.", type: "error" });
    }
    setEfaxLoading(false);
  };

  const handleDownloadRxPdf = useCallback((rxId: string) => {
    prescriptionService.downloadPdf(rxId);
  }, []);

  // ─── Invoice Actions ──────────────────────────────────────────────
  const handleSendInvoice = useCallback(async (invId: string) => {
    try {
      const res = await invoiceService.send(invId);
      if (res.data || !res.error) {
        setToast({ message: "Invoice sent successfully.", type: "success" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to send invoice.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Send failed.", type: "error" });
    }
  }, [loadPracticeData]);

  const handleMarkInvoicePaid = useCallback(async (invId: string) => {
    try {
      const res = await invoiceService.update(invId, { status: "paid", paidAt: new Date().toISOString() });
      if (res.data || !res.error) {
        setToast({ message: "Invoice marked as paid.", type: "success" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to mark as paid.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed.", type: "error" });
    }
  }, [loadPracticeData]);

  // Polling for unread messages
  useEffect(() => {
    if (!isRealApi) return;
    const interval = setInterval(async () => {
      try {
        const res = await messageService.getUnreadCount();
        if (res.data) setUnreadCount(res.data.count);
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [isRealApi]);

  const practiceName = auth.user
    ? `${auth.user.firstName}'s Practice`
    : "My Practice";

  // ─── Memoized Data ──────────────────────────────────────────────────────

  const patients = useMemo(() => apiPatients || MOCK_PATIENTS, [apiPatients]);

  const filteredPatients = useMemo(
    () =>
      patients.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.plan.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [patients, searchQuery]
  );

  const appointments = useMemo(() => apiAppointments || MOCK_APPOINTMENTS, [apiAppointments]);

  const telehealthAppointments = useMemo(
    () => appointments.filter((a: typeof MOCK_APPOINTMENTS[0]) => a.isTelehealth),
    [appointments]
  );

  const invoices = useMemo(() => apiInvoices || MOCK_INVOICES, [apiInvoices]);

  const invoiceSummary = useMemo(() => ({
    total: invoices.reduce((s: number, i: { amount: number }) => s + i.amount, 0),
    paid: invoices.filter((i: { status: string }) => i.status === "paid").reduce((s: number, i: { amount: number }) => s + i.amount, 0),
    open: invoices.filter((i: { status: string }) => i.status === "open").reduce((s: number, i: { amount: number }) => s + i.amount, 0),
    overdue: invoices.filter((i: { status: string }) => i.status === "overdue").reduce((s: number, i: { amount: number }) => s + i.amount, 0),
  }), [invoices]);

  const prescriptionCounts = useMemo(() => {
    if (!apiPrescriptions) return { active: 45, sent: 0, refillRequested: 3, discontinued: 12 };
    return {
      active: apiPrescriptions.filter((rx: { status: string }) => rx.status === "active").length,
      sent: apiPrescriptions.filter((rx: { status: string }) => rx.status === "sent").length,
      refillRequested: apiPrescriptions.filter((rx: { status: string }) => rx.status === "refill_requested").length,
      discontinued: apiPrescriptions.filter((rx: { status: string }) => rx.status === "discontinued").length,
    };
  }, [apiPrescriptions]);

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
                      {item.id === "messages" && unreadCount > 0 && (
                        <span
                          className="ml-auto text-xs rounded-full px-1.5 py-0.5 font-semibold"
                          style={{ backgroundColor: "#ef4444", color: "#ffffff" }}
                        >
                          {unreadCount}
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

  // Program performance mock data
  const MOCK_PROGRAM_STATS = [
    { name: "DPC Membership", enrolled: 120, mrr: 23800, utilization: 78, color: "#147d64", bgColor: "#e6f7f2", icon: Heart },
    { name: "CCM", enrolled: 50, mrr: 2100, utilization: 65, color: "#334e68", bgColor: "#e0e8f0", icon: ClipboardList },
    { name: "RPM", enrolled: 30, mrr: 1700, utilization: 72, color: "#7c3aed", bgColor: "#f3e8ff", icon: Activity },
    { name: "Employer Wellness", enrolled: 500, mrr: 10000, utilization: 42, color: "#d97706", bgColor: "#fffbeb", icon: UsersRound },
  ];

  function renderDashboard() {
    const totalMRR = 39328;

    return (
      <div className="space-y-6">
        {/* Revenue by Source */}
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Revenue by Source</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Heart}
              label="Membership"
              value={apiDashStats?.mrr ? `$${Number(apiDashStats.mrr).toLocaleString()}/mo` : "$23,800/mo"}
              trend="120 DPC members"
              trendColor="#147d64"
            />
            <StatCard
              icon={FileText}
              label="Insurance Claims"
              value="$5,528/mo"
              trend="CCM + RPM"
              trendColor="#334e68"
            />
            <StatCard
              icon={UsersRound}
              label="Employer Contracts"
              value="$10,000/mo"
              trend="2 contracts"
              trendColor="#d97706"
            />
            <StatCard
              icon={DollarSign}
              label="Total MRR"
              value={`$${totalMRR.toLocaleString()}`}
              trend="+12% MoM"
            />
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Layers}
            label="Active Programs"
            value={apiDashStats?.activePrograms?.toString() ?? "4"}
            trend="All performing"
          />
          <StatCard
            icon={Users}
            label="Total Enrolled"
            value={apiDashStats?.activeMembers?.toString() ?? apiDashStats?.active_members?.toString() ?? "700"}
            trend="+15 this month"
          />
          <StatCard
            icon={Calendar}
            label="Appointments Today"
            value={apiDashStats?.appointmentsToday?.toString() ?? apiDashStats?.appointments_today?.toString() ?? "8"}
            trend="3 telehealth"
            trendColor="#334e68"
          />
          <StatCard
            icon={ClipboardList}
            label="Pending Intakes"
            value={apiDashStats?.pendingIntakes?.toString() ?? apiDashStats?.pending_intakes?.toString() ?? "4"}
            trend="2 new today"
            trendColor="#d97706"
          />
        </div>

        {/* Program Performance Cards */}
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Program Performance</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MOCK_PROGRAM_STATS.map((prog) => (
              <div key={prog.name} className="glass rounded-xl p-5 hover-lift">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: prog.bgColor }}
                  >
                    <prog.icon className="w-5 h-5" style={{ color: prog.color }} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-800 text-sm truncate">{prog.name}</h4>
                    <p className="text-xs text-slate-400">{prog.enrolled} enrolled</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-bold text-slate-800">${prog.mrr.toLocaleString()}</span>
                  <span className="text-xs font-medium text-slate-400">/mo</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: prog.bgColor }}>
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${prog.utilization}%`, backgroundColor: prog.color }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-500">{prog.utilization}%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Utilization</p>
              </div>
            ))}
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
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Program</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(apiAppointments || MOCK_DASHBOARD_APPOINTMENTS).slice(0, 5).map((apt) => (
                      <tr
                        key={apt.id}
                        className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-slate-700">{apt.time}</td>
                        <td className="px-4 py-3 text-slate-700">{apt.patient}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-slate-500">{apt.program}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          <span className="flex items-center gap-1">
                            {apt.isTelehealth && <Video className="w-3 h-3" style={{ color: "#27ab83" }} />}
                            {apt.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={apt.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {apt.isTelehealth && apt.sessionId && (
                              <button
                                onClick={() => navigate(`/telehealth/${apt.sessionId}`)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                                style={{ backgroundColor: "#22c55e" }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#16a34a")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#22c55e")}
                              >
                                <Video className="w-3 h-3" /> Join
                              </button>
                            )}
                            {apt.status === "confirmed" && !apt.isTelehealth && (
                              <button
                                onClick={() => handleCheckIn(apt.id)}
                                className="px-2 py-1 rounded text-xs font-medium transition-colors"
                                style={{ color: "#27ab83" }}
                              >
                                Check In
                              </button>
                            )}
                          </div>
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
    const filtered = filteredPatients;

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
              onClick={() => setShowAddPatient(true)}
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
                          title="View patient"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditPatient(patient)}
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                          title="Edit patient"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <MoreActionsDropdown actions={[
                          { label: "Schedule Appointment", onClick: () => { setBookApptForm(f => ({ ...f, patientId: patient.id })); setShowBookAppointment(true); } },
                          { label: "Create Encounter", onClick: () => { setEncounterForm(f => ({ ...f, patientId: patient.id })); setShowNewEncounter(true); } },
                          { label: "Enroll in Program", onClick: () => { setActiveTab("programs"); } },
                          { label: "Deactivate", onClick: () => { setConfirmDialog({ title: "Deactivate Patient", message: `Are you sure you want to deactivate ${patient.name}?`, confirmLabel: "Deactivate", danger: true, onConfirm: async () => { try { await patientService.update(patient.id, { status: "inactive" }); setToast({ message: "Patient deactivated.", type: "success" }); loadPracticeData(); } catch { setToast({ message: "Failed to deactivate.", type: "error" }); } setConfirmDialog(null); } }); }, danger: true },
                        ]} />
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
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: "#334e68" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#243b53")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#334e68")}
              onClick={() => { if (pt) { setEncounterForm(f => ({ ...f, patientId: pt.id })); setShowNewEncounter(true); } }}
            >
              <Stethoscope className="w-4 h-4" /> New Encounter
            </button>
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: "#334e68", color: "#334e68" }}
              onClick={() => { if (pt) { setBookApptForm(f => ({ ...f, patientId: pt.id })); setShowBookAppointment(true); } }}
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

        {/* ── Program Enrollments ──────────────────────────────────────── */}
        {pt.programEnrollments && pt.programEnrollments.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Program Enrollments</h3>
            <div className="space-y-3">
              {pt.programEnrollments.map((enrollment, idx) => {
                const progColors: Record<string, { color: string; bg: string }> = {
                  "DPC Membership": { color: "#147d64", bg: "#e6f7f2" },
                  "CCM": { color: "#334e68", bg: "#e0e8f0" },
                  "RPM": { color: "#7c3aed", bg: "#f3e8ff" },
                  "Employer Wellness": { color: "#d97706", bg: "#fffbeb" },
                };
                const pc = progColors[enrollment.programName] || { color: "#334e68", bg: "#e0e8f0" };
                return (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: "rgba(16,42,67,0.02)" }}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: pc.color }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-slate-800">{enrollment.programName}</span>
                          {enrollment.planName && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: pc.bg, color: pc.color }}>
                              {enrollment.planName}
                            </span>
                          )}
                          <StatusBadge status={enrollment.status} />
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{enrollment.fundingSource}</p>
                      </div>
                    </div>
                    {enrollment.usageUsed !== undefined && enrollment.usageTotal !== undefined && (
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-700">
                            {enrollment.usageUsed} of {enrollment.usageTotal >= 999 ? "\u221E" : enrollment.usageTotal} {enrollment.usageLabel}
                          </p>
                          <div className="w-24 h-1.5 rounded-full mt-1" style={{ backgroundColor: "#e2e8f0" }}>
                            <div
                              className="h-1.5 rounded-full"
                              style={{
                                width: `${enrollment.usageTotal >= 999 ? 30 : Math.min((enrollment.usageUsed / enrollment.usageTotal) * 100, 100)}%`,
                                backgroundColor: pc.color,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {pt.programEnrollments[0]?.nextAppointment && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  Next Appointment: <span className="font-medium text-slate-600">{pt.programEnrollments[0].nextAppointment}</span>
                </p>
              </div>
            )}
          </div>
        )}

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
                onClick={() => { if (pt) { setRxForm(f => ({ ...f, patientId: pt.id })); setShowNewPrescription(true); } }}
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
                                <button className="px-2 py-1 rounded text-xs font-medium" style={{ color: "#27ab83" }} onClick={() => setToast({ message: "Use the Prescriptions tab to manage refills.", type: "success" })}>Refill</button>
                                <button className="px-2 py-1 rounded text-xs font-medium text-slate-400" onClick={() => setToast({ message: "Use the Prescriptions tab to discontinue.", type: "success" })}>Discontinue</button>
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
                    <button
                      className="mt-3 px-3 py-1 rounded text-xs font-medium" style={{ color: "#dc2626" }}
                      onClick={() => setConfirmDialog({ title: "Cancel Appointment", message: `Cancel this ${apt.type} appointment on ${apt.date}?`, confirmLabel: "Cancel Appointment", danger: true, onConfirm: () => { handleCancelAppointment(apt.id); setConfirmDialog(null); } })}
                    >Cancel</button>
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
          {(apiPlans || MOCK_PLANS).map((plan) => {
            const Icon = planIcons[plan.name] || Heart;
            const gradient = planGradients[plan.name] || planGradients.Essential;
            const memberCount = plan.memberCount ?? plan.member_count ?? 0;
            const monthlyPrice = plan.monthlyPrice ?? plan.monthly_price ?? 0;
            const revenue = memberCount * monthlyPrice;

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
                      <span className="text-3xl font-bold">${monthlyPrice}</span>
                      <span className="text-sm opacity-80">/month</span>
                    </div>
                    <p className="text-sm opacity-70 mt-1">
                      ${plan.annualPrice ?? plan.annual_price ?? 0}/year{monthlyPrice > 0 ? ` (save ${Math.round((1 - (plan.annualPrice ?? plan.annual_price ?? 0) / (monthlyPrice * 12)) * 100)}%)` : ""}
                    </p>
                  </div>
                </div>

                {/* Entitlements */}
                <div className="p-5 flex-1">
                  <ul className="space-y-2.5">
                    {(Array.isArray(plan.entitlements) ? plan.entitlements : Object.entries(plan.entitlements || {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)).map((item: string, i: number) => (
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
                        {memberCount}
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
    return (
      <div className="space-y-4">
        <CalendarView
          onAppointmentClick={(_id) => { /* TODO: open appointment detail */ }}
          onBookNew={() => setShowBookingWidget(true)}
        />

        {showBookingWidget && (
          <AppointmentBookingWidget
            onClose={() => setShowBookingWidget(false)}
            onBooked={() => setShowBookingWidget(false)}
          />
        )}

        {/* Add Patient Modal */}
        {showAddPatient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
              <div className="p-6" style={{ background: "linear-gradient(135deg, #1B2B4D, #243b53)" }}>
                <h3 className="text-xl font-bold text-white">Add New Patient</h3>
                <p className="text-sm text-slate-300 mt-1">Enter patient demographics to create a new record.</p>
              </div>
              <div className="p-6 space-y-4">
                {addPatientError && (
                  <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}>{addPatientError}</div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm" value={addPatientForm.firstName}
                      onChange={(e) => setAddPatientForm(f => ({ ...f, firstName: e.target.value }))} placeholder="John" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm" value={addPatientForm.lastName}
                      onChange={(e) => setAddPatientForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Smith" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth *</label>
                    <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={addPatientForm.dateOfBirth}
                      onChange={(e) => setAddPatientForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm" value={addPatientForm.gender}
                      onChange={(e) => setAddPatientForm(f => ({ ...f, gender: e.target.value as "male" | "female" | "other" | "prefer_not_to_say" }))}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm" value={addPatientForm.email}
                    onChange={(e) => setAddPatientForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input type="tel" className="w-full border rounded-lg px-3 py-2 text-sm" value={addPatientForm.phone}
                    onChange={(e) => setAddPatientForm(f => ({ ...f, phone: e.target.value }))} placeholder="(407) 555-1234" />
                </div>
              </div>
              <div className="px-6 pb-6 flex items-center justify-end gap-3">
                <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  onClick={() => { setShowAddPatient(false); setAddPatientError(null); }}>Cancel</button>
                <button className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: "#27ab83" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                  onClick={handleAddPatient}
                  disabled={addPatientLoading}>
                  {addPatientLoading ? "Creating..." : "Create Patient"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Telehealth Tab ─────────────────────────────────────────────────────

  function renderTelehealth() {
    const platformLabels: Record<string, string> = {
      zoom: "Zoom",
      doxy: "Doxy.me",
      teams: "Microsoft Teams",
      google_meet: "Google Meet",
      custom: "Custom URL",
    };
    const platformPlaceholders: Record<string, string> = {
      zoom: "https://zoom.us/j/1234567890 or Personal Meeting ID",
      doxy: "https://doxy.me/your-room-name",
      teams: "https://teams.microsoft.com/l/meetup-join/...",
      google_meet: "https://meet.google.com/abc-defg-hij",
      custom: "https://your-video-platform.com/room/...",
    };

    const handleQuickLaunch = () => {
      const sessionId = `adhoc-${Date.now()}`;
      if (telehealthMode === "builtin") {
        navigate(`/telehealth/${sessionId}`);
      } else {
        const url = externalUrl || "#";
        window.open(url, "_blank", "noopener,noreferrer");
      }
    };

    const handleCopyLink = (sessionId: string) => {
      const link = `${window.location.origin}/#/telehealth/${sessionId}`;
      navigator.clipboard.writeText(link).catch(() => { /* fallback */ });
    };

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-800">Telehealth</h2>
          <button
            onClick={handleQuickLaunch}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors shrink-0"
            style={{ backgroundColor: "#22c55e" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#16a34a")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#22c55e")}
          >
            <Video className="w-4 h-4" />
            Start Ad-Hoc Video Call
          </button>
        </div>

        {/* Telehealth Settings */}
        <div className="glass rounded-xl p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4" style={{ color: "#27ab83" }} />
            Video Platform Settings
          </h3>

          {/* Mode Toggle */}
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="telehealth-mode"
                checked={telehealthMode === "builtin"}
                onChange={() => setTelehealthMode("builtin")}
                className="accent-teal-600"
              />
              <span className="text-sm font-medium text-slate-700">Use MemberMD Built-in Video</span>
              <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "#e6f7f2", color: "#147d64" }}>
                Daily.co
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="telehealth-mode"
                checked={telehealthMode === "external"}
                onChange={() => setTelehealthMode("external")}
                className="accent-teal-600"
              />
              <span className="text-sm font-medium text-slate-700">Use External Platform</span>
            </label>
          </div>

          {telehealthMode === "builtin" ? (
            <div className="p-3 rounded-lg flex items-start gap-3" style={{ backgroundColor: "#e6f7f2" }}>
              <Shield className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#147d64" }} />
              <div>
                <p className="text-sm font-medium" style={{ color: "#147d64" }}>HIPAA-Compliant Built-in Video</p>
                <p className="text-xs mt-0.5" style={{ color: "#334e68" }}>
                  End-to-end encrypted video calls with BAA coverage included. Patients join via a secure link — no downloads required.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Platform</label>
                <select
                  value={externalPlatform}
                  onChange={(e) => setExternalPlatform(e.target.value as typeof externalPlatform)}
                  className="w-full sm:w-64 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none"
                >
                  {Object.entries(platformLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">
                  {externalPlatform === "zoom" ? "Meeting URL or Personal Meeting ID" :
                   externalPlatform === "doxy" ? "Doxy.me Room URL" :
                   "Meeting URL"}
                </label>
                <input
                  type="text"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder={platformPlaceholders[externalPlatform]}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 bg-white"
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#27ab83")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "")}
                />
              </div>
              <div className="p-3 rounded-lg flex items-start gap-3" style={{ backgroundColor: "#fffbeb" }}>
                <Shield className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#d97706" }} />
                <p className="text-xs" style={{ color: "#92400e" }}>
                  Built-in video is HIPAA-compliant with BAA. External platforms require your own BAA with the provider.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Today's Telehealth Sessions */}
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Today&apos;s Telehealth Sessions</h3>
          <div className="space-y-3">
            {telehealthAppointments.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center">
                <Video className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-slate-400">No telehealth sessions scheduled for today.</p>
              </div>
            ) : (
              telehealthAppointments.map((apt) => {
                const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
                  confirmed: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142", label: "Ready" },
                  pending: { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b", label: "Pending" },
                };
                const sc = statusConfig[apt.status] || statusConfig.confirmed;
                return (
                  <div key={apt.id} className="glass rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Time */}
                    <div className="shrink-0 text-center sm:text-left" style={{ minWidth: "70px" }}>
                      <p className="text-lg font-bold text-slate-800">{apt.time}</p>
                      <p className="text-xs text-slate-400">{apt.duration}</p>
                    </div>

                    {/* Patient + Program */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800">{apt.patient}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-slate-500">{apt.program}</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-xs text-slate-400">{apt.type}</span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="shrink-0">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sc.dot }} />
                        {sc.label}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {telehealthMode === "builtin" && apt.sessionId && (
                        <button
                          onClick={() => handleCopyLink(apt.sessionId)}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy Link
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (telehealthMode === "builtin" && apt.sessionId) {
                            navigate(`/telehealth/${apt.sessionId}`);
                          } else if (externalUrl) {
                            window.open(externalUrl, "_blank", "noopener,noreferrer");
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                        style={{ backgroundColor: "#22c55e" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#16a34a")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#22c55e")}
                      >
                        <Video className="w-4 h-4" /> Start Video Call
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Connection Status */}
        <div className="glass rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#e6f7f2" }}>
            <Wifi className="w-4 h-4" style={{ color: "#147d64" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-700">
              {telehealthMode === "builtin" ? "Daily.co Integration" : `${platformLabels[externalPlatform]} Integration`}
            </p>
            <p className="text-xs text-slate-400">
              {telehealthMode === "builtin"
                ? "HIPAA-compliant video with BAA. All sessions are encrypted end-to-end."
                : "External platform configured. Ensure you have a signed BAA."}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: "#ecf9ec", color: "#2f8132" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#3f9142" }} />
            Connected
          </span>
        </div>
      </div>
    );
  }

  // ─── Messages Tab ───────────────────────────────────────────────────────

  // Fetch thread messages from API when thread is selected
  const handleSelectThread = async (threadId: string) => {
    setSelectedThread(threadId);
    if (apiThreads) {
      try {
        const res = await messageService.getThread(threadId);
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setApiMessages(res.data.map((m: any) => ({
            id: m.id,
            sender: m.senderName ?? m.sender_name ?? "",
            text: m.body ?? m.text ?? m.content ?? "",
            time: m.createdAt ?? m.created_at ?? m.timestamp ?? "",
            isPatient: m.senderRole === "patient" || m.is_patient === true,
          })));
        } else {
          setApiMessages(null);
        }
      } catch {
        setApiMessages(null);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim()) return;
    if (apiThreads) {
      try {
        await messageService.send({ threadId: selectedThread, body: messageInput, text: messageInput } as Partial<import("../../types").Message>);
      } catch { /* fallback: just clear input */ }
    }
    setMessageInput("");
  };

  function renderMessages() {
    const threads = apiThreads || MOCK_THREADS;
    const activeThread = threads.find((t: typeof MOCK_THREADS[0]) => t.id === selectedThread) || threads[0];
    const displayMessages = apiMessages || activeThread?.messages || [];

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
              {threads.map((thread: typeof MOCK_THREADS[0]) => (
                <button
                  key={thread.id}
                  onClick={() => handleSelectThread(thread.id)}
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
                  {activeThread.patient.split(" ").map((n: string) => n[0]).join("")}
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
              {displayMessages.map((msg: { id: string; text: string; time: string; isPatient: boolean }) => (
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
                  onClick={handleSendMessage}
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
            onClick={() => setToast({ message: "Invoice creation coming soon. Use Stripe for now.", type: "success" })}
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
              ${invoiceSummary.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Paid</p>
            <p className="text-xl font-bold" style={{ color: "#2f8132" }}>
              ${invoiceSummary.paid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Open</p>
            <p className="text-xl font-bold" style={{ color: "#334e68" }}>
              ${invoiceSummary.open.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Overdue</p>
            <p className="text-xl font-bold" style={{ color: "#dc2626" }}>
              ${invoiceSummary.overdue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
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
                {invoices.map((inv) => (
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
                        <button
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                          title="View invoice"
                          onClick={() => setExpandedInvoiceId(expandedInvoiceId === inv.id ? null : inv.id)}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Edit invoice">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <MoreActionsDropdown actions={[
                          ...(inv.status === "open" || inv.status === "overdue" ? [
                            { label: "Send Invoice", onClick: () => handleSendInvoice(inv.id) },
                            { label: "Mark as Paid", onClick: () => handleMarkInvoicePaid(inv.id) },
                          ] : []),
                          ...(inv.status !== "paid" ? [
                            { label: "Void Invoice", onClick: () => setConfirmDialog({ title: "Void Invoice", message: `Void invoice ${inv.id}?`, confirmLabel: "Void", danger: true, onConfirm: async () => { try { await invoiceService.void(inv.id); setToast({ message: "Invoice voided.", type: "success" }); loadPracticeData(); } catch { setToast({ message: "Failed.", type: "error" }); } setConfirmDialog(null); } }), danger: true },
                          ] : []),
                        ]} />
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

  // ─── Intakes Tab ────────────────────────────────────────────────────────

  function renderIntakes() {
    const mockIntakes = [
      { id: "INT-001", code: "INT-2026-001", name: "Robert Davis", dateSubmitted: "Mar 18, 2026", status: "pending" as const },
      { id: "INT-002", code: "INT-2026-002", name: "Amanda Brooks", dateSubmitted: "Mar 17, 2026", status: "under_review" as const },
      { id: "INT-003", code: "INT-2026-003", name: "Marcus Williams", dateSubmitted: "Mar 16, 2026", status: "approved" as const },
      { id: "INT-004", code: "INT-2026-004", name: "Patricia Nguyen", dateSubmitted: "Mar 15, 2026", status: "converted" as const },
      { id: "INT-005", code: "INT-2026-005", name: "Daniel Foster", dateSubmitted: "Mar 14, 2026", status: "approved" as const },
      { id: "INT-006", code: "INT-2026-006", name: "Karen Mitchell", dateSubmitted: "Mar 13, 2026", status: "rejected" as const },
    ];

    const intakeStatusConfig: Record<string, { bg: string; text: string; dot: string }> = {
      pending: { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" },
      under_review: { bg: "#e0e8f0", text: "#334e68", dot: "#486581" },
      approved: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" },
      rejected: { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" },
      converted: { bg: "#e6f7f2", text: "#147d64", dot: "#27ab83" },
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Intake Submissions</h2>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Total</p>
            <p className="text-2xl font-bold text-slate-800">15</p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Pending</p>
            <p className="text-2xl font-bold" style={{ color: "#d97706" }}>4</p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Approved</p>
            <p className="text-2xl font-bold" style={{ color: "#2f8132" }}>8</p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Converted</p>
            <p className="text-2xl font-bold" style={{ color: "#147d64" }}>3</p>
          </div>
        </div>

        {/* Table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Submission Code</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Date Submitted</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mockIntakes.map((intake) => {
                  const sc = intakeStatusConfig[intake.status] || intakeStatusConfig.pending;
                  return (
                    <tr key={intake.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm font-medium text-slate-700">{intake.code}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{intake.name}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{intake.dateSubmitted}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
                          style={{ backgroundColor: sc.bg, color: sc.text }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sc.dot }} />
                          {intake.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          {(intake.status === "pending" || intake.status === "under_review") && (
                            <button
                              className="px-2 py-1 rounded text-xs font-medium transition-colors"
                              style={{ color: "#27ab83" }}
                            >
                              Approve
                            </button>
                          )}
                          {intake.status === "approved" && (
                            <button
                              className="px-2 py-1 rounded text-xs font-medium transition-colors"
                              style={{ color: "#147d64" }}
                            >
                              Convert
                            </button>
                          )}
                          <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
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

  // ─── Waitlist Tab ─────────────────────────────────────────────────────────

  function renderWaitlist() {
    const mockWaitlist = [
      { id: "w1", name: "Steven Park", email: "steven.p@email.com", phone: "(555) 111-2233", desiredPlan: "Complete", requestedDate: "Mar 10, 2026", priority: "high" as const, status: "waiting" as const },
      { id: "w2", name: "Monica Reyes", email: "monica.r@email.com", phone: "(555) 222-3344", desiredPlan: "Premium", requestedDate: "Mar 12, 2026", priority: "medium" as const, status: "contacted" as const },
      { id: "w3", name: "Alan Cooper", email: "alan.c@email.com", phone: "(555) 333-4455", desiredPlan: "Essential", requestedDate: "Mar 14, 2026", priority: "low" as const, status: "waiting" as const },
      { id: "w4", name: "Diane Tran", email: "diane.t@email.com", phone: "(555) 444-5566", desiredPlan: "Complete", requestedDate: "Mar 16, 2026", priority: "high" as const, status: "enrolled" as const },
    ];

    const priorityConfig: Record<string, { bg: string; text: string }> = {
      high: { bg: "#fef2f2", text: "#dc2626" },
      medium: { bg: "#fffbeb", text: "#d97706" },
      low: { bg: "#e0e8f0", text: "#334e68" },
    };

    const waitlistStatusConfig: Record<string, { bg: string; text: string; dot: string }> = {
      waiting: { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" },
      contacted: { bg: "#e0e8f0", text: "#334e68", dot: "#486581" },
      enrolled: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" },
    };

    const panelUsed = 85;
    const panelMax = 400;
    const panelPct = Math.round((panelUsed / panelMax) * 100);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Waitlist</h2>
        </div>

        {/* Panel capacity */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800">Current Panel Capacity</h3>
            <span className="text-sm font-medium" style={{ color: "#27ab83" }}>
              {panelUsed} of {panelMax} members ({panelPct}%)
            </span>
          </div>
          <div className="w-full h-3 rounded-full" style={{ backgroundColor: "#e6f7f2" }}>
            <div
              className="h-3 rounded-full transition-all duration-500"
              style={{ width: `${panelPct}%`, backgroundColor: "#27ab83" }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">{panelMax - panelUsed} spots available</p>
        </div>

        {/* Table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Desired Plan</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Requested</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mockWaitlist.map((entry) => {
                  const pc = priorityConfig[entry.priority];
                  const wsc = waitlistStatusConfig[entry.status];
                  return (
                    <tr key={entry.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">{entry.name}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{entry.email}</td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{entry.phone}</td>
                      <td className="px-4 py-3"><PlanBadge plan={entry.desiredPlan} /></td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{entry.requestedDate}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize" style={{ backgroundColor: pc.bg, color: pc.text }}>
                          {entry.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize" style={{ backgroundColor: wsc.bg, color: wsc.text }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: wsc.dot }} />
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {entry.status !== "enrolled" && (
                            <button
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white transition-colors"
                              style={{ backgroundColor: "#27ab83" }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                            >
                              <Mail className="w-3 h-3" /> Invite to Enroll
                            </button>
                          )}
                          <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
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

  // ─── Encounters Tab ───────────────────────────────────────────────────────

  function renderEncounters() {
    const mockPracticeEncounters = [
      { id: "e1", date: "Mar 18, 2026", patient: "James Wilson", provider: "Dr. Michel", type: "Follow-Up", program: "DPC Membership", noteTemplate: "SOAP", duration: "30 min", status: "signed" as const },
      { id: "e2", date: "Mar 18, 2026", patient: "Sarah Mitchell", provider: "Dr. Michel", type: "Med Mgmt", program: "DPC Membership", noteTemplate: "SOAP", duration: "20 min", status: "draft" as const },
      { id: "e3", date: "Mar 17, 2026", patient: "Maria Garcia", provider: "Dr. Michel", type: "Care Coord", program: "CCM", noteTemplate: "CCM", duration: "20 min", status: "signed" as const },
      { id: "e4", date: "Mar 17, 2026", patient: "Emily Chen", provider: "NP Johnson", type: "Follow-Up", program: "CCM", noteTemplate: "CCM", duration: "30 min", status: "signed" as const },
      { id: "e5", date: "Mar 16, 2026", patient: "Robert Chen", provider: "Dr. Michel", type: "Device Review", program: "RPM", noteTemplate: "RPM", duration: "15 min", status: "amended" as const },
      { id: "e6", date: "Mar 15, 2026", patient: "Lisa Patel", provider: "NP Johnson", type: "Med Mgmt", program: "DPC Membership", noteTemplate: "SOAP", duration: "20 min", status: "signed" as const },
      { id: "e7", date: "Mar 14, 2026", patient: "Rachel Adams", provider: "Dr. Michel", type: "Wellness Check", program: "Employer Wellness", noteTemplate: "SOAP", duration: "30 min", status: "signed" as const },
      { id: "e8", date: "Mar 13, 2026", patient: "Thomas Lee", provider: "Dr. Michel", type: "Initial", program: "DPC Membership", noteTemplate: "SOAP", duration: "60 min", status: "draft" as const },
    ];

    const encounterTypeConfig: Record<string, { bg: string; text: string }> = {
      Initial: { bg: "#e6f7f2", text: "#147d64" },
      "Follow-Up": { bg: "#e0e8f0", text: "#334e68" },
      "Med Mgmt": { bg: "#fffbeb", text: "#d97706" },
      Therapy: { bg: "#f3e8ff", text: "#7c3aed" },
      "Care Coord": { bg: "#e0e8f0", text: "#334e68" },
      "Device Review": { bg: "#f3e8ff", text: "#7c3aed" },
      "Wellness Check": { bg: "#fffbeb", text: "#d97706" },
    };

    const programBadgeConfig: Record<string, { bg: string; text: string }> = {
      "DPC Membership": { bg: "#e6f7f2", text: "#147d64" },
      "CCM": { bg: "#e0e8f0", text: "#334e68" },
      "RPM": { bg: "#f3e8ff", text: "#7c3aed" },
      "Employer Wellness": { bg: "#fffbeb", text: "#d97706" },
    };

    const noteTemplateLabels: Record<string, string> = {
      SOAP: "Standard SOAP",
      CCM: "CCM Minutes",
      RPM: "Device Review",
    };

    const encounterStatusConfig: Record<string, { bg: string; text: string; dot: string }> = {
      draft: { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" },
      signed: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" },
      amended: { bg: "#e0e8f0", text: "#334e68", dot: "#486581" },
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-800">Encounters</h2>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors shrink-0"
            style={{ backgroundColor: "#27ab83" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
            onClick={() => setShowNewEncounter(true)}
          >
            <Plus className="w-4 h-4" />
            New Encounter
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {["Initial", "Follow-Up", "Med Mgmt", "Care Coord", "Device Review"].map((type) => {
            const tc = encounterTypeConfig[type];
            return (
              <button
                key={type}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors"
                style={{ color: tc.text }}
              >
                {type}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Program</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Provider</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Note Template</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Duration</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(apiEncounters || mockPracticeEncounters).map((enc) => {
                  const tc = encounterTypeConfig[enc.type] || encounterTypeConfig["Follow-Up"];
                  const esc = encounterStatusConfig[enc.status];
                  const pbc = programBadgeConfig[enc.program] || { bg: "#e0e8f0", text: "#334e68" };
                  return (
                    <tr key={enc.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">{enc.date}</td>
                      <td className="px-4 py-3 text-slate-700">{enc.patient}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: pbc.bg, color: pbc.text }}>
                          {enc.program}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{enc.provider}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: tc.bg, color: tc.text }}>
                          {enc.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-slate-500">{noteTemplateLabels[enc.noteTemplate] || enc.noteTemplate}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{enc.duration}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize" style={{ backgroundColor: esc.bg, color: esc.text }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: esc.dot }} />
                          {enc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            title="View encounter"
                            onClick={() => {
                              setExpandedEncounters(prev => prev.includes(enc.id) ? prev : [...prev, enc.id]);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Edit encounter"
                            onClick={() => {
                              setEditingEncounterId(enc.id);
                              setSoapForm({ subjective: "", objective: "", assessment: "", plan: "", chiefComplaint: "" });
                              setActiveTab("encounters");
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {enc.status === "draft" && (
                            <button
                              className="px-2 py-1 rounded text-xs font-medium transition-colors"
                              style={{ color: "#27ab83" }}
                              onClick={() => handleSignEncounter(enc.id)}
                            >
                              Sign
                            </button>
                          )}
                          <MoreActionsDropdown actions={[
                            ...(enc.status === "signed" ? [{ label: "Amend", onClick: () => { setEditingEncounterId(enc.id); setSoapForm({ subjective: "", objective: "", assessment: "", plan: "", chiefComplaint: "" }); } }] : []),
                            ...(enc.status === "draft" ? [{ label: "Delete", onClick: () => setConfirmDialog({ title: "Delete Encounter", message: "Delete this draft encounter?", confirmLabel: "Delete", danger: true, onConfirm: async () => { try { await encounterService.update(enc.id, { status: "in_progress" }); setToast({ message: "Encounter deleted.", type: "success" }); loadPracticeData(); } catch { setToast({ message: "Failed.", type: "error" }); } setConfirmDialog(null); } }), danger: true }] : []),
                          ]} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inline SOAP Editor */}
        {editingEncounterId && (
          <div className="glass rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">SOAP Note Editor</h3>
              <button onClick={() => setEditingEncounterId(null)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Chief Complaint</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={soapForm.chiefComplaint} onChange={e => setSoapForm(f => ({ ...f, chiefComplaint: e.target.value }))} placeholder="Reason for visit..." />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#27ab83" }}>S — Subjective</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={soapForm.subjective} onChange={e => setSoapForm(f => ({ ...f, subjective: e.target.value }))} placeholder="Patient's reported symptoms..." />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#334e68" }}>O — Objective</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={soapForm.objective} onChange={e => setSoapForm(f => ({ ...f, objective: e.target.value }))} placeholder="Clinical findings, vitals, exam..." />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#d97706" }}>A — Assessment</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={soapForm.assessment} onChange={e => setSoapForm(f => ({ ...f, assessment: e.target.value }))} placeholder="Diagnoses, clinical impression..." />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#147d64" }}>P — Plan</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={soapForm.plan} onChange={e => setSoapForm(f => ({ ...f, plan: e.target.value }))} placeholder="Treatment plan, follow-up..." />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                style={{ borderColor: "#27ab83", color: "#27ab83" }}
                onClick={() => handleSaveSoap(false)}
                disabled={soapLoading}
              >
                {soapLoading ? "Saving..." : "Save Draft"}
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#27ab83" }}
                onClick={() => handleSaveSoap(true)}
                disabled={soapLoading}
              >
                {soapLoading ? "Signing..." : "Sign & Lock"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Prescriptions Tab ────────────────────────────────────────────────────

  function renderPrescriptions() {
    const mockRefillRequests = [
      { id: "ref1", patient: "James Wilson", medication: "Sertraline", dosage: "100mg", requestedDate: "Mar 18, 2026" },
      { id: "ref2", patient: "Carlos Mendez", medication: "Metformin", dosage: "500mg", requestedDate: "Mar 17, 2026" },
    ];

    const mockPrescriptions = [
      { id: "rx1", patient: "James Wilson", medication: "Sertraline", dosage: "100mg", frequency: "Daily", prescriber: "Dr. Michel", status: "active" as const, refillsLeft: 5 },
      { id: "rx2", patient: "James Wilson", medication: "Bupropion XL", dosage: "150mg", frequency: "Daily", prescriber: "Dr. Michel", status: "active" as const, refillsLeft: 4 },
      { id: "rx3", patient: "Sarah Mitchell", medication: "Lisinopril", dosage: "10mg", frequency: "Daily", prescriber: "Dr. Michel", status: "active" as const, refillsLeft: 3 },
      { id: "rx4", patient: "Carlos Mendez", medication: "Metformin", dosage: "500mg", frequency: "Twice daily", prescriber: "Dr. Michel", status: "refill_requested" as const, refillsLeft: 0 },
      { id: "rx5", patient: "Emily Chen", medication: "Atorvastatin", dosage: "20mg", frequency: "Daily", prescriber: "NP Johnson", status: "active" as const, refillsLeft: 6 },
      { id: "rx6", patient: "Robert Kim", medication: "Omeprazole", dosage: "20mg", frequency: "Daily", prescriber: "Dr. Michel", status: "active" as const, refillsLeft: 2 },
      { id: "rx7", patient: "Lisa Patel", medication: "Levothyroxine", dosage: "50mcg", frequency: "Daily", prescriber: "NP Johnson", status: "discontinued" as const, refillsLeft: 0 },
      { id: "rx8", patient: "James Wilson", medication: "Trazodone", dosage: "50mg", frequency: "Bedtime", prescriber: "Dr. Michel", status: "discontinued" as const, refillsLeft: 0 },
    ];

    const rxStatusConfig: Record<string, { bg: string; text: string; dot: string }> = {
      active: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" },
      sent: { bg: "#eff6ff", text: "#1d4ed8", dot: "#3b82f6" },
      discontinued: { bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" },
      refill_requested: { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" },
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Prescriptions</h2>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Active</p>
            <p className="text-2xl font-bold" style={{ color: "#2f8132" }}>{prescriptionCounts.active}</p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">eFaxed</p>
            <p className="text-2xl font-bold" style={{ color: "#1d4ed8" }}>{prescriptionCounts.sent}</p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Refill Requests</p>
            <p className="text-2xl font-bold" style={{ color: "#d97706" }}>{prescriptionCounts.refillRequested}</p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Discontinued</p>
            <p className="text-2xl font-bold text-slate-500">{prescriptionCounts.discontinued}</p>
          </div>
        </div>

        {/* Pending Refill Requests */}
        {(!apiPrescriptions && mockRefillRequests.length > 0) && (
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Pending Refill Requests</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mockRefillRequests.map((req) => (
                <div
                  key={req.id}
                  className="glass rounded-xl p-4 border-l-4"
                  style={{ borderLeftColor: "#d97706" }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-800">{req.patient}</p>
                      <p className="text-sm text-slate-600 mt-1">{req.medication} {req.dosage}</p>
                      <p className="text-xs text-slate-400 mt-1">Requested {req.requestedDate}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                        style={{ backgroundColor: "#27ab83" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                        onClick={() => handleRefillPrescription(req.id)}
                      >
                        Approve
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                        onClick={() => setConfirmDialog({ title: "Deny Refill", message: `Deny refill for ${req.medication} ${req.dosage}?`, confirmLabel: "Deny", danger: true, onConfirm: () => { handleDiscontinuePrescription(req.id); setConfirmDialog(null); } })}
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prescriptions table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Medication</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Dosage</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Frequency</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Prescriber</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Refills Left</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(apiPrescriptions || mockPrescriptions).map((rx) => {
                  const rsc = rxStatusConfig[rx.status];
                  return (
                    <tr key={rx.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">{rx.patient}</td>
                      <td className="px-4 py-3 text-slate-700">{rx.medication}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{rx.dosage}</td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{rx.frequency}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{rx.prescriber}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize" style={{ backgroundColor: rsc.bg, color: rsc.text }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: rsc.dot }} />
                          {rx.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{rx.refillsLeft}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="View prescription">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Edit prescription">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <MoreActionsDropdown actions={[
                            { label: "Download PDF", onClick: () => handleDownloadRxPdf(rx.id) },
                            { label: "eFax to Pharmacy", onClick: () => handleOpenEfax(rx) },
                            ...(rx.status === "active" ? [
                              { label: "Refill", onClick: () => handleRefillPrescription(rx.id) },
                              { label: "Discontinue", onClick: () => setConfirmDialog({ title: "Discontinue Prescription", message: `Discontinue ${rx.medication} ${rx.dosage} for ${rx.patient}?`, confirmLabel: "Discontinue", danger: true, onConfirm: () => { handleDiscontinuePrescription(rx.id); setConfirmDialog(null); } }), danger: true },
                            ] : []),
                            ...(rx.status === "refill_requested" ? [
                              { label: "Approve Refill", onClick: () => handleRefillPrescription(rx.id) },
                              { label: "Deny Refill", onClick: () => setConfirmDialog({ title: "Deny Refill", message: `Deny refill request for ${rx.medication}?`, confirmLabel: "Deny", danger: true, onConfirm: () => { handleDiscontinuePrescription(rx.id); setConfirmDialog(null); } }), danger: true },
                            ] : []),
                          ]} />
                        </div>
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

  // ─── Screenings Tab ───────────────────────────────────────────────────────

  function renderScreenings() {
    const instruments = [
      { id: "phq9", name: "PHQ-9", subtitle: "Patient Health Questionnaire", questions: 9, specialty: "Depression" },
      { id: "gad7", name: "GAD-7", subtitle: "Generalized Anxiety Disorder", questions: 7, specialty: "Anxiety" },
      { id: "asrs", name: "ASRS", subtitle: "Adult ADHD Self-Report Scale", questions: 18, specialty: "ADHD" },
    ];

    const specialtyConfig: Record<string, { bg: string; text: string }> = {
      Depression: { bg: "#e0e8f0", text: "#334e68" },
      Anxiety: { bg: "#fffbeb", text: "#d97706" },
      ADHD: { bg: "#e6f7f2", text: "#147d64" },
    };

    const mockRecentScreenings = [
      { id: "s1", date: "Mar 18, 2026", patient: "James Wilson", instrument: "PHQ-9", score: 7, severity: "Mild", administeredBy: "Dr. Michel" },
      { id: "s2", date: "Mar 18, 2026", patient: "James Wilson", instrument: "GAD-7", score: 6, severity: "Mild", administeredBy: "Dr. Michel" },
      { id: "s3", date: "Mar 17, 2026", patient: "Sarah Mitchell", instrument: "PHQ-9", score: 12, severity: "Moderate", administeredBy: "Dr. Michel" },
      { id: "s4", date: "Mar 16, 2026", patient: "Carlos Mendez", instrument: "GAD-7", score: 15, severity: "Severe", administeredBy: "Dr. Michel" },
      { id: "s5", date: "Mar 15, 2026", patient: "Emily Chen", instrument: "PHQ-9", score: 4, severity: "Minimal", administeredBy: "NP Johnson" },
      { id: "s6", date: "Mar 14, 2026", patient: "Robert Kim", instrument: "ASRS", score: 14, severity: "Moderate", administeredBy: "Dr. Michel" },
    ];

    const severityBadge = (sev: string) => {
      const config: Record<string, { bg: string; text: string }> = {
        Minimal: { bg: "#ecf9ec", text: "#2f8132" },
        Mild: { bg: "#fffbeb", text: "#d97706" },
        Moderate: { bg: "#fef2f2", text: "#dc2626" },
        Severe: { bg: "#fef2f2", text: "#991b1b" },
      };
      const c = config[sev] || config.Mild;
      return c;
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-800">Screenings</h2>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors shrink-0"
            style={{ backgroundColor: "#27ab83" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
            onClick={() => setToast({ message: "Screening administration coming soon.", type: "success" })}
          >
            <Plus className="w-4 h-4" />
            Administer Screening
          </button>
        </div>

        {/* Available Instruments */}
        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Available Instruments</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {instruments.map((inst) => {
              const sc = specialtyConfig[inst.specialty];
              return (
                <div key={inst.id} className="glass rounded-xl p-5 hover-lift cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-lg font-bold text-slate-800">{inst.name}</h4>
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                      {inst.specialty}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-3">{inst.subtitle}</p>
                  <p className="text-xs text-slate-400">{inst.questions} questions</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Results */}
        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Recent Results</h3>
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Patient</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Instrument</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Score</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Severity</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Administered By</th>
                  </tr>
                </thead>
                <tbody>
                  {mockRecentScreenings.map((scr) => {
                    const sb = severityBadge(scr.severity);
                    return (
                      <tr key={scr.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700">{scr.date}</td>
                        <td className="px-4 py-3 text-slate-700">{scr.patient}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs font-medium font-mono" style={{ backgroundColor: "#e0e8f0", color: "#334e68" }}>
                            {scr.instrument}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800">{scr.score}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: sb.bg, color: sb.text }}>
                            {scr.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{scr.administeredBy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Payments Tab ─────────────────────────────────────────────────────────

  function renderPayments() {
    const mockPayments = [
      { id: "pay1", date: "Mar 18, 2026", patient: "Sarah Mitchell", amount: 199.00, method: "card" as const, status: "succeeded" as const, invoice: "INV-1042" },
      { id: "pay2", date: "Mar 18, 2026", patient: "James Rivera", amount: 299.00, method: "card" as const, status: "succeeded" as const, invoice: "INV-1041" },
      { id: "pay3", date: "Mar 17, 2026", patient: "Emily Chen", amount: 99.00, method: "bank" as const, status: "succeeded" as const, invoice: "INV-1040" },
      { id: "pay4", date: "Mar 17, 2026", patient: "Tom Brown", amount: 99.00, method: "card" as const, status: "failed" as const, invoice: "INV-1043" },
      { id: "pay5", date: "Mar 16, 2026", patient: "Lisa Patel", amount: 99.00, method: "card" as const, status: "succeeded" as const, invoice: "INV-1038" },
      { id: "pay6", date: "Mar 16, 2026", patient: "Robert Kim", amount: 299.00, method: "card" as const, status: "succeeded" as const, invoice: "INV-1037" },
      { id: "pay7", date: "Mar 15, 2026", patient: "Rachel Adams", amount: 199.00, method: "bank" as const, status: "succeeded" as const, invoice: "INV-1034" },
      { id: "pay8", date: "Mar 15, 2026", patient: "Carlos Mendez", amount: 299.00, method: "card" as const, status: "succeeded" as const, invoice: "INV-1033" },
      { id: "pay9", date: "Mar 14, 2026", patient: "Angela Foster", amount: 99.00, method: "card" as const, status: "refunded" as const, invoice: "INV-1036" },
      { id: "pay10", date: "Mar 14, 2026", patient: "David Nguyen", amount: 99.00, method: "card" as const, status: "pending" as const, invoice: "INV-1035" },
    ];

    const payStatusConfig: Record<string, { bg: string; text: string; dot: string }> = {
      succeeded: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" },
      pending: { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" },
      failed: { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" },
      refunded: { bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" },
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Payments</h2>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">This Month</p>
            <p className="text-2xl font-bold" style={{ color: "#2f8132" }}>$8,400</p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Outstanding</p>
            <p className="text-2xl font-bold" style={{ color: "#d97706" }}>$450</p>
          </div>
          <div className="glass rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Refunded</p>
            <p className="text-2xl font-bold text-slate-500">$99</p>
          </div>
        </div>

        {/* Table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Method</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Invoice</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mockPayments.map((pay) => {
                  const psc = payStatusConfig[pay.status];
                  return (
                    <tr
                      key={pay.id}
                      className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                      style={pay.status === "failed" ? { backgroundColor: "rgba(254,242,242,0.5)" } : {}}
                    >
                      <td className="px-4 py-3 text-slate-700">{pay.date}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{pay.patient}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">${pay.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell capitalize">{pay.method === "card" ? "Card" : "Bank Transfer"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize" style={{ backgroundColor: psc.bg, color: psc.text }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: psc.dot }} />
                          {pay.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-slate-500 hidden md:table-cell">{pay.invoice}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          {pay.status === "failed" && (
                            <button
                              className="px-2 py-1 rounded text-xs font-medium transition-colors"
                              style={{ color: "#dc2626" }}
                            >
                              Retry
                            </button>
                          )}
                          <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
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

  // ─── Coupons Tab ──────────────────────────────────────────────────────────

  function renderCoupons() {
    const mockCoupons = [
      { id: "c1", code: "WELCOME20", description: "20% off first month", discountType: "percent" as const, discountValue: 20, usesCount: 8, usesMax: 50, validUntil: "Jun 30, 2026", status: "active" as const },
      { id: "c2", code: "ANNUAL10", description: "10% off annual plan", discountType: "percent" as const, discountValue: 10, usesCount: 3, usesMax: null, validUntil: "Dec 31, 2026", status: "active" as const },
      { id: "c3", code: "FRIEND50", description: "$50 off", discountType: "amount" as const, discountValue: 50, usesCount: 12, usesMax: 20, validUntil: "Sep 30, 2026", status: "active" as const },
      { id: "c4", code: "SUMMER2025", description: "1 month free", discountType: "free_months" as const, discountValue: 1, usesCount: 15, usesMax: 15, validUntil: "Aug 31, 2025", status: "expired" as const },
    ];

    const formatDiscount = (coupon: typeof mockCoupons[0]) => {
      if (coupon.discountType === "percent") return `${coupon.discountValue}% off`;
      if (coupon.discountType === "amount") return `$${coupon.discountValue} off`;
      return `${coupon.discountValue} month${coupon.discountValue > 1 ? "s" : ""} free`;
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Coupons</h2>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "#27ab83" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
          >
            <Plus className="w-4 h-4" />
            Create Coupon
          </button>
        </div>

        {/* Table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Discount</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Uses</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Valid Until</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mockCoupons.map((coupon) => (
                  <tr key={coupon.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded text-xs font-mono font-bold" style={{ backgroundColor: "#e6f7f2", color: "#147d64" }}>
                        {coupon.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{coupon.description}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium" style={{ color: "#D4A855" }}>{formatDiscount(coupon)}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                      {coupon.usesCount}/{coupon.usesMax ?? "unlimited"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{coupon.validUntil}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={coupon.status === "active" ? "active" : "cancelled"} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {coupon.status === "active" && (
                          <button
                            className="px-2 py-1 rounded text-xs font-medium transition-colors"
                            style={{ color: "#dc2626" }}
                          >
                            Deactivate
                          </button>
                        )}
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

  // ─── Providers Tab ────────────────────────────────────────────────────────

  function renderProviders() {
    const mockProviders = [
      {
        id: "prov1",
        name: "Nageley Michel",
        credentials: "DNP, PMHNP-BC",
        specialty: "Psychiatric Mental Health",
        panelCount: 45,
        panelMax: 400,
        panelStatus: "Open" as const,
        telehealth: true,
        initials: "NM",
      },
      {
        id: "prov2",
        name: "Amanda Johnson",
        credentials: "NP",
        specialty: "Family Medicine",
        panelCount: 28,
        panelMax: 300,
        panelStatus: "Open" as const,
        telehealth: true,
        initials: "AJ",
      },
      {
        id: "prov3",
        name: "David Chen",
        credentials: "MD",
        specialty: "Internal Medicine",
        panelCount: 12,
        panelMax: 350,
        panelStatus: "Waitlist" as const,
        telehealth: false,
        initials: "DC",
      },
    ];

    const panelStatusConfig: Record<string, { bg: string; text: string }> = {
      Open: { bg: "#ecf9ec", text: "#2f8132" },
      Closed: { bg: "#fef2f2", text: "#dc2626" },
      Waitlist: { bg: "#fffbeb", text: "#d97706" },
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Providers</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {mockProviders.map((prov) => {
            const panelPct = Math.round((prov.panelCount / prov.panelMax) * 100);
            const psc = panelStatusConfig[prov.panelStatus];
            return (
              <div key={prov.id} className="glass rounded-2xl p-6 hover-lift">
                {/* Avatar + Name */}
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                    style={{ backgroundColor: "#334e68" }}
                  >
                    {prov.initials}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{prov.name}, {prov.credentials}</h3>
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "#e6f7f2", color: "#147d64" }}>
                      {prov.specialty}
                    </span>
                  </div>
                </div>

                {/* Panel */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-slate-500">Panel</p>
                    <p className="text-xs font-medium text-slate-700">{prov.panelCount} of {prov.panelMax} members</p>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: "#e6f7f2" }}>
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${panelPct}%`, backgroundColor: "#27ab83" }}
                    />
                  </div>
                </div>

                {/* Status row */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: psc.bg, color: psc.text }}>
                    {prov.panelStatus}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Video className="w-3 h-3" />
                    Telehealth: {prov.telehealth ? (
                      <span style={{ color: "#2f8132" }}>Enabled</span>
                    ) : (
                      <span style={{ color: "#dc2626" }}>Disabled</span>
                    )}
                  </span>
                </div>

                {/* Buttons */}
                <div className="flex gap-2">
                  <button
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={{ borderColor: "#27ab83", color: "#27ab83" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e6f7f2")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                  >
                    View Schedule
                  </button>
                  <button className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                    Edit
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add Provider Card */}
          <div
            className="rounded-2xl flex flex-col items-center justify-center p-8 cursor-pointer transition-colors"
            style={{
              border: "2px dashed #cbd5e1",
              backgroundColor: "transparent",
              minHeight: "280px",
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
            <p className="text-base font-semibold text-slate-600">Add Provider</p>
            <p className="text-sm text-slate-400 mt-1 text-center">Onboard a new clinician</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Staff Tab ────────────────────────────────────────────────────────────

  function renderStaff() {
    const mockStaff = [
      { id: "st1", name: "Maria Garcia", email: "front.desk@example.com", role: "Front Desk", status: "active" as const, lastLogin: "Mar 18, 2026 9:15 AM" },
      { id: "st2", name: "Jessica Lee", email: "billing@example.com", role: "Billing Coordinator", status: "active" as const, lastLogin: "Mar 18, 2026 8:30 AM" },
      { id: "st3", name: "Tom Brown", email: "admin@example.com", role: "Office Manager", status: "active" as const, lastLogin: "Mar 17, 2026 5:00 PM" },
    ];

    const roleConfig: Record<string, { bg: string; text: string }> = {
      "Front Desk": { bg: "#e6f7f2", text: "#147d64" },
      "Billing Coordinator": { bg: "#fffbeb", text: "#d97706" },
      "Office Manager": { bg: "#e0e8f0", text: "#334e68" },
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Staff</h2>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "#27ab83" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
          >
            <UserPlus className="w-4 h-4" />
            Invite Staff
          </button>
        </div>

        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "rgba(16,42,67,0.03)" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Last Login</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mockStaff.map((staff) => {
                  const rc = roleConfig[staff.role] || roleConfig["Office Manager"];
                  return (
                    <tr key={staff.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">{staff.name}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{staff.email}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: rc.bg, color: rc.text }}>
                          {staff.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={staff.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{staff.lastLogin}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            className="px-2 py-1 rounded text-xs font-medium transition-colors"
                            style={{ color: "#dc2626" }}
                          >
                            Deactivate
                          </button>
                          <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
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

  // ─── Notifications Tab ────────────────────────────────────────────────────

  function renderNotifications() {
    const mockNotifications = [
      { id: "n1", title: "New member enrolled", description: "Sarah K. joined Complete Plan", time: "15 min ago", category: "members" as const, read: false },
      { id: "n2", title: "Appointment cancelled", description: "James W. cancelled Mar 25 visit", time: "1 hour ago", category: "appointments" as const, read: false },
      { id: "n3", title: "Payment received", description: "$199.00 from Lisa M.", time: "2 hours ago", category: "billing" as const, read: false },
      { id: "n4", title: "Refill request", description: "James W. requested Sertraline refill", time: "3 hours ago", category: "members" as const, read: false },
      { id: "n5", title: "Intake submitted", description: "New form from Robert D.", time: "5 hours ago", category: "members" as const, read: true },
      { id: "n6", title: "Appointment completed", description: "Dr. Michel with Sarah K.", time: "Yesterday", category: "appointments" as const, read: true },
      { id: "n7", title: "Payment failed", description: "Card declined for Tom B. ($99)", time: "Yesterday", category: "billing" as const, read: true },
      { id: "n8", title: "Member paused", description: "David R. paused membership", time: "2 days ago", category: "members" as const, read: true },
      { id: "n9", title: "Provider schedule updated", description: "Dr. Chen updated hours", time: "2 days ago", category: "system" as const, read: true },
      { id: "n10", title: "System maintenance completed", description: "All systems operational", time: "3 days ago", category: "system" as const, read: true },
    ];

    const filterTabs: { id: typeof notificationFilter; label: string }[] = [
      { id: "all", label: "All" },
      { id: "members", label: "Members" },
      { id: "appointments", label: "Appointments" },
      { id: "billing", label: "Billing" },
      { id: "system", label: "System" },
    ];

    const filtered = notificationFilter === "all"
      ? mockNotifications
      : mockNotifications.filter((n) => n.category === notificationFilter);

    const categoryIcon = (cat: string) => {
      switch (cat) {
        case "members": return { color: "#27ab83" };
        case "appointments": return { color: "#334e68" };
        case "billing": return { color: "#D4A855" };
        case "system": return { color: "#64748b" };
        default: return { color: "#64748b" };
      }
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Notifications</h2>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <Check className="w-4 h-4" />
            Mark All Read
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setNotificationFilter(tab.id)}
              className="px-4 py-2.5 text-sm font-medium capitalize transition-colors whitespace-nowrap"
              style={
                notificationFilter === tab.id
                  ? { color: "#27ab83", borderBottom: "2px solid #27ab83" }
                  : { color: "#64748b", borderBottom: "2px solid transparent" }
              }
              onMouseEnter={(e) => {
                if (notificationFilter !== tab.id) e.currentTarget.style.color = "#334e68";
              }}
              onMouseLeave={(e) => {
                if (notificationFilter !== tab.id) e.currentTarget.style.color = "#64748b";
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Notification Feed */}
        <div className="space-y-2">
          {filtered.map((notif) => {
            const ic = categoryIcon(notif.category);
            return (
              <div
                key={notif.id}
                className="glass rounded-xl p-4 flex items-start gap-3 transition-colors cursor-pointer hover:bg-slate-50"
                style={!notif.read ? { borderLeft: "3px solid #27ab83" } : { borderLeft: "3px solid transparent" }}
              >
                {/* Dot indicator */}
                <div className="mt-1.5 shrink-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: notif.read ? "#e2e8f0" : ic.color }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm ${notif.read ? "text-slate-600" : "text-slate-800 font-semibold"}`}>
                        {notif.title}
                      </p>
                      <p className="text-sm text-slate-500 mt-0.5">{notif.description}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">{notif.time}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No notifications in this category</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Tab Router ─────────────────────────────────────────────────────────

  function renderContent() {
    if (selectedPatient) return renderPatientDetail();

    switch (activeTab) {
      case "dashboard":
        return renderDashboard();
      case "programs":
        return <ProgramsSection />;
      case "roster":
        return renderRoster();
      case "intakes":
        return renderIntakes();
      case "waitlist":
        return renderWaitlist();
      case "plans":
        return renderPlans();
      case "appointments":
        return renderAppointments();
      case "telehealth":
        return renderTelehealth();
      case "encounters":
        return renderEncounters();
      case "prescriptions":
        return renderPrescriptions();
      case "screenings":
        return renderScreenings();
      case "invoices":
        return renderInvoices();
      case "payments":
        return renderPayments();
      case "coupons":
        return renderCoupons();
      case "providers":
        return renderProviders();
      case "staff":
        return renderStaff();
      case "messages":
        return renderMessages();
      case "notifications":
        return renderNotifications();
      case "compliance":
        return <AuditDashboard />;
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

        {/* Loading indicator */}
        {dataLoading && (
          <div className="h-0.5 w-full overflow-hidden" style={{ backgroundColor: "#e6f7f2" }}>
            <div className="h-full animate-pulse" style={{ backgroundColor: "#27ab83", width: "40%", animationDuration: "1s" }} />
          </div>
        )}

        {/* Page Content */}
        <main className="p-4 sm:p-6 lg:p-8">
          {renderContent()}
        </main>
      </div>

      {/* ─── Toast Notification ──────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white"
          style={{ backgroundColor: toast.type === "success" ? "#27ab83" : "#dc2626", minWidth: "280px" }}
        >
          {toast.type === "success" ? <Check className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="p-0.5 rounded shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── Confirm Dialog ──────────────────────────────────────────────── */}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          danger={confirmDialog.danger}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* ─── Book Appointment Modal ──────────────────────────────────────── */}
      {showBookAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="p-6" style={{ background: "linear-gradient(135deg, #1B2B4D, #243b53)" }}>
              <h3 className="text-xl font-bold text-white">Book Appointment</h3>
              <p className="text-sm text-slate-300 mt-1">Schedule a new appointment for a patient.</p>
            </div>
            <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={bookApptForm.patientId} onChange={e => setBookApptForm(f => ({ ...f, patientId: e.target.value }))}>
                  <option value="">Select patient...</option>
                  {(apiPatients || MOCK_PATIENTS).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={bookApptForm.scheduledAt} onChange={e => setBookApptForm(f => ({ ...f, scheduledAt: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Time *</label>
                  <input type="time" className="w-full border rounded-lg px-3 py-2 text-sm" value={bookApptForm.scheduledTime} onChange={e => setBookApptForm(f => ({ ...f, scheduledTime: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Duration (min)</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={bookApptForm.durationMinutes} onChange={e => setBookApptForm(f => ({ ...f, durationMinutes: e.target.value }))}>
                    <option value="15">15 min</option>
                    <option value="20">20 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={bookApptForm.appointmentTypeId} onChange={e => setBookApptForm(f => ({ ...f, appointmentTypeId: e.target.value }))}>
                    <option value="">General Visit</option>
                    <option value="follow_up">Follow-Up</option>
                    <option value="initial">Initial Evaluation</option>
                    <option value="telehealth">Telehealth</option>
                    <option value="lab_review">Lab Review</option>
                    <option value="wellness">Wellness Check</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Program</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={bookApptForm.programId} onChange={e => setBookApptForm(f => ({ ...f, programId: e.target.value }))}>
                  <option value="">No program</option>
                  {apiPrograms.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  {apiPrograms.length === 0 && <>
                    <option value="dpc">DPC Membership</option>
                    <option value="ccm">CCM</option>
                    <option value="rpm">RPM</option>
                  </>}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={bookApptForm.isTeleHealth} onChange={e => setBookApptForm(f => ({ ...f, isTeleHealth: e.target.checked }))} className="accent-teal-600" />
                  <span className="text-sm text-slate-700">Telehealth visit</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={bookApptForm.notes} onChange={e => setBookApptForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => setShowBookAppointment(false)}>Cancel</button>
              <button
                className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#27ab83" }}
                onClick={handleBookAppointment}
                disabled={bookApptLoading}
              >
                {bookApptLoading ? "Booking..." : "Book Appointment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── New Encounter Modal ─────────────────────────────────────────── */}
      {showNewEncounter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="p-6" style={{ background: "linear-gradient(135deg, #1B2B4D, #243b53)" }}>
              <h3 className="text-xl font-bold text-white">New Encounter</h3>
              <p className="text-sm text-slate-300 mt-1">Create a clinical encounter to document a visit.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={encounterForm.patientId} onChange={e => setEncounterForm(f => ({ ...f, patientId: e.target.value }))}>
                  <option value="">Select patient...</option>
                  {(apiPatients || MOCK_PATIENTS).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Encounter Type</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={encounterForm.encounterType} onChange={e => setEncounterForm(f => ({ ...f, encounterType: e.target.value }))}>
                    <option value="initial_eval">Initial Evaluation</option>
                    <option value="follow_up">Follow-Up</option>
                    <option value="med_management">Med Management</option>
                    <option value="therapy">Therapy</option>
                    <option value="crisis">Crisis</option>
                    <option value="care_coordination">Care Coordination</option>
                    <option value="device_review">Device Review</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={encounterForm.encounterDate} onChange={e => setEncounterForm(f => ({ ...f, encounterDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Program</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={encounterForm.programId} onChange={e => setEncounterForm(f => ({ ...f, programId: e.target.value }))}>
                  <option value="">No program</option>
                  {apiPrograms.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  {apiPrograms.length === 0 && <>
                    <option value="dpc">DPC Membership</option>
                    <option value="ccm">CCM</option>
                    <option value="rpm">RPM</option>
                  </>}
                </select>
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => setShowNewEncounter(false)}>Cancel</button>
              <button
                className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#27ab83" }}
                onClick={handleCreateEncounter}
                disabled={encounterLoading}
              >
                {encounterLoading ? "Creating..." : "Create Encounter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── New Prescription Modal ──────────────────────────────────────── */}
      {showNewPrescription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="p-6" style={{ background: "linear-gradient(135deg, #1B2B4D, #243b53)" }}>
              <h3 className="text-xl font-bold text-white">New Prescription</h3>
              <p className="text-sm text-slate-300 mt-1">Prescribe a medication for a patient.</p>
            </div>
            <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={rxForm.patientId} onChange={e => setRxForm(f => ({ ...f, patientId: e.target.value }))}>
                  <option value="">Select patient...</option>
                  {(apiPatients || MOCK_PATIENTS).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Medication Name *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={rxForm.medicationName} onChange={e => setRxForm(f => ({ ...f, medicationName: e.target.value }))} placeholder="e.g. Sertraline" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dosage *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={rxForm.dosage} onChange={e => setRxForm(f => ({ ...f, dosage: e.target.value }))} placeholder="e.g. 100mg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={rxForm.frequency} onChange={e => setRxForm(f => ({ ...f, frequency: e.target.value }))} placeholder="e.g. Daily" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Route</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={rxForm.route} onChange={e => setRxForm(f => ({ ...f, route: e.target.value }))}>
                    <option value="oral">Oral</option>
                    <option value="topical">Topical</option>
                    <option value="injectable">Injectable</option>
                    <option value="sublingual">Sublingual</option>
                    <option value="inhaled">Inhaled</option>
                    <option value="transdermal">Transdermal</option>
                    <option value="rectal">Rectal</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                  <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={rxForm.quantity} onChange={e => setRxForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Refills</label>
                  <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={rxForm.refills} onChange={e => setRxForm(f => ({ ...f, refills: e.target.value }))} />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={rxForm.isControlled} onChange={e => setRxForm(f => ({ ...f, isControlled: e.target.checked }))} className="accent-teal-600" />
                    <span className="text-sm text-slate-700">Controlled substance</span>
                  </label>
                </div>
              </div>
              {rxForm.isControlled && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Schedule</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={rxForm.schedule} onChange={e => setRxForm(f => ({ ...f, schedule: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="II">Schedule II</option>
                    <option value="III">Schedule III</option>
                    <option value="IV">Schedule IV</option>
                    <option value="V">Schedule V</option>
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pharmacy Name</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={rxForm.pharmacyName} onChange={e => setRxForm(f => ({ ...f, pharmacyName: e.target.value }))} placeholder="CVS Pharmacy" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pharmacy Phone</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={rxForm.pharmacyPhone} onChange={e => setRxForm(f => ({ ...f, pharmacyPhone: e.target.value }))} placeholder="(555) 123-4567" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={rxForm.notes} onChange={e => setRxForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => setShowNewPrescription(false)}>Cancel</button>
              <button
                className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#27ab83" }}
                onClick={handleCreatePrescription}
                disabled={rxLoading}
              >
                {rxLoading ? "Creating..." : "Create Prescription"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── eFax Prescription Modal ────────────────────────────────────── */}
      {showEfaxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6" style={{ background: "linear-gradient(135deg, #1B2B4D, #243b53)" }}>
              <h3 className="text-xl font-bold text-white">eFax Prescription to Pharmacy</h3>
              <p className="text-sm text-slate-300 mt-1">Send this prescription via secure eFax.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-lg p-4" style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div className="text-sm text-slate-500">Medication</div>
                <div className="font-semibold text-slate-800">{efaxTarget.medication} {efaxTarget.dosage}</div>
                <div className="text-sm text-slate-500 mt-2">Patient</div>
                <div className="font-medium text-slate-700">{efaxTarget.patient}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pharmacy Fax Number *</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={efaxFaxNumber}
                  onChange={e => setEfaxFaxNumber(e.target.value)}
                  placeholder="(407) 555-9877"
                />
                <p className="text-xs text-slate-400 mt-1">Enter the pharmacy fax number including area code.</p>
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => setShowEfaxModal(false)}>Cancel</button>
              <button
                className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#1d4ed8" }}
                onClick={handleSendEfax}
                disabled={efaxLoading}
              >
                {efaxLoading ? "Sending..." : "Send eFax"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Patient Modal ──────────────────────────────────────────── */}
      {showEditPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="p-6" style={{ background: "linear-gradient(135deg, #1B2B4D, #243b53)" }}>
              <h3 className="text-xl font-bold text-white">Edit Patient</h3>
              <p className="text-sm text-slate-300 mt-1">Update patient information.</p>
            </div>
            <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={editPatientForm.firstName} onChange={e => setEditPatientForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={editPatientForm.lastName} onChange={e => setEditPatientForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={editPatientForm.dateOfBirth} onChange={e => setEditPatientForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={editPatientForm.gender} onChange={e => setEditPatientForm(f => ({ ...f, gender: e.target.value }))}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm" value={editPatientForm.email} onChange={e => setEditPatientForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input type="tel" className="w-full border rounded-lg px-3 py-2 text-sm" value={editPatientForm.phone} onChange={e => setEditPatientForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={editPatientForm.addressLine1} onChange={e => setEditPatientForm(f => ({ ...f, addressLine1: e.target.value }))} placeholder="Street address" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={editPatientForm.city} onChange={e => setEditPatientForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={editPatientForm.state} onChange={e => setEditPatientForm(f => ({ ...f, state: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={editPatientForm.zip} onChange={e => setEditPatientForm(f => ({ ...f, zip: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Language</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={editPatientForm.preferredLanguage} onChange={e => setEditPatientForm(f => ({ ...f, preferredLanguage: e.target.value }))} />
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => setShowEditPatient(false)}>Cancel</button>
              <button
                className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#27ab83" }}
                onClick={handleEditPatient}
                disabled={editPatientLoading}
              >
                {editPatientLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
