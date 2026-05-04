// ===== Enrollment Widget =====
// Public multi-step enrollment form for patients to join a DPC practice.
// URL: /#/enroll/:tenantCode?plan=complete — no auth required

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, ArrowRight, FileText, X } from "lucide-react";
import { useWidgetTheme } from "../../hooks/useWidgetTheme";
import { widgetAnalyticsService, consentService, type PublicConsentTemplate } from "../../lib/api";
import { AgreementBody } from "../shared/AgreementBody";
import { AddressAutocomplete } from "../shared/AddressAutocomplete";
import { MedicationAutocomplete, type RxNormConcept } from "../shared/MedicationAutocomplete";
import { formatUSPhone } from "../../lib/phone";

// ─── Config ─────────────────────────────────────────────────────────────────

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "https://pure-courage-production.up.railway.app/api";

// ─── Colors ─────────────────────────────────────────────────────────────────

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal700: "#0e6651",
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  green500: "#22c55e",
  green600: "#16a34a",
  red400: "#f87171",
  red500: "#ef4444",
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface PlanEntitlementRow {
  id?: string;
  quantity_limit?: number | null;
  quantityLimit?: number | null;
  is_unlimited?: boolean;
  isUnlimited?: boolean;
  period_type?: string;
  periodType?: string;
  sort_order?: number;
  entitlement_type?: { code: string; name: string; category: string; unit_of_measure?: string };
  entitlementType?: { code: string; name: string; category: string; unitOfMeasure?: string };
}

interface Plan {
  id: string;
  name: string;
  description?: string;
  badgeText?: string;
  monthlyPrice: number;
  annualPrice: number;
  visitsPerMonth: number | null;
  telehealthIncluded: boolean;
  messagingIncluded: boolean;
  messagingResponseSlaHours: number | null;
  crisisSupport: boolean;
  labDiscountPct: number;
  prescriptionManagement: boolean;
  /** New canonical benefits source — server returns the plan's
      attached PlanEntitlement rows with entitlementType eager-loaded.
      When present we render this list instead of the legacy boolean
      flags above. Snake/camel keys both supported. */
  planEntitlements?: PlanEntitlementRow[];
  plan_entitlements?: PlanEntitlementRow[];
}

interface FormData {
  // Step 1
  planId: string;
  billingFrequency: "monthly" | "annual";
  // Step 2
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  // Step 3
  medications: string;
  allergies: string;
  primaryCarePhysician: string;
  pharmacyName: string;
  // Step 4
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  // Step 5 (legacy hardcoded — still used as fallback when template fetch fails)
  consentHipaa: boolean;
  consentTreatment: boolean;
  consentFinancial: boolean;
  consentTelehealth: boolean;
  // Step 5 (dynamic) — per-template acknowledgements keyed by slug
  consents: Record<string, boolean>;
  signatureData: string;
  // Honeypot
  websiteUrl: string;
}

const INITIAL_FORM: FormData = {
  planId: "",
  billingFrequency: "monthly",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  medications: "",
  allergies: "",
  primaryCarePhysician: "",
  pharmacyName: "",
  emergencyContactName: "",
  emergencyContactRelationship: "",
  emergencyContactPhone: "",
  consentHipaa: false,
  consentTreatment: false,
  consentFinancial: false,
  consentTelehealth: false,
  consents: {},
  signatureData: "",
  websiteUrl: "",
};

const STEPS = [
  "Select Plan",
  "Your Information",
  "Medical Basics",
  "Emergency Contact",
  "Consent",
  "Review & Enroll",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY",
];

// ─── Mock Data ──────────────────────────────────────────────────────────────

