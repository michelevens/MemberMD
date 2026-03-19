// ===== Program Templates Tab (SuperAdmin) =====
// Master data tab for managing program templates that can be provisioned to practices

import { useState } from "react";
import {
  ArrowLeft,
  Heart,
  Activity,
  Brain,
  Stethoscope,
  Users,
  Crown,
  Zap,
  Flower2,
  Search,
  Plus,
  ChevronRight,
  CheckCircle2,
  Shield,
  Clock,
  FileText,
  Tag,
  Send,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MockProgramTemplate {
  id: string;
  name: string;
  code: string;
  type: "membership" | "sponsor_based" | "insurance_billed" | "grant_funded" | "hybrid";
  description: string;
  icon: React.ElementType;
  specialties: string[];
  durationType: "ongoing" | "fixed_term";
  durationMonths: number | null;
  defaultPlans: {
    name: string;
    monthlyPrice: number;
    annualPrice: number;
    entitlements: string[];
    badge: string | null;
  }[];
  eligibilityRules: {
    ruleType: string;
    description: string;
    isRequired: boolean;
  }[];
  fundingSources: {
    sourceType: string;
    name: string;
    cptCode: string | null;
    billingFrequency: string;
  }[];
  practiceCount: number;
  status: "active" | "draft";
}

interface MockPracticeOption {
  id: string;
  name: string;
  specialty: string;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_PRACTICES_OPTIONS: MockPracticeOption[] = [
  { id: "1", name: "Evergreen Family Health", specialty: "Family Medicine" },
  { id: "2", name: "Summit Cardiology Group", specialty: "Cardiology" },
  { id: "3", name: "Bright Horizons Pediatrics", specialty: "Pediatrics" },
  { id: "4", name: "Coastal Dermatology", specialty: "Dermatology" },
  { id: "5", name: "Pacific Orthopedics", specialty: "Orthopedics" },
  { id: "6", name: "Tranquil Mind Psychiatry", specialty: "Psychiatry" },
];

const MOCK_PROGRAM_TEMPLATES: MockProgramTemplate[] = [
  {
    id: "prog-1",
    name: "Direct Primary Care (DPC)",
    code: "DPC",
    type: "membership",
    description: "Traditional DPC membership model. Patients pay a flat monthly fee for unlimited primary care access, messaging, and basic labs.",
    icon: Heart,
    specialties: ["Family Medicine", "Internal Medicine", "Pediatrics"],
    durationType: "ongoing",
    durationMonths: null,
    defaultPlans: [
      { name: "Essential", monthlyPrice: 99, annualPrice: 1069, entitlements: ["2 visits/month", "48hr messaging SLA", "Annual wellness exam", "Basic labs"], badge: null },
      { name: "Complete", monthlyPrice: 199, annualPrice: 2149, entitlements: ["4 visits/month", "Telehealth included", "24hr messaging SLA", "Comprehensive labs", "Mental health check-ins"], badge: "Most Popular" },
      { name: "Premium", monthlyPrice: 299, annualPrice: 3229, entitlements: ["Unlimited visits", "Unlimited telehealth", "4hr messaging SLA", "Full labs + imaging", "Same-day appointments"], badge: "VIP" },
    ],
    eligibilityRules: [
      { ruleType: "age", description: "Patient age 18+ (or family plan)", isRequired: false },
      { ruleType: "geography", description: "Within practice service area", isRequired: false },
    ],
    fundingSources: [
      { sourceType: "stripe_subscription", name: "Patient Subscription", cptCode: null, billingFrequency: "monthly" },
    ],
    practiceCount: 42,
    status: "active",
  },
  {
    id: "prog-2",
    name: "Chronic Care Management (CCM)",
    code: "CCM",
    type: "insurance_billed",
    description: "CMS-reimbursed chronic care management. 20+ minutes of non-face-to-face care coordination per month for patients with 2+ chronic conditions.",
    icon: Activity,
    specialties: ["Family Medicine", "Internal Medicine", "Cardiology", "Endocrinology"],
    durationType: "ongoing",
    durationMonths: null,
    defaultPlans: [
      { name: "CCM Standard", monthlyPrice: 0, annualPrice: 0, entitlements: ["20 min/month care coordination", "Care plan development", "Medication management", "Monthly check-in call"], badge: null },
      { name: "CCM Complex", monthlyPrice: 0, annualPrice: 0, entitlements: ["60 min/month care coordination", "Complex care plan", "Specialist coordination", "Weekly check-in", "Remote monitoring review"], badge: "Complex" },
    ],
    eligibilityRules: [
      { ruleType: "condition_count", description: "Patient has 2+ chronic conditions", isRequired: true },
      { ruleType: "consent", description: "Signed CCM consent form", isRequired: true },
      { ruleType: "insurance", description: "Medicare Part B or qualifying insurance", isRequired: true },
    ],
    fundingSources: [
      { sourceType: "insurance_claim", name: "Medicare Part B", cptCode: "99490", billingFrequency: "monthly" },
      { sourceType: "insurance_claim", name: "Complex CCM", cptCode: "99487", billingFrequency: "monthly" },
    ],
    practiceCount: 28,
    status: "active",
  },
  {
    id: "prog-3",
    name: "Health Coaching",
    code: "COACH",
    type: "hybrid",
    description: "Structured wellness coaching program combining membership fees with optional employer sponsorship. Lifestyle modification, nutrition, and exercise guidance.",
    icon: Zap,
    specialties: ["Family Medicine", "Internal Medicine", "Preventive Medicine"],
    durationType: "fixed_term",
    durationMonths: 6,
    defaultPlans: [
      { name: "Foundation", monthlyPrice: 79, annualPrice: 0, entitlements: ["Bi-weekly coaching sessions", "Goal setting & tracking", "Nutrition guidance", "Exercise programming"], badge: null },
      { name: "Intensive", monthlyPrice: 149, annualPrice: 0, entitlements: ["Weekly coaching sessions", "Meal planning", "Fitness tracking integration", "Biometric monitoring", "Group workshops"], badge: "Best Value" },
    ],
    eligibilityRules: [
      { ruleType: "screening", description: "Health Risk Assessment completed", isRequired: true },
      { ruleType: "commitment", description: "6-month minimum commitment", isRequired: true },
    ],
    fundingSources: [
      { sourceType: "stripe_subscription", name: "Patient Self-Pay", cptCode: null, billingFrequency: "monthly" },
      { sourceType: "employer_invoice", name: "Employer Sponsorship", cptCode: null, billingFrequency: "monthly" },
    ],
    practiceCount: 15,
    status: "active",
  },
  {
    id: "prog-4",
    name: "Concierge Medicine",
    code: "CONCIERGE",
    type: "membership",
    description: "Premium concierge medicine with enhanced access, extended appointments, and comprehensive executive health services.",
    icon: Crown,
    specialties: ["Internal Medicine", "Family Medicine"],
    durationType: "ongoing",
    durationMonths: null,
    defaultPlans: [
      { name: "Executive", monthlyPrice: 500, annualPrice: 5400, entitlements: ["Unlimited visits", "Same-day/next-day access", "60-min appointments", "Direct cell phone access", "Annual executive physical", "Specialist coordination"], badge: null },
      { name: "Executive Plus", monthlyPrice: 750, annualPrice: 8100, entitlements: ["Everything in Executive", "Home/office visits", "Travel medicine", "Genetic screening", "Concierge specialist referrals", "Family member discounts"], badge: "Elite" },
    ],
    eligibilityRules: [
      { ruleType: "age", description: "Adults 18+", isRequired: false },
    ],
    fundingSources: [
      { sourceType: "stripe_subscription", name: "Patient Subscription", cptCode: null, billingFrequency: "monthly" },
    ],
    practiceCount: 8,
    status: "active",
  },
  {
    id: "prog-5",
    name: "Annual Enrollment Period (AEP)",
    code: "AEP",
    type: "sponsor_based",
    description: "Employer-sponsored annual enrollment program. Companies enroll employees during open enrollment for DPC + wellness benefits.",
    icon: Shield,
    specialties: ["Family Medicine", "Internal Medicine", "Occupational Medicine"],
    durationType: "fixed_term",
    durationMonths: 12,
    defaultPlans: [
      { name: "Employee Basic", monthlyPrice: 0, annualPrice: 0, entitlements: ["2 visits/month", "Telehealth access", "Annual physical", "Basic lab panel"], badge: null },
      { name: "Employee Plus", monthlyPrice: 0, annualPrice: 0, entitlements: ["4 visits/month", "Unlimited telehealth", "Comprehensive labs", "Mental health support", "Wellness coaching"], badge: "Enhanced" },
      { name: "Employee Family", monthlyPrice: 0, annualPrice: 0, entitlements: ["Family coverage", "Pediatric visits", "All Employee Plus benefits", "Family wellness programs"], badge: "Family" },
    ],
    eligibilityRules: [
      { ruleType: "employer", description: "Active employee of sponsoring organization", isRequired: true },
      { ruleType: "enrollment_window", description: "Open enrollment period (Nov 1 - Dec 15)", isRequired: true },
      { ruleType: "employment_status", description: "Full-time employment status", isRequired: true },
    ],
    fundingSources: [
      { sourceType: "employer_invoice", name: "Employer PEPM Invoice", cptCode: null, billingFrequency: "monthly" },
    ],
    practiceCount: 12,
    status: "active",
  },
  {
    id: "prog-6",
    name: "Employer Wellness",
    code: "EWELLNESS",
    type: "sponsor_based",
    description: "Corporate wellness program with biometric screenings, health coaching, and preventive care. Fully employer-funded.",
    icon: Flower2,
    specialties: ["Occupational Medicine", "Preventive Medicine", "Family Medicine"],
    durationType: "ongoing",
    durationMonths: null,
    defaultPlans: [
      { name: "Wellness Basic", monthlyPrice: 0, annualPrice: 0, entitlements: ["Annual biometric screening", "Health risk assessment", "Quarterly wellness newsletter", "Flu shots"], badge: null },
      { name: "Wellness Pro", monthlyPrice: 0, annualPrice: 0, entitlements: ["Everything in Basic", "Monthly coaching sessions", "Onsite wellness events", "Ergonomic assessments", "Stress management workshops"], badge: "Pro" },
    ],
    eligibilityRules: [
      { ruleType: "employer", description: "Active employee of sponsoring company", isRequired: true },
    ],
    fundingSources: [
      { sourceType: "employer_invoice", name: "Corporate Contract", cptCode: null, billingFrequency: "monthly" },
    ],
    practiceCount: 6,
    status: "active",
  },
  {
    id: "prog-7",
    name: "Group Therapy Program",
    code: "GRP-THERAPY",
    type: "hybrid",
    description: "Structured group therapy sessions for behavioral health. Combines insurance billing with optional self-pay membership for extended services.",
    icon: Brain,
    specialties: ["Psychiatry", "Psychology", "Behavioral Health"],
    durationType: "fixed_term",
    durationMonths: 3,
    defaultPlans: [
      { name: "Group Sessions", monthlyPrice: 0, annualPrice: 0, entitlements: ["Weekly 90-min group session", "Pre/post assessments", "Crisis hotline access", "Resource library"], badge: null },
      { name: "Group + Individual", monthlyPrice: 89, annualPrice: 0, entitlements: ["Weekly group session", "Bi-weekly individual session", "Between-session messaging", "Workbook materials", "Progress tracking"], badge: "Comprehensive" },
    ],
    eligibilityRules: [
      { ruleType: "screening", description: "Clinical screening completed (PHQ-9/GAD-7)", isRequired: true },
      { ruleType: "referral", description: "Provider referral or self-referral with assessment", isRequired: true },
    ],
    fundingSources: [
      { sourceType: "insurance_claim", name: "Insurance Billing", cptCode: "90853", billingFrequency: "per_session" },
      { sourceType: "stripe_subscription", name: "Self-Pay Supplement", cptCode: null, billingFrequency: "monthly" },
    ],
    practiceCount: 9,
    status: "active",
  },
  {
    id: "prog-8",
    name: "Recovery & Addiction Program",
    code: "RECOVERY",
    type: "grant_funded",
    description: "Substance use disorder recovery program. Grant-funded with sliding scale options. Includes MAT, counseling, and peer support.",
    icon: Stethoscope,
    specialties: ["Addiction Medicine", "Psychiatry", "Behavioral Health"],
    durationType: "fixed_term",
    durationMonths: 12,
    defaultPlans: [
      { name: "Outpatient", monthlyPrice: 0, annualPrice: 0, entitlements: ["Weekly individual counseling", "Group therapy 2x/week", "MAT management", "Drug screening", "Peer support specialist"], badge: null },
      { name: "Intensive Outpatient", monthlyPrice: 0, annualPrice: 0, entitlements: ["3x/week group sessions", "Weekly individual counseling", "MAT management", "Family therapy monthly", "Vocational support", "Housing coordination"], badge: "IOP" },
    ],
    eligibilityRules: [
      { ruleType: "diagnosis", description: "SUD diagnosis (F10-F19)", isRequired: true },
      { ruleType: "consent", description: "42 CFR Part 2 consent signed", isRequired: true },
      { ruleType: "assessment", description: "ASAM Level of Care assessment", isRequired: true },
    ],
    fundingSources: [
      { sourceType: "grant", name: "SAMHSA Block Grant", cptCode: null, billingFrequency: "quarterly" },
      { sourceType: "insurance_claim", name: "Medicaid", cptCode: "H0015", billingFrequency: "per_session" },
      { sourceType: "sliding_scale", name: "Sliding Scale Self-Pay", cptCode: null, billingFrequency: "monthly" },
    ],
    practiceCount: 4,
    status: "active",
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: MockProgramTemplate["type"] }) {
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

function StatusDot({ status }: { status: "active" | "draft" }) {
  const color = status === "active" ? "#27ab83" : "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

function formatCurrency(amount: number): string {
  if (amount === 0) return "N/A (billed)";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ProgramTemplatesTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [selectedProgram, setSelectedProgram] = useState<MockProgramTemplate | null>(null);
  const [provisionPracticeId, setProvisionPracticeId] = useState("");
  const [showProvisionDialog, setShowProvisionDialog] = useState(false);
  const [provisionSuccess, setProvisionSuccess] = useState<string | null>(null);

  const filteredPrograms = MOCK_PROGRAM_TEMPLATES.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "All" || p.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const typeOptions = ["All", "membership", "sponsor_based", "insurance_billed", "grant_funded", "hybrid"];

  function handleProvision() {
    if (!provisionPracticeId || !selectedProgram) return;
    const practice = MOCK_PRACTICES_OPTIONS.find((p) => p.id === provisionPracticeId);
    setProvisionSuccess(`"${selectedProgram.name}" provisioned to ${practice?.name || "practice"} successfully!`);
    setShowProvisionDialog(false);
    setProvisionPracticeId("");
    setTimeout(() => setProvisionSuccess(null), 4000);
  }

  // ─── Detail View ────────────────────────────────────────────────────────

  if (selectedProgram) {
    const Icon = selectedProgram.icon;
    return (
      <div className="space-y-6">
        {/* Success message */}
        {provisionSuccess && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "#ecf9ec", color: "#2f8132" }}
          >
            <CheckCircle2 className="w-4 h-4" />
            {provisionSuccess}
          </div>
        )}

        {/* Back button */}
        <button
          onClick={() => setSelectedProgram(null)}
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
                  <StatusDot status={selectedProgram.status} />
                </div>
                <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                  {selectedProgram.description}
                </p>
                <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" />
                    Code: {selectedProgram.code}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {selectedProgram.durationType === "ongoing"
                      ? "Ongoing"
                      : `${selectedProgram.durationMonths} months`}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {selectedProgram.practiceCount} practices
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowProvisionDialog(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 shrink-0"
              style={{ backgroundColor: "#0D9488" }}
            >
              <Send className="w-4 h-4" />
              Provision to Practice
            </button>
          </div>

          {/* Specialties */}
          <div className="flex flex-wrap gap-2 mt-4">
            {selectedProgram.specialties.map((s) => (
              <span
                key={s}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: "#f1f5f9", color: "#475569" }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Plans */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4" style={{ color: "#1B2B4D" }}>
            Default Plans ({selectedProgram.defaultPlans.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-3 font-semibold text-slate-600">Plan Name</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-600">Monthly</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-600">Annual</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-600">Entitlements</th>
                </tr>
              </thead>
              <tbody>
                {selectedProgram.defaultPlans.map((plan, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{plan.name}</span>
                        {plan.badge && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: "#fffbeb", color: "#d97706" }}
                          >
                            {plan.badge}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700">{formatCurrency(plan.monthlyPrice)}</td>
                    <td className="py-3 px-3 text-slate-600">{plan.annualPrice ? formatCurrency(plan.annualPrice) : "—"}</td>
                    <td className="py-3 px-3">
                      <ul className="space-y-0.5">
                        {plan.entitlements.map((e, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                            <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#27ab83" }} />
                            {e}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Eligibility Rules */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4" style={{ color: "#1B2B4D" }}>
            Eligibility Rules ({selectedProgram.eligibilityRules.length})
          </h3>
          <div className="space-y-3">
            {selectedProgram.eligibilityRules.map((rule, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 rounded-lg"
                style={{ backgroundColor: "#f8fafc" }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: rule.isRequired ? "#fef2f2" : "#e6f7f2" }}
                >
                  <Shield
                    className="w-4 h-4"
                    style={{ color: rule.isRequired ? "#dc2626" : "#27ab83" }}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-slate-800">{rule.description}</span>
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: rule.isRequired ? "#fef2f2" : "#f1f5f9",
                        color: rule.isRequired ? "#dc2626" : "#64748b",
                      }}
                    >
                      {rule.isRequired ? "Required" : "Optional"}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 mt-0.5 capitalize">
                    Rule type: {rule.ruleType.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Funding Sources */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4" style={{ color: "#1B2B4D" }}>
            Funding Sources ({selectedProgram.fundingSources.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-3 font-semibold text-slate-600">Source</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-600">Type</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-600">CPT Code</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-600">Frequency</th>
                </tr>
              </thead>
              <tbody>
                {selectedProgram.fundingSources.map((fs, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-medium text-slate-800">{fs.name}</td>
                    <td className="py-3 px-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize"
                        style={{ backgroundColor: "#f1f5f9", color: "#475569" }}
                      >
                        {fs.sourceType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-3 px-3">
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
                    <td className="py-3 px-3 text-slate-600 capitalize">{fs.billingFrequency.replace(/_/g, " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Provision Dialog */}
        {showProvisionDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0"
              style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
              onClick={() => {
                setShowProvisionDialog(false);
                setProvisionPracticeId("");
              }}
            />
            <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold mb-1" style={{ color: "#1B2B4D" }}>
                Provision Program Template
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                Deploy "{selectedProgram.name}" to a practice. This will create a copy of the program with all default plans and settings.
              </p>

              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Select Practice
              </label>
              <select
                value={provisionPracticeId}
                onChange={(e) => setProvisionPracticeId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 mb-4"
                style={{ outlineColor: "#0D9488" }}
              >
                <option value="">Choose a practice...</option>
                {MOCK_PRACTICES_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.specialty})
                  </option>
                ))}
              </select>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowProvisionDialog(false);
                    setProvisionPracticeId("");
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProvision}
                  disabled={!provisionPracticeId}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "#0D9488" }}
                >
                  Provision
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Grid View ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold" style={{ color: "#1B2B4D" }}>
            Program Templates
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {MOCK_PROGRAM_TEMPLATES.length} templates available for provisioning to practices
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: "#0D9488" }}
        >
          <Plus className="w-4 h-4" />
          New Template
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
            style={{ outlineColor: "#0D9488" }}
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2"
        >
          {typeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "All" ? "All Types" : opt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredPrograms.map((program) => {
          const Icon = program.icon;
          return (
            <div
              key={program.id}
              className="glass rounded-xl p-5 hover-lift cursor-pointer transition-all group"
              onClick={() => setSelectedProgram(program)}
            >
              {/* Top row */}
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: "#e6f7f2" }}
                >
                  <Icon className="w-5.5 h-5.5" style={{ color: "#0D9488" }} />
                </div>
                <div className="flex items-center gap-2">
                  <TypeBadge type={program.type} />
                </div>
              </div>

              {/* Name & description */}
              <h4 className="text-base font-semibold text-slate-800 mb-1 group-hover:text-slate-900">
                {program.name}
              </h4>
              <p className="text-xs text-slate-500 mb-3 line-clamp-2">
                {program.description}
              </p>

              {/* Stats row */}
              <div className="flex items-center gap-4 mb-3 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  {program.defaultPlans.length} plans
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {program.practiceCount} practices
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {program.durationType === "ongoing" ? "Ongoing" : `${program.durationMonths}mo`}
                </span>
              </div>

              {/* Specialties */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {program.specialties.slice(0, 3).map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                    style={{ backgroundColor: "#f1f5f9", color: "#64748b" }}
                  >
                    {s}
                  </span>
                ))}
                {program.specialties.length > 3 && (
                  <span className="text-xs text-slate-400">+{program.specialties.length - 3}</span>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <StatusDot status={program.status} />
                <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "#0D9488" }}>
                  View Details
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
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
