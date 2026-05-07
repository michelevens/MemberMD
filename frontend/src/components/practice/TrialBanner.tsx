// ===== TrialBanner =====
//
// Persistent counter shown at the top of the Practice/Provider portal
// while the practice's platform subscription is in trial. Tap → opens
// Practice Settings → Platform Subscription tab where they can upgrade.
//
// Visibility rules:
//   - Subscription status === "trial" AND trial_ends_at is in the future
//   - Hidden when no subscription on file (404 from /me/subscription —
//     practice predates platform billing layer; treat as silent)
//   - Hidden for founder-override accounts (free internal accounts —
//     showing a counter would be misleading)
//   - Auto-hides after the trial ends; cancellation/past-due states
//     are handled by separate banners (not here)
//
// Visual urgency tiers — same component, different palette:
//   - 14+ days  → calm purple, dismissible (sessionStorage)
//   - 7-13 days → calm purple, not dismissible
//   - 1-6 days  → amber, not dismissible
//   - 0 days    → red, not dismissible, "expires today"
//
// Why dismissible only at 14+ days: at <2 weeks the user genuinely
// needs to see this every load. Earlier, dismissing keeps the chrome
// quiet for the day.

import { useEffect, useState } from "react";
import { Zap, X } from "lucide-react";
import { subscriptionService, type PracticeSubscriptionSummary } from "../../lib/api";

interface TrialBannerProps {
  onUpgrade: () => void;
}

const DISMISS_KEY = "membermd_trial_banner_dismissed_today";

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TrialBanner({ onUpgrade }: TrialBannerProps) {
  const [sub, setSub] = useState<PracticeSubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === todayDateKey();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await subscriptionService.show();
        if (cancelled) return;
        setSub(res.data ?? null);
      } catch {
        if (!cancelled) setSub(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render anything during the initial fetch — flashes are
  // worse than a delayed appearance.
  if (loading) return null;
  if (!sub) return null;
  if (sub.status !== "trial") return null;
  if (sub.isFounderOverride) return null;
  if (!sub.trialEndsAt) return null;

  const daysLeft = computeDaysLeft(sub.trialEndsAt);
  if (daysLeft < 0) return null; // trial already ended; lifecycle command should have flipped status

  const tier = urgencyTier(daysLeft);
  const canDismiss = tier.name === "calm";
  if (canDismiss && dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, todayDateKey());
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 px-4 py-2 border-b text-sm"
      style={{
        backgroundColor: tier.bg,
        borderColor: tier.border,
        color: tier.fg,
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="font-bold tracking-wide uppercase text-xs"
          style={{ color: tier.accent }}
        >
          Trial is active
        </span>
        <span className="text-slate-700 dark:text-slate-200 font-semibold whitespace-nowrap">
          {daysLeft === 0
            ? "Expires today"
            : daysLeft === 1
            ? "1 day left"
            : `${daysLeft} days left`}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onUpgrade}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border bg-white hover:bg-slate-50 transition-colors"
          style={{
            borderColor: tier.border,
            color: tier.fg,
          }}
        >
          <Zap className="w-3.5 h-3.5" style={{ color: tier.accent }} />
          Upgrade Now
        </button>
        {canDismiss && (
          <button
            onClick={handleDismiss}
            aria-label="Dismiss for today"
            className="p-1 rounded hover:bg-white/40 transition-colors"
            style={{ color: tier.fg }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

interface UrgencyTier {
  bg: string;
  fg: string;
  border: string;
  accent: string;
}

function urgencyTier(daysLeft: number): UrgencyTier & { name: "calm" | "warn" | "urgent" } {
  if (daysLeft <= 0) {
    // expires today
    return {
      name: "urgent",
      bg: "#fef2f2",
      fg: "#7f1d1d",
      border: "#fecaca",
      accent: "#dc2626",
    };
  }
  if (daysLeft <= 6) {
    // amber
    return {
      name: "warn",
      bg: "#fffbeb",
      fg: "#78350f",
      border: "#fde68a",
      accent: "#d97706",
    };
  }
  return {
    name: "calm",
    bg: "#f5f3ff",
    fg: "#3730a3",
    border: "#ddd6fe",
    accent: "#635bff",
  };
}

function computeDaysLeft(iso: string): number {
  try {
    const end = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = end - now;
    if (diffMs < 0) return -1;
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  } catch {
    return -1;
  }
}
