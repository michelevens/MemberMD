// ===== Shared form fields =====
// Tier 1 of the field-library pass: canonical inputs for the data types
// that appeared inconsistent across forms (phone, fax, email, NPI, zip,
// address). Each component handles its own format, validation, and
// normalization so the calling form just supplies value/onChange.
//
// All fields share the same shape:
//   <FieldComponent
//     value={form.x}
//     onChange={(v) => setForm(f => ({ ...f, x: v }))}
//     label="Optional label"           // omitted = no label rendered
//     placeholder="…"                  // sensible default per field type
//     required={true}                  // shows red asterisk
//     error="external error"           // override internal validation
//     helper="muted helper text"
//     disabled={false}
//   />
//
// `onChange` always fires the **display-formatted** value (e.g. "(555) 123-4567")
// because we expect that's what the form state should hold. If you need
// the digits-only form for an API submission, use the lib normalizers
// (normalizeUSPhone, normalizeNPI) at submission time. The trade-off:
// roundtripping pretty values through state is more natural than
// formatting in render.

import type { ReactNode } from "react";
import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { formatUSPhone } from "../../../lib/phone";
import { isValidNPI, normalizeNPI } from "../../../lib/npi";
import { AddressAutocomplete } from "../AddressAutocomplete";

const C = {
  navy900: "#102a43",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate700: "#334e68",
  red500: "#ef4444",
  red50: "#fef2f2",
  green500: "#27ab83",
};

// ─── Shared shell ───────────────────────────────────────────────────────────

interface FieldShellProps {
  label?: string;
  required?: boolean;
  error?: string;
  helper?: string;
  validationIcon?: "valid" | "invalid" | null;
  children: ReactNode;
}

function FieldShell({ label, required, error, helper, validationIcon, children }: FieldShellProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium mb-1" style={{ color: C.slate700 }}>
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div style={{ position: "relative" }}>
        {children}
        {validationIcon === "valid" && (
          <CheckCircle2
            className="w-4 h-4"
            style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: C.green500, pointerEvents: "none" }}
          />
        )}
        {validationIcon === "invalid" && (
          <AlertCircle
            className="w-4 h-4"
            style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: C.red500, pointerEvents: "none" }}
          />
        )}
      </div>
      {error && <p className="text-xs mt-1" style={{ color: C.red500 }}>{error}</p>}
      {helper && !error && <p className="text-xs mt-1" style={{ color: C.slate400 }}>{helper}</p>}
    </div>
  );
}

const baseInputClass = "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
const baseInputStyle: React.CSSProperties = { borderColor: C.slate200, color: C.navy900 };

// ─── Common props ───────────────────────────────────────────────────────────

interface BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  /** External error message — overrides internal validation. */
  error?: string;
  helper?: string;
  disabled?: boolean;
  /** Optional id for label-association + autofill. */
  id?: string;
  /** Show a green ✓ or red ⚠ when the value passes/fails internal validation. Default true. */
  showValidationIcon?: boolean;
}

// ─── PhoneField ─────────────────────────────────────────────────────────────

export function PhoneField(props: BaseFieldProps) {
  const { value, onChange, placeholder = "(555) 123-4567", error, showValidationIcon = true, ...shellProps } = props;
  const digitsLen = value.replace(/\D/g, "").length;
  const internalError = !error && digitsLen > 0 && digitsLen < 10 && shellProps.required ? "Phone must be 10 digits" : undefined;
  const valid = digitsLen === 10;
  return (
    <FieldShell
      {...shellProps}
      error={error || internalError}
      validationIcon={!showValidationIcon ? null : valid ? "valid" : (digitsLen > 0 ? "invalid" : null)}
    >
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value}
        onChange={(e) => onChange(formatUSPhone(e.target.value))}
        placeholder={placeholder}
        disabled={props.disabled}
        className={baseInputClass}
        style={{ ...baseInputStyle, paddingRight: showValidationIcon && (valid || digitsLen > 0) ? "32px" : undefined }}
      />
    </FieldShell>
  );
}

// FaxField — same logic as PhoneField, different `autoComplete` semantics
// and a fax-specific default placeholder. We keep them as separate exports
// so a form's intent is obvious at the call site.
export function FaxField(props: BaseFieldProps) {
  const { value, onChange, placeholder = "(555) 123-4567", error, showValidationIcon = true, ...shellProps } = props;
  const digitsLen = value.replace(/\D/g, "").length;
  const internalError = !error && digitsLen > 0 && digitsLen < 10 && shellProps.required ? "Fax must be 10 digits" : undefined;
  const valid = digitsLen === 10;
  return (
    <FieldShell
      {...shellProps}
      error={error || internalError}
      validationIcon={!showValidationIcon ? null : valid ? "valid" : (digitsLen > 0 ? "invalid" : null)}
    >
      <input
        type="tel"
        inputMode="tel"
        autoComplete="fax"
        value={value}
        onChange={(e) => onChange(formatUSPhone(e.target.value))}
        placeholder={placeholder}
        disabled={props.disabled}
        className={baseInputClass}
        style={{ ...baseInputStyle, paddingRight: showValidationIcon && (valid || digitsLen > 0) ? "32px" : undefined }}
      />
    </FieldShell>
  );
}

