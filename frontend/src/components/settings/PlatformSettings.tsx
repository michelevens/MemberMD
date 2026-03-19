// ===== Platform Settings =====
// SuperAdmin platform-level settings page with tabbed sections
// Platform, Email, Billing, Security, Feature Flags, Roles

import { useState } from "react";
import {
  Globe,
  Mail,
  CreditCard,
  Shield,
  ToggleLeft,
  Users,
  CheckCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react";

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  navy900: "#102a43",
  navy800: "#243b53",
  navy700: "#334e68",
  teal500: "#27ab83",
  teal600: "#147d64",
  gold: "#D4A855",
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  red500: "#ef4444",
  green500: "#22c55e",
  green600: "#16a34a",
  orange500: "#f97316",
  blue500: "#3b82f6",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type SettingsTab =
  | "platform"
  | "email"
  | "billing"
  | "security"
  | "flags"
  | "roles";

interface EmailTemplate {
  name: string;
  trigger: string;
  active: boolean;
}

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  comingSoon?: boolean;
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function showToast(message: string) {
  const el = document.createElement("div");
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    padding: "12px 20px",
    backgroundColor: COLORS.navy800,
    color: COLORS.white,
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "500",
    zIndex: "9999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    transition: "opacity 0.3s",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-base font-semibold mb-4"
      style={{ color: COLORS.navy900 }}
    >
      {children}
    </h3>
  );
}

function FieldLabel({
  label,
  helper,
}: {
  label: string;
  helper?: string;
}) {
  return (
    <div className="mb-1.5">
      <label className="text-sm font-medium" style={{ color: COLORS.navy800 }}>
        {label}
      </label>
      {helper && (
        <p className="text-xs mt-0.5" style={{ color: COLORS.slate400 }}>
          {helper}
        </p>
      )}
    </div>
  );
}

