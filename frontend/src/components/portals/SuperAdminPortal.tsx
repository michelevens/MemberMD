// ===== SuperAdmin Portal =====
// Platform admin dashboard for managing all practices (tenants) on MemberMD

import { useState, useEffect, useCallback, useMemo } from "react";
import { practiceService, adminService, auditService, apiFetch } from "../../lib/api";
import { beginImpersonation } from "../shared/ImpersonationBanner";
import { ProgramTemplatesTab } from "./ProgramTemplatesTab";
import { PlatformPlansSection } from "./superadmin/PlatformPlansSection";
import { HeaderToolbar } from "../shared/HeaderToolbar";
import { PlatformSettings } from "../settings/PlatformSettings";
import { UserSettingsDropdown } from "../shared/UserSettingsDropdown";
import { RefreshButton } from "../shared/RefreshButton";
import { useConfirm } from "../shared/ConfirmDialog";
import { CommandPalette, useCommandPaletteShortcut } from "../shared/CommandPalette";
import { formatCurrencyWhole as formatCurrency, formatNumber } from "../../lib/format";
import {
  DataTable,
  EntityId,
  FilterChips,
  MoneyAmount,
  StatusPill,
} from "../shared/stripe-ui";
import { ProfilePage } from "../profile/ProfilePage";
import {
  LayoutDashboard,
  Building2,
  Users,
  DollarSign,
  Clock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Eye,
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
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Globe,
  Hash,
  CheckCircle2,
  UserCheck,
  Star,
  ClipboardCheck,
  AlertTriangle,
  LogIn,
  MessageSquare,
  Send,
  RefreshCw,
  ExternalLink,
  Layers,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId =
  | "dashboard"
  | "practices"
  | "pending-approvals"
  | "specialties"
  | "plan-templates"
  | "platform-plans"
  | "screening-library"
  | "consent-templates"
  | "note-templates"
  | "programs"
  | "analytics"
  | "billing"
  | "support"
  | "audit-logs"
  | "settings"
  | "profile";

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
  status: "active" | "trial" | "suspended" | "pending";
  joinedAt: string;
  city: string;
  state: string;
  ownerName?: string;
  ownerEmail?: string;
  phone?: string;
  address?: string;
  website?: string;
  npi?: string;
  taxId?: string;
  tenantCode?: string;
  stripeConnectStatus?: "not_started" | "pending_onboarding" | "pending_verification" | "restricted" | "active" | "disconnected";
  stripeChargesEnabled?: boolean;
  subscriptionPlan?: string;
  trialEndsAt?: string | null;
}

interface MockPendingPractice extends MockPractice {
  ownerName: string;
  ownerEmail: string;
  submittedAt: string;
}

interface MockMember {
  id: string;
  name: string;
  plan: string;
  status: "active" | "inactive" | "pending";
  joined: string;
  lastVisit: string;
}

interface MockProvider {
  id: string;
  name: string;
  credentials: string;
  npi: string;
  panelCapacity: number;
  panelCurrent: number;
  panelStatus: "open" | "closed";
}

interface MockActivityEvent {
  id: string;
  event: string;
  timestamp: string;
  icon: React.ElementType;
  color: string;
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
  /** Inferred per row from the action verb. low | medium | high | critical. */
  riskLevel?: "low" | "medium" | "high" | "critical";
}

interface MockScreeningInstrument {
  id: string;
  name: string;
  code: string;
  fullName: string;
  category: string;
  questionCount: number;
  scoreMin: number;
  scoreMax: number;
  severities: { label: string; min: number; max: number; color: string; bg: string }[];
  specialties: string[];
  active: boolean;
  questions: string[];
  answerOptions: string[];
}

interface MockConsentTemplate {
  id: string;
  name: string;
  type: string;
  required: boolean;
  specialty: string;
  version: string;
  active: boolean;
  practiceCount: number;
  previewText: string;
}

