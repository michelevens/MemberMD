// Stripe-grade money cell: tabular-nums (so columns align), explicit
// currency, optional zero-state styling, and a subtle text color for
// non-positive totals.
//
// Backend returns numeric/decimal as strings ("199.00") — we coerce
// with Number() before formatting so .toFixed never crashes.

import type { CSSProperties } from "react";

interface Props {
  amount: number | string | null | undefined;
  currency?: string; // ISO 4217, defaults to USD
  /** When true, "—" is rendered for null / 0 amounts (Stripe shows blank for empty cells). */
  blankForZero?: boolean;
  /** Hide the currency symbol — useful in tight columns. */
  symbolOnly?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function MoneyAmount({
  amount,
  currency = "USD",
  blankForZero = false,
  symbolOnly = false,
  className,
  style,
}: Props) {
  const n = typeof amount === "number" ? amount : Number(amount ?? 0);
  const isZeroOrEmpty = !Number.isFinite(n) || n === 0;

  if (blankForZero && isZeroOrEmpty) {
    return <span className={`text-slate-300 ${className ?? ""}`} style={style}>—</span>;
  }

  const formatted = new Intl.NumberFormat("en-US", {
    style: symbolOnly ? "currency" : "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

  return (
    <span
      className={`tabular-nums font-medium ${className ?? ""}`}
      style={{ color: "#0f172a", ...style }}
    >
      {formatted}
    </span>
  );
}
