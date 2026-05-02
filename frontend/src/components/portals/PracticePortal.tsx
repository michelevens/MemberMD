// ===== Practice Portal =====
// Main dashboard for DPC practice owners/admins — manage membership practice
// Tabs: Dashboard, Patient Roster, Membership Plans, Appointments, Messages, Invoices, + Coming Soon tabs

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ProviderDetailPage } from "./ProviderDetailPage";
import { useAuth } from "../../contexts/AuthContext";
import { dashboardService, membershipPlanService, messageService, patientService, appointmentService, encounterService, prescriptionService, invoiceService, programService, telehealthService, screeningService, couponService, providerService, paymentService, notificationService, apiFetch, billingEnhancedService, documentService, onboardingService } from "../../lib/api";
import { PortalShell, type NavSection as ShellNavSection, type PortalColor } from "../shared/PortalShell";
import { CommandPalette, useCommandPaletteShortcut } from "../shared/CommandPalette";
import { AddAllergyDialog, type AllergyEntry } from "../clinical/AddAllergyDialog";
import { AddMeasureDialog } from "../clinical/AddMeasureDialog";
import { AIDocumentationAssistant } from "../clinical/AIDocumentationAssistant";
import { CareTimeline, generateDemoTimelineEvents } from "../clinical/CareTimeline";
import { PatientConsentsTab } from "./practice/PatientConsentsTab";
import { MedicationAutocomplete } from "../shared/MedicationAutocomplete";
import { PracticeSettings } from "../settings/PracticeSettings";
import { CalendarView } from "../shared/CalendarView";
import { AppointmentBookingWidget } from "../widgets/AppointmentBookingWidget";
import { AuditDashboard } from "../shared/AuditDashboard";
import { EngagementSection } from "../shared/EngagementSection";
import { ProfilePage } from "../profile/ProfilePage";
import { ProviderAnalyticsSection } from "../shared/ProviderAnalyticsSection";
import { ProgramsSection } from "./ProgramsSection";
import { RevenueAnalyticsTab } from "./RevenueAnalyticsTab";
import { DunningDashboardTab } from "./DunningDashboardTab";
import { ReferralManagementTab } from "./ReferralManagementTab";
import { EngagementDashboardTab } from "./EngagementDashboardTab";
import { CareCoordinationTab } from "./CareCoordinationTab";
import { LabOrdersTab } from "./LabOrdersTab";
import { EmployerManagementTab } from "./EmployerManagementTab";
import { InventoryTab } from "./InventoryTab";
import { CommunicationsTab } from "./CommunicationsTab";
import { ActivityLoggerTab } from "./ActivityLoggerTab";
import { ALaCarteTab } from "./ALaCarteTab";
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
  Sparkles,
  X,
  DollarSign,
  TrendingUp,
  Search,
  Plus,
  Pencil,
  Send,
  Check,
  Star,
  Shield,
  Heart,
  Phone,
  Video,
  Crown,
  Key,
  UserPlus,
  ArrowLeft,
  Download,
  ChevronDown,
  ChevronUp,
  Layers,
  Copy,
  Wifi,
  XCircle,
  AlertTriangle,
  BarChart3,
  AlertCircle,
  GitBranch,
  Crosshair,
  FlaskConical,
  Building2,
  Package,
  Radio,
  Trash2,
  Megaphone,
} from "lucide-react";
import { RefreshButton } from "../shared/RefreshButton";
import { OnboardingChecklist, ConnectSetupBanner } from "../shared/OnboardingChecklist";
import {
  DataTable,
  DetailDrawer,
  EntityId,
  FilterChips,
  MoneyAmount,
  StatusPill,
} from "../shared/stripe-ui";

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
  | "profile"
  | "engagement"
  | "analytics"
  | "compliance"
  | "practice-settings"
  | "branding"
  | "revenue-analytics"
  | "dunning"
  | "referrals"
  | "care-coordination"
  | "lab-orders"
  | "employers"
  | "inventory"
  | "communications"
  | "activity-log"
  | "recent-activity"
  | "a-la-carte";

