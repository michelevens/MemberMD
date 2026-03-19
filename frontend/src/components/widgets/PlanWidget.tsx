// ===== Plan Display Widget =====
// Public embeddable widget showing a practice's DPC membership plans.
// URL: /#/plans/:tenantCode — no auth required

import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";

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
  red400: "#f87171",
  amber500: "#f59e0b",
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
  featuresList?: string[];
}

interface PracticeInfo {
  practiceName: string;
  specialty?: string;
  plans: Plan[];
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

function getMockPlans(tenantCode: string): PracticeInfo {
  const code = tenantCode.toLowerCase();

  if (code.includes("psych") || code.includes("mental")) {
    return {
      practiceName: "Clearstone Psychiatry",
      specialty: "Psychiatry",
      plans: [
        {
          id: "mock-psych-1",
          name: "Essential",
          description: "Core psychiatric care for individuals",
          monthlyPrice: 99,
          annualPrice: 990,
          visitsPerMonth: 2,
          telehealthIncluded: true,
          messagingIncluded: true,
          messagingResponseSlaHours: 24,
          crisisSupport: false,
          labDiscountPct: 10,
          prescriptionManagement: true,
          featuresList: [],
        },
        {
          id: "mock-psych-2",
          name: "Complete",
          description: "Comprehensive care with priority access",
          badgeText: "Most Popular",
          monthlyPrice: 199,
          annualPrice: 1990,
          visitsPerMonth: 4,
          telehealthIncluded: true,
          messagingIncluded: true,
          messagingResponseSlaHours: 4,
          crisisSupport: true,
          labDiscountPct: 25,
          prescriptionManagement: true,
          featuresList: [],
        },
        {
          id: "mock-psych-3",
          name: "Premium",
          description: "Unlimited access with concierge-level care",
          monthlyPrice: 299,
          annualPrice: 2990,
          visitsPerMonth: null,
          telehealthIncluded: true,
          messagingIncluded: true,
          messagingResponseSlaHours: 1,
          crisisSupport: true,
          labDiscountPct: 25,
          prescriptionManagement: true,
          featuresList: [],
        },
      ],
    };
  }

  if (code.includes("primary") || code.includes("family")) {
    return {
      practiceName: "Family Health DPC",
      specialty: "Primary Care",
      plans: [
        {
          id: "mock-primary-1",
          name: "Basic",
          description: "Essential primary care membership",
          monthlyPrice: 79,
          annualPrice: 790,
          visitsPerMonth: 2,
          telehealthIncluded: false,
          messagingIncluded: true,
          messagingResponseSlaHours: 24,
          crisisSupport: false,
          labDiscountPct: 10,
          prescriptionManagement: false,
          featuresList: [],
        },
        {
          id: "mock-primary-2",
          name: "Standard",
          description: "Full-service primary care",
          badgeText: "Most Popular",
          monthlyPrice: 149,
          annualPrice: 1490,
          visitsPerMonth: 4,
          telehealthIncluded: true,
          messagingIncluded: true,
          messagingResponseSlaHours: 4,
          crisisSupport: false,
          labDiscountPct: 15,
          prescriptionManagement: true,
          featuresList: [],
        },
        {
          id: "mock-primary-3",
          name: "Premium",
          description: "Unlimited visits with premium perks",
          monthlyPrice: 249,
          annualPrice: 2490,
          visitsPerMonth: null,
          telehealthIncluded: true,
          messagingIncluded: true,
          messagingResponseSlaHours: 1,
          crisisSupport: true,
          labDiscountPct: 25,
          prescriptionManagement: true,
          featuresList: [],
        },
      ],
    };
  }

  // Default
  return {
    practiceName: "DPC Practice",
    specialty: "Direct Primary Care",
    plans: [
      {
        id: "mock-default-1",
        name: "Standard",
        description: "Core membership for individuals",
        monthlyPrice: 99,
        annualPrice: 990,
        visitsPerMonth: 3,
        telehealthIncluded: true,
        messagingIncluded: true,
        messagingResponseSlaHours: 24,
        crisisSupport: false,
        labDiscountPct: 10,
        prescriptionManagement: false,
        featuresList: [],
      },
      {
        id: "mock-default-2",
        name: "Professional",
        description: "Enhanced care with priority access",
        badgeText: "Most Popular",
        monthlyPrice: 179,
        annualPrice: 1790,
        visitsPerMonth: 6,
        telehealthIncluded: true,
        messagingIncluded: true,
        messagingResponseSlaHours: 4,
        crisisSupport: true,
        labDiscountPct: 20,
        prescriptionManagement: true,
        featuresList: [],
      },
      {
        id: "mock-default-3",
        name: "Enterprise",
        description: "Unlimited access with concierge care",
        monthlyPrice: 299,
        annualPrice: 2990,
        visitsPerMonth: null,
        telehealthIncluded: true,
        messagingIncluded: true,
        messagingResponseSlaHours: 1,
        crisisSupport: true,
        labDiscountPct: 25,
        prescriptionManagement: true,
        featuresList: [],
      },
    ],
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function transformApiPlan(raw: Record<string, unknown>): Plan {
  return {
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
    featuresList: Array.isArray(raw.features_list) ? raw.features_list as string[] : [],
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PlanWidget() {
  const { tenantCode } = useParams<{ tenantCode: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<PracticeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

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
        setData({
          practiceName: d.practice_name,
          specialty: d.specialty,
          plans: (d.plans as Record<string, unknown>[]).map(transformApiPlan),
        });
      })
      .catch(() => {
        // Fallback to mock
        setData(getMockPlans(tenantCode));
      })
      .finally(() => setLoading(false));
  }, [tenantCode]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: isEmbedded ? C.white : `linear-gradient(135deg, ${C.slate50}, ${C.white})` }}
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
          <p className="text-sm" style={{ color: C.slate500 }}>Loading plans...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: isEmbedded ? C.white : C.slate50 }}
      >
        <div className="text-center p-8">
          <p className="text-lg font-semibold" style={{ color: C.navy900 }}>
            Practice Not Found
          </p>
          <p className="text-sm mt-2" style={{ color: C.slate500 }}>
            {error || "Unable to load membership plans."}
          </p>
        </div>
      </div>
    );
  }

  const annualSavings = (plan: Plan) => {
    const monthlyTotal = plan.monthlyPrice * 12;
    const saved = monthlyTotal - plan.annualPrice;
    return saved > 0 ? saved : 0;
  };

  const handleEnroll = (planId: string) => {
    const planSlug = data.plans.find((p) => p.id === planId)?.name.toLowerCase().replace(/\s+/g, "-") || "";
    navigate(`/enroll/${tenantCode}?plan=${planSlug}`);
  };

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{
        background: isEmbedded
          ? C.white
          : `linear-gradient(135deg, ${C.slate50} 0%, ${C.white} 50%, ${C.slate50} 100%)`,
      }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: C.navy900 }}>
            {data.practiceName}
          </h1>
          {data.specialty && (
            <p className="text-sm mt-1" style={{ color: C.slate500 }}>
              {data.specialty}
            </p>
          )}
          <p className="text-base mt-3" style={{ color: C.slate600 }}>
            Choose the membership plan that fits your needs
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <button
            onClick={() => setBillingCycle("monthly")}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: billingCycle === "monthly" ? C.teal500 : C.slate100,
              color: billingCycle === "monthly" ? C.white : C.slate600,
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle("annual")}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            style={{
              backgroundColor: billingCycle === "annual" ? C.teal500 : C.slate100,
              color: billingCycle === "annual" ? C.white : C.slate600,
            }}
          >
            Annual
            <span
              className="px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: billingCycle === "annual" ? "rgba(255,255,255,0.25)" : "#dcfce7", color: billingCycle === "annual" ? C.white : "#166534" }}
            >
              Save up to 17%
            </span>
          </button>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {data.plans.map((plan) => {
            const price = billingCycle === "monthly" ? plan.monthlyPrice : plan.annualPrice;
            const savings = annualSavings(plan);
            const isPopular = !!plan.badgeText;

            return (
              <div
                key={plan.id}
                className="relative rounded-2xl border-2 p-6 flex flex-col transition-shadow hover:shadow-lg"
                style={{
                  borderColor: isPopular ? C.teal500 : C.slate200,
                  backgroundColor: C.white,
                }}
              >
                {/* Badge */}
                {plan.badgeText && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold"
                    style={{ backgroundColor: C.teal500, color: C.white }}
                  >
                    {plan.badgeText}
                  </div>
                )}

                {/* Plan Name */}
                <h3 className="text-xl font-bold mt-2" style={{ color: C.navy900 }}>
                  {plan.name}
                </h3>
                {plan.description && (
                  <p className="text-sm mt-1 mb-4" style={{ color: C.slate500 }}>
                    {plan.description}
                  </p>
                )}

                {/* Price */}
                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold" style={{ color: C.navy900 }}>
                      ${price}
                    </span>
                    <span className="text-sm" style={{ color: C.slate400 }}>
                      /{billingCycle === "monthly" ? "mo" : "yr"}
                    </span>
                  </div>
                  {billingCycle === "annual" && savings > 0 && (
                    <p className="text-xs mt-1 font-medium" style={{ color: C.green500 }}>
                      Save ${savings}/year vs monthly
                    </p>
                  )}
                  {billingCycle === "monthly" && (
                    <p className="text-xs mt-1" style={{ color: C.slate400 }}>
                      or ${plan.annualPrice}/yr billed annually
                    </p>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t mb-4" style={{ borderColor: C.slate200 }} />

                {/* Features */}
                <ul className="space-y-3 flex-1 mb-6">
                  <FeatureRow
                    included
                    text={plan.visitsPerMonth ? `${plan.visitsPerMonth} visits per month` : "Unlimited visits"}
                  />
                  <FeatureRow
                    included={plan.telehealthIncluded}
                    text={plan.telehealthIncluded ? "Telehealth included" : "Telehealth not included"}
                  />
                  <FeatureRow
                    included={plan.messagingIncluded}
                    text={
                      plan.messagingIncluded
                        ? `Messaging (${plan.messagingResponseSlaHours}hr response)`
                        : "Messaging not included"
                    }
                  />
                  <FeatureRow
                    included={plan.crisisSupport}
                    text={plan.crisisSupport ? "Crisis support" : "No crisis support"}
                  />
                  <FeatureRow
                    included={plan.labDiscountPct > 0}
                    text={plan.labDiscountPct > 0 ? `${plan.labDiscountPct}% lab discount` : "No lab discount"}
                  />
                  <FeatureRow
                    included={plan.prescriptionManagement}
                    text={plan.prescriptionManagement ? "Prescription management" : "No prescription management"}
                  />
                  {plan.featuresList?.map((feat, i) => (
                    <FeatureRow key={i} included text={feat} />
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => handleEnroll(plan.id)}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                  style={{
                    backgroundColor: isPopular ? C.teal500 : C.navy900,
                    color: C.white,
                  }}
                >
                  Enroll Now
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center mt-10">
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

// ─── Feature Row ────────────────────────────────────────────────────────────

function FeatureRow({ included, text }: { included: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {included ? (
        <Check className="w-4 h-4 flex-shrink-0" style={{ color: C.teal500 }} />
      ) : (
        <X className="w-4 h-4 flex-shrink-0" style={{ color: C.slate300 }} />
      )}
      <span style={{ color: included ? C.slate600 : C.slate400 }}>{text}</span>
    </li>
  );
}