function getMockPlans(tenantCode: string): { practiceName: string; plans: Plan[] } {
  const code = tenantCode.toLowerCase();

  if (code.includes("psych") || code.includes("mental")) {
    return {
      practiceName: "Clearstone Psychiatry",
      plans: [
        { id: "mock-psych-1", name: "Essential", monthlyPrice: 99, annualPrice: 990, visitsPerMonth: 2, telehealthIncluded: true, messagingIncluded: true, messagingResponseSlaHours: 24, crisisSupport: false, labDiscountPct: 10, prescriptionManagement: true },
        { id: "mock-psych-2", name: "Complete", badgeText: "Most Popular", monthlyPrice: 199, annualPrice: 1990, visitsPerMonth: 4, telehealthIncluded: true, messagingIncluded: true, messagingResponseSlaHours: 4, crisisSupport: true, labDiscountPct: 25, prescriptionManagement: true },
        { id: "mock-psych-3", name: "Premium", monthlyPrice: 299, annualPrice: 2990, visitsPerMonth: null, telehealthIncluded: true, messagingIncluded: true, messagingResponseSlaHours: 1, crisisSupport: true, labDiscountPct: 25, prescriptionManagement: true },
      ],
    };
  }

  if (code.includes("primary") || code.includes("family")) {
    return {
      practiceName: "Family Health DPC",
      plans: [
        { id: "mock-primary-1", name: "Basic", monthlyPrice: 79, annualPrice: 790, visitsPerMonth: 2, telehealthIncluded: false, messagingIncluded: true, messagingResponseSlaHours: 24, crisisSupport: false, labDiscountPct: 10, prescriptionManagement: false },
        { id: "mock-primary-2", name: "Standard", badgeText: "Most Popular", monthlyPrice: 149, annualPrice: 1490, visitsPerMonth: 4, telehealthIncluded: true, messagingIncluded: true, messagingResponseSlaHours: 4, crisisSupport: false, labDiscountPct: 15, prescriptionManagement: true },
        { id: "mock-primary-3", name: "Premium", monthlyPrice: 249, annualPrice: 2490, visitsPerMonth: null, telehealthIncluded: true, messagingIncluded: true, messagingResponseSlaHours: 1, crisisSupport: true, labDiscountPct: 25, prescriptionManagement: true },
      ],
    };
  }

  return {
    practiceName: "DPC Practice",
    plans: [
      { id: "mock-default-1", name: "Standard", monthlyPrice: 99, annualPrice: 990, visitsPerMonth: 3, telehealthIncluded: true, messagingIncluded: true, messagingResponseSlaHours: 24, crisisSupport: false, labDiscountPct: 10, prescriptionManagement: false },
      { id: "mock-default-2", name: "Professional", badgeText: "Most Popular", monthlyPrice: 179, annualPrice: 1790, visitsPerMonth: 6, telehealthIncluded: true, messagingIncluded: true, messagingResponseSlaHours: 4, crisisSupport: true, labDiscountPct: 20, prescriptionManagement: true },
      { id: "mock-default-3", name: "Enterprise", monthlyPrice: 299, annualPrice: 2990, visitsPerMonth: null, telehealthIncluded: true, messagingIncluded: true, messagingResponseSlaHours: 1, crisisSupport: true, labDiscountPct: 25, prescriptionManagement: true },
    ],
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function EnrollmentWidget() {
  const { tenantCode } = useParams<{ tenantCode: string }>();
  const [searchParams] = useSearchParams();
  const planParam = searchParams.get("plan");

  // Apply branded theme + track impression
  useWidgetTheme(tenantCode, "enrollment", { trackImpression: { widgetType: "enrollment" } });

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);

  // Save & resume — keep an unsigned draft in localStorage for 24h.
  // Without this, a patient who walks away mid-form (kid wakes up,
  // tab crashes, browser update) loses everything and abandons. The
  // signature_data is intentionally NOT persisted — re-signing is a
  // legal requirement, not a UX nuisance.
  const draftKey = tenantCode ? `membermd:enrollDraft:${tenantCode}` : null;
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    if (!draftKey || draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { savedAt: number; form: FormData; step: number };
      const ageMs = Date.now() - (parsed.savedAt ?? 0);
      if (ageMs > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(draftKey);
        return;
      }
      // Drop signature on resume — patient re-signs at step 5.
      const restored = { ...parsed.form, signatureData: "" };
      setForm((prev) => ({ ...prev, ...restored }));
      setStep(parsed.step ?? 0);
    } catch {
      // Corrupt draft — discard silently.
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    // Skip writing the empty initial state on first render.
    if (form === INITIAL_FORM) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          savedAt: Date.now(),
          form: { ...form, signatureData: "" },
          step,
        }));
      } catch { /* quota exceeded — drop silently */ }
    }, 800);
    return () => clearTimeout(t);
  }, [draftKey, form, step]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [practiceName, setPracticeName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Dynamic consent templates loaded from /external/consent-templates/{tenantCode}.
  // Falls back to legacy hardcoded checkboxes if the fetch fails.
  const [templates, setTemplates] = useState<PublicConsentTemplate[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<PublicConsentTemplate | null>(null);

  const isEmbedded = useMemo(() => {
    try {
      return window.parent !== window;
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    if (!tenantCode) return;

    fetch(`${API_BASE_URL}/external/plans/${tenantCode}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((json) => {
        const d = json.data;
        setPracticeName(d.practice_name);
        const fetchedPlans = (d.plans as Record<string, unknown>[]).map(
          (raw): Plan => ({
            id: String(raw.id ?? ""),
            name: String(raw.name ?? ""),
            description: raw.description ? String(raw.description) : undefined,
            badgeText: raw.badge_text ? String(raw.badge_text) : undefined,
            monthlyPrice: Number(raw.monthly_price ?? 0),
            annualPrice: Number(raw.annual_price ?? 0),
            visitsPerMonth: raw.visits_per_month != null ? Number(raw.visits_per_month) : null,
            telehealthIncluded: Boolean(raw.telehealth_included),
            messagingIncluded: Boolean(raw.messaging_included),
            messagingResponseSlaHours: raw.messaging_response_sla_hours != null ? Number(raw.messaging_response_sla_hours) : null,
            crisisSupport: Boolean(raw.crisis_support),
            labDiscountPct: Number(raw.lab_discount_pct ?? 0),
            prescriptionManagement: Boolean(raw.prescription_management),
            // Server returns either plan_entitlements (Laravel default
            // snake-case) or planEntitlements depending on the response
            // transformer. Pass both through and let the renderer pick.
            plan_entitlements: (raw.plan_entitlements as PlanEntitlementRow[] | undefined) ?? undefined,
            planEntitlements: (raw.planEntitlements as PlanEntitlementRow[] | undefined) ?? undefined,
          })
        );
        setPlans(fetchedPlans);
        preSelectPlan(fetchedPlans);
      })
      .catch(() => {
        const mock = getMockPlans(tenantCode);
        setPracticeName(mock.practiceName);
        setPlans(mock.plans);
        preSelectPlan(mock.plans);
      })
      .finally(() => setLoading(false));
  }, [tenantCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch consent templates for the preview modal. Independent of plan fetch
  // — failure here just means the legacy 4-checkbox fallback runs.
  useEffect(() => {
    if (!tenantCode) return;
    let cancelled = false;
    consentService.publicForEnrollment(tenantCode).then((res) => {
      if (cancelled || !res.data) return;
      const sorted = [...res.data].sort((a, b) => a.display_order - b.display_order);
      setTemplates(sorted);
      // Initialize per-template acknowledgement state to false for each.
      setForm((prev) => ({
        ...prev,
        consents: sorted.reduce((acc, t) => ({ ...acc, [t.slug]: false }), {} as Record<string, boolean>),
      }));
    }).catch(() => { /* legacy fallback path */ });
    return () => { cancelled = true; };
  }, [tenantCode]);

  function preSelectPlan(planList: Plan[]) {
    if (planParam) {
      const match = planList.find(
        (p) => p.name.toLowerCase().replace(/\s+/g, "-") === planParam.toLowerCase()
      );
      if (match) {
        setForm((prev) => ({ ...prev, planId: match.id }));
      }
    }
  }

  const updateField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    []
  );

  // ─── Validation ─────────────────────────────────────────────────────────

  function validateStep(): boolean {
    const errs: Record<string, string> = {};

    if (step === 0) {
      if (!form.planId) errs.planId = "Please select a plan";
    }

    if (step === 1) {
      if (!form.firstName.trim()) errs.firstName = "First name is required";
      if (!form.lastName.trim()) errs.lastName = "Last name is required";
      if (!form.dateOfBirth) errs.dateOfBirth = "Date of birth is required";
      if (!form.phone.trim()) errs.phone = "Phone is required";
      if (!form.email.trim()) errs.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Invalid email";
    }

    if (step === 3) {
      if (!form.emergencyContactName.trim()) errs.emergencyContactName = "Name is required";
      if (!form.emergencyContactRelationship.trim()) errs.emergencyContactRelationship = "Relationship is required";
      if (!form.emergencyContactPhone.trim()) errs.emergencyContactPhone = "Phone is required";
    }

    if (step === 4) {
      // When dynamic templates loaded: every is_required template must be
      // acknowledged. When the fetch failed we fall through to the legacy
      // hardcoded checks.
      if (templates.length > 0) {
        const requiredUnchecked = templates
          .filter((t) => t.is_required)
          .filter((t) => !form.consents[t.slug]);
        if (requiredUnchecked.length > 0) {
          errs.consents = `Please acknowledge: ${requiredUnchecked.map((t) => t.name).join(", ")}`;
        }
      } else {
        if (!form.consentHipaa) errs.consentHipaa = "HIPAA consent is required";
        if (!form.consentTreatment) errs.consentTreatment = "Treatment consent is required";
        if (!form.consentFinancial) errs.consentFinancial = "Financial consent is required";
      }
      if (!form.signatureData.trim()) errs.signatureData = "Signature is required";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function nextStep() {
    if (!validateStep()) return;
    setStep((s) => {
      const next = Math.min(s + 1, STEPS.length - 1);
      // Fire "start" once when the user advances past the first step
      if (s === 0 && next === 1 && tenantCode) {
        void widgetAnalyticsService.trackEvent(tenantCode, "enrollment", "start");
      }
      return next;
    });
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
  }

  // ─── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!validateStep()) return;
    setSubmitting(true);

    // Build the list of acknowledged consent slugs. Prefer the dynamic
    // template state when loaded; fall back to the legacy hardcoded fields
    // so existing tenants without our new endpoint still work.
    let consents: string[] = [];
    if (templates.length > 0) {
      consents = templates
        .filter((t) => form.consents[t.slug])
        .map((t) => t.slug);
    } else {
      if (form.consentHipaa) consents.push("hipaa");
      if (form.consentTreatment) consents.push("treatment");
      if (form.consentFinancial) consents.push("financial");
      if (form.consentTelehealth) consents.push("telehealth");
    }

    const body = {
      plan_id: form.planId,
      billing_frequency: form.billingFrequency,
      first_name: form.firstName,
      last_name: form.lastName,
      date_of_birth: form.dateOfBirth,
      gender: form.gender || null,
      phone: form.phone,
      email: form.email,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
      medications: form.medications || null,
      allergies: form.allergies || null,
      primary_care_physician: form.primaryCarePhysician || null,
      pharmacy_name: form.pharmacyName || null,
      emergency_contact_name: form.emergencyContactName,
      emergency_contact_relationship: form.emergencyContactRelationship,
      emergency_contact_phone: form.emergencyContactPhone,
      consents,
      signature_data: form.signatureData,
      // Audit context — patient's local time at sign time. Server
      // stores signed_at in UTC; this lets reviewers tell whether
      // 11:47 PM was the patient's evening or someone else's
      // middle of the night.
      timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } })(),
      tz_offset_minutes: (() => { try { return -new Date().getTimezoneOffset(); } catch { return null; } })(),
      // Honeypot
      website_url: form.websiteUrl,
    };

    setSubmissionError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/external/enroll/${tenantCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Enrollment failed. Please try again.");
      }

      const data = await res.json();

      // Stripe-billed enrollment: backend returns a Checkout URL and the
      // membership doesn't exist until the patient pays. Redirect them out
      // to Stripe — checkout.session.completed will create the membership
      // and they land on /#/enrollment/success when payment goes through.
      // Clear the saved draft now that submission succeeded (Stripe path
      // is also a "success" — the patient will redirect off the form).
      if (draftKey) {
        try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      }

      if (data.requires_payment && data.checkout_url) {
        // Don't track 'complete' here — the membership doesn't exist yet.
        // The webhook fires once payment lands; we can add a separate
        // checkout_started analytics event when the schema supports it.
        window.location.href = data.checkout_url;
        return;
      }

      // Manual path: practice not Stripe-enforced, membership active
      // immediately. Show the success card.
      setMemberId(data.member_id || "MBR-000000");
      setSubmitted(true);
      if (tenantCode) {
        void widgetAnalyticsService.trackEvent(tenantCode, "enrollment", "complete");
      }
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : "Enrollment failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: isEmbedded ? C.white : C.slate50 }}
      >
        <div className="text-center">
          <div
            className="w-10 h-10 rounded-full animate-spin mx-auto mb-3"
            style={{
              borderWidth: "3px",
              borderStyle: "solid",
              borderColor: C.teal500,
              borderTopColor: "transparent",
            }}
          />
          <p className="text-sm" style={{ color: C.slate500 }}>Loading enrollment...</p>
        </div>
      </div>
    );
  }

  // ─── Success ────────────────────────────────────────────────────────────

  if (submitted) {
    const selectedPlan = plans.find((p) => p.id === form.planId);

    return (
      <div
        className="min-h-screen flex items-center justify-center py-8 px-4"
        style={{ background: isEmbedded ? C.white : C.slate50 }}
      >
        <div
          className="max-w-md w-full rounded-2xl border p-8 text-center"
          style={{ borderColor: C.slate200, backgroundColor: C.white }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: "#dcfce7" }}
          >
            <Check className="w-8 h-8" style={{ color: C.green600 }} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: C.navy900 }}>
            Welcome!
          </h2>
          <p className="text-base mb-1" style={{ color: C.slate600 }}>
            Your membership is now active.
          </p>
          <p className="text-sm mb-6" style={{ color: C.slate500 }}>
            {practiceName} — {selectedPlan?.name} Plan
          </p>

          <div
            className="rounded-xl p-4 mb-6"
            style={{ backgroundColor: C.slate50, border: `1px solid ${C.slate200}` }}
          >
            <p className="text-xs font-medium mb-1" style={{ color: C.slate500 }}>
              Your Member ID
            </p>
            <p className="text-xl font-bold tracking-wider" style={{ color: C.navy900 }}>
              {memberId}
            </p>
          </div>

          <div className="space-y-3">
            <a
              href="https://app.membermd.io"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 text-center"
              style={{ backgroundColor: C.teal500, color: C.white }}
            >
              Book Your First Appointment
            </a>
            <p className="text-xs" style={{ color: C.slate400 }}>
              Check your email for login instructions and next steps.
            </p>
          </div>

          <div className="mt-8 pt-4 border-t" style={{ borderColor: C.slate200 }}>
            <p className="text-xs" style={{ color: C.slate400 }}>
              Powered by{" "}
              <a
                href="https://app.membermd.io"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold hover:underline"
                style={{ color: C.teal500 }}
              >
                MemberMD
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step Renderers ─────────────────────────────────────────────────────

  function renderStep0() {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: C.navy900 }}>
          Select Your Plan
        </h3>
        <p className="text-sm mb-4" style={{ color: C.slate500 }}>
          Choose the membership that fits your needs
        </p>

        {/* Billing Toggle */}
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => updateField("billingFrequency", "monthly")}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: form.billingFrequency === "monthly" ? C.teal500 : C.slate100,
              color: form.billingFrequency === "monthly" ? C.white : C.slate600,
            }}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => updateField("billingFrequency", "annual")}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: form.billingFrequency === "annual" ? C.teal500 : C.slate100,
              color: form.billingFrequency === "annual" ? C.white : C.slate600,
            }}
          >
            Annual
          </button>
        </div>

        {errors.planId && (
          <p className="text-xs mb-3 font-medium" style={{ color: C.red500 }}>{errors.planId}</p>
        )}

        <div className="grid grid-cols-1 gap-4">
          {plans.map((plan) => {
            const selected = form.planId === plan.id;
            const price = form.billingFrequency === "monthly" ? plan.monthlyPrice : plan.annualPrice;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => updateField("planId", plan.id)}
                className="text-left rounded-xl border-2 p-4 transition-all"
                style={{
                  borderColor: selected ? C.teal500 : C.slate200,
                  backgroundColor: selected ? "#f0fdfa" : C.white,
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold" style={{ color: C.navy900 }}>
                        {plan.name}
                      </span>
                      {plan.badgeText && (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: C.teal500, color: C.white }}
                        >
                          {plan.badgeText}
                        </span>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
                        {plan.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold" style={{ color: C.navy900 }}>
                      ${price}
                    </span>
                    <span className="text-xs" style={{ color: C.slate400 }}>
                      /{form.billingFrequency === "monthly" ? "mo" : "yr"}
                    </span>
                  </div>
                </div>
                {selected && (() => {
                  // Prefer the canonical plan_entitlements list when the
                  // server provides one — that's the data source the
                  // practice configures via the plan-detail Entitlements
                  // tab. Fall back to the legacy boolean flags if a
                  // tenant hasn't migrated yet.
                  const ents = plan.planEntitlements || plan.plan_entitlements || [];
                  const benefits: string[] = [];
                  if (ents.length > 0) {
                    // Show the top 5 entitlements ordered by sort_order.
                    const sorted = [...ents].sort(
                      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
                    );
                    for (const e of sorted.slice(0, 5)) {
                      const t = e.entitlement_type || e.entitlementType;
                      const name = t?.name ?? "";
                      if (!name) continue;
                      const unlimited = e.is_unlimited ?? e.isUnlimited ?? false;
                      const qty = e.quantity_limit ?? e.quantityLimit ?? null;
                      const period = (e.period_type ?? e.periodType ?? "per_month")
                        .replace("per_", "/")
                        .replace("month", "mo")
                        .replace("year", "yr");
                      if (unlimited) {
                        benefits.push(`Unlimited ${name.toLowerCase()}`);
                      } else if (typeof qty === "number" && qty > 0) {
                        benefits.push(`${qty} ${name.toLowerCase()}${period}`);
                      } else {
                        benefits.push(name);
                      }
                    }
                    if (ents.length > 5) {
                      benefits.push(`+${ents.length - 5} more`);
                    }
                  } else {
                    // Legacy fallback for plans without entitlements wired.
                    if (plan.visitsPerMonth) benefits.push(`${plan.visitsPerMonth} visits/mo`);
                    else benefits.push("Unlimited visits");
                    if (plan.telehealthIncluded) benefits.push("Telehealth");
                    if (plan.crisisSupport) benefits.push("Crisis support");
                    if (plan.labDiscountPct > 0) benefits.push(`${plan.labDiscountPct}% lab discount`);
                  }
                  return (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: C.slate200 }}>
                      <p className="text-xs" style={{ color: C.slate500 }}>
                        {benefits.join(" • ")}
                      </p>
                    </div>
                  );
                })()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderStep1() {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: C.navy900 }}>
          Your Information
        </h3>
        <p className="text-sm mb-5" style={{ color: C.slate500 }}>
          Tell us about yourself
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="First Name *" value={form.firstName} error={errors.firstName} onChange={(v) => updateField("firstName", v)} />
          <FormField label="Last Name *" value={form.lastName} error={errors.lastName} onChange={(v) => updateField("lastName", v)} />
          <FormField label="Date of Birth *" value={form.dateOfBirth} error={errors.dateOfBirth} type="date" onChange={(v) => updateField("dateOfBirth", v)} />
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.navy800 }}>Gender</label>
            <select
              value={form.gender}
              onChange={(e) => updateField("gender", e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={{ borderColor: C.slate200, color: C.navy900 }}
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non-binary">Non-binary</option>
              <option value="other">Other</option>
            </select>
          </div>
          <FormField label="Phone *" value={form.phone} error={errors.phone} type="tel" onChange={(v) => updateField("phone", v)} />
          <FormField label="Email *" value={form.email} error={errors.email} type="email" onChange={(v) => updateField("email", v)} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <AddressAutocomplete
            label="Address"
            value={form.address}
            helper="Start typing — we'll auto-fill city, state, and ZIP."
            onChange={(text, parsed) => {
              setForm((prev) => ({
                ...prev,
                address: parsed?.street || text,
                ...(parsed
                  ? { city: parsed.city, state: parsed.state, zip: parsed.zip }
                  : {}),
              }));
            }}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FormField label="City" value={form.city} onChange={(v) => updateField("city", v)} />
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.navy800 }}>State</label>
              <select
                value={form.state}
                onChange={(e) => updateField("state", e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                style={{ borderColor: C.slate200, color: C.navy900 }}
              >
                <option value="">--</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <FormField label="ZIP" value={form.zip} onChange={(v) => updateField("zip", v)} />
          </div>
        </div>

        {/* Honeypot — hidden from humans */}
        <div style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
          <label htmlFor="website_url">Website</label>
          <input
            id="website_url"
            name="website_url"
            type="text"
            value={form.websiteUrl}
            onChange={(e) => updateField("websiteUrl", e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: C.navy900 }}>
          Medical Basics
        </h3>
        <p className="text-sm mb-5" style={{ color: C.slate500 }}>
          Help us prepare for your first visit (all fields optional)
        </p>

        <div className="space-y-4">
          <div>
            <MedicationAutocomplete
              label="Search medications"
              value=""
              placeholder="Type a medication name (e.g. sertraline)..."
              helper="Pick a match to add it to your list below. Free-form notes also OK."
              onChange={(_text, concept: RxNormConcept | null) => {
                if (concept) {
                  // Append the canonical RxNorm name to the textarea, one
                  // per line. Helps practices reconcile meds against a
                  // standardized vocabulary.
                  setForm((prev) => {
                    const existing = (prev.medications || "").trim();
                    const next = existing ? `${existing}\n${concept.name}` : concept.name;
                    return { ...prev, medications: next };
                  });
                }
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.navy800 }}>
              Current Medications
            </label>
            <textarea
              value={form.medications}
              onChange={(e) => updateField("medications", e.target.value)}
              rows={4}
              placeholder="Use the search above or type any medications you currently take..."
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none resize-none"
              style={{ borderColor: C.slate200, color: C.navy900 }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.navy800 }}>
              Allergies
            </label>
            <textarea
              value={form.allergies}
              onChange={(e) => updateField("allergies", e.target.value)}
              rows={2}
              placeholder="List any known allergies..."
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none resize-none"
              style={{ borderColor: C.slate200, color: C.navy900 }}
            />
          </div>
          <FormField label="Primary Care Physician" value={form.primaryCarePhysician} onChange={(v) => updateField("primaryCarePhysician", v)} placeholder="Current PCP name (if any)" />
          <FormField label="Preferred Pharmacy" value={form.pharmacyName} onChange={(v) => updateField("pharmacyName", v)} placeholder="Pharmacy name and location" />
        </div>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: C.navy900 }}>
          Emergency Contact
        </h3>
        <p className="text-sm mb-5" style={{ color: C.slate500 }}>
          Who should we contact in case of emergency?
        </p>

        <div className="space-y-4">
          <FormField label="Full Name *" value={form.emergencyContactName} error={errors.emergencyContactName} onChange={(v) => updateField("emergencyContactName", v)} />
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.navy800 }}>
              Relationship *
            </label>
            <select
              value={form.emergencyContactRelationship}
              onChange={(e) => updateField("emergencyContactRelationship", e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={{
                borderColor: errors.emergencyContactRelationship ? C.red400 : C.slate200,
                color: C.navy900,
              }}
            >
              <option value="">Select...</option>
              <option value="spouse">Spouse</option>
              <option value="parent">Parent</option>
              <option value="child">Child</option>
              <option value="sibling">Sibling</option>
              <option value="friend">Friend</option>
              <option value="other">Other</option>
            </select>
            {errors.emergencyContactRelationship && (
              <p className="text-xs mt-1" style={{ color: C.red500 }}>{errors.emergencyContactRelationship}</p>
            )}
          </div>
          <FormField label="Phone *" value={form.emergencyContactPhone} error={errors.emergencyContactPhone} type="tel" onChange={(v) => updateField("emergencyContactPhone", v)} />
        </div>
      </div>
    );
  }

  function renderStep4() {
    const useDynamic = templates.length > 0;

    return (
      <div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: C.navy900 }}>
          Agreements & Consents
        </h3>
        <p className="text-sm mb-5" style={{ color: C.slate500 }}>
          Click <strong>Preview</strong> to read each document in full before checking the box.
        </p>

        <div className="space-y-3">
          {useDynamic
            ? templates.map((t) => (
                <ConsentCardWithPreview
                  key={t.slug}
                  template={t}
                  checked={!!form.consents[t.slug]}
                  onChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      consents: { ...prev.consents, [t.slug]: v },
                    }))
                  }
                  onPreview={() => setPreviewTemplate(t)}
                />
              ))
            : (
              <>
                {/* Legacy hardcoded fallback when /external/consent-templates fails */}
                <ConsentCheckbox
                  checked={form.consentHipaa}
                  error={errors.consentHipaa}
                  onChange={(v) => updateField("consentHipaa", v)}
                  label="HIPAA Notice of Privacy Practices"
                  description="I acknowledge receipt of the Notice of Privacy Practices and understand how my health information may be used and disclosed."
                />
                <ConsentCheckbox
                  checked={form.consentTreatment}
                  error={errors.consentTreatment}
                  onChange={(v) => updateField("consentTreatment", v)}
                  label="Consent to Treatment"
                  description="I consent to examination, testing, and treatment as deemed necessary by my healthcare provider."
                />
                <ConsentCheckbox
                  checked={form.consentFinancial}
                  error={errors.consentFinancial}
                  onChange={(v) => updateField("consentFinancial", v)}
                  label="Financial Agreement"
                  description="I understand the membership fees, billing terms, and cancellation policy associated with this plan."
                />
                <ConsentCheckbox
                  checked={form.consentTelehealth}
                  onChange={(v) => updateField("consentTelehealth", v)}
                  label="Telehealth Consent (Optional)"
                  description="I consent to receive healthcare services via telehealth technology when appropriate."
                />
              </>
            )}

          {errors.consents && (
            <p className="text-xs mt-1" style={{ color: C.red500 }}>{errors.consents}</p>
          )}

          <div className="mt-6">
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.navy800 }}>
              Electronic Signature *
            </label>
            <p className="text-xs mb-2" style={{ color: C.slate500 }}>
              Type your full legal name to sign all checked agreements above.
            </p>
            <input
              type="text"
              value={form.signatureData}
              onChange={(e) => updateField("signatureData", e.target.value)}
              placeholder="Type your full name"
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={{
                borderColor: errors.signatureData ? C.red400 : C.slate200,
                color: C.navy900,
                fontStyle: "italic",
                fontSize: "16px",
              }}
            />
            {errors.signatureData && (
              <p className="text-xs mt-1" style={{ color: C.red500 }}>{errors.signatureData}</p>
            )}
          </div>
        </div>

        {/* Preview modal */}
        {previewTemplate && (
          <AgreementPreviewModal
            template={previewTemplate}
            onClose={() => setPreviewTemplate(null)}
          />
        )}
      </div>
    );
  }

  function renderStep5() {
    const selectedPlan = plans.find((p) => p.id === form.planId);
    const price =
      form.billingFrequency === "monthly"
        ? selectedPlan?.monthlyPrice
        : selectedPlan?.annualPrice;

    return (
      <div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: C.navy900 }}>
          Review & Complete
        </h3>
        <p className="text-sm mb-5" style={{ color: C.slate500 }}>
          Please review your information before completing enrollment
        </p>

        <div className="space-y-4">
          {/* Plan Summary */}
          <ReviewSection title="Selected Plan">
            <p className="font-semibold" style={{ color: C.navy900 }}>
              {selectedPlan?.name} — ${price}/{form.billingFrequency === "monthly" ? "mo" : "yr"}
            </p>
            <p className="text-xs" style={{ color: C.slate500 }}>
              Billed {form.billingFrequency}
            </p>
          </ReviewSection>

          {/* Personal Info */}
          <ReviewSection title="Personal Information">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <ReviewItem label="Name" value={`${form.firstName} ${form.lastName}`} />
              <ReviewItem label="DOB" value={form.dateOfBirth} />
              <ReviewItem label="Phone" value={form.phone} />
              <ReviewItem label="Email" value={form.email} />
              {form.address && <ReviewItem label="Address" value={`${form.address}, ${form.city}, ${form.state} ${form.zip}`} />}
            </div>
          </ReviewSection>

          {/* Medical */}
          {(form.medications || form.allergies) && (
            <ReviewSection title="Medical Information">
              <div className="grid grid-cols-1 gap-2 text-sm">
                {form.medications && <ReviewItem label="Medications" value={form.medications} />}
                {form.allergies && <ReviewItem label="Allergies" value={form.allergies} />}
                {form.primaryCarePhysician && <ReviewItem label="PCP" value={form.primaryCarePhysician} />}
              </div>
            </ReviewSection>
          )}

          {/* Emergency Contact */}
          <ReviewSection title="Emergency Contact">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <ReviewItem label="Name" value={form.emergencyContactName} />
              <ReviewItem label="Relationship" value={form.emergencyContactRelationship} />
              <ReviewItem label="Phone" value={form.emergencyContactPhone} />
            </div>
          </ReviewSection>

          {/* Consents */}
          <ReviewSection title="Consents">
            <div className="space-y-1 text-sm">
              {form.consentHipaa && <p style={{ color: C.green600 }}>HIPAA Privacy Practices</p>}
              {form.consentTreatment && <p style={{ color: C.green600 }}>Consent to Treatment</p>}
              {form.consentFinancial && <p style={{ color: C.green600 }}>Financial Agreement</p>}
              {form.consentTelehealth && <p style={{ color: C.green600 }}>Telehealth Consent</p>}
            </div>
            <p className="text-xs mt-2 italic" style={{ color: C.slate500 }}>
              Signed by: {form.signatureData}
            </p>
          </ReviewSection>
        </div>
      </div>
    );
  }

  const stepRenderers = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];

  // ─── Main Render ────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{
        background: isEmbedded
          ? C.white
          : `linear-gradient(135deg, ${C.slate50} 0%, ${C.white} 50%, ${C.slate50} 100%)`,
      }}
    >
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: C.navy900 }}>
            {practiceName}
          </h1>
          <p className="text-sm mt-1" style={{ color: C.slate500 }}>
            Membership Enrollment
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium" style={{ color: C.slate500 }}>
              Step {step + 1} of {STEPS.length}
            </p>
            <p className="text-xs font-medium" style={{ color: C.teal500 }}>
              {STEPS[step]}
            </p>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.slate200 }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${((step + 1) / STEPS.length) * 100}%`,
                backgroundColor: C.teal500,
              }}
            />
          </div>
          {/* Step dots */}
          <div className="flex justify-between mt-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: i <= step ? C.teal500 : C.slate300,
                }}
              />
            ))}
          </div>
        </div>

        {/* Form Card */}
        <div
          className="rounded-2xl border p-6 md:p-8"
          style={{ borderColor: C.slate200, backgroundColor: C.white }}
        >
          {stepRenderers[step]()}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t" style={{ borderColor: C.slate200 }}>
            {step > 0 ? (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{ color: C.slate600, backgroundColor: C.slate100 }}
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <div />
            )}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                style={{ backgroundColor: C.teal500, color: C.white }}
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: C.teal500, color: C.white }}
              >
                {submitting ? "Enrolling..." : "Complete Enrollment"}
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </button>
            )}
          </div>

          {submissionError && (
            <div
              className="mt-4 rounded-lg border px-4 py-3 text-sm"
              style={{ borderColor: C.red400, backgroundColor: "#fef2f2", color: C.red500 }}
            >
              {submissionError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs" style={{ color: C.slate400 }}>
            Powered by{" "}
            <a
              href="https://app.membermd.io"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:underline"
              style={{ color: C.teal500 }}
            >
              MemberMD
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Sub-components ──────────────────────────────────────────────────

function FormField({
  label,
  value,
  error,
  type = "text",
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  type?: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.navy800 }}>
        {label}
      </label>
      <input
        type={type}
        // type="tel" inputs auto-format to "(555) 123-4567" as the user
        // types — keeps the public widget consistent with the in-app
        // forms that use the shared PhoneField component.
        inputMode={type === "tel" ? "tel" : type === "email" ? "email" : undefined}
        autoComplete={type === "tel" ? "tel" : type === "email" ? "email" : undefined}
        value={value}
        onChange={(e) => {
          const v = type === "tel" ? formatUSPhone(e.target.value) : e.target.value;
          onChange(v);
        }}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-colors"
        style={{
          borderColor: error ? C.red400 : C.slate200,
          color: C.navy900,
        }}
      />
      {error && (
        <p className="text-xs mt-1" style={{ color: C.red500 }}>{error}</p>
      )}
    </div>
  );
}

function ConsentCheckbox({
  checked,
  error,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  error?: string;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div
      className="rounded-xl border p-4 transition-colors cursor-pointer"
      style={{
        borderColor: error ? C.red400 : checked ? C.teal500 : C.slate200,
        backgroundColor: checked ? "#f0fdfa" : C.white,
      }}
      onClick={() => onChange(!checked)}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{
            backgroundColor: checked ? C.teal500 : C.white,
            border: checked ? "none" : `2px solid ${C.slate300}`,
          }}
        >
          {checked && <Check className="w-3.5 h-3.5" style={{ color: C.white }} />}
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: C.navy900 }}>{label}</p>
          <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>{description}</p>
        </div>
      </div>
      {error && (
        <p className="text-xs mt-2 ml-8" style={{ color: C.red500 }}>{error}</p>
      )}
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: C.slate50, border: `1px solid ${C.slate200}` }}>
      <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.slate500 }}>
        {title}
      </h4>
      {children}
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs" style={{ color: C.slate400 }}>{label}: </span>
      <span className="text-sm" style={{ color: C.navy900 }}>{value}</span>
    </div>
  );
}

