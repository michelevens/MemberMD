// ===== Shared formatting helpers =====
//
// Consolidates the 6 copies of formatDate and 7 copies of formatCurrency
// that were scattered across portal files. Centralizing also stops
// subtle drift — earlier copies disagreed on null handling, locale,
// and date-only vs timestamp behavior.
//
// Each helper accepts a permissive input (string | number | null |
// undefined) and returns a fallback string ("—") when the value is
// missing or unparseable, so callers don't need to ternary every site.

/**
 * "May 4, 2026" — month-day-year, en-US locale, no time portion.
 *
 * Accepts ISO timestamps, Date objects, or null/undefined.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * "May 4, 2026 at 2:30 PM" — date + time. Use when the time matters
 * (e.g. logged_at, sent_at). For pure calendar dates use formatDate.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "May 4, 1990" — date-only, no timezone shift.
 *
 * DOB is calendar-based, not an instant. ISO strings often include a
 * time component which can shift the displayed day depending on the
 * viewer's timezone. We slice to the first 10 chars (YYYY-MM-DD) and
 * append T00:00:00 so the Date constructor parses in local time.
 */
export function formatDob(value: string | null | undefined): string {
  if (!value) return "—";
  const dateOnly = String(value).slice(0, 10);
  const d = new Date(dateOnly + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * "$129.00" — USD currency with two decimals.
 *
 * Accepts numbers, numeric strings (Postgres decimal columns return
 * strings via PHP), or null/undefined.
 */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

/**
 * "$1,234" — USD currency with no decimals (for high-level metrics).
 */
export function formatCurrencyWhole(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * "1,234" — integer with thousands separator.
 */
export function formatNumber(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US");
}

/**
 * Relative time: "2 minutes ago", "yesterday", "3 days ago", "May 4".
 * Falls back to absolute date for anything older than 30 days.
 */
export function formatRelative(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return formatDate(d);
}