function TextInput({
  label,
  value,
  helper,
  readOnly,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  helper?: string;
  readOnly?: boolean;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel label={label} helper={helper} />
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors focus:ring-2"
        style={{
          borderColor: COLORS.slate200,
          color: COLORS.navy900,
          backgroundColor: readOnly ? COLORS.slate50 : COLORS.white,
        }}
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  helper,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  helper?: string;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <FieldLabel label={label} helper={helper} />
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 px-3 py-2 rounded-lg border text-sm outline-none transition-colors focus:ring-2"
          style={{ borderColor: COLORS.slate200, color: COLORS.navy900 }}
        />
        {suffix && (
          <span className="text-sm" style={{ color: COLORS.slate500 }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
  badge,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1 mr-4">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium"
            style={{ color: COLORS.navy800 }}
          >
            {label}
          </span>
          {badge && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
            >
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: COLORS.slate400 }}>
            {description}
          </p>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-11 h-6 rounded-full transition-colors shrink-0"
        style={{
          backgroundColor: checked ? COLORS.teal500 : COLORS.slate300,
        }}
      >
        <div
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
          style={{
            transform: checked ? "translateX(22px)" : "translateX(2px)",
          }}
        />
      </button>
    </div>
  );
}

function MaskedInput({
  label,
  value,
  helper,
  onChange,
}: {
  label: string;
  value: string;
  helper?: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <FieldLabel label={label} helper={helper} />
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 pr-10 rounded-lg border text-sm outline-none transition-colors focus:ring-2"
          style={{ borderColor: COLORS.slate200, color: COLORS.navy900 }}
        />
        <button
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100"
        >
          {show ? (
            <EyeOff className="w-4 h-4" style={{ color: COLORS.slate400 }} />
          ) : (
            <Eye className="w-4 h-4" style={{ color: COLORS.slate400 }} />
          )}
        </button>
      </div>
    </div>
  );
}

function CopyableInput({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div>
      <FieldLabel label={label} helper={helper} />
      <div className="relative">
        <input
          type="text"
          value={value}
          readOnly
          className="w-full px-3 py-2 pr-10 rounded-lg border text-sm outline-none"
          style={{
            borderColor: COLORS.slate200,
            color: COLORS.navy900,
            backgroundColor: COLORS.slate50,
          }}
        />
        <button
          onClick={handleCopy}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100"
        >
          {copied ? (
            <Check className="w-4 h-4" style={{ color: COLORS.green500 }} />
          ) : (
            <Copy className="w-4 h-4" style={{ color: COLORS.slate400 }} />
          )}
        </button>
      </div>
    </div>
  );
}

function SelectInput({
  label,
  value,
  options,
  helper,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  helper?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel label={label} helper={helper} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors focus:ring-2 bg-white"
        style={{ borderColor: COLORS.slate200, color: COLORS.navy900 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Badge({
  text,
  color,
  bg,
}: {
  text: string;
  color: string;
  bg: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: bg, color }}
    >
      {text}
    </span>
  );
}

// ─── Tab Definitions ─────────────────────────────────────────────────────────

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] =
  [
    { id: "platform", label: "Platform", icon: Globe },
    { id: "email", label: "Email", icon: Mail },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "security", label: "Security", icon: Shield },
    { id: "flags", label: "Feature Flags", icon: ToggleLeft },
    { id: "roles", label: "Roles", icon: Users },
  ];

// ─── Email Templates ─────────────────────────────────────────────────────────

const INITIAL_EMAIL_TEMPLATES: EmailTemplate[] = [
  { name: "Welcome Email", trigger: "Practice registration", active: true },
  { name: "Patient Welcome", trigger: "Member enrollment", active: true },
  {
    name: "Appointment Confirmation",
    trigger: "Appointment booked",
    active: true,
  },
  {
    name: "Appointment Reminder",
    trigger: "24hr before appointment",
    active: true,
  },
  { name: "Payment Receipt", trigger: "Payment processed", active: true },
  { name: "Payment Failed", trigger: "Payment failure", active: true },
  {
    name: "Membership Suspended",
    trigger: "Payment exhausted",
    active: false,
  },
  { name: "Membership Cancelled", trigger: "Cancellation", active: true },
  { name: "New Message", trigger: "Provider message", active: true },
  { name: "Refill Approved", trigger: "Prescription approved", active: true },
  { name: "Intake Received", trigger: "Intake submission", active: true },
  {
    name: "Password Reset",
    trigger: "Password reset request",
    active: true,
  },
];

// ─── Feature Flags ───────────────────────────────────────────────────────────

const INITIAL_FEATURE_FLAGS: FeatureFlag[] = [
  {
    key: "telehealth",
    label: "Telehealth Video",
    description: "Enable built-in telehealth video calls",
    enabled: true,
  },
  {
    key: "eprescribing",
    label: "E-Prescribing",
    description: "Enable electronic prescribing integration",
    enabled: false,
    comingSoon: true,
  },
  {
    key: "labs",
    label: "Lab Integration",
    description: "Enable Quest/Labcorp lab ordering",
    enabled: false,
    comingSoon: true,
  },
  {
    key: "messaging",
    label: "Patient Messaging",
    description: "Enable secure patient-provider messaging",
    enabled: true,
  },
  {
    key: "screening",
    label: "Screening Tools",
    description: "Enable clinical screening instruments",
    enabled: true,
  },
  {
    key: "family",
    label: "Family Plans",
    description: "Enable family membership plans",
    enabled: true,
  },
  {
    key: "referral",
    label: "Referral Program",
    description: "Enable patient referral rewards",
    enabled: false,
  },
  {
    key: "api",
    label: "API Access",
    description: "Enable third-party API access",
    enabled: false,
  },
  {
    key: "sso",
    label: "SAML SSO",
    description: "Enable enterprise single sign-on",
    enabled: false,
    comingSoon: true,
  },
  {
    key: "sequences",
    label: "Automated Sequences",
    description: "Enable automated email/SMS sequences",
    enabled: true,
  },
];

// ─── Roles & Permissions ─────────────────────────────────────────────────────

const ROLES = [
  "SuperAdmin",
  "Practice Admin",
  "Provider",
  "Staff",
  "Patient",
] as const;

const PERMISSIONS: { label: string; grants: boolean[] }[] = [
  { label: "Manage Platform", grants: [true, false, false, false, false] },
  { label: "Manage Practices", grants: [true, false, false, false, false] },
  { label: "Manage Master Data", grants: [true, false, false, false, false] },
  {
    label: "View Practice Dashboard",
    grants: [true, true, true, true, false],
  },
  { label: "Manage Plans", grants: [false, true, false, false, false] },
  { label: "Manage Members", grants: [false, true, true, true, false] },
  { label: "View Patient Records", grants: [false, true, true, false, false] },
  { label: "Write Encounters", grants: [false, false, true, false, false] },
  {
    label: "Prescribe Medications",
    grants: [false, false, true, false, false],
  },
  { label: "Send Messages", grants: [false, true, true, true, true] },
  { label: "Book Appointments", grants: [false, true, true, true, true] },
  { label: "View Own Records", grants: [false, false, false, false, true] },
  {
    label: "Manage Own Membership",
    grants: [false, false, false, false, true],
  },
  { label: "View Billing", grants: [false, true, false, false, true] },
];

// ─── US Timezones ────────────────────────────────────────────────────────────

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export function PlatformSettings() {
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<SettingsTab>("platform");
  const [dirty, setDirty] = useState(false);

  // ─── Platform State ──────────────────────────────────────────────────────
  const [platformName, setPlatformName] = useState("MemberMD");
  const [supportEmail, setSupportEmail] = useState("support@membermd.io");
  const [contactPhone, setContactPhone] = useState("(555) 000-0000");
  const [timezone, setTimezone] = useState("America/New_York");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [primaryColor, setPrimaryColor] = useState("#27ab83");
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [allowPublicReg, setAllowPublicReg] = useState(true);
  const [requireEmailVerify, setRequireEmailVerify] = useState(true);
  const [trialDuration, setTrialDuration] = useState(14);
  const [autoApprove, setAutoApprove] = useState(false);

  // ─── Email State ─────────────────────────────────────────────────────────
  const [emailApiKey, setEmailApiKey] = useState("re_****************************");
  const [emailFrom, setEmailFrom] = useState("noreply@membermd.io");
  const [emailFromName, setEmailFromName] = useState("MemberMD");
  const [emailReplyTo, setEmailReplyTo] = useState("support@membermd.io");
  const [emailTemplates, setEmailTemplates] = useState(INITIAL_EMAIL_TEMPLATES);

  // ─── Billing State ──────────────────────────────────────────────────────
  const [stripeTestMode, setStripeTestMode] = useState(true);
  const [stripePk, setStripePk] = useState("pk_test_****************************");
  const [stripeSk, setStripeSk] = useState("sk_test_****************************");
  const [stripeWh, setStripeWh] = useState("whsec_****************************");
  const [feeType, setFeeType] = useState("percentage");
  const [feeAmount, setFeeAmount] = useState(5);
  const [feeDescription, setFeeDescription] = useState(
    "Platform processing fee"
  );
  const [currency, setCurrency] = useState("USD");

  // ─── Security State ──────────────────────────────────────────────────────
  const [sessionDuration, setSessionDuration] = useState(30);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [lockoutDuration, setLockoutDuration] = useState(15);
  const [require2fa, setRequire2fa] = useState(false);
  const [retentionPeriod, setRetentionPeriod] = useState("7");
  const [auditRetention, setAuditRetention] = useState("3");
  const [minPwLength, setMinPwLength] = useState(8);
  const [requireUppercase, setRequireUppercase] = useState(true);
  const [requireNumber, setRequireNumber] = useState(true);
  const [requireSpecial, setRequireSpecial] = useState(true);

  // ─── Feature Flags State ────────────────────────────────────────────────
  const [featureFlags, setFeatureFlags] = useState(INITIAL_FEATURE_FLAGS);

  // ─── Dirty tracker ──────────────────────────────────────────────────────
  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const handleSave = () => {
    showToast("Settings saved");
    setDirty(false);
  };

  // ─── Tab Content Renderers ──────────────────────────────────────────────

  const renderPlatformTab = () => (
    <div className="space-y-8">
      {/* General */}
      <div className="glass rounded-xl p-6">
        <SectionTitle>General Settings</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TextInput
            label="Platform Name"
            value={platformName}
            onChange={(v) => {
              setPlatformName(v);
              markDirty();
            }}
          />
          <TextInput
            label="Platform URL"
            value="https://app.membermd.io"
            readOnly
            onChange={() => {}}
            helper="Cannot be changed"
          />
          <TextInput
            label="Support Email"
            value={supportEmail}
            onChange={(v) => {
              setSupportEmail(v);
              markDirty();
            }}
          />
          <TextInput
            label="Contact Phone"
            value={contactPhone}
            onChange={(v) => {
              setContactPhone(v);
              markDirty();
            }}
          />
          <SelectInput
            label="Default Timezone"
            value={timezone}
            options={US_TIMEZONES}
            onChange={(v) => {
              setTimezone(v);
              markDirty();
            }}
          />
          <div className="flex items-end">
            <ToggleSwitch
              label="Maintenance Mode"
              description="Temporarily disable access for non-admins"
              checked={maintenanceMode}
              onChange={(v) => {
                setMaintenanceMode(v);
                markDirty();
              }}
            />
          </div>
        </div>
      </div>

      {/* Branding */}
      <div className="glass rounded-xl p-6">
        <SectionTitle>Branding</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <FieldLabel label="Primary Color" />
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => {
                  setPrimaryColor(e.target.value);
                  markDirty();
                }}
                className="w-10 h-10 rounded-lg border cursor-pointer"
                style={{ borderColor: COLORS.slate200 }}
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => {
                  setPrimaryColor(e.target.value);
                  markDirty();
                }}
                className="w-32 px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  borderColor: COLORS.slate200,
                  color: COLORS.navy900,
                }}
              />
            </div>
          </div>
          <TextInput
            label="Logo URL"
            value={logoUrl}
            helper="Full URL to platform logo"
            onChange={(v) => {
              setLogoUrl(v);
              markDirty();
            }}
          />
          <TextInput
            label="Favicon URL"
            value={faviconUrl}
            helper="Full URL to favicon"
            onChange={(v) => {
              setFaviconUrl(v);
              markDirty();
            }}
          />
        </div>
      </div>

      {/* Registration */}
      <div className="glass rounded-xl p-6">
        <SectionTitle>Registration</SectionTitle>
        <div className="space-y-2">
          <ToggleSwitch
            label="Allow Public Registration"
            description="Let new practices sign up without an invite"
            checked={allowPublicReg}
            onChange={(v) => {
              setAllowPublicReg(v);
              markDirty();
            }}
          />
          <ToggleSwitch
            label="Require Email Verification"
            description="New accounts must verify email before access"
            checked={requireEmailVerify}
            onChange={(v) => {
              setRequireEmailVerify(v);
              markDirty();
            }}
          />
          <div className="pt-2">
            <NumberInput
              label="Default Trial Duration"
              value={trialDuration}
              suffix="days"
              onChange={(v) => {
                setTrialDuration(v);
                markDirty();
              }}
            />
          </div>
          <ToggleSwitch
            label="Auto-Approve Practices"
            description="Automatically approve new practice registrations"
            checked={autoApprove}
            onChange={(v) => {
              setAutoApprove(v);
              markDirty();
            }}
          />
        </div>
      </div>
    </div>
  );

  const renderEmailTab = () => (
    <div className="space-y-8">
      {/* Provider */}
      <div className="glass rounded-xl p-6">
        <SectionTitle>Email Provider</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <FieldLabel label="Provider" />
            <Badge text="Resend" color={COLORS.teal600} bg="#e6f7f2" />
          </div>
          <MaskedInput
            label="API Key"
            value={emailApiKey}
            helper="Resend API key"
            onChange={(v) => {
              setEmailApiKey(v);
              markDirty();
            }}
          />
          <TextInput
            label="From Address"
            value={emailFrom}
            onChange={(v) => {
              setEmailFrom(v);
              markDirty();
            }}
          />
          <TextInput
            label="From Name"
            value={emailFromName}
            onChange={(v) => {
              setEmailFromName(v);
              markDirty();
            }}
          />
          <TextInput
            label="Reply-To"
            value={emailReplyTo}
            onChange={(v) => {
              setEmailReplyTo(v);
              markDirty();
            }}
          />
        </div>
      </div>

      {/* Templates */}
      <div className="glass rounded-xl p-6">
        <SectionTitle>Email Templates</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b"
                style={{ borderColor: COLORS.slate200 }}
              >
                <th
                  className="text-left py-3 px-4 font-medium"
                  style={{ color: COLORS.slate500 }}
                >
                  Template
                </th>
                <th
                  className="text-left py-3 px-4 font-medium"
                  style={{ color: COLORS.slate500 }}
                >
                  Trigger
                </th>
                <th
                  className="text-center py-3 px-4 font-medium"
                  style={{ color: COLORS.slate500 }}
                >
                  Active
                </th>
                <th
                  className="text-right py-3 px-4 font-medium"
                  style={{ color: COLORS.slate500 }}
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {emailTemplates.map((t, i) => (
                <tr
                  key={t.name}
                  className="border-b transition-colors hover:bg-slate-50"
                  style={{ borderColor: COLORS.slate100 }}
                >
                  <td
                    className="py-3 px-4 font-medium"
                    style={{ color: COLORS.navy900 }}
                  >
                    {t.name}
                  </td>
                  <td className="py-3 px-4" style={{ color: COLORS.slate500 }}>
                    {t.trigger}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => {
                        const copy = [...emailTemplates];
                        copy[i] = { ...copy[i], active: !copy[i].active };
                        setEmailTemplates(copy);
                        markDirty();
                      }}
                      className="relative w-9 h-5 rounded-full transition-colors inline-block"
                      style={{
                        backgroundColor: t.active
                          ? COLORS.teal500
                          : COLORS.slate300,
                      }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                        style={{
                          transform: t.active
                            ? "translateX(18px)"
                            : "translateX(2px)",
                        }}
                      />
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      className="text-xs font-medium px-3 py-1 rounded-lg transition-colors hover:bg-slate-100"
                      style={{ color: COLORS.teal600 }}
                    >
                      Preview
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderBillingTab = () => (
    <div className="space-y-8">
      {/* Stripe */}
      <div className="glass rounded-xl p-6">
        <SectionTitle>Stripe Configuration</SectionTitle>
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <FieldLabel label="Stripe Mode" />
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setStripeTestMode(!stripeTestMode);
                  markDirty();
                }}
                className="relative w-11 h-6 rounded-full transition-colors"
                style={{
                  backgroundColor: stripeTestMode
                    ? COLORS.orange500
                    : COLORS.green500,
                }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
                  style={{
                    transform: stripeTestMode
                      ? "translateX(2px)"
                      : "translateX(22px)",
                  }}
                />
              </button>
              <span className="text-sm" style={{ color: COLORS.slate600 }}>
                {stripeTestMode ? "Test" : "Live"}
              </span>
              {stripeTestMode && (
                <Badge
                  text="Test Mode"
                  color="#92400e"
                  bg="#fef3c7"
                />
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <MaskedInput
              label="Publishable Key"
              value={stripePk}
              onChange={(v) => {
                setStripePk(v);
                markDirty();
              }}
            />
            <MaskedInput
              label="Secret Key"
              value={stripeSk}
              onChange={(v) => {
                setStripeSk(v);
                markDirty();
              }}
            />
            <MaskedInput
              label="Webhook Secret"
              value={stripeWh}
              onChange={(v) => {
                setStripeWh(v);
                markDirty();
              }}
            />
            <CopyableInput
              label="Webhook URL"
              value="https://api.membermd.io/api/webhooks/stripe"
            />
          </div>
        </div>
      </div>

      {/* Platform Fee */}
      <div className="glass rounded-xl p-6">
        <SectionTitle>Platform Fee</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <SelectInput
            label="Fee Type"
            value={feeType}
            options={[
              { value: "percentage", label: "Percentage" },
              { value: "flat", label: "Flat Rate" },
            ]}
            onChange={(v) => {
              setFeeType(v);
              markDirty();
            }}
          />
          <NumberInput
            label="Fee Amount"
            value={feeAmount}
            suffix={feeType === "percentage" ? "%" : "USD"}
            onChange={(v) => {
              setFeeAmount(v);
              markDirty();
            }}
          />
          <TextInput
            label="Fee Description"
            value={feeDescription}
            onChange={(v) => {
              setFeeDescription(v);
              markDirty();
            }}
          />
        </div>
      </div>

      {/* Currency */}
      <div className="glass rounded-xl p-6">
        <SelectInput
          label="Default Currency"
          value={currency}
          options={[
            { value: "USD", label: "USD — US Dollar" },
            { value: "EUR", label: "EUR — Euro" },
            { value: "GBP", label: "GBP — British Pound" },
            { value: "CAD", label: "CAD — Canadian Dollar" },
          ]}
          onChange={(v) => {
            setCurrency(v);
            markDirty();
          }}
        />
      </div>
    </div>
  );

  const renderSecurityTab = () => (
    <div className="space-y-8">
      {/* Authentication */}
      <div className="glass rounded-xl p-6">
        <SectionTitle>Authentication</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <NumberInput
            label="Session Duration"
            value={sessionDuration}
            suffix="minutes"
            onChange={(v) => {
              setSessionDuration(v);
              markDirty();
            }}
          />
          <NumberInput
            label="Max Login Attempts"
            value={maxAttempts}
            suffix="attempts"
            onChange={(v) => {
              setMaxAttempts(v);
              markDirty();
            }}
          />
          <NumberInput
            label="Lockout Duration"
            value={lockoutDuration}
            suffix="minutes"
            onChange={(v) => {
              setLockoutDuration(v);
              markDirty();
            }}
          />
          <div className="flex items-end">
            <ToggleSwitch
              label="Require 2FA for Admins"
              description="Mandate two-factor authentication for admin accounts"
              checked={require2fa}
              onChange={(v) => {
                setRequire2fa(v);
                markDirty();
              }}
            />
          </div>
        </div>
      </div>

      {/* Data */}
      <div className="glass rounded-xl p-6">
        <SectionTitle>Data</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <FieldLabel label="PHI Encryption" />
            <div className="flex items-center gap-2">
              <Badge text="AES-256-CBC" color={COLORS.green600} bg="#dcfce7" />
              <CheckCircle
                className="w-4 h-4"
                style={{ color: COLORS.green500 }}
              />
            </div>
          </div>
          <div>
            <FieldLabel label="HIPAA Compliance" />
            <Badge text="Compliant" color={COLORS.green600} bg="#dcfce7" />
          </div>
          <SelectInput
            label="Data Retention Period"
            value={retentionPeriod}
            options={[
              { value: "3", label: "3 years" },
              { value: "5", label: "5 years" },
              { value: "7", label: "7 years" },
              { value: "10", label: "10 years" },
            ]}
            onChange={(v) => {
              setRetentionPeriod(v);
              markDirty();
            }}
          />
          <SelectInput
            label="Audit Log Retention"
            value={auditRetention}
            options={[
              { value: "1", label: "1 year" },
              { value: "3", label: "3 years" },
              { value: "5", label: "5 years" },
              { value: "7", label: "7 years" },
            ]}
            onChange={(v) => {
              setAuditRetention(v);
              markDirty();
            }}
          />
        </div>
      </div>

      {/* Password Policy */}
      <div className="glass rounded-xl p-6">
        <SectionTitle>Password Policy</SectionTitle>
        <div className="space-y-3">
          <NumberInput
            label="Minimum Length"
            value={minPwLength}
            suffix="characters"
            onChange={(v) => {
              setMinPwLength(v);
              markDirty();
            }}
          />
          <ToggleSwitch
            label="Require Uppercase"
            description="At least one uppercase letter"
            checked={requireUppercase}
            onChange={(v) => {
              setRequireUppercase(v);
              markDirty();
            }}
          />
          <ToggleSwitch
            label="Require Number"
            description="At least one digit"
            checked={requireNumber}
            onChange={(v) => {
              setRequireNumber(v);
              markDirty();
            }}
          />
          <ToggleSwitch
            label="Require Special Character"
            description="At least one special character (!@#$...)"
            checked={requireSpecial}
            onChange={(v) => {
              setRequireSpecial(v);
              markDirty();
            }}
          />
        </div>
      </div>
    </div>
  );

  const renderFlagsTab = () => (
    <div className="glass rounded-xl p-6">
      <SectionTitle>Feature Flags</SectionTitle>
      <p className="text-sm mb-6" style={{ color: COLORS.slate500 }}>
        Enable or disable platform features globally. Changes apply to all
        practices.
      </p>
      <div className="space-y-1 divide-y" style={{ borderColor: COLORS.slate100 }}>
        {featureFlags.map((flag, i) => (
          <ToggleSwitch
            key={flag.key}
            label={flag.label}
            description={flag.description}
            checked={flag.enabled}
            badge={flag.comingSoon ? "Coming Soon" : undefined}
            onChange={(v) => {
              const copy = [...featureFlags];
              copy[i] = { ...copy[i], enabled: v };
              setFeatureFlags(copy);
              markDirty();
            }}
          />
        ))}
      </div>
    </div>
  );

  const renderRolesTab = () => (
    <div className="glass rounded-xl p-6">
      <SectionTitle>Roles & Permissions</SectionTitle>
      <p className="text-sm mb-6" style={{ color: COLORS.slate500 }}>
        Overview of permissions granted to each user role.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b"
              style={{ borderColor: COLORS.slate200 }}
            >
              <th
                className="text-left py-3 px-4 font-medium"
                style={{ color: COLORS.slate500 }}
              >
                Permission
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  className="text-center py-3 px-3 font-medium"
                  style={{ color: COLORS.slate500 }}
                >
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((perm) => (
              <tr
                key={perm.label}
                className="border-b transition-colors hover:bg-slate-50"
                style={{ borderColor: COLORS.slate100 }}
              >
                <td
                  className="py-3 px-4 font-medium"
                  style={{ color: COLORS.navy900 }}
                >
                  {perm.label}
                </td>
                {perm.grants.map((granted, j) => (
                  <td key={j} className="py-3 px-3 text-center">
                    {granted && (
                      <CheckCircle
                        className="w-5 h-5 mx-auto"
                        style={{ color: COLORS.green500 }}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeSettingsTab) {
      case "platform":
        return renderPlatformTab();
      case "email":
        return renderEmailTab();
      case "billing":
        return renderBillingTab();
      case "security":
        return renderSecurityTab();
      case "flags":
        return renderFlagsTab();
      case "roles":
        return renderRolesTab();
      default:
        return renderPlatformTab();
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ color: COLORS.navy900 }}
        >
          Platform Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: COLORS.slate500 }}>
          Configure global platform settings, integrations, and security
          policies.
        </p>
      </div>

      {/* Tab Bar */}
      <div
        className="flex items-center gap-1 overflow-x-auto pb-1 border-b"
        style={{ borderColor: COLORS.slate200 }}
      >
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSettingsTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSettingsTab(tab.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap"
              style={{
                color: isActive ? COLORS.teal600 : COLORS.slate500,
                borderBottom: isActive
                  ? `2px solid ${COLORS.teal500}`
                  : "2px solid transparent",
              }}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {renderTabContent()}

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!dirty}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
          style={{
            backgroundColor: dirty ? COLORS.teal500 : COLORS.slate300,
            cursor: dirty ? "pointer" : "not-allowed",
            opacity: dirty ? 1 : 0.6,
          }}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
