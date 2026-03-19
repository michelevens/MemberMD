// ===== SuperAdmin Portal =====
// Platform admin dashboard for managing all practices (tenants) on MemberMD

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { practiceService, dashboardService } from "../../lib/api";
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
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Globe,
  Hash,
  CheckCircle2,
  XCircle,
  UserCheck,
  Star,
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
  const [apiPractices, setApiPractices] = useState<MockPractice[] | null>(null);
  const [apiStats, setApiStats] = useState<Record<string, number> | null>(null);
  const [selectedPractice, setSelectedPractice] = useState<MockPractice | null>(null);
  const [pendingPractices, setPendingPractices] = useState<MockPendingPractice[]>(MOCK_PENDING_PRACTICES);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);

  const userName = auth.user
    ? `${auth.user.firstName} ${auth.user.lastName}`
    : "Platform Admin";

  // ─── Fetch real data from API ─────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [practicesRes, statsRes] = await Promise.all([
        practiceService.list(),
        dashboardService.getStats(),
      ]);
      if (practicesRes.data && Array.isArray(practicesRes.data)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setApiPractices(practicesRes.data.map((p: any) => ({
          id: p.id || "",
          name: p.name || "",
          specialty: p.specialty || "",
          model: p.practiceModel || p.practice_model || "",
          city: (p.city || "") + (p.state ? ", " + p.state : ""),
          state: p.state || "",
          providers: p.providerCount || p.providers_count || 0,
          members: p.memberCount || p.member_count || p.patients_count || 0,
          mrr: 0,
          status: (p.status || (p.isActive || p.is_active ? "active" : "suspended")) as "active" | "trial" | "suspended",
          joinedAt: p.createdAt || p.created_at || "",
        })));
      }
      if (statsRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setApiStats(statsRes.data as any);
      }
    } catch {
      // Fall back to mock data
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const practices = apiPractices || MOCK_PRACTICES;

  // ─── Computed stats ──────────────────────────────────────────────────────

  const totalPractices = apiStats?.total_practices ?? apiStats?.totalPractices ?? practices.length;
  const totalMembers = apiStats?.total_patients ?? apiStats?.totalPatients ?? practices.reduce((sum, p) => sum + p.members, 0);
  const platformMRR = practices.reduce((sum, p) => sum + p.mrr, 0);
  const activeTrials = practices.filter((p) => p.status === "trial" || p.status === "pending").length + pendingPractices.length;

  // ─── Filtered practices ──────────────────────────────────────────────────

  const filteredPractices = practiceSearch
    ? practices.filter(
        (p) =>
          p.name.toLowerCase().includes(practiceSearch.toLowerCase()) ||
          p.specialty.toLowerCase().includes(practiceSearch.toLowerCase()) ||
          p.city.toLowerCase().includes(practiceSearch.toLowerCase())
      )
    : practices;

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
                        setSelectedPractice(null);
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

    const recentPractices = practices.slice(0, 6);

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
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedPractice(practice)}
                    >
                      <td className="px-6 py-3.5">
                        <div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedPractice(practice); }}
                            className="text-sm font-medium hover:underline text-left"
                            style={{ color: "#102a43" }}
                          >
                            {practice.name}
                          </button>
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
              {practices.length} practices on the platform
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
                          <button
                            onClick={() => setSelectedPractice(practice)}
                            className="text-sm font-medium hover:underline text-left"
                            style={{ color: "#102a43" }}
                          >
                            {practice.name}
                          </button>
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
                          onClick={() => setSelectedPractice(practice)}
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

  // ─── Pending Approvals Tab ─────────────────────────────────────────────

  function renderPendingApprovals() {
    return (
      <div className="animate-page-in space-y-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "#102a43" }}>
            Pending Approvals
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {pendingPractices.length} practice{pendingPractices.length !== 1 ? "s" : ""} awaiting review
          </p>
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

        {pendingPractices.length === 0 ? (
          <div className="glass rounded-xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#ecf9ec" }}>
              <CheckCircle2 className="w-8 h-8" style={{ color: "#2f8132" }} />
            </div>
            <h3 className="text-lg font-semibold mb-1" style={{ color: "#102a43" }}>All Caught Up</h3>
            <p className="text-sm text-slate-500">No pending practice approvals at this time.</p>
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc" }}>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Practice</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Specialty</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Owner</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Submitted</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingPractices.map((practice) => (
                    <tr key={practice.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold text-white"
                            style={{ background: "linear-gradient(135deg, #d97706, #92400e)" }}
                          >
                            {practice.name.charAt(0)}
                          </div>
                          <div>
                            <button
                              onClick={() => setSelectedPractice(practice)}
                              className="text-sm font-medium hover:underline text-left"
                              style={{ color: "#102a43" }}
                            >
                              {practice.name}
                            </button>
                            <p className="text-xs text-slate-400">{practice.city}, {practice.state}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: "#e0f2fe", color: "#0369a1" }}
                        >
                          {practice.specialty}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium" style={{ color: "#102a43" }}>{practice.ownerName}</p>
                        <p className="text-xs text-slate-400">{practice.ownerEmail}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-slate-600">{practice.submittedAt}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setApprovalMessage(`${practice.name} has been approved and is now active.`);
                              setPendingPractices((prev) => prev.filter((p) => p.id !== practice.id));
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                            style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Reject ${practice.name}? This cannot be undone.`)) {
                                setPendingPractices((prev) => prev.filter((p) => p.id !== practice.id));
                                setApprovalMessage(`${practice.name} has been rejected.`);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            style={{ border: "1px solid #ef4444", color: "#dc2626", backgroundColor: "transparent" }}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                          <button
                            onClick={() => setSelectedPractice(practice)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                            title="View details"
                          >
                            <Eye className="w-4 h-4 text-slate-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Practice Detail Page ─────────────────────────────────────────────

  function renderPracticeDetail() {
    if (!selectedPractice) return null;
    const p = selectedPractice;
    const plans = getMockPlans(p.specialty);
    const members = getMockMembers(p.name, p.specialty);
    const providers = getMockProviders(p.name, p.providers);
    const activity = getMockActivity(p.name);

    return (
      <div className="animate-page-in space-y-6">
        {/* Header Bar */}
        <div className="glass rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedPractice(null)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5" style={{ color: "#334e68" }} />
              </button>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0"
                style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
              >
                {p.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold" style={{ color: "#102a43" }}>{p.name}</h2>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{p.specialty} &middot; {p.model} &middot; {p.city}, {p.state}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-14 sm:pl-0">
              {p.status === "pending" && (
                <button
                  onClick={() => {
                    setSelectedPractice({ ...p, status: "active" });
                    setApprovalMessage(`${p.name} has been approved.`);
                    setPendingPractices((prev) => prev.filter((pp) => pp.id !== p.id));
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve
                </button>
              )}
              {p.status !== "suspended" && (
                <button
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{ border: "1px solid #ef4444", color: "#dc2626", backgroundColor: "transparent" }}
                >
                  <Shield className="w-4 h-4" />
                  Suspend
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Members", value: formatNumber(p.members), icon: Users, gradient: "linear-gradient(135deg, #334e68, #243b53)" },
            { label: "Providers", value: formatNumber(p.providers), icon: Stethoscope, gradient: "linear-gradient(135deg, #27ab83, #147d64)" },
            { label: "Monthly Revenue", value: formatCurrency(p.mrr), icon: DollarSign, gradient: "linear-gradient(135deg, #0369a1, #0c4a6e)" },
            { label: "Plan", value: p.specialty, subvalue: p.model, icon: FileText, gradient: "linear-gradient(135deg, #7c3aed, #5b21b6)" },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="glass rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{stat.label}</p>
                    <p className="text-xl font-bold mt-1" style={{ color: "#102a43" }}>{stat.value}</p>
                    {stat.subvalue && <p className="text-xs text-slate-400 mt-0.5">{stat.subvalue}</p>}
                  </div>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: stat.gradient }}>
                    <Icon className="w-4.5 h-4.5 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Practice Info */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-base font-semibold mb-4" style={{ color: "#102a43" }}>Practice Information</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              {[
                { icon: Building2, label: "Name", value: p.name },
                { icon: Stethoscope, label: "Specialty", value: p.specialty },
                { icon: Star, label: "Practice Model", value: p.model },
                { icon: Hash, label: "Tenant Code", value: p.tenantCode || `TC${p.id.toUpperCase().slice(0, 4)}` },
                { icon: Mail, label: "Owner Email", value: p.ownerEmail || `admin@${p.name.toLowerCase().replace(/\s+/g, "")}.com` },
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
                { icon: Phone, label: "Phone", value: p.phone || "(555) 000-0000" },
                { icon: MapPin, label: "Address", value: p.address || "123 Main St" },
                { icon: MapPin, label: "City/State", value: `${p.city}, ${p.state}` },
                { icon: Globe, label: "Website", value: p.website || "-" },
                { icon: Hash, label: "NPI", value: p.npi || "-" },
                { icon: FileText, label: "Tax ID", value: p.taxId || "-" },
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
          <div className="px-6 py-4 border-b border-slate-200/60">
            <h3 className="text-base font-semibold" style={{ color: "#102a43" }}>Members</h3>
            <p className="text-xs text-slate-500 mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""} enrolled</p>
          </div>
          {members.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500">No members yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc" }}>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Visit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
                          >
                            {member.name.split(" ").map(n => n[0]).join("")}
                          </div>
                          <span className="text-sm font-medium" style={{ color: "#102a43" }}>{member.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><PlanBadge plan={member.plan} /></td>
                      <td className="px-4 py-3.5 text-center"><MemberStatusBadge status={member.status} /></td>
                      <td className="px-4 py-3.5 text-sm text-slate-500">
                        {new Date(member.joined).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-500">
                        {member.lastVisit === "-" ? "-" : new Date(member.lastVisit).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

  // ─── Tab Router ──────────────────────────────────────────────────────────

  function renderContent() {
    // If a practice is selected, show its detail page regardless of tab
    if (selectedPractice) {
      return renderPracticeDetail();
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
                  {selectedPractice ? selectedPractice.name : (currentNavItem?.label || "Dashboard")}
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
