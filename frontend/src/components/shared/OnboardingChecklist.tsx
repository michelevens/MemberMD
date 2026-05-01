// ===== Onboarding Checklist =====
// Stripe-style first-day checklist for newly-registered practices.
// Self-derives completion state from live API signals (Stripe Connect
// status, plan count, branding presence) so practices can't get stuck
// with a stale "complete" badge.

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, X, ExternalLink } from "lucide-react";
import { stripeConnectService, onboardingService, membershipPlanService, apiFetch } from "../../lib/api";

interface OnboardingChecklistProps {
  /** Where to navigate when the user clicks an action — usually setActiveTab. */
  onNavigate: (tab: string) => void;
  /** Called after the user dismisses the checklist (POST onboarding/complete). */
  onDismiss?: () => void;
  /** When true the checklist is hidden — used by the parent to gate render. */
  hidden?: boolean;
}

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  done: boolean;
  action?: { label: string; onClick: () => void };
}

export function OnboardingChecklist({ onNavigate, onDismiss, hidden }: OnboardingChecklistProps) {
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [planCount, setPlanCount] = useState<number | null>(null);
  const [hasBranding, setHasBranding] = useState<boolean | null>(null);
  const [hasPatient, setHasPatient] = useState<boolean | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;

    (async () => {
      // Stripe Connect status — the practice can accept payments?
      try {
        const r = await stripeConnectService.status();
        if (!cancelled) {
          setStripeReady(Boolean(r.data?.canAcceptPayments));
        }
      } catch {
        if (!cancelled) setStripeReady(false);
      }

      // Plan count — can they enroll a patient?
      try {
        const r = await membershipPlanService.list();
        if (!cancelled) setPlanCount(Array.isArray(r.data) ? r.data.length : 0);
      } catch {
        if (!cancelled) setPlanCount(0);
      }

      // Branding — have they uploaded a logo / set a color?
      try {
        const r = await apiFetch<{ branding?: Record<string, unknown> | null; logoUrl?: string | null }>("/practice/me");
        if (!cancelled) {
          const branding = r.data?.branding ?? null;
          const logoUrl = r.data?.logoUrl ?? null;
          const hasAny = Boolean(
            logoUrl ||
            (branding && typeof branding === "object" && Object.keys(branding).length > 0)
          );
          setHasBranding(hasAny);
        }
      } catch {
        if (!cancelled) setHasBranding(false);
      }

      // Patient count — have they enrolled or sample-created at least one?
      try {
        const r = await apiFetch<unknown[]>("/patients?per_page=1");
        if (!cancelled) {
          const list = Array.isArray(r.data)
            ? r.data
            : (r.data as { data?: unknown[] } | undefined)?.data || [];
          setHasPatient(list.length > 0);
        }
      } catch {
        if (!cancelled) setHasPatient(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hidden]);

  const items: ChecklistItem[] = useMemo(() => [
    {
      key: "plans",
      label: "Create your first membership plan",
      description: "You need at least one plan to start enrolling members.",
      done: (planCount ?? 0) > 0,
      action: { label: "Create plan", onClick: () => onNavigate("plans") },
    },
    {
      key: "stripe",
      label: "Connect Stripe to accept payments",
      description: "Set up payouts so you get paid when patients enroll.",
      done: stripeReady === true,
      action: { label: "Connect Stripe", onClick: () => onNavigate("practice-settings") },
    },
    {
      key: "branding",
      label: "Upload your practice logo",
      description: "Members see your brand on receipts, emails, and the patient portal.",
      done: hasBranding === true,
      action: { label: "Add branding", onClick: () => onNavigate("branding") },
    },
    {
      key: "patient",
      label: "Enroll your first member",
      description: "Walk through enrollment with a real or sample patient.",
      done: hasPatient === true,
      action: { label: "Add patient", onClick: () => onNavigate("patients") },
    },
  ], [planCount, stripeReady, hasBranding, hasPatient, onNavigate]);

  const completed = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((completed / total) * 100);
  const allDone = completed === total;

  const handleDismiss = async () => {
    setDismissing(true);
    // Optimistic local dismiss so the UI hides instantly even if the
    // backend call is slow / fails — the practice's intent is clear.
    try {
      localStorage.setItem("membermd_onboarding_dismissed", "1");
    } catch {
      // private mode etc — non-fatal
    }
    onDismiss?.();
    await onboardingService.completeOnboarding().catch(() => undefined);
  };

  if (hidden) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">
            {allDone ? "You're all set" : "Get your practice ready"}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {allDone
              ? "Every first-day step is complete. Dismiss this when you're ready."
              : `${completed} of ${total} steps complete`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Progress ring */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: allDone ? "#22c55e" : "#635bff" }}
              />
            </div>
            <span className="text-xs font-medium text-slate-500 tabular-nums">{pct}%</span>
          </div>
          {allDone && (
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              className="px-3 py-1 rounded-md text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#635bff" }}
            >
              {dismissing ? "Saving…" : "Dismiss"}
            </button>
          )}
          <button
            onClick={handleDismiss}
            disabled={dismissing}
            aria-label="Dismiss checklist"
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                item.done ? "" : "border border-slate-200"
              }`}
              style={item.done ? { backgroundColor: "#22c55e" } : undefined}
              aria-hidden="true"
            >
              {item.done && <Check className="w-3 h-3 text-white" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${item.done ? "text-slate-400 line-through" : "text-slate-900"}`}>
                {item.label}
              </p>
              <p className="text-xs text-slate-500 leading-snug">{item.description}</p>
            </div>
            {!item.done && item.action && (
              <button
                onClick={item.action.onClick}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
              >
                {item.action.label}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Compact "Set up payments" banner for when Stripe Connect is the only
 * thing keeping the practice from making money. Use when the full
 * checklist would be too noisy (post-dismiss, returning practices).
 */
export function ConnectSetupBanner({ onSetup }: { onSetup: () => void }) {
  const [show, setShow] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    if (dismissed) return;
    (async () => {
      try {
        const r = await stripeConnectService.status();
        setShow(!r.data?.canAcceptPayments);
      } catch {
        setShow(false);
      }
    })();
  }, [dismissed]);

  if (!show || dismissed) return null;

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white shadow-sm flex items-center gap-3 px-4 py-3 mb-6"
      style={{ borderLeft: "4px solid #635bff" }}
    >
      <div className="w-8 h-8 rounded-md bg-[#635bff] flex items-center justify-center text-white shrink-0">
        <ExternalLink className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">Set up Stripe Payouts</p>
        <p className="text-xs text-slate-500 leading-snug">
          You can't accept member payments yet — connect Stripe to start collecting subscriptions.
        </p>
      </div>
      <button
        onClick={onSetup}
        className="px-3 py-1.5 rounded-md text-xs font-medium text-white shrink-0"
        style={{ backgroundColor: "#635bff" }}
      >
        Set up now
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
