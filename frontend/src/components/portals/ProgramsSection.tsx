// ===== Programs Section (Practice Portal) =====
// Practice-level program management: view, configure, and manage program enrollments

import { useState } from "react";
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
} from "lucide-react";

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

  const filteredPrograms = MOCK_PROGRAMS.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
              >
                <PlayCircle className="w-4 h-4" />
                Activate Program
              </button>
            )}
            {selectedProgram.status === "active" && (
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-slate-50 shrink-0"
                style={{ borderColor: "#e2e8f0", color: "#64748b" }}
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
                  <p className="font-medium text-slate-700">{selectedProgram.plans.length} active plans</p>
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
                Plans ({selectedProgram.plans.length})
              </h3>
              <button
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-xs font-medium"
                style={{ backgroundColor: "#0D9488" }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Plan
              </button>
            </div>
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
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
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
                            <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                              <MoreHorizontal className="w-3.5 h-3.5" />
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
      </div>
    );
  }

  // ─── Empty State ──────────────────────────────────────────────────────────

  if (MOCK_PROGRAMS.length === 0) {
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
        >
          <Plus className="w-4 h-4" />
          Create Custom Program
        </button>
      </div>
    );
  }

  // ─── List View ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold" style={{ color: "#1B2B4D" }}>
            My Programs
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {MOCK_PROGRAMS.length} programs | {MOCK_PROGRAMS.reduce((s, p) => s + p.currentEnrollment, 0)} total enrollments
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: "#0D9488" }}
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
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                    onClick={(e) => e.stopPropagation()}
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
  );
}
