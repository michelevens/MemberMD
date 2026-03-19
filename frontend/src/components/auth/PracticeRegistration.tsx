// ===== MemberMD Practice Registration Wizard =====
// Multi-step onboarding for doctors signing up their practice
// Pattern from ShiftPulse TenantRegistration

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Brain, Heart, Baby, Stethoscope, Scan, Activity, Users, Leaf, Crown,
  Flame, Shield, Zap, ArrowLeft, ArrowRight, Check, Loader2, Eye, EyeOff,
  Building2, User, Lock, ClipboardList, Sparkles, ChevronRight, Layers,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

// ─── US States ──────────────────────────────────────────────────────────────

const US_STATES = [
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" }, { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" }, { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" }, { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" }, { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" }, { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" }, { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" }, { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" }, { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" }, { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" }, { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" }, { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" }, { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" }, { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" }, { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" }, { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

// ─── Specialties ────────────────────────────────────────────────────────────

const SPECIALTIES = [
  { id: "psychiatry", name: "Psychiatry", description: "Mental health, medication management, therapy", icon: Brain },
  { id: "primary_care", name: "Primary Care", description: "Preventive care, chronic disease, wellness", icon: Heart },
  { id: "family_medicine", name: "Family Medicine", description: "All ages, comprehensive primary care", icon: Stethoscope },
  { id: "pediatrics", name: "Pediatrics", description: "Infant through adolescent care", icon: Baby },
  { id: "internal_medicine", name: "Internal Medicine", description: "Adult primary care, complex conditions", icon: Stethoscope },
  { id: "dermatology", name: "Dermatology", description: "Skin, hair, nail conditions, cosmetic", icon: Scan },
  { id: "cardiology", name: "Cardiology", description: "Heart health, hypertension, arrhythmia", icon: Heart },
  { id: "endocrinology", name: "Endocrinology", description: "Diabetes, thyroid, hormonal conditions", icon: Activity },
  { id: "obgyn", name: "OB/GYN", description: "Women's health, prenatal, reproductive", icon: Users },
  { id: "functional_medicine", name: "Functional Medicine", description: "Root-cause, integrative, holistic", icon: Leaf },
  { id: "concierge_medicine", name: "Concierge Medicine", description: "Premium personalized care", icon: Crown },
  { id: "pain_management", name: "Pain Management", description: "Chronic pain, interventional procedures", icon: Flame },
  { id: "addiction_medicine", name: "Addiction Medicine", description: "Substance use, recovery, MAT", icon: Shield },
  { id: "neurology", name: "Neurology", description: "Brain, spine, nerve conditions", icon: Zap },
];

// ─── Practice Models ────────────────────────────────────────────────────────

const PRACTICE_MODELS = [
  {
    id: "pure_dpc",
    name: "Pure DPC",
    description: "Membership only. No insurance billing. Patients pay a monthly fee for unlimited or tiered access.",
    popular: true,
  },
  {
    id: "hybrid_dpc",
    name: "Hybrid DPC",
    description: "Membership + insurance. Offer DPC memberships while still accepting insurance for some services.",
    popular: false,
  },
  {
    id: "concierge",
    name: "Concierge",
    description: "Retainer + insurance. Annual retainer fee for enhanced access, plus insurance billing for visits.",
    popular: false,
  },
  {
    id: "cash_pay",
    name: "Cash-Pay",
    description: "Fee-for-service without insurance. Transparent pricing, no membership required.",
    popular: false,
  },
];

// ─── Credentials ────────────────────────────────────────────────────────────

const CREDENTIALS = [
  "MD", "DO", "NP", "DNP", "PA", "PA-C", "PMHNP", "FNP", "LCSW", "LPC", "PhD", "PsyD", "Other",
];

// ─── Program type icons (fallback) ──────────────────────────────────────────

const PROGRAM_TYPE_ICONS: Record<string, typeof Layers> = {
  membership: Crown,
  sponsor_based: Users,
  insurance_billed: Shield,
  grant_funded: Heart,
  hybrid: Activity,
};

// ─── Step Names ─────────────────────────────────────────────────────────────

const STEP_NAMES = [
  "Practice Info",
  "Specialty",
  "Programs",
  "Practice Model",
  "Provider Info",
  "Create Account",
  "Review & Complete",
];

const TOTAL_STEPS = 7;

// ─── Types ──────────────────────────────────────────────────────────────────

interface PracticeInfo {
  practiceName: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface ProviderInfo {
  firstName: string;
  lastName: string;
  credentials: string;
  npi: string;
  licenseNumber: string;
  licenseState: string;
  bio: string;
}

interface AccountInfo {
  email: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
}

interface ProgramTemplate {
  id: string;
  name: string;
  code: string | null;
  type: string;
  description: string | null;
  icon: string | null;
  specialties: string[] | null;
  sortOrder: number;
}

interface ProvisioningSummary {
  programs: number;
  screeningTemplates: number;
  consentTemplates: number;
  appointmentTypes: number;
  diagnosisFavorites: number;
}

type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type WizardStep = StepNumber | "welcome";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPasswordStrength(pw: string): { label: string; percent: number; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 2) return { label: "Weak", percent: 25, color: "#ef4444" };
  if (score <= 3) return { label: "Fair", percent: 50, color: "#f59e0b" };
  if (score <= 4) return { label: "Good", percent: 75, color: "#27ab83" };
  return { label: "Strong", percent: 100, color: "#147d64" };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PracticeRegistration() {
  const navigate = useNavigate();

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Step 1: Practice Info
  const [practiceInfo, setPracticeInfo] = useState<PracticeInfo>({
    practiceName: "", phone: "", email: "", website: "",
    address: "", city: "", state: "", zip: "",
  });

  // Step 2: Specialty
  const [selectedSpecialty, setSelectedSpecialty] = useState("");

  // Step 3: Programs
  const [programTemplates, setProgramTemplates] = useState<ProgramTemplate[]>([]);
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);

  // Step 4: Practice Model
  const [selectedModel, setSelectedModel] = useState("");

  // Step 5: Provider Info
  const [providerInfo, setProviderInfo] = useState<ProviderInfo>({
    firstName: "", lastName: "", credentials: "", npi: "",
    licenseNumber: "", licenseState: "", bio: "",
  });

  // Step 6: Account
  const [accountInfo, setAccountInfo] = useState<AccountInfo>({
    email: "", password: "", confirmPassword: "", agreeTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);

  // Welcome screen provisioning data
  const [provisioningSummary, setProvisioningSummary] = useState<ProvisioningSummary | null>(null);

  // Field errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ─── Fetch program templates when specialty is selected ─────────────────

  const fetchProgramTemplates = useCallback(async () => {
    setProgramsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/registration/program-templates`, {
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const json = await response.json();
        const templates: ProgramTemplate[] = (json.data || []).map((p: Record<string, unknown>) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          type: p.type,
          description: p.description,
          icon: p.icon,
          specialties: p.specialties,
          sortOrder: p.sort_order ?? p.sortOrder ?? 0,
        }));
        setProgramTemplates(templates);
      }
    } catch {
      // Silently fail — programs step will show empty
    }
    setProgramsLoading(false);
  }, []);

  useEffect(() => {
    if (step === 3 && programTemplates.length === 0) {
      fetchProgramTemplates();
    }
  }, [step, programTemplates.length, fetchProgramTemplates]);

  // Filter programs by selected specialty
  const filteredPrograms = programTemplates.filter((p) => {
    if (!p.specialties || p.specialties.length === 0) return true;
    return p.specialties.includes(selectedSpecialty);
  });

  // ─── Toggle program selection ──────────────────────────────────────────

  function toggleProgram(code: string | null) {
    if (!code) return;
    setSelectedPrograms((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  // ─── Validation ─────────────────────────────────────────────────────────

  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!practiceInfo.practiceName.trim()) e.practiceName = "Practice name is required";
    if (!practiceInfo.phone.trim()) e.phone = "Phone number is required";
    if (!practiceInfo.email.trim()) e.email = "Email is required";
    else if (!isValidEmail(practiceInfo.email)) e.email = "Enter a valid email address";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep5(): boolean {
    const e: Record<string, string> = {};
    if (!providerInfo.firstName.trim()) e.firstName = "First name is required";
    if (!providerInfo.lastName.trim()) e.lastName = "Last name is required";
    if (providerInfo.npi && !/^\d{10}$/.test(providerInfo.npi)) e.npi = "NPI must be exactly 10 digits";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep6(): boolean {
    const e: Record<string, string> = {};
    if (!accountInfo.email.trim()) e.accountEmail = "Email is required";
    else if (!isValidEmail(accountInfo.email)) e.accountEmail = "Enter a valid email address";
    if (!accountInfo.password) e.password = "Password is required";
    else if (accountInfo.password.length < 8) e.password = "Password must be at least 8 characters";
    if (accountInfo.password !== accountInfo.confirmPassword) e.confirmPassword = "Passwords do not match";
    if (!accountInfo.agreeTerms) e.agreeTerms = "You must agree to the terms";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ─── Navigation ─────────────────────────────────────────────────────────

  function handleContinue() {
    setErrors({});
    if (step === 1) {
      if (validateStep1()) {
        // Pre-fill account email from practice email
        if (!accountInfo.email) setAccountInfo(prev => ({ ...prev, email: practiceInfo.email }));
        setStep(2);
      }
    } else if (step === 2) {
      if (selectedSpecialty) {
        // Reset program selections when specialty changes
        setSelectedPrograms([]);
        setStep(3);
      }
    } else if (step === 3) {
      // Programs step — always allow continue (programs are optional)
      setStep(4);
    } else if (step === 4) {
      if (selectedModel) setStep(5);
    } else if (step === 5) {
      if (validateStep5()) setStep(6);
    } else if (step === 6) {
      if (validateStep6()) setStep(7);
    }
  }

  function handleBack() {
    setErrors({});
    if (step === 1) {
      navigate("/login");
    } else if (typeof step === "number" && step > 1) {
      setStep((step - 1) as StepNumber);
    }
  }

  // ─── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setLoading(true);
    setSubmitError("");
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          practice_name: practiceInfo.practiceName,
          phone: practiceInfo.phone,
          practice_email: practiceInfo.email,
          website: practiceInfo.website,
          address: practiceInfo.address,
          city: practiceInfo.city,
          state: practiceInfo.state,
          zip: practiceInfo.zip,
          specialty: selectedSpecialty,
          selected_programs: selectedPrograms.length > 0 ? selectedPrograms : null,
          practice_model: selectedModel,
          first_name: providerInfo.firstName,
          last_name: providerInfo.lastName,
          credentials: providerInfo.credentials,
          npi: providerInfo.npi,
          license_number: providerInfo.licenseNumber,
          license_state: providerInfo.licenseState,
          bio: providerInfo.bio,
          email: accountInfo.email,
          password: accountInfo.password,
          password_confirmation: accountInfo.confirmPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setSubmitError(data.message || "Registration failed. Please try again.");
        setLoading(false);
        return;
      }
      // Capture provisioning summary from response
      if (data.data?.provisioning) {
        const p = data.data.provisioning;
        setProvisioningSummary({
          programs: p.programs ?? p.programs ?? 0,
          screeningTemplates: p.screening_templates ?? p.screeningTemplates ?? 0,
          consentTemplates: p.consent_templates ?? p.consentTemplates ?? 0,
          appointmentTypes: p.appointment_types ?? p.appointmentTypes ?? 0,
          diagnosisFavorites: p.diagnosis_favorites ?? p.diagnosisFavorites ?? 0,
        });
      }
      setStep("welcome");
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    }
    setLoading(false);
  }

  // ─── Input helpers ──────────────────────────────────────────────────────

  function updatePractice<K extends keyof PracticeInfo>(field: K, value: PracticeInfo[K]) {
    setPracticeInfo(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  function updateProvider<K extends keyof ProviderInfo>(field: K, value: ProviderInfo[K]) {
    setProviderInfo(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  function updateAccount<K extends keyof AccountInfo>(field: K, value: AccountInfo[K]) {
    setAccountInfo(prev => ({ ...prev, [field]: value }));
    const errorKey = field === "email" ? "accountEmail" : field;
    if (errors[errorKey]) setErrors(prev => { const n = { ...prev }; delete n[errorKey]; return n; });
  }

  // ─── Can Continue? ─────────────────────────────────────────────────────

  function canContinue(): boolean {
    if (step === 1) return !!(practiceInfo.practiceName && practiceInfo.phone && practiceInfo.email);
    if (step === 2) return !!selectedSpecialty;
    if (step === 3) return true; // Programs are optional
    if (step === 4) return !!selectedModel;
    if (step === 5) return !!(providerInfo.firstName && providerInfo.lastName);
    if (step === 6) return !!(accountInfo.email && accountInfo.password && accountInfo.confirmPassword && accountInfo.agreeTerms);
    return true;
  }

  // ─── Shared input class ────────────────────────────────────────────────

  const inputClass = `w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm
    focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all duration-200`;

  const selectClass = `w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm
    focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all duration-200 appearance-none`;

  const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

  // ─── Welcome Screen ────────────────────────────────────────────────────

  if (step === "welcome") {
    const specialtyName = SPECIALTIES.find(s => s.id === selectedSpecialty)?.name || "medical";
    const summary = provisioningSummary;

    const provisionedItems = summary
      ? [
          summary.programs > 0 ? `${summary.programs} program${summary.programs !== 1 ? "s" : ""} activated` : null,
          summary.screeningTemplates > 0 ? `${summary.screeningTemplates} screening tool${summary.screeningTemplates !== 1 ? "s" : ""} loaded` : null,
          summary.consentTemplates > 0 ? `${summary.consentTemplates} consent template${summary.consentTemplates !== 1 ? "s" : ""} added` : null,
          summary.appointmentTypes > 0 ? `${summary.appointmentTypes} appointment type${summary.appointmentTypes !== 1 ? "s" : ""} configured` : null,
          summary.diagnosisFavorites > 0 ? `${summary.diagnosisFavorites} diagnosis favorite${summary.diagnosisFavorites !== 1 ? "s" : ""} loaded` : null,
          "Practice settings initialized",
        ].filter(Boolean) as string[]
      : [
          "Membership plans created",
          "Appointment types configured",
          "Screening tools loaded",
          "Consent templates added",
          "Practice settings initialized",
        ];

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="animate-page-in w-full max-w-lg text-center">
          <div className="glass rounded-2xl p-10 shadow-navy">
            {/* Celebration icon */}
            <div
              className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
            >
              <Sparkles className="w-10 h-10 text-white" />
            </div>

            <h1 className="text-3xl font-bold text-navy-800 mb-2">Welcome to MemberMD!</h1>
            <p className="text-slate-500 mb-8">
              Your {specialtyName} practice has been provisioned.
            </p>

            {/* Provisioned items */}
            <div className="text-left space-y-3 mb-8">
              {provisionedItems.map((item) => (
                <div key={item} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-teal-50 border border-teal-100">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "#27ab83" }}
                  >
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-medium text-navy-700">{item}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate("/practice")}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all duration-200 hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
            >
              Go to My Practice
              <ChevronRight className="inline-block w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Progress ───────────────────────────────────────────────────────────

  const currentStep = step as StepNumber;
  const progressPercent = (currentStep / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Navy Header */}
      <div
        className="py-8 px-4 mb-8"
        style={{ background: "linear-gradient(135deg, #102a43, #243b53)" }}
      >
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-white mb-1">MemberMD</h1>
          <p className="text-slate-300 text-sm">Create Your Practice</p>
        </div>
      </div>

      <div className="px-4" style={{ maxWidth: (currentStep === 2 || currentStep === 3) ? "56rem" : "42rem", margin: "0 auto" }}>
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-navy-700">{STEP_NAMES[currentStep - 1]}</span>
            <span className="text-sm text-slate-400">Step {currentStep} of {TOTAL_STEPS}</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%`, background: "linear-gradient(90deg, #27ab83, #147d64)" }}
            />
          </div>
        </div>

        {/* Step Content */}
        <div className="animate-page-in" key={currentStep}>
          <div className="glass rounded-2xl shadow-navy overflow-hidden">
            {/* ─── Step 1: Practice Info ──────────────────────────────── */}
            {currentStep === 1 && (
              <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
                  >
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-navy-800">Practice Information</h2>
                    <p className="text-sm text-slate-500">Tell us about your practice</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>
                      Practice Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={practiceInfo.practiceName}
                      onChange={e => updatePractice("practiceName", e.target.value)}
                      className={inputClass}
                      placeholder="Evergreen Family Medicine"
                    />
                    {errors.practiceName && <p className="text-xs text-red-500 mt-1">{errors.practiceName}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>
                        Phone <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={practiceInfo.phone}
                        onChange={e => updatePractice("phone", e.target.value)}
                        className={inputClass}
                        placeholder="(555) 000-0001"
                      />
                      {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                    </div>
                    <div>
                      <label className={labelClass}>
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={practiceInfo.email}
                        onChange={e => updatePractice("email", e.target.value)}
                        className={inputClass}
                        placeholder="info@yourpractice.com"
                      />
                      {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Website</label>
                    <input
                      type="url"
                      value={practiceInfo.website}
                      onChange={e => updatePractice("website", e.target.value)}
                      className={inputClass}
                      placeholder="https://yourpractice.com"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Address</label>
                    <input
                      type="text"
                      value={practiceInfo.address}
                      onChange={e => updatePractice("address", e.target.value)}
                      className={inputClass}
                      placeholder="123 Main Street, Suite 200"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelClass}>City</label>
                      <input
                        type="text"
                        value={practiceInfo.city}
                        onChange={e => updatePractice("city", e.target.value)}
                        className={inputClass}
                        placeholder="Tampa"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>State</label>
                      <select
                        value={practiceInfo.state}
                        onChange={e => updatePractice("state", e.target.value)}
                        className={selectClass}
                      >
                        <option value="">Select</option>
                        {US_STATES.map(s => (
                          <option key={s.value} value={s.value}>{s.value}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>ZIP</label>
                      <input
                        type="text"
                        value={practiceInfo.zip}
                        onChange={e => updatePractice("zip", e.target.value)}
                        className={inputClass}
                        placeholder="33601"
                        maxLength={10}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 2: Specialty ──────────────────────────────────── */}
            {currentStep === 2 && (
              <div className="p-8">
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
                  >
                    <Stethoscope className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-navy-800">Select Your Specialty</h2>
                    <p className="text-sm text-slate-500">Choose the specialty that best describes your practice</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
                  {SPECIALTIES.map(spec => {
                    const Icon = spec.icon;
                    const isSelected = selectedSpecialty === spec.id;
                    return (
                      <button
                        key={spec.id}
                        type="button"
                        onClick={() => setSelectedSpecialty(spec.id)}
                        className={`relative text-left p-4 rounded-xl border-2 transition-all duration-200 hover-lift group ${
                          isSelected
                            ? "border-teal-400 bg-teal-50"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        {/* Checkmark */}
                        {isSelected && (
                          <div
                            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ background: "#27ab83" }}
                          >
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}

                        <div className="flex items-start gap-3">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200"
                            style={{
                              background: isSelected
                                ? "linear-gradient(135deg, #27ab83, #147d64)"
                                : "linear-gradient(135deg, #e2e8f0, #cbd5e1)",
                            }}
                          >
                            <Icon className="w-4.5 h-4.5" style={{ color: isSelected ? "white" : "#475569" }} />
                          </div>
                          <div className="min-w-0">
                            <h3
                              className="font-semibold text-sm mb-0.5"
                              style={{ color: isSelected ? "#102a43" : "#334155" }}
                            >
                              {spec.name}
                            </h3>
                            <p className="text-xs text-slate-500 leading-snug">{spec.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── Step 3: Programs ───────────────────────────────────── */}
            {currentStep === 3 && (
              <div className="p-8">
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
                  >
                    <Layers className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-navy-800">Select Your Programs</h2>
                    <p className="text-sm text-slate-500">
                      Choose which programs to activate for your {SPECIALTIES.find(s => s.id === selectedSpecialty)?.name || ""} practice.
                      You can add more later.
                    </p>
                  </div>
                </div>

                {programsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                    <span className="ml-3 text-slate-500 text-sm">Loading available programs...</span>
                  </div>
                ) : filteredPrograms.length === 0 ? (
                  <div className="text-center py-12">
                    <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">No program templates available for your specialty yet.</p>
                    <p className="text-slate-400 text-xs mt-1">You can configure programs after registration.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                    {filteredPrograms.map(prog => {
                      const isSelected = prog.code ? selectedPrograms.includes(prog.code) : false;
                      const TypeIcon = PROGRAM_TYPE_ICONS[prog.type] || Layers;
                      return (
                        <button
                          key={prog.id}
                          type="button"
                          onClick={() => toggleProgram(prog.code)}
                          className={`relative text-left p-5 rounded-xl border-2 transition-all duration-200 hover-lift ${
                            isSelected
                              ? "border-teal-400 bg-teal-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          {/* Checkbox indicator */}
                          <div className="absolute top-3 right-3">
                            <div
                              className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors duration-200"
                              style={{
                                borderColor: isSelected ? "#27ab83" : "#cbd5e1",
                                background: isSelected ? "#27ab83" : "transparent",
                              }}
                            >
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </div>

                          <div className="flex items-start gap-3 pr-6">
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                              style={{
                                background: isSelected
                                  ? "linear-gradient(135deg, #27ab83, #147d64)"
                                  : "linear-gradient(135deg, #e2e8f0, #cbd5e1)",
                              }}
                            >
                              <TypeIcon className="w-5 h-5" style={{ color: isSelected ? "white" : "#475569" }} />
                            </div>
                            <div className="min-w-0">
                              <h3
                                className="font-semibold text-sm mb-1"
                                style={{ color: isSelected ? "#102a43" : "#334155" }}
                              >
                                {prog.name}
                              </h3>
                              {prog.description && (
                                <p className="text-xs text-slate-500 leading-snug">{prog.description}</p>
                              )}
                              <span
                                className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{
                                  background: isSelected ? "#d1fae5" : "#f1f5f9",
                                  color: isSelected ? "#065f46" : "#64748b",
                                }}
                              >
                                {prog.type.replace(/_/g, " ")}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedPrograms.length > 0 && (
                  <div className="mt-4 px-4 py-2.5 rounded-xl bg-teal-50 border border-teal-100 text-sm text-teal-700">
                    {selectedPrograms.length} program{selectedPrograms.length !== 1 ? "s" : ""} selected
                  </div>
                )}
              </div>
            )}

            {/* ─── Step 4: Practice Model ────────────────────────────── */}
            {currentStep === 4 && (
              <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
                  >
                    <ClipboardList className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-navy-800">Practice Model</h2>
                    <p className="text-sm text-slate-500">How do you want to run your practice?</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {PRACTICE_MODELS.map(model => {
                    const isSelected = selectedModel === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => setSelectedModel(model.id)}
                        className={`relative text-left p-5 rounded-xl border-2 transition-all duration-200 hover-lift ${
                          isSelected
                            ? "border-teal-400 bg-teal-50"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        {/* Popular badge */}
                        {model.popular && (
                          <span
                            className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                            style={{ background: "linear-gradient(135deg, #D4A855, #c49a48)" }}
                          >
                            Popular
                          </span>
                        )}

                        {/* Selection indicator */}
                        <div className="flex items-start justify-between mb-3">
                          <h3
                            className="font-semibold text-base"
                            style={{ color: isSelected ? "#102a43" : "#334155" }}
                          >
                            {model.name}
                          </h3>
                          <div
                            className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5"
                            style={{ borderColor: isSelected ? "#27ab83" : "#cbd5e1" }}
                          >
                            {isSelected && (
                              <div className="w-3 h-3 rounded-full" style={{ background: "#27ab83" }} />
                            )}
                          </div>
                        </div>

                        <p className="text-sm text-slate-500 leading-relaxed">{model.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── Step 5: Provider Info ──────────────────────────────── */}
            {currentStep === 5 && (
              <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
                  >
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-navy-800">Provider Information</h2>
                    <p className="text-sm text-slate-500">Your professional details</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={providerInfo.firstName}
                        onChange={e => updateProvider("firstName", e.target.value)}
                        className={inputClass}
                        placeholder="Sarah"
                      />
                      {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
                    </div>
                    <div>
                      <label className={labelClass}>
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={providerInfo.lastName}
                        onChange={e => updateProvider("lastName", e.target.value)}
                        className={inputClass}
                        placeholder="Mitchell"
                      />
                      {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>}
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Credentials</label>
                    <select
                      value={providerInfo.credentials}
                      onChange={e => updateProvider("credentials", e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Select credentials</option>
                      {CREDENTIALS.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>NPI</label>
                    <input
                      type="text"
                      value={providerInfo.npi}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        updateProvider("npi", val);
                      }}
                      className={inputClass}
                      placeholder="10-digit National Provider Identifier"
                      maxLength={10}
                    />
                    {errors.npi && <p className="text-xs text-red-500 mt-1">{errors.npi}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>State License Number</label>
                      <input
                        type="text"
                        value={providerInfo.licenseNumber}
                        onChange={e => updateProvider("licenseNumber", e.target.value)}
                        className={inputClass}
                        placeholder="License number"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>License State</label>
                      <select
                        value={providerInfo.licenseState}
                        onChange={e => updateProvider("licenseState", e.target.value)}
                        className={selectClass}
                      >
                        <option value="">Select state</option>
                        {US_STATES.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Bio</label>
                    <textarea
                      value={providerInfo.bio}
                      onChange={e => updateProvider("bio", e.target.value)}
                      className={`${inputClass} resize-none`}
                      rows={3}
                      placeholder="Brief description for your patient-facing profile"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 6: Create Account ─────────────────────────────── */}
            {currentStep === 6 && (
              <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
                  >
                    <Lock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-navy-800">Create Your Account</h2>
                    <p className="text-sm text-slate-500">Set up your login credentials</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={accountInfo.email}
                      onChange={e => updateAccount("email", e.target.value)}
                      className={inputClass}
                      placeholder="you@practice.com"
                    />
                    {errors.accountEmail && <p className="text-xs text-red-500 mt-1">{errors.accountEmail}</p>}
                  </div>

                  <div>
                    <label className={labelClass}>
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={accountInfo.password}
                        onChange={e => updateAccount("password", e.target.value)}
                        className={`${inputClass} pr-12`}
                        placeholder="Min 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}

                    {/* Password strength */}
                    {accountInfo.password && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500">Password strength</span>
                          <span
                            className="text-xs font-medium"
                            style={{ color: getPasswordStrength(accountInfo.password).color }}
                          >
                            {getPasswordStrength(accountInfo.password).label}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${getPasswordStrength(accountInfo.password).percent}%`,
                              background: getPasswordStrength(accountInfo.password).color,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={accountInfo.confirmPassword}
                      onChange={e => updateAccount("confirmPassword", e.target.value)}
                      className={inputClass}
                      placeholder="Confirm your password"
                    />
                    {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>}
                  </div>

                  <div className="flex items-start gap-3 pt-2">
                    <input
                      type="checkbox"
                      id="agreeTerms"
                      checked={accountInfo.agreeTerms}
                      onChange={e => updateAccount("agreeTerms", e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-500 focus:ring-teal-400"
                    />
                    <label htmlFor="agreeTerms" className="text-sm text-slate-600">
                      I agree to the{" "}
                      <a href="#/terms" className="text-teal-600 hover:underline font-medium">Terms of Service</a>
                      {" "}and{" "}
                      <a href="#/privacy" className="text-teal-600 hover:underline font-medium">Privacy Policy</a>
                    </label>
                  </div>
                  {errors.agreeTerms && <p className="text-xs text-red-500">{errors.agreeTerms}</p>}
                </div>
              </div>
            )}

            {/* ─── Step 7: Review & Complete ──────────────────────────── */}
            {currentStep === 7 && (
              <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
                  >
                    <Check className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-navy-800">Review & Complete</h2>
                    <p className="text-sm text-slate-500">Confirm your details before we set up your practice</p>
                  </div>
                </div>

                <div className="space-y-5">
                  {/* Practice Info */}
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2">
                      <Building2 className="w-4 h-4" /> Practice Info
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="text-slate-500">Name:</span>{" "}
                        <span className="font-medium text-slate-800">{practiceInfo.practiceName}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Phone:</span>{" "}
                        <span className="font-medium text-slate-800">{practiceInfo.phone}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Email:</span>{" "}
                        <span className="font-medium text-slate-800">{practiceInfo.email}</span>
                      </div>
                      {practiceInfo.website && (
                        <div>
                          <span className="text-slate-500">Website:</span>{" "}
                          <span className="font-medium text-slate-800">{practiceInfo.website}</span>
                        </div>
                      )}
                      {practiceInfo.address && (
                        <div className="sm:col-span-2">
                          <span className="text-slate-500">Address:</span>{" "}
                          <span className="font-medium text-slate-800">
                            {practiceInfo.address}
                            {practiceInfo.city && `, ${practiceInfo.city}`}
                            {practiceInfo.state && `, ${practiceInfo.state}`}
                            {practiceInfo.zip && ` ${practiceInfo.zip}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Specialty, Programs & Model */}
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4" /> Specialty, Programs & Practice Model
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="text-slate-500">Specialty:</span>{" "}
                        <span className="font-medium text-slate-800">
                          {SPECIALTIES.find(s => s.id === selectedSpecialty)?.name}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Model:</span>{" "}
                        <span className="font-medium text-slate-800">
                          {PRACTICE_MODELS.find(m => m.id === selectedModel)?.name}
                        </span>
                      </div>
                      {selectedPrograms.length > 0 && (
                        <div className="sm:col-span-2">
                          <span className="text-slate-500">Programs:</span>{" "}
                          <span className="font-medium text-slate-800">
                            {selectedPrograms
                              .map(code => filteredPrograms.find(p => p.code === code)?.name || code)
                              .join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Provider Info */}
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2">
                      <User className="w-4 h-4" /> Provider Info
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="text-slate-500">Name:</span>{" "}
                        <span className="font-medium text-slate-800">
                          {providerInfo.firstName} {providerInfo.lastName}
                          {providerInfo.credentials && `, ${providerInfo.credentials}`}
                        </span>
                      </div>
                      {providerInfo.npi && (
                        <div>
                          <span className="text-slate-500">NPI:</span>{" "}
                          <span className="font-medium text-slate-800">{providerInfo.npi}</span>
                        </div>
                      )}
                      {providerInfo.licenseNumber && (
                        <div>
                          <span className="text-slate-500">License:</span>{" "}
                          <span className="font-medium text-slate-800">
                            {providerInfo.licenseNumber}
                            {providerInfo.licenseState && ` (${providerInfo.licenseState})`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Account */}
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2">
                      <Lock className="w-4 h-4" /> Account
                    </h3>
                    <div className="text-sm">
                      <span className="text-slate-500">Email:</span>{" "}
                      <span className="font-medium text-slate-800">{accountInfo.email}</span>
                    </div>
                  </div>
                </div>

                {/* Submit error */}
                {submitError && (
                  <div className="mt-4 bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 border border-red-200">
                    {submitError}
                  </div>
                )}
              </div>
            )}

            {/* ─── Navigation Footer ─────────────────────────────────── */}
            <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {currentStep === 1 ? "Back to Login" : "Back"}
              </button>

              {currentStep < TOTAL_STEPS ? (
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinue()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                  style={{ background: canContinue() ? "linear-gradient(135deg, #27ab83, #147d64)" : "#94a3b8" }}
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all duration-200 disabled:opacity-60 hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Setting up your practice...
                    </>
                  ) : (
                    <>
                      Create My Practice
                      <Sparkles className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