/**
 * One row in the consent list — shows the template's name + description,
 * a Preview button that opens the modal, and a checkbox the patient
 * checks AFTER reading. Required vs optional is communicated via badge.
 */
function ConsentCardWithPreview({
  template,
  checked,
  onChange,
  onPreview,
}: {
  template: PublicConsentTemplate;
  checked: boolean;
  onChange: (v: boolean) => void;
  onPreview: () => void;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: checked ? C.teal500 : C.slate200,
        backgroundColor: checked ? "rgba(39, 171, 131, 0.04)" : C.white,
      }}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5"
          style={{ width: "18px", height: "18px", accentColor: C.teal500, cursor: "pointer" }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold" style={{ color: C.navy900 }}>
              {template.name}
            </p>
            {template.is_required ? (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded"
                style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
              >
                Required
              </span>
            ) : (
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{ backgroundColor: C.slate100, color: C.slate500 }}
              >
                Optional
              </span>
            )}
            <span className="text-xs" style={{ color: C.slate400 }}>
              v{template.version}
            </span>
          </div>
          {template.description && (
            <p className="text-xs mt-1" style={{ color: C.slate500 }}>
              {template.description}
            </p>
          )}
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold transition-colors hover:underline"
            style={{ color: C.teal600 }}
          >
            <FileText className="w-3.5 h-3.5" />
            Preview full document
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal showing the template's full body (rendered Markdown). Patient
 * scrolls through the legal text. Closing the modal does NOT auto-check
 * the agreement — the patient still has to click the box themselves on
 * the underlying step. That's deliberate: a "by viewing this you agree"
 * flow doesn't survive a court challenge.
 */
function AgreementPreviewModal({
  template,
  onClose,
}: {
  template: PublicConsentTemplate;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: C.white,
          borderRadius: "12px",
          maxWidth: "780px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid " + C.slate200,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>
              {template.name}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
              Version {template.version}
              {template.is_required ? " · Required" : " · Optional"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" style={{ color: C.slate500 }} />
          </button>
        </div>
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            flex: 1,
          }}
        >
          <AgreementBody content={template.content} />
        </div>
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid " + C.slate200,
            backgroundColor: C.slate50,
            textAlign: "right",
          }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: C.teal500 }}
          >
            Done — return to checklist
          </button>
        </div>
      </div>
    </div>
  );
}
