// US phone formatting helpers.
//
// Two functions:
//   - formatUSPhone(input): "(555) 123-4567" — for display + as-you-type
//   - normalizeUSPhone(input): "5551234567" or "+15551234567" — for API/storage
//
// Designed for as-you-type formatting on a controlled input:
//   onChange={(e) => setForm(f => ({ ...f, phone: formatUSPhone(e.target.value) }))}
// The user types digits, gets parens/space/dash inserted automatically;
// backspace works naturally because we always re-derive from the digit
// string rather than maintaining a separate cursor model.

/**
 * Format any input into the US phone display shape "(555) 123-4567".
 *
 * - Strips everything that isn't a digit
 * - Drops a leading "1" (US country code) so "+1 555..." formats cleanly
 * - Caps at 10 digits — more digits past the 10th are ignored
 * - Returns the partial format while typing:
 *     "5"            -> "(5"
 *     "55"           -> "(55"
 *     "555"          -> "(555)"
 *     "555123"       -> "(555) 123"
 *     "5551234567"   -> "(555) 123-4567"
 *
 * Empty input returns empty string (so a controlled input doesn't render
 * "()" on first paint).
 */
export function formatUSPhone(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  let digits = String(input).replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);

  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Normalize to a digits-only US phone for storage / API submission.
 * Returns the 10-digit form ("5551234567") or empty string if no valid
 * US phone could be parsed. Drops a leading "1" the same way as
 * formatUSPhone so paste-from-anywhere doesn't break.
 */
export function normalizeUSPhone(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  let digits = String(input).replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits.length === 10 ? digits : "";
}
