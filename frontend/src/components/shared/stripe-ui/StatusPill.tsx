// Stripe-grade status pill: low-saturation bg + darker text, dot
// indicator on the left. Matches the visual rhythm of Stripe's
// Payments / Invoices tables.
//
// Adding (not replacing) the existing StatusBadge components; portals
// migrate at their own pace.

import type { CSSProperties } from "react";

type Variant =
  | "success"  // green — paid, succeeded, active, completed, signed
  | "neutral"  // gray — open, draft, scheduled, pending review
  | "warning"  // amber — pending, past_due, overdue
  | "danger"   // red — failed, cancelled, void, suspended
  | "info";    // blue — refunded, processing, in_progress

interface Props {
  /** Display text — usually the raw status string (e.g. "succeeded"). */
  label: string;
  /** Visual treatment. If omitted, inferred from label. */
  variant?: Variant;
  /** Optional dot toggle. Default true. Set false for compact tables. */
  dot?: boolean;
  /** Optional className for layout (margins/spacing). */
  className?: string;
  style?: CSSProperties;
}

const PALETTE: Record<Variant, { bg: string; text: string; dot: string }> = {
  success: { bg: "#ecfdf5", text: "#066e54", dot: "#10b981" },
  neutral: { bg: "#f1f5f9", text: "#475569", dot: "#94a3b8" },
  warning: { bg: "#fffbeb", text: "#92400e", dot: "#f59e0b" },
  danger:  { bg: "#fef2f2", text: "#991b1b", dot: "#ef4444" },
  info:    { bg: "#eff6ff", text: "#1e3a8a", dot: "#3b82f6" },
};

const SUCCESS_WORDS = new Set([
  "paid", "succeeded", "active", "completed", "signed", "approved",
  "delivered", "sent", "confirmed", "processed", "settled", "verified",
  "complete",
]);
const WARNING_WORDS = new Set([
  "pending", "past_due", "overdue", "trial", "trialing", "review",
  "under_review", "paused", "open", "scheduled", "checked_in",
  "in_progress", "draft",
]);
const DANGER_WORDS = new Set([
  "failed", "cancelled", "canceled", "void", "voided", "suspended",
  "rejected", "disputed", "refunded_partial", "expired", "delinquent",
  "no_show",
]);
const INFO_WORDS = new Set([
  "refunded", "processing", "converted", "transferred", "reissued",
]);

function inferVariant(label: string): Variant {
  const k = label.toLowerCase().trim();
  if (SUCCESS_WORDS.has(k)) return "success";
  if (WARNING_WORDS.has(k)) return "warning";
  if (DANGER_WORDS.has(k)) return "danger";
  if (INFO_WORDS.has(k)) return "info";
  return "neutral";
}

export function StatusPill({ label, variant, dot = true, className, style }: Props) {
  const v = variant ?? inferVariant(label);
  const c = PALETTE[v];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${className ?? ""}`}
      style={{ backgroundColor: c.bg, color: c.text, ...style }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: c.dot }}
        />
      )}
      {label.replace(/_/g, " ")}
    </span>
  );
}
