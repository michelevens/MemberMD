// NPI (National Provider Identifier) helpers.
//
// An NPI is a 10-digit number where the last digit is a Luhn check digit
// computed against the first 9 digits prefixed with "80840" (per CMS).
// This file provides format + validate + a tiny `isValidNPI` predicate
// that field components can use for inline feedback.
//
// The official CMS spec: https://www.cms.gov/Regulations-and-Guidance/
//   Administrative-Simplification/NationalProvIdentStand/Downloads/NPIcheckdigit.pdf

/**
 * Strip non-digits and cap at 10. Used by the as-you-type formatter.
 */
export function normalizeNPI(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/\D/g, "").slice(0, 10);
}

/**
 * Validate that a 10-digit string is a real NPI by recomputing the
 * Luhn check digit per CMS algorithm. Returns false for any input that
 * isn't exactly 10 digits or whose check digit doesn't match.
 *
 * Algorithm:
 *   1. Take the first 9 digits, prepend "80840", giving a 14-digit string
 *   2. Run Luhn over those 14 digits (from right, double every 2nd digit,
 *      subtract 9 if the doubled value is > 9, sum)
 *   3. The check digit is (10 - (sum % 10)) % 10
 *   4. Compare with the 10th digit of the input
 */
export function isValidNPI(input: string | number | null | undefined): boolean {
  const digits = normalizeNPI(input);
  if (digits.length !== 10) return false;

  const body = "80840" + digits.slice(0, 9);  // 14 digits
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = parseInt(body[body.length - 1 - i], 10);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(digits[9], 10);
}

/**
 * Display-format a 10-digit NPI as "1234567890" (no separators — NPIs
 * are conventionally written as a continuous block of digits).
 * Returns the input unchanged if it isn't a clean 10-digit value.
 */
export function formatNPI(input: string | number | null | undefined): string {
  const digits = normalizeNPI(input);
  return digits.length === 10 ? digits : String(input ?? "");
}