interface MockNoteTemplate {
  id: string;
  name: string;
  specialty: string;
  noteType: string;
  status: "active" | "draft";
  sections: { key: string; label: string; fields: string[] }[];
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
      { id: "programs", label: "Programs", icon: Layers },
    ],
  },
  {
    title: "Platform",
    items: [
      { id: "analytics", label: "Analytics", icon: BarChart3 },
      { id: "platform-plans", label: "Platform Plans", icon: Layers },
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

const MOCK_PENDING_PRACTICES: MockPendingPractice[] = [
  {
    id: "p1", name: "Tranquil Mind Psychiatry", specialty: "Psychiatry", model: "Hybrid DPC",
    providers: 2, members: 0, mrr: 0, status: "pending", joinedAt: "2026-03-16",
    city: "Seattle", state: "WA", ownerName: "Dr. Lisa Chen", ownerEmail: "l.chen@tranquilmind.com",
    submittedAt: "2 days ago", phone: "(206) 555-0142", address: "4521 Aurora Ave N",
    website: "tranquilmindpsych.com", npi: "1234567890", taxId: "91-1234567", tenantCode: "TM82A1",
  },
  {
    id: "p2", name: "Sunrise Pediatrics", specialty: "Pediatrics", model: "Pure DPC",
    providers: 3, members: 0, mrr: 0, status: "pending", joinedAt: "2026-03-17",
    city: "San Diego", state: "CA", ownerName: "Dr. Robert Kim", ownerEmail: "r.kim@sunrisepeds.com",
    submittedAt: "1 day ago", phone: "(619) 555-0198", address: "7890 La Jolla Village Dr",
    website: "sunrisepediatrics.com", npi: "2345678901", taxId: "95-2345678", tenantCode: "SP47B3",
  },
  {
    id: "p3", name: "Metro Cardiology Associates", specialty: "Cardiology", model: "Membership Add-on",
    providers: 4, members: 0, mrr: 0, status: "pending", joinedAt: "2026-03-18",
    city: "Houston", state: "TX", ownerName: "Dr. Ahmed Patel", ownerEmail: "a.patel@metrocardio.com",
    submittedAt: "3 hours ago", phone: "(713) 555-0276", address: "1200 Binz St Suite 400",
    website: "metrocardiology.com", npi: "3456789012", taxId: "76-3456789", tenantCode: "MC19D5",
  },
];

// ─── Screening Instruments Mock Data ────────────────────────────────────────

const MOCK_SCREENINGS: MockScreeningInstrument[] = [
  {
    id: "s1",
    name: "PHQ-9",
    code: "phq9",
    fullName: "Patient Health Questionnaire-9",
    category: "Depression",
    questionCount: 9,
    scoreMin: 0,
    scoreMax: 27,
    severities: [
      { label: "Minimal", min: 0, max: 4, color: "#2f8132", bg: "#ecf9ec" },
      { label: "Mild", min: 5, max: 9, color: "#d97706", bg: "#fffbeb" },
      { label: "Moderate", min: 10, max: 14, color: "#ea580c", bg: "#fff7ed" },
      { label: "Moderately Severe", min: 15, max: 19, color: "#dc2626", bg: "#fef2f2" },
      { label: "Severe", min: 20, max: 27, color: "#7f1d1d", bg: "#fce4e4" },
    ],
    specialties: ["Psychiatry", "Primary Care", "Family Medicine", "Internal Medicine", "OB/GYN", "Concierge Medicine", "Pain Management", "Addiction Medicine", "Neurology"],
    active: true,
    questions: [
      "Little interest or pleasure in doing things",
      "Feeling down, depressed, or hopeless",
      "Trouble falling or staying asleep, or sleeping too much",
      "Feeling tired or having little energy",
      "Poor appetite or overeating",
      "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
      "Trouble concentrating on things",
      "Moving or speaking so slowly that other people could have noticed, or being fidgety/restless",
      "Thoughts that you would be better off dead, or of hurting yourself",
    ],
    answerOptions: ["Not at all (0)", "Several days (1)", "More than half the days (2)", "Nearly every day (3)"],
  },
  {
    id: "s2",
    name: "GAD-7",
    code: "gad7",
    fullName: "Generalized Anxiety Disorder-7",
    category: "Anxiety",
    questionCount: 7,
    scoreMin: 0,
    scoreMax: 21,
    severities: [
      { label: "Minimal", min: 0, max: 4, color: "#2f8132", bg: "#ecf9ec" },
      { label: "Mild", min: 5, max: 9, color: "#d97706", bg: "#fffbeb" },
      { label: "Moderate", min: 10, max: 14, color: "#ea580c", bg: "#fff7ed" },
      { label: "Severe", min: 15, max: 21, color: "#dc2626", bg: "#fef2f2" },
    ],
    specialties: ["Psychiatry", "Primary Care", "Family Medicine", "Concierge Medicine", "Addiction Medicine"],
    active: true,
    questions: [
      "Feeling nervous, anxious, or on edge",
      "Not being able to stop or control worrying",
      "Worrying too much about different things",
      "Trouble relaxing",
      "Being so restless that it is hard to sit still",
      "Becoming easily annoyed or irritable",
      "Feeling afraid, as if something awful might happen",
    ],
    answerOptions: ["Not at all (0)", "Several days (1)", "More than half the days (2)", "Nearly every day (3)"],
  },
  {
    id: "s3",
    name: "ASRS v1.1",
    code: "asrs",
    fullName: "Adult ADHD Self-Report Scale",
    category: "ADHD",
    questionCount: 6,
    scoreMin: 0,
    scoreMax: 24,
    severities: [
      { label: "Unlikely", min: 0, max: 13, color: "#2f8132", bg: "#ecf9ec" },
      { label: "Possible", min: 14, max: 17, color: "#d97706", bg: "#fffbeb" },
      { label: "Likely", min: 18, max: 24, color: "#dc2626", bg: "#fef2f2" },
    ],
    specialties: ["Psychiatry"],
    active: true,
    questions: [
      "How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?",
      "How often do you have difficulty getting things in order when you have to do a task that requires organization?",
      "How often do you have problems remembering appointments or obligations?",
      "When you have a task that requires a lot of thought, how often do you avoid or delay getting started?",
      "How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?",
      "How often do you feel overly active and compelled to do things, like you were driven by a motor?",
    ],
    answerOptions: ["Never (0)", "Rarely (1)", "Sometimes (2)", "Often (3)", "Very Often (4)"],
  },
  {
    id: "s4",
    name: "AUDIT-C",
    code: "auditc",
    fullName: "Alcohol Use Disorders Identification Test",
    category: "Alcohol Use",
    questionCount: 3,
    scoreMin: 0,
    scoreMax: 12,
    severities: [
      { label: "Low Risk", min: 0, max: 2, color: "#2f8132", bg: "#ecf9ec" },
      { label: "Moderate Risk", min: 3, max: 7, color: "#d97706", bg: "#fffbeb" },
      { label: "High Risk", min: 8, max: 12, color: "#dc2626", bg: "#fef2f2" },
    ],
    specialties: ["Psychiatry", "Addiction Medicine"],
    active: true,
    questions: [
      "How often do you have a drink containing alcohol?",
      "How many drinks containing alcohol do you have on a typical day when you are drinking?",
      "How often do you have 6 or more drinks on one occasion?",
    ],
    answerOptions: ["Never (0)", "Monthly or less (1)", "2-4 times a month (2)", "2-3 times a week (3)", "4+ times a week (4)"],
  },
  {
    id: "s5",
    name: "PCL-5",
    code: "pcl5",
    fullName: "PTSD Checklist (abbreviated)",
    category: "PTSD / Trauma",
    questionCount: 5,
    scoreMin: 0,
    scoreMax: 20,
    severities: [
      { label: "Minimal", min: 0, max: 5, color: "#2f8132", bg: "#ecf9ec" },
      { label: "Mild", min: 6, max: 10, color: "#d97706", bg: "#fffbeb" },
      { label: "Moderate", min: 11, max: 15, color: "#ea580c", bg: "#fff7ed" },
      { label: "Severe", min: 16, max: 20, color: "#dc2626", bg: "#fef2f2" },
    ],
    specialties: ["Psychiatry"],
    active: true,
    questions: [
      "Repeated, disturbing, and unwanted memories of the stressful experience?",
      "Feeling very upset when something reminded you of the stressful experience?",
      "Avoiding memories, thoughts, or feelings related to the stressful experience?",
      "Having strong negative feelings such as fear, horror, anger, guilt, or shame?",
      "Being super alert or watchful or on guard?",
    ],
    answerOptions: ["Not at all (0)", "A little bit (1)", "Moderately (2)", "Quite a bit (3)", "Extremely (4)"],
  },
  {
    id: "s6",
    name: "MDQ",
    code: "mdq",
    fullName: "Mood Disorder Questionnaire",
    category: "Bipolar",
    questionCount: 13,
    scoreMin: 0,
    scoreMax: 13,
    severities: [
      { label: "Negative Screen", min: 0, max: 6, color: "#2f8132", bg: "#ecf9ec" },
      { label: "Positive Screen", min: 7, max: 13, color: "#dc2626", bg: "#fef2f2" },
    ],
    specialties: ["Psychiatry"],
    active: true,
    questions: [
      "You felt so good or hyper that other people thought you were not your normal self?",
      "You were so irritable that you shouted at people or started fights or arguments?",
      "You felt much more self-confident than usual?",
      "You got much less sleep than usual and found you didn't really miss it?",
      "You were much more talkative or spoke faster than usual?",
      "Thoughts raced through your head or you couldn't slow your mind down?",
      "You were so easily distracted by things around you that you had trouble concentrating?",
      "You had much more energy than usual?",
      "You were much more active or did many more things than usual?",
      "You were much more social or outgoing than usual?",
      "You were much more interested in sex than usual?",
      "You did things that were unusual for you or that other people might have thought were excessive?",
      "Spending money got you or your family into trouble?",
    ],
    answerOptions: ["No (0)", "Yes (1)"],
  },
  {
    id: "s7",
    name: "C-SSRS",
    code: "cssrs",
    fullName: "Columbia Suicide Severity Rating Scale",
    category: "Suicide Risk",
    questionCount: 6,
    scoreMin: 0,
    scoreMax: 6,
    severities: [
      { label: "None", min: 0, max: 0, color: "#2f8132", bg: "#ecf9ec" },
      { label: "Low", min: 1, max: 2, color: "#d97706", bg: "#fffbeb" },
      { label: "Moderate", min: 3, max: 4, color: "#ea580c", bg: "#fff7ed" },
      { label: "High", min: 5, max: 6, color: "#dc2626", bg: "#fef2f2" },
    ],
    specialties: ["Psychiatry"],
    active: true,
    questions: [
      "Have you wished you were dead or wished you could go to sleep and not wake up?",
      "Have you actually had any thoughts of killing yourself?",
      "Have you been thinking about how you might do this?",
      "Have you had these thoughts and had some intention of acting on them?",
      "Have you started to work out or worked out the details of how to kill yourself?",
      "Have you ever done anything, started to do anything, or prepared to do anything to end your life?",
    ],
    answerOptions: ["No (0)", "Yes (1)"],
  },
];

// ─── Consent Templates Mock Data ────────────────────────────────────────────

const MOCK_CONSENTS: MockConsentTemplate[] = [
  {
    id: "c1",
    name: "HIPAA Notice of Privacy Practices",
    type: "hipaa",
    required: true,
    specialty: "All",
    version: "2.1",
    active: true,
    practiceCount: 42,
    previewText: "THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.\n\nWe are required by law to maintain the privacy of your protected health information (PHI), to notify you of our legal duties and privacy practices with respect to your PHI, and to notify affected individuals following a breach of unsecured PHI. This Notice of Privacy Practices describes how we may use and disclose your PHI in accordance with all applicable law. It also describes your rights regarding how you may gain access to and control your PHI.\n\nWe reserve the right to change the terms of this Notice at any time, and to make the new Notice provisions effective for all PHI that we maintain. We will post a copy of the current Notice in our office in a visible location at all times.",
  },
  {
    id: "c2",
    name: "Consent to Treatment",
    type: "treatment",
    required: true,
    specialty: "All",
    version: "1.3",
    active: true,
    practiceCount: 42,
    previewText: "I consent to receive evaluation and treatment from the provider and authorized staff at this practice. I understand that the practice of medicine is not an exact science and I acknowledge that no guarantees have been made to me as to the results of any treatment or examination.\n\nI understand that I have the right to be informed of my diagnosis, proposed treatment plan, alternative treatments, and the risks and benefits associated with each option. I also understand I have the right to refuse treatment at any time.\n\nI voluntarily consent to treatment and authorize the provider to perform assessments, diagnostic tests, and therapeutic interventions deemed necessary in the clinical judgment of the treating provider.",
  },
  {
    id: "c3",
    name: "Telehealth Informed Consent",
    type: "telehealth",
    required: true,
    specialty: "All",
    version: "1.5",
    active: true,
    practiceCount: 42,
    previewText: "Telehealth involves the use of electronic communications to enable providers to deliver healthcare services at a distance. This includes interactive audio, video, and data communications.\n\nI understand that telehealth-based services and care may not be as complete as face-to-face services. I understand there are potential risks to this technology, including interruptions, unauthorized access, and technical difficulties. I understand that I or my provider can discontinue the telehealth visit if it is felt that the service is not adequate.\n\nI understand that my healthcare information may be shared with other individuals for scheduling and billing purposes. I have the right to withhold or withdraw my consent at any time without affecting my right to future care or treatment.",
  },
  {
    id: "c4",
    name: "Controlled Substance Agreement",
    type: "controlled_substance",
    required: false,
    specialty: "Psychiatry",
    version: "1.2",
    active: true,
    practiceCount: 11,
    previewText: "I agree to the following conditions for receiving controlled substance prescriptions from my provider:\n\n1. I will use the medication only as prescribed and will not change the dose without consulting my provider.\n2. I will not obtain controlled substances from any other provider without informing this practice.\n3. I understand that refills will require regular follow-up appointments.\n4. I agree to random drug screening if requested.\n5. I will store my medications in a secure location and will not share them with others.\n6. I understand that lost or stolen medications will not be replaced.\n7. I understand that violation of this agreement may result in tapering and discontinuation of controlled substance prescriptions.",
  },
  {
    id: "c5",
    name: "Financial Agreement",
    type: "financial",
    required: true,
    specialty: "All",
    version: "1.4",
    active: true,
    practiceCount: 42,
    previewText: "I understand that membership fees are billed on a recurring basis according to my selected plan. I authorize the practice to charge my designated payment method for all applicable fees.\n\nI understand that membership fees cover the services described in my membership plan and that additional services not included in my plan may incur separate charges. I agree to pay any outstanding balances within 30 days of billing.\n\nI understand that I may cancel my membership at any time with 30 days written notice. Refunds will be issued on a prorated basis for any prepaid, unused membership period.",
  },
  {
    id: "c6",
    name: "Communications Consent",
    type: "communications",
    required: true,
    specialty: "All",
    version: "1.1",
    active: true,
    practiceCount: 42,
    previewText: "I consent to receive communications via email, text message, and phone from this practice regarding my healthcare, appointments, test results, and general health information.\n\nI understand that email and text communications may not be encrypted and there is a risk that information could be intercepted. I accept this risk and agree to receive communications through these channels.\n\nI understand I can opt out of non-essential communications at any time by contacting the practice. I understand that essential communications regarding my care, appointments, and billing may still be sent regardless of my preferences.",
  },
];

// ─── Note Templates Mock Data ───────────────────────────────────────────────

const MOCK_NOTE_TEMPLATES: MockNoteTemplate[] = [
  {
    id: "n1",
    name: "Psychiatric Evaluation",
    specialty: "Psychiatry",
    noteType: "Initial Eval",
    status: "active",
    sections: [
      { key: "S", label: "Subjective", fields: ["Chief complaint", "History of present illness", "Past psychiatric history", "Substance use", "Social history", "Family psychiatric history"] },
      { key: "O", label: "Objective", fields: ["Mental status exam", "Appearance", "Behavior", "Speech", "Mood", "Affect", "Thought process", "Thought content", "Cognition", "Insight", "Judgment"] },
      { key: "A", label: "Assessment", fields: ["DSM-5 diagnoses", "Risk assessment", "Functional assessment"] },
      { key: "P", label: "Plan", fields: ["Medications", "Therapy recommendations", "Labs", "Follow-up", "Safety plan"] },
    ],
  },
  {
    id: "n2",
    name: "Medication Management",
    specialty: "Psychiatry",
    noteType: "Follow-Up",
    status: "active",
    sections: [
      { key: "S", label: "Subjective", fields: ["Interval history", "Medication response", "Side effects", "Adherence", "Sleep", "Appetite"] },
      { key: "O", label: "Objective", fields: ["MSE (abbreviated)", "Vital signs"] },
      { key: "A", label: "Assessment", fields: ["Treatment response", "Medication adjustments needed"] },
      { key: "P", label: "Plan", fields: ["Medication changes", "Refills", "Labs", "Next follow-up"] },
    ],
  },
  {
    id: "n3",
    name: "Therapy Progress Note",
    specialty: "Psychiatry",
    noteType: "Therapy",
    status: "active",
    sections: [
      { key: "S", label: "Subjective", fields: ["Session focus", "Patient report", "Mood/affect"] },
      { key: "O", label: "Objective", fields: ["Behavioral observations", "Therapeutic interventions used (CBT, DBT, etc.)"] },
      { key: "A", label: "Assessment", fields: ["Progress toward goals", "Treatment response"] },
      { key: "P", label: "Plan", fields: ["Homework", "Next session focus", "Referrals"] },
    ],
  },
  {
    id: "n4",
    name: "Primary Care Visit",
    specialty: "Primary Care",
    noteType: "Follow-Up",
    status: "active",
    sections: [
      { key: "S", label: "Subjective", fields: ["Chief complaint", "HPI", "ROS"] },
      { key: "O", label: "Objective", fields: ["Vitals", "Physical exam", "Labs reviewed"] },
      { key: "A", label: "Assessment", fields: ["Diagnoses", "Clinical impression"] },
      { key: "P", label: "Plan", fields: ["Medications", "Referrals", "Labs ordered", "Follow-up", "Patient education"] },
    ],
  },
  {
    id: "n5",
    name: "Wellness Exam",
    specialty: "Primary Care",
    noteType: "Initial Eval",
    status: "active",
    sections: [
      { key: "S", label: "Subjective", fields: ["Health history update", "Preventive care review", "Social determinants"] },
      { key: "O", label: "Objective", fields: ["Comprehensive physical", "Vitals", "BMI", "Screening results"] },
      { key: "A", label: "Assessment", fields: ["Risk factors", "Preventive care gaps"] },
      { key: "P", label: "Plan", fields: ["Immunizations due", "Screenings ordered", "Lifestyle counseling", "Follow-up"] },
    ],
  },
  {
    id: "n6",
    name: "Pediatric Well-Child",
    specialty: "Pediatrics",
    noteType: "Initial Eval",
    status: "active",
    sections: [
      { key: "S", label: "Subjective", fields: ["Developmental milestones", "Parental concerns", "Feeding/sleep", "School performance"] },
      { key: "O", label: "Objective", fields: ["Growth chart (height, weight, head circumference)", "Physical exam", "Developmental screening"] },
      { key: "A", label: "Assessment", fields: ["Growth assessment", "Developmental stage", "Immunization status"] },
      { key: "P", label: "Plan", fields: ["Immunizations given", "Anticipatory guidance", "Next well-child visit"] },
    ],
  },
];

// ─── Specialty Detail Mock Data ─────────────────────────────────────────────

interface SpecialtyDetail {
  practices: string[];
  screeningTools: string[];
  planTemplates: { name: string; price: number }[];
  appointmentTypes: string[];
  consentTemplates: string[];
  diagnosisFavorites: { code: string; description: string }[];
  medicationCategories: string[];
  labPanels: string[];
}

const SPECIALTY_DETAILS: Record<string, SpecialtyDetail> = {
  Psychiatry: {
    practices: ["Tranquil Mind Psychiatry", "ClearMind Behavioral Health", "Serenity Psychiatric Group", "BrightPath Mental Health", "Resilience Psychiatry", "Mindful Care Associates", "Harmony Behavioral", "Pacific Psych Group", "Summit Behavioral Health", "Lakeview Mental Health", "Eastside Psychiatry"],
    screeningTools: ["PHQ-9", "GAD-7", "ASRS v1.1", "AUDIT-C", "PCL-5", "MDQ", "C-SSRS", "CAGE-AID", "DAST-10"],
    planTemplates: [{ name: "Mental Wellness", price: 179 }, { name: "Psychiatric Complete", price: 249 }, { name: "Intensive Care", price: 349 }],
    appointmentTypes: ["Psychiatric Evaluation (60 min)", "Medication Management (30 min)", "Therapy Session (50 min)", "Crisis Intervention", "Telehealth Follow-Up (25 min)", "Group Therapy (90 min)"],
    consentTemplates: ["HIPAA Notice", "Consent to Treatment", "Telehealth Consent", "Controlled Substance Agreement", "Financial Agreement", "Communications Consent"],
    diagnosisFavorites: [
      { code: "F32.1", description: "Major depressive disorder, single episode, moderate" },
      { code: "F33.1", description: "Major depressive disorder, recurrent, moderate" },
      { code: "F41.1", description: "Generalized anxiety disorder" },
      { code: "F43.10", description: "Post-traumatic stress disorder, unspecified" },
      { code: "F31.9", description: "Bipolar disorder, unspecified" },
      { code: "F90.0", description: "ADHD, predominantly inattentive type" },
      { code: "F10.20", description: "Alcohol dependence, uncomplicated" },
      { code: "F42.2", description: "Mixed obsessional thoughts and acts" },
    ],
    medicationCategories: ["SSRIs", "SNRIs", "Atypical Antidepressants", "Benzodiazepines", "Mood Stabilizers", "Antipsychotics", "Stimulants", "Non-Stimulant ADHD", "Sleep Aids"],
    labPanels: ["CBC", "CMP", "Thyroid Panel (TSH, Free T4)", "Lithium Level", "Valproic Acid Level", "Lipid Panel", "HbA1c", "UDS (Urine Drug Screen)"],
  },
  "Primary Care": {
    practices: ["Evergreen Family Health", "Pinnacle Internal Medicine", "Coastal Primary Care", "Summit Medical Group", "Valley Health Partners"],
    screeningTools: ["PHQ-9", "GAD-7", "AUDIT-C"],
    planTemplates: [{ name: "Basic", price: 79 }, { name: "Standard", price: 149 }, { name: "Premium", price: 249 }],
    appointmentTypes: ["Annual Physical (45 min)", "Follow-Up Visit (20 min)", "Sick Visit (20 min)", "Telehealth Visit (15 min)", "Procedure Visit (30 min)", "Pre-Op Clearance (30 min)"],
    consentTemplates: ["HIPAA Notice", "Consent to Treatment", "Telehealth Consent", "Financial Agreement", "Communications Consent"],
    diagnosisFavorites: [
      { code: "I10", description: "Essential (primary) hypertension" },
      { code: "E11.9", description: "Type 2 diabetes mellitus without complications" },
      { code: "E78.5", description: "Hyperlipidemia, unspecified" },
      { code: "J06.9", description: "Acute upper respiratory infection, unspecified" },
      { code: "M54.5", description: "Low back pain" },
      { code: "J20.9", description: "Acute bronchitis, unspecified" },
      { code: "E03.9", description: "Hypothyroidism, unspecified" },
    ],
    medicationCategories: ["Antihypertensives", "Statins", "Metformin", "PPIs", "Antibiotics", "NSAIDs", "Thyroid Hormones", "ACE Inhibitors"],
    labPanels: ["CBC", "CMP", "Lipid Panel", "HbA1c", "Thyroid Panel", "Urinalysis", "Vitamin D", "Iron Studies"],
  },
  "Family Medicine": {
    practices: ["Evergreen Family Health", "Bright Horizons Family Practice", "Community Family Care"],
    screeningTools: ["PHQ-9", "GAD-7"],
    planTemplates: [{ name: "Family Essentials", price: 89 }, { name: "Family Premium", price: 149 }],
    appointmentTypes: ["Well Visit (30 min)", "Sick Visit (20 min)", "Follow-Up (15 min)", "Telehealth (15 min)"],
    consentTemplates: ["HIPAA Notice", "Consent to Treatment", "Telehealth Consent", "Financial Agreement", "Communications Consent"],
    diagnosisFavorites: [
      { code: "I10", description: "Essential hypertension" },
      { code: "J06.9", description: "Acute upper respiratory infection" },
      { code: "E11.9", description: "Type 2 diabetes" },
    ],
    medicationCategories: ["Antihypertensives", "Antibiotics", "NSAIDs", "Statins"],
    labPanels: ["CBC", "CMP", "Lipid Panel", "HbA1c"],
  },
};

// Mock plan data by specialty
function getMockPlans(specialty: string) {
  const planMap: Record<string, { name: string; price: number; visits: number; features: string[] }[]> = {
    "Psychiatry": [
      { name: "Essential", price: 99, visits: 2, features: ["Monthly check-in", "Messaging", "Rx management"] },
      { name: "Complete", price: 199, visits: 4, features: ["Weekly sessions", "Crisis support", "Rx management", "Telehealth"] },
      { name: "Premium", price: 299, visits: 8, features: ["Unlimited sessions", "24/7 crisis line", "Full Rx", "Family consults"] },
    ],
    "Primary Care": [
      { name: "Basic", price: 79, visits: 2, features: ["Bi-monthly visits", "Lab orders", "Messaging"] },
      { name: "Standard", price: 149, visits: 4, features: ["Weekly visits", "Telehealth", "Lab orders", "Messaging"] },
      { name: "Premium", price: 249, visits: 8, features: ["Unlimited visits", "Same-day appts", "Full labs", "Specialist referrals"] },
    ],
    "Family Medicine": [
      { name: "Basic", price: 79, visits: 2, features: ["Bi-monthly visits", "Lab orders", "Messaging"] },
      { name: "Standard", price: 149, visits: 4, features: ["Weekly visits", "Telehealth", "Lab orders", "Messaging"] },
      { name: "Premium", price: 249, visits: 8, features: ["Unlimited visits", "Same-day appts", "Full labs", "Specialist referrals"] },
    ],
  };
  return planMap[specialty] || [
    { name: "Standard", price: 99, visits: 3, features: ["Regular visits", "Messaging", "Telehealth"] },
    { name: "Professional", price: 179, visits: 6, features: ["Priority scheduling", "Extended visits", "Telehealth", "Messaging"] },
  ];
}

// Mock members by practice
function getMockMembers(practiceName: string, specialty: string): MockMember[] {
  if (practiceName.includes("Clearstone") || specialty === "Psychiatry") {
    return [
      { id: "m1", name: "Marcus Williams", plan: "Complete", status: "active", joined: "2026-01-15", lastVisit: "2026-03-14" },
      { id: "m2", name: "Sarah Chen", plan: "Essential", status: "active", joined: "2026-02-01", lastVisit: "2026-03-12" },
      { id: "m3", name: "James Rodriguez", plan: "Premium", status: "active", joined: "2025-11-20", lastVisit: "2026-03-16" },
      { id: "m4", name: "Emily Thompson", plan: "Complete", status: "active", joined: "2026-01-28", lastVisit: "2026-03-10" },
      { id: "m5", name: "David Park", plan: "Essential", status: "inactive", joined: "2025-10-05", lastVisit: "2026-02-18" },
      { id: "m6", name: "Rachel Green", plan: "Premium", status: "active", joined: "2026-02-14", lastVisit: "2026-03-17" },
    ];
  }
  if (practiceName.includes("BellaCare") || specialty === "Primary Care" || specialty === "Family Medicine" || specialty === "Internal Medicine") {
    return [
      { id: "m1", name: "Eleanor Patterson", plan: "Standard", status: "active", joined: "2025-09-01", lastVisit: "2026-03-15" },
      { id: "m2", name: "Harold Mitchell", plan: "Premium", status: "active", joined: "2025-08-15", lastVisit: "2026-03-12" },
      { id: "m3", name: "Dorothy Lewis", plan: "Basic", status: "active", joined: "2025-10-20", lastVisit: "2026-03-08" },
      { id: "m4", name: "Walter Johnson", plan: "Standard", status: "active", joined: "2025-11-05", lastVisit: "2026-03-16" },
      { id: "m5", name: "Betty Anderson", plan: "Premium", status: "active", joined: "2025-12-01", lastVisit: "2026-03-14" },
      { id: "m6", name: "Frank Morrison", plan: "Basic", status: "inactive", joined: "2025-07-10", lastVisit: "2026-01-20" },
      { id: "m7", name: "Margaret Clark", plan: "Standard", status: "active", joined: "2026-01-10", lastVisit: "2026-03-17" },
      { id: "m8", name: "George Turner", plan: "Premium", status: "pending", joined: "2026-03-10", lastVisit: "-" },
    ];
  }
  // For other specialties, return fewer or empty
  if (specialty === "Pediatrics" || specialty === "Cardiology" || specialty === "Orthopedics" || specialty === "OB/GYN") {
    return [
      { id: "m1", name: "Patient Alpha", plan: "Standard", status: "active", joined: "2026-01-05", lastVisit: "2026-03-10" },
      { id: "m2", name: "Patient Beta", plan: "Professional", status: "active", joined: "2026-02-12", lastVisit: "2026-03-15" },
      { id: "m3", name: "Patient Gamma", plan: "Standard", status: "pending", joined: "2026-03-01", lastVisit: "-" },
    ];
  }
  return [];
}

function getMockProviders(practiceName: string, count: number): MockProvider[] {
  const providerPool: MockProvider[] = [
    { id: "pr1", name: "Dr. Sarah Mitchell", credentials: "MD, FACP", npi: "1122334455", panelCapacity: 250, panelCurrent: 180, panelStatus: "open" },
    { id: "pr2", name: "Dr. James Foster", credentials: "DO", npi: "2233445566", panelCapacity: 200, panelCurrent: 195, panelStatus: "closed" },
    { id: "pr3", name: "Dr. Maria Santos", credentials: "MD, PhD", npi: "3344556677", panelCapacity: 300, panelCurrent: 120, panelStatus: "open" },
    { id: "pr4", name: "Dr. Kevin O'Brien", credentials: "MD", npi: "4455667788", panelCapacity: 150, panelCurrent: 88, panelStatus: "open" },
    { id: "pr5", name: "NP Jennifer Wu", credentials: "APRN, FNP-C", npi: "5566778899", panelCapacity: 180, panelCurrent: 162, panelStatus: "open" },
    { id: "pr6", name: "PA Robert Chang", credentials: "PA-C", npi: "6677889900", panelCapacity: 160, panelCurrent: 155, panelStatus: "closed" },
  ];
  void practiceName;
  return providerPool.slice(0, Math.min(count || 2, providerPool.length));
}

function getMockActivity(practiceName: string): MockActivityEvent[] {
  return [
    { id: "a1", event: `${practiceName} registered on platform`, timestamp: "Mar 15, 2026", icon: Building2, color: "#27ab83" },
    { id: "a2", event: "Owner completed profile setup", timestamp: "Mar 15, 2026", icon: UserCheck, color: "#0369a1" },
    { id: "a3", event: "First membership plan created", timestamp: "Mar 16, 2026", icon: FileText, color: "#7c3aed" },
    { id: "a4", event: "Provider added to practice", timestamp: "Mar 16, 2026", icon: Stethoscope, color: "#147d64" },
    { id: "a5", event: "First member enrolled", timestamp: "Mar 17, 2026", icon: Users, color: "#d97706" },
    { id: "a6", event: "Practice approved by admin", timestamp: "Mar 17, 2026", icon: CheckCircle2, color: "#2f8132" },
  ];
}

function MemberStatusBadge({ status }: { status: "active" | "inactive" | "pending" }) {
  const config = {
    active: { label: "Active", bg: "#ecf9ec", color: "#2f8132" },
    inactive: { label: "Inactive", bg: "#f1f5f9", color: "#64748b" },
    pending: { label: "Pending", bg: "#fffbeb", color: "#d97706" },
  };
  const c = config[status];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: c.bg, color: c.color }}>
      {c.label}
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    Essential: { bg: "#e0f2fe", color: "#0369a1" },
    Complete: { bg: "#e6f7f2", color: "#147d64" },
    Premium: { bg: "#f3e8ff", color: "#7c3aed" },
    Basic: { bg: "#f1f5f9", color: "#475569" },
    Standard: { bg: "#e0f2fe", color: "#0369a1" },
    Professional: { bg: "#e6f7f2", color: "#147d64" },
  };
  const c = colors[plan] || { bg: "#f1f5f9", color: "#475569" };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: c.bg, color: c.color }}>
      {plan}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// formatCurrency + formatNumber consolidated to lib/format.ts
// (refactor 2026-05-04). Whole-dollar variant for high-level metrics.

