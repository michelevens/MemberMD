// ===== MemberMD Marketing Landing Page =====

import { useNavigate } from "react-router-dom";
import {
  Users,
  CreditCard,
  Video,
  Stethoscope,
  Shield,
  Layers,
  Building2,
  Settings,
  LayoutDashboard,
  ChevronRight,
  Globe,
  Zap,
  MonitorSmartphone,
} from "lucide-react";

// ─── Color Palette ────────────────────────────────────────────────────────────

const colors = {
  navy900: "#102a43",
  navy800: "#243b53",
  navy700: "#334e68",
  navy600: "#486581",
  teal600: "#0d9488",
  teal500: "#14b8a6",
  teal400: "#2dd4bf",
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  slate700: "#334155",
  slate900: "#0f172a",
};

// ─── Feature Data ─────────────────────────────────────────────────────────────

const features = [
  {
    icon: Layers,
    title: "Flexible Program Engine",
    description: "Membership, sponsor-funded, insurance, grant, employer, or hybrid — define access rules, eligibility, and entitlements for any care model.",
  },
  {
    icon: Users,
    title: "Patient & Member Management",
    description: "Full roster, family plans, intake forms, consent tracking, and enrollment workflows for every member and sponsor.",
  },
  {
    icon: CreditCard,
    title: "Billing & Payments",
    description: "Stripe-powered subscriptions, invoicing, coupon codes, dunning, and sponsor billing — all automated.",
  },
  {
    icon: Video,
    title: "Telehealth",
    description: "Built-in video visits powered by Daily.co with consent capture, recording, and encounter documentation.",
  },
  {
    icon: Stethoscope,
    title: "Clinical Workflows",
    description: "Appointments, encounters (SOAP), prescriptions with PDF + eFax, screenings (PHQ-9, GAD-7), and lab orders.",
  },
  {
    icon: Shield,
    title: "HIPAA Compliance",
    description: "End-to-end encryption, PHI access logging, audit trails, role-based authorization policies, and consent management.",
  },
];

const steps = [
  {
    icon: Building2,
    step: "01",
    title: "Register Your Organization",
    description: "Select your specialty, choose your program types (membership, sponsor, grant, hybrid), and go live in minutes.",
  },
  {
    icon: Settings,
    step: "02",
    title: "Define Programs & Rules",
    description: "Create plans with eligibility rules, entitlements, funding sources, and pricing — then share embeddable enrollment widgets.",
  },
  {
    icon: LayoutDashboard,
    step: "03",
    title: "Manage Care From One Dashboard",
    description: "Patients, programs, billing, appointments, telehealth, and compliance — unified in a single real-time view.",
  },
];

const stats = [
  { icon: Globe, label: "14 Specialties" },
  { icon: Layers, label: "6 Program Types" },
  { icon: Shield, label: "HIPAA-Ready" },
  { icon: MonitorSmartphone, label: "Telehealth Built-In" },
];

