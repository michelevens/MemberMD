// ===== Payment Setup =====
// Stripe Connect Express onboarding + status surface for practice admins.
// Renders state-aware UI: not_started, pending_onboarding, pending_verification,
// restricted, active, disconnected.

import { useEffect, useState, useCallback } from "react";
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { stripeConnectService, type StripeConnectStatusResponse, type StripeConnectStatus } from "../../lib/api";

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  navy900: "#102a43",
  navy700: "#334e68",
  teal500: "#27ab83",
  teal600: "#147d64",
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  red500: "#ef4444",
  red50: "#fef2f2",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  amber800: "#92400e",
  green500: "#22c55e",
  green50: "#f0fdf4",
  green700: "#15803d",
};

// ─── Status Helpers ──────────────────────────────────────────────────────────

interface StatusVisuals {
  label: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  Icon: React.ElementType;
}

function statusVisuals(status: StripeConnectStatus): StatusVisuals {
  switch (status) {
    case "active":
      return {
        label: "Active",
        description: "You can accept payments and receive payouts.",
        badgeBg: C.green50,
        badgeText: C.green700,
        Icon: CheckCircle2,
      };
    case "pending_verification":
      return {
        label: "Pending verification",
        description: "Stripe is reviewing your information. This usually takes a few minutes.",
        badgeBg: C.amber50,
        badgeText: C.amber800,
        Icon: Loader2,
      };
    case "pending_onboarding":
      return {
        label: "Onboarding in progress",
        description: "Finish providing your business information to start accepting payments.",
        badgeBg: C.amber50,
        badgeText: C.amber800,
        Icon: AlertTriangle,
      };
    case "restricted":
      return {
        label: "Action required",
        description: "Stripe needs additional information before you can resume processing.",
        badgeBg: C.red50,
        badgeText: C.red500,
        Icon: AlertTriangle,
      };
    case "disconnected":
      return {
        label: "Disconnected",
        description: "Reconnect to start accepting payments again.",
        badgeBg: C.slate100,
        badgeText: C.slate500,
        Icon: AlertTriangle,
      };
    case "not_started":
    default:
      return {
        label: "Not set up",
        description: "Connect a Stripe account to accept membership payments.",
        badgeBg: C.slate100,
        badgeText: C.slate500,
        Icon: CreditCard,
      };
  }
}

// ─── Toast ──────────────────────────────────────────────────────────────────

function toast(msg: string, kind: "success" | "error" = "success") {
  const el = document.createElement("div");
  el.textContent = msg;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: kind === "success" ? C.navy900 : C.red500,
    color: C.white,
    padding: "10px 20px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "500",
    zIndex: "9999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    transition: "opacity 0.3s",
    opacity: "1",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ─── Requirements List ──────────────────────────────────────────────────────

function flattenRequirements(reqs: Record<string, unknown> | null): string[] {
  if (!reqs) return [];
  const out: string[] = [];
  const buckets = ["currently_due", "past_due", "eventually_due"];
  for (const bucket of buckets) {
    const arr = reqs[bucket];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === "string" && !out.includes(item)) {
          out.push(item);
        }
      }
    }
  }
  return out;
}