function StatusBadge({ status }: { status: "active" | "trial" | "suspended" | "pending" }) {
  const config = {
    active: { label: "Active", bg: "#ecf9ec", color: "#2f8132", border: "#3f9142" },
    trial: { label: "Trial", bg: "#e0f2fe", color: "#0369a1", border: "#38bdf8" },
    suspended: { label: "Suspended", bg: "#fef2f2", color: "#dc2626", border: "#ef4444" },
    pending: { label: "Pending", bg: "#fffbeb", color: "#d97706", border: "#f59e0b" },
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

function PayoutBadge({
  status,
  chargesEnabled,
}: {
  status?: "not_started" | "pending_onboarding" | "pending_verification" | "restricted" | "active" | "disconnected";
  chargesEnabled?: boolean;
}) {
  // Treat undefined status as not_started so legacy practices render predictably
  const s = status ?? "not_started";
  const config: Record<string, { label: string; bg: string; color: string }> = {
    active: { label: "Active", bg: "#ecf9ec", color: "#2f8132" },
    pending_verification: { label: "Verifying", bg: "#fffbeb", color: "#d97706" },
    pending_onboarding: { label: "Onboarding", bg: "#fffbeb", color: "#d97706" },
    restricted: { label: "Restricted", bg: "#fef2f2", color: "#dc2626" },
    disconnected: { label: "Disconnected", bg: "#f1f5f9", color: "#64748b" },
    not_started: { label: "Not set up", bg: "#f1f5f9", color: "#64748b" },
  };
  // If charges aren't enabled but status claims active, show as restricted instead
  const effective = s === "active" && chargesEnabled === false ? "restricted" : s;
  const c = config[effective];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.color }}
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function SuperAdminPortal() {
  const isDemoMode = import.meta.env.VITE_DEMO_MODE !== "false";
  const confirm = useConfirm();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteShortcut(() => setPaletteOpen(true));

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [practiceSearch, setPracticeSearch] = useState("");
  // Stripe-style practices view: filter chips alongside the search box.
  const [practiceFilters, setPracticeFilters] = useState<import("../shared/stripe-ui").ActiveFilter[]>([]);
  const [apiPractices, setApiPractices] = useState<MockPractice[] | null>(null);
  const [apiStats, setApiStats] = useState<Record<string, number> | null>(null);
  const [selectedPractice, setSelectedPractice] = useState<MockPractice | null>(null);
  // Detail payload fetched when a practice row is opened. Shape:
  //   { plans, members, providers, activity }
  // Each is null until loaded; the detail renderer falls back to
  // mock data while loading or if the API errors out (demo mode).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [practiceDetail, setPracticeDetail] = useState<any>(null);
  // Tier 2: tenant summary KPIs + internal notes — both superadmin-only.
  const [tenantSummary, setTenantSummary] = useState<{
    lifetimeRevenue: number;
    invoiceCount: number;
    activeMembershipCount: number;
    userCountsByRole: Record<string, number>;
  } | null>(null);
  const [internalNotes, setInternalNotes] = useState<Array<{
    id: string;
    body: string;
    category: string;
    createdAt: string;
    author: { id: string; name: string; email: string } | null;
  }>>([]);
  const [internalNoteDraft, setInternalNoteDraft] = useState("");
  const [internalNoteCategory, setInternalNoteCategory] = useState<"general" | "billing" | "support" | "risk">("general");
  const [internalNoteSaving, setInternalNoteSaving] = useState(false);
  const [pendingPractices, setPendingPractices] = useState<MockPendingPractice[]>(isDemoMode ? MOCK_PENDING_PRACTICES : []);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [expandedScreening, setExpandedScreening] = useState<string | null>(null);
  const [expandedConsent, setExpandedConsent] = useState<string | null>(null);
  const [screeningCategoryFilter, setScreeningCategoryFilter] = useState<string>("All");
  const [consentFilter, setConsentFilter] = useState<string>("All");
  const [noteSpecialtyFilter, setNoteSpecialtyFilter] = useState<string>("All");
  const [selectedSpecialtyDetail, setSelectedSpecialtyDetail] = useState<MockSpecialty | null>(null);
  const [supportFilter, setSupportFilter] = useState<string>("All");
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [apiSpecialties, setApiSpecialties] = useState<MockSpecialty[] | null>(null);
  const [apiScreenings, setApiScreenings] = useState<MockScreeningInstrument[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiConsents, setApiConsents] = useState<any[] | null>(null);
  const [apiAuditLogs, setApiAuditLogs] = useState<MockAuditLog[] | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  // ─── Fetch real data from API ─────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setAdminLoading(true);
    try {
      const results = await Promise.allSettled([
        practiceService.list(),
        adminService.getStats(),
        adminService.getSpecialties(),
        adminService.getScreenings(),
        adminService.getConsents(),
        auditService.list(),
        apiFetch<unknown[]>("/admin/practices/pending"),
      ]);

      // Practices
      if (results[0].status === "fulfilled") {
        const practicesRes = results[0].value;
        if (practicesRes.data && Array.isArray(practicesRes.data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setApiPractices(practicesRes.data.map((p: any) => {
            // subscription_status drives the displayed lifecycle state.
            // Map it to the UI's narrower 4-state enum so badges + buttons
            // resolve correctly.
            const ss = (p.subscriptionStatus || p.subscription_status || "").toLowerCase();
            let status: "active" | "trial" | "suspended" | "pending";
            if (ss === "pending_approval") status = "pending";
            else if (ss === "suspended" || ss === "rejected") status = "suspended";
            else if (ss === "trial") status = "trial";
            else status = (p.isActive || p.is_active) ? "active" : "suspended";

            return {
              id: p.id || "",
              name: p.name || "",
              specialty: p.specialty || "",
              model: p.practiceModel || p.practice_model || "",
              // Keep city + state in their own fields so the detail page
              // can render them independently. The list table joins them
              // for display via [city, state].filter(Boolean).join(", ").
              city: p.city || "",
              state: p.state || "",
              providers: p.providerCount || p.providers_count || 0,
              members: p.memberCount || p.member_count || p.patients_count || 0,
              mrr: 0,
              status,
              joinedAt: p.createdAt || p.created_at || "",
              subscriptionPlan: p.subscriptionPlan || p.subscription_plan || "trial",
              trialEndsAt: p.trialEndsAt || p.trial_ends_at || null,
              stripeConnectStatus: (p.stripeConnectStatus || p.stripe_connect_status || undefined) as MockPractice["stripeConnectStatus"],
              stripeChargesEnabled: Boolean(p.stripeChargesEnabled || p.stripe_charges_enabled),
              // Detail-only fields the previous mapper dropped, which
              // forced the detail page to render bogus "(555) 000-0000"
              // and "123 Main St" placeholders. Real values now flow
              // through.
              phone: p.phone || "",
              address: p.address || "",
              website: p.website || "",
              npi: p.npi || "",
              taxId: p.taxId || p.tax_id || "",
              tenantCode: p.tenantCode || p.tenant_code || "",
              ownerEmail: p.ownerEmail || p.owner_email || "",
              ownerName: p.ownerName || p.owner_name || "",
            };
          }));
        }
      }

      // Stats
      if (results[1].status === "fulfilled") {
        const statsRes = results[1].value;
        if (statsRes.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setApiStats(statsRes.data as any);
        }
      }

      // Specialties
      if (results[2].status === "fulfilled") {
        const specialtiesRes = results[2].value;
        if (specialtiesRes.data && Array.isArray(specialtiesRes.data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setApiSpecialties(specialtiesRes.data.map((s: any) => ({
            id: s.id || "",
            name: s.name || "",
            code: s.code || s.abbreviation || "",
            icon: Heart,
            practiceCount: s.practiceCount ?? s.practice_count ?? 0,
            screeningTools: s.screeningTools ?? s.screening_tools ?? 0,
            category: s.category || "Specialty",
          })));
        }
      }

      // Screenings
      if (results[3].status === "fulfilled") {
        const screeningsRes = results[3].value;
        if (screeningsRes.data && Array.isArray(screeningsRes.data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setApiScreenings(screeningsRes.data.map((s: any) => ({
            id: s.id || "",
            name: s.name || s.title || "",
            code: s.code || s.abbreviation || "",
            fullName: s.fullName || s.full_name || s.description || s.name || "",
            category: s.category || "General",
            questionCount: s.questionCount ?? s.question_count ?? (s.questions?.length || 0),
            scoreMin: s.scoreMin ?? s.score_min ?? 0,
            scoreMax: s.scoreMax ?? s.score_max ?? 0,
            severities: s.severities || [],
            specialties: s.specialties || [],
            active: s.active ?? s.isActive ?? true,
            questions: s.questions || [],
            answerOptions: s.answerOptions || s.answer_options || [],
          })));
        }
      }

      // Consents
      if (results[4].status === "fulfilled") {
        const consentsRes = results[4].value;
        if (consentsRes.data && Array.isArray(consentsRes.data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setApiConsents(consentsRes.data.map((c: any) => ({
            id: c.id || "",
            name: c.name || c.title || "",
            type: c.type || c.consentType || "General",
            required: c.required ?? c.isRequired ?? false,
            specialty: c.specialty || "All",
            version: c.version || "1.0",
            active: c.active ?? c.isActive ?? true,
            practiceCount: c.practiceCount ?? c.practice_count ?? 0,
            previewText: c.previewText || c.description || c.body || "",
          })));
        }
      }

      // Audit Logs
      if (results[5].status === "fulfilled") {
        const auditRes = results[5].value;
        if (auditRes.data && Array.isArray(auditRes.data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setApiAuditLogs(auditRes.data.map((l: any) => ({
            id: l.id || "",
            timestamp: l.timestamp || l.createdAt || l.created_at || "",
            user: l.user || l.userName || l.user_name || l.causer || "system",
            action: l.action || l.event || "",
            resource: l.resource || l.subject || l.description || "",
            ipAddress: l.ipAddress || l.ip_address || l.ip || "",
            riskLevel: l.riskLevel || l.risk_level || undefined,
          })));
        }
      }

      // Pending approvals — practices in 'pending_approval' state.
      // Real applications from /auth/register populate this list; the
      // mock fallback only fires in demo mode so live super-admin sees
      // an honest empty state when there's nothing to review.
      if (results[6].status === "fulfilled") {
        const pendingRes = results[6].value;
        if (pendingRes.data && Array.isArray(pendingRes.data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setPendingPractices(pendingRes.data.map((p: any) => ({
            id: p.id || "",
            name: p.name || "",
            specialty: p.specialty || "",
            ownerName: p.applicant?.name || "—",
            ownerEmail: p.applicant?.email || p.email || "",
            submittedAt: p.submittedAt
              ? new Date(p.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "",
            // Carry the full row so the detail drawer / approve flow has
            // address + phone + practice_model without a second fetch.
            city: p.city || "",
            state: p.state || "",
            phone: p.phone || "",
            website: p.website || "",
            practiceModel: p.practiceModel || p.practice_model || "",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          })) as any);
        }
      }
    } catch {
      // Fall back to mock data on unexpected errors
    }
    setAdminLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch platform-wide mail health on dashboard mount. apiFetch
  // unwraps the {data: ...} envelope; failure is silent (the card
  // just doesn't render — the rest of the dashboard still works).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{
          status: "ok" | "warning" | "not_configured";
          driver: string;
          configured: boolean;
          appEnv: string;
          fromAddress: string;
          fromName: string;
          missingEnvVars: string[];
          sentLast7d: number;
          failedLast7d: number;
          successRate: number | null;
        }>("/admin/system/mail-health");
        if (!cancelled && res.data) setMailHealth(res.data);
      } catch { /* non-blocking */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load full detail (plans, members, providers, activity) whenever a
  // practice row is opened. Without this the detail page renders mocks.
  useEffect(() => {
    if (!selectedPractice) {
      setPracticeDetail(null);
      setTenantSummary(null);
      setInternalNotes([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await adminService.getPractice(selectedPractice.id);
        if (cancelled) return;
        const data = r.data as Record<string, unknown> | undefined;
        if (data && (data.plans || data.members || data.providers)) {
          setPracticeDetail(data);
        }
      } catch {
        // Keep null — detail renderer falls back to mocks gracefully.
      }

      // Tenant summary KPIs (lifetime revenue + invoice count + active
      // memberships + per-role user counts) are superadmin-only and
      // come from a dedicated endpoint so they're not mixed with the
      // tenant-portal detail payload.
      try {
        const sr = await apiFetch<{ lifetimeRevenue: number; invoiceCount: number; activeMembershipCount: number; userCountsByRole: Record<string, number> }>(`/admin/practices/${selectedPractice.id}/summary`);
        if (!cancelled && sr.data) setTenantSummary(sr.data);
      } catch {
        // non-fatal — KPI tiles fall back to existing fields
      }

      // Internal notes (private superadmin annotations).
      try {
        const nr = await apiFetch<typeof internalNotes>(`/admin/practices/${selectedPractice.id}/notes`);
        if (!cancelled && Array.isArray(nr.data)) setInternalNotes(nr.data);
      } catch {
        // non-fatal — empty notes panel
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPractice]);

  // Tenant-scoped audit logs — separate from the platform audit list
  // on the SuperAdmin Audit tab so opening a practice doesn't blow
  // away that filter state.
  const [tenantAuditLogs, setTenantAuditLogs] = useState<MockAuditLog[]>([]);
  const [tenantAuditLoading, setTenantAuditLoading] = useState(false);
  const [tenantAuditSearch, setTenantAuditSearch] = useState("");

  // Tier 4: email deliverability KPI + per-row retry-in-flight tracking.
  const [emailDeliv, setEmailDeliv] = useState<{
    sentLast7d: number;
    failedLast7d: number;
    totalLast7d: number;
    successRate: number | null;
    latestFailures: Array<{ id: string; recipient: string; mailable: string; context: string | null; errorMessage: string | null; createdAt: string }>;
  } | null>(null);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null);

  // Tier 3: integration health + pending-action signals scoped to one
  // tenant. Render only when the selected practice is open.
  const [webhookHealth, setWebhookHealth] = useState<{
    endpointCount: number;
    enabledCount: number;
    failingCount: number;
    deliveredLast24h: number;
    failedLast24h: number;
    successRate: number | null;
    latestFailure: { id: string; eventType: string; responseStatus: number | null; errorMessage: string | null; attemptedAt: string } | null;
  } | null>(null);
  const [pendingActions, setPendingActions] = useState<Array<{
    severity: "critical" | "warning" | "info";
    kind: string;
    message: string;
    count?: number;
  }>>([]);

  // Platform-wide mail health, surfaced on the dashboard so SuperAdmin
  // can see at a glance whether transactional email is wired up at all
  // before chasing per-tenant deliverability.
  const [mailHealth, setMailHealth] = useState<{
    status: "ok" | "warning" | "not_configured";
    driver: string;
    configured: boolean;
    appEnv: string;
    fromAddress: string;
    fromName: string;
    missingEnvVars: string[];
    sentLast7d: number;
    failedLast7d: number;
    successRate: number | null;
  } | null>(null);

  type BillingReadiness = {
    billingEnforced: boolean;
    connect: {
      ready: boolean;
      status: string | null;
      accountId: string | null;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      detailsSubmitted: boolean;
      disabledReason: string | null;
    };
    plans: {
      totalActive: number;
      withMonthlyPrice: number;
      missingPrices: Array<{ id: string; name: string; monthlyPrice: number | string | null }>;
    };
    memberships: {
      activeStripe: number;
      activeComped: number;
      activeManual: number;
    };
    recommendation: "connect_onboarding" | "create_plans" | "wire_plan_prices" | "wire_remaining_plan_prices" | "ready_to_flip" | "live";
  };
  const [billingReadiness, setBillingReadiness] = useState<BillingReadiness | null>(null);
  const [billingFlipping, setBillingFlipping] = useState(false);
  const [billingMessage, setBillingMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!selectedPractice) {
      setWebhookHealth(null);
      setPendingActions([]);
      setEmailDeliv(null);
      setBillingReadiness(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch<{
          endpointCount: number;
          enabledCount: number;
          failingCount: number;
          deliveredLast24h: number;
          failedLast24h: number;
          successRate: number | null;
          latestFailure: { id: string; eventType: string; responseStatus: number | null; errorMessage: string | null; attemptedAt: string } | null;
        }>(`/admin/practices/${selectedPractice.id}/webhook-health`);
        if (!cancelled && r.data) setWebhookHealth(r.data);
      } catch {
        // non-fatal — card just doesn't render
      }
      try {
        const r = await apiFetch<{ signals: Array<{ severity: "critical" | "warning" | "info"; kind: string; message: string; count?: number }>; count: number }>(`/admin/practices/${selectedPractice.id}/pending-actions`);
        if (!cancelled && r.data?.signals) setPendingActions(r.data.signals);
      } catch {
        // non-fatal — banner just doesn't render
      }
      try {
        const r = await apiFetch<{
          sentLast7d: number;
          failedLast7d: number;
          totalLast7d: number;
          successRate: number | null;
          latestFailures: Array<{ id: string; recipient: string; mailable: string; context: string | null; errorMessage: string | null; createdAt: string }>;
        }>(`/admin/practices/${selectedPractice.id}/email-deliverability`);
        if (!cancelled && r.data) setEmailDeliv(r.data);
      } catch {
        // non-fatal — card just doesn't render
      }
      try {
        const r = await apiFetch<BillingReadiness>(`/admin/practices/${selectedPractice.id}/billing-readiness`);
        if (!cancelled && r.data) setBillingReadiness(r.data);
      } catch {
        // non-fatal — card just doesn't render
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPractice]);

  useEffect(() => {
    if (!selectedPractice) {
      setTenantAuditLogs([]);
      return;
    }
    let cancelled = false;
    setTenantAuditLoading(true);
    (async () => {
      try {
        const r = await auditService.list({ tenant_id: selectedPractice.id, per_page: "100" } as Record<string, string>);
        if (cancelled) return;
        if (r.data && Array.isArray(r.data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setTenantAuditLogs((r.data as any[]).map((l: any) => ({
            id: l.id || "",
            timestamp: l.timestamp || l.createdAt || l.created_at || "",
            user: l.user || l.userName || l.user_name || l.causer || "system",
            action: l.action || l.event || "",
            resource: l.resource || l.subject || l.description || "",
            ipAddress: l.ipAddress || l.ip_address || l.ip || "",
            riskLevel: l.riskLevel || l.risk_level || undefined,
          })));
        } else {
          setTenantAuditLogs([]);
        }
      } catch {
        setTenantAuditLogs([]);
      }
      if (!cancelled) setTenantAuditLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedPractice]);

  const submitInternalNote = async () => {
    if (!selectedPractice || !internalNoteDraft.trim()) return;
    setInternalNoteSaving(true);
    const r = await apiFetch<typeof internalNotes[number]>(`/admin/practices/${selectedPractice.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: internalNoteDraft.trim(), category: internalNoteCategory }),
    });
    setInternalNoteSaving(false);
    if (r.error || !r.data) {
      setApprovalMessage(`Could not save note: ${r.error ?? "unknown error"}`);
      return;
    }
    setInternalNotes((prev) => [r.data!, ...prev]);
    setInternalNoteDraft("");
    setInternalNoteCategory("general");
  };

  const practices = useMemo(() => apiPractices || (isDemoMode ? MOCK_PRACTICES : []), [apiPractices, isDemoMode]);

  // ─── Computed stats ──────────────────────────────────────────────────────

  const totalPractices = apiStats?.total_practices ?? apiStats?.totalPractices ?? practices.length;
  const totalMembers = apiStats?.total_patients ?? apiStats?.totalPatients ?? practices.reduce((sum, p) => sum + p.members, 0);
  const platformMRR = useMemo(() => practices.reduce((sum, p) => sum + p.mrr, 0), [practices]);
  const activeTrials = useMemo(
    () => practices.filter((p) => p.status === "trial" || p.status === "pending").length + pendingPractices.length,
    [practices, pendingPractices]
  );

  // ─── Filtered practices ──────────────────────────────────────────────────

  const filteredPractices = useMemo(
    () =>
      practiceSearch
        ? practices.filter(
            (p) =>
              p.name.toLowerCase().includes(practiceSearch.toLowerCase()) ||
              p.specialty.toLowerCase().includes(practiceSearch.toLowerCase()) ||
              p.city.toLowerCase().includes(practiceSearch.toLowerCase())
          )
        : practices,
    [practices, practiceSearch]
  );

  // ─── Sidebar ─────────────────────────────────────────────────────────────

  function renderSidebar() {
    return (
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 flex flex-col bg-white border-r border-slate-200 transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo — Stripe-purple sigil + tracking-tight wordmark */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[#635bff] flex items-center justify-center text-white font-semibold text-[13px]">
              M
            </div>
            <div>
              <h1 className="text-[13px] font-semibold tracking-tight text-slate-900 leading-none">
                MemberMD
              </h1>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-1 leading-none">
                Platform Admin
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
                        setSelectedPractice(null);
                        setSelectedSpecialtyDetail(null);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
                        isActive
                          ? "bg-slate-100 text-slate-900 font-medium"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-slate-100 px-4 py-3">
          <UserSettingsDropdown variant="superadmin" onNavigateToProfile={() => setActiveTab("profile")} />
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

    const recentPractices = practices.slice(0, 6);

    return (
      <div className="animate-page-in space-y-5">
        {/* Stripe-grade page header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Dashboard</h2>
            <p className="text-sm text-slate-500 mt-0.5">Network-wide growth, members, and platform health</p>
          </div>
          <RefreshButton onRefresh={loadData} title="Refresh dashboard" />
        </div>

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

        {/* System Health — surfaces "is mail wired up?" + last-7d send
            rate so SuperAdmin can see at a glance whether transactional
            email is actually working. Only renders when the endpoint
            returned (failure leaves it null and silent). */}
        {mailHealth && (() => {
          const tone = mailHealth.status === "ok"
            ? { bg: "#ecfdf5", border: "#a7f3d0", icon: "#059669", text: "#065f46", label: "Email working" }
            : mailHealth.status === "warning"
            ? { bg: "#fffbeb", border: "#fde68a", icon: "#d97706", text: "#92400e", label: "Email degraded" }
            : { bg: "#fef2f2", border: "#fecaca", icon: "#dc2626", text: "#991b1b", label: "Email NOT configured" };
          const summary = mailHealth.status === "not_configured"
            ? `Driver: ${mailHealth.driver}${mailHealth.missingEnvVars.length > 0 ? ` · Missing: ${mailHealth.missingEnvVars.join(", ")}` : ""}`
            : mailHealth.status === "warning"
            ? mailHealth.appEnv === "production" && (mailHealth.driver === "log" || mailHealth.driver === "array")
              ? `Driver is "${mailHealth.driver}" in production — emails are being thrown away.`
              : `Success rate ${mailHealth.successRate}% over the last 7 days (${mailHealth.failedLast7d} failed of ${mailHealth.sentLast7d + mailHealth.failedLast7d}).`
            : mailHealth.sentLast7d > 0
              ? `${mailHealth.sentLast7d} sent / ${mailHealth.failedLast7d} failed in the last 7 days · ${mailHealth.driver} · ${mailHealth.fromAddress}`
              : `${mailHealth.driver} · ${mailHealth.fromAddress} · no sends in the last 7 days`;
          return (
            <div
              className="rounded-xl border p-4 flex items-start gap-3"
              style={{ backgroundColor: tone.bg, borderColor: tone.border }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: "white", border: `1px solid ${tone.border}` }}
              >
                <Mail className="w-5 h-5" style={{ color: tone.icon }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: tone.text }}>
                  {tone.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: tone.text, opacity: 0.85 }}>
                  {summary}
                </p>
                {mailHealth.status === "not_configured" && (
                  <p className="text-xs mt-2" style={{ color: tone.text, opacity: 0.75 }}>
                    Set the missing environment variables on Railway, then redeploy. Patient enrollment emails, payment links, and welcome receipts will silently fail until this is fixed.
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <button
            onClick={() => setActiveTab("pending-approvals")}
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 p-4 flex items-center gap-4 text-left transition-colors"
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
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 p-4 flex items-center gap-4 text-left transition-colors"
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
                {(apiSpecialties || (isDemoMode ? MOCK_SPECIALTIES : [])).length} active specialties
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          <button
            onClick={() => setActiveTab("audit-logs")}
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 p-4 flex items-center gap-4 text-left transition-colors"
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
                {(apiAuditLogs || (isDemoMode ? MOCK_AUDIT_LOGS : [])).length} recent events
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        </div>

        {/* Recent Practices + Platform Health */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Recent Practices Table */}
          <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Recent practices</h3>
                <p className="text-sm text-slate-700 font-medium mt-0.5">Latest practices on the platform</p>
              </div>
              <button
                onClick={() => setActiveTab("practices")}
                className="text-xs font-medium flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors"
              >
                View all
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {(() => {
              type Pr = typeof recentPractices[number];
              const cols: import("../shared/stripe-ui").DataTableColumn<Pr>[] = [
                {
                  key: "name",
                  header: "Practice",
                  cell: (p) => (
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400 truncate">{p.city}, {p.state}</p>
                    </div>
                  ),
                },
                { key: "specialty", header: "Specialty", hideBelow: "md", cell: (p) => <span className="text-slate-600">{p.specialty}</span> },
                { key: "model", header: "Model", hideBelow: "lg", cell: (p) => <span className="text-slate-600">{p.model}</span> },
                { key: "members", header: "Members", align: "right", cell: (p) => <span className="tabular-nums text-slate-700">{formatNumber(p.members)}</span> },
                { key: "mrr", header: "MRR", align: "right", cell: (p) => <span className="tabular-nums text-slate-700 font-medium">{formatCurrency(p.mrr)}</span> },
                { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
              ];
              return (
                <DataTable
                  columns={cols}
                  rows={recentPractices}
                  rowKey={(p) => p.id}
                  onRowClick={(p) => setSelectedPractice(p)}
                  empty={
                    <div className="text-center py-8">
                      <p className="text-sm text-slate-500">No practices registered yet</p>
                    </div>
                  }
                  className="border-0 rounded-none"
                />
              );
            })()}
          </div>

          {/* Platform Health */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Platform health</h3>
            <div className="space-y-2.5">
              {[
                { label: "API uptime", value: "99.97%", color: "#066e54" },
                { label: "Avg response", value: "142ms", color: "#066e54" },
                { label: "Active sessions", value: "1,247", color: "#1e3a8a" },
                { label: "Error rate", value: "0.03%", color: "#066e54" },
                { label: "DB connections", value: "34 / 100", color: "#92400e" },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0"
                >
                  <span className="text-sm text-slate-600">{metric.label}</span>
                  <span
                    className="text-sm font-semibold tabular-nums"
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
    type Pr = typeof filteredPractices[number];

    // Filter facets — derived from current set so we don't show empty options.
    const specialtyOpts = Array.from(new Set(practices.map((p) => p.specialty).filter(Boolean))).map((s) => ({ value: s, label: s }));
    const statusOpts = Array.from(new Set(practices.map((p) => p.status))).map((s) => ({
      value: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
    }));
    const modelOpts = Array.from(new Set(practices.map((p) => p.model).filter(Boolean))).map((m) => ({ value: m, label: m }));
    const facets: import("../shared/stripe-ui").FilterFacet[] = [
      { key: "status", label: "Status", options: statusOpts },
      { key: "specialty", label: "Specialty", options: specialtyOpts },
      { key: "model", label: "Model", options: modelOpts },
    ];

    const filtered = filteredPractices.filter((p) => {
      for (const f of practiceFilters) {
        if (f.key === "status" && p.status !== f.value) return false;
        if (f.key === "specialty" && p.specialty !== f.value) return false;
        if (f.key === "model" && p.model !== f.value) return false;
      }
      return true;
    });

    const cols: import("../shared/stripe-ui").DataTableColumn<Pr>[] = [
      {
        key: "name",
        header: "Practice",
        cell: (p) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
            >
              {p.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
              <p className="text-xs text-slate-400 truncate">{p.city}, {p.state}</p>
            </div>
          </div>
        ),
      },
      {
        key: "specialty",
        header: "Specialty",
        cell: (p) => <span className="text-slate-600">{p.specialty}</span>,
      },
      {
        key: "model",
        header: "Model",
        hideBelow: "lg",
        cell: (p) => <span className="text-slate-600">{p.model}</span>,
      },
      {
        key: "providers",
        header: "Providers",
        align: "right",
        hideBelow: "md",
        cell: (p) => <span className="tabular-nums text-slate-700">{p.providers}</span>,
      },
      {
        key: "members",
        header: "Members",
        align: "right",
        cell: (p) => <span className="tabular-nums text-slate-700 font-medium">{formatNumber(p.members)}</span>,
      },
      {
        key: "mrr",
        header: "MRR",
        align: "right",
        cell: (p) => <MoneyAmount amount={p.mrr} />,
      },
      {
        key: "status",
        header: "Status",
        cell: (p) => <StatusPill label={p.status} />,
      },
      {
        key: "payouts",
        header: "Payouts",
        hideBelow: "lg",
        cell: (p) => <PayoutBadge status={p.stripeConnectStatus} chargesEnabled={p.stripeChargesEnabled} />,
      },
      {
        key: "joined",
        header: "Joined",
        hideBelow: "lg",
        cell: (p) => (
          <span className="text-slate-500">
            {new Date(p.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        ),
      },
      {
        key: "id",
        header: "ID",
        hideBelow: "xl",
        cell: (p) => <EntityId prefix="acct" id={p.id} />,
      },
    ];

    const rowActions = (p: Pr): import("../shared/stripe-ui").KebabAction[] => [
      { label: "View practice", onClick: () => setSelectedPractice(p) },
    ];

    return (
      <div className="animate-page-in space-y-5">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">All practices</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {filtered.length === practices.length
                ? `${practices.length} practices on the platform`
                : `${filtered.length} of ${practices.length}`}
            </p>
          </div>
          <RefreshButton onRefresh={loadData} title="Refresh practices list" />
        </div>

        {/* Search + filter chips bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, specialty, owner..."
              value={practiceSearch}
              onChange={(e) => setPracticeSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400"
            />
          </div>
          <FilterChips facets={facets} active={practiceFilters} onChange={setPracticeFilters} />
        </div>

        {/* Stripe-grade data table */}
        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(p) => p.id}
          actions={rowActions}
          onRowClick={(p) => setSelectedPractice(p)}
          empty={
            <div className="text-center py-8">
              {practices.length === 0 && !practiceSearch && practiceFilters.length === 0 ? (
                <p className="text-sm text-slate-500">No practices registered yet.</p>
              ) : (
                <>
                  <p className="text-sm text-slate-500 mb-1">No practices match your filters</p>
                  <button
                    onClick={() => { setPracticeFilters([]); setPracticeSearch(""); }}
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
              ? `Showing ${filtered.length} ${filtered.length === 1 ? "practice" : "practices"}`
              : null
          }
        />
      </div>
    );
  }

  // ─── Specialties Tab ─────────────────────────────────────────────────────

  function renderSpecialties() {
    const specialtiesData = apiSpecialties || (isDemoMode ? MOCK_SPECIALTIES : []);
    const categories = [...new Set(specialtiesData.map((s) => s.category))];

    return (
      <div className="animate-page-in space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Specialties</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {specialtiesData.length} specialties configured across the platform
            </p>
          </div>
          <RefreshButton onRefresh={loadData} title="Refresh specialties" />
        </div>

        {specialtiesData.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <Stethoscope className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No specialties configured yet</p>
          </div>
        )}
        {categories.map((category) => (
          <div key={category}>
            <h3
              className="text-sm font-semibold uppercase tracking-wider mb-3"
              style={{ color: "#334e68" }}
            >
              {category}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {specialtiesData.filter((s) => s.category === category).map(
                (spec) => {
                  const Icon = spec.icon;
                  return (
                    <button
                      key={spec.id}
                      onClick={() => setSelectedSpecialtyDetail(spec)}
                      className="glass hover-lift rounded-xl p-5 transition-all group text-left w-full cursor-pointer"
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
                      <div
                        className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium text-center opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5"
                        style={{
                          backgroundColor: "#e6f7f2",
                          color: "#147d64",
                        }}
                      >
                        View Bootstrap Pack
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </button>
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
      <div className="animate-page-in space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Plan templates</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Suggested membership plans for practices to adopt
            </p>
          </div>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
            style={{ backgroundColor: "#635bff" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
          >
            <FileText className="w-4 h-4" />
            Add template
          </button>
        </div>

        {(() => {
          const templates = isDemoMode ? MOCK_PLAN_TEMPLATES : [];
          type Tpl = typeof templates[number];

          const cols: import("../shared/stripe-ui").DataTableColumn<Tpl>[] = [
            {
              key: "name",
              header: "Template",
              cell: (t) => (
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                  <p className="text-xs text-slate-400 truncate">{t.specialty}</p>
                </div>
              ),
            },
            {
              key: "tier",
              header: "Tier",
              cell: (t) => <TierBadge tier={t.tier} />,
            },
            {
              key: "price",
              header: "Monthly",
              align: "right",
              cell: (t) => <MoneyAmount amount={t.monthlyPrice} />,
            },
            {
              key: "visits",
              header: "Visits / mo",
              align: "right",
              hideBelow: "md",
              cell: (t) => <span className="tabular-nums text-slate-700">{t.visitsPerMonth}</span>,
            },
            {
              key: "telehealth",
              header: "Telehealth",
              hideBelow: "lg",
              cell: (t) => (
                t.telehealth
                  ? <span className="text-emerald-700 font-medium text-xs">Included</span>
                  : <span className="text-slate-300 text-xs">—</span>
              ),
            },
            {
              key: "messaging",
              header: "Messaging",
              hideBelow: "lg",
              cell: (t) => (
                t.messaging
                  ? <span className="text-emerald-700 font-medium text-xs">Included</span>
                  : <span className="text-slate-300 text-xs">—</span>
              ),
            },
          ];

          const rowActions = (t: Tpl): import("../shared/stripe-ui").KebabAction[] => [
            { label: "View template", onClick: () => { void t; } },
            { label: "Edit template", onClick: () => { void t; } },
            { label: "Duplicate", onClick: () => { void t; } },
          ];

          return (
            <DataTable
              columns={cols}
              rows={templates}
              rowKey={(t) => t.id}
              actions={rowActions}
              empty={
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500">No plan templates configured yet</p>
                </div>
              }
            />
          );
        })()}
      </div>
    );
  }

  // ─── Audit Logs Tab ──────────────────────────────────────────────────────

  function renderAuditLogs() {
    return (
      <div className="animate-page-in space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Audit logs</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Platform activity and security events
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={loadData} title="Refresh audit logs" />
            <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <Calendar className="w-4 h-4" />
              Date range
            </button>
            <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <Filter className="w-4 h-4" />
              Filter
            </button>
          </div>
        </div>

        {(() => {
          const logs = (apiAuditLogs || (isDemoMode ? MOCK_AUDIT_LOGS : []));
          type Log = typeof logs[number];

          const actionColor = (action: string) =>
            action.includes("suspended") ? "#b91c1c"
            : action.includes("approved") || action.includes("created") ? "#066e54"
            : action.includes("expiring") ? "#92400e"
            : "#475569";

          // Derive a risk level when the row didn't ship one. Anything
          // money- / auth- / impersonation-related is high; deletions
          // are critical; reads + bookkeeping are low.
          const inferRisk = (log: Log): "low" | "medium" | "high" | "critical" => {
            if (log.riskLevel) return log.riskLevel;
            const a = (log.action || "").toLowerCase();
            if (a.includes("delete") || a.includes("destroy") || a.includes("purge")) return "critical";
            if (a.includes("impersonate") || a.includes("login_as") || a.includes("refund") || a.includes("password")) return "high";
            if (a.includes("suspend") || a.includes("approve") || a.includes("reject") || a.includes("plan_change")) return "high";
            if (a.includes("update") || a.includes("modify") || a.includes("publish")) return "medium";
            return "low";
          };
          const riskColors: Record<string, { bg: string; fg: string }> = {
            low: { bg: "#f1f5f9", fg: "#475569" },
            medium: { bg: "#fef3c7", fg: "#92400e" },
            high: { bg: "#ffedd5", fg: "#c2410c" },
            critical: { bg: "#fee2e2", fg: "#b91c1c" },
          };

          const cols: import("../shared/stripe-ui").DataTableColumn<Log>[] = [
            {
              key: "timestamp",
              header: "Timestamp",
              cell: (log) => <span className="text-xs text-slate-500 font-mono tabular-nums">{log.timestamp}</span>,
            },
            {
              key: "user",
              header: "Actor",
              cell: (log) => (
                <span
                  className="text-sm font-medium"
                  style={{ color: log.user === "system" ? "#94a3b8" : "#0f172a" }}
                >
                  {log.user}
                </span>
              ),
            },
            {
              key: "action",
              header: "Action",
              cell: (log) => {
                const c = actionColor(log.action);
                return (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono"
                    style={{ backgroundColor: `${c}14`, color: c }}
                  >
                    {log.action}
                  </span>
                );
              },
            },
            {
              key: "resource",
              header: "Resource",
              hideBelow: "md",
              cell: (log) => <span className="text-slate-600">{log.resource}</span>,
            },
            {
              key: "risk",
              header: "Risk",
              hideBelow: "md",
              cell: (log) => {
                const r = inferRisk(log);
                const c = riskColors[r];
                return (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider"
                    style={{ backgroundColor: c.bg, color: c.fg }}
                  >
                    {r}
                  </span>
                );
              },
            },
            {
              key: "ip",
              header: "IP address",
              hideBelow: "lg",
              cell: (log) => <span className="text-xs text-slate-400 font-mono tabular-nums">{log.ipAddress}</span>,
            },
          ];

          return (
            <DataTable
              columns={cols}
              rows={logs}
              rowKey={(l) => l.id}
              empty={
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500">No audit events recorded yet</p>
                </div>
              }
            />
          );
        })()}
      </div>
    );
  }

  // ─── Pending Approvals Tab ─────────────────────────────────────────────

  function renderPendingApprovals() {
    return (
      <div className="animate-page-in space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Pending approvals</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {pendingPractices.length} practice{pendingPractices.length !== 1 ? "s" : ""} awaiting review
            </p>
          </div>
          <RefreshButton onRefresh={loadData} title="Refresh approvals" />
        </div>

        {approvalMessage && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: "#ecf9ec", border: "1px solid #3f9142" }}>
            <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "#2f8132" }} />
            <p className="text-sm font-medium" style={{ color: "#2f8132" }}>{approvalMessage}</p>
            <button onClick={() => setApprovalMessage(null)} className="ml-auto p-1 rounded hover:bg-white/50">
              <X className="w-4 h-4" style={{ color: "#2f8132" }} />
            </button>
          </div>
        )}

        {(() => {
          type Pp = typeof pendingPractices[number];

          const cols: import("../shared/stripe-ui").DataTableColumn<Pp>[] = [
            {
              key: "name",
              header: "Practice",
              cell: (practice) => (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-xs font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #d97706, #92400e)" }}
                  >
                    {practice.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{practice.name}</p>
                    <p className="text-xs text-slate-400 truncate">{practice.city}, {practice.state}</p>
                  </div>
                </div>
              ),
            },
            {
              key: "specialty",
              header: "Specialty",
              cell: (practice) => (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  style={{ backgroundColor: "#e0f2fe", color: "#0369a1" }}
                >
                  {practice.specialty}
                </span>
              ),
            },
            {
              key: "owner",
              header: "Owner",
              hideBelow: "md",
              cell: (practice) => (
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 truncate">{practice.ownerName}</p>
                  <p className="text-xs text-slate-400 truncate">{practice.ownerEmail}</p>
                </div>
              ),
            },
            {
              key: "submitted",
              header: "Submitted",
              hideBelow: "md",
              cell: (practice) => <span className="text-slate-500">{practice.submittedAt}</span>,
            },
          ];

          const rowActions = (practice: Pp): import("../shared/stripe-ui").KebabAction[] => [
            { label: "View details", onClick: () => setSelectedPractice(practice) },
            {
              label: "Approve",
              onClick: async () => {
                const r = await apiFetch(`/admin/practices/${practice.id}/approve`, { method: "POST" });
                if (r.error) {
                  setApprovalMessage(`Failed to approve ${practice.name}: ${r.error}`);
                  return;
                }
                setApprovalMessage(`${practice.name} has been approved and is now active.`);
                setPendingPractices((prev) => prev.filter((p) => p.id !== practice.id));
                // Refresh the main practices list so the newly-active row appears.
                loadData();
              },
            },
            {
              label: "Reject",
              danger: true,
              onClick: async () => {
                const reason = window.prompt(`Reject ${practice.name}? Optional reason (sent to applicant):`, "");
                if (reason === null) return; // user cancelled
                const r = await apiFetch(`/admin/practices/${practice.id}/reject`, {
                  method: "POST",
                  body: JSON.stringify({ reason: reason || null }),
                });
                if (r.error) {
                  setApprovalMessage(`Failed to reject ${practice.name}: ${r.error}`);
                  return;
                }
                setPendingPractices((prev) => prev.filter((p) => p.id !== practice.id));
                setApprovalMessage(`${practice.name} has been rejected.`);
              },
            },
          ];

          return (
            <DataTable
              columns={cols}
              rows={pendingPractices}
              rowKey={(p) => p.id}
              actions={rowActions}
              onRowClick={(p) => setSelectedPractice(p)}
              empty={
                <div className="text-center py-10">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "#ecfdf5" }}>
                    <CheckCircle2 className="w-6 h-6" style={{ color: "#059669" }} />
                  </div>
                  <p className="text-sm font-medium text-slate-700">All caught up</p>
                  <p className="text-xs text-slate-400 mt-0.5">No pending practice approvals at this time.</p>
                </div>
              }
            />
          );
        })()}
      </div>
    );
  }

  // ─── Practice Detail Page ─────────────────────────────────────────────

  function renderPracticeDetail() {
    if (!selectedPractice) return null;
    const p = selectedPractice;

    // Real data from /admin/practices/{id} when available; mock fallbacks
    // keep the page populated during loading and in pure demo mode.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail = practiceDetail as any;

    // Real data from /admin/practices/{id} maps cleanly when present.
    // When the API returns nothing for a section we fall back to the
    // mock generators ONLY in demo mode so the showcase tenant looks
    // populated. Live super-admin sees real empty states for fresh
    // tenants — no fake $X MRR or fake doctors.
    type PlanCard = { name: string; price: number; visits: number; features: string[] };
    const plans: PlanCard[] = detail?.plans?.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? detail.plans.map((pl: any): PlanCard => ({
          name: pl.name,
          price: Number(pl.monthly_price ?? 0),
          visits: pl.visits_per_month === -1 ? 999 : (pl.visits_per_month ?? 0),
          features: Array.isArray(pl.features_list)
            ? (pl.features_list as string[])
            : ([
                pl.telehealth_included ? "Telehealth" : null,
                pl.messaging_included ? "Messaging" : null,
              ].filter(Boolean) as string[]),
        }))
      : (isDemoMode ? getMockPlans(p.specialty) : []);

    const members: MockMember[] = (detail?.members?.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? detail.members.map((m: any) => {
          const u = m.user || {};
          const first = u.first_name || u.firstName || "";
          const last = u.last_name || u.lastName || "";
          const am = m.active_membership || m.activeMembership;
          const planName = am?.plan?.name || "—";
          const status = am ? "active" : "pending";
          return {
            id: m.id,
            name: `${first} ${last}`.trim() || u.email || "Member",
            plan: planName,
            status: status as "active" | "inactive" | "pending",
            joined: m.created_at || m.createdAt || "",
            lastVisit: "-",
          };
        })
      : (isDemoMode ? getMockMembers(p.name, p.specialty) : []));

    const providers: MockProvider[] = (detail?.providers?.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? detail.providers.map((pr: any) => ({
          id: pr.id,
          name: `Dr. ${pr.first_name || ""} ${pr.last_name || ""}`.trim(),
          credentials: pr.credentials || pr.title || "",
          npi: "—",
          panelCapacity: pr.panel_capacity || 0,
          panelCurrent: pr.panel_current || 0,
          panelStatus: (pr.panel_status === "closed" ? "closed" : "open") as "open" | "closed",
        }))
      : (isDemoMode ? getMockProviders(p.name, p.providers) : []));

    const activity: MockActivityEvent[] = (detail?.activity?.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? detail.activity.map((a: any) => ({
          id: a.id,
          event: a.description || a.event_type || "Activity",
          timestamp: a.created_at ? new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
          icon: Activity,
          color: "#0369a1",
        }))
      : (isDemoMode ? getMockActivity(p.name) : []));

    return (
      <div className="animate-page-in space-y-5">
        {/* Header Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedPractice(null)}
                className="p-1.5 rounded-md hover:bg-slate-100 transition-colors shrink-0"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5" style={{ color: "#334e68" }} />
              </button>
              <div
                className="w-10 h-10 rounded-md flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
              >
                {p.name.charAt(0)}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{p.name}</h2>
                  <StatusBadge status={p.status} />
                  {/* Stripe Connect pill — surfaces money-flow readiness
                      next to the lifecycle status. Color-graded:
                      green=active, amber=pending/restricted, gray=other. */}
                  {p.stripeConnectStatus && (() => {
                    const cs = p.stripeConnectStatus;
                    const colors: Record<string, { bg: string; fg: string; label: string }> = {
                      active: { bg: "#dcfce7", fg: "#166534", label: "Stripe: Active" },
                      pending_onboarding: { bg: "#fef3c7", fg: "#92400e", label: "Stripe: Onboarding" },
                      pending_verification: { bg: "#fef3c7", fg: "#92400e", label: "Stripe: Verifying" },
                      restricted: { bg: "#fee2e2", fg: "#b91c1c", label: "Stripe: Restricted" },
                      disconnected: { bg: "#f1f5f9", fg: "#475569", label: "Stripe: Disconnected" },
                      not_started: { bg: "#f1f5f9", fg: "#475569", label: "Stripe: Not started" },
                    };
                    const c = colors[cs] ?? colors.not_started;
                    return (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                        style={{ backgroundColor: c.bg, color: c.fg }}
                        title={`stripe_connect_status = ${cs}`}
                      >
                        {c.label}
                      </span>
                    );
                  })()}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{p.specialty} · {p.model} · {p.city}, {p.state}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-14 sm:pl-0">
              {/* Login As — mints a 2h Sanctum token bound to the
                  practice owner so superadmin can reproduce a tenant
                  issue without asking for credentials. */}
              {p.status !== "suspended" && p.status !== "pending" && (
                <button
                  onClick={async () => {
                    const r = await apiFetch<{ token: string; tenantId: string; tenantName: string; impersonatedUser: { id: string; firstName: string; lastName: string; email: string; role: string }; expiresAt: string }>(`/admin/practices/${p.id}/impersonate`, { method: "POST" });
                    if (r.error || !r.data) {
                      setApprovalMessage(`Login As failed: ${r.error ?? "no token returned"}`);
                      return;
                    }
                    beginImpersonation({
                      token: r.data.token,
                      tenantId: r.data.tenantId,
                      tenantName: r.data.tenantName,
                      impersonatedUser: r.data.impersonatedUser,
                      expiresAt: r.data.expiresAt,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
                  style={{ backgroundColor: "#635bff" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
                  title="Sign in as this practice's owner for 2 hours"
                >
                  <LogIn className="w-4 h-4" />
                  Login As
                </button>
              )}

              {p.status === "pending" && (
                <button
                  onClick={async () => {
                    const r = await apiFetch(`/admin/practices/${p.id}/approve`, { method: "POST" });
                    if (r.error) {
                      setApprovalMessage(`Failed to approve ${p.name}: ${r.error}`);
                      return;
                    }
                    setApprovalMessage(`${p.name} has been approved.`);
                    setPendingPractices((prev) => prev.filter((pp) => pp.id !== p.id));
                    loadData();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors"
                  style={{ backgroundColor: "#635bff" }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve
                </button>
              )}

              {p.status === "suspended" ? (
                <button
                  onClick={async () => {
                    const r = await apiFetch(`/admin/practices/${p.id}/activate`, { method: "POST" });
                    if (r.error) {
                      setApprovalMessage(`Activate failed: ${r.error}`);
                      return;
                    }
                    setApprovalMessage(`${p.name} reactivated.`);
                    loadData();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Reactivate
                </button>
              ) : p.status !== "pending" && (
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Suspend ${p.name}?`,
                      message: "Members will be blocked from sign-in until you reactivate the practice.",
                      confirmLabel: "Suspend",
                      variant: "danger",
                    });
                    if (!ok) return;
                    const reason = window.prompt("Optional reason (visible to other superadmins):", "") ?? null;
                    const r = await apiFetch(`/admin/practices/${p.id}/suspend`, {
                      method: "POST",
                      body: JSON.stringify({ reason }),
                    });
                    if (r.error) {
                      setApprovalMessage(`Suspend failed: ${r.error}`);
                      return;
                    }
                    setApprovalMessage(`${p.name} suspended.`);
                    loadData();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-red-200 text-red-700 bg-white hover:bg-red-50 transition-colors"
                >
                  <Shield className="w-4 h-4" />
                  Suspend
                </button>
              )}

              {/* Plan dropdown — superadmin can change the local
                  subscription tier without touching Stripe. */}
              {p.status !== "pending" && (
                <select
                  className="px-2.5 py-1.5 rounded-md text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                  defaultValue={(p.subscriptionPlan as string | undefined) ?? "trial"}
                  onChange={async (e) => {
                    const next = e.target.value;
                    const r = await apiFetch(`/admin/practices/${p.id}/plan`, {
                      method: "PATCH",
                      body: JSON.stringify({ plan: next }),
                    });
                    if (r.error) {
                      setApprovalMessage(`Plan change failed: ${r.error}`);
                      return;
                    }
                    setApprovalMessage(`${p.name} → ${next}.`);
                    loadData();
                  }}
                  title="Change subscription tier"
                >
                  <option value="trial">Trial</option>
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              )}
            </div>
          </div>

          {/* Trial countdown — surfaces only while practice is on trial.
              Turns red ≤3 days remaining. Inline button extends the
              trial via the superadmin extend-trial endpoint, which
              records a reason on the audit log + as an internal note. */}
          {p.status === "trial" && p.trialEndsAt && (() => {
            const daysLeft = Math.max(
              0,
              Math.ceil((new Date(p.trialEndsAt).getTime() - Date.now()) / 86400000),
            );
            const critical = daysLeft <= 3;
            return (
              <div
                className="mt-3 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: critical ? "#fef2f2" : "#fffbeb",
                  color: critical ? "#b91c1c" : "#92400e",
                }}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="font-semibold">
                  {daysLeft} day{daysLeft !== 1 ? "s" : ""} left in trial
                </span>
                <span className="opacity-75">
                  (expires {new Date(p.trialEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})
                </span>
                <button
                  onClick={async () => {
                    const daysStr = window.prompt(
                      `Extend ${p.name}'s trial by how many days?\n\n(Adds to current end date. Enter 1-365.)`,
                      "30",
                    );
                    if (!daysStr) return;
                    const days = parseInt(daysStr, 10);
                    if (!Number.isFinite(days) || days < 1 || days > 365) {
                      setApprovalMessage("Trial extension cancelled — enter 1-365 days.");
                      return;
                    }
                    const reason = window.prompt(
                      "Reason for extension (visible to other superadmins, recorded on audit log):",
                      "",
                    );
                    if (!reason || reason.trim().length < 5) {
                      setApprovalMessage("Trial extension cancelled — reason required (min 5 chars).");
                      return;
                    }
                    const r = await apiFetch<{ new_ends_at: string; days_added: number }>(
                      `/admin/practices/${p.id}/subscription/extend-trial`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          extend_days: days,
                          reason: reason.trim(),
                        }),
                      },
                    );
                    if (r.error) {
                      setApprovalMessage(`Trial extension failed: ${r.error}`);
                      return;
                    }
                    setApprovalMessage(`${p.name}: trial extended by ${days} day${days !== 1 ? "s" : ""}.`);
                    loadData();
                  }}
                  className="ml-1 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold border border-current/20 hover:bg-white/60 transition-colors"
                  style={{ color: "inherit" }}
                  title="Extend this practice's trial period"
                >
                  Extend
                </button>
              </div>
            );
          })()}
        </div>

        {/* Pending-action signals — single banner row aggregating
            everything the superadmin should know about this tenant.
            Only renders when there's at least one signal. */}
        {pendingActions.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  {pendingActions.length} action{pendingActions.length === 1 ? "" : "s"} need attention
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-amber-800">
                  {pendingActions.map((sig) => (
                    <li key={sig.kind} className="flex items-center gap-2">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: sig.severity === "critical" ? "#b91c1c" : "#d97706" }}
                      />
                      <span>{sig.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Stats Row — Stripe-style border tiles. Tenant summary numbers
            (lifetime revenue, active memberships) come from the
            superadmin summary endpoint and replace the static MRR tile
            once loaded. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Active members",
              value: tenantSummary
                ? formatNumber(tenantSummary.activeMembershipCount)
                : formatNumber(p.members),
            },
            { label: "Providers", value: formatNumber(p.providers) },
            {
              label: "Lifetime revenue",
              value: tenantSummary
                ? formatCurrency(tenantSummary.lifetimeRevenue)
                : formatCurrency(p.mrr),
              subvalue: tenantSummary
                ? `${tenantSummary.invoiceCount} invoice${tenantSummary.invoiceCount === 1 ? "" : "s"}`
                : undefined,
            },
            { label: "Plan / Model", value: p.specialty, subvalue: p.model },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{stat.label}</p>
              <p className="text-xl font-semibold tabular-nums mt-1 text-slate-900">{stat.value}</p>
              {stat.subvalue && <p className="text-xs text-slate-400 mt-0.5">{stat.subvalue}</p>}
            </div>
          ))}
        </div>

        {/* Internal notes — superadmin-only CRM-style thread. Always
            here, never visible to the tenant. */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Internal notes</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Private — only visible to MemberMD superadmins.
              </p>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {internalNotes.length} note{internalNotes.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="px-5 py-4 border-b border-slate-100 space-y-2">
            <textarea
              value={internalNoteDraft}
              onChange={(e) => setInternalNoteDraft(e.target.value)}
              placeholder="Owner is Dr. Korel — prefers email at noon, slow Q3 invoices…"
              rows={2}
              className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:border-slate-400"
            />
            <div className="flex items-center justify-between gap-2">
              <select
                value={internalNoteCategory}
                onChange={(e) => setInternalNoteCategory(e.target.value as typeof internalNoteCategory)}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-200 bg-white text-slate-700"
              >
                <option value="general">General</option>
                <option value="billing">Billing</option>
                <option value="support">Support</option>
                <option value="risk">Risk</option>
              </select>
              <button
                onClick={() => void submitInternalNote()}
                disabled={!internalNoteDraft.trim() || internalNoteSaving}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: "#635bff" }}
                onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = "#544ee0")}
                onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = "#635bff")}
              >
                {internalNoteSaving ? "Saving…" : "Add note"}
              </button>
            </div>
          </div>

          {internalNotes.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-slate-400">
              No internal notes yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {internalNotes.map((note) => {
                const catColor: Record<string, string> = {
                  general: "#475569",
                  billing: "#7c3aed",
                  support: "#2563eb",
                  risk: "#b91c1c",
                };
                const catBg: Record<string, string> = {
                  general: "#f1f5f9",
                  billing: "#f3e8ff",
                  support: "#dbeafe",
                  risk: "#fee2e2",
                };
                return (
                  <li key={note.id} className="px-5 py-3 flex items-start gap-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider shrink-0 mt-0.5"
                      style={{ backgroundColor: catBg[note.category] ?? catBg.general, color: catColor[note.category] ?? catColor.general }}
                    >
                      {note.category}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">{note.body}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {note.author?.name ?? "system"}
                        <span className="opacity-60"> · </span>
                        {new Date(note.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Practice Info */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-base font-semibold mb-4" style={{ color: "#102a43" }}>Practice Information</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              {[
                { icon: Building2, label: "Name", value: p.name || "—" },
                { icon: Stethoscope, label: "Specialty", value: p.specialty || "—" },
                { icon: Star, label: "Practice Model", value: p.model || "—" },
                { icon: Hash, label: "Tenant Code", value: p.tenantCode || "—" },
                { icon: Mail, label: "Owner Email", value: p.ownerEmail || "—" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0 text-slate-400" />
                    <span className="text-sm text-slate-500 w-28 shrink-0">{item.label}</span>
                    <span className="text-sm font-medium" style={{ color: "#102a43" }}>{item.value}</span>
                  </div>
                );
              })}
            </div>
            <div className="space-y-3">
              {[
                { icon: Phone, label: "Phone", value: p.phone || "—" },
                { icon: MapPin, label: "Address", value: p.address || "—" },
                { icon: MapPin, label: "City/State", value: [p.city, p.state].filter(Boolean).join(", ") || "—" },
                { icon: Globe, label: "Website", value: p.website || "—" },
                { icon: Hash, label: "NPI", value: p.npi || "—" },
                { icon: FileText, label: "Tax ID", value: p.taxId || "—" },
              ].map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div key={item.label + idx} className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0 text-slate-400" />
                    <span className="text-sm text-slate-500 w-28 shrink-0">{item.label}</span>
                    <span className="text-sm font-medium" style={{ color: "#102a43" }}>{item.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-500">Joined</span>
            <span className="text-sm font-medium" style={{ color: "#102a43" }}>
              {new Date(p.joinedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* Membership Plans */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-base font-semibold mb-4" style={{ color: "#102a43" }}>Membership Plans</h3>
          {p.members === 0 && p.status === "pending" ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500">No membership plans configured yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((plan, idx) => {
                const isPopular = idx === 1;
                return (
                  <div
                    key={plan.name}
                    className="rounded-xl p-5 relative overflow-hidden"
                    style={{
                      border: isPopular ? "2px solid #27ab83" : "1px solid #e2e8f0",
                      background: isPopular ? "linear-gradient(180deg, rgba(39,171,131,0.04) 0%, rgba(255,255,255,1) 100%)" : "#fff",
                    }}
                  >
                    {isPopular && (
                      <div
                        className="absolute top-0 right-0 px-3 py-1 text-xs font-bold text-white rounded-bl-lg"
                        style={{ backgroundColor: "#27ab83" }}
                      >
                        Popular
                      </div>
                    )}
                    <h4 className="text-lg font-bold" style={{ color: "#102a43" }}>{plan.name}</h4>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-3xl font-bold" style={{ color: isPopular ? "#147d64" : "#334e68" }}>
                        ${plan.price}
                      </span>
                      <span className="text-sm text-slate-400">/mo</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{plan.visits} visits/month</p>
                    <div className="mt-4 space-y-2">
                      {plan.features.map((f) => (
                        <div key={f} className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#27ab83" }} />
                          <span className="text-xs text-slate-600">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Members */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Members</h3>
            <p className="text-sm text-slate-700 font-medium mt-0.5">
              {members.length} {members.length === 1 ? "member" : "members"} enrolled
            </p>
          </div>
          {(() => {
            const cols: import("../shared/stripe-ui").DataTableColumn<MockMember>[] = [
              {
                key: "name",
                header: "Name",
                cell: (m) => (
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
                    >
                      {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <span className="text-sm text-slate-800 truncate">{m.name}</span>
                  </div>
                ),
              },
              { key: "plan", header: "Plan", cell: (m) => <PlanBadge plan={m.plan} /> },
              { key: "status", header: "Status", cell: (m) => <MemberStatusBadge status={m.status} /> },
              {
                key: "joined",
                header: "Joined",
                hideBelow: "md",
                cell: (m) => (
                  <span className="text-slate-500">
                    {new Date(m.joined).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                ),
              },
              {
                key: "lastVisit",
                header: "Last visit",
                hideBelow: "md",
                cell: (m) => (
                  <span className="text-slate-500">
                    {m.lastVisit === "-" ? "—" : new Date(m.lastVisit).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                ),
              },
            ];
            return (
              <div className="border-t border-slate-100">
                <DataTable
                  columns={cols}
                  rows={members}
                  rowKey={(m) => m.id}
                  empty={
                    <div className="text-center py-8">
                      <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm text-slate-500">No members yet</p>
                    </div>
                  }
                  className="border-0 rounded-none"
                />
              </div>
            );
          })()}
        </div>

        {/* Providers */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-base font-semibold mb-4" style={{ color: "#102a43" }}>Providers</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.map((prov) => {
              const pctFull = Math.round((prov.panelCurrent / prov.panelCapacity) * 100);
              const barColor = prov.panelStatus === "closed" ? "#dc2626" : pctFull > 80 ? "#d97706" : "#27ab83";
              return (
                <div
                  key={prov.id}
                  className="rounded-xl p-5"
                  style={{ border: "1px solid #e2e8f0", backgroundColor: "#fff" }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                        style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
                      >
                        {prov.name.split(" ").slice(1).map(n => n[0]).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "#102a43" }}>{prov.name}</p>
                        <p className="text-xs text-slate-500">{prov.credentials}</p>
                      </div>
                    </div>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: prov.panelStatus === "open" ? "#ecf9ec" : "#fef2f2",
                        color: prov.panelStatus === "open" ? "#2f8132" : "#dc2626",
                      }}
                    >
                      Panel {prov.panelStatus}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                    <Hash className="w-3.5 h-3.5" />
                    <span>NPI: {prov.npi}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500">Panel Capacity</span>
                      <span className="font-semibold" style={{ color: "#102a43" }}>{prov.panelCurrent} / {prov.panelCapacity}</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#e2e8f0" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pctFull}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-role user breakdown — superadmin signal that the practice
            is staffed correctly. Stripe-style flat tiles. */}
        {tenantSummary && Object.keys(tenantSummary.userCountsByRole).length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Users by role</h3>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {Object.values(tenantSummary.userCountsByRole).reduce((a, b) => a + b, 0)} total
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(tenantSummary.userCountsByRole).map(([role, count]) => (
                <div key={role} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {role.replace(/_/g, " ")}
                  </p>
                  <p className="text-lg font-semibold tabular-nums mt-0.5 text-slate-900">{count}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Billing readiness — pilot-practice picker. Shows Stripe Connect
            status, plan price coverage, and the billing_enforced flag.
            Operator flips the flag when ready. */}
        {billingReadiness && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Billing readiness</h3>
              <span
                className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{
                  backgroundColor: billingReadiness.billingEnforced ? "#dcfce7" : "#f1f5f9",
                  color: billingReadiness.billingEnforced ? "#166534" : "#475569",
                }}
              >
                {billingReadiness.billingEnforced ? "Enforced" : "Manual fallback"}
              </span>
            </div>

            {/* Recommendation banner — what to do next */}
            {(() => {
              const r = billingReadiness.recommendation;
              const banners: Record<typeof r, { color: string; bg: string; text: string }> = {
                connect_onboarding: { color: "#92400e", bg: "#fef3c7", text: "Practice owner must complete Stripe Connect onboarding before this tenant can bill." },
                create_plans: { color: "#92400e", bg: "#fef3c7", text: "No active membership plans. Have the practice create a plan first." },
                wire_plan_prices: { color: "#92400e", bg: "#fef3c7", text: "Plans exist but none have a Stripe monthly price ID. Practice must wire prices in Plan Settings." },
                wire_remaining_plan_prices: { color: "#92400e", bg: "#fef3c7", text: "Some plans are missing Stripe prices — listed below. New enrollments to those plans will fall back to manual billing." },
                ready_to_flip: { color: "#166534", bg: "#dcfce7", text: "All set. Flip 'Enforce billing' on to require Stripe charges for new enrollments." },
                live: { color: "#166534", bg: "#dcfce7", text: "Live. New enrollments are charged via Stripe." },
              };
              const b = banners[r];
              return (
                <div className="rounded-md px-3 py-2 mb-4 text-xs" style={{ backgroundColor: b.bg, color: b.color }}>
                  {b.text}
                </div>
              );
            })()}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Stripe Connect</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: billingReadiness.connect.ready ? "#166534" : "#dc2626" }}>
                  {billingReadiness.connect.ready ? "Ready" : (billingReadiness.connect.status ?? "Not connected")}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Plans priced</p>
                <p className="text-lg font-semibold tabular-nums mt-0.5 text-slate-900">
                  {billingReadiness.plans.withMonthlyPrice}
                  <span className="text-xs font-normal text-slate-400">/{billingReadiness.plans.totalActive}</span>
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Active billed</p>
                <p className="text-lg font-semibold tabular-nums mt-0.5 text-slate-900">{billingReadiness.memberships.activeStripe}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Comped / manual</p>
                <p className="text-lg font-semibold tabular-nums mt-0.5 text-slate-900">
                  {billingReadiness.memberships.activeComped + billingReadiness.memberships.activeManual}
                </p>
              </div>
            </div>

            {billingReadiness.plans.missingPrices.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Plans missing Stripe price</p>
                <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
                  {billingReadiness.plans.missingPrices.map((p) => (
                    <div key={p.id} className="px-3 py-2 flex items-center justify-between">
                      <span className="text-sm text-slate-700">{p.name}</span>
                      <span className="text-xs text-slate-500 tabular-nums">${p.monthlyPrice ?? "—"}/mo</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-500">
                {billingReadiness.billingEnforced
                  ? "New enrollments must charge via Stripe. Comp path still works."
                  : "Enrollments fall back to manual billing when Stripe isn't configured."}
              </div>
              {billingMessage && (
                <span
                  className="text-xs"
                  style={{ color: billingMessage.tone === "error" ? "#dc2626" : "#166534" }}
                >
                  {billingMessage.text}
                </span>
              )}
              <button
                disabled={
                  billingFlipping ||
                  (!billingReadiness.billingEnforced && billingReadiness.recommendation !== "ready_to_flip" && billingReadiness.recommendation !== "wire_remaining_plan_prices")
                }
                onClick={async () => {
                  if (!selectedPractice) return;
                  setBillingFlipping(true);
                  const next = !billingReadiness.billingEnforced;
                  const r = await apiFetch<{ billingEnforced: boolean }>(`/admin/practices/${selectedPractice.id}/billing-enforced`, {
                    method: "POST",
                    body: JSON.stringify({ enforced: next }),
                  });
                  setBillingFlipping(false);
                  if (r.error) {
                    setBillingMessage({ text: r.error, tone: "error" });
                    return;
                  }
                  setBillingReadiness({ ...billingReadiness, billingEnforced: next });
                  setBillingMessage({
                    text: next ? "Billing enforcement enabled." : "Billing enforcement disabled.",
                    tone: "success",
                  });
                }}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: billingReadiness.billingEnforced ? "#64748b" : "#635bff" }}
              >
                {billingFlipping ? "Saving…" : (billingReadiness.billingEnforced ? "Disable enforcement" : "Enable billing")}
              </button>
            </div>
          </div>
        )}

        {/* Integration health — outbound webhook delivery for the last
            24h. Only renders when the tenant has at least one webhook
            endpoint registered. */}
        {webhookHealth && webhookHealth.endpointCount > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Webhook delivery health</h3>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Last 24 hours
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Endpoints</p>
                <p className="text-lg font-semibold tabular-nums mt-0.5 text-slate-900">
                  {webhookHealth.enabledCount}<span className="text-xs font-normal text-slate-400">/{webhookHealth.endpointCount}</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {webhookHealth.failingCount > 0 ? `${webhookHealth.failingCount} failing` : "all healthy"}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Delivered</p>
                <p className="text-lg font-semibold tabular-nums mt-0.5 text-emerald-700">{webhookHealth.deliveredLast24h}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Failed</p>
                <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: webhookHealth.failedLast24h > 0 ? "#b91c1c" : "#475569" }}>
                  {webhookHealth.failedLast24h}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Success rate</p>
                <p className="text-lg font-semibold tabular-nums mt-0.5 text-slate-900">
                  {webhookHealth.successRate !== null ? `${webhookHealth.successRate}%` : "—"}
                </p>
              </div>
            </div>

            {webhookHealth.latestFailure && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Most recent failure</p>
                    <p className="mt-0.5">
                      <span className="font-mono">{webhookHealth.latestFailure.eventType}</span>
                      {webhookHealth.latestFailure.responseStatus && <> → HTTP {webhookHealth.latestFailure.responseStatus}</>}
                    </p>
                    {webhookHealth.latestFailure.errorMessage && (
                      <p className="mt-0.5 opacity-80 truncate">{webhookHealth.latestFailure.errorMessage}</p>
                    )}
                  </div>
                  <button
                    disabled={retryingDeliveryId === webhookHealth.latestFailure.id}
                    onClick={async () => {
                      if (!webhookHealth.latestFailure || !selectedPractice) return;
                      setRetryingDeliveryId(webhookHealth.latestFailure.id);
                      const r = await apiFetch(`/admin/practices/${selectedPractice.id}/webhook-deliveries/${webhookHealth.latestFailure.id}/retry`, { method: "POST" });
                      setRetryingDeliveryId(null);
                      if (r.error) {
                        setApprovalMessage(`Retry failed: ${r.error}`);
                        return;
                      }
                      setApprovalMessage("Retry queued. Health card will refresh shortly.");
                      // Re-fetch webhook health so the card updates.
                      const fresh = await apiFetch<typeof webhookHealth>(`/admin/practices/${selectedPractice.id}/webhook-health`);
                      if (fresh.data) setWebhookHealth(fresh.data);
                    }}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-white shadow-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#b91c1c" }}
                  >
                    {retryingDeliveryId === webhookHealth.latestFailure.id ? "Queuing…" : "Retry"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Email deliverability — Tier 4. Only renders when at least one
            transactional email has been logged for this tenant. */}
        {emailDeliv && emailDeliv.totalLast7d > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Email deliverability</h3>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Last 7 days
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sent</p>
                <p className="text-lg font-semibold tabular-nums mt-0.5 text-emerald-700">{emailDeliv.sentLast7d}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Failed</p>
                <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: emailDeliv.failedLast7d > 0 ? "#b91c1c" : "#475569" }}>
                  {emailDeliv.failedLast7d}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Success rate</p>
                <p className="text-lg font-semibold tabular-nums mt-0.5 text-slate-900">
                  {emailDeliv.successRate !== null ? `${emailDeliv.successRate}%` : "—"}
                </p>
              </div>
            </div>

            {emailDeliv.latestFailures.length > 0 && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs">
                <p className="font-semibold text-red-800 mb-1.5">
                  Recent failures ({emailDeliv.latestFailures.length})
                </p>
                <ul className="space-y-1.5">
                  {emailDeliv.latestFailures.map((f) => (
                    <li key={f.id} className="text-red-800">
                      <span className="font-mono">{f.mailable}</span>
                      {" → "}
                      <span className="opacity-80">{f.recipient}</span>
                      {f.errorMessage && (
                        <span className="block ml-3 mt-0.5 opacity-70 truncate">↳ {f.errorMessage}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Tenant-scoped activity log — same shape as the platform
            audit table on the SuperAdmin Audit tab, filtered to this
            tenant. Risk-level column derives client-side via inferRisk. */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">Tenant activity</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit events for this practice — most recent first.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="search"
                value={tenantAuditSearch}
                onChange={(e) => setTenantAuditSearch(e.target.value)}
                placeholder="Search action / user…"
                className="px-3 py-1.5 rounded-md text-xs border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-slate-400 max-w-xs"
              />
              <button
                onClick={() => {
                  if (!selectedPractice) return;
                  // Build the URL — apiFetch is JSON-only; for streamed
                  // file downloads we hit the URL directly with the
                  // Sanctum token in a query-fallback header that the
                  // existing backend already accepts.
                  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
                  const token = sessionStorage.getItem("membermd_token") || "";
                  // Browser fetch + Blob so we can include Authorization.
                  void (async () => {
                    try {
                      const r = await fetch(`${apiBase}/admin/practices/${selectedPractice.id}/audit-export`, {
                        headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" },
                      });
                      if (!r.ok) {
                        setApprovalMessage(`Export failed (${r.status})`);
                        return;
                      }
                      const blob = await r.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      const cd = r.headers.get("Content-Disposition") || "";
                      const m = cd.match(/filename=([^;]+)/i);
                      a.download = (m?.[1] || `audit-${selectedPractice.name}.csv`).replace(/"/g, "");
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                    } catch (e) {
                      setApprovalMessage(`Export failed: ${e instanceof Error ? e.message : "network error"}`);
                    }
                  })();
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                title="Download tenant audit log as CSV"
              >
                <FileText className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {tenantAuditLoading ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">Loading activity…</div>
          ) : tenantAuditLogs.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              No audit events recorded for this tenant yet.
            </div>
          ) : (() => {
            const q = tenantAuditSearch.trim().toLowerCase();
            const filtered = q
              ? tenantAuditLogs.filter((log) =>
                  (log.action || "").toLowerCase().includes(q)
                  || (log.user || "").toLowerCase().includes(q)
                  || (log.resource || "").toLowerCase().includes(q),
                )
              : tenantAuditLogs;

            const inferRiskRow = (log: MockAuditLog): "low" | "medium" | "high" | "critical" => {
              if (log.riskLevel) return log.riskLevel;
              const a = (log.action || "").toLowerCase();
              if (a.includes("delete") || a.includes("destroy") || a.includes("purge")) return "critical";
              if (a.includes("impersonate") || a.includes("login_as") || a.includes("refund") || a.includes("password")) return "high";
              if (a.includes("suspend") || a.includes("approve") || a.includes("reject") || a.includes("plan_change")) return "high";
              if (a.includes("update") || a.includes("modify") || a.includes("publish")) return "medium";
              return "low";
            };
            const riskColors: Record<string, { bg: string; fg: string }> = {
              low: { bg: "#f1f5f9", fg: "#475569" },
              medium: { bg: "#fef3c7", fg: "#92400e" },
              high: { bg: "#ffedd5", fg: "#c2410c" },
              critical: { bg: "#fee2e2", fg: "#b91c1c" },
            };

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">When</th>
                      <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Actor</th>
                      <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Action</th>
                      <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Resource</th>
                      <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Risk</th>
                      <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 50).map((log) => {
                      const r = inferRiskRow(log);
                      const c = riskColors[r];
                      return (
                        <tr key={log.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                          <td className="px-4 py-2 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                            {log.timestamp ? new Date(log.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                          </td>
                          <td className="px-4 py-2 text-sm text-slate-700">{log.user}</td>
                          <td className="px-4 py-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium font-mono bg-slate-100 text-slate-700">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-500 hidden md:table-cell">{log.resource}</td>
                          <td className="px-4 py-2 hidden md:table-cell">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider"
                              style={{ backgroundColor: c.bg, color: c.fg }}
                            >
                              {r}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-400 font-mono tabular-nums hidden lg:table-cell">{log.ipAddress || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length > 50 && (
                  <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
                    Showing 50 of {filtered.length} matching events.
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Recent Activity */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-base font-semibold mb-4" style={{ color: "#102a43" }}>Recent Activity</h3>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-2 bottom-2 w-0.5" style={{ backgroundColor: "#e2e8f0" }} />
            <div className="space-y-4">
              {activity.map((evt) => {
                const Icon = evt.icon;
                return (
                  <div key={evt.id} className="flex items-start gap-4 relative">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 relative z-10"
                      style={{ backgroundColor: "#fff", border: `2px solid ${evt.color}` }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color: evt.color }} />
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-sm" style={{ color: "#102a43" }}>{evt.event}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{evt.timestamp}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Screening Library Tab ────────────────────────────────────────────────

  function renderScreeningLibrary() {
    const screeningsData = apiScreenings || (isDemoMode ? MOCK_SCREENINGS : []);
    const categories = ["All", ...new Set(screeningsData.map((s) => s.category))];
    const filtered = screeningCategoryFilter === "All"
      ? screeningsData
      : screeningsData.filter((s) => s.category === screeningCategoryFilter);

    return (
      <div className="animate-page-in space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Screening library</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Validated clinical instruments auto-provisioned to practices by specialty
            </p>
          </div>
          <RefreshButton onRefresh={loadData} title="Refresh screenings" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setScreeningCategoryFilter(cat)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={
                screeningCategoryFilter === cat
                  ? { backgroundColor: "#147d64", color: "#fff" }
                  : { backgroundColor: "#f1f5f9", color: "#475569" }
              }
            >
              {cat}
            </button>
          ))}
          <span className="ml-auto text-sm text-slate-500">{filtered.length} instrument{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Grid */}
        {filtered.length === 0 && (
          <div className="glass rounded-xl p-12 text-center">
            <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No screening instruments available</p>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((instrument) => {
            const isExpanded = expandedScreening === instrument.id;
            return (
              <div key={instrument.id} className="glass rounded-xl overflow-hidden transition-all">
                {/* Card Header */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold" style={{ color: "#102a43" }}>{instrument.name}</h3>
                        <span
                          className="text-xs font-mono font-medium px-2 py-0.5 rounded"
                          style={{ backgroundColor: "#e0f2fe", color: "#0369a1" }}
                        >
                          {instrument.code}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{instrument.fullName}</p>
                    </div>
                    <button
                      onClick={() => {/* toggle active - placeholder */}}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ml-2"
                      style={
                        instrument.active
                          ? { backgroundColor: "#ecf9ec", color: "#2f8132" }
                          : { backgroundColor: "#f1f5f9", color: "#94a3b8" }
                      }
                    >
                      {instrument.active ? "Active" : "Inactive"}
                    </button>
                  </div>

                  {/* Category + Stats */}
                  <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5" />
                      {instrument.category}
                    </span>
                    <span>{instrument.questionCount} questions</span>
                    <span>Score: {instrument.scoreMin}-{instrument.scoreMax}</span>
                  </div>

                  {/* Severity Badges */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {instrument.severities.map((sev) => (
                      <span
                        key={sev.label}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: sev.bg, color: sev.color }}
                      >
                        {sev.label} ({sev.min}-{sev.max})
                      </span>
                    ))}
                  </div>

                  {/* Specialty badges */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {instrument.specialties.map((spec) => (
                      <span
                        key={spec}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: "#f1f5f9", color: "#334e68" }}
                      >
                        {spec}
                      </span>
                    ))}
                  </div>

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedScreening(isExpanded ? null : instrument.id)}
                    className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
                    style={{ color: "#147d64" }}
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {isExpanded ? "Hide Questions" : "Show Questions"}
                  </button>
                </div>

                {/* Expanded questions */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-0">
                    <div className="rounded-lg p-4" style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                        Questions ({instrument.questionCount})
                      </p>
                      <ol className="space-y-2">
                        {instrument.questions.map((q, idx) => (
                          <li key={idx} className="flex gap-3 text-sm">
                            <span className="font-mono font-bold shrink-0" style={{ color: "#334e68", minWidth: "1.5rem" }}>{idx + 1}.</span>
                            <span style={{ color: "#102a43" }}>{q}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-4 pt-3 border-t border-slate-200">
                        <p className="text-xs font-semibold text-slate-500 mb-1.5">Answer Options:</p>
                        <div className="flex flex-wrap gap-2">
                          {instrument.answerOptions.map((opt) => (
                            <span
                              key={opt}
                              className="px-2 py-0.5 rounded text-xs font-medium"
                              style={{ backgroundColor: "#e6f7f2", color: "#147d64" }}
                            >
                              {opt}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Consent Templates Tab ──────────────────────────────────────────────────

  function renderConsentTemplates() {
    const consentsData = apiConsents || (isDemoMode ? MOCK_CONSENTS : []);
    const filtered = consentFilter === "All"
      ? consentsData
      : consentFilter === "Required"
        ? consentsData.filter((c: { required: boolean }) => c.required)
        : consentsData.filter((c: { required: boolean }) => !c.required);

    const typeColors: Record<string, { bg: string; color: string }> = {
      hipaa: { bg: "#fef2f2", color: "#dc2626" },
      treatment: { bg: "#e0f2fe", color: "#0369a1" },
      telehealth: { bg: "#e6f7f2", color: "#147d64" },
      controlled_substance: { bg: "#f3e8ff", color: "#7c3aed" },
      financial: { bg: "#fffbeb", color: "#d97706" },
      communications: { bg: "#f1f5f9", color: "#475569" },
    };

    return (
      <div className="animate-page-in space-y-5">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Consent templates</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Legal consent forms auto-assigned to practices during registration
            </p>
          </div>
          <RefreshButton onRefresh={loadData} title="Refresh consents" />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {["All", "Required", "Optional"].map((f) => (
            <button
              key={f}
              onClick={() => setConsentFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={
                consentFilter === f
                  ? { backgroundColor: "#147d64", color: "#fff" }
                  : { backgroundColor: "#f1f5f9", color: "#475569" }
              }
            >
              {f}
            </button>
          ))}
          <span className="ml-auto text-sm text-slate-500">{filtered.length} template{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "#f8fafc" }}>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Required</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Specialty</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Version</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Provisioned</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-400">
                      No consent templates configured yet
                    </td>
                  </tr>
                )}
                {filtered.map((consent) => {
                  const isExpanded = expandedConsent === consent.id;
                  const tc = typeColors[consent.type] || { bg: "#f1f5f9", color: "#475569" };
                  return (
                    <tr key={consent.id} className="group">
                      <td className="px-6 py-3.5">
                        <p className="text-sm font-medium" style={{ color: "#102a43" }}>{consent.name}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                          style={{ backgroundColor: tc.bg, color: tc.color }}
                        >
                          {consent.type.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {consent.required ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "#ecf9ec", color: "#2f8132" }}>Yes</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "#f1f5f9", color: "#94a3b8" }}>No</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          style={
                            consent.specialty === "All"
                              ? { backgroundColor: "#e6f7f2", color: "#147d64" }
                              : { backgroundColor: "#f3e8ff", color: "#7c3aed" }
                          }
                        >
                          {consent.specialty}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-sm font-mono text-slate-500">v{consent.version}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={
                            consent.active
                              ? { backgroundColor: "#ecf9ec", color: "#2f8132" }
                              : { backgroundColor: "#f1f5f9", color: "#94a3b8" }
                          }
                        >
                          {consent.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-sm font-medium" style={{ color: "#334e68" }}>{consent.practiceCount} practices</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => setExpandedConsent(isExpanded ? null : consent.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                          title={isExpanded ? "Collapse" : "Preview"}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" style={{ color: "#147d64" }} /> : <Eye className="w-4 h-4 text-slate-500" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Expanded consent preview */}
          {expandedConsent && (() => {
            const consent = (apiConsents || (isDemoMode ? MOCK_CONSENTS : [])).find((c: { id: string }) => c.id === expandedConsent);
            if (!consent) return null;
            return (
              <div className="px-6 py-4 border-t border-slate-200" style={{ backgroundColor: "#f8fafc" }}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold" style={{ color: "#102a43" }}>Preview: {consent.name}</h4>
                  <button
                    onClick={() => setExpandedConsent(null)}
                    className="p-1 rounded hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <div
                  className="rounded-lg p-4 text-sm leading-relaxed overflow-y-auto"
                  style={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", color: "#334e68", maxHeight: "300px", whiteSpace: "pre-line" }}
                >
                  {consent.previewText}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // ─── Note Templates Tab ─────────────────────────────────────────────────────

  function renderNoteTemplates() {
    const noteTemplatesData = isDemoMode ? MOCK_NOTE_TEMPLATES : [];
    const specialties = ["All", ...new Set(noteTemplatesData.map((t) => t.specialty))];
    const filtered = noteSpecialtyFilter === "All"
      ? noteTemplatesData
      : noteTemplatesData.filter((t) => t.specialty === noteSpecialtyFilter);

    const sectionKeyColors: Record<string, { bg: string; color: string; border: string }> = {
      S: { bg: "#e0f2fe", color: "#0369a1", border: "#38bdf8" },
      O: { bg: "#e6f7f2", color: "#147d64", border: "#27ab83" },
      A: { bg: "#fffbeb", color: "#92400e", border: "#d97706" },
      P: { bg: "#f3e8ff", color: "#7c3aed", border: "#a78bfa" },
    };

    const noteTypeColors: Record<string, { bg: string; color: string }> = {
      "Initial Eval": { bg: "#e0f2fe", color: "#0369a1" },
      "Follow-Up": { bg: "#e6f7f2", color: "#147d64" },
      "Therapy": { bg: "#f3e8ff", color: "#7c3aed" },
      "Med Management": { bg: "#fffbeb", color: "#d97706" },
      "Crisis": { bg: "#fef2f2", color: "#dc2626" },
    };

    return (
      <div className="animate-page-in space-y-5">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Note templates</h2>
            <p className="text-sm text-slate-500 mt-0.5">SOAP note templates provisioned by specialty</p>
          </div>
          <RefreshButton onRefresh={loadData} title="Refresh templates" />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {specialties.map((spec) => (
            <button
              key={spec}
              onClick={() => setNoteSpecialtyFilter(spec)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={
                noteSpecialtyFilter === spec
                  ? { backgroundColor: "#147d64", color: "#fff" }
                  : { backgroundColor: "#f1f5f9", color: "#475569" }
              }
            >
              {spec}
            </button>
          ))}
          <span className="ml-auto text-sm text-slate-500">{filtered.length} template{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Grid */}
        {filtered.length === 0 && (
          <div className="glass rounded-xl p-12 text-center">
            <StickyNote className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No note templates configured yet</p>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((template) => {
            const ntc = noteTypeColors[template.noteType] || { bg: "#f1f5f9", color: "#475569" };
            return (
              <div key={template.id} className="glass rounded-xl p-5 transition-all">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold" style={{ color: "#102a43" }}>{template.name}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                        style={{ backgroundColor: "#f1f5f9", color: "#334e68" }}
                      >
                        {template.specialty}
                      </span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                        style={{ backgroundColor: ntc.bg, color: ntc.color }}
                      >
                        {template.noteType}
                      </span>
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    style={
                      template.status === "active"
                        ? { backgroundColor: "#ecf9ec", color: "#2f8132" }
                        : { backgroundColor: "#fffbeb", color: "#d97706" }
                    }
                  >
                    {template.status === "active" ? "Active" : "Draft"}
                  </span>
                </div>

                {/* SOAP Sections */}
                <div className="space-y-3">
                  {template.sections.map((section) => {
                    const sc = sectionKeyColors[section.key] || { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" };
                    return (
                      <div
                        key={section.key}
                        className="rounded-lg p-3"
                        style={{ backgroundColor: sc.bg, borderLeft: `3px solid ${sc.border}` }}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-bold" style={{ color: sc.color }}>
                            {section.key}
                          </span>
                          <span className="text-xs font-semibold" style={{ color: sc.color }}>
                            {section.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {section.fields.map((field) => (
                            <span
                              key={field}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs"
                              style={{ backgroundColor: "rgba(255,255,255,0.7)", color: "#475569" }}
                            >
                              {field}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Specialty Detail Panel ─────────────────────────────────────────────────

  function renderSpecialtyDetail() {
    if (!selectedSpecialtyDetail) return null;
    const spec = selectedSpecialtyDetail;
    const Icon = spec.icon;
    const detail = SPECIALTY_DETAILS[spec.name] || SPECIALTY_DETAILS["Primary Care"];

    if (!detail) {
      return (
        <div className="animate-page-in space-y-5">
          <button
            onClick={() => setSelectedSpecialtyDetail(null)}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to specialties
          </button>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">{spec.name}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{spec.category}</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-sm text-slate-500">Detail data for this specialty is not yet available.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="animate-page-in space-y-5">
        {/* Back link */}
        <button
          onClick={() => setSelectedSpecialtyDetail(null)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to specialties
        </button>

        {/* Stripe-grade page header */}
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-slate-100"
            >
              <Icon className="w-5 h-5 text-slate-700" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold text-slate-900 tracking-tight truncate">{spec.name}</h2>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                  {spec.code}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {spec.category} · {spec.practiceCount} {spec.practiceCount === 1 ? "practice" : "practices"} · {spec.screeningTools} screening tools
              </p>
            </div>
          </div>
        </div>

        {/* Bootstrap Pack Grid — flat border cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Practices */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Practices</h3>
              <span className="text-xs text-slate-400 tabular-nums">{detail.practices.length}</span>
            </div>
            <div className="space-y-1">
              {detail.practices.map((name) => (
                <div key={name} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-slate-50">
                  <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}>
                    {name.charAt(0)}
                  </div>
                  <span className="text-sm text-slate-700">{name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Screening Tools */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Default screening tools</h3>
              <span className="text-xs text-slate-400 tabular-nums">{detail.screeningTools.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {detail.screeningTools.map((tool) => (
                <span key={tool} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono bg-slate-100 text-slate-700">
                  {tool}
                </span>
              ))}
            </div>
          </div>

          {/* Plan Templates */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Default plan templates</h3>
              <span className="text-xs text-slate-400 tabular-nums">{detail.planTemplates.length}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {detail.planTemplates.map((plan) => (
                <div key={plan.name} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium text-slate-800">{plan.name}</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">${plan.price}<span className="text-xs text-slate-400 font-normal">/mo</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Appointment Types */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Default appointment types</h3>
              <span className="text-xs text-slate-400 tabular-nums">{detail.appointmentTypes.length}</span>
            </div>
            <div className="space-y-1">
              {detail.appointmentTypes.map((apt) => (
                <div key={apt} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-slate-50">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700">{apt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Consent Templates */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileCheck className="w-4 h-4" style={{ color: "#dc2626" }} />
              <h3 className="text-sm font-semibold" style={{ color: "#102a43" }}>Default Consent Templates ({detail.consentTemplates.length})</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.consentTemplates.map((ct) => (
                <span key={ct} className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}>
                  {ct}
                </span>
              ))}
            </div>
          </div>

          {/* Diagnosis Favorites */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4" style={{ color: "#7c3aed" }} />
              <h3 className="text-sm font-semibold" style={{ color: "#102a43" }}>Diagnosis Favorites (ICD-10)</h3>
            </div>
            <div className="space-y-1.5">
              {detail.diagnosisFavorites.map((dx) => (
                <div key={dx.code} className="flex items-start gap-2 py-1.5 px-3 rounded-lg" style={{ backgroundColor: "#f8fafc" }}>
                  <span className="text-xs font-mono font-bold shrink-0 mt-0.5" style={{ color: "#7c3aed" }}>{dx.code}</span>
                  <span className="text-sm text-slate-600">{dx.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Medication Categories */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Pill className="w-4 h-4" style={{ color: "#ea580c" }} />
              <h3 className="text-sm font-semibold" style={{ color: "#102a43" }}>Default Medication Categories ({detail.medicationCategories.length})</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.medicationCategories.map((med) => (
                <span key={med} className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "#fff7ed", color: "#ea580c" }}>
                  {med}
                </span>
              ))}
            </div>
          </div>

          {/* Lab Panels */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Microscope className="w-4 h-4" style={{ color: "#0369a1" }} />
              <h3 className="text-sm font-semibold" style={{ color: "#102a43" }}>Default Lab Panels ({detail.labPanels.length})</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.labPanels.map((lab) => (
                <span key={lab} className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "#e0f2fe", color: "#0369a1" }}>
                  {lab}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Analytics Tab ─────────────────────────────────────────────────────

  function renderAnalytics() {
    const mrrMonths = [
      { label: "Apr", value: 4200 },
      { label: "May", value: 5800 },
      { label: "Jun", value: 7100 },
      { label: "Jul", value: 8400 },
      { label: "Aug", value: 9200 },
      { label: "Sep", value: 10100 },
      { label: "Oct", value: 10900 },
      { label: "Nov", value: 11500 },
      { label: "Dec", value: 12300 },
      { label: "Jan", value: 13100 },
      { label: "Feb", value: 13600 },
      { label: "Mar", value: 14850 },
    ];
    const mrrMax = 14850;

    const revenueBreakdown = [
      { label: "Subscription Revenue", value: "$13,200", pct: "89%" },
      { label: "Add-On Revenue", value: "$1,350", pct: "9%" },
      { label: "Platform Fees", value: "$300", pct: "2%" },
    ];

    const growthStats = [
      { label: "Total Practices", value: "12", change: "+3 this month", positive: true },
      { label: "Total Members", value: "342", change: "+28 this month", positive: true },
      { label: "Avg Members/Practice", value: "28.5", change: "", positive: true },
      { label: "Avg Revenue/Practice", value: "$1,237/mo", change: "", positive: true },
    ];

    const newPracticesByMonth = [
      { label: "Jan", value: 1 },
      { label: "Feb", value: 2 },
      { label: "Mar", value: 1 },
      { label: "Apr", value: 3 },
      { label: "May", value: 2 },
      { label: "Jun", value: 3 },
    ];
    const newMembersByMonth = [
      { label: "Jan", value: 18 },
      { label: "Feb", value: 24 },
      { label: "Mar", value: 31 },
      { label: "Apr", value: 42 },
      { label: "May", value: 38 },
      { label: "Jun", value: 47 },
    ];

    const churnReasons = [
      { label: "Cost too high", pct: 34 },
      { label: "Moving/relocation", pct: 22 },
      { label: "Switching providers", pct: 18 },
      { label: "No longer needed", pct: 14 },
      { label: "Other", pct: 12 },
    ];

    const planUtilization = [
      { plan: "Essential", pct: 67, color: "#27ab83" },
      { plan: "Complete", pct: 82, color: "#334e68" },
      { plan: "Premium", pct: 94, color: "#D4A855" },
    ];

    const topSpecialties = [
      { name: "Psychiatry", count: 128, pct: 37 },
      { name: "Primary Care", count: 98, pct: 29 },
      { name: "Family Medicine", count: 54, pct: 16 },
      { name: "Pediatrics", count: 32, pct: 9 },
      { name: "Other", count: 30, pct: 9 },
    ];

    const cohorts = [
      { label: "Jan 2026", months: ["100%", "94%", "89%", "78%", "\u2014"] },
      { label: "Feb 2026", months: ["100%", "92%", "87%", "\u2014", "\u2014"] },
      { label: "Mar 2026", months: ["100%", "95%", "\u2014", "\u2014", "\u2014"] },
    ];

    function cohortColor(val: string): string {
      if (val === "\u2014") return "transparent";
      const n = parseInt(val);
      if (n >= 90) return "#dcfce7";
      if (n >= 80) return "#fef9c3";
      return "#fee2e2";
    }
    function cohortTextColor(val: string): string {
      if (val === "\u2014") return "#94a3b8";
      const n = parseInt(val);
      if (n >= 90) return "#166534";
      if (n >= 80) return "#854d0e";
      return "#991b1b";
    }

    return (
      <div className="animate-page-in space-y-5">
        {/* Page header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Analytics</h2>
            <p className="text-sm text-slate-500 mt-0.5">Platform-wide revenue, growth, and retention</p>
          </div>
          <RefreshButton onRefresh={loadData} title="Refresh analytics" />
        </div>

        {/* Revenue Section */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Revenue</h3>

          {/* MRR Overview */}
          <div className="glass rounded-xl p-6 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Monthly Recurring Revenue</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#102a43" }}>$14,850</p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs font-semibold" style={{ color: "#2f8132" }}>+12% from last month</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#e6f7f2" }}>
                <TrendingUp className="w-5 h-5" style={{ color: "#27ab83" }} />
              </div>
            </div>
            <div className="flex items-end gap-1.5" style={{ height: "80px" }}>
              {mrrMonths.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${(m.value / mrrMax) * 64}px`,
                      backgroundColor: m.label === "Mar" ? "#27ab83" : "#334e68",
                      opacity: m.label === "Mar" ? 1 : 0.6,
                    }}
                  />
                  <span className="text-xs text-slate-400">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {revenueBreakdown.map((r) => (
              <div key={r.label} className="glass rounded-xl p-5">
                <p className="text-sm font-medium text-slate-500">{r.label}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#102a43" }}>{r.value}</p>
                <p className="text-xs text-slate-400 mt-1">{r.pct} of total</p>
              </div>
            ))}
          </div>
        </div>

        {/* Growth Section */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Growth</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            {growthStats.map((s) => (
              <div key={s.label} className="glass rounded-xl p-5">
                <p className="text-sm font-medium text-slate-500">{s.label}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#102a43" }}>{s.value}</p>
                {s.change && (
                  <div className="flex items-center gap-1 mt-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-xs font-semibold" style={{ color: "#2f8132" }}>{s.change}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Growth Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* New Practices Chart */}
            <div className="glass rounded-xl p-6">
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#102a43" }}>New Practices (Last 6 Months)</h3>
              <div className="flex items-end gap-3" style={{ height: "120px" }}>
                {newPracticesByMonth.map((m) => (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold" style={{ color: "#334e68" }}>{m.value}</span>
                    <div
                      className="w-full rounded-t"
                      style={{ height: `${(m.value / 3) * 80}px`, backgroundColor: "#334e68" }}
                    />
                    <span className="text-xs text-slate-400">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* New Members Chart */}
            <div className="glass rounded-xl p-6">
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#102a43" }}>New Members (Last 6 Months)</h3>
              <div className="flex items-end gap-3" style={{ height: "120px" }}>
                {newMembersByMonth.map((m) => (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold" style={{ color: "#27ab83" }}>{m.value}</span>
                    <div
                      className="w-full rounded-t"
                      style={{ height: `${(m.value / 47) * 80}px`, backgroundColor: "#27ab83" }}
                    />
                    <span className="text-xs text-slate-400">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Churn Section */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Churn</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="glass rounded-xl p-5">
              <p className="text-sm font-medium text-slate-500">Monthly Churn Rate</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold" style={{ color: "#102a43" }}>3.2%</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}>High</span>
              </div>
            </div>
            <div className="glass rounded-xl p-5">
              <p className="text-sm font-medium text-slate-500">Members Lost This Month</p>
              <p className="text-2xl font-bold mt-1" style={{ color: "#102a43" }}>11</p>
            </div>
            <div className="glass rounded-xl p-5">
              <p className="text-sm font-medium text-slate-500">Avg Member Lifetime</p>
              <p className="text-2xl font-bold mt-1" style={{ color: "#102a43" }}>8.4 months</p>
            </div>
          </div>

          {/* Churn Reasons */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-sm font-semibold mb-4" style={{ color: "#102a43" }}>Churn Reasons</h3>
            <div className="space-y-3">
              {churnReasons.map((r) => (
                <div key={r.label} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-40 shrink-0">{r.label}</span>
                  <div className="flex-1 rounded-full overflow-hidden" style={{ backgroundColor: "#f1f5f9", height: "20px" }}>
                    <div className="h-full rounded-full" style={{ width: `${r.pct}%`, backgroundColor: "#334e68" }} />
                  </div>
                  <span className="text-sm font-semibold w-10 text-right" style={{ color: "#102a43" }}>{r.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Utilization Section */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Utilization</h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Visit Utilization by Plan Tier */}
            <div className="glass rounded-xl p-6">
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#102a43" }}>Visit Utilization by Plan Tier</h3>
              <div className="space-y-4">
                {planUtilization.map((p) => (
                  <div key={p.plan}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-600">{p.plan}</span>
                      <span className="text-sm font-semibold" style={{ color: p.color }}>{p.pct}%</span>
                    </div>
                    <div className="w-full rounded-full overflow-hidden" style={{ backgroundColor: "#f1f5f9", height: "10px" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${p.pct}%`, backgroundColor: p.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Specialties */}
            <div className="glass rounded-xl p-6">
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#102a43" }}>Top Specialties by Member Count</h3>
              <div className="space-y-3">
                {topSpecialties.map((s) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 w-28 shrink-0">{s.name}</span>
                    <div className="flex-1 rounded-full overflow-hidden" style={{ backgroundColor: "#f1f5f9", height: "20px" }}>
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: "#27ab83" }} />
                    </div>
                    <span className="text-xs text-slate-500 w-20 text-right">{s.count} ({s.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Retention Cohorts */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Retention cohorts</h3>
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc" }}>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cohort</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Month 1</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Month 2</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Month 3</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Month 6</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Month 12</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cohorts.map((c) => (
                    <tr key={c.label} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3.5 text-sm font-medium" style={{ color: "#102a43" }}>{c.label}</td>
                      {c.months.map((val, i) => (
                        <td key={i} className="px-4 py-3.5 text-center">
                          <span
                            className="inline-flex items-center justify-center px-3 py-1 rounded text-xs font-semibold"
                            style={{ backgroundColor: cohortColor(val), color: cohortTextColor(val) }}
                          >
                            {val}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Billing Tab ──────────────────────────────────────────────────────────

  function renderBilling() {
    const revenueSummary = [
      { label: "Total Revenue (All Time)", value: "$89,400", icon: DollarSign, gradient: "linear-gradient(135deg, #334e68, #243b53)" },
      { label: "This Month", value: "$14,850", icon: TrendingUp, gradient: "linear-gradient(135deg, #27ab83, #147d64)" },
      { label: "Platform Fees Collected", value: "$4,470", icon: CreditCard, gradient: "linear-gradient(135deg, #0369a1, #0c4a6e)" },
      { label: "Outstanding Balances", value: "$2,340", icon: AlertTriangle, gradient: "linear-gradient(135deg, #d97706, #92400e)" },
    ];

    const practiceBilling = [
      { name: "Clearstone Group", plan: "Professional", mrr: "$4,950", members: 45, fee: "$247.50", status: "Active" as const, lastPayment: "Mar 18, 2026" },
      { name: "BellaCare Senior", plan: "Professional", mrr: "$3,200", members: 28, fee: "$160.00", status: "Active" as const, lastPayment: "Mar 17, 2026" },
      { name: "Tranquil Mind", plan: "Starter", mrr: "$1,890", members: 22, fee: "$94.50", status: "Active" as const, lastPayment: "Mar 16, 2026" },
      { name: "Sunrise Pediatrics", plan: "Professional", mrr: "$2,100", members: 18, fee: "$105.00", status: "Trial" as const, lastPayment: "\u2014" },
      { name: "Metro Cardiology", plan: "Starter", mrr: "$980", members: 12, fee: "$49.00", status: "Active" as const, lastPayment: "Mar 15, 2026" },
      { name: "NeuroVista Clinic", plan: "Enterprise", mrr: "$1,730", members: 15, fee: "$86.50", status: "Active" as const, lastPayment: "Mar 14, 2026" },
    ];

    const recentTransactions = [
      { date: "Mar 18", practice: "Clearstone Group", type: "Platform Fee", amount: "$247.50", status: "Completed" },
      { date: "Mar 17", practice: "BellaCare Senior", type: "Platform Fee", amount: "$160.00", status: "Completed" },
      { date: "Mar 16", practice: "Tranquil Mind", type: "Platform Fee", amount: "$94.50", status: "Completed" },
      { date: "Mar 15", practice: "Metro Cardiology", type: "Platform Fee", amount: "$49.00", status: "Completed" },
      { date: "Mar 14", practice: "NeuroVista Clinic", type: "Platform Fee", amount: "$86.50", status: "Completed" },
      { date: "Mar 13", practice: "Clearstone Group", type: "Refund", amount: "-$99.00", status: "Processed" },
    ];

    const dunning = [
      { practice: "Pacific Orthopedics", amount: "$179/mo", failedAgo: "2 days ago", retryNum: 2 },
      { practice: "ClearView ENT", amount: "$99/mo", failedAgo: "5 days ago", retryNum: 3 },
    ];

    function statusBadge(status: string) {
      const map: Record<string, { bg: string; color: string }> = {
        Active: { bg: "#dcfce7", color: "#166534" },
        Trial: { bg: "#dbeafe", color: "#1e40af" },
        "Past Due": { bg: "#fee2e2", color: "#991b1b" },
        Suspended: { bg: "#f1f5f9", color: "#64748b" },
      };
      const s = map[status] || map["Suspended"];
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: s.bg, color: s.color }}>
          {status}
        </span>
      );
    }

    return (
      <div className="animate-page-in space-y-5">
        {/* Page header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Billing</h2>
            <p className="text-sm text-slate-500 mt-0.5">Practice subscriptions, transactions, and dunning</p>
          </div>
          <RefreshButton onRefresh={loadData} title="Refresh billing" />
        </div>

        {/* Revenue Summary — Stripe-style border tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {revenueSummary.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{stat.label}</p>
              <p className="text-xl font-semibold tabular-nums mt-1 text-slate-900">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Stripe Connect Status */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold" style={{ color: "#102a43" }}>Stripe Connect Status</h3>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: "#dcfce7", color: "#166534" }}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Connected
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Account ID</p>
              <p className="text-sm font-mono mt-1" style={{ color: "#334e68" }}>acct_1234...XXXX</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Payout Schedule</p>
              <p className="text-sm font-medium mt-1" style={{ color: "#334e68" }}>Daily</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Next Payout</p>
              <p className="text-sm font-medium mt-1" style={{ color: "#334e68" }}>$1,240 on March 20, 2026</p>
            </div>
            <div className="flex items-end">
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors" style={{ backgroundColor: "#334e68" }}>
                <ExternalLink className="w-4 h-4" />
                View Stripe Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Practice Billing Table */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Practice billing</h3>
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc" }}>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Practice</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">MRR</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Members</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Platform Fee</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {practiceBilling.map((p) => (
                    <tr key={p.name} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3.5 text-sm font-medium" style={{ color: "#102a43" }}>{p.name}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">{p.plan}</td>
                      <td className="px-4 py-3.5 text-sm font-semibold" style={{ color: "#102a43" }}>{p.mrr}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">{p.members}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">{p.fee}</td>
                      <td className="px-4 py-3.5">{statusBadge(p.status)}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-500">{p.lastPayment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Recent transactions</h3>
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc" }}>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Practice</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentTransactions.map((t, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3.5 text-sm text-slate-600">{t.date}</td>
                      <td className="px-4 py-3.5 text-sm font-medium" style={{ color: "#102a43" }}>{t.practice}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                          style={{
                            backgroundColor: t.type === "Refund" ? "#fee2e2" : "#dbeafe",
                            color: t.type === "Refund" ? "#991b1b" : "#1e40af",
                          }}
                        >
                          {t.type}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold" style={{ color: t.amount.startsWith("-") ? "#dc2626" : "#102a43" }}>{t.amount}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: "#dcfce7", color: "#166534" }}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Dunning Queue */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Dunning queue</h3>
          <div className="space-y-3">
            {dunning.map((d) => (
              <div key={d.practice} className="glass rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#fee2e2" }}>
                    <AlertTriangle className="w-5 h-5" style={{ color: "#dc2626" }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#102a43" }}>{d.practice}</p>
                    <p className="text-xs text-slate-500">{d.amount} failed {d.failedAgo} &middot; Retry #{d.retryNum}</p>
                  </div>
                </div>
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: d.retryNum < 3 ? "#334e68" : "#dc2626" }}
                >
                  {d.retryNum < 3 ? (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Retry Now
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Contact Practice
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Support Tab ──────────────────────────────────────────────────────────

  function renderSupport() {
    const supportStats = [
      { label: "Open Tickets", value: "8", icon: MessageSquare, gradient: "linear-gradient(135deg, #334e68, #243b53)" },
      { label: "Avg Response Time", value: "2.4 hours", icon: Clock, gradient: "linear-gradient(135deg, #27ab83, #147d64)" },
      { label: "Resolution Rate", value: "94%", icon: CheckCircle2, gradient: "linear-gradient(135deg, #0369a1, #0c4a6e)" },
      { label: "This Week", value: "12 tickets", icon: Activity, gradient: "linear-gradient(135deg, #d97706, #92400e)" },
    ];

    const tickets = [
      { id: "#1024", subject: "Can't configure Stripe", practice: "Clearstone Group", priority: "High" as const, status: "Open" as const, created: "2 hours ago", assignedTo: "\u2014" },
      { id: "#1023", subject: "Patient can't log in", practice: "BellaCare Senior", priority: "Medium" as const, status: "In Progress" as const, created: "5 hours ago", assignedTo: "Sarah M." },
      { id: "#1022", subject: "Need to add provider", practice: "Tranquil Mind", priority: "Low" as const, status: "Open" as const, created: "1 day ago", assignedTo: "\u2014" },
      { id: "#1021", subject: "Billing discrepancy", practice: "Metro Cardiology", priority: "High" as const, status: "In Progress" as const, created: "1 day ago", assignedTo: "Admin" },
      { id: "#1020", subject: "Custom screening tool", practice: "NeuroVista", priority: "Medium" as const, status: "Resolved" as const, created: "2 days ago", assignedTo: "Sarah M." },
      { id: "#1019", subject: "HIPAA compliance Q", practice: "Sunrise Pediatrics", priority: "Low" as const, status: "Resolved" as const, created: "3 days ago", assignedTo: "Admin" },
      { id: "#1018", subject: "Import patient data", practice: "Pacific Ortho", priority: "Medium" as const, status: "Open" as const, created: "3 days ago", assignedTo: "\u2014" },
      { id: "#1017", subject: "Plan pricing change", practice: "ClearView ENT", priority: "Low" as const, status: "Resolved" as const, created: "4 days ago", assignedTo: "Admin" },
    ];

    const filterTabs = ["All", "Open", "In Progress", "Resolved"];

    const filteredTickets = supportFilter === "All"
      ? tickets
      : tickets.filter((t) => t.status === supportFilter);

    function priorityBadge(priority: "High" | "Medium" | "Low") {
      const map = {
        High: { bg: "#fee2e2", color: "#991b1b" },
        Medium: { bg: "#fef3c7", color: "#92400e" },
        Low: { bg: "#f1f5f9", color: "#64748b" },
      };
      const s = map[priority];
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: s.bg, color: s.color }}>
          {priority}
        </span>
      );
    }

    function statusBadge(status: "Open" | "In Progress" | "Resolved") {
      const map = {
        Open: { bg: "#dbeafe", color: "#1e40af" },
        "In Progress": { bg: "#fef3c7", color: "#92400e" },
        Resolved: { bg: "#dcfce7", color: "#166534" },
      };
      const s = map[status];
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: s.bg, color: s.color }}>
          {status}
        </span>
      );
    }

    const ticketConversations: Record<string, { sender: string; role: string; message: string; time: string }[]> = {
      "#1024": [
        { sender: "Dr. James Chen", role: "Practice Owner", message: "We're trying to connect our Stripe account but keep getting an error about verification. We've uploaded all documents already.", time: "2 hours ago" },
        { sender: "System", role: "Auto-Reply", message: "Thank you for reaching out. A support team member will respond shortly.", time: "2 hours ago" },
      ],
      "#1023": [
        { sender: "Maria Lopez", role: "Office Manager", message: "One of our patients, John D., says he can't log in to the patient portal. He's tried resetting his password twice.", time: "5 hours ago" },
        { sender: "Sarah M.", role: "Support", message: "I've looked into this. The patient's account was locked after 5 failed attempts. I've unlocked it and sent a password reset email. Can you confirm the patient received it?", time: "4 hours ago" },
        { sender: "Maria Lopez", role: "Office Manager", message: "He got the email and can now log in. Thank you!", time: "3 hours ago" },
      ],
      "#1021": [
        { sender: "Front Desk", role: "Staff", message: "Our February invoice shows $980 but we should only have 10 members, not 12. Two members cancelled mid-month.", time: "1 day ago" },
        { sender: "Admin", role: "Support", message: "I'm reviewing the billing records now. It looks like the cancellations were processed on Feb 28, so they were counted for the full month. I'll issue a prorated credit.", time: "20 hours ago" },
      ],
    };

    return (
      <div className="animate-page-in space-y-5">
        {/* Page header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Support</h2>
            <p className="text-sm text-slate-500 mt-0.5">Practice tickets, escalations, and SLA tracking</p>
          </div>
          <RefreshButton onRefresh={loadData} title="Refresh tickets" />
        </div>

        {/* Support Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {supportStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="glass hover-lift rounded-xl p-5 relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                    <p className="text-2xl font-bold mt-1" style={{ color: "#102a43" }}>{stat.value}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: stat.gradient }}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Ticket List */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Support tickets</h2>
            <div className="flex items-center gap-2">
              {filterTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setSupportFilter(tab); setSelectedTicket(null); }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: supportFilter === tab ? "#334e68" : "transparent",
                    color: supportFilter === tab ? "#ffffff" : "#64748b",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc" }}>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Practice</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map((t) => (
                    <>
                      <tr
                        key={t.id}
                        className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedTicket(selectedTicket === t.id ? null : t.id)}
                      >
                        <td className="px-6 py-3.5 text-sm font-mono font-semibold" style={{ color: "#334e68" }}>{t.id}</td>
                        <td className="px-4 py-3.5 text-sm font-medium" style={{ color: "#102a43" }}>{t.subject}</td>
                        <td className="px-4 py-3.5 text-sm text-slate-600">{t.practice}</td>
                        <td className="px-4 py-3.5">{priorityBadge(t.priority)}</td>
                        <td className="px-4 py-3.5">{statusBadge(t.status)}</td>
                        <td className="px-4 py-3.5 text-sm text-slate-500">{t.created}</td>
                        <td className="px-4 py-3.5 text-sm text-slate-600">{t.assignedTo}</td>
                      </tr>
                      {selectedTicket === t.id && (
                        <tr key={`${t.id}-detail`}>
                          <td colSpan={7} className="px-6 py-4" style={{ backgroundColor: "#f8fafc" }}>
                            <div className="space-y-4">
                              {/* Conversation Thread */}
                              <div className="space-y-3">
                                <h4 className="text-sm font-semibold" style={{ color: "#102a43" }}>Conversation</h4>
                                {(ticketConversations[t.id] || [{ sender: t.practice, role: "Practice", message: `Submitted: ${t.subject}`, time: t.created }]).map((msg, i) => (
                                  <div key={i} className="flex gap-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: msg.role === "Support" || msg.role === "Auto-Reply" ? "#e6f7f2" : "#e0e8f0" }}>
                                      <Users className="w-4 h-4" style={{ color: msg.role === "Support" || msg.role === "Auto-Reply" ? "#27ab83" : "#334e68" }} />
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold" style={{ color: "#102a43" }}>{msg.sender}</span>
                                        <span className="text-xs text-slate-400">{msg.role}</span>
                                        <span className="text-xs text-slate-400">&middot; {msg.time}</span>
                                      </div>
                                      <p className="text-sm text-slate-600 mt-1">{msg.message}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Reply Area */}
                              <div className="flex gap-3">
                                <textarea
                                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                                  style={{ outlineColor: "#27ab83" }}
                                  placeholder="Type a reply..."
                                  rows={2}
                                />
                                <button className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white self-end transition-colors" style={{ backgroundColor: "#635bff" }}>
                                  <Send className="w-4 h-4" />
                                  Send Reply
                                </button>
                              </div>

                              {/* Quick Actions */}
                              <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                                <div className="flex items-center gap-2">
                                  <label className="text-xs font-medium text-slate-500">Status:</label>
                                  <select className="text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none" defaultValue={t.status}>
                                    <option>Open</option>
                                    <option>In Progress</option>
                                    <option>Resolved</option>
                                  </select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs font-medium text-slate-500">Assign to:</label>
                                  <select className="text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none" defaultValue={t.assignedTo === "\u2014" ? "" : t.assignedTo}>
                                    <option value="">Unassigned</option>
                                    <option>Sarah M.</option>
                                    <option>Admin</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Knowledge Base Quick Stats */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#e0e8f0" }}>
              <BookOpen className="w-5 h-5" style={{ color: "#334e68" }} />
            </div>
            <h3 className="text-lg font-bold" style={{ color: "#102a43" }}>Knowledge Base</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Articles Published</p>
              <p className="text-xl font-bold mt-1" style={{ color: "#102a43" }}>24</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Most Viewed</p>
              <p className="text-sm font-medium mt-1" style={{ color: "#334e68" }}>How to set up membership plans</p>
              <p className="text-xs text-slate-400">342 views</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Search Queries This Week</p>
              <p className="text-xl font-bold mt-1" style={{ color: "#102a43" }}>89</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Tab Router ──────────────────────────────────────────────────────────

  function renderContent() {
    // If a practice is selected, show its detail page regardless of tab
    if (selectedPractice) {
      return renderPracticeDetail();
    }

    // If a specialty detail is selected, show its detail page
    if (selectedSpecialtyDetail && activeTab === "specialties") {
      return renderSpecialtyDetail();
    }

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
        return renderPendingApprovals();
      case "screening-library":
        return renderScreeningLibrary();
      case "consent-templates":
        return renderConsentTemplates();
      case "note-templates":
        return renderNoteTemplates();
      case "programs":
        return <ProgramTemplatesTab />;
      case "analytics":
        return renderAnalytics();
      case "platform-plans":
        return <PlatformPlansSection />;
      case "billing":
        return renderBilling();
      case "support":
        return renderSupport();
      case "settings":
        return <PlatformSettings />;
      case "profile":
        return <ProfilePage onBack={() => setActiveTab("dashboard")} />;
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
      <div className="lg:pl-60 min-h-screen flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 h-14">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md hover:bg-slate-100 transition-colors"
              >
                <Menu className="w-5 h-5 text-slate-600" />
              </button>
              <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
                {selectedPractice ? selectedPractice.name : (currentNavItem?.label || "Dashboard")}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-medium text-emerald-700">
                  All Systems Operational
                </span>
              </div>
              <HeaderToolbar variant="superadmin" onNavigate={(tab) => setActiveTab(tab as TabId)} />
            </div>
          </div>
        </header>

        {/* Loading indicator */}
        {adminLoading && (
          <div className="h-0.5 w-full overflow-hidden bg-slate-100">
            <div className="h-full animate-pulse" style={{ backgroundColor: "#635bff", width: "40%", animationDuration: "1s" }} />
          </div>
        )}

        {/* Page Content */}
        <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
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

      {/* Command Palette — Cmd+K / Ctrl+K to jump to any section. */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={NAV_SECTIONS.flatMap((section) =>
          section.items.map((it) => ({
            id: it.id,
            label: it.label,
            hint: section.title,
            icon: it.icon as React.ComponentType<{ className?: string }>,
          })),
        )}
        onSelect={(id) => setActiveTab(id as TabId)}
      />
    </div>
  );
}