// ─── Landing Page Component ───────────────────────────────────────────────────

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.white }}>
      {/* ── Navigation Bar ─────────────────────────────────────────────── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(8px)",
          borderColor: colors.slate200,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Zap className="w-6 h-6" style={{ color: colors.teal600 }} />
              <span
                className="text-xl font-bold tracking-tight"
                style={{ color: colors.navy900 }}
              >
                MemberMD
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/login")}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
                style={{ color: colors.navy700 }}
              >
                Sign In
              </button>
              <button
                onClick={() => navigate("/register")}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: colors.teal600,
                  color: colors.white,
                }}
              >
                Start Your Practice
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ───────────────────────────────────────────────── */}
      <section
        className="pt-32 pb-20 sm:pt-40 sm:pb-28"
        style={{
          background: `linear-gradient(135deg, ${colors.navy900} 0%, ${colors.navy800} 50%, ${colors.navy700} 100%)`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-3xl mx-auto">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-8"
              style={{
                backgroundColor: "rgba(13,148,136,0.15)",
                color: colors.teal400,
              }}
            >
              <Zap className="w-4 h-4" />
              DPC &middot; CCM &middot; RPM &middot; Employer Wellness &middot; Grant Programs
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
              style={{ color: colors.white, lineHeight: "1.1" }}
            >
              The Universal{" "}
              <span style={{ color: colors.teal400 }}>Membership Platform</span>{" "}
              for Healthcare
            </h1>
            <p
              className="text-lg sm:text-xl mb-10 leading-relaxed"
              style={{ color: colors.slate400 }}
            >
              MemberMD powers membership-based practices across every specialty
              — from Direct Primary Care to Chronic Care Management, behavioral
              health, pediatrics, and beyond. One HIPAA-ready platform for
              patient management, billing, telehealth, and compliance.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => navigate("/register")}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-base font-semibold transition-all hover:opacity-90 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: colors.teal600,
                  color: colors.white,
                }}
              >
                Start Your Practice
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate("/login")}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-base font-semibold transition-all hover:opacity-80 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: "rgba(255,255,255,0.1)",
                  color: colors.white,
                  border: `1px solid rgba(255,255,255,0.2)`,
                }}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ──────────────────────────────────────────────────── */}
      <section
        className="py-6 border-b"
        style={{
          backgroundColor: colors.slate50,
          borderColor: colors.slate200,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center justify-center gap-2 py-2"
              >
                <stat.icon
                  className="w-5 h-5"
                  style={{ color: colors.teal600 }}
                />
                <span
                  className="text-sm font-semibold"
                  style={{ color: colors.navy800 }}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ──────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28" style={{ backgroundColor: colors.white }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ color: colors.navy900 }}
            >

              One Platform, Every Care Model
            </h2>
            <p
              className="text-lg max-w-2xl mx-auto"
              style={{ color: colors.slate500 }}
            >
              Whether you run a DPC practice, manage CCM/RPM programs, or
              administer employer wellness — MemberMD provides the structured
              rules engine and clinical tools to deliver care at scale.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl p-6 transition-all hover:shadow-lg border"
                style={{
                  borderColor: colors.slate200,
                  backgroundColor: colors.white,
                }}
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                  style={{
                    backgroundColor: "rgba(13,148,136,0.1)",
                  }}
                >
                  <feature.icon
                    className="w-6 h-6"
                    style={{ color: colors.teal600 }}
                  />
                </div>
                <h3
                  className="text-lg font-semibold mb-2"
                  style={{ color: colors.navy900 }}
                >
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: colors.slate500 }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────── */}
      <section
        className="py-20 sm:py-28"
        style={{ backgroundColor: colors.slate50 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ color: colors.navy900 }}
            >
              Up and Running in Three Steps
            </h2>
            <p
              className="text-lg max-w-2xl mx-auto"
              style={{ color: colors.slate500 }}
            >
              Getting started with MemberMD is fast and straightforward.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step) => (
              <div
                key={step.step}
                className="relative rounded-xl p-8 text-center border"
                style={{
                  backgroundColor: colors.white,
                  borderColor: colors.slate200,
                }}
              >
                <div
                  className="text-sm font-bold mb-4"
                  style={{ color: colors.teal600 }}
                >
                  STEP {step.step}
                </div>
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{
                    background: `linear-gradient(135deg, ${colors.navy900}, ${colors.navy700})`,
                  }}
                >
                  <step.icon className="w-7 h-7" style={{ color: colors.teal400 }} />
                </div>
                <h3
                  className="text-lg font-semibold mb-3"
                  style={{ color: colors.navy900 }}
                >
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: colors.slate500 }}>
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ────────────────────────────────────────────────── */}
      <section
        className="py-20 sm:py-28"
        style={{
          background: `linear-gradient(135deg, ${colors.navy900} 0%, ${colors.navy800} 100%)`,
        }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2
            className="text-3xl sm:text-4xl font-bold mb-4"
            style={{ color: colors.white }}
          >
            Ready to Transform How You Deliver Care?
          </h2>
          <p
            className="text-lg mb-10 leading-relaxed"
            style={{ color: colors.slate400 }}
          >
            Whether you manage memberships, sponsor-funded programs, or hybrid
            models — MemberMD gives you the platform to define the rules and
            deliver structured access to care.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate("/register")}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-base font-semibold transition-all hover:opacity-90 flex items-center justify-center gap-2"
              style={{
                backgroundColor: colors.teal600,
                color: colors.white,
              }}
            >
              Start Your Practice
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate("/login")}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-base font-semibold transition-all hover:opacity-80 flex items-center justify-center gap-2"
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                color: colors.white,
                border: `1px solid rgba(255,255,255,0.2)`,
              }}
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer
        className="py-10 border-t"
        style={{
          backgroundColor: colors.slate50,
          borderColor: colors.slate200,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5" style={{ color: colors.teal600 }} />
              <span
                className="text-sm font-semibold"
                style={{ color: colors.navy800 }}
              >
                Powered by MemberMD — EnnHealth
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              <button
                onClick={() => navigate("/login")}
                className="text-sm transition-colors hover:opacity-80"
                style={{ color: colors.slate500 }}
              >
                Sign In
              </button>
              <button
                onClick={() => navigate("/register")}
                className="text-sm transition-colors hover:opacity-80"
                style={{ color: colors.slate500 }}
              >
                Register
              </button>
              <span
                className="text-sm"
                style={{ color: colors.slate400 }}
              >
                Privacy Policy
              </span>
              <span
                className="text-sm"
                style={{ color: colors.slate400 }}
              >
                Terms
              </span>
            </div>
          </div>
          <div className="mt-6 text-center">
            <p className="text-xs" style={{ color: colors.slate400 }}>
              &copy; {new Date().getFullYear()} EnnHealth. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