/** Practice-portal user roles that affect what's visible in the sidebar. */
type PortalRole = "practice_admin" | "provider" | "staff" | "superadmin";

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
  /**
   * Roles that can see this nav item. Omit (default) = visible to all
   * practice-portal roles. Providers see their clinical surface; staff
   * see operational tabs without billing/settings; admin sees everything.
   */
  roles?: PortalRole[];
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
      // Programs is admin-only \u2014 providers don't configure DPC programs.
      { id: "programs", label: "Programs", icon: Layers, roles: ["practice_admin", "superadmin"] },
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
      // Clinical surface \u2014 visible to admins and providers, hidden from staff.
      { id: "appointments", label: "Appointments", icon: Calendar, roles: ["practice_admin", "provider", "superadmin"] },
      { id: "telehealth", label: "Telehealth", icon: Video, roles: ["practice_admin", "provider", "superadmin"] },
      { id: "encounters", label: "Encounters", icon: Stethoscope, roles: ["practice_admin", "provider", "superadmin"] },
      { id: "prescriptions", label: "Prescriptions", icon: Pill, roles: ["practice_admin", "provider", "superadmin"] },
      { id: "screenings", label: "Screenings", icon: Activity, roles: ["practice_admin", "provider", "superadmin"] },
      { id: "lab-orders", label: "Lab Orders", icon: FlaskConical, roles: ["practice_admin", "provider", "superadmin"] },
      { id: "referrals", label: "Referrals", icon: GitBranch, roles: ["practice_admin", "provider", "superadmin"] },
      { id: "care-coordination", label: "Care Coordination", icon: Crosshair, roles: ["practice_admin", "provider", "superadmin"] },
      { id: "recent-activity", label: "Recent Activity", icon: Clock, roles: ["practice_admin", "provider", "superadmin"] },
    ],
  },
  {
    title: "Billing",
    items: [
      // Billing surface \u2014 admins and staff manage; providers don't.
      { id: "plans", label: "Membership Plans", icon: CreditCard, roles: ["practice_admin", "staff", "superadmin"] },
      { id: "invoices", label: "Invoices", icon: FileText, roles: ["practice_admin", "staff", "superadmin"] },
      { id: "payments", label: "Payments", icon: Receipt, roles: ["practice_admin", "staff", "superadmin"] },
      { id: "coupons", label: "Coupons", icon: Ticket, roles: ["practice_admin", "staff", "superadmin"] },
      { id: "revenue-analytics", label: "Revenue Analytics", icon: BarChart3, roles: ["practice_admin", "superadmin"] },
      { id: "dunning", label: "Payment Recovery", icon: AlertCircle, roles: ["practice_admin", "staff", "superadmin"] },
      { id: "employers", label: "Employers", icon: Building2, roles: ["practice_admin", "staff", "superadmin"] },
    ],
  },
  {
    title: "Team",
    items: [
      // Team management \u2014 admin only.
      { id: "providers", label: "Providers", icon: UserCog, roles: ["practice_admin", "superadmin"] },
      { id: "staff", label: "Staff", icon: UsersRound, roles: ["practice_admin", "superadmin"] },
    ],
  },
  {
    title: "Operations",
    items: [
      { id: "inventory", label: "Inventory", icon: Package, roles: ["practice_admin", "staff", "superadmin"] },
      // engagement (Patient Engagement) appeared in BOTH Operations and
      // Engagement sections originally \u2014 duplicate id was a TS-quietly-
      // deduped bug. Now lives only in Engagement section below.
      { id: "communications", label: "Communications", icon: Radio, roles: ["practice_admin", "staff", "superadmin"] },
      { id: "activity-log", label: "Activity Log", icon: ClipboardList, roles: ["practice_admin", "provider", "staff", "superadmin"] },
      { id: "a-la-carte", label: "\u00C0 La Carte", icon: DollarSign, roles: ["practice_admin", "staff", "superadmin"] },
    ],
  },
  {
    title: "Communications",
    items: [
      // All roles need messaging.
      { id: "messages", label: "Messages", icon: MessageSquare },
      { id: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "Engagement",
    items: [
      { id: "engagement", label: "Patient Engagement", icon: Megaphone, roles: ["practice_admin", "superadmin"] },
      { id: "analytics", label: "Provider Analytics", icon: BarChart3, roles: ["practice_admin", "superadmin"] },
    ],
  },
  {
    title: "Compliance",
    items: [
      // HIPAA + audit log \u2014 admin/superadmin only.
      { id: "compliance", label: "HIPAA & Audit", icon: Shield, roles: ["practice_admin", "superadmin"] },
    ],
  },
  {
    title: "Settings",
    items: [
      // Practice settings \u2014 admin only.
      { id: "practice-settings", label: "Practice Settings", icon: Settings, roles: ["practice_admin", "superadmin"] },
      { id: "branding", label: "Branding", icon: Palette, roles: ["practice_admin", "superadmin"] },
    ],
  },
];

/**
 * Filter NAV_SECTIONS to only the items the given role can see, and
 * drop sections that end up empty. Returns the same shape ready for
 * PortalShell (after a small transform \u2014 PortalShell expects
 * { id, label?, items } per section).
 */
function navForRole(role: PortalRole): NavSection[] {
  return NAV_SECTIONS
    .map((section) => ({
      title: section.title,
      items: section.items.filter((it) => !it.roles || it.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}

// ─── Demo Mode ──────────────────────────────────────────────────────────────
const isDemoMode = import.meta.env.VITE_DEMO_MODE !== "false";

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
  /** Linked User account id (null for legacy patients with no portal account). */
  userId?: string | null;
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
  membershipId?: string;
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

/**
 * Format a date-of-birth value for display. The API returns ISO strings
 * like "1988-05-18T00:00:00.000000Z"; we render them as "May 18, 1988".
 * Defensive against bad inputs (returns "" so the caller's "—" fallback
 * fires instead of "Invalid Date").
 */
function formatDob(value: string | null | undefined): string {
  if (!value) return "";
  // Strip time portion if present so timezone shifts don't move the date
  // by a day (DOB is calendar-day, not an instant).
  const dateOnly = String(value).slice(0, 10);
  const d = new Date(dateOnly + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Small label/value field for the Stripe-style detail drawer. Pattern
 * mirrors Stripe's invoice / customer detail panels: 11px uppercase
 * label, 13-14px slate-800 value, single-line layout that wraps when
 * the value is verbose.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 pt-0.5">
        {label}
      </span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

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
  const location = useLocation();
  // Sub-route detection: /practice/providers/:id renders the provider
  // detail page INSIDE the portal so the sidebar stays. Reading the
  // hash directly rather than nested <Routes> avoids a wider refactor.
  const providerDetailMatch = /^\/practice\/providers\/([^/?]+)/.exec(location.pathname);
  const selectedProviderId = providerDetailMatch ? providerDetailMatch[1] : null;
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [selectedThread, setSelectedThread] = useState(isDemoMode ? MOCK_THREADS[0].id : "");
  const [searchQuery, setSearchQuery] = useState("");
  // Stripe-style roster: stackable filter chips on top of the existing search.
  const [rosterFilters, setRosterFilters] = useState<import("../shared/stripe-ui").ActiveFilter[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<MockPatient | null>(null);
  // Reset-link modal — admin tool for "the patient never got the
  // password-reset email, give me the link directly."
  const [resetLinkModal, setResetLinkModal] = useState<{ url: string; patientName: string } | null>(null);
  // Add-allergy dialog — opened from the patient detail Medical tab.
  const [allergyDialogOpen, setAllergyDialogOpen] = useState(false);
  // Add-measure (PHQ-9 / GAD-7 / etc.) dialog — patient detail Screenings tab.
  const [measureDialogOpen, setMeasureDialogOpen] = useState(false);
  // Documentation Assistant — opens from inside the SOAP editor; generates
  // a draft from a few quick prompts and inserts it back into soapForm.
  const [docAssistantOpen, setDocAssistantOpen] = useState(false);
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
  // Raw unmapped encounter rows from the API — kept alongside the
  // tab-table-shaped apiEncounters so the patient detail Encounters
  // subtab can render full SOAP content (chief_complaint, subjective,
  // objective, assessment, plan) for THIS patient. Without this, the
  // patient subtab only had access to display-summary fields.
  const [apiEncountersRaw, setApiEncountersRaw] = useState<any[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiPrescriptions, setApiPrescriptions] = useState<any[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiInvoices, setApiInvoices] = useState<any[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiScreenings, setApiScreenings] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiPayments, setApiPayments] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiCoupons, setApiCoupons] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiStaff, setApiStaff] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiNotifications, setApiNotifications] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiIntakes, setApiIntakes] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiWaitlist, setApiWaitlist] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  // First provider in the practice — used as a default provider_id when
  // the create-encounter / create-prescription forms don't expose a
  // picker. Most solo-DPC practices have one provider so this is the
  // right answer; multi-provider clinics get a TODO to add a picker.
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null);
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

  // ─── Administer Screening Modal ──────────────────────────────────────
  const [showNewScreening, setShowNewScreening] = useState(false);
  const [screeningForm, setScreeningForm] = useState({ patientId: "", instrumentId: "phq9", score: "", notes: "" });
  const [screeningLoading, setScreeningLoading] = useState(false);

  // ─── Create Coupon Modal ──────────────────────────────────────────────
  const [showNewCoupon, setShowNewCoupon] = useState(false);
  const [couponForm, setCouponForm] = useState({ code: "", description: "", discountType: "percent" as "percent" | "amount" | "free_months", discountValue: "", maxUses: "", validUntil: "" });
  const [couponLoading, setCouponLoading] = useState(false);

  // ─── Add Provider Modal ───────────────────────────────────────────────
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({ firstName: "", lastName: "", credentials: "", specialty: "", npiNumber: "", email: "", phone: "", telehealth: false });
  const [addProviderLoading, setAddProviderLoading] = useState(false);

  // ─── Edit Provider Modal ──────────────────────────────────────────────
  const [showEditProvider, setShowEditProvider] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [editProviderForm, setEditProviderForm] = useState({ firstName: "", lastName: "", credentials: "", specialty: "", npiNumber: "", email: "", phone: "", telehealth: false });
  const [editProviderLoading, setEditProviderLoading] = useState(false);

  // ─── Invite Staff Modal ───────────────────────────────────────────────
  const [showInviteStaff, setShowInviteStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: "", email: "", role: "Front Desk" });
  const [inviteStaffLoading, setInviteStaffLoading] = useState(false);

  // ─── Inline Invoice Detail ──────────────────────────────────────────
  // Stripe-style invoices view: search box, filter chips, slide-over detail.
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceFilters, setInvoiceFilters] = useState<import("../shared/stripe-ui").ActiveFilter[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  // Stripe-style payments view: same pattern.
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentFilters, setPaymentFilters] = useState<import("../shared/stripe-ui").ActiveFilter[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  // Stripe-style coupons view.
  const [couponSearch, setCouponSearch] = useState("");
  const [couponFilters, setCouponFilters] = useState<import("../shared/stripe-ui").ActiveFilter[]>([]);
  // Stripe-style staff view.
  const [staffSearch, setStaffSearch] = useState("");
  const [staffFilters, setStaffFilters] = useState<import("../shared/stripe-ui").ActiveFilter[]>([]);
  // Stripe-style prescriptions view.
  const [prescriptionSearch, setPrescriptionSearch] = useState("");
  const [prescriptionFilters, setPrescriptionFilters] = useState<import("../shared/stripe-ui").ActiveFilter[]>([]);
  // Stripe-style encounters view.
  const [encounterSearch, setEncounterSearch] = useState("");
  const [encounterFilters, setEncounterFilters] = useState<import("../shared/stripe-ui").ActiveFilter[]>([]);
  // Stripe-style intakes view.
  const [intakeSearch, setIntakeSearch] = useState("");
  const [intakeFilters, setIntakeFilters] = useState<import("../shared/stripe-ui").ActiveFilter[]>([]);
  // Stripe-style waitlist view.
  const [waitlistSearch, setWaitlistSearch] = useState("");
  const [waitlistFilters, setWaitlistFilters] = useState<import("../shared/stripe-ui").ActiveFilter[]>([]);

  // ─── Create Plan Modal ─────────────────────────────────────────────
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [createPlanForm, setCreatePlanForm] = useState({ name: "", monthlyPrice: "", annualPrice: "", description: "" });
  const [createPlanLoading, setCreatePlanLoading] = useState(false);

  // ─── Edit Plan Modal ──────────────────────────────────────────────
  const [showEditPlan, setShowEditPlan] = useState(false);
  const [editPlanForm, setEditPlanForm] = useState({ id: "", name: "", monthlyPrice: "", annualPrice: "", description: "" });
  const [editPlanLoading, setEditPlanLoading] = useState(false);

  // ─── Plan Entitlements Builder ───────────────────────────────────────
  interface PlanEntitlementRow {
    tempId: string;
    entitlementTypeId: string;
    typeName: string;
    quantity: number;
    unlimited: boolean;
    period: "monthly" | "quarterly" | "yearly";
    overagePolicy: "block" | "charge" | "notify" | "allow";
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entitlementTypes, setEntitlementTypes] = useState<any[]>([]);
  const [entitlementTypesLoading, setEntitlementTypesLoading] = useState(false);
  const [createPlanEntitlements, setCreatePlanEntitlements] = useState<PlanEntitlementRow[]>([]);
  const [showCreatePlanEntPicker, setShowCreatePlanEntPicker] = useState(false);
  const [editPlanEntitlements, setEditPlanEntitlements] = useState<PlanEntitlementRow[]>([]);
  const [editPlanExistingEntitlementIds, setEditPlanExistingEntitlementIds] = useState<string[]>([]);

  // ─── Plan Detail View ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [planDetailTab, setPlanDetailTab] = useState<"overview" | "entitlements" | "members" | "utilization" | "revenue">("overview");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [planDetailEntitlements, setPlanDetailEntitlements] = useState<any[]>([]);
  const [planDetailEntitlementsLoading, setPlanDetailEntitlementsLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [planDetailMembers, setPlanDetailMembers] = useState<any[]>([]);
  const [planDetailMembersLoading, setPlanDetailMembersLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [planDetailUsage, setPlanDetailUsage] = useState<any[]>([]);
  const [planDetailUsageLoading, setPlanDetailUsageLoading] = useState(false);
  // Entitlement editing within plan detail
  const [planDetailEditingEntitlement, setPlanDetailEditingEntitlement] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [planDetailEditForm, setPlanDetailEditForm] = useState<any>({});
  const [planDetailShowAddEntitlement, setPlanDetailShowAddEntitlement] = useState(false);

  // ─── Patient Utilization ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [patientUtilization, setPatientUtilization] = useState<any[] | null>(null);
  const [utilizationLoading, setUtilizationLoading] = useState(false);

  // ─── Patient Activity Log (patient detail) ────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [patientActivities, setPatientActivities] = useState<any[]>([]);
  const [patientActivitiesLoading, setPatientActivitiesLoading] = useState(false);
  const [patientActivitiesPage, setPatientActivitiesPage] = useState(1);
  const [patientActivitiesTotalPages, setPatientActivitiesTotalPages] = useState(1);

  // ─── Patient Detail per-tab data slots ───────────────────────────────
  // Each sub-tab in the patient drawer loads its own scoped fetch when
  // the patient is opened. Without this every sub-tab fell back to
  // demo-only mocks that resolved to [] in production. Slots that the
  // sub-tabs read are checked individually; the unused ones are still
  // populated so activating their tab doesn't require a fresh fetch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ptApiAppointments, setPtApiAppointments] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ptApiPrescriptions, setPtApiPrescriptions] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [_ptApiEncounters, setPtApiEncounters] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [_ptApiInvoices, setPtApiInvoices] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [_ptApiScreenings, setPtApiScreenings] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [_ptApiDocuments, setPtApiDocuments] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [_ptApiMessages, setPtApiMessages] = useState<any[]>([]);

  // ─── Roster Cancel Membership Dialog ───────────────────────────────────
  const [rosterCancelDialog, setRosterCancelDialog] = useState<{ patientId: string; patientName: string; membershipId: string } | null>(null);
  const [rosterCancelReason, setRosterCancelReason] = useState("");
  const [rosterCancelStep, setRosterCancelStep] = useState<"reason" | "offers" | "confirm">("reason");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [retentionOffers, setRetentionOffers] = useState<any[]>([]);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [rosterCancelLoading, setRosterCancelLoading] = useState(false);

  // ─── Roster Enroll/Change Plan Dialog ──────────────────────────────────
  const [rosterPlanDialog, setRosterPlanDialog] = useState<{ patientId: string; patientName: string; membershipId?: string; mode: "enroll" | "change" } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rosterAvailablePlans, setRosterAvailablePlans] = useState<any[]>([]);
  const [rosterAvailablePlansLoading, setRosterAvailablePlansLoading] = useState(false);
  const [rosterSelectedPlanId, setRosterSelectedPlanId] = useState<string | null>(null);
  const [rosterPlanActionLoading, setRosterPlanActionLoading] = useState(false);
  const [rosterCompEnabled, setRosterCompEnabled] = useState(false);
  const [rosterCompReason, setRosterCompReason] = useState("");

  // ─── Quick Activity Log Form (patient detail) ─────────────────────────
  const [showQuickActivityLog, setShowQuickActivityLog] = useState(false);
  const [quickActivityForm, setQuickActivityForm] = useState({ activityType: "", durationMinutes: "15", notes: "" });
  const [quickActivityLoading, setQuickActivityLoading] = useState(false);

  // ─── API Programs for dropdowns ─────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiPrograms, setApiPrograms] = useState<any[]>([]);

  const loadPracticeData = useCallback(async () => {
    setDataLoading(true);
    const [statsRes, plansRes, threadsRes, patientsRes, appointmentsRes, encountersRes, prescriptionsRes, invoicesRes, programsRes, screeningsRes, paymentsRes, couponsRes, staffRes, notificationsRes, intakesRes, waitlistRes, providersRes] = await Promise.allSettled([
      dashboardService.getPracticeStats(),
      membershipPlanService.list(),
      messageService.list(),
      patientService.list(),
      appointmentService.list(),
      encounterService.list(),
      prescriptionService.list(),
      invoiceService.list(),
      programService.list(),
      screeningService.list(),
      paymentService.list(),
      couponService.list(),
      apiFetch<unknown[]>("/staff").catch(() => ({ data: [] })),
      notificationService.list().catch(() => ({ data: [] })),
      apiFetch<unknown[]>("/intakes").catch(() => ({ data: [] })),
      apiFetch<unknown[]>("/appointments/waitlist").catch(() => ({ data: [] })),
      providerService.list().catch(() => ({ data: [] })),
    ]);
    // Dashboard stats
    if (statsRes.status === "fulfilled" && statsRes.value.data && typeof statsRes.value.data === "object") {
      setApiDashStats(statsRes.value.data);
      setIsRealApi(true);
    }
    // Plans
    if (plansRes.status === "fulfilled" && plansRes.value.data && Array.isArray(plansRes.value.data)) {
      setApiPlans(plansRes.value.data);
    }
    // Threads
    if (threadsRes.status === "fulfilled" && threadsRes.value.data && Array.isArray(threadsRes.value.data)) {
      setApiThreads(threadsRes.value.data);
    }
    // Patients (API returns paginated: {current_page, data: [...], ...})
    if (patientsRes.status === "fulfilled" && patientsRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patientList = Array.isArray(patientsRes.value.data) ? patientsRes.value.data : (patientsRes.value.data as any).data || [];
      if (patientList.length > 0) console.log("[MemberMD] First patient raw data:", JSON.stringify(patientList[0]).slice(0, 500));
      setApiPatients(patientList.map((p: any) => {
        if (p.activeMembership) console.log("[MemberMD] Patient membership:", p.firstName, "plan:", p.activeMembership?.plan?.name, "memberNumber:", p.activeMembership?.memberNumber);
        return {
        id: p.id,
        userId: p.userId || p.user_id || p.user?.id || null,
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
        membershipId: p.activeMembership?.id || "",
        memberSince: p.createdAt || "",
        dob: p.dateOfBirth || p.dob || "",
        gender: p.gender || "",
        pronouns: p.pronouns || "",
        language: p.language || "",
        address: [p.addressLine1, p.addressLine2, p.city, p.state, p.zip].filter(Boolean).join(", ") || p.address || "",
        visitsUsed: p.activeMembership?.visitsUsed ?? 0,
        visitsTotal: p.activeMembership?.visitsTotal ?? 0,
        provider: p.primaryProvider?.name || p.providerName || "",
      };
      }));
    }
    // Appointments (API returns paginated)
    if (appointmentsRes.status === "fulfilled" && appointmentsRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apptList = Array.isArray(appointmentsRes.value.data) ? appointmentsRes.value.data : (appointmentsRes.value.data as any).data || [];
      setApiAppointments(apptList.map((a: any) => ({
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
    // Encounters (API returns paginated)
    if (encountersRes.status === "fulfilled" && encountersRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encList = Array.isArray(encountersRes.value.data) ? encountersRes.value.data : (encountersRes.value.data as any).data || [];
      setApiEncountersRaw(encList);
      setApiEncounters(encList.map((e: any) => ({
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
    // Prescriptions (API returns paginated)
    if (prescriptionsRes.status === "fulfilled" && prescriptionsRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rxList = Array.isArray(prescriptionsRes.value.data) ? prescriptionsRes.value.data : (prescriptionsRes.value.data as any).data || [];
      setApiPrescriptions(rxList.map((rx: any) => ({
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
    // Invoices (API returns paginated)
    if (invoicesRes.status === "fulfilled" && invoicesRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invList = Array.isArray(invoicesRes.value.data) ? invoicesRes.value.data : (invoicesRes.value.data as any).data || [];
      setApiInvoices(invList.map((inv: any) => ({
        id: inv.invoiceNumber || inv.id || "",
        patient: inv.patient ? [inv.patient.firstName, inv.patient.lastName].filter(Boolean).join(" ") : inv.patientName || "",
        amount: inv.totalAmount ?? inv.amount ?? 0,
        plan: inv.plan?.name || inv.planName || "",
        status: inv.status || "open",
        date: inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : inv.date || "",
      })));
    }
    // Programs
    if (programsRes.status === "fulfilled" && programsRes.value.data && Array.isArray(programsRes.value.data)) {
      setApiPrograms(programsRes.value.data);
    }
    // Screenings (API returns paginated)
    if (screeningsRes.status === "fulfilled" && screeningsRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scrList = Array.isArray(screeningsRes.value.data) ? screeningsRes.value.data : (screeningsRes.value.data as any).data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiScreenings(scrList.map((s: any) => ({
        id: s.id,
        date: s.administeredAt ? new Date(s.administeredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : s.date || "",
        patient: s.patient ? [s.patient.firstName, s.patient.lastName].filter(Boolean).join(" ") : s.patientName || "",
        instrument: s.instrumentId || s.instrument || s.templateName || "",
        score: s.totalScore ?? s.score ?? 0,
        severity: s.severity || s.riskLevel || "Mild",
        administeredBy: s.administeredBy?.name || s.administeredByName || s.providerName || "",
      })));
    }
    // Payments (API returns paginated)
    if (paymentsRes.status === "fulfilled" && paymentsRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payList = Array.isArray(paymentsRes.value.data) ? paymentsRes.value.data : (paymentsRes.value.data as any).data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiPayments(payList.map((p: any) => ({
        id: p.id,
        date: p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : p.date || "",
        patient: p.patient ? [p.patient.firstName, p.patient.lastName].filter(Boolean).join(" ") : p.patientName || "",
        amount: p.amount ?? 0,
        method: p.paymentMethod || p.method || "card",
        status: p.status || "succeeded",
        invoice: p.invoiceNumber || p.invoice?.invoiceNumber || p.invoiceId || "",
      })));
    }
    // Coupons (API returns paginated)
    if (couponsRes.status === "fulfilled" && couponsRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cpnList = Array.isArray(couponsRes.value.data) ? couponsRes.value.data : (couponsRes.value.data as any).data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiCoupons(cpnList.map((c: any) => ({
        id: c.id,
        code: c.code || "",
        description: c.description || "",
        discountType: c.discountType || c.discount_type || "percent",
        discountValue: c.discountValue ?? c.discount_value ?? 0,
        usesCount: c.usesCount ?? c.uses_count ?? 0,
        usesMax: c.maxUses ?? c.max_uses ?? null,
        validUntil: c.validUntil ? new Date(c.validUntil).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : c.valid_until || "",
        status: c.status || (c.isActive === false ? "expired" : "active"),
      })));
    }
    // Staff (API returns paginated)
    if (staffRes.status === "fulfilled" && staffRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stfList = Array.isArray(staffRes.value.data) ? staffRes.value.data : (staffRes.value.data as any).data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiStaff(stfList.map((s: any) => ({
        id: s.id,
        name: [s.firstName, s.lastName].filter(Boolean).join(" ") || s.name || "",
        email: s.email || "",
        role: s.role || s.jobTitle || "Staff",
        status: s.isActive === false ? "inactive" : "active",
        lastLogin: s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : s.lastLogin || "",
      })));
    }
    // Notifications (API returns paginated)
    if (notificationsRes.status === "fulfilled" && notificationsRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const notifList = Array.isArray(notificationsRes.value.data) ? notificationsRes.value.data : (notificationsRes.value.data as any).data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiNotifications(notifList.map((n: any) => ({
        id: n.id,
        title: n.title || n.subject || "",
        description: n.body || n.description || n.message || "",
        time: n.createdAt ? new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : n.time || "",
        category: n.category || n.type || "system",
        read: n.readAt != null || n.read === true,
      })));
    }
    // Intakes (API returns paginated)
    if (intakesRes.status === "fulfilled" && intakesRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const intList = Array.isArray(intakesRes.value.data) ? intakesRes.value.data : (intakesRes.value.data as any).data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiIntakes(intList.map((i: any) => ({
        id: i.id,
        code: i.submissionCode || i.code || `INT-${i.id}`,
        name: i.patient ? [i.patient.firstName, i.patient.lastName].filter(Boolean).join(" ") : i.patientName || i.name || "",
        dateSubmitted: i.submittedAt ? new Date(i.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : i.dateSubmitted || "",
        status: i.status || "pending",
      })));
    }
    // Waitlist (API returns paginated)
    if (waitlistRes.status === "fulfilled" && waitlistRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wlList = Array.isArray(waitlistRes.value.data) ? waitlistRes.value.data : (waitlistRes.value.data as any).data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setApiWaitlist(wlList.map((w: any) => ({
        id: w.id,
        name: w.patient ? [w.patient.firstName, w.patient.lastName].filter(Boolean).join(" ") : w.patientName || w.name || "",
        email: w.email || w.patient?.email || "",
        phone: w.phone || w.patient?.phone || "",
        desiredPlan: w.desiredPlan || w.plan?.name || w.planName || "",
        requestedDate: w.requestedAt ? new Date(w.requestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : w.requestedDate || "",
        priority: w.priority || "medium",
        status: w.status || "waiting",
      })));
    }
    // Default provider id — extract once so encounter / prescription
     // forms can submit without exposing a picker. Single-provider
     // practices (the H1 customer profile) have exactly one row here.
    if (providersRes.status === "fulfilled" && providersRes.value.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provList = Array.isArray(providersRes.value.data) ? providersRes.value.data : (providersRes.value.data as any).data || [];
      if (provList.length > 0 && provList[0]?.id) {
        setDefaultProviderId(provList[0].id);
      }
    }
    setDataLoading(false);
  }, []);

  useEffect(() => { loadPracticeData(); }, [loadPracticeData]);

  // ─── Per-patient detail fetches ──────────────────────────────────────
  // When a patient is opened in the detail drawer, fan out to each
  // sub-tab's scoped endpoint in parallel and store the results.
  // Empty handlers per request — sub-tabs render empty state when one
  // particular endpoint fails rather than blanking the whole drawer.
  useEffect(() => {
    if (!selectedPatient?.id) {
      setPtApiAppointments([]);
      setPtApiPrescriptions([]);
      setPtApiEncounters([]);
      setPtApiInvoices([]);
      setPtApiScreenings([]);
      setPtApiDocuments([]);
      setPtApiMessages([]);
      return;
    }
    const pid = selectedPatient.id;
    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled([
        appointmentService.list({ patient_id: pid }),
        prescriptionService.list({ patient_id: pid }),
        encounterService.list({ patient_id: pid }),
        invoiceService.list({ patient_id: pid }),
        screeningService.list({ patient_id: pid }),
        documentService.list({ patient_id: pid }),
        messageService.list({ patient_id: pid }),
      ]);
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unpack = (r: any): any[] => {
        if (r.status !== "fulfilled" || !r.value?.data) return [];
        const d = r.value.data;
        if (Array.isArray(d)) return d;
        if (Array.isArray(d?.data)) return d.data; // paginated
        if (Array.isArray(d?.items)) return d.items;
        return [];
      };
      setPtApiAppointments(unpack(results[0]));
      setPtApiPrescriptions(unpack(results[1]));
      setPtApiEncounters(unpack(results[2]));
      setPtApiInvoices(unpack(results[3]));
      setPtApiScreenings(unpack(results[4]));
      setPtApiDocuments(unpack(results[5]));
      setPtApiMessages(unpack(results[6]));
    })();
    return () => { cancelled = true; };
  }, [selectedPatient?.id]);

  // ─── Fetch Entitlement Types ─────────────────────────────────────────
  const fetchEntitlementTypes = useCallback(async () => {
    if (entitlementTypes.length > 0) return;
    setEntitlementTypesLoading(true);
    try {
      const res = await apiFetch<unknown[]>("/entitlement-types");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
      setEntitlementTypes(list);
    } catch { /* ignore */ }
    setEntitlementTypesLoading(false);
  }, [entitlementTypes.length]);

  // ─── Fetch Plan Entitlements (for edit) ──────────────────────────────
  const fetchPlanEntitlements = useCallback(async (planId: string) => {
    try {
      const res = await apiFetch<unknown[]>(`/membership-plans/${planId}/entitlements`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: PlanEntitlementRow[] = list.map((e: any) => ({
        tempId: e.id || `existing_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        entitlementTypeId: e.entitlementTypeId || e.entitlement_type_id || "",
        typeName: e.entitlementType?.name || e.typeName || e.type_name || "Unknown",
        quantity: e.quantityLimit ?? e.quantity ?? e.allowedQuantity ?? 0,
        unlimited: e.isUnlimited ?? e.unlimited ?? (e.quantityLimit === null),
        period: e.period || "monthly",
        overagePolicy: e.overagePolicy || e.overage_policy || "block",
      }));
      setEditPlanEntitlements(rows);
      setEditPlanExistingEntitlementIds(list.map((e: any) => e.id).filter(Boolean));
    } catch { /* ignore */ }
  }, []);

  // ─── Save Plan Entitlements ──────────────────────────────────────────
  const savePlanEntitlements = useCallback(async (planId: string, entitlements: PlanEntitlementRow[], existingIds: string[]) => {
    // Delete removed entitlements
    for (const existingId of existingIds) {
      if (!entitlements.find(e => e.tempId === existingId)) {
        await apiFetch(`/membership-plans/${planId}/entitlements/${existingId}`, { method: "DELETE" }).catch(() => {});
      }
    }
    // Add new entitlements
    for (const ent of entitlements) {
      if (!existingIds.includes(ent.tempId)) {
        await apiFetch(`/membership-plans/${planId}/entitlements`, {
          method: "POST",
          body: JSON.stringify({
            entitlementTypeId: ent.entitlementTypeId,
            quantityLimit: ent.unlimited ? null : ent.quantity,
            isUnlimited: ent.unlimited,
            periodType: ent.period === "monthly" ? "per_month" : ent.period === "quarterly" ? "per_quarter" : ent.period === "yearly" ? "per_year" : ent.period,
            overagePolicy: ent.overagePolicy,
          }),
        }).catch(() => {});
      }
    }
  }, []);

  // ─── Fetch Plan Detail Data ────────────────────────────────────────
  const fetchPlanDetailEntitlements = useCallback(async (planId: string) => {
    setPlanDetailEntitlementsLoading(true);
    try {
      const res = await apiFetch<unknown[]>(`/membership-plans/${planId}/entitlements`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = res.data as any;
      const list = Array.isArray(raw) ? raw : raw?.data || [];
      setPlanDetailEntitlements(list);
    } catch { setPlanDetailEntitlements([]); }
    setPlanDetailEntitlementsLoading(false);
  }, []);

  const fetchPlanDetailMembers = useCallback(async (planId: string) => {
    setPlanDetailMembersLoading(true);
    try {
      const res = await apiFetch<unknown[]>(`/memberships?plan_id=${planId}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = res.data as any;
      const list = Array.isArray(raw) ? raw : raw?.data || [];
      setPlanDetailMembers(list);
    } catch { setPlanDetailMembers([]); }
    setPlanDetailMembersLoading(false);
  }, []);

  const fetchPlanDetailUsage = useCallback(async (planId: string) => {
    setPlanDetailUsageLoading(true);
    try {
      const res = await apiFetch<unknown[]>(`/entitlement-usage/plan/${planId}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = res.data as any;
      const list = Array.isArray(raw) ? raw : raw?.data || [];
      setPlanDetailUsage(list);
    } catch { setPlanDetailUsage([]); }
    setPlanDetailUsageLoading(false);
  }, []);

  const openPlanDetail = useCallback((plan: Record<string, unknown>) => {
    setSelectedPlan(plan);
    setPlanDetailTab("overview");
    setPlanDetailEditingEntitlement(null);
    setPlanDetailShowAddEntitlement(false);
    const planId = plan.id as string;
    fetchPlanDetailEntitlements(planId);
    fetchPlanDetailMembers(planId);
    fetchPlanDetailUsage(planId);
  }, [fetchPlanDetailEntitlements, fetchPlanDetailMembers, fetchPlanDetailUsage]);

  const handleDeletePlanEntitlement = useCallback(async (planId: string, entitlementId: string) => {
    try {
      await apiFetch(`/membership-plans/${planId}/entitlements/${entitlementId}`, { method: "DELETE" });
      setToast({ message: "Entitlement removed.", type: "success" });
      fetchPlanDetailEntitlements(planId);
    } catch {
      setToast({ message: "Failed to remove entitlement.", type: "error" });
    }
  }, [fetchPlanDetailEntitlements, setToast]);

  const handleAddPlanDetailEntitlement = useCallback(async (planId: string, entitlementTypeId: string) => {
    try {
      await apiFetch(`/membership-plans/${planId}/entitlements`, {
        method: "POST",
        body: JSON.stringify({
          entitlementTypeId,
          quantityLimit: 1,
          isUnlimited: false,
          periodType: "per_month",
          overagePolicy: "block",
        }),
      });
      setToast({ message: "Entitlement added.", type: "success" });
      fetchPlanDetailEntitlements(planId);
      setPlanDetailShowAddEntitlement(false);
    } catch {
      setToast({ message: "Failed to add entitlement.", type: "error" });
    }
  }, [fetchPlanDetailEntitlements, setToast]);

  const handleUpdatePlanDetailEntitlement = useCallback(async (planId: string, entitlementId: string, data: Record<string, unknown>) => {
    try {
      await apiFetch(`/membership-plans/${planId}/entitlements/${entitlementId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      setToast({ message: "Entitlement updated.", type: "success" });
      fetchPlanDetailEntitlements(planId);
      setPlanDetailEditingEntitlement(null);
    } catch {
      setToast({ message: "Failed to update entitlement.", type: "error" });
    }
  }, [fetchPlanDetailEntitlements, setToast]);

  // ─── Fetch Patient Utilization ───────────────────────────────────────
  const fetchPatientUtilization = useCallback(async (membershipId: string) => {
    setUtilizationLoading(true);
    setPatientUtilization(null);
    try {
      const res = await apiFetch<unknown>(`/entitlement-usage/patient/${membershipId}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = res.data as any;
      console.log("[MemberMD] Utilization raw response:", JSON.stringify(raw).slice(0, 500));
      // API returns { entitlements: [...], totalSavings, plan, ... }
      const list = raw?.entitlements || (Array.isArray(raw) ? raw : raw?.data || []);
      console.log("[MemberMD] Utilization items count:", list.length, "first item:", list[0] ? JSON.stringify(list[0]).slice(0, 200) : "none");
      setPatientUtilization(list);
    } catch {
      setPatientUtilization([]);
    }
    setUtilizationLoading(false);
  }, []);

  // ─── Fetch patient activities ──────────────────────────────────────────
  const fetchPatientActivities = useCallback(async (patientId: string, page = 1) => {
    setPatientActivitiesLoading(true);
    try {
      const res = await apiFetch<unknown>(`/activity-log/patient/${patientId}?page=${page}&per_page=20`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = res.data as any;
      const list = Array.isArray(raw) ? raw : raw?.data || raw?.items || [];
      const totalPages = raw?.totalPages ?? raw?.total_pages ?? raw?.meta?.totalPages ?? 1;
      setPatientActivities(list);
      setPatientActivitiesPage(page);
      setPatientActivitiesTotalPages(totalPages);
    } catch {
      setPatientActivities([]);
    }
    setPatientActivitiesLoading(false);
  }, []);

  // ─── Pause membership (roster action) ──────────────────────────────────
  const handlePauseMembership = useCallback(async (membershipId: string, patientName: string) => {
    try {
      await apiFetch(`/memberships/${membershipId}/pause`, { method: "POST" });
      setToast({ message: `${patientName}'s membership paused.`, type: "success" });
      loadPracticeData();
    } catch {
      setToast({ message: "Failed to pause membership.", type: "error" });
    }
  }, [loadPracticeData, setToast]);

  // ─── Fetch plans for roster plan dialog ────────────────────────────────
  const fetchRosterPlans = useCallback(async () => {
    setRosterAvailablePlansLoading(true);
    try {
      const res = await membershipPlanService.list();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
      setRosterAvailablePlans(list);
    } catch { /* ignore */ }
    setRosterAvailablePlansLoading(false);
  }, []);

  // ─── Enroll or change plan (roster action) ─────────────────────────────
  const handleRosterPlanAction = useCallback(async () => {
    if (!rosterPlanDialog || !rosterSelectedPlanId) return;
    setRosterPlanActionLoading(true);
    try {
      if (rosterPlanDialog.mode === "change" && rosterPlanDialog.membershipId) {
        const res = await apiFetch(`/memberships/${rosterPlanDialog.membershipId}/change-plan`, {
          method: "POST",
          body: JSON.stringify({ planId: rosterSelectedPlanId }),
        });
        if (res.error) {
          setToast({ message: res.error, type: "error" });
        } else {
          setToast({ message: "Plan changed successfully.", type: "success" });
          setRosterPlanDialog(null);
          setRosterSelectedPlanId(null);
          loadPracticeData();
        }
      } else {
        if (rosterCompEnabled && !rosterCompReason.trim()) {
          setToast({ message: "Comp reason is required for a comped membership.", type: "error" });
          setRosterPlanActionLoading(false);
          return;
        }
        const body: Record<string, unknown> = {
          patientId: rosterPlanDialog.patientId,
          planId: rosterSelectedPlanId,
          billingFrequency: "monthly",
        };
        if (rosterCompEnabled) {
          body.comp = true;
          body.compReason = rosterCompReason.trim();
        }
        const res = await apiFetch("/memberships", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (res.error) {
          setToast({ message: res.error, type: "error" });
        } else {
          setToast({
            message: rosterCompEnabled ? "Patient enrolled (comped)." : "Patient enrolled in plan.",
            type: "success",
          });
          setRosterPlanDialog(null);
          setRosterSelectedPlanId(null);
          setRosterCompEnabled(false);
          setRosterCompReason("");
          loadPracticeData();
        }
      }
    } catch {
      setToast({ message: rosterPlanDialog.mode === "change" ? "Failed to change plan." : "Failed to enroll patient.", type: "error" });
    }
    setRosterPlanActionLoading(false);
  }, [rosterPlanDialog, rosterSelectedPlanId, rosterCompEnabled, rosterCompReason, loadPracticeData, setToast]);

  // ─── Quick activity log submit ─────────────────────────────────────────
  const handleQuickActivityLog = useCallback(async (patientId: string) => {
    if (!quickActivityForm.activityType) return;
    setQuickActivityLoading(true);
    try {
      await apiFetch("/activity-log", {
        method: "POST",
        body: JSON.stringify({
          patientId,
          activityType: quickActivityForm.activityType,
          durationMinutes: parseInt(quickActivityForm.durationMinutes) || 15,
          notes: quickActivityForm.notes || undefined,
        }),
      });
      setToast({ message: "Activity logged.", type: "success" });
      setShowQuickActivityLog(false);
      setQuickActivityForm({ activityType: "", durationMinutes: "15", notes: "" });
      fetchPatientActivities(patientId);
    } catch {
      setToast({ message: "Failed to log activity.", type: "error" });
    }
    setQuickActivityLoading(false);
  }, [quickActivityForm, fetchPatientActivities, setToast]);

  const handleAddPatient = async () => {
    if (!addPatientForm.firstName || !addPatientForm.lastName || !addPatientForm.dateOfBirth) {
      setAddPatientError("First name, last name, and date of birth are required.");
      return;
    }
    if (!addPatientForm.email) {
      setAddPatientError("Email is required — the patient uses it to access the portal.");
      return;
    }
    setAddPatientLoading(true);
    setAddPatientError(null);
    try {
      const res = await patientService.create(addPatientForm);
      if (res.error) {
        setAddPatientError(res.error);
      } else if (res.data) {
        // Refresh patient list
        loadPracticeData();
        setShowAddPatient(false);
        setAddPatientForm({ firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", gender: "male" });
      } else {
        setAddPatientError("Failed to create patient. Please try again.");
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
    if (!defaultProviderId) {
      setToast({ message: "No provider on this practice yet — add one first under Providers.", type: "error" });
      return;
    }
    setEncounterLoading(true);
    try {
      const res = await encounterService.create({
        patientId: encounterForm.patientId,
        // Backend requires both. providerId comes from the practice's
        // first provider (single-provider DPC default); encounterType
        // mirrors the form, falling back to follow_up to match the
        // validator's enum. Cast because the local Encounter type
        // doesn't yet model encounterType.
        providerId: defaultProviderId,
        encounterType: encounterForm.encounterType || "follow_up",
        encounterDate: encounterForm.encounterDate,
        status: "in_progress",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (res.data && (res.data as { id?: string }).id) {
        setActiveTab("encounters");
        setToast({ message: "Encounter created. Fill in the SOAP note below.", type: "success" });
        setShowNewEncounter(false);
        setEditingEncounterId((res.data as { id: string }).id);
        setSoapForm({ subjective: "", objective: "", assessment: "", plan: "", chiefComplaint: "" });
        setEncounterForm({ patientId: "", encounterType: "follow_up", programId: "", encounterDate: new Date().toISOString().split("T")[0] });
        await loadPracticeData();
      } else {
        setToast({ message: res.error || "Encounter create returned an unexpected response. Try again.", type: "error" });
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
      // Save SOAP fields first. UpdateEncounterRequest does NOT accept
      // a `status` field, so to actually sign we hit the dedicated
      // POST /encounters/{id}/sign endpoint after a successful save.
      const updateRes = await encounterService.update(editingEncounterId, {
        subjective: soapForm.subjective,
        objective: soapForm.objective,
        assessment: soapForm.assessment,
        plan: soapForm.plan,
        chiefComplaint: soapForm.chiefComplaint,
      });
      if (updateRes.error) {
        setToast({ message: updateRes.error, type: "error" });
        return;
      }
      if (sign) {
        const signRes = await encounterService.sign(editingEncounterId);
        if (signRes.error) {
          setToast({ message: `Saved note, but signing failed: ${signRes.error}`, type: "error" });
          return;
        }
        setEditingEncounterId(null);
      }
      setToast({ message: sign ? "Encounter signed successfully." : "SOAP note saved.", type: "success" });
      loadPracticeData();
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
    if (!defaultProviderId) {
      setToast({ message: "No provider on this practice yet — add one first under Providers.", type: "error" });
      return;
    }
    setRxLoading(true);
    try {
      // Backend keys: providerId is required; the field is `pharmacyName`
      // (apiFetch's snake-case transformer converts to pharmacy_name).
      // The earlier `pharmacy` key landed as `pharmacy` server-side and
      // got silently stripped by the validator -> 422.
      const res = await prescriptionService.create({
        patientId: rxForm.patientId,
        providerId: defaultProviderId,
        medicationName: rxForm.medicationName,
        dosage: rxForm.dosage,
        frequency: rxForm.frequency,
        route: rxForm.route,
        quantity: parseInt(rxForm.quantity) || 30,
        refills: parseInt(rxForm.refills) || 0,
        pharmacyName: rxForm.pharmacyName || undefined,
        pharmacyPhone: rxForm.pharmacyPhone || undefined,
        notes: rxForm.notes || undefined,
        status: "active",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (res.data && res.data.id) {
        // Navigate to the Prescriptions tab so the user can see their
        // newly-created Rx in the list. Same UX gap as encounters had.
        setActiveTab("prescriptions");
        setToast({ message: "Prescription created successfully.", type: "success" });
        setShowNewPrescription(false);
        setRxForm({ patientId: "", medicationName: "", dosage: "", frequency: "", route: "oral", quantity: "30", refills: "3", isControlled: false, schedule: "", pharmacyName: "", pharmacyPhone: "", notes: "" });
        await loadPracticeData();
      } else {
        setToast({ message: res.error || "Prescription create returned an unexpected response. Try again.", type: "error" });
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

  // ─── Create Plan Handler ───────────────────────────────────────────
  const handleCreatePlan = async () => {
    if (!createPlanForm.name || !createPlanForm.monthlyPrice) {
      setToast({ message: "Name and monthly price are required.", type: "error" });
      return;
    }
    setCreatePlanLoading(true);
    try {
      const res = await membershipPlanService.create({
        name: createPlanForm.name,
        monthlyPrice: parseFloat(createPlanForm.monthlyPrice) || 0,
        annualPrice: parseFloat(createPlanForm.annualPrice) || 0,
        description: createPlanForm.description || undefined,
      });
      if (res.data || !res.error) {
        // Save entitlements if plan was created successfully
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newPlanId = (res.data as any)?.id;
        if (newPlanId && createPlanEntitlements.length > 0) {
          await savePlanEntitlements(newPlanId, createPlanEntitlements, []);
        }
        setToast({ message: "Plan created successfully.", type: "success" });
        setShowCreatePlan(false);
        setCreatePlanForm({ name: "", monthlyPrice: "", annualPrice: "", description: "" });
        setCreatePlanEntitlements([]);
        setShowCreatePlanEntPicker(false);
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to create plan.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to create plan.", type: "error" });
    }
    setCreatePlanLoading(false);
  };

  // ─── Edit Plan Handler ────────────────────────────────────────────
  const handleEditPlan = async () => {
    if (!editPlanForm.id || !editPlanForm.name) {
      setToast({ message: "Plan name is required.", type: "error" });
      return;
    }
    setEditPlanLoading(true);
    try {
      const res = await membershipPlanService.update(editPlanForm.id, {
        name: editPlanForm.name,
        monthlyPrice: parseFloat(editPlanForm.monthlyPrice) || 0,
        annualPrice: parseFloat(editPlanForm.annualPrice) || 0,
        description: editPlanForm.description || undefined,
      });
      if (res.data || !res.error) {
        // Save entitlements
        await savePlanEntitlements(editPlanForm.id, editPlanEntitlements, editPlanExistingEntitlementIds);
        setToast({ message: "Plan updated successfully.", type: "success" });
        setShowEditPlan(false);
        setEditPlanEntitlements([]);
        setEditPlanExistingEntitlementIds([]);
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to update plan.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to update plan.", type: "error" });
    }
    setEditPlanLoading(false);
  };

  // ─── Deactivate Plan Handler ──────────────────────────────────────
  const handleDeactivatePlan = async (planId: string, planName: string) => {
    setConfirmDialog({
      title: "Deactivate Plan",
      message: `Are you sure you want to deactivate the "${planName}" plan? Existing members will not be affected.`,
      confirmLabel: "Deactivate",
      danger: true,
      onConfirm: async () => {
        try {
          await membershipPlanService.update(planId, { isActive: false } as Record<string, unknown>);
          setToast({ message: `${planName} plan deactivated.`, type: "success" });
          loadPracticeData();
        } catch {
          setToast({ message: "Failed to deactivate plan.", type: "error" });
        }
        setConfirmDialog(null);
      },
    });
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

  // ─── Administer Screening Handler ──────────────────────────────────
  const handleCreateScreening = async () => {
    if (!screeningForm.patientId || !screeningForm.instrumentId) {
      setToast({ message: "Patient and instrument are required.", type: "error" });
      return;
    }
    setScreeningLoading(true);
    try {
      const res = await screeningService.create({
        patientId: screeningForm.patientId,
        templateId: screeningForm.instrumentId,
        score: screeningForm.score ? parseInt(screeningForm.score) : undefined,
        notes: screeningForm.notes || undefined,
        completedAt: new Date().toISOString(),
      } as Record<string, unknown>);
      if (res.data || !res.error) {
        setToast({ message: "Screening administered successfully.", type: "success" });
        setShowNewScreening(false);
        setScreeningForm({ patientId: "", instrumentId: "phq9", score: "", notes: "" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to administer screening.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to administer screening.", type: "error" });
    }
    setScreeningLoading(false);
  };

  // ─── Create Coupon Handler ────────────────────────────────────────────
  const handleCreateCoupon = async () => {
    if (!couponForm.code || !couponForm.discountValue) {
      setToast({ message: "Coupon code and discount value are required.", type: "error" });
      return;
    }
    setCouponLoading(true);
    try {
      // Backend enum is 'percentage' | 'fixed'. UI also exposes a
      // 'free_months' option that the backend doesn't natively support;
      // we send it as 'fixed' with a description suffix so the value is
      // captured even if the discount logic doesn't apply months yet.
      const apiDiscountType =
        couponForm.discountType === "percent" ? "percentage"
        : couponForm.discountType === "amount" ? "fixed"
        : "fixed";
      const apiDescription = couponForm.discountType === "free_months"
        ? `${couponForm.description || "Free months"} (${couponForm.discountValue} month${parseInt(couponForm.discountValue) === 1 ? "" : "s"} free)`
        : couponForm.description || undefined;

      const res = await couponService.create({
        code: couponForm.code.toUpperCase(),
        description: apiDescription,
        discountType: apiDiscountType,
        discountValue: parseFloat(couponForm.discountValue),
        maxUses: couponForm.maxUses ? parseInt(couponForm.maxUses) : undefined,
        validUntil: couponForm.validUntil || undefined,
      } as Record<string, unknown>);
      if (res.data || !res.error) {
        setToast({ message: "Coupon created successfully.", type: "success" });
        setShowNewCoupon(false);
        setCouponForm({ code: "", description: "", discountType: "percent", discountValue: "", maxUses: "", validUntil: "" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to create coupon.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to create coupon.", type: "error" });
    }
    setCouponLoading(false);
  };

  // ─── Add Provider Handler ─────────────────────────────────────────────
  const handleAddProvider = async () => {
    if (!providerForm.firstName || !providerForm.lastName) {
      setToast({ message: "First and last name are required.", type: "error" });
      return;
    }
    if (!providerForm.email) {
      setToast({ message: "Email is required — the provider will use it to log in.", type: "error" });
      return;
    }
    setAddProviderLoading(true);
    try {
      const res = await providerService.create({
        firstName: providerForm.firstName,
        lastName: providerForm.lastName,
        credentials: providerForm.credentials || undefined,
        specialty: providerForm.specialty || undefined,
        npiNumber: providerForm.npiNumber || undefined,
        email: providerForm.email,
        phone: providerForm.phone || undefined,
        telehealth: providerForm.telehealth,
      } as Record<string, unknown>);
      if (res.data || !res.error) {
        setToast({ message: "Provider added successfully.", type: "success" });
        setShowAddProvider(false);
        setProviderForm({ firstName: "", lastName: "", credentials: "", specialty: "", npiNumber: "", email: "", phone: "", telehealth: false });
        setProvidersLoaded(false);
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to add provider.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to add provider.", type: "error" });
    }
    setAddProviderLoading(false);
  };

  // ─── NPI Lookup (Add/Edit Provider modals) ────────────────────────────
  const [npiLookupLoading, setNpiLookupLoading] = useState(false);
  const lookupNpiAndFill = async (npi: string, target: "add" | "edit") => {
    if (!/^\d{10}$/.test(npi)) {
      setToast({ message: "NPI must be exactly 10 digits.", type: "error" });
      return;
    }
    setNpiLookupLoading(true);
    try {
      const res = await fetch(`https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${npi}`);
      const data = await res.json();
      const result = data.results?.[0];
      if (!result) {
        setToast({ message: "NPI not found in registry.", type: "error" });
        return;
      }
      const basic = result.basic || {};
      const firstName = basic.first_name || "";
      const lastName = basic.last_name || "";
      const credential = (basic.credential || "").replace(/\./g, "");
      if (target === "add") {
        setProviderForm(f => ({
          ...f,
          firstName: f.firstName || firstName,
          lastName: f.lastName || lastName,
          credentials: f.credentials || credential,
        }));
      } else {
        setEditProviderForm(f => ({
          ...f,
          firstName: f.firstName || firstName,
          lastName: f.lastName || lastName,
          credentials: f.credentials || credential,
        }));
      }
      setToast({ message: `Found: ${firstName} ${lastName}${credential ? `, ${credential}` : ""}`, type: "success" });
    } catch {
      setToast({ message: "NPI lookup failed. Check your connection.", type: "error" });
    }
    setNpiLookupLoading(false);
  };

  // ─── Edit Provider Handler ─────────────────────────────────────────────
  const handleEditProvider = async () => {
    if (!editProviderId || !editProviderForm.firstName || !editProviderForm.lastName) {
      setToast({ message: "First and last name are required.", type: "error" });
      return;
    }
    setEditProviderLoading(true);
    try {
      const res = await providerService.update(editProviderId, {
        firstName: editProviderForm.firstName,
        lastName: editProviderForm.lastName,
        credentials: editProviderForm.credentials || undefined,
        specialty: editProviderForm.specialty || undefined,
        npiNumber: editProviderForm.npiNumber || undefined,
        email: editProviderForm.email || undefined,
        phone: editProviderForm.phone || undefined,
        telehealth: editProviderForm.telehealth,
      } as Record<string, unknown>);
      if (res.data || !res.error) {
        setToast({ message: "Provider updated successfully.", type: "success" });
        setShowEditProvider(false);
        setEditProviderId(null);
        setEditProviderForm({ firstName: "", lastName: "", credentials: "", specialty: "", npiNumber: "", email: "", phone: "", telehealth: false });
        setProvidersLoaded(false);
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to update provider.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to update provider.", type: "error" });
    }
    setEditProviderLoading(false);
  };

  // ─── Invite Staff Handler ─────────────────────────────────────────────
  const handleInviteStaff = async () => {
    if (!staffForm.name || !staffForm.email) {
      setToast({ message: "Name and email are required.", type: "error" });
      return;
    }
    setInviteStaffLoading(true);
    try {
      const res = await providerService.create({
        firstName: staffForm.name.split(" ")[0] || staffForm.name,
        lastName: staffForm.name.split(" ").slice(1).join(" ") || "",
        email: staffForm.email,
        role: staffForm.role,
      } as Record<string, unknown>);
      if (res.data || !res.error) {
        setToast({ message: "Staff invitation sent successfully.", type: "success" });
        setShowInviteStaff(false);
        setStaffForm({ name: "", email: "", role: "Front Desk" });
        loadPracticeData();
      } else {
        setToast({ message: res.error || "Failed to invite staff.", type: "error" });
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : "Failed to invite staff.", type: "error" });
    }
    setInviteStaffLoading(false);
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

  // ─── Memoized Data ──────────────────────────────────────────────────────

  const patients = useMemo(() => apiPatients || (isDemoMode ? MOCK_PATIENTS : []), [apiPatients]);

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

  const appointments = useMemo(() => apiAppointments || (isDemoMode ? MOCK_APPOINTMENTS : []), [apiAppointments]);

  const telehealthAppointments = useMemo(
    () => appointments.filter((a: typeof MOCK_APPOINTMENTS[0]) => a.isTelehealth),
    [appointments]
  );

  const invoices = useMemo(() => apiInvoices || (isDemoMode ? MOCK_INVOICES : []), [apiInvoices]);

  const invoiceSummary = useMemo(() => ({
    total: invoices.reduce((s: number, i: { amount: number }) => s + i.amount, 0),
    paid: invoices.filter((i: { status: string }) => i.status === "paid").reduce((s: number, i: { amount: number }) => s + i.amount, 0),
    open: invoices.filter((i: { status: string }) => i.status === "open").reduce((s: number, i: { amount: number }) => s + i.amount, 0),
    overdue: invoices.filter((i: { status: string }) => i.status === "overdue").reduce((s: number, i: { amount: number }) => s + i.amount, 0),
  }), [invoices]);

  const prescriptionCounts = useMemo(() => {
    if (!apiPrescriptions) return isDemoMode ? { active: 45, sent: 0, refillRequested: 3, discontinued: 12 } : { active: 0, sent: 0, refillRequested: 0, discontinued: 0 };
    return {
      active: apiPrescriptions.filter((rx: { status: string }) => rx.status === "active").length,
      sent: apiPrescriptions.filter((rx: { status: string }) => rx.status === "sent").length,
      refillRequested: apiPrescriptions.filter((rx: { status: string }) => rx.status === "refill_requested").length,
      discontinued: apiPrescriptions.filter((rx: { status: string }) => rx.status === "discontinued").length,
    };
  }, [apiPrescriptions]);

  // (Old inline renderSidebar removed — PortalShell handles the sidebar
  // chrome, mobile drawer, and user section now. Tab activation, mobile
  // close, and selected-patient clearing happen via the onTabChange
  // callback we pass to PortalShell.)

  // ─── Dashboard Tab ──────────────────────────────────────────────────────

  // Program performance mock data
  const MOCK_PROGRAM_STATS = [
    { name: "DPC Membership", enrolled: 120, mrr: 23800, utilization: 78, color: "#147d64", bgColor: "#e6f7f2", icon: Heart },
    { name: "CCM", enrolled: 50, mrr: 2100, utilization: 65, color: "#334e68", bgColor: "#e0e8f0", icon: ClipboardList },
    { name: "RPM", enrolled: 30, mrr: 1700, utilization: 72, color: "#7c3aed", bgColor: "#f3e8ff", icon: Activity },
    { name: "Employer Wellness", enrolled: 500, mrr: 10000, utilization: 42, color: "#d97706", bgColor: "#fffbeb", icon: UsersRound },
  ];

  // ─── Recent Activity (Care Timeline) ────────────────────────────────────
  // Practice-wide chronological feed. Demo data only for now — real
  // version pulls from encounters / prescriptions / screenings / labs /
  // vitals / referrals services.
  function renderRecentActivity() {
    const events = isDemoMode ? generateDemoTimelineEvents() : [];
    return (
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Recent activity</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Practice-wide clinical feed. Filter by event type. Click any row to open the patient.
            </p>
          </div>
          <RefreshButton onRefresh={loadPracticeData} title="Refresh activity" />
        </div>
        <CareTimeline
          events={events}
          onEventClick={(ev) => {
            const match = patients.find((p) => p.name === ev.patientName);
            if (match) {
              setSelectedPatient(match);
              setPatientDetailTab("demographics");
            } else {
              setToast({ message: `${ev.patientName} not found in roster.`, type: "error" });
            }
          }}
        />
      </div>
    );
  }

  function renderDashboard() {
    const totalMRR = apiDashStats?.totalMrr ?? (isDemoMode ? 39328 : 0);

    // Onboarding gate — show the checklist for fresh practices, the
    // smaller Connect banner once they've dismissed the checklist but
    // still haven't connected Stripe. Both self-detect their state.
    let onboardingDismissed = false;
    try {
      onboardingDismissed = localStorage.getItem("membermd_onboarding_dismissed") === "1";
    } catch {
      onboardingDismissed = false;
    }

    return (
      <div className="space-y-5">
        {/* Stripe-grade page header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Dashboard</h2>
            <p className="text-sm text-slate-500 mt-0.5">Revenue, members, programs, and today's activity</p>
          </div>
          <RefreshButton onRefresh={loadPracticeData} title="Refresh dashboard" />
        </div>

        {/* Onboarding checklist (full) for fresh practices, or compact
            Connect banner once they've dismissed the checklist. */}
        {!onboardingDismissed ? (
          <OnboardingChecklist
            onNavigate={(tab) => setActiveTab(tab as TabId)}
            onDismiss={() => loadPracticeData()}
          />
        ) : (
          <ConnectSetupBanner onSetup={() => setActiveTab("practice-settings" as TabId)} />
        )}

        {/* Revenue by Source */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Revenue by source</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Heart}
              label="Membership"
              value={apiDashStats?.mrr ? `$${Number(apiDashStats.mrr).toLocaleString()}/mo` : isDemoMode ? "$23,800/mo" : "$0/mo"}
              trend={apiDashStats?.mrr ? `${apiDashStats.dpcMembers ?? 0} DPC members` : isDemoMode ? "120 DPC members" : "No members yet"}
              trendColor="#147d64"
            />
            <StatCard
              icon={FileText}
              label="Insurance Claims"
              value={apiDashStats?.insuranceClaims ? `$${Number(apiDashStats.insuranceClaims).toLocaleString()}/mo` : isDemoMode ? "$5,528/mo" : "$0/mo"}
              trend={isDemoMode && !apiDashStats ? "CCM + RPM" : "CCM + RPM"}
              trendColor="#334e68"
            />
            <StatCard
              icon={UsersRound}
              label="Employer Contracts"
              value={apiDashStats?.employerContracts ? `$${Number(apiDashStats.employerContracts).toLocaleString()}/mo` : isDemoMode ? "$10,000/mo" : "$0/mo"}
              trend={apiDashStats?.employerContractCount ? `${apiDashStats.employerContractCount} contracts` : isDemoMode ? "2 contracts" : "No contracts"}
              trendColor="#d97706"
            />
            <StatCard
              icon={DollarSign}
              label="Total MRR"
              value={`$${totalMRR.toLocaleString()}`}
              trend={isDemoMode && !apiDashStats ? "+12% MoM" : ""}
            />
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Layers}
            label="Active Programs"
            value={apiDashStats?.activePrograms?.toString() ?? (isDemoMode ? "4" : "0")}
            trend={isDemoMode && !apiDashStats ? "All performing" : ""}
          />
          <StatCard
            icon={Users}
            label="Total Enrolled"
            value={apiDashStats?.activeMembers?.toString() ?? apiDashStats?.active_members?.toString() ?? (isDemoMode ? "700" : "0")}
            trend={isDemoMode && !apiDashStats ? "+15 this month" : ""}
          />
          <StatCard
            icon={Calendar}
            label="Appointments Today"
            value={apiDashStats?.appointmentsToday?.toString() ?? apiDashStats?.appointments_today?.toString() ?? (isDemoMode ? "8" : "0")}
            trend={isDemoMode && !apiDashStats ? "3 telehealth" : ""}
            trendColor="#334e68"
          />
          <StatCard
            icon={ClipboardList}
            label="Pending Intakes"
            value={apiDashStats?.pendingIntakes?.toString() ?? apiDashStats?.pending_intakes?.toString() ?? (isDemoMode ? "4" : "0")}
            trend={isDemoMode && !apiDashStats ? "2 new today" : ""}
            trendColor="#d97706"
          />
        </div>

        {/* Program Performance Cards */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Program performance</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {!isDemoMode && MOCK_PROGRAM_STATS.length > 0 && (isDemoMode ? MOCK_PROGRAM_STATS : []).length === 0 && (
              <div className="col-span-full py-8 text-center text-slate-400 text-sm">No program data available yet. Configure programs in the Programs tab.</div>
            )}
            {(isDemoMode ? MOCK_PROGRAM_STATS : []).map((prog) => (
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
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Upcoming appointments</h3>
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
                    {(apiAppointments || (isDemoMode ? MOCK_DASHBOARD_APPOINTMENTS : [])).slice(0, 5).map((apt) => (
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
              {(apiAppointments || (isDemoMode ? MOCK_DASHBOARD_APPOINTMENTS : [])).length === 0 && (
                <div className="py-8 text-center text-slate-400 text-sm">No upcoming appointments.</div>
              )}
            </div>
          </div>

          {/* Activity */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Recent activity</h3>
            <div className="glass rounded-xl p-4 space-y-3">
              {(isDemoMode ? MOCK_ACTIVITY : []).map((item) => (
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
              {!isDemoMode && (
                <div className="py-4 text-center text-slate-400 text-sm">No recent activity.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Patient Roster Tab ─────────────────────────────────────────────────

  function renderRoster() {
    // Build facets from the current roster so we never show a zero-result option.
    const planOpts = Array.from(new Set(filteredPatients.map((p) => p.plan).filter((x) => x && x !== "No Plan"))).map((p) => ({ value: p, label: p }));
    const statusOpts = Array.from(new Set(filteredPatients.map((p) => p.status))).map((s) => ({
      value: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
    }));
    const facets: import("../shared/stripe-ui").FilterFacet[] = [
      { key: "status", label: "Status", options: statusOpts },
      { key: "plan", label: "Plan", options: planOpts },
    ];

    // Filter chips applied on top of the existing search.
    const filtered = filteredPatients.filter((p) => {
      for (const f of rosterFilters) {
        if (f.key === "status" && p.status !== f.value) return false;
        if (f.key === "plan" && p.plan !== f.value) return false;
      }
      return true;
    });

    type Pt = typeof filteredPatients[number];

    const cols: import("../shared/stripe-ui").DataTableColumn<Pt>[] = [
      {
        key: "name",
        header: "Customer",
        cell: (p) => (
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
            >
              {(p.name || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
              <p className="text-xs text-slate-400 truncate">{p.email || "—"}</p>
            </div>
          </div>
        ),
      },
      {
        key: "plan",
        header: "Plan",
        cell: (p) => (p.plan && p.plan !== "No Plan" ? <PlanBadge plan={p.plan} /> : <span className="text-xs text-slate-400">No plan</span>),
      },
      {
        key: "status",
        header: "Status",
        cell: (p) => <StatusPill label={p.status} />,
      },
      {
        key: "memberId",
        header: "Member",
        hideBelow: "lg",
        cell: (p) => p.memberId ? <span className="font-mono text-xs text-slate-500 tabular-nums">{p.memberId}</span> : <span className="text-slate-300">—</span>,
      },
      {
        key: "phone",
        header: "Phone",
        hideBelow: "md",
        cell: (p) => <span className="text-slate-500">{p.phone || "—"}</span>,
      },
      {
        key: "lastVisit",
        header: "Last visit",
        hideBelow: "md",
        cell: (p) => <span className="text-slate-500">{p.lastVisit && p.lastVisit !== "N/A" ? p.lastVisit : "—"}</span>,
      },
      {
        key: "nextApt",
        header: "Next appt",
        hideBelow: "lg",
        cell: (p) => <span className="text-slate-500">{p.nextApt && p.nextApt !== "N/A" && p.nextApt !== "—" ? p.nextApt : "—"}</span>,
      },
    ];

    const rowActions = (patient: Pt): import("../shared/stripe-ui").KebabAction[] => [
      { label: "View details", onClick: () => { setSelectedPatient(patient); setPatientDetailTab("demographics"); } },
      { label: "Edit", onClick: () => openEditPatient(patient) },
      { label: "Book appointment", onClick: () => { setBookApptForm(f => ({ ...f, patientId: patient.id })); setShowBookAppointment(true); } },
      { label: "Send message", onClick: () => { setSelectedPatient(patient); setPatientDetailTab("messages"); } },
      { label: "Log activity", onClick: () => { setActiveTab("activity-log"); } },
      { label: "Create encounter", onClick: () => { setEncounterForm(f => ({ ...f, patientId: patient.id })); setShowNewEncounter(true); } },
      ...(patient.status === "active" && patient.membershipId
        ? [
            { label: "Change plan", onClick: () => { setRosterPlanDialog({ patientId: patient.id, patientName: patient.name, membershipId: patient.membershipId, mode: "change" as const }); fetchRosterPlans(); setRosterSelectedPlanId(null); } },
            { label: "Pause membership", onClick: () => { setConfirmDialog({ title: "Pause Membership", message: `Pause ${patient.name}'s membership? They will retain their plan but benefits will be suspended.`, confirmLabel: "Pause", onConfirm: async () => { if (patient.membershipId) { await handlePauseMembership(patient.membershipId, patient.name); } setConfirmDialog(null); } }); } },
            { label: "Cancel membership", danger: true, onClick: () => { if (patient.membershipId) { setRosterCancelDialog({ patientId: patient.id, patientName: patient.name, membershipId: patient.membershipId }); setRosterCancelReason(""); } } },
          ]
        : [
            { label: "Enroll in plan", onClick: () => { setRosterPlanDialog({ patientId: patient.id, patientName: patient.name, mode: "enroll" as const }); fetchRosterPlans(); setRosterSelectedPlanId(null); } },
          ]),
      { label: "Deactivate", danger: true, onClick: () => { setConfirmDialog({ title: "Deactivate Patient", message: `Are you sure you want to deactivate ${patient.name}?`, confirmLabel: "Deactivate", danger: true, onConfirm: async () => { try { await patientService.update(patient.id, { status: "inactive" }); setToast({ message: "Patient deactivated.", type: "success" }); loadPracticeData(); } catch { setToast({ message: "Failed to deactivate.", type: "error" }); } setConfirmDialog(null); } }); } },
    ];

    return (
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Patients</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {filtered.length === filteredPatients.length
                ? `${filteredPatients.length} ${filteredPatients.length === 1 ? "patient" : "patients"}`
                : `${filtered.length} of ${filteredPatients.length}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RefreshButton onRefresh={loadPracticeData} title="Refresh roster" />
            {/* Bulk-delete sample patients — appears only when at least
                one sample row exists. Sample emails carry the
                @membermd-sample.io domain. */}
            {patients.some((pt) => (pt.email || "").endsWith("@membermd-sample.io")) && (
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-red-200 text-red-700 bg-white hover:bg-red-50 transition-colors"
                onClick={async () => {
                  if (!window.confirm("Remove all sample patients for this practice? This cannot be undone.")) return;
                  const r = await onboardingService.removeAllSamplePatients();
                  if (r.error) {
                    setToast({ message: r.error, type: "error" });
                    return;
                  }
                  const removed = r.data?.deleted ?? 0;
                  setToast({ message: `Removed ${removed} sample patient${removed === 1 ? "" : "s"}.`, type: "success" });
                  loadPracticeData();
                }}
                title="Bulk-remove every sample patient before going live"
              >
                Clean samples
              </button>
            )}
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              onClick={async () => {
                const r = await onboardingService.createSamplePatient();
                if (r.error) {
                  setToast({ message: r.error, type: "error" });
                  return;
                }
                setToast({ message: "Sample patient created.", type: "success" });
                loadPracticeData();
              }}
              title="Create a Stripe-style test patient — useful for clicking through the UI without committing real PHI"
            >
              + Sample patient
            </button>
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
              style={{ backgroundColor: "#635bff" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
              onClick={() => setShowAddPatient(true)}
            >
              <Plus className="w-4 h-4" />
              Add patient
            </button>
          </div>
        </div>

        {/* Search + filter chips bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400"
            />
          </div>
          <FilterChips facets={facets} active={rosterFilters} onChange={setRosterFilters} />
        </div>

        {/* Stripe-grade data table */}
        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(p) => p.id}
          actions={rowActions}
          onRowClick={(p) => { setSelectedPatient(p); setPatientDetailTab("demographics"); }}
          empty={
            <div className="text-center py-8">
              <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              {patients.length === 0 && !searchQuery && rosterFilters.length === 0 ? (
                <p className="text-sm text-slate-500">No patients yet. Click "Add patient" to get started.</p>
              ) : (
                <>
                  <p className="text-sm text-slate-500 mb-1">No patients match your filters</p>
                  <button
                    onClick={() => { setRosterFilters([]); setSearchQuery(""); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          }
          footer={
            filtered.length > 0
              ? `Showing ${filtered.length} ${filtered.length === 1 ? "patient" : "patients"}`
              : null
          }
        />
      </div>
    );
  }

  // ─── Patient Detail Page ────────────────────────────────────────────────

  function renderPatientDetail() {
    const pt = selectedPatient;
    if (!pt) return null;

    // EnnHealth-style two-row tab nav: primary clinical tabs above,
    // secondary admin/notes tabs below. Each tab carries its own icon.
    const primaryDetailTabs: Array<{ id: string; label: string; icon: typeof Stethoscope }> = [
      { id: "demographics", label: "Demographics", icon: UserCog },
      { id: "appointments", label: "Appointments", icon: Calendar },
      { id: "medical", label: "Medical History", icon: Stethoscope },
      { id: "medications", label: "Medications", icon: Pill },
      { id: "labs", label: "Labs", icon: FlaskConical },
      { id: "vitals", label: "Vitals", icon: Activity },
      { id: "consents", label: "Consents", icon: Shield },
    ];
    const secondaryDetailTabs: Array<{ id: string; label: string; icon: typeof Stethoscope }> = [
      { id: "encounters", label: "Notes", icon: FileText },
      { id: "screenings", label: "Measures", icon: ClipboardList },
      { id: "wellness", label: "Wellness", icon: Heart },
      { id: "care-team", label: "Care Team", icon: UsersRound },
      { id: "billing", label: "Billing", icon: CreditCard },
      { id: "documents", label: "Documents", icon: FileText },
      { id: "messages", label: "Messages", icon: MessageSquare },
    ];

    // Mock encounters for this patient
    const mockEncountersData = [
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
    const mockEncounters = isDemoMode ? mockEncountersData : [];

    // Screening scores — pivot the per-patient API responses into the
    // PHQ-9 and GAD-7 series the JSX renders. Each ScreeningResponse has
    // template_id (resolves to template.code), score, severity, date.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const screeningRows = _ptApiScreenings as any[];
    type SeriesRow = { date: string; score: number; severity: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buildSeries = (code: string, demoFallback: SeriesRow[]): SeriesRow[] => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matched = screeningRows.filter((s: any) => {
        const tplCode = s.template?.code || s.templateCode || s.template_code;
        return tplCode === code;
      });
      if (matched.length === 0) return isDemoMode ? demoFallback : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return matched.map((s: any) => {
        const dt = s.administeredAt || s.administered_at || s.createdAt || s.created_at;
        const dateStr = dt ? new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
        return {
          date: dateStr,
          score: Number(s.score ?? 0),
          severity: (s.severity || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
        };
      }).sort((a: SeriesRow, b: SeriesRow) => new Date(a.date).getTime() - new Date(b.date).getTime());
    };
    const phq9Scores = buildSeries("phq9", [
      { date: "Jan 20, 2026", score: 18, severity: "Moderately Severe" },
      { date: "Feb 12, 2026", score: 14, severity: "Moderate" },
      { date: "Mar 12, 2026", score: 9, severity: "Mild" },
      { date: "Apr 9, 2026", score: 7, severity: "Mild" },
    ]);
    const gad7Scores = buildSeries("gad7", [
      { date: "Jan 20, 2026", score: 15, severity: "Severe" },
      { date: "Feb 12, 2026", score: 12, severity: "Moderate" },
      { date: "Mar 12, 2026", score: 8, severity: "Mild" },
      { date: "Apr 9, 2026", score: 6, severity: "Mild" },
    ]);

    // Patient appointments — real API data first, then demo fallback,
    // then empty arrays in production-with-no-history.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatApt = (a: any) => {
      const dt = a.scheduledAt || a.scheduled_at || a.date;
      const date = dt ? new Date(dt) : null;
      const dateStr = date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
      const timeStr = date ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
      const provName = a.provider?.user
        ? `${a.provider.user.firstName || a.provider.user.first_name || ""} ${a.provider.user.lastName || a.provider.user.last_name || ""}`.trim()
        : (a.providerName || a.provider_name || "");
      return {
        id: a.id,
        date: dateStr,
        time: timeStr,
        type: a.appointmentType?.name || a.type || "Visit",
        provider: provName,
        duration: `${a.durationMinutes || a.duration_minutes || 30} min`,
        status: (a.status === "completed" ? "completed" : a.status === "canceled" || a.status === "cancelled" ? "cancelled" : a.status) as "completed" | "cancelled",
        telehealth: !!(a.isTelehealth ?? a.is_telehealth),
        notes: !!a.notes,
      };
    };
    const apiUpcoming = ptApiAppointments
      .filter((a) => {
        const dt = a.scheduledAt || a.scheduled_at;
        return dt && new Date(dt) > new Date();
      })
      .map(formatApt);
    const apiPast = ptApiAppointments
      .filter((a) => {
        const dt = a.scheduledAt || a.scheduled_at;
        return !dt || new Date(dt) <= new Date();
      })
      .map(formatApt);
    type PtApt = ReturnType<typeof formatApt>;
    const mockPtAppointments: { upcoming: PtApt[]; past: PtApt[] } = ptApiAppointments.length > 0
      ? { upcoming: apiUpcoming, past: apiPast }
      : isDemoMode ? {
        upcoming: [
          { id: "pa1", date: "Mar 25, 2026", time: "2:00 PM", type: "Med Management", provider: "Dr. Nageley Michel", telehealth: true, duration: "30 min", status: "completed" as const, notes: false },
        ],
        past: [
          { id: "pa2", date: "Mar 12, 2026", time: "", type: "Med Management", provider: "Dr. Nageley Michel", duration: "30 min", status: "completed" as const, notes: true, telehealth: false },
          { id: "pa3", date: "Feb 12, 2026", time: "", type: "Med Management", provider: "Dr. Nageley Michel", duration: "30 min", status: "completed" as const, notes: true, telehealth: false },
          { id: "pa4", date: "Jan 20, 2026", time: "", type: "Initial Evaluation", provider: "Dr. Nageley Michel", duration: "60 min", status: "completed" as const, notes: true, telehealth: false },
        ],
      } : { upcoming: [], past: [] };

    // Mock invoices for this patient
    // Patient invoices — real API rows from the per-patient slot, with
    // demo fallback so the billing card still feels populated for sales
    // walkthroughs of fresh tenants.
    type PtInvoice = { id: string; date: string; amount: number; status: "paid" | "open" | "pending" | "void" | "overdue"; description: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockPtInvoices: PtInvoice[] = (_ptApiInvoices as any[]).length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (_ptApiInvoices as any[]).map((iv: any) => ({
          id: iv.invoiceNumber || iv.invoice_number || iv.id,
          date: (iv.issuedAt || iv.issued_at || iv.createdAt || iv.created_at)
            ? new Date(iv.issuedAt || iv.issued_at || iv.createdAt || iv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : "",
          amount: Number(iv.totalAmount ?? iv.total_amount ?? iv.amount ?? 0),
          status: (iv.status === "paid" ? "paid" : iv.status === "pending" ? "pending" : iv.status === "void" ? "void" : iv.status === "overdue" ? "overdue" : "open") as PtInvoice["status"],
          description: iv.description || iv.lineItems?.[0]?.description || iv.line_items?.[0]?.description || "",
        }))
      : isDemoMode ? [
        { id: "INV-1050", date: "Mar 15, 2026", amount: 199.00, status: "paid" as const, description: "Complete Plan — March 2026" },
        { id: "INV-1038", date: "Feb 15, 2026", amount: 199.00, status: "paid" as const, description: "Complete Plan — February 2026" },
        { id: "INV-1025", date: "Jan 15, 2026", amount: 199.00, status: "paid" as const, description: "Complete Plan — January 2026" },
        { id: "INV-1045", date: "Mar 10, 2026", amount: 15.00, status: "open" as const, description: "Lab Results Review" },
      ] : [];

    // Mock documents
    type PtDoc = { id: string; name: string; type: string; date: string; status: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockDocuments: PtDoc[] = (_ptApiDocuments as any[]).length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (_ptApiDocuments as any[]).map((d: any) => ({
          id: d.id,
          name: d.name || d.title || d.fileName || d.file_name || "Document",
          type: (d.type || d.fileType || d.file_type || "file").toString().toUpperCase(),
          date: (d.createdAt || d.created_at || d.uploadedAt || d.uploaded_at)
            ? new Date(d.createdAt || d.created_at || d.uploadedAt || d.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : "",
          status: d.status || "uploaded",
        }))
      : isDemoMode ? [
        { id: "d1", name: "Intake Form", type: "PDF", date: "Jan 15, 2026", status: "uploaded" },
        { id: "d2", name: "HIPAA Consent", type: "PDF", date: "Jan 15, 2026", status: "signed" },
        { id: "d3", name: "Treatment Consent", type: "PDF", date: "Jan 15, 2026", status: "signed" },
      ] : [];

    // Patient messages thread for the practice-side detail drawer.
    // Real rows from the per-patient slot when available, demo fallback
    // otherwise. Each Message has body (encrypted->decoded by backend),
    // sender_id, sender_type, created_at.
    type PtMsg = { id: string; sender: string; text: string; time: string; isPatient: boolean };
    const ptName = pt.name || "Patient";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockPtMessages: PtMsg[] = (_ptApiMessages as any[]).length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (_ptApiMessages as any[])
          .slice()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .sort((a: any, b: any) => new Date(a.createdAt || a.created_at).getTime() - new Date(b.createdAt || b.created_at).getTime())
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((m: any) => {
            const senderType = (m.senderType ?? m.sender_type ?? (m.sender?.role === "patient" ? "patient" : "provider")) as string;
            const isPatient = senderType === "patient";
            const senderName = m.sender
              ? `${m.sender.firstName || m.sender.first_name || ""} ${m.sender.lastName || m.sender.last_name || ""}`.trim() || m.sender.name || (isPatient ? ptName : "Provider")
              : (isPatient ? ptName : "Provider");
            const ts = m.createdAt || m.created_at;
            return {
              id: m.id,
              sender: senderName,
              text: m.body || m.text || "",
              time: ts ? new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "",
              isPatient,
            };
          })
      : isDemoMode ? [
        { id: "pm1", sender: ptName, text: "Hi Dr. Michel, I wanted to let you know the medication is working well.", time: "Mar 14, 2026 9:15 AM", isPatient: true },
        { id: "pm2", sender: "Dr. Michel", text: "Great to hear! How's your mood been overall this past week?", time: "Mar 14, 2026 10:30 AM", isPatient: false },
      ] : [];

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

    // ─── Patient initials for the avatar (mirrors EnnHealth's gradient avatar) ──
    const patientInitials = (pt.name || "?")
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

    return (
      <div className="space-y-5">
        {/* Back link — Stripe slim pattern */}
        <button
          onClick={() => { setSelectedPatient(null); setPatientUtilization(null); setPatientActivities([]); setShowQuickActivityLog(false); }}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to patients
        </button>

        {/* Patient header card — flat border treatment */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-5 flex flex-col md:flex-row items-start gap-5">
            {/* Avatar */}
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center text-white text-base font-bold shrink-0"
              style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
            >
              {patientInitials}
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                    {pt.name}
                    {pt.preferredName && (
                      <span className="text-base font-normal text-slate-400 ml-2">({pt.preferredName})</span>
                    )}
                  </h1>
                  <PlanBadge plan={pt.plan} />
                  <StatusBadge status={pt.status} />
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-500">
                  {pt.memberId && (
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-4 h-4" />
                      <span className="font-mono">{pt.memberId}</span>
                    </div>
                  )}
                  {pt.memberSince && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      <span>Member since {pt.memberSince}</span>
                    </div>
                  )}
                  {pt.lastVisit && (
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-4 h-4" />
                      <span>Last visit: {pt.lastVisit}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick action buttons */}
              <div className="flex flex-wrap gap-2">
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: "#635bff" }}
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
              title={pt.userId ? "Generate a portal sign-in link the patient can use" : "Patient has no portal account yet"}
              onClick={async () => {
                if (!pt.userId) {
                  setToast({ message: "Patient has no linked portal account.", type: "error" });
                  return;
                }
                try {
                  const r = await apiFetch<{ resetUrl: string; expiresInMinutes: number }>(
                    `/admin/users/${pt.userId}/password-reset-link`,
                    { method: "POST" },
                  );
                  if (r.error || !r.data) {
                    setToast({ message: r.error || "Could not generate link.", type: "error" });
                    return;
                  }
                  setResetLinkModal({ url: r.data.resetUrl, patientName: pt.name });
                } catch {
                  setToast({ message: "Could not generate link.", type: "error" });
                }
              }}
            >
              <Key className="w-4 h-4" /> Get Reset Link
            </button>
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <Download className="w-4 h-4" /> Download Records
            </button>
              </div>
            </div>
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
          {/* Next / Last visit: derive from the per-patient appointments
              we already fetched, falling back to whatever the patient
              row carried (lastVisitAt/nextAppointmentAt). Keeps the
              tiles populated even though the patient list endpoint
              doesn't compute these. */}
          {(() => {
            const now = Date.now();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const apts = ptApiAppointments as any[];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const futures = apts.filter((a: any) => {
              const dt = a.scheduledAt || a.scheduled_at;
              return dt && new Date(dt).getTime() > now && a.status !== "cancelled" && a.status !== "canceled";
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const past = apts.filter((a: any) => {
              const dt = a.scheduledAt || a.scheduled_at;
              return dt && new Date(dt).getTime() <= now && (a.status === "completed" || a.status === "no_show");
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fmt = (d: any) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const next = futures.sort((a: any, b: any) => new Date(a.scheduledAt || a.scheduled_at).getTime() - new Date(b.scheduledAt || b.scheduled_at).getTime())[0];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const last = past.sort((a: any, b: any) => new Date(b.scheduledAt || b.scheduled_at).getTime() - new Date(a.scheduledAt || a.scheduled_at).getTime())[0];
            const nextLabel = next ? fmt(next.scheduledAt || next.scheduled_at) : (pt.nextApt && pt.nextApt !== "N/A" && pt.nextApt !== "—" ? pt.nextApt : "None scheduled");
            const lastLabel = last ? fmt(last.scheduledAt || last.scheduled_at) : (pt.lastVisit && pt.lastVisit !== "N/A" ? pt.lastVisit : "—");
            return (
              <>
                <div className="glass rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-1">Next Appointment</p>
                  <p className="text-sm font-bold text-slate-800">{nextLabel}</p>
                </div>
                <div className="glass rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-1">Last Visit</p>
                  <p className="text-sm font-bold text-slate-800">{lastLabel}</p>
                </div>
              </>
            );
          })()}
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

        {/* ── Benefits & Utilization Card ──────────────────────────────── */}
        {(() => {
          // Use the actual membership UUID for the utilization API call
          const membershipId = pt.membershipId || "";
          if (!membershipId) {
            return (
              <div className="glass rounded-xl p-5">
                <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4" style={{ color: "#27ab83" }} />
                  Benefits & Utilization
                </h3>
                <p className="text-sm text-slate-400 text-center py-4">No active membership. Enroll patient in a plan to track benefits.</p>
              </div>
            );
          }
          // Auto-fetch utilization when patient is viewed
          const shouldFetch = membershipId && patientUtilization === null && !utilizationLoading;
          if (shouldFetch) {
            setTimeout(() => fetchPatientUtilization(membershipId), 0);
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const usageItems: any[] = patientUtilization || [];
          const getUsageColor = (used: number, allowed: number | null) => {
            if (allowed === null || allowed === -1 || allowed === 0) return { bar: "#3b82f6", bg: "#eff6ff", text: "#1d4ed8" }; // blue for unlimited
            const pct = (used / allowed) * 100;
            if (pct > 80) return { bar: "#ef4444", bg: "#fef2f2", text: "#dc2626" }; // red
            if (pct > 50) return { bar: "#f59e0b", bg: "#fffbeb", text: "#d97706" }; // yellow
            return { bar: "#22c55e", bg: "#ecf9ec", text: "#2f8132" }; // green
          };

          return (
            <div className="glass rounded-xl p-5">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" style={{ color: "#27ab83" }} />
                Benefits & Utilization
              </h3>
              {utilizationLoading && (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "#e2e8f0", borderTopColor: "#27ab83" }} />
                  <span className="ml-2 text-sm text-slate-400">Loading utilization...</span>
                </div>
              )}
              {!utilizationLoading && usageItems.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No entitlement usage data available.</p>
              )}
              {!utilizationLoading && usageItems.length > 0 && (
                <div className="space-y-3">
                  {usageItems.map((item, idx) => {
                    const name = item.entitlementType?.name || item.entitlementTypeName || item.typeName || item.name || "Benefit";
                    const used = item.used ?? item.usedQuantity ?? 0;
                    const rawAllowed = item.allowed ?? item.allowedQuantity ?? item.total ?? null;
                    const allowed = rawAllowed === "unlimited" ? null : rawAllowed;
                    const isUnlimited = allowed === null || allowed === -1 || rawAllowed === "unlimited";
                    const pctRaw = isUnlimited ? 30 : (allowed > 0 ? (used / allowed) * 100 : 0);
                    const pct = Math.min(pctRaw, 100);
                    const colors = getUsageColor(used, allowed);
                    const savings = item.savings ?? item.savingsAmount ?? 0;

                    return (
                      <div key={idx} className="p-3 rounded-lg" style={{ backgroundColor: colors.bg }}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-slate-700">{name}</span>
                          <span className="text-xs font-semibold" style={{ color: colors.text }}>
                            {isUnlimited
                              ? `${used} used (unlimited)`
                              : `${used} of ${allowed} used`}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full" style={{ backgroundColor: "#e2e8f0" }}>
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: colors.bar }}
                          />
                        </div>
                        {Number(savings) > 0 && (
                          <p className="text-xs mt-1" style={{ color: colors.text }}>
                            Savings: ${Number(savings).toFixed(2)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {/* Total savings — Laravel decimal:2 columns serialize as
                      strings, so we have to coerce every reduction summand
                      or the running sum becomes a concat ("0" + "5.50" + …)
                      and .toFixed crashes the entire patient detail render. */}
                  {(() => {
                    const totalSavings = usageItems.reduce(
                      (sum, item) => sum + (Number(item.savings ?? item.savingsAmount ?? 0) || 0),
                      0,
                    );
                    if (totalSavings <= 0) return null;
                    return (
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700">Total Savings</span>
                        <span className="text-sm font-bold" style={{ color: "#2f8132" }}>
                          ${totalSavings.toFixed(2)}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Activity Log Section ──────────────────────────────────── */}
        {(() => {
          // Auto-fetch activities when patient detail is viewed
          if (pt && patientActivities.length === 0 && !patientActivitiesLoading) {
            setTimeout(() => fetchPatientActivities(pt.id), 0);
          }

          const ACTIVITY_TYPE_CONFIG: Record<string, { label: string; category: string }> = {
            phone_call: { label: "Phone Call", category: "communication" },
            text_message: { label: "Text Message", category: "communication" },
            after_hours_call: { label: "After Hours Call", category: "communication" },
            home_visit: { label: "Home Visit", category: "clinical" },
            care_coordination: { label: "Care Coordination", category: "clinical" },
            referral_call: { label: "Referral Call", category: "clinical" },
            education: { label: "Education", category: "clinical" },
            medication_dispensed: { label: "Medication Dispensed", category: "clinical" },
            ccm_time: { label: "CCM Time", category: "chronic" },
            rpm_review: { label: "RPM Review", category: "chronic" },
            other: { label: "Other", category: "other" },
          };
          const CAT_COLORS: Record<string, { bg: string; text: string }> = {
            communication: { bg: "#e0ecff", text: "#1e40af" },
            clinical: { bg: "#e6f7f2", text: "#147d64" },
            chronic: { bg: "#f3e8ff", text: "#7c3aed" },
            other: { bg: "#f1f5f9", text: "#64748b" },
          };

          return (
            <div className="glass rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" style={{ color: "#27ab83" }} />
                  Activity Log
                </h3>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                  style={{ backgroundColor: "#635bff" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                  onClick={() => { setShowQuickActivityLog(true); setQuickActivityForm({ activityType: "", durationMinutes: "15", notes: "" }); }}
                >
                  <Plus className="w-3 h-3" /> Log Activity
                </button>
              </div>

              {patientActivitiesLoading && (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "#e2e8f0", borderTopColor: "#27ab83" }} />
                  <span className="ml-2 text-sm text-slate-400">Loading activities...</span>
                </div>
              )}

              {!patientActivitiesLoading && patientActivities.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No activities logged yet.</p>
              )}

              {!patientActivitiesLoading && patientActivities.length > 0 && (
                <div className="space-y-2">
                  {patientActivities.map((activity, idx) => {
                    const typeKey = activity.activityType || activity.activity_type || "other";
                    const config = ACTIVITY_TYPE_CONFIG[typeKey] || ACTIVITY_TYPE_CONFIG.other;
                    const catColors = CAT_COLORS[config.category] || CAT_COLORS.other;
                    const date = activity.createdAt || activity.created_at || activity.date || "";
                    const duration = activity.durationMinutes || activity.duration_minutes || 0;
                    const notes = activity.notes || "";
                    const entitlementDeducted = activity.entitlementDeducted ?? activity.entitlement_deducted ?? null;

                    return (
                      <div key={activity.id || idx} className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: "rgba(16,42,67,0.02)" }}>
                        <div className="shrink-0 mt-0.5">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: catColors.bg, color: catColors.text }}
                          >
                            {config.label}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          {notes && <p className="text-sm text-slate-700">{notes}</p>}
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                            {date && <span>{new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} {new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
                            {duration > 0 && <span>{duration} min</span>}
                            {entitlementDeducted && <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "#fffbeb", color: "#d97706" }}>Entitlement deducted</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {patientActivitiesTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-slate-100">
                  <button
                    disabled={patientActivitiesPage <= 1}
                    onClick={() => fetchPatientActivities(pt.id, patientActivitiesPage - 1)}
                    className="px-3 py-1 rounded text-xs font-medium disabled:opacity-40"
                    style={{ color: "#334e68" }}
                  >
                    Previous
                  </button>
                  <span className="text-xs text-slate-400">Page {patientActivitiesPage} of {patientActivitiesTotalPages}</span>
                  <button
                    disabled={patientActivitiesPage >= patientActivitiesTotalPages}
                    onClick={() => fetchPatientActivities(pt.id, patientActivitiesPage + 1)}
                    className="px-3 py-1 rounded text-xs font-medium disabled:opacity-40"
                    style={{ color: "#334e68" }}
                  >
                    Next
                  </button>
                </div>
              )}

              {/* Quick Activity Log Form */}
              {showQuickActivityLog && (
                <div className="mt-4 p-4 rounded-lg border border-slate-200" style={{ backgroundColor: "#fafbfc" }}>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Log Activity for {pt.name}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Activity Type *</label>
                      <select
                        value={quickActivityForm.activityType}
                        onChange={(e) => setQuickActivityForm(f => ({ ...f, activityType: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none bg-white"
                      >
                        <option value="">Select type...</option>
                        {Object.entries(ACTIVITY_TYPE_CONFIG).map(([val, cfg]) => (
                          <option key={val} value={val}>{cfg.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Duration (min)</label>
                      <input
                        type="number"
                        value={quickActivityForm.durationMinutes}
                        onChange={(e) => setQuickActivityForm(f => ({ ...f, durationMinutes: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none bg-white"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Notes</label>
                      <input
                        type="text"
                        value={quickActivityForm.notes}
                        onChange={(e) => setQuickActivityForm(f => ({ ...f, notes: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none bg-white"
                        placeholder="Optional notes..."
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-3">
                    <button
                      onClick={() => setShowQuickActivityLog(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleQuickActivityLog(pt.id)}
                      disabled={!quickActivityForm.activityType || quickActivityLoading}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-50"
                      style={{ backgroundColor: "#635bff" }}
                    >
                      {quickActivityLoading ? "Saving..." : "Save Activity"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Detail Tab Bar (EnnHealth-style two-row icon pills) ─── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          {/* Primary row: clinical chart sections */}
          <div className="flex items-center gap-1 border-b border-slate-200 px-3 overflow-x-auto">
            {primaryDetailTabs.map((tab) => {
              const Icon = tab.icon;
              const active = patientDetailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setPatientDetailTab(tab.id)}
                  className="flex items-center gap-2 px-4 py-3 text-sm transition-all whitespace-nowrap"
                  style={{
                    color: active ? "#147d64" : "#64748b",
                    borderBottom: active ? "2px solid #147d64" : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "#334e68"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "#64748b"; }}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
          {/* Secondary row: notes / measures / admin */}
          <div className="flex items-center gap-1 px-3 overflow-x-auto" style={{ backgroundColor: "#f8fafc" }}>
            {secondaryDetailTabs.map((tab) => {
              const Icon = tab.icon;
              const active = patientDetailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setPatientDetailTab(tab.id)}
                  className="flex items-center gap-2 px-4 py-3 text-sm transition-all whitespace-nowrap"
                  style={{
                    color: active ? "#147d64" : "#64748b",
                    backgroundColor: active ? "#ffffff" : "transparent",
                    borderBottom: active ? "2px solid #147d64" : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "#334e68"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "#64748b"; }}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
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
                  <div><p className="text-slate-400 text-xs">Date of Birth</p><p className="text-slate-700 font-medium">{formatDob(pt.dob) || "—"}</p></div>
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
                  style={{ backgroundColor: "#635bff" }}
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
                  style={{ backgroundColor: "#635bff" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                  onClick={() => setAllergyDialogOpen(true)}
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
                style={{ backgroundColor: "#635bff" }}
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
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(ptApiPrescriptions.length > 0 ? ptApiPrescriptions : (pt.medications || [])).map((med: any, i: number) => {
                      const name = med.name || med.medicationName || med.medication_name || "—";
                      const dosage = med.dosage || "";
                      const frequency = med.frequency || "";
                      const prescriber = med.prescriber || med.providerName || med.provider?.user?.firstName || "";
                      const status = med.status || "active";
                      const startDate = med.startDate || med.prescribedAt || med.prescribed_at || "";
                      const startDateStr = typeof startDate === "string" && startDate.length > 10
                        ? new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : startDate;
                      return (
                        <tr key={med.id || i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700">{name}</td>
                          <td className="px-4 py-3 text-slate-600">{dosage}</td>
                          <td className="px-4 py-3 text-slate-500">{frequency}</td>
                          <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{prescriber}</td>
                          <td className="px-4 py-3">
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                              style={status === "active" ? { backgroundColor: "#ecf9ec", color: "#2f8132" } : { backgroundColor: "#f1f5f9", color: "#64748b" }}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{startDateStr}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {status === "active" && (
                                <>
                                  <button className="px-2 py-1 rounded text-xs font-medium" style={{ color: "#27ab83" }} onClick={() => setToast({ message: "Use the Prescriptions tab to manage refills.", type: "success" })}>Refill</button>
                                  <button className="px-2 py-1 rounded text-xs font-medium text-slate-400" onClick={() => setToast({ message: "Use the Prescriptions tab to discontinue.", type: "success" })}>Discontinue</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {ptApiPrescriptions.length === 0 && (!pt.medications || pt.medications.length === 0) && (
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
        {patientDetailTab === "encounters" && (() => {
          // Patient encounter list reads from the per-patient API slot
          // populated when this patient was opened. Falls through to the
          // global apiEncountersRaw filter (older path) and finally the
          // demo mockEncounters when nothing has loaded yet.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const scopedEncounters = (_ptApiEncounters as any[]).length > 0
            ? _ptApiEncounters
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            : (apiEncountersRaw || []).filter((e: any) => e.patientId === pt.id || e.patient_id === pt.id);
          const useReal = !isDemoMode || scopedEncounters.length > 0;
          const encountersToShow = useReal ? scopedEncounters : mockEncounters;
          return (
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-800">Visit Notes (SOAP)</h3>
              {encountersToShow.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-sm">No encounter notes for this patient yet.</div>
              )}
              {encountersToShow.map((enc: any) => {
                const isExpanded = expandedEncounters.includes(enc.id);
                const typeBg: Record<string, { bg: string; text: string }> = {
                  // Backend enum values
                  office_visit: { bg: "#e0e8f0", text: "#334e68" },
                  follow_up: { bg: "#e6f7f2", text: "#147d64" },
                  telehealth: { bg: "#f3e8ff", text: "#7c3aed" },
                  phone: { bg: "#fef3c7", text: "#92400e" },
                  urgent: { bg: "#fee2e2", text: "#b91c1c" },
                  annual_wellness: { bg: "#fffbeb", text: "#d97706" },
                  procedure: { bg: "#dbeafe", text: "#1e40af" },
                  // Demo-mode display values kept for backward compat
                  "Initial Evaluation": { bg: "#e6f7f2", text: "#147d64" },
                  "Med Management": { bg: "#e0e8f0", text: "#334e68" },
                  "Therapy": { bg: "#fffbeb", text: "#d97706" },
                };
                const encType = enc.encounterType || enc.type || "follow_up";
                const tb = typeBg[encType] || typeBg.follow_up;
                const encDate = enc.encounterDate
                  ? new Date(enc.encounterDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : (enc.date || "—");
                const providerLabel = enc.provider
                  ? `${enc.provider.title || ""} ${enc.provider.lastName || enc.provider.last_name || ""}`.trim() || enc.provider.firstName || ""
                  : (typeof enc.provider === "string" ? enc.provider : "");
                const isSigned = enc.signed_at || enc.signedAt || enc.status === "signed" || enc.signed;
                return (
                  <div key={enc.id} className="glass rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleEncounter(enc.id)}
                      className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-medium text-slate-700">{encDate}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium capitalize" style={{ backgroundColor: tb.bg, color: tb.text }}>{encType.replace(/_/g, " ")}</span>
                        {providerLabel && <span className="text-sm text-slate-500">{providerLabel}</span>}
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={isSigned ? { backgroundColor: "#ecf9ec", color: "#2f8132" } : { backgroundColor: "#fffbeb", color: "#d97706" }}>
                          {isSigned ? "Signed" : "Draft"}
                        </span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
                        {(enc.chiefComplaint || enc.chief_complaint) && (
                          <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Chief Complaint</p>
                            <p className="text-sm text-slate-600">{enc.chiefComplaint || enc.chief_complaint}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#27ab83" }}>S — Subjective</p>
                          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{enc.subjective || <span className="text-slate-400 italic">Not documented</span>}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#334e68" }}>O — Objective</p>
                          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{enc.objective || <span className="text-slate-400 italic">Not documented</span>}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#d97706" }}>A — Assessment</p>
                          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{enc.assessment || <span className="text-slate-400 italic">Not documented</span>}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#147d64" }}>P — Plan</p>
                          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{enc.plan || <span className="text-slate-400 italic">Not documented</span>}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Screenings */}
        {patientDetailTab === "screenings" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Screening Score History</h3>
              <button
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                style={{ backgroundColor: "#635bff" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                onClick={() => setMeasureDialogOpen(true)}
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
            {phq9Scores.length > 0 && <div className="glass rounded-xl p-6">
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
            </div>}
            {phq9Scores.length === 0 && gad7Scores.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-sm">No screening data available for this patient.</div>
            )}
          </div>
        )}

        {/* Billing */}
        {patientDetailTab === "billing" && (
          <div className="space-y-6">
            {/* Membership Card — renders real data, no demo fallback. */}
            <div className="glass rounded-xl p-6">
              <h3 className="font-semibold text-slate-800 mb-4">Membership</h3>
              {pt.plan && pt.plan !== "No Plan" && pt.membershipId ? (
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div
                    className="rounded-xl p-5 flex-1"
                    style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
                  >
                    <p className="text-white text-sm opacity-80">Current Plan</p>
                    <p className="text-white text-xl font-bold mt-1">{pt.plan}</p>
                    {pt.planPrice ? (
                      <p className="text-white text-lg font-semibold mt-2">
                        ${Number(pt.planPrice).toLocaleString()}/mo
                      </p>
                    ) : null}
                    {pt.memberId ? (
                      <p className="text-white text-xs opacity-70 mt-2 font-mono">
                        Member ID: {pt.memberId}
                      </p>
                    ) : null}
                    {pt.memberSince ? (
                      <p className="text-white text-xs opacity-70">
                        Member since {formatDob(pt.memberSince) || pt.memberSince}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      className="px-4 py-2 rounded-md text-sm font-medium border transition-colors"
                      style={{ borderColor: "#635bff", color: "#635bff" }}
                      onClick={() => {
                        if (!pt.membershipId) return;
                        setRosterPlanDialog({
                          patientId: pt.id,
                          patientName: pt.name,
                          membershipId: pt.membershipId,
                          mode: "change",
                        });
                        fetchRosterPlans();
                        setRosterSelectedPlanId(null);
                      }}
                    >
                      Change Plan
                    </button>
                    <button
                      className="px-4 py-2 rounded-md text-sm font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                      onClick={() => setToast({ message: "Payment method updates coming soon — patients can update directly from their portal.", type: "success" })}
                    >
                      Update Payment
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
                  <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-medium text-slate-700 mb-1">No active membership</p>
                  <p className="text-xs text-slate-500 mb-4">
                    {pt.name} hasn't enrolled in a plan yet.
                  </p>
                  <button
                    className="px-4 py-2 rounded-md text-sm font-medium text-white"
                    style={{ backgroundColor: "#635bff" }}
                    onClick={() => {
                      setRosterPlanDialog({
                        patientId: pt.id,
                        patientName: pt.name,
                        mode: "enroll",
                      });
                      fetchRosterPlans();
                      setRosterSelectedPlanId(null);
                    }}
                  >
                    Enroll in plan
                  </button>
                </div>
              )}
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
                    {mockPtInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                          No invoices yet for this patient.
                        </td>
                      </tr>
                    ) : (
                      mockPtInvoices.map((inv) => (
                        <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-sm font-medium text-slate-700">{inv.id}</td>
                          <td className="px-4 py-3 text-slate-500">{inv.date}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">${Number(inv.amount ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                          <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{inv.description}</td>
                          <td className="px-4 py-3">
                            <button
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 transition-colors"
                              onClick={() => setToast({ message: "Invoice PDF download coming soon.", type: "success" })}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
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
                  style={{ backgroundColor: "#635bff" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                  onClick={() => setToast({ message: "Payment method management coming soon.", type: "success" })}
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

        {/* Vitals — ported from EnnHealth's vitals tab; data source not yet wired. */}
        {patientDetailTab === "vitals" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Vital Signs</h3>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ backgroundColor: "#635bff" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                onClick={() => setToast({ message: "Record Vitals dialog — coming soon.", type: "success" })}
              >
                <Plus className="w-3.5 h-3.5" /> Record Vitals
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {[
                { label: "Blood Pressure", value: "—", unit: "mmHg", icon: Heart, color: "#dc2626" },
                { label: "Heart Rate", value: "—", unit: "bpm", icon: Activity, color: "#7c3aed" },
                { label: "Temperature", value: "—", unit: "°F", icon: Activity, color: "#d97706" },
                { label: "Respiratory Rate", value: "—", unit: "/min", icon: Activity, color: "#147d64" },
                { label: "O₂ Saturation", value: "—", unit: "%", icon: Activity, color: "#1d4ed8" },
                { label: "Weight", value: "—", unit: "lbs", icon: Activity, color: "#334e68" },
                { label: "Height", value: "—", unit: "in", icon: Activity, color: "#334e68" },
                { label: "BMI", value: "—", unit: "", icon: Activity, color: "#27ab83" },
              ].map((v) => {
                const VIcon = v.icon;
                return (
                  <div key={v.label} className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <VIcon className="w-4 h-4" style={{ color: v.color }} />
                      <p className="text-xs font-medium text-slate-500">{v.label}</p>
                    </div>
                    <p className="text-2xl font-bold text-slate-800">{v.value}</p>
                    {v.unit && <p className="text-xs text-slate-400">{v.unit}</p>}
                  </div>
                );
              })}
            </div>
            <div className="glass rounded-xl p-6 text-center">
              <Activity className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500">No vitals recorded yet for {pt.name}.</p>
              <p className="text-xs text-slate-400 mt-1">Click "Record Vitals" to add the first reading.</p>
            </div>
          </div>
        )}

        {/* Labs — placeholder list; backend lab orders endpoint TBD. */}
        {patientDetailTab === "labs" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Lab Results</h3>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ backgroundColor: "#635bff" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                onClick={() => setToast({ message: "Order Lab dialog — coming soon.", type: "success" })}
              >
                <Plus className="w-3.5 h-3.5" /> Order Lab
              </button>
            </div>
            <div className="glass rounded-xl p-8 text-center">
              <FlaskConical className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-sm text-slate-500">No lab results on file for {pt.name}.</p>
              <p className="text-xs text-slate-400 mt-1">Lab orders and results will appear here once integrated.</p>
            </div>
          </div>
        )}

        {/* Wellness — index card pattern from EnnHealth. */}
        {patientDetailTab === "wellness" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800">Wellness Index</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div
                className="rounded-xl p-6 text-white"
                style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Heart className="w-5 h-5" />
                  <p className="text-sm font-medium opacity-90">Overall Wellness</p>
                </div>
                <p className="text-5xl font-bold mb-1">—</p>
                <p className="text-xs opacity-75">out of 100 — no data yet</p>
              </div>
              {[
                { label: "Physical Activity", value: "—", icon: Activity },
                { label: "Sleep Quality", value: "—", icon: Activity },
                { label: "Treatment Adherence", value: "—", icon: Pill },
                { label: "Mindfulness", value: "—", icon: Heart },
                { label: "Social Connection", value: "—", icon: UsersRound },
              ].map((w) => {
                const WIcon = w.icon;
                return (
                  <div key={w.label} className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <WIcon className="w-4 h-4" style={{ color: "#147d64" }} />
                      <p className="text-xs font-medium text-slate-500">{w.label}</p>
                    </div>
                    <p className="text-2xl font-bold text-slate-800">{w.value}</p>
                  </div>
                );
              })}
            </div>
            <div className="glass rounded-xl p-6">
              <h4 className="font-semibold text-slate-800 mb-2">Recent Activities</h4>
              <p className="text-sm text-slate-400 text-center py-6">No wellness activities logged yet.</p>
            </div>
          </div>
        )}

        {/* Consents — placeholder list with request flow. */}
        {patientDetailTab === "consents" && (
          <PatientConsentsTab patientId={pt.id} setToast={setToast} />
        )}

        {/* Care Team — assigned providers + external contacts. */}
        {patientDetailTab === "care-team" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Care Team</h3>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ backgroundColor: "#635bff" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
                onClick={() => setToast({ message: "Add Team Member dialog — coming soon.", type: "success" })}
              >
                <UserPlus className="w-3.5 h-3.5" /> Add Member
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(() => {
                const primaryEc = pt.emergencyContacts?.[0];
                const members: Array<{ name: string; role: string; color: string; sub?: string }> = [
                  { name: pt.provider || "Unassigned", role: "Primary Provider", color: "#147d64" },
                  { name: "—", role: "Care Coordinator", color: "#1d4ed8" },
                  {
                    name: primaryEc?.name || "—",
                    role: primaryEc?.relationship ? `Emergency Contact — ${primaryEc.relationship}` : "Emergency Contact",
                    color: "#dc2626",
                    sub: primaryEc?.phone,
                  },
                  {
                    name: pt.referringProvider?.name || "—",
                    role: "Referring Provider",
                    color: "#7c3aed",
                    sub: pt.referringProvider?.phone,
                  },
                ];
                return members.map((m, idx) => (
                  <div key={idx} className="glass rounded-xl p-4 flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold shrink-0"
                      style={{ backgroundColor: m.color }}
                    >
                      {m.name && m.name !== "—"
                        ? m.name.split(" ").map((n: string) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
                        : "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                      <p className="text-xs text-slate-400">{m.role}</p>
                      {m.sub && <p className="text-xs text-slate-500 mt-0.5">{m.sub}</p>}
                    </div>
                  </div>
                ));
              })()}
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
                  <button
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                    onClick={() => setToast({ message: "Document download coming soon.", type: "success" })}
                  >
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
                    style={{ backgroundColor: "#635bff" }}
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

  // ─── Plan Detail View ──────────────────────────────────────────────────

  function renderPlanDetail() {
    const plan = selectedPlan;
    if (!plan) return null;

    const monthlyPrice = plan.monthlyPrice ?? plan.monthly_price ?? 0;
    const annualPrice = plan.annualPrice ?? plan.annual_price ?? 0;
    const memberCount = plan.membershipsCount ?? plan.memberCount ?? plan.member_count ?? 0;
    const mrr = memberCount * monthlyPrice;
    const arr = mrr * 12;
    const isActive = plan.isActive !== false && plan.is_active !== false;
    const createdAt = plan.createdAt || plan.created_at || null;

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
    const gradient = planGradients[plan.name] || planGradients.Essential;
    const Icon = planIcons[plan.name] || Heart;

    const categoryColors: Record<string, { bg: string; text: string }> = {
      visit: { bg: "#dbeafe", text: "#1d4ed8" },
      communication: { bg: "#dcfce7", text: "#15803d" },
      lab: { bg: "#f3e8ff", text: "#7c3aed" },
      procedure: { bg: "#ffedd5", text: "#c2410c" },
      rx: { bg: "#fce7f3", text: "#be185d" },
      program: { bg: "#ccfbf1", text: "#0f766e" },
      access: { bg: "#f1f5f9", text: "#475569" },
    };

    const getCategoryColor = (category: string) => {
      const key = (category || "").toLowerCase();
      for (const [k, v] of Object.entries(categoryColors)) {
        if (key.includes(k)) return v;
      }
      return categoryColors.access;
    };

    // Group entitlements by category
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupedEntitlements: Record<string, any[]> = {};
    for (const ent of planDetailEntitlements) {
      const cat = ent.entitlementType?.category || ent.category || "Other";
      if (!groupedEntitlements[cat]) groupedEntitlements[cat] = [];
      groupedEntitlements[cat].push(ent);
    }

    const detailTabs = [
      { id: "overview" as const, label: "Overview" },
      { id: "entitlements" as const, label: "Entitlements" },
      { id: "members" as const, label: "Members" },
      { id: "utilization" as const, label: "Utilization" },
      { id: "revenue" as const, label: "Revenue" },
    ];

    return (
      <div className="space-y-6">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <button
            onClick={() => setSelectedPlan(null)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ color: "#475569" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f1f5f9"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ""; }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Plans
          </button>
        </div>

        {/* Plan Header Card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
        >
          <div className="p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
              <Icon className="w-32 h-32 -mt-6 -mr-6" />
            </div>
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold">{plan.name}</h1>
                  {plan.badge && (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#ffffff" }}
                    >
                      {plan.badge}
                    </span>
                  )}
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: isActive ? "rgba(39,171,131,0.3)" : "rgba(239,68,68,0.3)",
                      color: "#ffffff",
                    }}
                  >
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold">${monthlyPrice}</span>
                  <span className="text-sm opacity-80">/month</span>
                  {annualPrice > 0 && (
                    <>
                      <span className="text-sm opacity-50">|</span>
                      <span className="text-lg font-semibold">${annualPrice.toLocaleString()}</span>
                      <span className="text-sm opacity-80">/year</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#ffffff" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.2)"; }}
                  onClick={() => {
                    setEditPlanForm({
                      id: plan.id,
                      name: plan.name,
                      monthlyPrice: String(monthlyPrice),
                      annualPrice: String(annualPrice),
                      description: plan.description ?? "",
                    });
                    fetchEntitlementTypes();
                    fetchPlanEntitlements(plan.id);
                    setShowEditPlan(true);
                  }}
                >
                  <Pencil className="w-4 h-4 inline mr-1.5" />
                  Edit Plan
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)"; }}
                  onClick={() => handleDeactivatePlan(plan.id, plan.name)}
                >
                  {isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Detail Tabs ──────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {detailTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPlanDetailTab(tab.id)}
              className="px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2"
              style={{
                borderBottomColor: planDetailTab === tab.id ? gradient.accent : "transparent",
                color: planDetailTab === tab.id ? gradient.accent : "#64748b",
              }}
              onMouseEnter={(e) => { if (planDetailTab !== tab.id) e.currentTarget.style.color = "#334155"; }}
              onMouseLeave={(e) => { if (planDetailTab !== tab.id) e.currentTarget.style.color = "#64748b"; }}
            >
              {tab.label}
              {tab.id === "entitlements" && planDetailEntitlements.length > 0 && (
                <span
                  className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs"
                  style={{ backgroundColor: gradient.light, color: gradient.accent }}
                >
                  {planDetailEntitlements.length}
                </span>
              )}
              {tab.id === "members" && (
                <span
                  className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs"
                  style={{ backgroundColor: gradient.light, color: gradient.accent }}
                >
                  {planDetailMembers.length || memberCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Section 1: Overview ───────────────────────────────────── */}
        {planDetailTab === "overview" && (
          <div className="space-y-6">
            {/* Description */}
            {plan.description && (
              <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Description</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{plan.description}</p>
              </div>
            )}

            {/* Key Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#dbeafe" }}>
                    <Users className="w-5 h-5" style={{ color: "#1d4ed8" }} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Members</p>
                    <p className="text-xl font-bold text-slate-800">{memberCount}</p>
                  </div>
                </div>
              </div>
              <div className="glass rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#dcfce7" }}>
                    <DollarSign className="w-5 h-5" style={{ color: "#15803d" }} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">MRR</p>
                    <p className="text-xl font-bold text-slate-800">${mrr.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="glass rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#f3e8ff" }}>
                    <TrendingUp className="w-5 h-5" style={{ color: "#7c3aed" }} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Annual Revenue</p>
                    <p className="text-xl font-bold text-slate-800">${arr.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="glass rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#ffedd5" }}>
                    <Calendar className="w-5 h-5" style={{ color: "#c2410c" }} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Created</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {createdAt ? new Date(createdAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Entitlements Summary */}
            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Plan Benefits</h3>
              {planDetailEntitlementsLoading ? (
                <p className="text-sm text-slate-400 py-4 text-center">Loading entitlements...</p>
              ) : planDetailEntitlements.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm text-slate-400">No entitlements configured.</p>
                  {/* Show mock entitlement list if available */}
                  {Array.isArray(plan.entitlements) && plan.entitlements.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {plan.entitlements.map((item: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                          <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: gradient.accent }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <ul className="space-y-2">
                  {planDetailEntitlements.map((ent: Record<string, unknown>, i: number) => {
                    const name = (ent.entitlementType as Record<string, unknown>)?.name || ent.typeName || ent.type_name || "Benefit";
                    const cat = (ent.entitlementType as Record<string, unknown>)?.category || ent.category || "";
                    const catColor = getCategoryColor(cat as string);
                    const qty = (ent.isUnlimited || ent.unlimited) ? "\u221E" : String(ent.quantityLimit ?? ent.quantity ?? ent.allowedQuantity ?? 0);
                    return (
                      <li key={i} className="flex items-center gap-3 text-sm text-slate-600">
                        <Check className="w-4 h-4 shrink-0" style={{ color: gradient.accent }} />
                        <span className="font-medium">{String(name)}</span>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: catColor.bg, color: catColor.text }}
                        >
                          {String(cat)}
                        </span>
                        <span className="text-slate-400">{qty}/{String(ent.period || "month")}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ── Section 2: Entitlements ──────────────────────────────── */}
        {planDetailTab === "entitlements" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">Plan Entitlements</h3>
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ backgroundColor: "#e6f7f2", color: "#147d64" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#d1f0e5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#e6f7f2"; }}
                onClick={() => {
                  fetchEntitlementTypes();
                  setPlanDetailShowAddEntitlement(true);
                }}
              >
                <Plus className="w-4 h-4" /> Add Entitlement
              </button>
            </div>

            {/* Add entitlement type selector */}
            {planDetailShowAddEntitlement && (
              <div className="glass rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-slate-700">Select entitlement type to add:</p>
                  <button
                    onClick={() => setPlanDetailShowAddEntitlement(false)}
                    className="p-1 rounded hover:bg-slate-100 text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {entitlementTypesLoading && (
                  <span className="text-sm text-slate-400">Loading entitlement types…</span>
                )}
                {!entitlementTypesLoading && entitlementTypes.length === 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="mb-2">
                      No entitlement types are seeded for this practice yet.
                    </p>
                    <button
                      onClick={async () => {
                        const r = await apiFetch("/practice/rebootstrap", { method: "POST" });
                        if (r.error) {
                          setToast({ message: r.error, type: "error" });
                          return;
                        }
                        setToast({ message: "Catalog rebuilt — fetching types…", type: "success" });
                        await fetchEntitlementTypes();
                      }}
                      className="px-3 py-1.5 rounded-md text-xs font-medium text-white"
                      style={{ backgroundColor: "#635bff" }}
                    >
                      Repair catalog now
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {entitlementTypes.map((et: { id: string; name: string; code?: string; category?: string }) => {
                    const alreadyAdded = planDetailEntitlements.some(
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (e: any) => (e.entitlementTypeId || e.entitlement_type_id) === et.id
                    );
                    const catColor = getCategoryColor(et.category || "");
                    return (
                      <button
                        key={et.id}
                        disabled={alreadyAdded}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40"
                        style={{ borderColor: catColor.text, color: alreadyAdded ? "#94a3b8" : catColor.text }}
                        onClick={() => handleAddPlanDetailEntitlement(plan.id, et.id)}
                      >
                        {et.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {planDetailEntitlementsLoading ? (
              <div className="py-8 text-center text-slate-400">Loading entitlements...</div>
            ) : planDetailEntitlements.length === 0 ? (
              <div className="glass rounded-xl py-12 text-center">
                <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-40" style={{ color: "#94a3b8" }} />
                <p className="text-sm text-slate-400">No entitlements configured yet.</p>
                <p className="text-xs text-slate-300 mt-1">Click "Add Entitlement" to configure plan benefits.</p>
              </div>
            ) : (
              Object.entries(groupedEntitlements).map(([category, ents]) => {
                const catColor = getCategoryColor(category);
                return (
                  <div key={category} className="glass rounded-xl overflow-hidden">
                    <div
                      className="px-5 py-3 border-b"
                      style={{ backgroundColor: catColor.bg, borderColor: `${catColor.text}22` }}
                    >
                      <h4 className="text-sm font-semibold" style={{ color: catColor.text }}>
                        {category}
                      </h4>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {ents.map((ent: any) => {
                        const entId = ent.id;
                        const name = ent.entitlementType?.name || ent.typeName || ent.type_name || "Benefit";
                        const qty = (ent.isUnlimited || ent.unlimited) ? "Unlimited" : String(ent.quantityLimit ?? ent.quantity ?? ent.allowedQuantity ?? 0);
                        const period = ent.period || "monthly";
                        const overage = ent.overagePolicy || ent.overage_policy || "block";
                        const cashValue = ent.cashValue ?? ent.cash_value ?? null;
                        const isEditing = planDetailEditingEntitlement === entId;

                        if (isEditing) {
                          return (
                            <div key={entId} className="px-5 py-3" style={{ backgroundColor: "#fafbfc" }}>
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-medium text-slate-700 min-w-24">{name}</span>
                                <div className="flex items-center gap-1.5">
                                  <label className="text-xs text-slate-500">Qty:</label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={planDetailEditForm.quantity ?? 1}
                                    disabled={planDetailEditForm.unlimited}
                                    onChange={(e) => setPlanDetailEditForm({ ...planDetailEditForm, quantity: parseInt(e.target.value) || 1 })}
                                    className="w-16 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 disabled:opacity-40"
                                  />
                                </div>
                                <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={planDetailEditForm.unlimited ?? false}
                                    onChange={(e) => setPlanDetailEditForm({ ...planDetailEditForm, unlimited: e.target.checked })}
                                    className="accent-teal-600"
                                  />
                                  Unlimited
                                </label>
                                <select
                                  value={planDetailEditForm.period || "monthly"}
                                  onChange={(e) => setPlanDetailEditForm({ ...planDetailEditForm, period: e.target.value })}
                                  className="px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none"
                                >
                                  <option value="monthly">Monthly</option>
                                  <option value="quarterly">Quarterly</option>
                                  <option value="yearly">Yearly</option>
                                </select>
                                <select
                                  value={planDetailEditForm.overagePolicy || "block"}
                                  onChange={(e) => setPlanDetailEditForm({ ...planDetailEditForm, overagePolicy: e.target.value })}
                                  className="px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none"
                                >
                                  <option value="block">Block</option>
                                  <option value="charge">Charge</option>
                                  <option value="notify">Notify</option>
                                  <option value="allow">Allow</option>
                                </select>
                                <div className="flex gap-1 ml-auto">
                                  <button
                                    className="px-2.5 py-1 rounded text-xs font-medium text-white transition-colors"
                                    style={{ backgroundColor: "#635bff" }}
                                    onClick={() => handleUpdatePlanDetailEntitlement(plan.id, entId, {
                                      quantityLimit: planDetailEditForm.unlimited ? null : planDetailEditForm.quantity,
                                      isUnlimited: planDetailEditForm.unlimited,
                                      periodType: planDetailEditForm.period === "monthly" ? "per_month" : planDetailEditForm.period === "quarterly" ? "per_quarter" : planDetailEditForm.period === "yearly" ? "per_year" : planDetailEditForm.period,
                                      overagePolicy: planDetailEditForm.overagePolicy,
                                    })}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="px-2.5 py-1 rounded text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                                    onClick={() => setPlanDetailEditingEntitlement(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={entId} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700">{name}</p>
                            </div>
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ backgroundColor: catColor.bg, color: catColor.text }}
                            >
                              {category}
                            </span>
                            <div className="text-sm text-slate-600 w-20 text-center font-medium">{qty}</div>
                            <div className="text-xs text-slate-400 w-16 text-center capitalize">{period}</div>
                            <div className="text-xs text-slate-400 w-16 text-center capitalize">{overage}</div>
                            {cashValue !== null && cashValue !== undefined && (
                              <div className="text-xs text-slate-500 w-16 text-right">${Number(cashValue).toFixed(2)}</div>
                            )}
                            <div className="flex gap-1 shrink-0">
                              <button
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 transition-colors"
                                title="Edit entitlement"
                                onClick={() => {
                                  setPlanDetailEditingEntitlement(entId);
                                  setPlanDetailEditForm({
                                    quantity: ent.quantityLimit ?? ent.quantity ?? ent.allowedQuantity ?? 1,
                                    unlimited: ent.isUnlimited ?? ent.unlimited ?? false,
                                    period: ent.periodType || ent.period || "per_month",
                                    overagePolicy: ent.overagePolicy || ent.overage_policy || "block",
                                  });
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                title="Remove entitlement"
                                onClick={() => handleDeletePlanEntitlement(plan.id, entId)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Section 3: Enrolled Members ──────────────────────────── */}
        {planDetailTab === "members" && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Enrolled Members</h3>
            {planDetailMembersLoading ? (
              <div className="py-8 text-center text-slate-400">Loading members...</div>
            ) : planDetailMembers.length === 0 ? (
              <div className="glass rounded-xl py-12 text-center">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-40" style={{ color: "#94a3b8" }} />
                <p className="text-sm text-slate-400">No members enrolled in this plan yet.</p>
              </div>
            ) : (
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc" }}>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Patient</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Member ID</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Enrolled</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Utilization</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {planDetailMembers.map((member: any) => {
                        const patientName = member.patient?.firstName && member.patient?.lastName
                          ? `${member.patient.firstName} ${member.patient.lastName}`
                          : member.patient?.name || member.patientName || member.patient_name || "Unknown";
                        const memberId = member.id || member.memberId || member.member_id || "—";
                        const status = member.status || "active";
                        const enrollDate = member.createdAt || member.created_at || member.enrolledAt || member.enrolled_at || null;
                        const utilPct = member.utilizationPercent ?? member.utilization_percent ?? null;
                        const statusColors: Record<string, { bg: string; text: string }> = {
                          active: { bg: "#dcfce7", text: "#15803d" },
                          paused: { bg: "#fffbeb", text: "#d97706" },
                          cancelled: { bg: "#fef2f2", text: "#dc2626" },
                          expired: { bg: "#f1f5f9", text: "#475569" },
                        };
                        const sc = statusColors[status] || statusColors.active;

                        return (
                          <tr
                            key={memberId}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => {
                              // Try to find matching patient and navigate
                              const patients = apiPatients || [];
                              const match = patients.find(
                                (p) => p.id === (member.patientId || member.patient_id || member.patient?.id)
                              );
                              if (match) {
                                setSelectedPlan(null);
                                setSelectedPatient(match);
                              }
                            }}
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                                  style={{ backgroundColor: gradient.accent }}
                                >
                                  {patientName.charAt(0)}
                                </div>
                                <span className="font-medium text-slate-700">{patientName}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-slate-500 font-mono text-xs">{String(memberId).slice(0, 8)}</td>
                            <td className="px-5 py-3">
                              <span
                                className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                                style={{ backgroundColor: sc.bg, color: sc.text }}
                              >
                                {status}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-slate-500 text-xs">
                              {enrollDate ? new Date(enrollDate).toLocaleDateString() : "—"}
                            </td>
                            <td className="px-5 py-3">
                              {utilPct !== null && utilPct !== undefined ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 rounded-full" style={{ backgroundColor: "#e2e8f0" }}>
                                    <div
                                      className="h-1.5 rounded-full"
                                      style={{
                                        width: `${Math.min(Number(utilPct), 100)}%`,
                                        backgroundColor: Number(utilPct) > 80 ? "#ef4444" : Number(utilPct) > 50 ? "#f59e0b" : "#27ab83",
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-slate-500">{Number(utilPct).toFixed(0)}%</span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Section 4: Utilization Summary ──────────────────────── */}
        {planDetailTab === "utilization" && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-800">Plan Utilization Summary</h3>
            {planDetailUsageLoading ? (
              <div className="py-8 text-center text-slate-400">Loading utilization data...</div>
            ) : planDetailUsage.length === 0 ? (
              <div className="glass rounded-xl py-12 text-center">
                <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" style={{ color: "#94a3b8" }} />
                <p className="text-sm text-slate-400">No utilization data available yet.</p>
                <p className="text-xs text-slate-300 mt-1">Usage data will appear as members use their entitlements.</p>
              </div>
            ) : (
              <div className="glass rounded-xl overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {planDetailUsage.map((usage: any, i: number) => {
                    const name = usage.entitlementType?.name || usage.entitlementName || usage.entitlement_name || usage.name || "Benefit";
                    const category = usage.entitlementType?.category || usage.category || "";
                    const catColor = getCategoryColor(category);
                    const totalAllowed = usage.totalAllowed ?? usage.total_allowed ?? 0;
                    const totalUsed = usage.totalUsed ?? usage.total_used ?? 0;
                    const isUnlimited = usage.unlimited || totalAllowed === null || totalAllowed === -1;
                    const pct = isUnlimited ? (totalUsed > 0 ? 50 : 0) : totalAllowed > 0 ? (totalUsed / totalAllowed) * 100 : 0;
                    const savings = usage.savingsGenerated ?? usage.savings_generated ?? null;
                    const barColor = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#27ab83";

                    return (
                      <div key={i} className="px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-slate-700">{name}</span>
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ backgroundColor: catColor.bg, color: catColor.text }}
                            >
                              {category}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            <span>
                              {totalUsed} / {isUnlimited ? "\u221E" : totalAllowed} used
                            </span>
                            <span className="font-semibold" style={{ color: barColor }}>
                              {isUnlimited ? "—" : `${(Number.isFinite(pct) ? pct : 0).toFixed(0)}%`}
                            </span>
                            {savings !== null && savings !== undefined && (
                              <span style={{ color: "#15803d" }}>
                                ${Number(savings).toLocaleString()} saved
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="w-full h-2 rounded-full" style={{ backgroundColor: "#e2e8f0" }}>
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              backgroundColor: barColor,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Section 5: Revenue ───────────────────────────────────── */}
        {planDetailTab === "revenue" && (
          <div className="space-y-6">
            <h3 className="text-base font-semibold text-slate-800">Revenue Breakdown</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="glass rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#dcfce7" }}>
                    <DollarSign className="w-5 h-5" style={{ color: "#15803d" }} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Monthly Recurring Revenue</p>
                    <p className="text-2xl font-bold text-slate-800">${mrr.toLocaleString()}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400">{memberCount} members x ${monthlyPrice}/mo</p>
              </div>
              <div className="glass rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#dbeafe" }}>
                    <TrendingUp className="w-5 h-5" style={{ color: "#1d4ed8" }} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Projected Annual Revenue</p>
                    <p className="text-2xl font-bold text-slate-800">${arr.toLocaleString()}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400">${mrr.toLocaleString()}/mo x 12 months</p>
              </div>
              <div className="glass rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#f3e8ff" }}>
                    <Receipt className="w-5 h-5" style={{ color: "#7c3aed" }} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Overage Fees</p>
                    <p className="text-2xl font-bold text-slate-800">
                      ${(() => {
                        const totalOverage = planDetailUsage.reduce((sum: number, u: Record<string, unknown>) => {
                          return sum + (Number(u.overageFees ?? u.overage_fees ?? 0));
                        }, 0);
                        return totalOverage.toLocaleString();
                      })()}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-400">From overage charges this period</p>
              </div>
            </div>

            {/* Revenue per member breakdown */}
            <div className="glass rounded-xl p-5">
              <h4 className="text-sm font-semibold text-slate-800 mb-3">Revenue per Member</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Avg Monthly/Member</p>
                  <p className="text-lg font-bold text-slate-800">${monthlyPrice}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Avg Annual/Member</p>
                  <p className="text-lg font-bold text-slate-800">${annualPrice > 0 ? annualPrice.toLocaleString() : (monthlyPrice * 12).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Annual Savings vs Monthly</p>
                  <p className="text-lg font-bold" style={{ color: "#15803d" }}>
                    {annualPrice > 0 && monthlyPrice > 0
                      ? `${Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100)}%`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total Active Members</p>
                  <p className="text-lg font-bold text-slate-800">{memberCount}</p>
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
    if (selectedPlan) return renderPlanDetail();

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

    const planList = (apiPlans || (isDemoMode ? MOCK_PLANS : []));
    const totalMembers = planList.reduce((sum: number, p) => sum + (p.membershipsCount ?? p.memberCount ?? p.member_count ?? 0), 0);
    const totalMrr = planList.reduce((sum: number, p) => {
      const count = p.membershipsCount ?? p.memberCount ?? p.member_count ?? 0;
      const price = p.monthlyPrice ?? p.monthly_price ?? 0;
      return sum + count * price;
    }, 0);

    return (
      <div className="space-y-5">
        {/* Stripe-grade page header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Membership plans</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {planList.length} {planList.length === 1 ? "plan" : "plans"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={loadPracticeData} title="Refresh plans" />
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
              style={{ backgroundColor: "#635bff" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
              onClick={() => setShowCreatePlan(true)}
            >
              <Plus className="w-4 h-4" />
              New plan
            </button>
          </div>
        </div>

        {/* KPI tiles — total plans, total members across plans, MRR rollup */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Plans", value: planList.length, mono: true },
            { label: "Members", value: totalMembers, mono: true },
            { label: "Monthly recurring", value: totalMrr, money: true },
          ].map((tile) => (
            <div key={tile.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{tile.label}</p>
              <p className="text-xl font-semibold tabular-nums mt-1 text-slate-900">
                {tile.money ? <MoneyAmount amount={tile.value} /> : tile.value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {planList.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400">
              <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No membership plans configured yet.</p>
            </div>
          )}
          {planList.map((plan) => {
            const Icon = planIcons[plan.name] || Heart;
            const gradient = planGradients[plan.name] || planGradients.Essential;
            const memberCount = plan.membershipsCount ?? plan.memberCount ?? plan.member_count ?? 0;
            const monthlyPrice = plan.monthlyPrice ?? plan.monthly_price ?? 0;
            const revenue = memberCount * monthlyPrice;
            // Operator template linkage (hybrid inheritance — see ADR-0005, plan-templates.md)
            const masterTemplateId = (plan as Record<string, unknown>).masterTemplateId
              ?? (plan as Record<string, unknown>).master_template_id;
            const isSynced = (plan as Record<string, unknown>).isSyncedWithTemplate
              ?? (plan as Record<string, unknown>).is_synced_with_template;
            const isFromTemplate = !!masterTemplateId;

            return (
              <div key={plan.id} className="glass rounded-2xl overflow-hidden hover-lift flex flex-col cursor-pointer" onClick={() => openPlanDetail(plan)}>
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
                    {isFromTemplate && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mb-2 mr-2"
                        style={{ backgroundColor: "rgba(255,255,255,0.18)", color: "#ffffff" }}
                        title={isSynced ? "Synced with operator template" : "Has tenant overrides"}
                      >
                        {isSynced ? "From template" : "Customized"}
                      </span>
                    )}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditPlanForm({
                          id: plan.id,
                          name: plan.name,
                          monthlyPrice: String(monthlyPrice),
                          annualPrice: String(plan.annualPrice ?? plan.annual_price ?? 0),
                          description: plan.description ?? "",
                        });
                        fetchEntitlementTypes();
                        fetchPlanEntitlements(plan.id);
                        setShowEditPlan(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleDeactivatePlan(plan.id, plan.name); }}
                    >
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
            onClick={() => setShowCreatePlan(true)}
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

        {/* Create Plan Modal */}
        {showCreatePlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
                <h3 className="text-base font-semibold text-slate-800">Create Membership Plan</h3>
                <button onClick={() => { setShowCreatePlan(false); setCreatePlanEntitlements([]); setShowCreatePlanEntPicker(false); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
              </div>
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Plan Name *</label>
                  <input type="text" value={createPlanForm.name} onChange={(e) => setCreatePlanForm({ ...createPlanForm, name: e.target.value })} placeholder="e.g. Essential" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Price *</label>
                    <input type="number" value={createPlanForm.monthlyPrice} onChange={(e) => setCreatePlanForm({ ...createPlanForm, monthlyPrice: e.target.value })} placeholder="99" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Annual Price</label>
                    <input type="number" value={createPlanForm.annualPrice} onChange={(e) => setCreatePlanForm({ ...createPlanForm, annualPrice: e.target.value })} placeholder="1069" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea value={createPlanForm.description} onChange={(e) => setCreatePlanForm({ ...createPlanForm, description: e.target.value })} placeholder="Plan description..." rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 resize-none" />
                </div>

                {/* ── Entitlements Section ──────────────────────────── */}
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-800">Entitlements</h4>
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-white"
                      style={{ backgroundColor: "#635bff" }}
                      onClick={() => {
                        const next = !showCreatePlanEntPicker;
                        setShowCreatePlanEntPicker(next);
                        if (next && entitlementTypes.length === 0) {
                          fetchEntitlementTypes();
                        }
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#544ee0"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#635bff"; }}
                    >
                      <Plus className="w-3.5 h-3.5" /> {showCreatePlanEntPicker ? "Close" : "Add Entitlement"}
                    </button>
                  </div>

                  {/* Entitlement type picker — shown only when user explicitly clicks the toggle */}
                  {showCreatePlanEntPicker && (
                    <div className="mb-3 p-3 rounded-md border border-slate-200" style={{ backgroundColor: "#f8fafc" }}>
                      {entitlementTypesLoading ? (
                        <p className="text-xs text-slate-400">Loading entitlement types…</p>
                      ) : entitlementTypes.length === 0 ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          <p className="mb-2">
                            No entitlement types are seeded for this practice yet.
                          </p>
                          <button
                            type="button"
                            onClick={async () => {
                              const r = await apiFetch("/practice/rebootstrap", { method: "POST" });
                              if (r.error) {
                                setToast({ message: r.error, type: "error" });
                                return;
                              }
                              setToast({ message: "Catalog rebuilt — reloading types…", type: "success" });
                              await fetchEntitlementTypes();
                            }}
                            className="px-3 py-1 rounded-md text-xs font-medium text-white"
                            style={{ backgroundColor: "#635bff" }}
                          >
                            Repair catalog now
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-slate-500 mb-2">Select entitlement type:</p>
                          <div className="flex flex-wrap gap-1">
                            {entitlementTypes.map((et: { id: string; name: string; code?: string }) => {
                              const alreadyAdded = createPlanEntitlements.some(e => e.entitlementTypeId === et.id);
                              return (
                                <button
                                  key={et.id}
                                  type="button"
                                  disabled={alreadyAdded}
                                  className="px-2 py-1 rounded text-xs font-medium border transition-colors disabled:opacity-40"
                                  style={{ borderColor: "#635bff", color: alreadyAdded ? "#94a3b8" : "#544ee0" }}
                                  onClick={() => {
                                    setCreatePlanEntitlements(prev => [...prev, {
                                      tempId: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                      entitlementTypeId: et.id,
                                      typeName: et.name,
                                      quantity: 1,
                                      unlimited: false,
                                      period: "monthly",
                                      overagePolicy: "block",
                                    }]);
                                  }}
                                >
                                  {et.name}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {createPlanEntitlements.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-3">No entitlements added yet. Click "Add Entitlement" to configure benefits.</p>
                  )}

                  {createPlanEntitlements.map((ent, idx) => (
                    <div key={ent.tempId} className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-slate-200 mb-2" style={{ backgroundColor: "#fafbfc" }}>
                      <span className="text-sm font-medium text-slate-700 min-w-20">{ent.typeName}</span>
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-slate-500">Qty:</label>
                        <input
                          type="number"
                          min={1}
                          value={ent.quantity}
                          disabled={ent.unlimited}
                          onChange={(e) => {
                            const updated = [...createPlanEntitlements];
                            updated[idx] = { ...ent, quantity: parseInt(e.target.value) || 1 };
                            setCreatePlanEntitlements(updated);
                          }}
                          className="w-16 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 disabled:opacity-40"
                        />
                      </div>
                      <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ent.unlimited}
                          onChange={(e) => {
                            const updated = [...createPlanEntitlements];
                            updated[idx] = { ...ent, unlimited: e.target.checked };
                            setCreatePlanEntitlements(updated);
                          }}
                          className="accent-teal-600"
                        />
                        Unlimited
                      </label>
                      <select
                        value={ent.period}
                        onChange={(e) => {
                          const updated = [...createPlanEntitlements];
                          updated[idx] = { ...ent, period: e.target.value as PlanEntitlementRow["period"] };
                          setCreatePlanEntitlements(updated);
                        }}
                        className="px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                      <select
                        value={ent.overagePolicy}
                        onChange={(e) => {
                          const updated = [...createPlanEntitlements];
                          updated[idx] = { ...ent, overagePolicy: e.target.value as PlanEntitlementRow["overagePolicy"] };
                          setCreatePlanEntitlements(updated);
                        }}
                        className="px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none"
                      >
                        <option value="block">Block</option>
                        <option value="charge">Charge</option>
                        <option value="notify">Notify</option>
                        <option value="allow">Allow</option>
                      </select>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors ml-auto"
                        onClick={() => setCreatePlanEntitlements(prev => prev.filter((_, i) => i !== idx))}
                        title="Remove entitlement"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
                <button onClick={() => { setShowCreatePlan(false); setCreatePlanEntitlements([]); }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                <button onClick={handleCreatePlan} disabled={createPlanLoading} className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: "#635bff" }}>
                  {createPlanLoading ? "Creating..." : "Create Plan"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Plan Modal */}
        {showEditPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
                <h3 className="text-base font-semibold text-slate-800">Edit Plan: {editPlanForm.name}</h3>
                <button onClick={() => { setShowEditPlan(false); setEditPlanEntitlements([]); setEditPlanExistingEntitlementIds([]); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
              </div>
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Plan Name *</label>
                  <input type="text" value={editPlanForm.name} onChange={(e) => setEditPlanForm({ ...editPlanForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Price</label>
                    <input type="number" value={editPlanForm.monthlyPrice} onChange={(e) => setEditPlanForm({ ...editPlanForm, monthlyPrice: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Annual Price</label>
                    <input type="number" value={editPlanForm.annualPrice} onChange={(e) => setEditPlanForm({ ...editPlanForm, annualPrice: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea value={editPlanForm.description} onChange={(e) => setEditPlanForm({ ...editPlanForm, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 resize-none" />
                </div>

                {/* ── Entitlements Section ──────────────────────────── */}
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-800">Entitlements</h4>
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ backgroundColor: "#e6f7f2", color: "#147d64" }}
                      onClick={() => { fetchEntitlementTypes(); }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#d1f0e5"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#e6f7f2"; }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Entitlement
                    </button>
                  </div>

                  {entitlementTypes.length > 0 && (
                    <div className="mb-3 p-2 rounded-lg border border-slate-200" style={{ backgroundColor: "#f8fafc" }}>
                      <p className="text-xs text-slate-500 mb-1">Select entitlement type:</p>
                      <div className="flex flex-wrap gap-1">
                        {entitlementTypesLoading && <span className="text-xs text-slate-400">Loading...</span>}
                        {entitlementTypes.map((et: { id: string; name: string; code?: string }) => {
                          const alreadyAdded = editPlanEntitlements.some(e => e.entitlementTypeId === et.id);
                          return (
                            <button
                              key={et.id}
                              type="button"
                              disabled={alreadyAdded}
                              className="px-2 py-1 rounded text-xs font-medium border transition-colors disabled:opacity-40"
                              style={{ borderColor: "#27ab83", color: alreadyAdded ? "#94a3b8" : "#147d64" }}
                              onClick={() => {
                                setEditPlanEntitlements(prev => [...prev, {
                                  tempId: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                  entitlementTypeId: et.id,
                                  typeName: et.name,
                                  quantity: 1,
                                  unlimited: false,
                                  period: "monthly",
                                  overagePolicy: "block",
                                }]);
                              }}
                            >
                              {et.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {editPlanEntitlements.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-3">No entitlements configured. Click "Add Entitlement" to configure benefits.</p>
                  )}

                  {editPlanEntitlements.map((ent, idx) => (
                    <div key={ent.tempId} className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-slate-200 mb-2" style={{ backgroundColor: "#fafbfc" }}>
                      <span className="text-sm font-medium text-slate-700 min-w-20">{ent.typeName}</span>
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-slate-500">Qty:</label>
                        <input
                          type="number"
                          min={1}
                          value={ent.quantity}
                          disabled={ent.unlimited}
                          onChange={(e) => {
                            const updated = [...editPlanEntitlements];
                            updated[idx] = { ...ent, quantity: parseInt(e.target.value) || 1 };
                            setEditPlanEntitlements(updated);
                          }}
                          className="w-16 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 disabled:opacity-40"
                        />
                      </div>
                      <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ent.unlimited}
                          onChange={(e) => {
                            const updated = [...editPlanEntitlements];
                            updated[idx] = { ...ent, unlimited: e.target.checked };
                            setEditPlanEntitlements(updated);
                          }}
                          className="accent-teal-600"
                        />
                        Unlimited
                      </label>
                      <select
                        value={ent.period}
                        onChange={(e) => {
                          const updated = [...editPlanEntitlements];
                          updated[idx] = { ...ent, period: e.target.value as PlanEntitlementRow["period"] };
                          setEditPlanEntitlements(updated);
                        }}
                        className="px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                      <select
                        value={ent.overagePolicy}
                        onChange={(e) => {
                          const updated = [...editPlanEntitlements];
                          updated[idx] = { ...ent, overagePolicy: e.target.value as PlanEntitlementRow["overagePolicy"] };
                          setEditPlanEntitlements(updated);
                        }}
                        className="px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none"
                      >
                        <option value="block">Block</option>
                        <option value="charge">Charge</option>
                        <option value="notify">Notify</option>
                        <option value="allow">Allow</option>
                      </select>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors ml-auto"
                        onClick={() => setEditPlanEntitlements(prev => prev.filter((_, i) => i !== idx))}
                        title="Remove entitlement"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
                <button onClick={() => { setShowEditPlan(false); setEditPlanEntitlements([]); setEditPlanExistingEntitlementIds([]); }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                <button onClick={handleEditPlan} disabled={editPlanLoading} className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: "#635bff" }}>
                  {editPlanLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}
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

    const handleQuickLaunch = async () => {
      if (telehealthMode === "builtin") {
        // Create a real telehealth session via API, then navigate
        try {
          const res = await telehealthService.createSession({
            isExternal: false,
            recordingEnabled: false,
          });
          if (res.data && res.data.id) {
            navigate(`/telehealth/${res.data.id}`);
          } else {
            setToast({ message: res.error || "Failed to create telehealth session. Select an appointment first.", type: "error" });
          }
        } catch {
          setToast({ message: "Failed to create telehealth session.", type: "error" });
        }
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
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Telehealth</h2>
            <p className="text-sm text-slate-500 mt-0.5">Configure your video platform and launch ad-hoc visits</p>
          </div>
          <button
            onClick={handleQuickLaunch}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
            style={{ backgroundColor: "#635bff" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
          >
            <Video className="w-4 h-4" />
            Start ad-hoc visit
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
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Today&apos;s telehealth sessions</h3>
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
    const threads = apiThreads || (isDemoMode ? MOCK_THREADS : []);
    const activeThread = threads.find((t: typeof MOCK_THREADS[0]) => t.id === selectedThread) || threads[0];
    const displayMessages = apiMessages || activeThread?.messages || [];

    if (threads.length === 0) {
      return (
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Messages</h2>
              <p className="text-sm text-slate-500 mt-0.5">No conversations yet</p>
            </div>
            <RefreshButton onRefresh={loadPracticeData} title="Refresh messages" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No messages yet. Conversations with patients will appear here.</p>
          </div>
        </div>
      );
    }

    const totalUnread = threads.reduce((sum: number, t: typeof MOCK_THREADS[0]) => sum + (t.unread ?? 0), 0);

    return (
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Messages</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {threads.length} {threads.length === 1 ? "thread" : "threads"}
              {totalUnread > 0 ? ` · ${totalUnread} unread` : ""}
            </p>
          </div>
          <RefreshButton onRefresh={loadPracticeData} title="Refresh messages" />
        </div>
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
                            style={{ backgroundColor: "#635bff" }}
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
                <button
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                  onClick={() => setToast({ message: "Voice call coming soon.", type: "success" })}
                >
                  <Phone className="w-4 h-4" />
                </button>
                <button
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                  onClick={() => { setActiveTab("telehealth"); }}
                >
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
                  style={{ backgroundColor: "#635bff" }}
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
    // Filter facets — populated from the current invoice set so we
    // never show a facet that has no rows. Status enum from the
    // Invoice model + Plan from membership.plan.name.
    const statusOpts = Array.from(new Set(invoices.map((i) => i.status))).map((s) => ({
      value: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
    }));
    const planOpts = Array.from(new Set(invoices.map((i) => i.plan).filter(Boolean))).map((p) => ({
      value: p,
      label: p,
    }));
    const dateOpts = [
      { value: "7d", label: "Last 7 days" },
      { value: "30d", label: "Last 30 days" },
      { value: "90d", label: "Last 90 days" },
      { value: "ytd", label: "Year to date" },
    ];

    // Apply active filters + search
    const filtered = invoices.filter((inv) => {
      // Search across invoice id, patient name, plan
      if (invoiceSearch.trim()) {
        const q = invoiceSearch.toLowerCase();
        const hay = [inv.id, inv.patient, inv.plan, inv.status].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of invoiceFilters) {
        if (f.key === "status" && inv.status !== f.value) return false;
        if (f.key === "plan" && inv.plan !== f.value) return false;
        if (f.key === "date" && inv.date) {
          const days = f.value === "7d" ? 7 : f.value === "30d" ? 30 : f.value === "90d" ? 90 : 365;
          const cutoff = Date.now() - days * 86400000;
          const d = new Date(inv.date).getTime();
          if (Number.isFinite(d) && d < cutoff) return false;
        }
      }
      return true;
    });

    const facets: import("../shared/stripe-ui").FilterFacet[] = [
      { key: "status", label: "Status", options: statusOpts },
      { key: "plan", label: "Plan", options: planOpts },
      { key: "date", label: "Created", options: dateOpts },
    ];

    const cols: import("../shared/stripe-ui").DataTableColumn<typeof invoices[number]>[] = [
      {
        key: "amount",
        header: "Amount",
        align: "left",
        cell: (inv) => <MoneyAmount amount={inv.amount} />,
      },
      {
        key: "status",
        header: "Status",
        cell: (inv) => <StatusPill label={inv.status} />,
      },
      {
        key: "patient",
        header: "Customer",
        cell: (inv) => (
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
            >
              {(inv.patient || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </div>
            <span className="truncate text-slate-800">{inv.patient}</span>
          </div>
        ),
      },
      {
        key: "plan",
        header: "Plan",
        hideBelow: "sm",
        cell: (inv) => (inv.plan ? <PlanBadge plan={inv.plan} /> : <span className="text-slate-300">—</span>),
      },
      {
        key: "date",
        header: "Created",
        hideBelow: "md",
        cell: (inv) => <span className="text-slate-500">{inv.date}</span>,
      },
      {
        key: "id",
        header: "Invoice",
        hideBelow: "lg",
        cell: (inv) => <EntityId prefix="inv" id={inv.id} />,
      },
    ];

    const rowActions = (inv: typeof invoices[number]): import("../shared/stripe-ui").KebabAction[] => [
      { label: "View details", onClick: () => setSelectedInvoiceId(inv.id) },
      { label: "Download PDF", onClick: () => { const url = billingEnhancedService.getInvoicePdfUrl(inv.id, true); window.open(url, "_blank"); } },
      ...(inv.status === "open" || inv.status === "overdue" ? [
        { label: "Send invoice", onClick: () => handleSendInvoice(inv.id) },
        { label: "Mark as paid", onClick: () => handleMarkInvoicePaid(inv.id) },
      ] : []),
      ...(inv.status !== "paid" ? [
        { label: "Void invoice", danger: true, onClick: () => setConfirmDialog({ title: "Void Invoice", message: `Void invoice ${inv.id}?`, confirmLabel: "Void", danger: true, onConfirm: async () => { try { await invoiceService.void(inv.id); setToast({ message: "Invoice voided.", type: "success" }); loadPracticeData(); } catch { setToast({ message: "Failed.", type: "error" }); } setConfirmDialog(null); } }) },
      ] : []),
    ];

    const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId) ?? null;

    return (
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Invoices</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {filtered.length === invoices.length
                ? `${invoices.length} total`
                : `${filtered.length} of ${invoices.length}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={loadPracticeData} title="Refresh invoices" />
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
              style={{ backgroundColor: "#635bff" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
              onClick={() => setToast({ message: "Invoice creation coming soon. Use Stripe for now.", type: "success" })}
            >
              <Plus className="w-4 h-4" />
              New invoice
            </button>
          </div>
        </div>

        {/* Summary KPI tiles — Stripe-style: thin border, mono nums, subtle eyebrow */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total invoiced", value: invoiceSummary.total, color: "#0f172a" },
            { label: "Paid", value: invoiceSummary.paid, color: "#066e54" },
            { label: "Open", value: invoiceSummary.open, color: "#334e68" },
            { label: "Overdue", value: invoiceSummary.overdue, color: "#b91c1c" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {tile.label}
              </p>
              <p className="text-xl font-semibold tabular-nums mt-1" style={{ color: tile.color }}>
                <MoneyAmount amount={tile.value} />
              </p>
            </div>
          ))}
        </div>

        {/* Search + filter chips bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search invoices..."
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400"
            />
          </div>
          <FilterChips facets={facets} active={invoiceFilters} onChange={setInvoiceFilters} />
        </div>

        {/* Stripe-grade data table */}
        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(inv) => inv.id}
          actions={rowActions}
          onRowClick={(inv) => setSelectedInvoiceId(inv.id)}
          highlightRowId={selectedInvoiceId}
          empty={
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-1">No invoices match your filters</p>
              <button
                onClick={() => { setInvoiceFilters([]); setInvoiceSearch(""); }}
                className="text-xs text-blue-600 hover:underline"
              >
                Clear filters
              </button>
            </div>
          }
          footer={
            filtered.length > 0
              ? `Showing ${filtered.length} ${filtered.length === 1 ? "invoice" : "invoices"}`
              : null
          }
        />

        {/* Slide-over invoice detail */}
        <DetailDrawer
          open={!!selectedInvoice}
          onClose={() => setSelectedInvoiceId(null)}
          eyebrow="Invoice"
          title={
            selectedInvoice ? (
              <div className="flex items-center gap-2 min-w-0">
                <MoneyAmount amount={selectedInvoice.amount} />
                <StatusPill label={selectedInvoice.status} />
              </div>
            ) : ""
          }
          width="md"
          footer={
            selectedInvoice ? (
              <>
                <button
                  onClick={() => setSelectedInvoiceId(null)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  onClick={() => { const url = billingEnhancedService.getInvoicePdfUrl(selectedInvoice.id, true); window.open(url, "_blank"); }}
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm"
                  style={{ backgroundColor: "#635bff" }}
                >
                  Download PDF
                </button>
              </>
            ) : null
          }
        >
          {selectedInvoice && (
            <div className="space-y-5">
              {/* Identity */}
              <div className="space-y-3">
                <Field label="Invoice ID">
                  <EntityId prefix="inv" id={selectedInvoice.id} full />
                </Field>
                <Field label="Customer">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
                    >
                      {(selectedInvoice.patient || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                    </div>
                    <span className="text-sm text-slate-800">{selectedInvoice.patient}</span>
                  </div>
                </Field>
                <Field label="Plan">
                  {selectedInvoice.plan ? <PlanBadge plan={selectedInvoice.plan} /> : <span className="text-sm text-slate-400">—</span>}
                </Field>
                <Field label="Created">
                  <span className="text-sm text-slate-700">{selectedInvoice.date || "—"}</span>
                </Field>
                <Field label="Status">
                  <StatusPill label={selectedInvoice.status} />
                </Field>
              </div>

              {/* Amount breakdown */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-3">
                  Amount
                </p>
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{selectedInvoice.plan ? `${selectedInvoice.plan} membership` : "Subtotal"}</span>
                    <MoneyAmount amount={selectedInvoice.amount} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Tax</span>
                    <span className="text-slate-400 tabular-nums">$0.00</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-sm">
                    <span className="font-semibold text-slate-900">Total</span>
                    <MoneyAmount amount={selectedInvoice.amount} className="font-semibold text-base" />
                  </div>
                </div>
              </div>

              {/* Quick actions */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-3">
                  Actions
                </p>
                <div className="flex flex-wrap gap-2">
                  {(selectedInvoice.status === "open" || selectedInvoice.status === "overdue") && (
                    <>
                      <button
                        onClick={() => handleSendInvoice(selectedInvoice.id)}
                        className="px-3 py-1.5 rounded-md text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        Send invoice
                      </button>
                      <button
                        onClick={() => handleMarkInvoicePaid(selectedInvoice.id)}
                        className="px-3 py-1.5 rounded-md text-sm font-medium border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                      >
                        Mark as paid
                      </button>
                    </>
                  )}
                  {selectedInvoice.status !== "paid" && (
                    <button
                      onClick={() => setConfirmDialog({ title: "Void Invoice", message: `Void invoice ${selectedInvoice.id}?`, confirmLabel: "Void", danger: true, onConfirm: async () => { try { await invoiceService.void(selectedInvoice.id); setToast({ message: "Invoice voided.", type: "success" }); loadPracticeData(); setSelectedInvoiceId(null); } catch { setToast({ message: "Failed.", type: "error" }); } setConfirmDialog(null); } })}
                      className="px-3 py-1.5 rounded-md text-sm font-medium border border-red-200 text-red-700 hover:bg-red-50"
                    >
                      Void invoice
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DetailDrawer>
      </div>
    );
  }

  // ─── Intakes Tab ────────────────────────────────────────────────────────

  function renderIntakes() {
    const mockIntakesDemo = [
      { id: "INT-001", code: "INT-2026-001", name: "Robert Davis", dateSubmitted: "Mar 18, 2026", status: "pending" as const },
      { id: "INT-002", code: "INT-2026-002", name: "Amanda Brooks", dateSubmitted: "Mar 17, 2026", status: "under_review" as const },
      { id: "INT-003", code: "INT-2026-003", name: "Marcus Williams", dateSubmitted: "Mar 16, 2026", status: "approved" as const },
      { id: "INT-004", code: "INT-2026-004", name: "Patricia Nguyen", dateSubmitted: "Mar 15, 2026", status: "converted" as const },
      { id: "INT-005", code: "INT-2026-005", name: "Daniel Foster", dateSubmitted: "Mar 14, 2026", status: "approved" as const },
      { id: "INT-006", code: "INT-2026-006", name: "Karen Mitchell", dateSubmitted: "Mar 13, 2026", status: "rejected" as const },
    ];
    const mockIntakes = apiIntakes.length > 0 ? apiIntakes : (isDemoMode ? mockIntakesDemo : []);

    type Itk = typeof mockIntakes[number];

    const statusOpts = Array.from(new Set(mockIntakes.map((i) => i.status))).map((s) => ({
      value: s, label: s.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    }));
    const facets: import("../shared/stripe-ui").FilterFacet[] = [
      { key: "status", label: "Status", options: statusOpts },
    ];

    const filtered = mockIntakes.filter((i) => {
      if (intakeSearch.trim()) {
        const q = intakeSearch.toLowerCase();
        const hay = [i.code, i.name].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of intakeFilters) {
        if (f.key === "status" && i.status !== f.value) return false;
      }
      return true;
    });

    const cols: import("../shared/stripe-ui").DataTableColumn<Itk>[] = [
      {
        key: "name",
        header: "Submitted by",
        cell: (i) => (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}>
              {(i.name || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{i.name}</p>
              <p className="text-[11px] text-slate-400 font-mono">{i.code}</p>
            </div>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        cell: (i) => <StatusPill label={i.status} />,
      },
      {
        key: "date",
        header: "Submitted",
        hideBelow: "md",
        cell: (i) => <span className="text-slate-500">{i.dateSubmitted}</span>,
      },
    ];

    const rowActions = (intake: Itk): import("../shared/stripe-ui").KebabAction[] => [
      { label: "View details", onClick: () => setToast({ message: "Intake detail view coming soon.", type: "success" }) },
      ...((intake.status === "pending" || intake.status === "under_review") ? [{
        label: "Approve",
        onClick: async () => {
          try {
            await apiFetch(`/intakes/${intake.id}`, { method: "PUT", body: JSON.stringify({ status: "approved" }) });
            setToast({ message: "Intake approved.", type: "success" });
            loadPracticeData();
          } catch { setToast({ message: "Failed to approve intake.", type: "error" }); }
        },
      }] : []),
      ...(intake.status === "approved" ? [{
        label: "Convert to patient",
        onClick: async () => {
          try {
            await apiFetch(`/intakes/${intake.id}/convert`, { method: "POST" });
            setToast({ message: "Intake converted to patient.", type: "success" });
            loadPracticeData();
          } catch { setToast({ message: "Failed to convert intake.", type: "error" }); }
        },
      }] : []),
      ...(intake.status === "pending" ? [{
        label: "Reject",
        danger: true,
        onClick: async () => {
          try {
            await apiFetch(`/intakes/${intake.id}`, { method: "PUT", body: JSON.stringify({ status: "rejected" }) });
            setToast({ message: "Intake rejected.", type: "success" });
            loadPracticeData();
          } catch { setToast({ message: "Failed.", type: "error" }); }
        },
      }] : []),
    ];

    return (
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Intake submissions</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {filtered.length === mockIntakes.length
                ? `${mockIntakes.length} ${mockIntakes.length === 1 ? "submission" : "submissions"}`
                : `${filtered.length} of ${mockIntakes.length}`}
            </p>
          </div>
          <RefreshButton onRefresh={loadPracticeData} title="Refresh intakes" />
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: mockIntakes.length, color: "#0f172a" },
            { label: "Pending", value: mockIntakes.filter((i) => i.status === "pending").length, color: "#92400e" },
            { label: "Approved", value: mockIntakes.filter((i) => i.status === "approved").length, color: "#066e54" },
            { label: "Converted", value: mockIntakes.filter((i) => i.status === "converted").length, color: "#147d64" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{tile.label}</p>
              <p className="text-xl font-semibold tabular-nums mt-1" style={{ color: tile.color }}>{tile.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or code..."
              value={intakeSearch}
              onChange={(e) => setIntakeSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400"
            />
          </div>
          <FilterChips facets={facets} active={intakeFilters} onChange={setIntakeFilters} />
        </div>

        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(i) => i.id}
          actions={rowActions}
          empty={
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-1">
                {mockIntakes.length === 0 ? "No intake submissions yet." : "No intakes match your filters"}
              </p>
              {mockIntakes.length > 0 && (
                <button onClick={() => { setIntakeFilters([]); setIntakeSearch(""); }} className="text-xs text-blue-600 hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  // ─── Waitlist Tab ─────────────────────────────────────────────────────────

  function renderWaitlist() {
    const mockWaitlistDemo = [
      { id: "w1", name: "Steven Park", email: "steven.p@email.com", phone: "(555) 111-2233", desiredPlan: "Complete", requestedDate: "Mar 10, 2026", priority: "high" as const, status: "waiting" as const },
      { id: "w2", name: "Monica Reyes", email: "monica.r@email.com", phone: "(555) 222-3344", desiredPlan: "Premium", requestedDate: "Mar 12, 2026", priority: "medium" as const, status: "contacted" as const },
      { id: "w3", name: "Alan Cooper", email: "alan.c@email.com", phone: "(555) 333-4455", desiredPlan: "Essential", requestedDate: "Mar 14, 2026", priority: "low" as const, status: "waiting" as const },
      { id: "w4", name: "Diane Tran", email: "diane.t@email.com", phone: "(555) 444-5566", desiredPlan: "Complete", requestedDate: "Mar 16, 2026", priority: "high" as const, status: "enrolled" as const },
    ];
    const mockWaitlist = apiWaitlist.length > 0 ? apiWaitlist : (isDemoMode ? mockWaitlistDemo : []);

    const priorityConfig: Record<string, { bg: string; text: string }> = {
      high: { bg: "#fef2f2", text: "#dc2626" },
      medium: { bg: "#fffbeb", text: "#d97706" },
      low: { bg: "#e0e8f0", text: "#334e68" },
    };

    const panelUsed = 85;
    const panelMax = 400;
    const panelPct = Math.round((panelUsed / panelMax) * 100);

    type Wl = typeof mockWaitlist[number];

    const statusOpts = Array.from(new Set(mockWaitlist.map((w) => w.status))).map((s) => ({
      value: s, label: s.charAt(0).toUpperCase() + s.slice(1),
    }));
    const priorityOpts = Array.from(new Set(mockWaitlist.map((w) => w.priority))).map((p) => ({
      value: p, label: p.charAt(0).toUpperCase() + p.slice(1),
    }));
    const planOpts = Array.from(new Set(mockWaitlist.map((w) => w.desiredPlan).filter(Boolean))).map((p) => ({ value: p, label: p }));
    const facets: import("../shared/stripe-ui").FilterFacet[] = [
      { key: "status", label: "Status", options: statusOpts },
      { key: "priority", label: "Priority", options: priorityOpts },
      { key: "plan", label: "Desired plan", options: planOpts },
    ];

    const filtered = mockWaitlist.filter((w) => {
      if (waitlistSearch.trim()) {
        const q = waitlistSearch.toLowerCase();
        const hay = [w.name, w.email, w.phone, w.desiredPlan].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of waitlistFilters) {
        if (f.key === "status" && w.status !== f.value) return false;
        if (f.key === "priority" && w.priority !== f.value) return false;
        if (f.key === "plan" && w.desiredPlan !== f.value) return false;
      }
      return true;
    });

    const cols: import("../shared/stripe-ui").DataTableColumn<Wl>[] = [
      {
        key: "name",
        header: "Name",
        cell: (entry) => (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}>
              {(entry.name || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{entry.name}</p>
              <p className="text-xs text-slate-400 truncate">{entry.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: "desiredPlan",
        header: "Desired plan",
        cell: (entry) => <PlanBadge plan={entry.desiredPlan} />,
      },
      {
        key: "phone",
        header: "Phone",
        hideBelow: "lg",
        cell: (entry) => <span className="text-slate-500">{entry.phone || "—"}</span>,
      },
      {
        key: "priority",
        header: "Priority",
        cell: (entry) => {
          const pc = priorityConfig[entry.priority];
          return (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize" style={{ backgroundColor: pc.bg, color: pc.text }}>
              {entry.priority}
            </span>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        cell: (entry) => <StatusPill label={entry.status} />,
      },
      {
        key: "requested",
        header: "Requested",
        hideBelow: "md",
        cell: (entry) => <span className="text-slate-500">{entry.requestedDate}</span>,
      },
    ];

    const rowActions = (entry: Wl): import("../shared/stripe-ui").KebabAction[] => [
      { label: "View details", onClick: () => setToast({ message: "Waitlist detail view coming soon.", type: "success" }) },
      ...(entry.status !== "enrolled" ? [{
        label: "Invite to enroll",
        onClick: async () => {
          try {
            await apiFetch(`/appointments/waitlist/${entry.id}/invite`, { method: "POST" });
            setToast({ message: `Enrollment invite sent to ${entry.name}.`, type: "success" });
            loadPracticeData();
          } catch { setToast({ message: "Invite sent (or endpoint not configured).", type: "success" }); }
        },
      }] : []),
      ...(entry.status !== "enrolled" ? [{
        label: "Remove from waitlist",
        danger: true,
        onClick: async () => {
          try {
            await apiFetch(`/appointments/waitlist/${entry.id}`, { method: "DELETE" });
            setToast({ message: "Removed from waitlist.", type: "success" });
            loadPracticeData();
          } catch { setToast({ message: "Failed.", type: "error" }); }
        },
      }] : []),
    ];

    return (
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Waitlist</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {filtered.length === mockWaitlist.length
                ? `${mockWaitlist.length} on waitlist`
                : `${filtered.length} of ${mockWaitlist.length}`}
            </p>
          </div>
          <RefreshButton onRefresh={loadPracticeData} title="Refresh waitlist" />
        </div>

        {/* Panel capacity */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Current panel capacity</p>
            <span className="text-sm font-medium tabular-nums" style={{ color: "#066e54" }}>
              {panelUsed} / {panelMax} ({panelPct}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${panelPct}%`, backgroundColor: "#10b981" }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">{panelMax - panelUsed} spots available</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={waitlistSearch}
              onChange={(e) => setWaitlistSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400"
            />
          </div>
          <FilterChips facets={facets} active={waitlistFilters} onChange={setWaitlistFilters} />
        </div>

        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(w) => w.id}
          actions={rowActions}
          empty={
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-1">
                {mockWaitlist.length === 0 ? "No one on the waitlist." : "No entries match your filters"}
              </p>
              {mockWaitlist.length > 0 && (
                <button onClick={() => { setWaitlistFilters([]); setWaitlistSearch(""); }} className="text-xs text-blue-600 hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  // ─── Encounters Tab ───────────────────────────────────────────────────────

  function renderEncounters() {
    const mockPracticeEncounters = isDemoMode ? [
      { id: "e1", date: "Mar 18, 2026", patient: "James Wilson", provider: "Dr. Michel", type: "Follow-Up", program: "DPC Membership", noteTemplate: "SOAP", duration: "30 min", status: "signed" as const },
      { id: "e2", date: "Mar 18, 2026", patient: "Sarah Mitchell", provider: "Dr. Michel", type: "Med Mgmt", program: "DPC Membership", noteTemplate: "SOAP", duration: "20 min", status: "draft" as const },
      { id: "e3", date: "Mar 17, 2026", patient: "Maria Garcia", provider: "Dr. Michel", type: "Care Coord", program: "CCM", noteTemplate: "CCM", duration: "20 min", status: "signed" as const },
      { id: "e4", date: "Mar 17, 2026", patient: "Emily Chen", provider: "NP Johnson", type: "Follow-Up", program: "CCM", noteTemplate: "CCM", duration: "30 min", status: "signed" as const },
      { id: "e5", date: "Mar 16, 2026", patient: "Robert Chen", provider: "Dr. Michel", type: "Device Review", program: "RPM", noteTemplate: "RPM", duration: "15 min", status: "amended" as const },
      { id: "e6", date: "Mar 15, 2026", patient: "Lisa Patel", provider: "NP Johnson", type: "Med Mgmt", program: "DPC Membership", noteTemplate: "SOAP", duration: "20 min", status: "signed" as const },
      { id: "e7", date: "Mar 14, 2026", patient: "Rachel Adams", provider: "Dr. Michel", type: "Wellness Check", program: "Employer Wellness", noteTemplate: "SOAP", duration: "30 min", status: "signed" as const },
      { id: "e8", date: "Mar 13, 2026", patient: "Thomas Lee", provider: "Dr. Michel", type: "Initial", program: "DPC Membership", noteTemplate: "SOAP", duration: "60 min", status: "draft" as const },
    ] : [];

    const encounterTypeConfig: Record<string, { bg: string; text: string }> = {
      // Backend enum values (StoreEncounterRequest):
      office_visit: { bg: "#e0e8f0", text: "#334e68" },
      follow_up: { bg: "#e6f7f2", text: "#147d64" },
      telehealth: { bg: "#f3e8ff", text: "#7c3aed" },
      phone: { bg: "#fef3c7", text: "#92400e" },
      urgent: { bg: "#fee2e2", text: "#b91c1c" },
      annual_wellness: { bg: "#fffbeb", text: "#d97706" },
      procedure: { bg: "#dbeafe", text: "#1e40af" },
      // Legacy / display-side aliases kept so older data still gets a chip:
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

    // Status pill is now rendered by StatusPill which infers variant from
    // the status string (signed -> success, draft -> warning, amended ->
    // neutral). The legacy encounterStatusConfig was dropped — kept here
    // as a comment for future readers wondering where the colors went.

    const allEnc = (apiEncounters || mockPracticeEncounters);
    type Enc = typeof allEnc[number];

    const typeOpts = Array.from(new Set(allEnc.map((e) => e.type).filter(Boolean))).map((t) => ({ value: t, label: t.replace(/_/g, " ") }));
    const programOpts = Array.from(new Set(allEnc.map((e) => e.program).filter(Boolean))).map((p) => ({ value: p, label: p }));
    const statusOpts = Array.from(new Set(allEnc.map((e) => e.status))).map((s) => ({
      value: s, label: s.charAt(0).toUpperCase() + s.slice(1),
    }));
    const facets: import("../shared/stripe-ui").FilterFacet[] = [
      { key: "status", label: "Status", options: statusOpts },
      { key: "type", label: "Type", options: typeOpts },
      { key: "program", label: "Program", options: programOpts },
    ];

    const filtered = allEnc.filter((e) => {
      if (encounterSearch.trim()) {
        const q = encounterSearch.toLowerCase();
        const hay = [e.patient, e.provider, e.type, e.program].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of encounterFilters) {
        if (f.key === "status" && e.status !== f.value) return false;
        if (f.key === "type" && e.type !== f.value) return false;
        if (f.key === "program" && e.program !== f.value) return false;
      }
      return true;
    });

    const cols: import("../shared/stripe-ui").DataTableColumn<Enc>[] = [
      {
        key: "date",
        header: "Date",
        cell: (enc) => <span className="text-slate-700 font-medium tabular-nums">{enc.date}</span>,
      },
      {
        key: "patient",
        header: "Patient",
        cell: (enc) => (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}>
              {(enc.patient || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </div>
            <span className="truncate text-slate-800">{enc.patient}</span>
          </div>
        ),
      },
      {
        key: "type",
        header: "Type",
        cell: (enc) => {
          const tc = encounterTypeConfig[enc.type] || encounterTypeConfig["Follow-Up"];
          return (
            <span className="px-2 py-0.5 rounded text-xs font-medium capitalize" style={{ backgroundColor: tc.bg, color: tc.text }}>
              {String(enc.type).replace(/_/g, " ")}
            </span>
          );
        },
      },
      {
        key: "program",
        header: "Program",
        hideBelow: "lg",
        cell: (enc) => {
          const pbc = programBadgeConfig[enc.program] || { bg: "#e0e8f0", text: "#334e68" };
          return (
            <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: pbc.bg, color: pbc.text }}>
              {enc.program}
            </span>
          );
        },
      },
      {
        key: "provider",
        header: "Provider",
        hideBelow: "md",
        cell: (enc) => <span className="text-slate-600">{enc.provider}</span>,
      },
      {
        key: "duration",
        header: "Duration",
        align: "right",
        hideBelow: "md",
        cell: (enc) => <span className="tabular-nums text-slate-500">{enc.duration}</span>,
      },
      {
        key: "noteTemplate",
        header: "Template",
        hideBelow: "lg",
        cell: (enc) => <span className="text-xs text-slate-500">{noteTemplateLabels[enc.noteTemplate] || enc.noteTemplate}</span>,
      },
      {
        key: "status",
        header: "Status",
        cell: (enc) => <StatusPill label={enc.status} />,
      },
      {
        key: "id",
        header: "ID",
        hideBelow: "xl",
        cell: (enc) => <EntityId prefix="enc" id={enc.id} />,
      },
    ];

    const rowActions = (enc: Enc): import("../shared/stripe-ui").KebabAction[] => [
      { label: "View encounter", onClick: () => { setExpandedEncounters((prev) => prev.includes(enc.id) ? prev : [...prev, enc.id]); } },
      { label: "Edit", onClick: () => { setEditingEncounterId(enc.id); setSoapForm({ subjective: "", objective: "", assessment: "", plan: "", chiefComplaint: "" }); setActiveTab("encounters"); } },
      ...(enc.status === "draft" ? [{ label: "Sign", onClick: () => handleSignEncounter(enc.id) }] : []),
      ...(enc.status === "signed" ? [{ label: "Amend", onClick: () => { setEditingEncounterId(enc.id); setSoapForm({ subjective: "", objective: "", assessment: "", plan: "", chiefComplaint: "" }); } }] : []),
      ...(enc.status === "draft" ? [{ label: "Delete", danger: true, onClick: () => setConfirmDialog({ title: "Delete Encounter", message: "Delete this draft encounter?", confirmLabel: "Delete", danger: true, onConfirm: async () => { try { await encounterService.update(enc.id, { status: "in_progress" }); setToast({ message: "Encounter deleted.", type: "success" }); loadPracticeData(); } catch { setToast({ message: "Failed.", type: "error" }); } setConfirmDialog(null); } }) }] : []),
    ];

    return (
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Encounters</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {filtered.length === allEnc.length
                ? `${allEnc.length} ${allEnc.length === 1 ? "encounter" : "encounters"}`
                : `${filtered.length} of ${allEnc.length}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={loadPracticeData} title="Refresh encounters" />
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
              style={{ backgroundColor: "#635bff" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
              onClick={() => setShowNewEncounter(true)}
            >
              <Plus className="w-4 h-4" />
              New encounter
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by patient, provider, type..."
              value={encounterSearch}
              onChange={(e) => setEncounterSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400"
            />
          </div>
          <FilterChips facets={facets} active={encounterFilters} onChange={setEncounterFilters} />
        </div>

        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(enc) => enc.id}
          actions={rowActions}
          empty={
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-1">
                {allEnc.length === 0 ? "No encounters yet." : "No encounters match your filters"}
              </p>
              {allEnc.length > 0 && (
                <button onClick={() => { setEncounterFilters([]); setEncounterSearch(""); }} className="text-xs text-blue-600 hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          }
        />

        {/* Inline SOAP Editor */}
        {editingEncounterId && (
          <div className="glass rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">SOAP Note Editor</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDocAssistantOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
                  title="Open the documentation assistant"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Documentation Assistant
                </button>
                <button onClick={() => setEditingEncounterId(null)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
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
                style={{ backgroundColor: "#635bff" }}
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
    const mockRefillRequests = isDemoMode ? [
      { id: "ref1", patient: "James Wilson", medication: "Sertraline", dosage: "100mg", requestedDate: "Mar 18, 2026" },
      { id: "ref2", patient: "Carlos Mendez", medication: "Metformin", dosage: "500mg", requestedDate: "Mar 17, 2026" },
    ] : [];

    const mockPrescriptions = isDemoMode ? [
      { id: "rx1", patient: "James Wilson", medication: "Sertraline", dosage: "100mg", frequency: "Daily", prescriber: "Dr. Michel", status: "active" as const, refillsLeft: 5 },
      { id: "rx2", patient: "James Wilson", medication: "Bupropion XL", dosage: "150mg", frequency: "Daily", prescriber: "Dr. Michel", status: "active" as const, refillsLeft: 4 },
      { id: "rx3", patient: "Sarah Mitchell", medication: "Lisinopril", dosage: "10mg", frequency: "Daily", prescriber: "Dr. Michel", status: "active" as const, refillsLeft: 3 },
      { id: "rx4", patient: "Carlos Mendez", medication: "Metformin", dosage: "500mg", frequency: "Twice daily", prescriber: "Dr. Michel", status: "refill_requested" as const, refillsLeft: 0 },
      { id: "rx5", patient: "Emily Chen", medication: "Atorvastatin", dosage: "20mg", frequency: "Daily", prescriber: "NP Johnson", status: "active" as const, refillsLeft: 6 },
      { id: "rx6", patient: "Robert Kim", medication: "Omeprazole", dosage: "20mg", frequency: "Daily", prescriber: "Dr. Michel", status: "active" as const, refillsLeft: 2 },
      { id: "rx7", patient: "Lisa Patel", medication: "Levothyroxine", dosage: "50mcg", frequency: "Daily", prescriber: "NP Johnson", status: "discontinued" as const, refillsLeft: 0 },
      { id: "rx8", patient: "James Wilson", medication: "Trazodone", dosage: "50mg", frequency: "Bedtime", prescriber: "Dr. Michel", status: "discontinued" as const, refillsLeft: 0 },
    ] : [];

    const allRx = (apiPrescriptions || mockPrescriptions);
    type Rx = typeof allRx[number];

    const statusOpts = Array.from(new Set(allRx.map((r) => r.status))).map((s) => ({
      value: s,
      label: s.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    }));
    const prescriberOpts = Array.from(new Set(allRx.map((r) => r.prescriber).filter(Boolean))).map((p) => ({ value: p, label: p }));
    const facets: import("../shared/stripe-ui").FilterFacet[] = [
      { key: "status", label: "Status", options: statusOpts },
      { key: "prescriber", label: "Prescriber", options: prescriberOpts },
    ];

    const filtered = allRx.filter((r) => {
      if (prescriptionSearch.trim()) {
        const q = prescriptionSearch.toLowerCase();
        const hay = [r.patient, r.medication, r.dosage, r.prescriber].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of prescriptionFilters) {
        if (f.key === "status" && r.status !== f.value) return false;
        if (f.key === "prescriber" && r.prescriber !== f.value) return false;
      }
      return true;
    });

    const cols: import("../shared/stripe-ui").DataTableColumn<Rx>[] = [
      {
        key: "medication",
        header: "Medication",
        cell: (rx) => (
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{rx.medication}</p>
            <p className="text-xs text-slate-500 truncate">{rx.dosage} · {rx.frequency}</p>
          </div>
        ),
      },
      {
        key: "patient",
        header: "Patient",
        cell: (rx) => (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}>
              {(rx.patient || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </div>
            <span className="truncate text-slate-800">{rx.patient}</span>
          </div>
        ),
      },
      {
        key: "prescriber",
        header: "Prescriber",
        hideBelow: "md",
        cell: (rx) => <span className="text-slate-600">{rx.prescriber}</span>,
      },
      {
        key: "status",
        header: "Status",
        cell: (rx) => <StatusPill label={rx.status} />,
      },
      {
        key: "refills",
        header: "Refills left",
        align: "right",
        hideBelow: "lg",
        cell: (rx) => <span className="tabular-nums text-slate-700">{rx.refillsLeft}</span>,
      },
      {
        key: "id",
        header: "Rx ID",
        hideBelow: "xl",
        cell: (rx) => <EntityId prefix="rx" id={rx.id} />,
      },
    ];

    const rowActions = (rx: Rx): import("../shared/stripe-ui").KebabAction[] => [
      { label: "Download PDF", onClick: () => handleDownloadRxPdf(rx.id) },
      { label: "eFax to pharmacy", onClick: () => handleOpenEfax(rx) },
      { label: "View details", onClick: () => setToast({ message: "Prescription detail view coming soon.", type: "success" }) },
      { label: "Edit prescription", onClick: () => setToast({ message: "Prescription editing coming soon.", type: "success" }) },
      ...(rx.status === "active" ? [
        { label: "Request refill", onClick: () => handleRefillPrescription(rx.id) },
        { label: "Discontinue", danger: true, onClick: () => setConfirmDialog({ title: "Discontinue Prescription", message: `Discontinue ${rx.medication} ${rx.dosage} for ${rx.patient}?`, confirmLabel: "Discontinue", danger: true, onConfirm: () => { handleDiscontinuePrescription(rx.id); setConfirmDialog(null); } }) },
      ] : []),
      ...(rx.status === "refill_requested" ? [
        { label: "Approve refill", onClick: () => handleRefillPrescription(rx.id) },
        { label: "Deny refill", danger: true, onClick: () => setConfirmDialog({ title: "Deny Refill", message: `Deny refill request for ${rx.medication}?`, confirmLabel: "Deny", danger: true, onConfirm: () => { handleDiscontinuePrescription(rx.id); setConfirmDialog(null); } }) },
      ] : []),
    ];

    return (
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Prescriptions</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {filtered.length === allRx.length
                ? `${allRx.length} ${allRx.length === 1 ? "prescription" : "prescriptions"}`
                : `${filtered.length} of ${allRx.length}`}
            </p>
          </div>
          <RefreshButton onRefresh={loadPracticeData} title="Refresh prescriptions" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active", value: prescriptionCounts.active, color: "#066e54" },
            { label: "eFaxed", value: prescriptionCounts.sent, color: "#1e3a8a" },
            { label: "Refill requests", value: prescriptionCounts.refillRequested, color: "#92400e" },
            { label: "Discontinued", value: prescriptionCounts.discontinued, color: "#475569" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{tile.label}</p>
              <p className="text-xl font-semibold tabular-nums mt-1" style={{ color: tile.color }}>{tile.value}</p>
            </div>
          ))}
        </div>

        {/* Pending Refill Requests — preserved from legacy view, now styled flat */}
        {(!apiPrescriptions && isDemoMode && mockRefillRequests.length > 0) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <h3 className="text-sm font-semibold text-amber-900 mb-3">Pending Refill Requests</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mockRefillRequests.map((req) => (
                <div key={req.id} className="rounded-lg bg-white border border-amber-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{req.patient}</p>
                      <p className="text-sm text-slate-600 mt-0.5">{req.medication} {req.dosage}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Requested {req.requestedDate}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        className="px-2.5 py-1 rounded-md text-xs font-medium text-white transition-colors"
                        style={{ backgroundColor: "#635bff" }}
                        onClick={() => handleRefillPrescription(req.id)}
                      >
                        Approve
                      </button>
                      <button
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
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

        {/* Search + filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by medication, patient, prescriber..."
              value={prescriptionSearch}
              onChange={(e) => setPrescriptionSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400"
            />
          </div>
          <FilterChips facets={facets} active={prescriptionFilters} onChange={setPrescriptionFilters} />
        </div>

        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(rx) => rx.id}
          actions={rowActions}
          empty={
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-1">
                {allRx.length === 0 ? "No prescriptions yet." : "No prescriptions match your filters"}
              </p>
              {allRx.length > 0 && (
                <button onClick={() => { setPrescriptionFilters([]); setPrescriptionSearch(""); }} className="text-xs text-blue-600 hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          }
        />
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

    const mockRecentScreeningsDemo = [
      { id: "s1", date: "Mar 18, 2026", patient: "James Wilson", instrument: "PHQ-9", score: 7, severity: "Mild", administeredBy: "Dr. Michel" },
      { id: "s2", date: "Mar 18, 2026", patient: "James Wilson", instrument: "GAD-7", score: 6, severity: "Mild", administeredBy: "Dr. Michel" },
      { id: "s3", date: "Mar 17, 2026", patient: "Sarah Mitchell", instrument: "PHQ-9", score: 12, severity: "Moderate", administeredBy: "Dr. Michel" },
      { id: "s4", date: "Mar 16, 2026", patient: "Carlos Mendez", instrument: "GAD-7", score: 15, severity: "Severe", administeredBy: "Dr. Michel" },
      { id: "s5", date: "Mar 15, 2026", patient: "Emily Chen", instrument: "PHQ-9", score: 4, severity: "Minimal", administeredBy: "NP Johnson" },
      { id: "s6", date: "Mar 14, 2026", patient: "Robert Kim", instrument: "ASRS", score: 14, severity: "Moderate", administeredBy: "Dr. Michel" },
    ];
    const mockRecentScreenings = apiScreenings.length > 0 ? apiScreenings : (isDemoMode ? mockRecentScreeningsDemo : []);

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
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Screenings</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {mockRecentScreenings.length} {mockRecentScreenings.length === 1 ? "response" : "responses"} recorded
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={loadPracticeData} title="Refresh screenings" />
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
              style={{ backgroundColor: "#635bff" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
              onClick={() => setShowNewScreening(true)}
            >
              <Plus className="w-4 h-4" />
              Administer screening
            </button>
          </div>
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
                  {mockRecentScreenings.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400 text-sm">No screenings administered yet.</td></tr>
                  )}
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
    const mockPaymentsDemo = [
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
    const mockPayments = apiPayments.length > 0 ? apiPayments : (isDemoMode ? mockPaymentsDemo : []);

    // Treat `completed` (legacy seeder) the same as `succeeded` for KPI math.
    const isSuccessful = (s: string) => s === "succeeded" || s === "completed";

    // KPIs
    const monthSucceeded = mockPayments.filter((p) => isSuccessful(p.status)).reduce((sum: number, p: { amount: number }) => sum + Number(p.amount ?? 0), 0);
    const monthOutstanding = mockPayments.filter((p) => p.status === "pending").reduce((sum: number, p: { amount: number }) => sum + Number(p.amount ?? 0), 0);
    const monthRefunded = mockPayments.filter((p) => p.status === "refunded").reduce((sum: number, p: { amount: number }) => sum + Number(p.amount ?? 0), 0);
    const monthFailed = mockPayments.filter((p) => p.status === "failed").reduce((sum: number, p: { amount: number }) => sum + Number(p.amount ?? 0), 0);

    // Filter facets
    const statusOpts = Array.from(new Set(mockPayments.map((p) => p.status))).map((s) => ({
      value: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
    }));
    const methodOpts = Array.from(new Set(mockPayments.map((p) => p.method))).map((m) => ({
      value: m,
      label: m === "card" ? "Card" : m === "bank" ? "Bank transfer" : m.charAt(0).toUpperCase() + m.slice(1),
    }));
    const facets: import("../shared/stripe-ui").FilterFacet[] = [
      { key: "status", label: "Status", options: statusOpts },
      { key: "method", label: "Method", options: methodOpts },
    ];

    // Apply search + filters
    const filtered = mockPayments.filter((p) => {
      if (paymentSearch.trim()) {
        const q = paymentSearch.toLowerCase();
        const hay = [p.id, p.patient, p.invoice, p.status, p.method].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of paymentFilters) {
        if (f.key === "status" && p.status !== f.value) return false;
        if (f.key === "method" && p.method !== f.value) return false;
      }
      return true;
    });

    type Pay = typeof mockPayments[number];

    const cols: import("../shared/stripe-ui").DataTableColumn<Pay>[] = [
      {
        key: "amount",
        header: "Amount",
        cell: (pay) => <MoneyAmount amount={pay.amount} />,
      },
      {
        key: "status",
        header: "Status",
        cell: (pay) => <StatusPill label={pay.status} />,
      },
      {
        key: "patient",
        header: "Customer",
        cell: (pay) => (
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
            >
              {(pay.patient || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </div>
            <span className="truncate text-slate-800">{pay.patient}</span>
          </div>
        ),
      },
      {
        key: "method",
        header: "Method",
        hideBelow: "md",
        cell: (pay) => (
          <span className="text-sm text-slate-600 capitalize">
            {pay.method === "card" ? "Card" : pay.method === "bank" ? "Bank transfer" : pay.method}
          </span>
        ),
      },
      {
        key: "invoice",
        header: "Invoice",
        hideBelow: "md",
        cell: (pay) => pay.invoice ? <span className="font-mono text-xs text-slate-500 tabular-nums">{pay.invoice}</span> : <span className="text-slate-300">—</span>,
      },
      {
        key: "date",
        header: "Created",
        hideBelow: "sm",
        cell: (pay) => <span className="text-slate-500">{pay.date}</span>,
      },
      {
        key: "id",
        header: "ID",
        hideBelow: "lg",
        cell: (pay) => <EntityId prefix="py" id={pay.id} />,
      },
    ];

    const rowActions = (pay: Pay): import("../shared/stripe-ui").KebabAction[] => [
      { label: "View details", onClick: () => setSelectedPaymentId(pay.id) },
      ...(pay.status === "failed" ? [{
        label: "Retry payment",
        onClick: async () => {
          try {
            await apiFetch(`/payments/${pay.id}/retry`, { method: "POST" });
            setToast({ message: "Payment retry initiated.", type: "success" });
            loadPracticeData();
          } catch { setToast({ message: "Payment retry failed.", type: "error" }); }
        },
      }] : []),
      ...(isSuccessful(pay.status) ? [{
        label: "Refund payment",
        danger: true,
        onClick: () => setConfirmDialog({
          title: "Refund Payment",
          message: `Refund $${Number(pay.amount ?? 0).toFixed(2)} to ${pay.patient}?`,
          confirmLabel: "Refund",
          danger: true,
          onConfirm: async () => {
            try {
              await paymentService.refund(pay.id);
              setToast({ message: "Refund processed.", type: "success" });
              loadPracticeData();
            } catch { setToast({ message: "Refund failed.", type: "error" }); }
            setConfirmDialog(null);
          },
        }),
      }] : []),
    ];

    const selectedPayment = mockPayments.find((p) => p.id === selectedPaymentId) ?? null;

    return (
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Payments</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {filtered.length === mockPayments.length
                ? `${mockPayments.length} ${mockPayments.length === 1 ? "payment" : "payments"}`
                : `${filtered.length} of ${mockPayments.length}`}
            </p>
          </div>
          <RefreshButton onRefresh={loadPracticeData} title="Refresh payments" />
        </div>

        {/* Summary KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Succeeded", value: monthSucceeded, color: "#066e54" },
            { label: "Outstanding", value: monthOutstanding, color: "#92400e" },
            { label: "Failed", value: monthFailed, color: "#b91c1c" },
            { label: "Refunded", value: monthRefunded, color: "#475569" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {tile.label}
              </p>
              <p className="text-xl font-semibold tabular-nums mt-1" style={{ color: tile.color }}>
                <MoneyAmount amount={tile.value} />
              </p>
            </div>
          ))}
        </div>

        {/* Search + filter chips bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by patient, invoice, ID..."
              value={paymentSearch}
              onChange={(e) => setPaymentSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400"
            />
          </div>
          <FilterChips facets={facets} active={paymentFilters} onChange={setPaymentFilters} />
        </div>

        {/* Stripe-grade data table */}
        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(p) => p.id}
          actions={rowActions}
          onRowClick={(p) => setSelectedPaymentId(p.id)}
          highlightRowId={selectedPaymentId}
          empty={
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-1">
                {mockPayments.length === 0 ? "No payments recorded yet." : "No payments match your filters"}
              </p>
              {mockPayments.length > 0 && (
                <button
                  onClick={() => { setPaymentFilters([]); setPaymentSearch(""); }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          }
          footer={
            filtered.length > 0
              ? `Showing ${filtered.length} ${filtered.length === 1 ? "payment" : "payments"}`
              : null
          }
        />

        {/* Slide-over payment detail */}
        <DetailDrawer
          open={!!selectedPayment}
          onClose={() => setSelectedPaymentId(null)}
          eyebrow="Payment"
          title={
            selectedPayment ? (
              <div className="flex items-center gap-2 min-w-0">
                <MoneyAmount amount={selectedPayment.amount} />
                <StatusPill label={selectedPayment.status} />
              </div>
            ) : ""
          }
          width="md"
          footer={
            selectedPayment ? (
              <>
                <button
                  onClick={() => setSelectedPaymentId(null)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
                {isSuccessful(selectedPayment.status) && (
                  <button
                    onClick={() => setConfirmDialog({ title: "Refund Payment", message: `Refund $${Number(selectedPayment.amount ?? 0).toFixed(2)} to ${selectedPayment.patient}?`, confirmLabel: "Refund", danger: true, onConfirm: async () => { try { await paymentService.refund(selectedPayment.id); setToast({ message: "Refund processed.", type: "success" }); loadPracticeData(); setSelectedPaymentId(null); } catch { setToast({ message: "Refund failed.", type: "error" }); } setConfirmDialog(null); } })}
                    className="px-3 py-1.5 rounded-md text-sm font-medium border border-red-200 text-red-700 bg-white hover:bg-red-50"
                  >
                    Refund
                  </button>
                )}
              </>
            ) : null
          }
        >
          {selectedPayment && (
            <div className="space-y-5">
              <div className="space-y-3">
                <Field label="Payment ID">
                  <EntityId prefix="py" id={selectedPayment.id} full />
                </Field>
                <Field label="Customer">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
                    >
                      {(selectedPayment.patient || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                    </div>
                    <span className="text-sm text-slate-800">{selectedPayment.patient}</span>
                  </div>
                </Field>
                <Field label="Method">
                  <span className="text-sm text-slate-700 capitalize">
                    {selectedPayment.method === "card" ? "Card" : selectedPayment.method === "bank" ? "Bank transfer" : selectedPayment.method}
                  </span>
                </Field>
                <Field label="Invoice">
                  {selectedPayment.invoice ? <span className="font-mono text-xs text-slate-700">{selectedPayment.invoice}</span> : <span className="text-sm text-slate-400">—</span>}
                </Field>
                <Field label="Created">
                  <span className="text-sm text-slate-700">{selectedPayment.date}</span>
                </Field>
                <Field label="Status">
                  <StatusPill label={selectedPayment.status} />
                </Field>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-3">
                  Amount
                </p>
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">Total</span>
                    <MoneyAmount amount={selectedPayment.amount} className="font-semibold text-base" />
                  </div>
                </div>
              </div>

              {selectedPayment.status === "failed" && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-3">
                    Recovery
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        await apiFetch(`/payments/${selectedPayment.id}/retry`, { method: "POST" });
                        setToast({ message: "Payment retry initiated.", type: "success" });
                        loadPracticeData();
                        setSelectedPaymentId(null);
                      } catch { setToast({ message: "Payment retry failed.", type: "error" }); }
                    }}
                    className="px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm"
                    style={{ backgroundColor: "#635bff" }}
                  >
                    Retry payment
                  </button>
                </div>
              )}
            </div>
          )}
        </DetailDrawer>
      </div>
    );
  }

  // ─── Coupons Tab ──────────────────────────────────────────────────────────

  function renderCoupons() {
    const mockCouponsDemo = [
      { id: "c1", code: "WELCOME20", description: "20% off first month", discountType: "percent" as const, discountValue: 20, usesCount: 8, usesMax: 50, validUntil: "Jun 30, 2026", status: "active" as const },
      { id: "c2", code: "ANNUAL10", description: "10% off annual plan", discountType: "percent" as const, discountValue: 10, usesCount: 3, usesMax: null as number | null, validUntil: "Dec 31, 2026", status: "active" as const },
      { id: "c3", code: "FRIEND50", description: "$50 off", discountType: "amount" as const, discountValue: 50, usesCount: 12, usesMax: 20, validUntil: "Sep 30, 2026", status: "active" as const },
      { id: "c4", code: "SUMMER2025", description: "1 month free", discountType: "free_months" as const, discountValue: 1, usesCount: 15, usesMax: 15, validUntil: "Aug 31, 2025", status: "expired" as const },
    ];
    const mockCoupons = apiCoupons.length > 0 ? apiCoupons : (isDemoMode ? mockCouponsDemo : []);

    type Cp = typeof mockCoupons[number];

    const formatDiscount = (coupon: Cp) => {
      if (coupon.discountType === "percent") return `${coupon.discountValue}% off`;
      if (coupon.discountType === "amount") return `$${coupon.discountValue} off`;
      return `${coupon.discountValue} month${coupon.discountValue > 1 ? "s" : ""} free`;
    };

    const statusOpts = Array.from(new Set(mockCoupons.map((c) => c.status))).map((s) => ({
      value: s, label: s.charAt(0).toUpperCase() + s.slice(1),
    }));
    const typeOpts = Array.from(new Set(mockCoupons.map((c) => c.discountType))).map((t) => ({
      value: t,
      label: t === "percent" ? "Percent off" : t === "amount" ? "Amount off" : "Free months",
    }));
    const facets: import("../shared/stripe-ui").FilterFacet[] = [
      { key: "status", label: "Status", options: statusOpts },
      { key: "type", label: "Type", options: typeOpts },
    ];

    const filtered = mockCoupons.filter((c) => {
      if (couponSearch.trim()) {
        const q = couponSearch.toLowerCase();
        const hay = [c.code, c.description].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of couponFilters) {
        if (f.key === "status" && c.status !== f.value) return false;
        if (f.key === "type" && c.discountType !== f.value) return false;
      }
      return true;
    });

    const cols: import("../shared/stripe-ui").DataTableColumn<Cp>[] = [
      {
        key: "code",
        header: "Code",
        cell: (c) => (
          <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold tabular-nums" style={{ backgroundColor: "#eef2ff", color: "#4338ca" }}>
            {c.code}
          </span>
        ),
      },
      {
        key: "discount",
        header: "Discount",
        cell: (c) => <span className="text-slate-700 font-medium">{formatDiscount(c)}</span>,
      },
      {
        key: "description",
        header: "Description",
        hideBelow: "md",
        cell: (c) => <span className="text-slate-600 truncate">{c.description}</span>,
      },
      {
        key: "uses",
        header: "Redemptions",
        align: "right",
        hideBelow: "md",
        cell: (c) => (
          <span className="text-slate-600 tabular-nums">
            {c.usesCount}<span className="text-slate-400"> / {c.usesMax ?? "∞"}</span>
          </span>
        ),
      },
      {
        key: "validUntil",
        header: "Valid until",
        hideBelow: "md",
        cell: (c) => <span className="text-slate-500">{c.validUntil}</span>,
      },
      {
        key: "status",
        header: "Status",
        cell: (c) => <StatusPill label={c.status} />,
      },
    ];

    const rowActions = (coupon: Cp): import("../shared/stripe-ui").KebabAction[] => [
      { label: "Copy code", onClick: () => { navigator.clipboard.writeText(coupon.code); setToast({ message: `Copied "${coupon.code}" to clipboard.`, type: "success" }); } },
      { label: "Edit coupon", onClick: () => setToast({ message: "Coupon editing coming soon.", type: "success" }) },
      ...(coupon.status === "active" ? [{
        label: "Deactivate", danger: true, onClick: () => setConfirmDialog({
          title: "Deactivate Coupon",
          message: `Deactivate coupon "${coupon.code}"?`,
          confirmLabel: "Deactivate",
          danger: true,
          onConfirm: async () => {
            try {
              await couponService.update(coupon.id, { isActive: false } as Record<string, unknown>);
              setToast({ message: "Coupon deactivated.", type: "success" });
              loadPracticeData();
            } catch { setToast({ message: "Failed to deactivate coupon.", type: "error" }); }
            setConfirmDialog(null);
          },
        }),
      }] : []),
      { label: "Delete", danger: true, onClick: () => setConfirmDialog({ title: "Delete Coupon", message: `Delete coupon "${coupon.code}"? This cannot be undone.`, confirmLabel: "Delete", danger: true, onConfirm: async () => { try { await couponService.delete(coupon.id); setToast({ message: "Coupon deleted.", type: "success" }); loadPracticeData(); } catch { setToast({ message: "Failed.", type: "error" }); } setConfirmDialog(null); } }) },
    ];

    return (
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Coupons</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {filtered.length === mockCoupons.length
                ? `${mockCoupons.length} ${mockCoupons.length === 1 ? "coupon" : "coupons"}`
                : `${filtered.length} of ${mockCoupons.length}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={loadPracticeData} title="Refresh coupons" />
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
              style={{ backgroundColor: "#635bff" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
              onClick={() => setShowNewCoupon(true)}
            >
              <Plus className="w-4 h-4" />
              Create coupon
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by code or description..."
              value={couponSearch}
              onChange={(e) => setCouponSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400"
            />
          </div>
          <FilterChips facets={facets} active={couponFilters} onChange={setCouponFilters} />
        </div>

        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(c) => c.id}
          actions={rowActions}
          empty={
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-1">
                {mockCoupons.length === 0 ? "No coupons created yet." : "No coupons match your filters"}
              </p>
              {mockCoupons.length > 0 && (
                <button
                  onClick={() => { setCouponFilters([]); setCouponSearch(""); }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  // ─── Providers Tab ────────────────────────────────────────────────────────

  // ─── Providers data (loaded from API) ───────────────────────────────
  const [apiProviders, setApiProviders] = useState<{ id: string; name: string; credentials: string; specialty: string; panelCount: number; panelMax: number; panelStatus: string; telehealth: boolean; initials: string }[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);

  useEffect(() => {
    if (providersLoaded) return;
    (async () => {
      try {
        const res = await providerService.list();
        if (res.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const list = Array.isArray(res.data) ? res.data : (res.data as any).data || [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setApiProviders(list.map((p: any) => ({
            id: p.id,
            name: [p.firstName || p.first_name, p.lastName || p.last_name].filter(Boolean).join(" ") || p.name || "",
            credentials: p.credentials || "",
            specialty: (Array.isArray(p.specialties) ? p.specialties[0] : p.specialty) || "",
            panelCount: p.panelCount ?? p.panel_count ?? 0,
            panelMax: p.panelCapacity ?? p.panel_capacity ?? 500,
            panelStatus: p.panelStatus ?? p.panel_status ?? "open",
            telehealth: p.telehealthEnabled ?? p.telehealth_enabled ?? false,
            initials: ([p.firstName || p.first_name, p.lastName || p.last_name].filter(Boolean).map((n: string) => n[0]).join("")).toUpperCase() || "??",
          })));
        }
      } catch { /* ignore */ }
      setProvidersLoaded(true);
    })();
  }, [providersLoaded]);

  function renderProviders() {
    const mockProviders = isDemoMode ? [
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
    ] : [];

    const providers = apiProviders.length > 0 ? apiProviders : mockProviders;

    const panelStatusConfig: Record<string, { bg: string; text: string }> = {
      Open: { bg: "#ecf9ec", text: "#2f8132" },
      open: { bg: "#ecf9ec", text: "#2f8132" },
      Closed: { bg: "#fef2f2", text: "#dc2626" },
      closed: { bg: "#fef2f2", text: "#dc2626" },
      Waitlist: { bg: "#fffbeb", text: "#d97706" },
      waitlist: { bg: "#fffbeb", text: "#d97706" },
      limited: { bg: "#fffbeb", text: "#d97706" },
    };

    const totalPanel = providers.reduce((sum: number, p) => sum + (p.panelCount ?? 0), 0);
    const totalPanelMax = providers.reduce((sum: number, p) => sum + (p.panelMax ?? 0), 0);
    const openPanels = providers.filter((p) => String(p.panelStatus).toLowerCase() === "open").length;
    const telehealthCount = providers.filter((p) => p.telehealth).length;

    return (
      <div className="space-y-5">
        {/* Stripe-grade header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Providers</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {providers.length} {providers.length === 1 ? "provider" : "providers"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={loadPracticeData} title="Refresh providers" />
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
              style={{ backgroundColor: "#635bff" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
              onClick={() => setShowAddProvider(true)}
            >
              <Plus className="w-4 h-4" />
              Add provider
            </button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total providers", value: providers.length },
            { label: "Open panels", value: openPanels },
            { label: "Telehealth-enabled", value: telehealthCount },
            { label: "Total panel size", value: `${totalPanel.toLocaleString()} / ${totalPanelMax.toLocaleString()}` },
          ].map((tile) => (
            <div key={tile.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{tile.label}</p>
              <p className="text-xl font-semibold tabular-nums mt-1 text-slate-900">{tile.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {providers.map((prov) => {
            const panelPct = Math.round((prov.panelCount / prov.panelMax) * 100);
            const psc = panelStatusConfig[prov.panelStatus] || { bg: "#f1f5f9", text: "#64748b" };
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
                      style={{ width: `${panelPct}%`, backgroundColor: "#635bff" }}
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
                    onClick={() => navigate(`/practice/providers/${prov.id}?tab=schedule`)}
                  >
                    View Schedule
                  </button>
                  <button
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                    style={{ backgroundColor: "#334e68" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#243b53")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#334e68")}
                    onClick={() => navigate(`/practice/providers/${prov.id}`)}
                  >
                    View Details
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
            onClick={() => setShowAddProvider(true)}
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
    const mockStaffDemo = [
      { id: "st1", name: "Maria Garcia", email: "front.desk@example.com", role: "Front Desk", status: "active" as const, lastLogin: "Mar 18, 2026 9:15 AM" },
      { id: "st2", name: "Jessica Lee", email: "billing@example.com", role: "Billing Coordinator", status: "active" as const, lastLogin: "Mar 18, 2026 8:30 AM" },
      { id: "st3", name: "Tom Brown", email: "admin@example.com", role: "Office Manager", status: "active" as const, lastLogin: "Mar 17, 2026 5:00 PM" },
    ];
    const mockStaff = apiStaff.length > 0 ? apiStaff : (isDemoMode ? mockStaffDemo : []);

    const roleConfig: Record<string, { bg: string; text: string }> = {
      "Front Desk": { bg: "#e6f7f2", text: "#147d64" },
      "Billing Coordinator": { bg: "#fffbeb", text: "#d97706" },
      "Office Manager": { bg: "#e0e8f0", text: "#334e68" },
    };
    const fallbackRoleColor = { bg: "#f1f5f9", text: "#475569" };

    type Sf = typeof mockStaff[number];

    const roleOpts = Array.from(new Set(mockStaff.map((s) => s.role).filter(Boolean))).map((r) => ({ value: r, label: r }));
    const statusOpts = Array.from(new Set(mockStaff.map((s) => s.status))).map((s) => ({
      value: s, label: s.charAt(0).toUpperCase() + s.slice(1),
    }));
    const facets: import("../shared/stripe-ui").FilterFacet[] = [
      { key: "status", label: "Status", options: statusOpts },
      { key: "role", label: "Role", options: roleOpts },
    ];

    const filtered = mockStaff.filter((s) => {
      if (staffSearch.trim()) {
        const q = staffSearch.toLowerCase();
        const hay = [s.name, s.email, s.role].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of staffFilters) {
        if (f.key === "status" && s.status !== f.value) return false;
        if (f.key === "role" && s.role !== f.value) return false;
      }
      return true;
    });

    const cols: import("../shared/stripe-ui").DataTableColumn<Sf>[] = [
      {
        key: "name",
        header: "Name",
        cell: (s) => (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}>
              {(s.name || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
              <p className="text-xs text-slate-400 truncate">{s.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: "role",
        header: "Role",
        cell: (s) => {
          const rc = roleConfig[s.role] || fallbackRoleColor;
          return (
            <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: rc.bg, color: rc.text }}>
              {s.role}
            </span>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        cell: (s) => <StatusPill label={s.status} />,
      },
      {
        key: "lastLogin",
        header: "Last login",
        hideBelow: "md",
        cell: (s) => <span className="text-slate-500">{s.lastLogin}</span>,
      },
    ];

    const rowActions = (staff: Sf): import("../shared/stripe-ui").KebabAction[] => [
      { label: "Edit", onClick: () => setToast({ message: "Staff editing coming soon.", type: "success" }) },
      { label: "Resend invite", onClick: () => setToast({ message: "Invite resent.", type: "success" }) },
      { label: "Deactivate", danger: true, onClick: () => setConfirmDialog({
        title: "Deactivate Staff",
        message: `Deactivate ${staff.name}? They will lose access to the portal.`,
        confirmLabel: "Deactivate",
        danger: true,
        onConfirm: async () => {
          try {
            await apiFetch(`/staff/${staff.id}`, { method: "PUT", body: JSON.stringify({ isActive: false }) });
            setToast({ message: `${staff.name} deactivated.`, type: "success" });
            loadPracticeData();
          } catch { setToast({ message: "Failed to deactivate staff member.", type: "error" }); }
          setConfirmDialog(null);
        },
      }) },
      { label: "Remove permanently", danger: true, onClick: () => setConfirmDialog({ title: "Remove Staff", message: `Remove ${staff.name} permanently?`, confirmLabel: "Remove", danger: true, onConfirm: async () => { try { await apiFetch(`/staff/${staff.id}`, { method: "DELETE" }); setToast({ message: "Staff member removed.", type: "success" }); loadPracticeData(); } catch { setToast({ message: "Failed.", type: "error" }); } setConfirmDialog(null); } }) },
    ];

    return (
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Staff</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {filtered.length === mockStaff.length
                ? `${mockStaff.length} ${mockStaff.length === 1 ? "staff member" : "staff members"}`
                : `${filtered.length} of ${mockStaff.length}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={loadPracticeData} title="Refresh staff" />
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
              style={{ backgroundColor: "#635bff" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
              onClick={() => setShowInviteStaff(true)}
            >
              <UserPlus className="w-4 h-4" />
              Invite staff
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, role..."
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400"
            />
          </div>
          <FilterChips facets={facets} active={staffFilters} onChange={setStaffFilters} />
        </div>

        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(s) => s.id}
          actions={rowActions}
          empty={
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-1">
                {mockStaff.length === 0 ? "No staff members yet. Click \"Invite staff\" to add team members." : "No staff match your filters"}
              </p>
              {mockStaff.length > 0 && (
                <button onClick={() => { setStaffFilters([]); setStaffSearch(""); }} className="text-xs text-blue-600 hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  // ─── Notifications Tab ────────────────────────────────────────────────────

  function renderNotifications() {
    const mockNotificationsDemo = [
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
    const mockNotifications = apiNotifications.length > 0 ? apiNotifications : (isDemoMode ? mockNotificationsDemo : []);

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

    const unreadCount = mockNotifications.filter((n) => !n.read).length;

    return (
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Notifications</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={loadPracticeData} title="Refresh notifications" />
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={() => setToast({ message: "All notifications marked as read.", type: "success" })}
            >
              <Check className="w-4 h-4" />
              Mark all read
            </button>
          </div>
        </div>

        {/* Filter Tabs — Stripe-style segmented row */}
        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {filterTabs.map((tab) => {
            const isActive = notificationFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setNotificationFilter(tab.id)}
                className={`px-3 py-2 text-[13px] font-medium capitalize transition-colors whitespace-nowrap ${
                  isActive
                    ? "text-slate-900 border-b-2 border-[#635bff]"
                    : "text-slate-500 hover:text-slate-700 border-b-2 border-transparent"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Notification Feed */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
          {filtered.map((notif) => {
            const ic = categoryIcon(notif.category);
            return (
              <div
                key={notif.id}
                className={`px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer ${
                  notif.read ? "hover:bg-slate-50" : "hover:bg-slate-50 bg-blue-50/30"
                }`}
              >
                <div className="mt-1.5 shrink-0">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: notif.read ? "#e2e8f0" : ic.color }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`text-sm ${notif.read ? "text-slate-600" : "text-slate-900 font-semibold"}`}>
                        {notif.title}
                      </p>
                      <p className="text-sm text-slate-500 mt-0.5">{notif.description}</p>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap font-medium">{notif.time}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-slate-400">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No notifications in this category</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Tab Router ─────────────────────────────────────────────────────────

  function renderContent() {
    if (selectedProviderId) {
      return (
        <ProviderDetailPage
          providerId={selectedProviderId}
          embedded
          onBack={() => navigate("/practice")}
        />
      );
    }
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
      case "profile":
        return <ProfilePage onBack={() => setActiveTab("dashboard")} />;
      case "engagement":
        return <EngagementSection />;
      case "analytics":
        return <ProviderAnalyticsSection />;
      case "compliance":
        return <AuditDashboard />;
      case "revenue-analytics":
        return <RevenueAnalyticsTab />;
      case "dunning":
        return <DunningDashboardTab />;
      case "referrals":
        return <ReferralManagementTab />;
      case "engagement":
        return <EngagementDashboardTab />;
      case "care-coordination":
        return <CareCoordinationTab />;
      case "lab-orders":
        return <LabOrdersTab />;
      case "employers":
        return <EmployerManagementTab />;
      case "inventory":
        return <InventoryTab />;
      case "communications":
        return <CommunicationsTab />;
      case "activity-log":
        return <ActivityLoggerTab />;
      case "recent-activity":
        return renderRecentActivity();
      case "a-la-carte":
        return <ALaCarteTab />;
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
    : selectedPlan
    ? `Plan: ${selectedPlan.name}`
    : NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === activeTab)?.label || "Dashboard";

  // ─── Render ─────────────────────────────────────────────────────────────

  // Resolve which role drives sidebar filtering. practice_admin sees
  // everything; provider sees clinical-only; staff sees ops + billing
  // without practice settings; superadmin same as practice_admin here.
  const portalRole: PortalRole =
    auth.user?.role === "provider" ? "provider"
    : auth.user?.role === "staff" ? "staff"
    : auth.user?.role === "superadmin" ? "superadmin"
    : "practice_admin";

  // Practice Portal now uses the flat Stripe-grade chrome regardless of
  // role. The brand sigil is the Stripe-purple square; nav rows are
  // tighter, badges sit inline. Role-tinted gradients live on in the
  // SuperAdmin / Patient / Operator portals until they migrate too.
  const portalColor: PortalColor = "stripe";

  // Convert NAV_SECTIONS -> PortalShell's NavSection shape and filter
  // by the current role. Empty sections are dropped automatically.
  const filteredSections: ShellNavSection[] = navForRole(portalRole).map((s) => ({
    id: s.title.toLowerCase().replace(/\s+/g, "-"),
    label: s.title,
    items: s.items.map((it) => ({
      id: it.id,
      label: it.label,
      // ElementType (React.ElementType) is broader than PortalShell's
      // ComponentType<{className?: string}> but lucide-react icons all
      // accept className, so the runtime contract is satisfied. Cast
      // here to keep the existing NavItem type ergonomic.
      icon: it.icon as React.ComponentType<{ className?: string }>,
      badge: it.id === "messages" && unreadCount > 0 ? unreadCount : undefined,
    })),
  }));

  const fullName = [auth.user?.firstName, auth.user?.lastName].filter(Boolean).join(" ") || "Practice";
  const userSubtitle =
    portalRole === "provider" ? "Provider"
    : portalRole === "staff" ? "Staff"
    : portalRole === "superadmin" ? "Superadmin"
    : "Practice Admin";

  // Command palette — Cmd+K / Ctrl+K opens it. Items are derived from
  // the same role-filtered NAV_SECTIONS so admins/providers/staff each
  // see only the destinations they can actually reach.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteShortcut(() => setPaletteOpen(true));
  const paletteItems = filteredSections.flatMap((section) =>
    section.items.map((it) => ({
      id: it.id,
      label: it.label,
      hint: section.label,
      icon: it.icon,
    })),
  );

  return (
    <>
      <PortalShell
        portalTitle={portalRole === "provider" ? "Provider Portal" : "Practice Portal"}
        portalColor={portalColor}
        userName={fullName}
        userSubtitle={userSubtitle}
        nav={filteredSections}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        onLogout={auth.logout}
        headerTitle={activeLabel}
      >
        {dataLoading && (
          <div className="h-0.5 w-full overflow-hidden mb-4 -mt-2 bg-slate-100">
            <div className="h-full animate-pulse" style={{ backgroundColor: "#635bff", width: "40%", animationDuration: "1s" }} />
          </div>
        )}
        {renderContent()}
      </PortalShell>

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

      {/* ─── Roster Cancel Membership Modal (with Retention Offers) ─────── */}
      {rosterCancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">
                {rosterCancelStep === "reason" ? "Cancel membership" : rosterCancelStep === "offers" ? "Before you go…" : "Confirm cancellation"}
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {rosterCancelStep === "reason" ? `Cancel ${rosterCancelDialog.patientName}'s membership` : rosterCancelStep === "offers" ? "We'd love to keep this member. Consider these options:" : `This will cancel ${rosterCancelDialog.patientName}'s membership`}
              </p>
            </div>

            {/* Step 1: Reason Selection */}
            {rosterCancelStep === "reason" && (
              <div className="p-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Why is this member cancelling? *</label>
                <div className="space-y-2">
                  {[
                    { value: "cost", label: "Too expensive" },
                    { value: "dissatisfied", label: "Dissatisfied with care" },
                    { value: "moved", label: "Moving / relocated" },
                    { value: "switching_provider", label: "Switching provider" },
                    { value: "other", label: "Other reason" },
                  ].map(opt => (
                    <label key={opt.value} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors" style={{ borderColor: rosterCancelReason === opt.value ? "#27ab83" : "#e2e8f0", backgroundColor: rosterCancelReason === opt.value ? "#e6fffa" : "white" }}>
                      <input type="radio" name="cancelReason" value={opt.value} checked={rosterCancelReason === opt.value} onChange={() => setRosterCancelReason(opt.value)} className="accent-teal-600" />
                      <span className="text-sm" style={{ color: "#334155" }}>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Retention Offers */}
            {rosterCancelStep === "offers" && (
              <div className="p-6">
                {retentionLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "#e2e8f0", borderTopColor: "#27ab83" }} />
                    <span className="ml-2 text-sm text-slate-500">Finding options...</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {retentionOffers.map((offer: { type: string; title: string; description: string; cta: string; planId?: string; monthlySavings?: number }, i: number) => (
                      <div key={i} className="rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md" style={{ borderColor: "#e2e8f0" }}
                        onClick={async () => {
                          if (offer.type === "pause" && rosterCancelDialog) {
                            try {
                              await apiFetch(`/memberships/${rosterCancelDialog.membershipId}/pause`, { method: "POST", body: JSON.stringify({ reason: rosterCancelReason }) });
                              setToast({ message: `${rosterCancelDialog.patientName}'s membership paused instead of cancelled.`, type: "success" });
                              setRosterCancelDialog(null); setRosterCancelReason(""); setRosterCancelStep("reason"); loadPracticeData();
                            } catch { setToast({ message: "Failed to pause membership.", type: "error" }); }
                          } else if (offer.type === "downgrade" && offer.planId && rosterCancelDialog) {
                            try {
                              await apiFetch(`/memberships/${rosterCancelDialog.membershipId}/change-plan`, { method: "POST", body: JSON.stringify({ planId: offer.planId }) });
                              setToast({ message: `Switched to ${offer.title.replace("Switch to ", "")} — saved $${offer.monthlySavings}/mo.`, type: "success" });
                              setRosterCancelDialog(null); setRosterCancelReason(""); setRosterCancelStep("reason"); loadPracticeData();
                            } catch { setToast({ message: "Failed to change plan.", type: "error" }); }
                          } else if (offer.type === "contact") {
                            setToast({ message: "Provider callback scheduled.", type: "success" });
                            setRosterCancelDialog(null); setRosterCancelReason(""); setRosterCancelStep("reason");
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold" style={{ color: "#102a43" }}>{offer.title}</h4>
                            <p className="text-xs mt-1" style={{ color: "#64748b" }}>{offer.description}</p>
                          </div>
                          <span className="text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap" style={{ backgroundColor: "#e6fffa", color: "#147d64" }}>{offer.cta}</span>
                        </div>
                      </div>
                    ))}
                    {retentionOffers.length === 0 && (
                      <p className="text-sm text-center py-4" style={{ color: "#94a3b8" }}>No alternative offers available.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Final Confirm */}
            {rosterCancelStep === "confirm" && (
              <div className="p-6">
                <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
                  <p className="text-sm" style={{ color: "#991b1b" }}>
                    This action will immediately cancel {rosterCancelDialog.patientName}&apos;s membership. This cannot be undone.
                  </p>
                </div>
                <p className="text-sm" style={{ color: "#64748b" }}>
                  Reason: <strong style={{ color: "#334155" }}>{rosterCancelReason}</strong>
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 pb-6 flex justify-between gap-3">
              <button
                onClick={() => {
                  if (rosterCancelStep === "reason") { setRosterCancelDialog(null); setRosterCancelReason(""); setRosterCancelStep("reason"); }
                  else if (rosterCancelStep === "offers") setRosterCancelStep("reason");
                  else setRosterCancelStep("offers");
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                {rosterCancelStep === "reason" ? "Never Mind" : "Go Back"}
              </button>
              <div className="flex gap-2">
                {rosterCancelStep === "reason" && (
                  <button
                    onClick={async () => {
                      setRetentionLoading(true); setRosterCancelStep("offers");
                      try {
                        const res = await billingEnhancedService.getRetentionOffers(rosterCancelDialog.membershipId, rosterCancelReason);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        setRetentionOffers((res.data as any)?.offers || []);
                      } catch { setRetentionOffers([]); }
                      setRetentionLoading(false);
                    }}
                    disabled={!rosterCancelReason}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "#dc2626" }}
                  >
                    Continue
                  </button>
                )}
                {rosterCancelStep === "offers" && (
                  <button
                    onClick={() => setRosterCancelStep("confirm")}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}
                  >
                    Cancel Anyway
                  </button>
                )}
                {rosterCancelStep === "confirm" && (
                  <button
                    onClick={async () => {
                      setRosterCancelLoading(true);
                      try {
                        await apiFetch(`/memberships/${rosterCancelDialog.membershipId}/cancel`, {
                          method: "POST",
                          body: JSON.stringify({ reason: rosterCancelReason, retentionOffered: true, retentionDeclined: "all" }),
                        });
                        setToast({ message: `${rosterCancelDialog.patientName}'s membership cancelled.`, type: "success" });
                        setRosterCancelDialog(null); setRosterCancelReason(""); setRosterCancelStep("reason"); loadPracticeData();
                      } catch { setToast({ message: "Failed to cancel membership.", type: "error" }); }
                      setRosterCancelLoading(false);
                    }}
                    disabled={rosterCancelLoading}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "#dc2626" }}
                  >
                    {rosterCancelLoading ? "Cancelling..." : "Confirm Cancellation"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Roster Enroll / Change Plan Modal ───────────────────────────── */}
      {rosterPlanDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-white">{rosterPlanDialog.mode === "change" ? "Change Plan" : "Enroll in Plan"}</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {rosterPlanDialog.mode === "change" ? `Select a new plan for ${rosterPlanDialog.patientName}` : `Choose a plan for ${rosterPlanDialog.patientName}`}
              </p>
            </div>
            <div className="p-6">
              {rosterAvailablePlansLoading && (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "#e2e8f0", borderTopColor: "#27ab83" }} />
                  <span className="ml-2 text-sm text-slate-500">Loading plans...</span>
                </div>
              )}
              {!rosterAvailablePlansLoading && rosterAvailablePlans.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No plans available.</p>
              )}
              {!rosterAvailablePlansLoading && rosterAvailablePlans.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {rosterAvailablePlans.map((plan) => {
                    const isSelected = rosterSelectedPlanId === plan.id;
                    const planName = plan.name || "Unnamed Plan";
                    const price = plan.monthlyPrice ?? plan.monthly_price ?? 0;
                    return (
                      <button
                        key={plan.id}
                        className="w-full text-left px-4 py-3 rounded-lg border transition-colors flex items-center justify-between"
                        style={{
                          borderColor: isSelected ? "#0D9488" : "#e2e8f0",
                          backgroundColor: isSelected ? "#e6f7f2" : "transparent",
                        }}
                        onClick={() => setRosterSelectedPlanId(isSelected ? null : plan.id)}
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-800">{planName}</p>
                          <p className="text-xs text-slate-500">${price}/month</p>
                        </div>
                        {isSelected && <Check className="w-4 h-4 shrink-0" style={{ color: "#0D9488" }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {rosterPlanDialog.mode === "enroll" && (
              <div className="px-6 pb-2">
                <div className="rounded-lg border border-slate-200 px-4 py-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rosterCompEnabled}
                      onChange={(e) => setRosterCompEnabled(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300"
                      style={{ accentColor: "#635bff" }}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">Comp this membership</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Skip Stripe billing. Used for staff plans, charity care, or beta users. Audit-logged.
                      </div>
                    </div>
                  </label>
                  {rosterCompEnabled && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Reason <span style={{ color: "#dc2626" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={rosterCompReason}
                        onChange={(e) => setRosterCompReason(e.target.value)}
                        placeholder="e.g. Staff plan, charity care, beta tester"
                        maxLength={500}
                        className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 focus:outline-none focus:ring-2"
                        style={{ outlineColor: "#635bff" }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setRosterPlanDialog(null);
                  setRosterSelectedPlanId(null);
                  setRosterCompEnabled(false);
                  setRosterCompReason("");
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRosterPlanAction}
                disabled={!rosterSelectedPlanId || rosterPlanActionLoading || (rosterCompEnabled && !rosterCompReason.trim())}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#0D9488" }}
              >
                {rosterPlanActionLoading
                  ? (rosterPlanDialog.mode === "change" ? "Changing..." : "Enrolling...")
                  : (rosterPlanDialog.mode === "change" ? "Change Plan" : (rosterCompEnabled ? "Enroll (Comped)" : "Enroll"))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Password Reset Link Modal ───────────────────────────────────── */}
      {resetLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Portal sign-in link</h3>
              <p className="text-sm text-slate-500 mt-0.5">Share this link with {resetLinkModal.patientName} to set their password.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <strong>One-time use, expires in 60 minutes.</strong> Do not share over insecure channels — treat like a password.
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Reset URL</label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono break-all"
                  rows={4}
                  readOnly
                  value={resetLinkModal.url}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(resetLinkModal.url);
                    setToast({ message: "Link copied to clipboard.", type: "success" });
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: "#635bff" }}
                >
                  Copy Link
                </button>
                <button
                  onClick={() => setResetLinkModal(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Patient Modal ──────────────────────────────────────────── */}
      {showAddPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Add new patient</h3>
              <p className="text-sm text-slate-500 mt-0.5">Enter patient demographics to create a new record.</p>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
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
                style={{ backgroundColor: "#635bff" }}
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

      {/* ─── Book Appointment Modal ──────────────────────────────────────── */}
      {showBookAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Book appointment</h3>
              <p className="text-sm text-slate-500 mt-0.5">Schedule a new appointment for a patient.</p>
            </div>
            <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={bookApptForm.patientId} onChange={e => setBookApptForm(f => ({ ...f, patientId: e.target.value }))}>
                  <option value="">Select patient...</option>
                  {(apiPatients || (isDemoMode ? MOCK_PATIENTS : [])).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                  {apiPrograms.length === 0 && isDemoMode && <>
                    <option value="dpc">DPC Membership</option>
                    <option value="ccm">CCM</option>
                    <option value="rpm">RPM</option>
                  </>}
                </select>
                {apiPrograms.length === 0 && !isDemoMode && (
                  <p className="text-xs text-slate-400 mt-1">
                    No programs configured yet. Visit Practice → Programs to set them up, or leave as "No program".
                  </p>
                )}
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
                style={{ backgroundColor: "#635bff" }}
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
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">New encounter</h3>
              <p className="text-sm text-slate-500 mt-0.5">Create a clinical encounter to document a visit.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={encounterForm.patientId} onChange={e => setEncounterForm(f => ({ ...f, patientId: e.target.value }))}>
                  <option value="">Select patient...</option>
                  {(apiPatients || (isDemoMode ? MOCK_PATIENTS : [])).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Encounter Type</label>
                  {/* Values must match StoreEncounterRequest::rules() enum:
                      office_visit, telehealth, phone, urgent, follow_up,
                      annual_wellness, procedure. */}
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={encounterForm.encounterType} onChange={e => setEncounterForm(f => ({ ...f, encounterType: e.target.value }))}>
                    <option value="office_visit">Office Visit</option>
                    <option value="follow_up">Follow-Up</option>
                    <option value="telehealth">Telehealth</option>
                    <option value="phone">Phone</option>
                    <option value="urgent">Urgent</option>
                    <option value="annual_wellness">Annual Wellness</option>
                    <option value="procedure">Procedure</option>
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
                  {apiPrograms.length === 0 && isDemoMode && <>
                    <option value="dpc">DPC Membership</option>
                    <option value="ccm">CCM</option>
                    <option value="rpm">RPM</option>
                  </>}
                </select>
                {apiPrograms.length === 0 && !isDemoMode && (
                  <p className="text-xs text-slate-400 mt-1">
                    No programs configured yet. Visit Practice → Programs to set them up, or leave as "No program".
                  </p>
                )}
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => setShowNewEncounter(false)}>Cancel</button>
              <button
                className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#635bff" }}
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
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">New prescription</h3>
              <p className="text-sm text-slate-500 mt-0.5">Prescribe a medication for a patient.</p>
            </div>
            <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={rxForm.patientId} onChange={e => setRxForm(f => ({ ...f, patientId: e.target.value }))}>
                  <option value="">Select patient...</option>
                  {(apiPatients || (isDemoMode ? MOCK_PATIENTS : [])).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <MedicationAutocomplete
                label="Medication Name *"
                value={rxForm.medicationName}
                placeholder="Type a medication name (e.g. Sertraline)..."
                helper="Pick a match from RxNorm (NIH) for a standardized name."
                onChange={(text) => setRxForm(f => ({ ...f, medicationName: text }))}
              />
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
                style={{ backgroundColor: "#635bff" }}
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
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">eFax prescription to pharmacy</h3>
              <p className="text-sm text-slate-500 mt-0.5">Send this prescription via secure eFax.</p>
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
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Edit patient</h3>
              <p className="text-sm text-slate-500 mt-0.5">Update patient information.</p>
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
                style={{ backgroundColor: "#635bff" }}
                onClick={handleEditPatient}
                disabled={editPatientLoading}
              >
                {editPatientLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Administer Screening Modal ──────────────────────────────────── */}
      {showNewScreening && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Administer screening</h3>
              <p className="text-sm text-slate-500 mt-0.5">Select a patient and instrument to administer a screening.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={screeningForm.patientId} onChange={e => setScreeningForm(f => ({ ...f, patientId: e.target.value }))}>
                  <option value="">Select patient...</option>
                  {(apiPatients || (isDemoMode ? MOCK_PATIENTS : [])).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Instrument *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={screeningForm.instrumentId} onChange={e => setScreeningForm(f => ({ ...f, instrumentId: e.target.value }))}>
                  <option value="phq9">PHQ-9 (Depression)</option>
                  <option value="gad7">GAD-7 (Anxiety)</option>
                  <option value="asrs">ASRS (ADHD)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Score</label>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={screeningForm.score} onChange={e => setScreeningForm(f => ({ ...f, score: e.target.value }))} placeholder="Enter total score" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={screeningForm.notes} onChange={e => setScreeningForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional clinical notes..." />
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => setShowNewScreening(false)}>Cancel</button>
              <button
                className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#635bff" }}
                onClick={handleCreateScreening}
                disabled={screeningLoading}
              >
                {screeningLoading ? "Saving..." : "Save Screening"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Create Coupon Modal ─────────────────────────────────────────── */}
      {showNewCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Create coupon</h3>
              <p className="text-sm text-slate-500 mt-0.5">Create a discount coupon for membership plans.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Coupon Code *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase" value={couponForm.code} onChange={e => setCouponForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. WELCOME20" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={couponForm.description} onChange={e => setCouponForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. 20% off first month" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Discount Type *</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={couponForm.discountType} onChange={e => setCouponForm(f => ({ ...f, discountType: e.target.value as "percent" | "amount" | "free_months" }))}>
                    <option value="percent">Percentage Off</option>
                    <option value="amount">Fixed Amount Off</option>
                    <option value="free_months">Free Month(s)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Discount Value *</label>
                  <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={couponForm.discountValue} onChange={e => setCouponForm(f => ({ ...f, discountValue: e.target.value }))} placeholder={couponForm.discountType === "percent" ? "e.g. 20" : couponForm.discountType === "amount" ? "e.g. 50" : "e.g. 1"} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Max Uses</label>
                  <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={couponForm.maxUses} onChange={e => setCouponForm(f => ({ ...f, maxUses: e.target.value }))} placeholder="Unlimited" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Valid Until</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={couponForm.validUntil} onChange={e => setCouponForm(f => ({ ...f, validUntil: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => setShowNewCoupon(false)}>Cancel</button>
              <button
                className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#635bff" }}
                onClick={handleCreateCoupon}
                disabled={couponLoading}
              >
                {couponLoading ? "Creating..." : "Create Coupon"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Provider Modal ──────────────────────────────────────────── */}
      {showAddProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Add provider</h3>
              <p className="text-sm text-slate-500 mt-0.5">Onboard a new clinician to your practice.</p>
            </div>
            <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={providerForm.firstName} onChange={e => setProviderForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={providerForm.lastName} onChange={e => setProviderForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Credentials</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={providerForm.credentials} onChange={e => setProviderForm(f => ({ ...f, credentials: e.target.value }))} placeholder="e.g. MD, DNP, NP" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Specialty</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={providerForm.specialty} onChange={e => setProviderForm(f => ({ ...f, specialty: e.target.value }))} placeholder="e.g. Family Medicine" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">NPI Number</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                    value={providerForm.npiNumber}
                    onChange={e => setProviderForm(f => ({ ...f, npiNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    placeholder="10-digit NPI"
                    maxLength={10}
                  />
                  <button
                    type="button"
                    onClick={() => lookupNpiAndFill(providerForm.npiNumber, "add")}
                    disabled={providerForm.npiNumber.length !== 10 || npiLookupLoading}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {npiLookupLoading ? "..." : "Lookup"}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                  <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm" value={providerForm.email} onChange={e => setProviderForm(f => ({ ...f, email: e.target.value }))} placeholder="provider@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input type="tel" className="w-full border rounded-lg px-3 py-2 text-sm" value={providerForm.phone} onChange={e => setProviderForm(f => ({ ...f, phone: e.target.value }))} placeholder="(407) 555-1234" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={providerForm.telehealth} onChange={e => setProviderForm(f => ({ ...f, telehealth: e.target.checked }))} className="accent-teal-600" />
                  <span className="text-sm text-slate-700">Telehealth enabled</span>
                </label>
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => setShowAddProvider(false)}>Cancel</button>
              <button
                className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#635bff" }}
                onClick={handleAddProvider}
                disabled={addProviderLoading}
              >
                {addProviderLoading ? "Adding..." : "Add Provider"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Provider Modal ─────────────────────────────────────────── */}
      {showEditProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Edit provider</h3>
              <p className="text-sm text-slate-500 mt-0.5">Update provider information.</p>
            </div>
            <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={editProviderForm.firstName} onChange={e => setEditProviderForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={editProviderForm.lastName} onChange={e => setEditProviderForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Credentials</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={editProviderForm.credentials} onChange={e => setEditProviderForm(f => ({ ...f, credentials: e.target.value }))} placeholder="e.g. MD, DNP, NP" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Specialty</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={editProviderForm.specialty} onChange={e => setEditProviderForm(f => ({ ...f, specialty: e.target.value }))} placeholder="e.g. Family Medicine" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">NPI Number</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                    value={editProviderForm.npiNumber}
                    onChange={e => setEditProviderForm(f => ({ ...f, npiNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    placeholder="10-digit NPI"
                    maxLength={10}
                  />
                  <button
                    type="button"
                    onClick={() => lookupNpiAndFill(editProviderForm.npiNumber, "edit")}
                    disabled={editProviderForm.npiNumber.length !== 10 || npiLookupLoading}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {npiLookupLoading ? "..." : "Lookup"}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm" value={editProviderForm.email} onChange={e => setEditProviderForm(f => ({ ...f, email: e.target.value }))} placeholder="provider@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input type="tel" className="w-full border rounded-lg px-3 py-2 text-sm" value={editProviderForm.phone} onChange={e => setEditProviderForm(f => ({ ...f, phone: e.target.value }))} placeholder="(407) 555-1234" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editProviderForm.telehealth} onChange={e => setEditProviderForm(f => ({ ...f, telehealth: e.target.checked }))} className="accent-teal-600" />
                  <span className="text-sm text-slate-700">Telehealth enabled</span>
                </label>
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => { setShowEditProvider(false); setEditProviderId(null); }}>Cancel</button>
              <button
                className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#635bff" }}
                onClick={handleEditProvider}
                disabled={editProviderLoading}
              >
                {editProviderLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Invite Staff Modal ──────────────────────────────────────────── */}
      {showInviteStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Invite staff</h3>
              <p className="text-sm text-slate-500 mt-0.5">Send an invitation to a new team member.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} placeholder="Maria Garcia" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} placeholder="staff@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="Front Desk">Front Desk</option>
                  <option value="Billing Coordinator">Billing Coordinator</option>
                  <option value="Office Manager">Office Manager</option>
                  <option value="Medical Assistant">Medical Assistant</option>
                  <option value="Nurse">Nurse</option>
                </select>
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => setShowInviteStaff(false)}>Cancel</button>
              <button
                className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#635bff" }}
                onClick={handleInviteStaff}
                disabled={inviteStaffLoading}
              >
                {inviteStaffLoading ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette — Cmd+K / Ctrl+K to jump to any section. */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
        onSelect={(id) => setActiveTab(id as TabId)}
      />

      {/* Add Allergy dialog — opened from patient detail Medical tab. */}
      {selectedPatient && (
        <AddAllergyDialog
          open={allergyDialogOpen}
          onClose={() => setAllergyDialogOpen(false)}
          patientId={selectedPatient.id}
          patientName={selectedPatient.name}
          existingAllergies={(selectedPatient.allergies || []) as AllergyEntry[]}
          onSaved={(merged) => {
            // Optimistic local update so the table reflects the new
            // allergy without a full reload. loadPracticeData() in the
            // background re-syncs from the API.
            setSelectedPatient({ ...selectedPatient, allergies: merged });
            loadPracticeData();
            setToast({ message: "Allergy added.", type: "success" });
          }}
        />
      )}

      {/* Add Measure (PHQ-9, GAD-7, etc.) — patient detail Screenings tab. */}
      {selectedPatient && (
        <AddMeasureDialog
          open={measureDialogOpen}
          onClose={() => setMeasureDialogOpen(false)}
          patientId={selectedPatient.id}
          patientName={selectedPatient.name}
          onSaved={() => {
            loadPracticeData();
            setToast({ message: "Screening recorded.", type: "success" });
          }}
        />
      )}

      {/* Documentation Assistant — opens from inside the SOAP editor.
          Inserts the generated draft directly into soapForm so the
          provider can edit further before saving. */}
      <AIDocumentationAssistant
        open={docAssistantOpen}
        onClose={() => setDocAssistantOpen(false)}
        onInsert={(draft) => {
          setSoapForm((f) => ({
            ...f,
            subjective: draft.subjective,
            objective: draft.objective,
            assessment: draft.assessment,
            plan: draft.plan,
          }));
          setToast({ message: "Draft inserted — review before signing.", type: "success" });
        }}
      />
    </>
  );
}
