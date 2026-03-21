// ===== Programs Section (Practice Portal) =====
// Practice-level program management: view, configure, and manage program enrollments

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Heart,
  Activity,
  Brain,
  Zap,
  Crown,
  Shield,
  Stethoscope,
  Users,
  Plus,
  Search,
  Eye,
  Pencil,
  MoreHorizontal,
  CheckCircle2,
  DollarSign,
  UserPlus,
  Layers,
  BarChart3,
  PlayCircle,
  PauseCircle,
  X,
  Loader2,
  Check,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { programService, patientService, providerService, apiFetch, membershipPlanService } from "../../lib/api";

const isDemoMode = import.meta.env.VITE_DEMO_MODE !== "false";

// ─── Icon Mapping (API returns string name, UI needs component) ─────────────

const ICON_MAP: Record<string, React.ElementType> = {
  heart: Heart,
  activity: Activity,
  brain: Brain,
  zap: Zap,
  crown: Crown,
  shield: Shield,
  stethoscope: Stethoscope,
  users: Users,
};

function resolveIcon(iconName?: string | null): React.ElementType {
  if (!iconName) return Layers;
  return ICON_MAP[iconName.toLowerCase()] || Layers;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface MockProgram {
  id: string;
  name: string;
  code: string;
  type: "membership" | "sponsor_based" | "insurance_billed" | "grant_funded" | "hybrid";
  description: string;
  icon: React.ElementType;
  status: "draft" | "active" | "paused" | "archived";
  durationType: "ongoing" | "fixed_term";
  durationMonths: number | null;
  currentEnrollment: number;
  maxEnrollment: number | null;
  providerCount: number;
  monthlyRevenue: number;
  plans: MockProgramPlan[];
  enrollments: MockEnrollment[];
  providers: MockProgramProvider[];
  eligibilityRules: MockEligibilityRule[];
  fundingSources: MockFundingSource[];
}

interface MockProgramPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  entitlements: string[];
  badge: string | null;
  enrolledCount: number;
  isActive: boolean;
}

interface RealMembershipPlan {
  id: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  annualPrice: number | null;
  membershipsCount: number;
  planEntitlements: Array<{
    id: string;
    entitlementType: { id: string; name: string; slug: string } | null;
    limitValue: number | null;
  }>;
  badgeText: string | null;
  isActive: boolean;
  programId: string | null;
}

interface MockEnrollment {
  id: string;
  patientName: string;
  planName: string;
  status: "active" | "pending" | "paused" | "completed" | "cancelled";
  fundingSource: string;
  sponsorName: string | null;
  enrolledAt: string;
  expiresAt: string | null;
}

interface MockProgramProvider {
  id: string;
  name: string;
  credentials: string;
  role: string;
  panelCapacity: number;
  panelCurrent: number;
  isActive: boolean;
}

interface MockEligibilityRule {
  ruleType: string;
  description: string;
  isRequired: boolean;
}

