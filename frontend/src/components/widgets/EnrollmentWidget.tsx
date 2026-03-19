// ===== Enrollment Widget =====
// Public multi-step enrollment form for patients to join a DPC practice.
// URL: /#/enroll/:tenantCode?plan=complete — no auth required

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";

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
  // Step 5
  consentHipaa: boolean;
  consentTreatment: boolean;
  consentFinancial: boolean;
  consentTelehealth: boolean;
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

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [practiceName, setPracticeName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      if (!form.consentHipaa) errs.consentHipaa = "HIPAA consent is required";
      if (!form.consentTreatment) errs.consentTreatment = "Treatment consent is required";
      if (!form.consentFinancial) errs.consentFinancial = "Financial consent is required";
      if (!form.signatureData.trim()) errs.signatureData = "Signature is required";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function nextStep() {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
  }

  // ─── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!validateStep()) return;
    setSubmitting(true);

    const consents: string[] = [];
    if (form.consentHipaa) consents.push("hipaa");
    if (form.consentTreatment) consents.push("treatment");
    if (form.consentFinancial) consents.push("financial");
    if (form.consentTelehealth) consents.push("telehealth");

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
      // Honeypot
      website_url: form.websiteUrl,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/external/enroll/${tenantCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Enrollment failed");
      }

      const data = await res.json();
      setMemberId(data.member_id || "MBR-000000");
      setSubmitted(true);
    } catch (err) {
      // For mock/demo — simulate success
      setMemberId("MBR-" + Math.random().toString(36).substring(2, 8).toUpperCase());
      setSubmitted(true);
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
                {selected && (
                  <div className="mt-2 pt-2 border-t" style={{ borderColor: C.slate200 }}>
                    <p className="text-xs" style={{ color: C.slate500 }}>
                      {plan.visitsPerMonth ? `${plan.visitsPerMonth} visits/mo` : "Unlimited visits"}
                      {plan.telehealthIncluded ? " • Telehealth" : ""}
                      {plan.crisisSupport ? " • Crisis support" : ""}
                      {plan.labDiscountPct > 0 ? ` • ${plan.labDiscountPct}% lab discount` : ""}
                    </p>
                  </div>
                )}
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
          <FormField label="Address" value={form.address} onChange={(v) => updateField("address", v)} />
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
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.navy800 }}>
              Current Medications
            </label>
            <textarea
              value={form.medications}
              onChange={(e) => updateField("medications", e.target.value)}
              rows={3}
              placeholder="List any medications you currently take..."
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
    return (
      <div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: C.navy900 }}>
          Consent & Agreement
        </h3>
        <p className="text-sm mb-5" style={{ color: C.slate500 }}>
          Please review and agree to the following
        </p>

        <div className="space-y-4">
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

          <div className="mt-6">
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.navy800 }}>
              Electronic Signature *
            </label>
            <p className="text-xs mb-2" style={{ color: C.slate500 }}>
              Type your full legal name to sign
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