// ─── EmailField ─────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailField(props: BaseFieldProps) {
  const { value, onChange, placeholder = "you@example.com", error, showValidationIcon = true, ...shellProps } = props;
  const valid = EMAIL_REGEX.test(value);
  const internalError = !error && value.length > 0 && !valid && shellProps.required ? "Enter a valid email address" : undefined;
  return (
    <FieldShell
      {...shellProps}
      error={error || internalError}
      validationIcon={!showValidationIcon ? null : valid ? "valid" : (value.length > 0 ? "invalid" : null)}
    >
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        value={value}
        // Lowercase on blur — emails are case-insensitive and storing
        // mixed-case creates duplicate-account risks. While typing we
        // leave the casing alone (less jarring).
        onBlur={(e) => onChange(e.target.value.trim().toLowerCase())}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={props.disabled}
        className={baseInputClass}
        style={{ ...baseInputStyle, paddingRight: showValidationIcon && (valid || value.length > 0) ? "32px" : undefined }}
      />
    </FieldShell>
  );
}

// ─── ZipField ───────────────────────────────────────────────────────────────

export function ZipField(props: BaseFieldProps) {
  const { value, onChange, placeholder = "12345", error, showValidationIcon = true, ...shellProps } = props;
  const valid = /^\d{5}(-\d{4})?$/.test(value);
  const internalError = !error && value.length > 0 && !valid && shellProps.required ? "Enter a 5-digit ZIP" : undefined;

  return (
    <FieldShell
      {...shellProps}
      error={error || internalError}
      validationIcon={!showValidationIcon ? null : valid ? "valid" : (value.length > 0 ? "invalid" : null)}
    >
      <input
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        value={value}
        // As-you-type: digits only, auto-insert dash for ZIP+4 after 5 digits.
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
          if (digits.length <= 5) onChange(digits);
          else onChange(`${digits.slice(0, 5)}-${digits.slice(5)}`);
        }}
        placeholder={placeholder}
        disabled={props.disabled}
        maxLength={10}
        className={baseInputClass}
        style={{ ...baseInputStyle, paddingRight: showValidationIcon && (valid || value.length > 0) ? "32px" : undefined }}
      />
    </FieldShell>
  );
}

// ─── NPIField ───────────────────────────────────────────────────────────────

export function NPIField(props: BaseFieldProps) {
  const { value, onChange, placeholder = "1234567890", error, showValidationIcon = true, ...shellProps } = props;
  const [touched, setTouched] = useState(false);
  const digitsLen = normalizeNPI(value).length;
  const validShape = digitsLen === 10;
  const validLuhn = validShape && isValidNPI(value);
  const showInternalError = !error && touched && digitsLen > 0 && !validLuhn;
  const internalError = showInternalError
    ? (digitsLen < 10 ? "NPI must be 10 digits" : "NPI check digit is invalid")
    : undefined;

  return (
    <FieldShell
      {...shellProps}
      error={error || internalError}
      helper={shellProps.helper ?? "10-digit National Provider Identifier"}
      validationIcon={!showValidationIcon ? null : validLuhn ? "valid" : (digitsLen > 0 && touched ? "invalid" : null)}
    >
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(normalizeNPI(e.target.value))}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        disabled={props.disabled}
        maxLength={10}
        className={baseInputClass}
        style={{ ...baseInputStyle, fontFamily: "monospace", letterSpacing: "0.05em", paddingRight: showValidationIcon && (validLuhn || (digitsLen > 0 && touched)) ? "32px" : undefined }}
      />
    </FieldShell>
  );
}

// ─── AddressField ───────────────────────────────────────────────────────────

interface AddressFieldProps extends Omit<BaseFieldProps, "showValidationIcon"> {
  /** Country code passed to AddressAutocomplete (Nominatim). Default "us". */
  countryCode?: string;
  /** Optional structured callback fired when user picks from the dropdown.
   *  Lets a calling form populate separate city/state/zip fields too. */
  onParsed?: (parsed: { street: string; city: string; state: string; zip: string; country: string }) => void;
}

export function AddressField({
  value, onChange, label, required, placeholder = "Start typing an address…",
  error, helper, disabled, id, countryCode = "us", onParsed,
}: AddressFieldProps) {
  return (
    <FieldShell label={label} required={required} error={error} helper={helper}>
      <AddressAutocomplete
        value={value}
        onChange={(text, parsed) => {
          onChange(text);
          if (parsed && onParsed) {
            onParsed({
              street: parsed.street,
              city: parsed.city,
              state: parsed.state,
              zip: parsed.zip,
              country: parsed.country,
            });
          }
        }}
        placeholder={placeholder}
        countryCode={countryCode}
        id={id}
      />
      {disabled && <div className="absolute inset-0 bg-white/50 rounded-lg" style={{ pointerEvents: "all" }} />}
    </FieldShell>
  );
}