interface MockFundingSource {
  sourceType: string;
  name: string;
  cptCode: string | null;
  billingFrequency: string;
  isPrimary: boolean;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_PROGRAMS: MockProgram[] = [
  {
    id: "my-prog-1",
    name: "DPC Membership",
    code: "DPC",
    type: "membership",
    description: "Our core direct primary care membership offering unlimited office visits, messaging, and basic labs.",
    icon: Heart,
    status: "active",
    durationType: "ongoing",
    durationMonths: null,
    currentEnrollment: 85,
    maxEnrollment: 150,
    providerCount: 2,
    monthlyRevenue: 14915,
    plans: [
      {
        id: "pl-1", name: "Essential", monthlyPrice: 99, annualPrice: 1069,
        entitlements: ["2 visits/month", "48hr messaging SLA", "Annual wellness exam", "Basic labs"],
        badge: null, enrolledCount: 45, isActive: true,
      },
      {
        id: "pl-2", name: "Complete", monthlyPrice: 199, annualPrice: 2149,
        entitlements: ["4 visits/month", "Telehealth included", "24hr messaging SLA", "Comprehensive labs", "Mental health check-ins"],
        badge: "Most Popular", enrolledCount: 28, isActive: true,
      },
      {
        id: "pl-3", name: "Premium", monthlyPrice: 299, annualPrice: 3229,
        entitlements: ["Unlimited visits", "Unlimited telehealth", "4hr messaging SLA", "Full labs + imaging", "Same-day appointments"],
        badge: "VIP", enrolledCount: 12, isActive: true,
      },
    ],
    enrollments: [
      { id: "e1", patientName: "James Wilson", planName: "Complete", status: "active", fundingSource: "Self-Pay", sponsorName: null, enrolledAt: "Jan 15, 2026", expiresAt: null },
      { id: "e2", patientName: "Sarah Mitchell", planName: "Complete", status: "active", fundingSource: "Self-Pay", sponsorName: null, enrolledAt: "Feb 1, 2026", expiresAt: null },
      { id: "e3", patientName: "James Rivera", planName: "Premium", status: "active", fundingSource: "Self-Pay", sponsorName: null, enrolledAt: "Jan 10, 2026", expiresAt: null },
      { id: "e4", patientName: "Emily Chen", planName: "Essential", status: "active", fundingSource: "Self-Pay", sponsorName: null, enrolledAt: "Mar 1, 2026", expiresAt: null },
      { id: "e5", patientName: "Michael Thompson", planName: "Complete", status: "paused", fundingSource: "Self-Pay", sponsorName: null, enrolledAt: "Dec 15, 2025", expiresAt: null },
      { id: "e6", patientName: "Lisa Patel", planName: "Essential", status: "active", fundingSource: "Self-Pay", sponsorName: null, enrolledAt: "Feb 20, 2026", expiresAt: null },
      { id: "e7", patientName: "Robert Kim", planName: "Premium", status: "active", fundingSource: "Self-Pay", sponsorName: null, enrolledAt: "Nov 1, 2025", expiresAt: null },
      { id: "e8", patientName: "Angela Foster", planName: "Complete", status: "cancelled", fundingSource: "Self-Pay", sponsorName: null, enrolledAt: "Oct 1, 2025", expiresAt: null },
    ],
    providers: [
      { id: "pv1", name: "Dr. Nageley Michel", credentials: "MD", role: "Lead Provider", panelCapacity: 100, panelCurrent: 62, isActive: true },
      { id: "pv2", name: "NP Jennifer Johnson", credentials: "APRN, FNP-C", role: "Provider", panelCapacity: 80, panelCurrent: 23, isActive: true },
    ],
    eligibilityRules: [
      { ruleType: "age", description: "Patient age 18+ (or family plan)", isRequired: false },
      { ruleType: "geography", description: "Within practice service area", isRequired: false },
    ],
    fundingSources: [
      { sourceType: "stripe_subscription", name: "Patient Subscription", cptCode: null, billingFrequency: "monthly", isPrimary: true },
    ],
  },
  {
    id: "my-prog-2",
    name: "Chronic Care Management",
    code: "CCM",
    type: "insurance_billed",
    description: "CMS-reimbursed chronic care management for patients with 2+ chronic conditions. Care coordination and monthly check-ins.",
    icon: Activity,
    status: "active",
    durationType: "ongoing",
    durationMonths: null,
    currentEnrollment: 34,
    maxEnrollment: null,
    providerCount: 2,
    monthlyRevenue: 4080,
    plans: [
      {
        id: "pl-4", name: "CCM Standard", monthlyPrice: 0, annualPrice: 0,
        entitlements: ["20 min/month care coordination", "Care plan development", "Medication management", "Monthly check-in call"],
        badge: null, enrolledCount: 22, isActive: true,
      },
      {
        id: "pl-5", name: "CCM Complex", monthlyPrice: 0, annualPrice: 0,
        entitlements: ["60 min/month care coordination", "Complex care plan", "Specialist coordination", "Weekly check-in", "Remote monitoring review"],
        badge: "Complex", enrolledCount: 12, isActive: true,
      },
    ],
    enrollments: [
      { id: "e9", patientName: "Dorothy Lewis", planName: "CCM Standard", status: "active", fundingSource: "Medicare", sponsorName: null, enrolledAt: "Nov 1, 2025", expiresAt: null },
      { id: "e10", patientName: "Walter Johnson", planName: "CCM Complex", status: "active", fundingSource: "Medicare", sponsorName: null, enrolledAt: "Dec 1, 2025", expiresAt: null },
      { id: "e11", patientName: "Harold Mitchell", planName: "CCM Standard", status: "active", fundingSource: "Medicare", sponsorName: null, enrolledAt: "Jan 15, 2026", expiresAt: null },
    ],
    providers: [
      { id: "pv1", name: "Dr. Nageley Michel", credentials: "MD", role: "Supervising Physician", panelCapacity: 50, panelCurrent: 20, isActive: true },
      { id: "pv2", name: "NP Jennifer Johnson", credentials: "APRN, FNP-C", role: "Care Coordinator", panelCapacity: 40, panelCurrent: 14, isActive: true },
    ],
    eligibilityRules: [
      { ruleType: "condition_count", description: "Patient has 2+ chronic conditions", isRequired: true },
      { ruleType: "consent", description: "Signed CCM consent form", isRequired: true },
      { ruleType: "insurance", description: "Medicare Part B or qualifying insurance", isRequired: true },
    ],
    fundingSources: [
      { sourceType: "insurance_claim", name: "Medicare Part B (CPT 99490)", cptCode: "99490", billingFrequency: "monthly", isPrimary: true },
      { sourceType: "insurance_claim", name: "Complex CCM (CPT 99487)", cptCode: "99487", billingFrequency: "monthly", isPrimary: false },
    ],
  },
  {
    id: "my-prog-3",
    name: "Employer Wellness — TechCorp",
    code: "TCORP-WELL",
    type: "sponsor_based",
    description: "Corporate wellness program for TechCorp Inc. employees. Includes annual screenings, coaching, and preventive visits.",
    icon: Shield,
    status: "active",
    durationType: "fixed_term",
    durationMonths: 12,
    currentEnrollment: 48,
    maxEnrollment: 75,
    providerCount: 2,
    monthlyRevenue: 7200,
    plans: [
      {
        id: "pl-6", name: "Employee Standard", monthlyPrice: 0, annualPrice: 0,
        entitlements: ["Annual biometric screening", "2 wellness visits/year", "Health risk assessment", "Flu shots"],
        badge: null, enrolledCount: 35, isActive: true,
      },
      {
        id: "pl-7", name: "Employee Enhanced", monthlyPrice: 0, annualPrice: 0,
        entitlements: ["All Standard benefits", "Monthly coaching sessions", "Telehealth access", "Stress management workshops"],
        badge: "Enhanced", enrolledCount: 13, isActive: true,
      },
    ],
    enrollments: [
      { id: "e12", patientName: "Alex Johnson", planName: "Employee Standard", status: "active", fundingSource: "Employer", sponsorName: "TechCorp Inc.", enrolledAt: "Jan 1, 2026", expiresAt: "Dec 31, 2026" },
      { id: "e13", patientName: "Maria Garcia", planName: "Employee Enhanced", status: "active", fundingSource: "Employer", sponsorName: "TechCorp Inc.", enrolledAt: "Jan 1, 2026", expiresAt: "Dec 31, 2026" },
      { id: "e14", patientName: "David Park", planName: "Employee Standard", status: "active", fundingSource: "Employer", sponsorName: "TechCorp Inc.", enrolledAt: "Feb 15, 2026", expiresAt: "Dec 31, 2026" },
    ],
    providers: [
      { id: "pv1", name: "Dr. Nageley Michel", credentials: "MD", role: "Program Director", panelCapacity: 50, panelCurrent: 30, isActive: true },
      { id: "pv2", name: "NP Jennifer Johnson", credentials: "APRN, FNP-C", role: "Wellness Coach", panelCapacity: 40, panelCurrent: 18, isActive: true },
    ],
    eligibilityRules: [
      { ruleType: "employer", description: "Active TechCorp employee", isRequired: true },
      { ruleType: "employment_status", description: "Full-time employment status", isRequired: true },
    ],
    fundingSources: [
      { sourceType: "employer_invoice", name: "TechCorp Monthly PEPM", cptCode: null, billingFrequency: "monthly", isPrimary: true },
    ],
  },
  {
    id: "my-prog-4",
    name: "Health Coaching (6-month)",
    code: "COACH-6M",
    type: "hybrid",
    description: "Structured 6-month wellness coaching program for lifestyle modification, nutrition guidance, and exercise programming.",
    icon: Zap,
    status: "draft",
    durationType: "fixed_term",
    durationMonths: 6,
    currentEnrollment: 0,
    maxEnrollment: 20,
    providerCount: 0,
    monthlyRevenue: 0,
    plans: [
      {
        id: "pl-8", name: "Foundation", monthlyPrice: 79, annualPrice: 0,
        entitlements: ["Bi-weekly coaching sessions", "Goal setting & tracking", "Nutrition guidance", "Exercise programming"],
        badge: null, enrolledCount: 0, isActive: true,
      },
      {
        id: "pl-9", name: "Intensive", monthlyPrice: 149, annualPrice: 0,
        entitlements: ["Weekly coaching sessions", "Meal planning", "Fitness tracking integration", "Biometric monitoring", "Group workshops"],
        badge: "Best Value", enrolledCount: 0, isActive: true,
      },
    ],
    enrollments: [],
    providers: [],
    eligibilityRules: [
      { ruleType: "screening", description: "Health Risk Assessment completed", isRequired: true },
      { ruleType: "commitment", description: "6-month minimum commitment", isRequired: true },
    ],
    fundingSources: [
      { sourceType: "stripe_subscription", name: "Patient Self-Pay", cptCode: null, billingFrequency: "monthly", isPrimary: true },
      { sourceType: "employer_invoice", name: "Employer Sponsorship", cptCode: null, billingFrequency: "monthly", isPrimary: false },
    ],
  },
];

const TEMPLATE_SUGGESTIONS = [
  { name: "Direct Primary Care (DPC)", type: "membership" as const, icon: Heart },
  { name: "Chronic Care Management (CCM)", type: "insurance_billed" as const, icon: Activity },
  { name: "Employer Wellness", type: "sponsor_based" as const, icon: Shield },
  { name: "Concierge Medicine", type: "membership" as const, icon: Crown },
  { name: "Group Therapy", type: "hybrid" as const, icon: Brain },
  { name: "Health Coaching", type: "hybrid" as const, icon: Zap },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: MockProgram["type"] }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    membership: { bg: "#e6f7f2", text: "#147d64", label: "Membership" },
    sponsor_based: { bg: "#e0f2fe", text: "#0369a1", label: "Sponsor-Based" },
    insurance_billed: { bg: "#f3e8ff", text: "#7c3aed", label: "Insurance-Billed" },
    grant_funded: { bg: "#fffbeb", text: "#d97706", label: "Grant-Funded" },
    hybrid: { bg: "#fce7f3", text: "#be185d", label: "Hybrid" },
  };
  const c = config[type] || config.membership;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}