function humanizeRequirement(key: string): string {
  // Stripe uses dot-separated paths like "individual.dob.day" or "external_account"
  return key
    .replace(/_/g, " ")
    .replace(/\./g, " — ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PaymentSetup() {
  const [status, setStatus] = useState<StripeConnectStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async (refresh = false) => {
    setError(null);
    if (!refresh) setLoading(true);
    const res = refresh ? await stripeConnectService.refresh() : await stripeConnectService.status();
    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setStatus(res.data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const startOnboarding = async () => {
    setActionLoading("onboard");
    const res = await stripeConnectService.createOnboardingLink();
    setActionLoading(null);
    if (res.error || !res.data) {
      toast(res.error || "Failed to start onboarding.", "error");
      return;
    }
    // Open in new tab so the practice can return without losing local state
    window.open(res.data.url, "_blank", "noopener,noreferrer");
    toast("Opened Stripe onboarding in a new tab.");
  };

  const openDashboard = async () => {
    setActionLoading("dashboard");
    const res = await stripeConnectService.createDashboardLink();
    setActionLoading(null);
    if (res.error || !res.data) {
      toast(res.error || "Failed to open Stripe dashboard.", "error");
      return;
    }
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  };

  const refresh = async () => {
    setActionLoading("refresh");
    await loadStatus(true);
    setActionLoading(null);
    toast("Status refreshed.");
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Stripe Connect? You will not be able to accept new payments until you reconnect.")) {
      return;
    }
    setActionLoading("disconnect");
    const res = await stripeConnectService.disconnect();
    setActionLoading(null);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    setStatus(res.data ?? null);
    toast("Stripe Connect disconnected.");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div
        className="rounded-xl p-4 border"
        style={{ backgroundColor: C.red50, borderColor: C.red500, color: C.red500 }}
      >
        <p className="text-sm font-medium">Could not load payment status.</p>
        {error && <p className="text-xs mt-1">{error}</p>}
        <button
          onClick={() => void loadStatus()}
          className="mt-3 text-xs font-semibold underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const v = statusVisuals(status.status);
  const reqs = flattenRequirements(status.requirements);
  const isOnboarded = !!status.stripeAccountId && status.status !== "disconnected" && status.status !== "not_started";

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div
        className="rounded-2xl border p-6"
        style={{ backgroundColor: C.white, borderColor: C.slate200 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
            >
              <CreditCard className="w-6 h-6" style={{ color: C.white }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold" style={{ color: C.navy900 }}>
                  Stripe Payouts
                </h3>
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: v.badgeBg, color: v.badgeText }}
                >
                  <v.Icon className="w-3.5 h-3.5" />
                  {v.label}
                </span>
              </div>
              <p className="text-sm mt-1" style={{ color: C.slate500 }}>
                {v.description}
              </p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={actionLoading === "refresh"}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-slate-50 flex items-center gap-1.5 shrink-0"
            style={{ color: C.slate600, borderColor: C.slate200 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === "refresh" ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Capability indicators */}
        <div className="grid grid-cols-2 gap-3 mt-6">
          <CapabilityRow label="Charges" enabled={status.chargesEnabled} />
          <CapabilityRow label="Payouts" enabled={status.payoutsEnabled} />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-6">
          {!isOnboarded && (
            <button
              onClick={startOnboarding}
              disabled={actionLoading === "onboard"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
            >
              {actionLoading === "onboard" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              Set up Stripe Payouts
            </button>
          )}

          {isOnboarded && status.status !== "active" && (
            <button
              onClick={startOnboarding}
              disabled={actionLoading === "onboard"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{ backgroundColor: C.amber500 }}
            >
              {actionLoading === "onboard" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              Continue Stripe onboarding
            </button>
          )}

          {isOnboarded && (
            <button
              onClick={openDashboard}
              disabled={actionLoading === "dashboard"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-slate-50 disabled:opacity-60"
              style={{ color: C.navy700, borderColor: C.slate200 }}
            >
              {actionLoading === "dashboard" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              Open Stripe dashboard
            </button>
          )}

          {isOnboarded && (
            <button
              onClick={disconnect}
              disabled={actionLoading === "disconnect"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-red-50 disabled:opacity-60 ml-auto"
              style={{ color: C.red500 }}
            >
              {actionLoading === "disconnect" && <Loader2 className="w-4 h-4 animate-spin" />}
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Requirements */}
      {reqs.length > 0 && (
        <div
          className="rounded-2xl border p-6"
          style={{ backgroundColor: C.amber50, borderColor: C.amber500 }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: C.amber800 }} />
            <div className="min-w-0">
              <h4 className="text-sm font-semibold" style={{ color: C.amber800 }}>
                Stripe needs more information
              </h4>
              <p className="text-xs mt-1" style={{ color: C.amber800 }}>
                Continue onboarding to provide the following:
              </p>
              <ul className="mt-3 space-y-1">
                {reqs.map((r) => (
                  <li
                    key={r}
                    className="text-xs flex items-start gap-2"
                    style={{ color: C.amber800 }}
                  >
                    <span>•</span>
                    <span>{humanizeRequirement(r)}</span>
                  </li>
                ))}
              </ul>
              {status.disabledReason && (
                <p className="text-xs mt-3 font-medium" style={{ color: C.amber800 }}>
                  Reason: {humanizeRequirement(status.disabledReason)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Account details */}
      {isOnboarded && (
        <div
          className="rounded-2xl border p-6"
          style={{ backgroundColor: C.white, borderColor: C.slate200 }}
        >
          <h4 className="text-sm font-semibold mb-4" style={{ color: C.navy900 }}>
            Account details
          </h4>
          <dl className="space-y-3">
            <DetailRow label="Stripe account" value={status.stripeAccountId || "—"} mono />
            <DetailRow
              label="Onboarded"
              value={status.onboardedAt ? new Date(status.onboardedAt).toLocaleDateString() : "—"}
            />
            <DetailRow
              label="Platform fee"
              value={`${status.platformFeePercent.toFixed(2)}%`}
            />
          </dl>
        </div>
      )}

      {/* Trust footer */}
      <div className="flex items-center gap-2 px-1" style={{ color: C.slate500 }}>
        <ShieldCheck className="w-4 h-4" />
        <p className="text-xs">
          Powered by Stripe. MemberMD never sees or stores your bank or card details.
        </p>
      </div>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function CapabilityRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2.5 border"
      style={{ borderColor: C.slate200, backgroundColor: C.slate50 }}
    >
      <span className="text-xs font-medium" style={{ color: C.slate600 }}>
        {label}
      </span>
      <span
        className="inline-flex items-center gap-1 text-xs font-semibold"
        style={{ color: enabled ? C.green700 : C.slate500 }}
      >
        {enabled ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5" />
            Enabled
          </>
        ) : (
          <>
            <AlertTriangle className="w-3.5 h-3.5" />
            Pending
          </>
        )}
      </span>
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs" style={{ color: C.slate500 }}>
        {label}
      </dt>
      <dd
        className={`text-xs ${mono ? "font-mono" : "font-medium"} truncate`}
        style={{ color: C.navy700 }}
      >
        {value}
      </dd>
    </div>
  );
}