function ProgramStatusBadge({ status }: { status: MockProgram["status"] }) {
  const config: Record<string, { bg: string; text: string; dot: string }> = {
    active: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" },
    draft: { bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" },
    paused: { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" },
    archived: { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" },
  };
  const c = config[status] || config.draft;
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

function EnrollmentStatusBadge({ status }: { status: MockEnrollment["status"] }) {
  const config: Record<string, { bg: string; text: string }> = {
    active: { bg: "#ecf9ec", text: "#2f8132" },
    pending: { bg: "#fffbeb", text: "#d97706" },
    paused: { bg: "#e0f2fe", text: "#0369a1" },
    completed: { bg: "#f1f5f9", text: "#64748b" },
    cancelled: { bg: "#fef2f2", text: "#dc2626" },
  };
  const c = config[status] || config.active;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {status}
    </span>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ProgramsSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProgram, setSelectedProgram] = useState<MockProgram | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "plans" | "enrollments" | "providers" | "settings">("overview");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // ─── In-app modals (replace native browser dialogs) ────────────────────────
  const [promptModal, setPromptModalRaw] = useState<{
    title: string;
    label: string;
    defaultValue: string;
    onSubmit: (value: string) => void;
  } | null>(null);
  const [promptInputValue, setPromptInputValue] = useState("");
  const setPromptModal = useCallback((modal: typeof promptModal) => {
    setPromptInputValue(modal?.defaultValue ?? "");
    setPromptModalRaw(modal);
  }, []);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } }, [toast]);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; confirmLabel?: string; danger?: boolean } | null>(null);
  const [actionMenuModal, setActionMenuModal] = useState<{
    title: string;
    actions: { label: string; onClick: () => void; danger?: boolean }[];
  } | null>(null);

  // ─── Add Provider to Program Dialog State ───────────────────────────────────
  const [addProviderToProgram, setAddProviderToProgram] = useState(false);
  const [addProviderProgramId, setAddProviderProgramId] = useState<string | null>(null);
  const [providerSearchQuery, setProviderSearchQuery] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [providerSearchResults, setProviderSearchResults] = useState<any[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerSearchLoading, setProviderSearchLoading] = useState(false);
  const [addProviderSubmitting, setAddProviderSubmitting] = useState(false);

  // ─── API State ──────────────────────────────────────────────────────────────
  const [apiPrograms, setApiPrograms] = useState<MockProgram[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Enroll Dialog State ────────────────────────────────────────────────────
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollProgramId, setEnrollProgramId] = useState<string | null>(null);
  const [enrollPatientSearch, setEnrollPatientSearch] = useState("");
  const [enrollPatients, setEnrollPatients] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [enrollSelectedPatientId, setEnrollSelectedPatientId] = useState<string | null>(null);
  const [enrollSelectedPlanId, setEnrollSelectedPlanId] = useState<string | null>(null);
  const [enrollFundingSource, setEnrollFundingSource] = useState<string>("self_pay");
  const [enrollSponsorName, setEnrollSponsorName] = useState("");
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollSuccess, setEnrollSuccess] = useState(false);
  const [patientsLoading, setPatientsLoading] = useState(false);

  // ─── Enrollment Action State ───────────────────────────────────────────────
  const [cancelReasonModal, setCancelReasonModal] = useState<{ enrollmentId: string; patientName: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [changePlanModal, setChangePlanModal] = useState<{ enrollmentId: string; patientName: string } | null>(null);
  const [changePlanSelectedId, setChangePlanSelectedId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [availablePlansLoading, setAvailablePlansLoading] = useState(false);
  const [enrollmentActionLoading, setEnrollmentActionLoading] = useState<string | null>(null);

  // ─── Program Plans (real MembershipPlan records) ──────────────────────────
  const [programPlans, setProgramPlans] = useState<RealMembershipPlan[]>([]);
  const [programPlansLoading, setProgramPlansLoading] = useState(false);

  // ─── Add Plan Dialog State ─────────────────────────────────────────────────
  const [addPlanDialogOpen, setAddPlanDialogOpen] = useState(false);
  const [addPlanName, setAddPlanName] = useState("");
  const [addPlanMonthlyPrice, setAddPlanMonthlyPrice] = useState("");
  const [addPlanAnnualPrice, setAddPlanAnnualPrice] = useState("");
  const [addPlanDescription, setAddPlanDescription] = useState("");
  const [addPlanSubmitting, setAddPlanSubmitting] = useState(false);

  // ─── Map API response to MockProgram shape ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapApiProgram = useCallback((p: any): MockProgram => ({
    id: p.id,
    name: p.name || "",
    code: p.code || "",
    type: p.type || "membership",
    description: p.description || "",
    icon: resolveIcon(p.icon),
    status: p.status || "draft",
    durationType: p.durationType || "ongoing",
    durationMonths: p.durationMonths ?? null,
    currentEnrollment: p.currentEnrollment ?? 0,
    maxEnrollment: p.maxEnrollment ?? null,
    providerCount: p.providers?.length ?? p.programProviders?.length ?? 0,
    monthlyRevenue: 0,
    plans: (() => {
      // Prefer real membershipPlans if available, fall back to embedded plans
      const realPlans = p.membershipPlans || p.membership_plans;
      if (Array.isArray(realPlans) && realPlans.length > 0) {
        return realPlans.map((pl: Record<string, unknown>) => ({
          id: (pl.id as string) || "",
          name: (pl.name as string) || "",
          monthlyPrice: Number(pl.monthlyPrice ?? pl.monthly_price) || 0,
          annualPrice: Number(pl.annualPrice ?? pl.annual_price) || 0,
          entitlements: Array.isArray(pl.planEntitlements ?? pl.plan_entitlements)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? ((pl.planEntitlements ?? pl.plan_entitlements) as any[]).map((e: any) =>
                e.entitlementType?.name || e.entitlement_type?.name || "Entitlement"
              )
            : [],
          badge: (pl.badgeText ?? pl.badge_text ?? null) as string | null,
          enrolledCount: Number(pl.membershipsCount ?? pl.memberships_count) || 0,
          isActive: pl.isActive !== false && pl.is_active !== false,
        }));
      }
      return (p.plans || []).map((pl: Record<string, unknown>) => ({
        id: pl.id || "",
        name: pl.name || "",
        monthlyPrice: Number(pl.monthlyPrice) || 0,
        annualPrice: Number(pl.annualPrice) || 0,
        entitlements: Array.isArray(pl.entitlements) ? pl.entitlements : [],
        badge: pl.badge ?? null,
        enrolledCount: Number(pl.enrolledCount) || 0,
        isActive: pl.isActive !== false,
      }));
    })(),
    enrollments: (p.enrollments || []).map((e: Record<string, unknown>) => ({
      id: e.id || "",
      patientName: e.patient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? `${(e.patient as any).firstName || ""} ${(e.patient as any).lastName || ""}`.trim()
        : "Unknown",
      planName: e.plan
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (e.plan as any).name || "—"
        : "—",
      status: (e.status as MockEnrollment["status"]) || "active",
      fundingSource: (e.fundingSource as string) || "—",
      sponsorName: (e.sponsorName as string) || null,
      enrolledAt: e.enrolledAt ? new Date(e.enrolledAt as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
      expiresAt: e.expiresAt ? new Date(e.expiresAt as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null,
    })),
    providers: (p.providers || p.programProviders || []).map((pv: Record<string, unknown>) => ({
      id: pv.id || "",
      name: pv.name || (pv.provider ? `${(pv.provider as Record<string, unknown>).firstName || ""} ${(pv.provider as Record<string, unknown>).lastName || ""}`.trim() : "Unknown"),
      credentials: (pv.credentials as string) || "",
      role: (pv.role as string) || (pv.pivot ? (pv.pivot as Record<string, unknown>).role as string : "") || "Provider",
      panelCapacity: Number(pv.panelCapacity ?? (pv.pivot ? (pv.pivot as Record<string, unknown>).panelCapacity : 0)) || 50,
      panelCurrent: Number(pv.panelCurrent) || 0,
      isActive: pv.isActive !== false && (pv.pivot ? (pv.pivot as Record<string, unknown>).isActive !== false : true),
    })),
    eligibilityRules: (p.eligibilityRules || []).map((r: Record<string, unknown>) => ({
      ruleType: (r.ruleType as string) || "",
      description: (r.description as string) || "",
      isRequired: r.isRequired === true,
    })),
    fundingSources: (p.fundingSources || []).map((f: Record<string, unknown>) => ({
      sourceType: (f.sourceType as string) || "",
      name: (f.name as string) || "",
      cptCode: (f.cptCode as string) || null,
      billingFrequency: (f.billingFrequency as string) || "",
      isPrimary: f.isPrimary === true,
    })),
  }), []);

  // ─── Fetch programs from API ───────────────────────────────────────────────
  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await programService.list();
      if (res.data && Array.isArray(res.data)) {
        // Fetch details with relations for each program
        const detailed = await Promise.all(
          res.data.map(async (p) => {
            try {
              const detail = await programService.get(p.id);
              return detail.data ? mapApiProgram(detail.data) : mapApiProgram(p);
            } catch {
              return mapApiProgram(p);
            }
          })
        );
        setApiPrograms(detailed);
      } else if (res.data && !Array.isArray(res.data)) {
        // Handle paginated response wrapped in data key
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (res.data as any).data || (res.data as any);
        if (Array.isArray(items)) {
          setApiPrograms(items.map(mapApiProgram));
        }
      }
    } catch {
      // Silently fall back to mock data
    } finally {
      setLoading(false);
    }
  }, [mapApiProgram]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  // ─── Enrollment Action Handlers ─────────────────────────────────────────────
  const handlePauseEnrollment = useCallback(async (enrollmentId: string) => {
    setEnrollmentActionLoading(enrollmentId);
    try {
      await apiFetch(`/memberships/${enrollmentId}/pause`, { method: "POST" });
      setToast({ message: "Enrollment paused.", type: "success" });
      fetchPrograms();
    } catch {
      setToast({ message: "Failed to pause enrollment.", type: "error" });
    }
    setEnrollmentActionLoading(null);
  }, [fetchPrograms, setToast]);

  const handleResumeEnrollment = useCallback(async (enrollmentId: string) => {
    setEnrollmentActionLoading(enrollmentId);
    try {
      await apiFetch(`/memberships/${enrollmentId}/resume`, { method: "POST" });
      setToast({ message: "Enrollment resumed.", type: "success" });
      fetchPrograms();
    } catch {
      setToast({ message: "Failed to resume enrollment.", type: "error" });
    }
    setEnrollmentActionLoading(null);
  }, [fetchPrograms, setToast]);

  const handleCancelEnrollment = useCallback(async (enrollmentId: string, reason: string) => {
    setEnrollmentActionLoading(enrollmentId);
    try {
      await apiFetch(`/memberships/${enrollmentId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setToast({ message: "Enrollment cancelled.", type: "success" });
      setCancelReasonModal(null);
      setCancelReason("");
      fetchPrograms();
    } catch {
      setToast({ message: "Failed to cancel enrollment.", type: "error" });
    }
    setEnrollmentActionLoading(null);
  }, [fetchPrograms, setToast]);

  const handleChangePlan = useCallback(async (enrollmentId: string, planId: string) => {
    setEnrollmentActionLoading(enrollmentId);
    try {
      await apiFetch(`/memberships/${enrollmentId}/change-plan`, {
        method: "POST",
        body: JSON.stringify({ planId }),
      });
      setToast({ message: "Plan changed successfully.", type: "success" });
      setChangePlanModal(null);
      setChangePlanSelectedId(null);
      fetchPrograms();
    } catch {
      setToast({ message: "Failed to change plan.", type: "error" });
    }
    setEnrollmentActionLoading(null);
  }, [fetchPrograms, setToast]);

  const fetchAvailablePlans = useCallback(async () => {
    setAvailablePlansLoading(true);
    try {
      const res = await membershipPlanService.list();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
      setAvailablePlans(list);
    } catch { /* ignore */ }
    setAvailablePlansLoading(false);
  }, []);

  // ─── Fetch real membership plans for a program ────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapApiPlanToReal = useCallback((pl: any): RealMembershipPlan => ({
    id: pl.id || "",
    name: pl.name || "",
    description: pl.description || null,
    monthlyPrice: Number(pl.monthlyPrice ?? pl.monthly_price) || 0,
    annualPrice: Number(pl.annualPrice ?? pl.annual_price) || null,
    membershipsCount: Number(pl.membershipsCount ?? pl.memberships_count) || 0,
    planEntitlements: (pl.planEntitlements ?? pl.plan_entitlements ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => ({
        id: e.id || "",
        entitlementType: e.entitlementType ?? e.entitlement_type ?? null,
        limitValue: e.limitValue ?? e.limit_value ?? null,
      })
    ),
    badgeText: pl.badgeText ?? pl.badge_text ?? null,
    isActive: pl.isActive !== false && pl.is_active !== false,
    programId: pl.programId ?? pl.program_id ?? null,
  }), []);

  const fetchProgramPlans = useCallback(async (programId: string) => {
    setProgramPlansLoading(true);
    try {
      const res = await apiFetch<unknown>(`/programs/${programId}/plans`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = res.data as any;
      const list = Array.isArray(raw) ? raw : (raw?.data || []);
      if (Array.isArray(list)) {
        setProgramPlans(list.map(mapApiPlanToReal));
      }
    } catch {
      // Fall back to empty - plans tab will show "no plans"
      setProgramPlans([]);
    } finally {
      setProgramPlansLoading(false);
    }
  }, [mapApiPlanToReal]);

  // ─── Fetch program plans when program detail opens or plans tab selected ──
  useEffect(() => {
    if (selectedProgram) {
      fetchProgramPlans(selectedProgram.id);
    }
  }, [selectedProgram?.id, fetchProgramPlans]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handle creating a real MembershipPlan for a program ─────────────────
  const handleAddPlanToProgram = useCallback(async (programId: string) => {
    if (!addPlanName.trim()) return;
    setAddPlanSubmitting(true);
    try {
      await apiFetch("/membership-plans", {
        method: "POST",
        body: JSON.stringify({
          name: addPlanName.trim(),
          monthlyPrice: parseFloat(addPlanMonthlyPrice) || 0,
          annualPrice: parseFloat(addPlanAnnualPrice) || 0,
          description: addPlanDescription.trim() || null,
          programId: programId,
          visitsPerMonth: 0,
        }),
      });
      setToast({ message: "Plan created successfully.", type: "success" });
      setAddPlanDialogOpen(false);
      setAddPlanName("");
      setAddPlanMonthlyPrice("");
      setAddPlanAnnualPrice("");
      setAddPlanDescription("");
      // Refresh plans
      fetchProgramPlans(programId);
      fetchPrograms();
    } catch {
      setToast({ message: "Failed to create plan.", type: "error" });
    } finally {
      setAddPlanSubmitting(false);
    }
  }, [addPlanName, addPlanMonthlyPrice, addPlanAnnualPrice, addPlanDescription, fetchProgramPlans, fetchPrograms]);

  // ─── Search patients for enroll dialog ─────────────────────────────────────
  useEffect(() => {
    if (!enrollDialogOpen || enrollPatientSearch.length < 2) {
      setEnrollPatients([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setPatientsLoading(true);
      try {
        const res = await patientService.list({ search: enrollPatientSearch });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ptList = res.data ? (Array.isArray(res.data) ? res.data : (res.data as any).data || []) : [];
        if (ptList.length > 0) {
          setEnrollPatients(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ptList.map((pt: any) => ({
              id: pt.id,
              firstName: pt.firstName || pt.first_name || "",
              lastName: pt.lastName || pt.last_name || "",
            }))
          );
        }
      } catch {
        // Ignore
      } finally {
        setPatientsLoading(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [enrollPatientSearch, enrollDialogOpen]);

  // ─── Handle enroll patient ─────────────────────────────────────────────────
  const handleEnrollPatient = useCallback(async () => {
    if (!enrollProgramId || !enrollSelectedPatientId) return;
    setEnrollSubmitting(true);
    setEnrollError(null);
    try {
      const res = await programService.enrollPatient(enrollProgramId, {
        patientId: enrollSelectedPatientId,
        planId: enrollSelectedPlanId || undefined,
        fundingSource: enrollFundingSource,
        sponsorName: enrollFundingSource === "sponsor" ? enrollSponsorName : undefined,
      });
      if (res.error) {
        setEnrollError(res.error);
      } else {
        setEnrollSuccess(true);
        // Refresh programs
        fetchPrograms();
        // Close dialog after brief success display
        setTimeout(() => {
          setEnrollDialogOpen(false);
          setEnrollSuccess(false);
          setEnrollSelectedPatientId(null);
          setEnrollSelectedPlanId(null);
          setEnrollPatientSearch("");
          setEnrollFundingSource("self_pay");
          setEnrollSponsorName("");
        }, 1500);
      }
    } catch {
      setEnrollError("Failed to enroll patient. Please try again.");
    } finally {
      setEnrollSubmitting(false);
    }
  }, [enrollProgramId, enrollSelectedPatientId, enrollSelectedPlanId, enrollFundingSource, enrollSponsorName, fetchPrograms]);

  const openEnrollDialog = useCallback((programId: string) => {
    setEnrollProgramId(programId);
    setEnrollDialogOpen(true);
    setEnrollError(null);
    setEnrollSuccess(false);
    setEnrollSelectedPatientId(null);
    setEnrollSelectedPlanId(null);
    setEnrollPatientSearch("");
    setEnrollFundingSource("self_pay");
    setEnrollSponsorName("");
    fetchProgramPlans(programId);
  }, [fetchProgramPlans]);

  // ─── Resolved program list (API with mock fallback) ────────────────────────
  const programs: MockProgram[] = apiPrograms.length > 0 ? apiPrograms : (isDemoMode ? MOCK_PROGRAMS : []);

  const filteredPrograms = programs.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ─── Enroll Patient Dialog (defined before early returns so it always renders) ───
  const enrollProgram = programs.find((p) => p.id === enrollProgramId);
  const enrollDialogJsx = enrollDialogOpen && enrollProgram && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-800">Enroll Patient in {enrollProgram.name}</h3>
          <button onClick={() => setEnrollDialogOpen(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {enrollSuccess ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: "#27ab83" }} />
              <p className="text-sm font-medium text-slate-800">Patient enrolled successfully!</p>
            </div>
          ) : (
            <>
              {enrollError && <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}>{enrollError}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="Search patients by name..." value={enrollPatientSearch}
                    onChange={(e) => { setEnrollPatientSearch(e.target.value); setEnrollSelectedPatientId(null); }}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent" />
                </div>
                {patientsLoading && <div className="flex items-center gap-2 mt-2 text-xs text-slate-400"><Loader2 className="w-3 h-3 animate-spin" />Searching...</div>}
                {enrollPatients.length > 0 && !enrollSelectedPatientId && (
                  <div className="mt-1 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                    {enrollPatients.map((pt) => (
                      <button key={pt.id} onClick={() => { setEnrollSelectedPatientId(pt.id); setEnrollPatientSearch(`${pt.firstName} ${pt.lastName}`); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0">{pt.firstName} {pt.lastName}</button>
                    ))}
                  </div>
                )}
              </div>
              {(programPlans.length > 0 || enrollProgram.plans.length > 0) && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Plan</label>
                  <select value={enrollSelectedPlanId || ""} onChange={(e) => setEnrollSelectedPlanId(e.target.value || null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2">
                    <option value="">Select a plan (optional)</option>
                    {programPlans.length > 0
                      ? programPlans.filter((pl) => pl.isActive).map((pl) => (
                          <option key={pl.id} value={pl.id}>{pl.name}{pl.monthlyPrice > 0 ? ` — ${formatCurrency(pl.monthlyPrice)}/mo` : ""}</option>
                        ))
                      : enrollProgram.plans.filter((pl) => pl.isActive).map((pl) => (
                          <option key={pl.id} value={pl.id}>{pl.name}{pl.monthlyPrice > 0 ? ` — ${formatCurrency(pl.monthlyPrice)}/mo` : ""}</option>
                        ))
                    }
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Funding Source</label>
                <select value={enrollFundingSource} onChange={(e) => setEnrollFundingSource(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2">
                  <option value="self_pay">Self-Pay</option><option value="employer">Employer</option>
                  <option value="insurance">Insurance</option><option value="grant">Grant</option><option value="sponsor">Sponsor</option>
                </select>
              </div>
              {enrollFundingSource === "sponsor" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sponsor Name</label>
                  <input type="text" value={enrollSponsorName} onChange={(e) => setEnrollSponsorName(e.target.value)}
                    placeholder="Enter sponsor name" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent" />
                </div>
              )}
            </>
          )}
        </div>
        {!enrollSuccess && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
            <button onClick={() => setEnrollDialogOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
            <button onClick={handleEnrollPatient} disabled={!enrollSelectedPatientId || enrollSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#0D9488" }}>
              {enrollSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}Enroll Patient
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Detail View ────────────────────────────────────────────────────────

  if (selectedProgram) {
    const Icon = selectedProgram.icon;
    const utilization = selectedProgram.maxEnrollment
      ? Math.round((selectedProgram.currentEnrollment / selectedProgram.maxEnrollment) * 100)
      : null;

    return (
      <div className="space-y-6">
        {/* Back */}
        <button
          onClick={() => {
            setSelectedProgram(null);
            setDetailTab("overview");
          }}
          className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
          style={{ color: "#0D9488" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Programs
        </button>

        {/* Header */}
        <div className="glass rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#e6f7f2" }}
              >
                <Icon className="w-7 h-7" style={{ color: "#0D9488" }} />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl font-bold" style={{ color: "#1B2B4D" }}>
                    {selectedProgram.name}
                  </h2>
                  <TypeBadge type={selectedProgram.type} />
                  <ProgramStatusBadge status={selectedProgram.status} />
                </div>
                <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                  {selectedProgram.description}
                </p>
              </div>
            </div>
            {selectedProgram.status === "draft" && (
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 shrink-0"
                style={{ backgroundColor: "#0D9488" }}
                onClick={async () => {
                  try {
                    await programService.update(selectedProgram.id, { status: "active" });
                    fetchPrograms();
                  } catch { /* ignore */ }
                }}
              >
                <PlayCircle className="w-4 h-4" />
                Activate Program
              </button>
            )}
            {selectedProgram.status === "active" && (
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-slate-50 shrink-0"
                style={{ borderColor: "#e2e8f0", color: "#64748b" }}
                onClick={async () => {
                  try {
                    await programService.update(selectedProgram.id, { status: "paused" });
                    fetchPrograms();
                  } catch { /* ignore */ }
                }}
              >
                <PauseCircle className="w-4 h-4" />
                Pause Program
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {(["overview", "plans", "enrollments", "providers", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setDetailTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap transition-colors border-b-2 ${
                detailTab === tab
                  ? "border-current"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              style={detailTab === tab ? { color: "#0D9488" } : undefined}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {detailTab === "overview" && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#e6f7f2" }}>
                    <Users className="w-4 h-4" style={{ color: "#147d64" }} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-800">{selectedProgram.currentEnrollment}</p>
                <p className="text-xs text-slate-500">Active Enrollments</p>
              </div>
              <div className="glass rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#e0f2fe" }}>
                    <BarChart3 className="w-4 h-4" style={{ color: "#0369a1" }} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  {utilization !== null ? `${utilization}%` : "No cap"}
                </p>
                <p className="text-xs text-slate-500">Utilization</p>
              </div>
              <div className="glass rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#f3e8ff" }}>
                    <DollarSign className="w-4 h-4" style={{ color: "#7c3aed" }} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-800">{formatCurrency(selectedProgram.monthlyRevenue)}</p>
                <p className="text-xs text-slate-500">Monthly Revenue</p>
              </div>
              <div className="glass rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#fffbeb" }}>
                    <Stethoscope className="w-4 h-4" style={{ color: "#d97706" }} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-800">{selectedProgram.providerCount}</p>
                <p className="text-xs text-slate-500">Providers</p>
              </div>
            </div>

            {/* Quick info */}
            <div className="glass rounded-xl p-6">
              <h3 className="text-base font-semibold text-slate-800 mb-4">Program Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">Program Code</p>
                  <p className="font-medium text-slate-700">{selectedProgram.code}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">Duration</p>
                  <p className="font-medium text-slate-700">
                    {selectedProgram.durationType === "ongoing" ? "Ongoing" : `${selectedProgram.durationMonths} months`}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">Capacity</p>
                  <p className="font-medium text-slate-700">
                    {selectedProgram.maxEnrollment ? `${selectedProgram.currentEnrollment} / ${selectedProgram.maxEnrollment}` : "Unlimited"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">Plans</p>
                  <p className="font-medium text-slate-700">{programPlans.length > 0 ? programPlans.length : selectedProgram.plans.length} active plans</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">Funding</p>
                  <p className="font-medium text-slate-700">
                    {selectedProgram.fundingSources.map((f) => f.name).join(", ")}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">Eligibility Rules</p>
                  <p className="font-medium text-slate-700">{selectedProgram.eligibilityRules.length} rules</p>
                </div>
              </div>
            </div>

            {/* Recent enrollments */}
            <div className="glass rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-slate-800">Recent Enrollments</h3>
                <button
                  onClick={() => setDetailTab("enrollments")}
                  className="text-xs font-medium hover:opacity-80"
                  style={{ color: "#0D9488" }}
                >
                  View All
                </button>
              </div>
              <div className="space-y-2">
                {selectedProgram.enrollments.slice(0, 5).map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50/80"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                        style={{ backgroundColor: "#0D9488" }}
                      >
                        {e.patientName.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{e.patientName}</p>
                        <p className="text-xs text-slate-400">{e.planName} | {e.fundingSource}</p>
                      </div>
                    </div>
                    <EnrollmentStatusBadge status={e.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {detailTab === "plans" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">
                Plans ({programPlans.length > 0 ? programPlans.length : selectedProgram.plans.length})
              </h3>
              <button
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-xs font-medium"
                style={{ backgroundColor: "#0D9488" }}
                onClick={() => {
                  setAddPlanName("");
                  setAddPlanMonthlyPrice("");
                  setAddPlanAnnualPrice("");
                  setAddPlanDescription("");
                  setAddPlanDialogOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Plan
              </button>
            </div>
            {programPlansLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            )}
            {!programPlansLoading && programPlans.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {programPlans.map((plan) => (
                  <div key={plan.id} className="glass rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-slate-800">{plan.name}</h4>
                          {plan.badgeText && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                              style={{ backgroundColor: "#fffbeb", color: "#d97706" }}
                            >
                              {plan.badgeText}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{plan.membershipsCount} members</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                          onClick={() => {
                            setConfirmDialog({
                              title: "Deactivate Plan",
                              message: `Are you sure you want to deactivate "${plan.name}"?`,
                              confirmLabel: "Deactivate",
                              danger: true,
                              onConfirm: async () => {
                                setConfirmDialog(null);
                                try {
                                  await apiFetch(`/membership-plans/${plan.id}`, {
                                    method: "DELETE",
                                  });
                                  fetchProgramPlans(selectedProgram.id);
                                  fetchPrograms();
                                } catch { /* ignore */ }
                              },
                            });
                          }}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mb-3">
                      {plan.monthlyPrice > 0 ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-slate-800">{formatCurrency(plan.monthlyPrice)}</span>
                          <span className="text-xs text-slate-400">/month</span>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-slate-500">Billed to payer</span>
                      )}
                      {plan.annualPrice && plan.annualPrice > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(plan.annualPrice)}/year</p>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-xs text-slate-500 mb-3 line-clamp-2">{plan.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {plan.membershipsCount} members
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {plan.planEntitlements.length} entitlements
                      </span>
                    </div>
                    {plan.planEntitlements.length > 0 && (
                      <ul className="space-y-1.5">
                        {plan.planEntitlements.slice(0, 5).map((e) => (
                          <li key={e.id} className="flex items-start gap-1.5 text-xs text-slate-600">
                            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#27ab83" }} />
                            {e.entitlementType?.name || "Entitlement"}
                            {e.limitValue ? ` (${e.limitValue})` : ""}
                          </li>
                        ))}
                        {plan.planEntitlements.length > 5 && (
                          <li className="text-xs text-slate-400">+{plan.planEntitlements.length - 5} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!programPlansLoading && programPlans.length === 0 && selectedProgram.plans.length > 0 && (
              /* Fallback to embedded plans (legacy data) */
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {selectedProgram.plans.map((plan) => (
                  <div key={plan.id} className="glass rounded-xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-slate-800">{plan.name}</h4>
                          {plan.badge && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                              style={{ backgroundColor: "#fffbeb", color: "#d97706" }}
                            >
                              {plan.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{plan.enrolledCount} enrolled</p>
                      </div>
                    </div>
                    <div className="mb-3">
                      {plan.monthlyPrice > 0 ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-slate-800">{formatCurrency(plan.monthlyPrice)}</span>
                          <span className="text-xs text-slate-400">/month</span>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-slate-500">Billed to payer</span>
                      )}
                      {plan.annualPrice > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(plan.annualPrice)}/year</p>
                      )}
                    </div>
                    <ul className="space-y-1.5">
                      {plan.entitlements.map((e, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#27ab83" }} />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {!programPlansLoading && programPlans.length === 0 && selectedProgram.plans.length === 0 && (
              <div className="text-center py-12">
                <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No plans configured</p>
                <p className="text-xs text-slate-400 mt-1">Add a membership plan to this program</p>
              </div>
            )}
            {/* Add Plan Dialog */}
            {addPlanDialogOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
                <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <h3 className="text-base font-semibold text-slate-800">Add Plan to {selectedProgram.name}</h3>
                    <button onClick={() => setAddPlanDialogOpen(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Plan Name</label>
                      <input
                        type="text"
                        value={addPlanName}
                        onChange={(e) => setAddPlanName(e.target.value)}
                        placeholder="e.g. Essential, Premium"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                        autoFocus
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Price ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={addPlanMonthlyPrice}
                          onChange={(e) => setAddPlanMonthlyPrice(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Annual Price ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={addPlanAnnualPrice}
                          onChange={(e) => setAddPlanAnnualPrice(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                      <textarea
                        value={addPlanDescription}
                        onChange={(e) => setAddPlanDescription(e.target.value)}
                        placeholder="Brief plan description..."
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
                    <button onClick={() => setAddPlanDialogOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                    <button
                      onClick={() => handleAddPlanToProgram(selectedProgram.id)}
                      disabled={!addPlanName.trim() || addPlanSubmitting}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: "#0D9488" }}
                    >
                      {addPlanSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Create Plan
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {detailTab === "enrollments" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">
                Enrollments ({selectedProgram.enrollments.length})
              </h3>
              <button
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-xs font-medium"
                style={{ backgroundColor: "#0D9488" }}
                onClick={() => openEnrollDialog(selectedProgram.id)}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Enroll Patient
              </button>
            </div>
            <div className="glass rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "#f8fafc" }}>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600">Patient</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600">Plan</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600">Status</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600">Funding</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600">Enrolled</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600">Expires</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProgram.enrollments.map((e) => (
                      <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                              style={{ backgroundColor: "#0D9488" }}
                            >
                              {e.patientName.split(" ").map((n) => n[0]).join("")}
                            </div>
                            <span className="font-medium text-slate-800">{e.patientName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{e.planName}</td>
                        <td className="py-3 px-4">
                          <EnrollmentStatusBadge status={e.status} />
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-slate-600">{e.fundingSource}</span>
                          {e.sponsorName && (
                            <span className="block text-xs text-slate-400">{e.sponsorName}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{e.enrolledAt}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{e.expiresAt || "—"}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Pause / Resume */}
                            {e.status === "active" && (
                              <button
                                className="p-1.5 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                                title="Pause enrollment"
                                disabled={enrollmentActionLoading === e.id}
                                onClick={() => {
                                  setConfirmDialog({
                                    title: "Pause Enrollment",
                                    message: `Pause ${e.patientName}'s enrollment? They will retain their membership but benefits will be suspended.`,
                                    confirmLabel: "Pause",
                                    danger: false,
                                    onConfirm: async () => {
                                      setConfirmDialog(null);
                                      await handlePauseEnrollment(e.id);
                                    },
                                  });
                                }}
                              >
                                <PauseCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {e.status === "paused" && (
                              <button
                                className="p-1.5 rounded hover:bg-green-50 text-slate-400 hover:text-green-600 transition-colors"
                                title="Resume enrollment"
                                disabled={enrollmentActionLoading === e.id}
                                onClick={() => handleResumeEnrollment(e.id)}
                              >
                                <PlayCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Change Plan */}
                            {(e.status === "active" || e.status === "paused") && (
                              <button
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors"
                                title="Change plan"
                                disabled={enrollmentActionLoading === e.id}
                                onClick={() => {
                                  setChangePlanModal({ enrollmentId: e.id, patientName: e.patientName });
                                  setChangePlanSelectedId(null);
                                  fetchAvailablePlans();
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Cancel */}
                            {e.status !== "cancelled" && e.status !== "completed" && (
                              <button
                                className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                title="Cancel enrollment"
                                disabled={enrollmentActionLoading === e.id}
                                onClick={() => {
                                  setCancelReasonModal({ enrollmentId: e.id, patientName: e.patientName });
                                  setCancelReason("");
                                }}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* View */}
                            <button
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                              title="View enrollment"
                              onClick={() => setDetailTab("enrollments")}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {/* Loading indicator */}
                            {enrollmentActionLoading === e.id && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
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
        )}

        {detailTab === "providers" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">
                Providers ({selectedProgram.providers.length})
              </h3>
              <button
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-xs font-medium"
                style={{ backgroundColor: "#0D9488" }}
                onClick={() => {
                  setProviderSearchQuery("");
                  setProviderSearchResults([]);
                  setSelectedProviderId(null);
                  setAddProviderProgramId(selectedProgram.id);
                  setAddProviderToProgram(true);
                  // Pre-load providers
                  setProviderSearchLoading(true);
                  providerService.list().then((res) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const list = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
                    setProviderSearchResults(list);
                    setProviderSearchLoading(false);
                  }).catch(() => setProviderSearchLoading(false));
                }}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add Provider
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {selectedProgram.providers.map((prov) => {
                const utilPct = Math.round((prov.panelCurrent / prov.panelCapacity) * 100);
                return (
                  <div key={prov.id} className="glass rounded-xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                          style={{ backgroundColor: "#1B2B4D" }}
                        >
                          {prov.name.split(" ").slice(-1)[0][0]}{prov.name.split(" ").slice(-2, -1)[0]?.[0] || ""}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{prov.name}</p>
                          <p className="text-xs text-slate-400">{prov.credentials} | {prov.role}</p>
                        </div>
                      </div>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: prov.isActive ? "#ecf9ec" : "#fef2f2",
                          color: prov.isActive ? "#2f8132" : "#dc2626",
                        }}
                      >
                        {prov.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-500">Panel Capacity</span>
                        <span className="font-medium text-slate-700">{prov.panelCurrent} / {prov.panelCapacity}</span>
                      </div>
                      <div className="w-full h-2 rounded-full" style={{ backgroundColor: "#e2e8f0" }}>
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${utilPct}%`,
                            backgroundColor: utilPct > 90 ? "#ef4444" : utilPct > 70 ? "#f59e0b" : "#27ab83",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {selectedProgram.providers.length === 0 && (
                <div className="col-span-full text-center py-8">
                  <Stethoscope className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No providers assigned yet</p>
                  <p className="text-xs text-slate-400">Add providers to start accepting enrollments</p>
                </div>
              )}
            </div>
          </div>
        )}

        {detailTab === "settings" && (
          <div className="space-y-6">
            {/* Eligibility Rules */}
            <div className="glass rounded-xl p-6">
              <h3 className="text-base font-semibold text-slate-800 mb-4">Eligibility Rules</h3>
              <div className="space-y-3">
                {selectedProgram.eligibilityRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg"
                    style={{ backgroundColor: "#f8fafc" }}
                  >
                    <div className="flex items-center gap-3">
                      <Shield
                        className="w-4 h-4"
                        style={{ color: rule.isRequired ? "#dc2626" : "#94a3b8" }}
                      />
                      <span className="text-sm text-slate-700">{rule.description}</span>
                    </div>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: rule.isRequired ? "#fef2f2" : "#f1f5f9",
                        color: rule.isRequired ? "#dc2626" : "#64748b",
                      }}
                    >
                      {rule.isRequired ? "Required" : "Optional"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Funding Sources */}
            <div className="glass rounded-xl p-6">
              <h3 className="text-base font-semibold text-slate-800 mb-4">Funding Sources</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Source</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Type</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-slate-600">CPT</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Frequency</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Primary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProgram.fundingSources.map((fs, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-2.5 px-3 font-medium text-slate-800">{fs.name}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize"
                            style={{ backgroundColor: "#f1f5f9", color: "#475569" }}
                          >
                            {fs.sourceType.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {fs.cptCode ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium"
                              style={{ backgroundColor: "#f3e8ff", color: "#7c3aed" }}
                            >
                              {fs.cptCode}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 capitalize">{fs.billingFrequency}</td>
                        <td className="py-2.5 px-3">
                          {fs.isPrimary && (
                            <CheckCircle2 className="w-4 h-4" style={{ color: "#27ab83" }} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Enroll Patient Dialog (inside detail view) */}
        {enrollDialogJsx}

        {/* Add Provider to Program Modal (inside detail view) */}
        {addProviderToProgram && addProviderProgramId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
              <div className="p-6" style={{ background: "linear-gradient(135deg, #1B2B4D, #243b53)" }}>
                <h3 className="text-lg font-bold text-white">Add Provider to Program</h3>
                <p className="text-sm text-slate-300 mt-1">Search and select a provider to add.</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none"
                    placeholder="Search providers by name..."
                    value={providerSearchQuery}
                    onChange={(e) => setProviderSearchQuery(e.target.value)}
                  />
                </div>
                {providerSearchLoading && <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></div>}
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {providerSearchResults
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .filter((p: any) => {
                      if (!providerSearchQuery) return true;
                      const name = `${p.firstName || p.first_name || ""} ${p.lastName || p.last_name || ""}`.toLowerCase();
                      return name.includes(providerSearchQuery.toLowerCase());
                    })
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((p: any) => {
                      const name = `${p.firstName || p.first_name || ""} ${p.lastName || p.last_name || ""}`.trim();
                      const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase() || "??";
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                          style={{
                            backgroundColor: selectedProviderId === p.id ? "#e6f7f2" : "transparent",
                            border: selectedProviderId === p.id ? "2px solid #27ab83" : "2px solid #e2e8f0",
                          }}
                          onClick={() => setSelectedProviderId(p.id)}
                        >
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: "#334e68" }}>{initials}</div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{name}</p>
                            <p className="text-xs text-slate-500">{p.credentials || p.specialty || ""}</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
              <div className="px-6 pb-6 flex justify-end gap-3">
                <button className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
                  onClick={() => { setAddProviderToProgram(false); setSelectedProviderId(null); }}>Cancel</button>
                <button
                  className="px-6 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: selectedProviderId ? "#27ab83" : "#94a3b8" }}
                  disabled={!selectedProviderId || addProviderSubmitting}
                  onClick={async () => {
                    if (!selectedProviderId || !addProviderProgramId) return;
                    setAddProviderSubmitting(true);
                    try {
                      await programService.addProvider(addProviderProgramId, { providerId: selectedProviderId });
                      setToast({ message: "Provider added to program.", type: "success" });
                      setAddProviderToProgram(false);
                      setSelectedProviderId(null);
                      fetchPrograms();
                    } catch {
                      setToast({ message: "Failed to add provider.", type: "error" });
                    }
                    setAddProviderSubmitting(false);
                  }}
                >
                  {addProviderSubmitting ? "Adding..." : "Add Provider"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Empty State ──────────────────────────────────────────────────────────

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // ─── (Enroll Patient Dialog moved above early returns) ─────────────────────

  // ─── Empty State ──────────────────────────────────────────────────────────
  // ─── Empty State ──────────────────────────────────────────────────────────

  if (programs.length === 0) {
    return (
      <div className="text-center py-16">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: "#e6f7f2" }}
        >
          <Layers className="w-8 h-8" style={{ color: "#0D9488" }} />
        </div>
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Set up your first program</h3>
        <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
          Programs are the core of MemberMD. Choose a template to get started with DPC memberships,
          chronic care management, employer wellness, or create a custom program.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto mb-6">
          {TEMPLATE_SUGGESTIONS.map((tmpl) => {
            const TIcon = tmpl.icon;
            return (
              <button
                key={tmpl.name}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
                onClick={async () => {
                  try {
                    await programService.create({ name: tmpl.name, type: tmpl.type, status: "draft" });
                    fetchPrograms();
                  } catch { /* ignore */ }
                }}
              >
                <TIcon className="w-6 h-6" style={{ color: "#0D9488" }} />
                <span className="text-xs font-medium text-slate-700 text-center leading-tight">{tmpl.name}</span>
              </button>
            );
          })}
        </div>
        <button
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: "#0D9488" }}
          onClick={() => {
            setPromptModal({
              title: "Create Program",
              label: "Program name",
              defaultValue: "",
              onSubmit: async (name) => {
                if (!name) return;
                try {
                  await programService.create({ name, type: "membership", status: "draft" });
                  fetchPrograms();
                } catch { /* ignore */ }
              },
            });
          }}
        >
          <Plus className="w-4 h-4" />
          Create Custom Program
        </button>
      </div>
    );
  }

  // ─── List View ────────────────────────────────────────────────────────────

  return (
    <>
    {enrollDialogJsx}
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold" style={{ color: "#1B2B4D" }}>
            My Programs
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {programs.length} programs | {programs.reduce((s, p) => s + p.currentEnrollment, 0)} total enrollments
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: "#0D9488" }}
          onClick={() => {
            setPromptModal({
              title: "Add Program",
              label: "Program name",
              defaultValue: "",
              onSubmit: async (name) => {
                if (!name) return;
                try {
                  await programService.create({ name, type: "membership", status: "draft" });
                  fetchPrograms();
                } catch { /* ignore */ }
              },
            });
          }}
        >
          <Plus className="w-4 h-4" />
          Add Program
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search programs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2"
        >
          <option value="All">All Statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Program Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredPrograms.map((program) => {
          const Icon = program.icon;
          const utilization = program.maxEnrollment
            ? Math.round((program.currentEnrollment / program.maxEnrollment) * 100)
            : null;
          return (
            <div
              key={program.id}
              className="glass rounded-xl p-5 hover-lift cursor-pointer transition-all"
              onClick={() => setSelectedProgram(program)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "#e6f7f2" }}
                  >
                    <Icon className="w-5 h-5" style={{ color: "#0D9488" }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-slate-800">{program.name}</h4>
                      <ProgramStatusBadge status={program.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <TypeBadge type={program.type} />
                      <span className="text-xs text-slate-400">
                        {program.durationType === "ongoing" ? "Ongoing" : `${program.durationMonths}mo`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                    onClick={(e) => { e.stopPropagation(); setSelectedProgram(program); }}
                    title="View program"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPromptModal({
                        title: "Edit Program",
                        label: "Program name",
                        defaultValue: program.name,
                        onSubmit: async (newName) => {
                          if (!newName || newName === program.name) return;
                          try {
                            await programService.update(program.id, { name: newName });
                            fetchPrograms();
                          } catch { /* ignore */ }
                        },
                      });
                    }}
                    title="Edit program"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActionMenuModal({
                        title: `Actions for "${program.name}"`,
                        actions: [
                          {
                            label: "Pause Program",
                            onClick: async () => {
                              setActionMenuModal(null);
                              try { await programService.update(program.id, { status: "paused" }); fetchPrograms(); } catch { /* ignore */ }
                            },
                          },
                          {
                            label: "Archive Program",
                            onClick: async () => {
                              setActionMenuModal(null);
                              try { await programService.update(program.id, { status: "archived" }); fetchPrograms(); } catch { /* ignore */ }
                            },
                          },
                          {
                            label: "Delete Program",
                            danger: true,
                            onClick: () => {
                              setActionMenuModal(null);
                              setConfirmDialog({
                                title: "Delete Program",
                                message: "Delete this program permanently?",
                                confirmLabel: "Delete",
                                danger: true,
                                onConfirm: async () => {
                                  setConfirmDialog(null);
                                  try { await programService.delete(program.id); fetchPrograms(); } catch { /* ignore */ }
                                },
                              });
                            },
                          },
                        ],
                      });
                    }}
                    title="More actions"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-4 line-clamp-2">{program.description}</p>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800">{program.currentEnrollment}</p>
                  <p className="text-xs text-slate-400">Enrolled</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800">{program.providerCount}</p>
                  <p className="text-xs text-slate-400">Providers</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800">{formatCurrency(program.monthlyRevenue)}</p>
                  <p className="text-xs text-slate-400">MRR</p>
                </div>
              </div>

              {/* Capacity bar */}
              {utilization !== null && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">Capacity</span>
                    <span className="font-medium text-slate-600">{utilization}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: "#e2e8f0" }}>
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${utilization}%`,
                        backgroundColor: utilization > 90 ? "#ef4444" : utilization > 70 ? "#f59e0b" : "#27ab83",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredPrograms.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No programs match your filters</p>
        </div>
      )}
    </div>

    {/* ─── Toast ──────────────────────────────────────────────────────────── */}
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

    {/* ─── Confirm Dialog ─────────────────────────────────────────────────── */}
    {confirmDialog && (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: confirmDialog.danger ? "#fef2f2" : "#fffbeb" }}>
              <AlertTriangle className="w-5 h-5" style={{ color: confirmDialog.danger ? "#dc2626" : "#d97706" }} />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">{confirmDialog.title}</h3>
          </div>
          <p className="text-sm text-slate-600 mb-6">{confirmDialog.message}</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
            <button
              onClick={confirmDialog.onConfirm}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: confirmDialog.danger ? "#dc2626" : "#27ab83" }}
            >
              {confirmDialog.confirmLabel || "Confirm"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ─── Prompt Modal ───────────────────────────────────────────────────── */}
    {promptModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          <div className="p-6" style={{ background: "linear-gradient(135deg, #1B2B4D, #243b53)" }}>
            <h3 className="text-lg font-bold text-white">{promptModal.title}</h3>
          </div>
          <div className="p-6">
            <label className="block text-sm font-medium text-slate-700 mb-1">{promptModal.label}</label>
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              defaultValue={promptModal.defaultValue}
              autoFocus
              onChange={(e) => setPromptInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  promptModal.onSubmit(promptInputValue || promptModal.defaultValue);
                  setPromptModal(null);
                }
              }}
              key={promptModal.title + promptModal.label}
            />
          </div>
          <div className="px-6 pb-6 flex justify-end gap-3">
            <button
              onClick={() => setPromptModal(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                promptModal.onSubmit(promptInputValue || promptModal.defaultValue);
                setPromptModal(null);
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: "#0D9488" }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ─── Action Menu Modal ──────────────────────────────────────────────── */}
    {actionMenuModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
          <div className="p-6" style={{ background: "linear-gradient(135deg, #1B2B4D, #243b53)" }}>
            <h3 className="text-lg font-bold text-white">{actionMenuModal.title}</h3>
          </div>
          <div className="p-4 space-y-2">
            {actionMenuModal.actions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50"
                style={{ color: action.danger ? "#dc2626" : "#1B2B4D" }}
              >
                {action.label}
              </button>
            ))}
          </div>
          <div className="px-6 pb-6 flex justify-end">
            <button
              onClick={() => setActionMenuModal(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ─── Add Provider to Program Modal ─────────────────────────────────── */}
    {addProviderToProgram && addProviderProgramId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          <div className="p-6" style={{ background: "linear-gradient(135deg, #1B2B4D, #243b53)" }}>
            <h3 className="text-lg font-bold text-white">Add Provider to Program</h3>
            <p className="text-sm text-slate-300 mt-1">Search and select a provider to add.</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Search providers by name..."
                value={providerSearchQuery}
                autoFocus
                onChange={(e) => setProviderSearchQuery(e.target.value)}
              />
            </div>
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
              {providerSearchLoading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  <span className="ml-2 text-sm text-slate-500">Loading providers...</span>
                </div>
              )}
              {!providerSearchLoading && providerSearchResults.length === 0 && (
                <div className="text-center py-6 text-sm text-slate-400">No providers found.</div>
              )}
              {!providerSearchLoading && providerSearchResults
                .filter((p) => {
                  if (!providerSearchQuery) return true;
                  const name = [p.firstName || p.first_name, p.lastName || p.last_name].filter(Boolean).join(" ").toLowerCase();
                  return name.includes(providerSearchQuery.toLowerCase());
                })
                .map((p) => {
                  const name = [p.firstName || p.first_name, p.lastName || p.last_name].filter(Boolean).join(" ") || p.name || "Unknown";
                  const specialty = (Array.isArray(p.specialties) ? p.specialties[0] : p.specialty) || "";
                  const isSelected = selectedProviderId === p.id;
                  return (
                    <button
                      key={p.id}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-slate-100 last:border-0"
                      style={{ backgroundColor: isSelected ? "#e6f7f2" : "transparent" }}
                      onClick={() => setSelectedProviderId(isSelected ? null : p.id)}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: "#334e68" }}
                      >
                        {name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{name}{p.credentials ? `, ${p.credentials}` : ""}</p>
                        {specialty && <p className="text-xs text-slate-500">{specialty}</p>}
                      </div>
                      {isSelected && <Check className="w-4 h-4 shrink-0" style={{ color: "#0D9488" }} />}
                    </button>
                  );
                })}
            </div>
          </div>
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              onClick={() => { setAddProviderToProgram(false); setSelectedProviderId(null); }}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#0D9488" }}
              disabled={!selectedProviderId || addProviderSubmitting}
              onClick={async () => {
                if (!selectedProviderId) return;
                setAddProviderSubmitting(true);
                try {
                  if (!addProviderProgramId) return;
                  await programService.addProvider(addProviderProgramId, { providerId: selectedProviderId });
                  setToast({ message: "Provider added to program.", type: "success" });
                  setAddProviderToProgram(false);
                  setSelectedProviderId(null);
                  fetchPrograms();
                } catch {
                  setToast({ message: "Failed to add provider.", type: "error" });
                }
                setAddProviderSubmitting(false);
              }}
            >
              {addProviderSubmitting ? "Adding..." : "Add Provider"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ─── Cancel Enrollment Modal ─────────────────────────────────────── */}
    {cancelReasonModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          <div className="p-6" style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}>
            <h3 className="text-lg font-bold text-white">Cancel Enrollment</h3>
            <p className="text-sm text-red-100 mt-1">Cancel {cancelReasonModal.patientName}&apos;s enrollment</p>
          </div>
          <div className="p-6">
            <label className="block text-sm font-medium text-slate-700 mb-1">Cancellation Reason *</label>
            <textarea
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
              rows={3}
              placeholder="Enter reason for cancellation..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              autoFocus
            />
          </div>
          <div className="px-6 pb-6 flex justify-end gap-3">
            <button
              onClick={() => { setCancelReasonModal(null); setCancelReason(""); }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={() => handleCancelEnrollment(cancelReasonModal.enrollmentId, cancelReason)}
              disabled={!cancelReason.trim() || enrollmentActionLoading === cancelReasonModal.enrollmentId}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#dc2626" }}
            >
              {enrollmentActionLoading === cancelReasonModal.enrollmentId ? "Cancelling..." : "Cancel Enrollment"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ─── Change Plan Modal ──────────────────────────────────────────────── */}
    {changePlanModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          <div className="p-6" style={{ background: "linear-gradient(135deg, #1B2B4D, #243b53)" }}>
            <h3 className="text-lg font-bold text-white">Change Plan</h3>
            <p className="text-sm text-slate-300 mt-1">Select a new plan for {changePlanModal.patientName}</p>
          </div>
          <div className="p-6">
            {availablePlansLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                <span className="ml-2 text-sm text-slate-500">Loading plans...</span>
              </div>
            )}
            {!availablePlansLoading && availablePlans.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">No plans available.</p>
            )}
            {!availablePlansLoading && availablePlans.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {availablePlans.map((plan) => {
                  const isSelected = changePlanSelectedId === plan.id;
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
                      onClick={() => setChangePlanSelectedId(isSelected ? null : plan.id)}
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
          <div className="px-6 pb-6 flex justify-end gap-3">
            <button
              onClick={() => { setChangePlanModal(null); setChangePlanSelectedId(null); }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (changePlanSelectedId && changePlanModal) {
                  handleChangePlan(changePlanModal.enrollmentId, changePlanSelectedId);
                }
              }}
              disabled={!changePlanSelectedId || enrollmentActionLoading === changePlanModal.enrollmentId}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#0D9488" }}
            >
              {enrollmentActionLoading === changePlanModal.enrollmentId ? "Changing..." : "Change Plan"}
            </button>
          </div>
        </div>
      </div>
    )}

    </>
  );
}
