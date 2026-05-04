// ===== Practice Settings =====
// Practice-level settings: Practice Info, Branding, Scheduling, Membership,
// Notifications, Team, Compliance, Integrations

import { useEffect, useRef, useState } from "react";
import { apiFetch, apiUpload, clinicalSettingsService, type ClinicalListType, type ClinicalListItem } from "../../lib/api";
import {
  Building2,
  Palette,
  Calendar,
  CreditCard,
  Bell,
  Users,
  Shield,
  Puzzle,
  Eye,
  EyeOff,
  Copy,
  Check,
  Plus,
  Send,
  Pencil,
  UserMinus,
  ExternalLink,
  Code,
  Link,
  QrCode,
  Key,
  Globe,
  Wallet,
  Sparkles,
  Stethoscope,
  Trash2,
  FileText,
} from "lucide-react";
import { PaymentSetup } from "./PaymentSetup";
import { BrandedWidgets } from "./BrandedWidgets";
import { AgreementEditor } from "./AgreementEditor";
import { PlatformSubscriptionSection } from "./PlatformSubscriptionSection";
import { WebhooksPanel } from "./WebhooksPanel";
import { FacilitiesPanel } from "./FacilitiesPanel";
import { PhoneField, EmailField, NPIField, ZipField, AddressField } from "../shared/fields";

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
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
  amber100: "#fef3c7",
  amber800: "#92400e",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type PracticeTab =
  | "info"
  | "subscription"
  | "branding"
  | "widgets"
  | "scheduling"
  | "membership"
  | "payments"
  | "clinical"
  | "agreements"
  | "notifications"
  | "team"
  | "compliance"
  | "integrations";

interface OfficeDay {
  open: boolean;
  start: string;
  end: string;
}

interface NotificationRow {
  label: string;
  enabled: boolean;
  channel: string;
}

interface TeamMember {
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Ordered to read top-to-bottom as two logical rows when the strip wraps:
//   Row 1 — identity & front-of-house: Info → Branding → Widgets → Scheduling → Team
//   Row 2 — billing & back-of-house: Subscription → Membership → Payments → Clinical → Agreements → Notifications → Compliance → Integrations
const TAB_CONFIG: { id: PracticeTab; label: string; icon: React.ElementType }[] = [
  { id: "info", label: "Practice Info", icon: Building2 },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "widgets", label: "Branded Widgets", icon: Sparkles },
  { id: "scheduling", label: "Scheduling", icon: Calendar },
  { id: "team", label: "Team", icon: Users },
  { id: "subscription", label: "Platform Subscription", icon: CreditCard },
  { id: "membership", label: "Membership", icon: CreditCard },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "clinical", label: "Clinical Config", icon: Stethoscope },
  { id: "agreements", label: "Agreements", icon: FileText },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "compliance", label: "Compliance", icon: Shield },
  { id: "integrations", label: "Integrations", icon: Puzzle },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY",
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const INITIAL_TEAM: TeamMember[] = [
  { name: "Nageley Michel", email: "contact+clearstone@ennhealth.com", role: "Practice Admin", status: "Active", lastLogin: "Today" },
  { name: "Dr. Sarah Chen", email: "sarah.chen@example.com", role: "Provider", status: "Active", lastLogin: "Yesterday" },
  { name: "Maria Garcia", email: "front.desk@example.com", role: "Staff", status: "Active", lastLogin: "2 days ago" },
];

// ─── Toast ───────────────────────────────────────────────────────────────────

function showToast(message: string) {
  const el = document.createElement("div");
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    padding: "12px 20px",
    backgroundColor: C.navy800,
    color: C.white,
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
    <h3 className="text-base font-semibold mb-4" style={{ color: C.navy900 }}>
      {children}
    </h3>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-6 mb-6" style={{ borderColor: C.slate200, backgroundColor: C.white }}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

function FieldLabel({ label, helper }: { label: string; helper?: string }) {
  return (
    <div className="mb-1.5">
      <label className="text-sm font-medium" style={{ color: C.navy800 }}>{label}</label>
      {helper && <p className="text-xs mt-0.5" style={{ color: C.slate400 }}>{helper}</p>}
    </div>
  );
}

function TextInput({ label, value, helper, readOnly, type = "text", onChange }: {
  label: string; value: string; helper?: string; readOnly?: boolean; type?: string;
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
          borderColor: C.slate200,
          color: C.navy900,
          backgroundColor: readOnly ? C.slate50 : C.white,
        }}
      />
    </div>
  );
}

function TextArea({ label, value, helper, disabled, rows = 3, onChange }: {
  label: string; value: string; helper?: string; disabled?: boolean; rows?: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel label={label} helper={helper} />
      <textarea
        value={value}
        disabled={disabled}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors focus:ring-2 resize-none"
        style={{
          borderColor: C.slate200,
          color: C.navy900,
          backgroundColor: disabled ? C.slate100 : C.white,
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </div>
  );
}

function NumberInput({ label, value, helper, prefix, suffix, onChange }: {
  label: string; value: number; helper?: string; prefix?: string; suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <FieldLabel label={label} helper={helper} />
      <div className="flex items-center gap-2">
        {prefix && <span className="text-sm" style={{ color: C.slate500 }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 px-3 py-2 rounded-lg border text-sm outline-none transition-colors focus:ring-2"
          style={{ borderColor: C.slate200, color: C.navy900 }}
        />
        {suffix && <span className="text-sm" style={{ color: C.slate500 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function SelectInput({ label, value, options, helper, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; helper?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel label={label} helper={helper} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors focus:ring-2 bg-white"
        style={{ borderColor: C.slate200, color: C.navy900 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleSwitch({ label, description, checked, onChange }: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1 mr-4">
        <span className="text-sm font-medium" style={{ color: C.navy800 }}>{label}</span>
        {description && <p className="text-xs mt-0.5" style={{ color: C.slate400 }}>{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-11 h-6 rounded-full transition-colors shrink-0"
        style={{ backgroundColor: checked ? C.teal500 : C.slate300 }}
      >
        <div
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
        />
      </button>
    </div>
  );
}

function MaskedInput({ label, value, helper, onChange }: {
  label: string; value: string; helper?: string; onChange: (v: string) => void;
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
          style={{ borderColor: C.slate200, color: C.navy900 }}
        />
        <button
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100"
        >
          {show
            ? <EyeOff className="w-4 h-4" style={{ color: C.slate400 }} />
            : <Eye className="w-4 h-4" style={{ color: C.slate400 }} />}
        </button>
      </div>
    </div>
  );
}

function CopyableInput({ label, value, helper }: { label: string; value: string; helper?: string }) {
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
          style={{ borderColor: C.slate200, color: C.navy900, backgroundColor: C.slate50 }}
        />
        <button
          onClick={handleCopy}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100"
        >
          {copied
            ? <Check className="w-4 h-4" style={{ color: C.green500 }} />
            : <Copy className="w-4 h-4" style={{ color: C.slate400 }} />}
        </button>
      </div>
    </div>
  );
}

function ChipListEditor({
  items,
  placeholder,
  onAdd,
  onRemove,
}: {
  items: string[];
  placeholder: string;
  onAdd: (v: string) => void;
  onRemove: (idx: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.some((it) => it.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onAdd(v);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {items.length === 0 ? (
          <p className="text-xs italic" style={{ color: C.slate400 }}>None configured yet.</p>
        ) : (
          items.map((it, idx) => (
            <span
              key={`${it}-${idx}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: C.slate100, color: C.navy800 }}
            >
              {it}
              <button
                onClick={() => onRemove(idx)}
                className="p-0.5 rounded-full hover:bg-slate-200 transition-colors"
                title={`Remove ${it}`}
              >
                <Trash2 className="w-3 h-3" style={{ color: C.red500 }} />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2"
          style={{ borderColor: C.slate200, color: C.navy900 }}
        />
        <button
          onClick={submit}
          className="px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-1.5"
          style={{ backgroundColor: C.teal500 }}
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
    </div>
  );
}

function DocumentTemplateAdder({ onAdd }: { onAdd: (name: string) => void }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft("");
  };
  return (
    <div className="flex gap-2 mt-3 pt-3 border-t" style={{ borderColor: C.slate200 }}>
      <input
        type="text"
        value={draft}
        placeholder="e.g. Release of Information"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2"
        style={{ borderColor: C.slate200, color: C.navy900 }}
      />
      <button
        onClick={submit}
        className="px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-1.5"
        style={{ backgroundColor: C.teal500 }}
      >
        <Plus className="w-4 h-4" /> Add Template
      </button>
    </div>
  );
}

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: bg, color }}
    >
      {text}
    </span>
  );
}

function ColorPicker({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel label={label} />
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border cursor-pointer"
          style={{ borderColor: C.slate200 }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 px-3 py-2 rounded-lg border text-sm outline-none font-mono"
          style={{ borderColor: C.slate200, color: C.navy900 }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PracticeSettings({ initialTab }: { initialTab?: string }) {
  const resolveTab = (t?: string): PracticeTab => {
    if (t && TAB_CONFIG.some((tc) => tc.id === t)) return t as PracticeTab;
    return "info";
  };

  const [activeTab, setActiveTab] = useState<PracticeTab>(resolveTab(initialTab));
  const [hasChanges, setHasChanges] = useState(false);

  const markChanged = () => { if (!hasChanges) setHasChanges(true); };

  const handleSave = async () => {
    // Branding is the only tab currently wired to the backend. The
    // others retain their stub-save behavior until each is moved off
    // local-only state.
    if (activeTab === "branding") {
      const res = await apiFetch<{ branding?: Record<string, unknown> }>(
        "/practice/branding",
        {
          method: "PUT",
          body: JSON.stringify({
            primary_color: primaryColor,
            accent_color: secondaryColor || accentColor,
            logo_url: logoUrl || null,
          }),
        }
      );
      if (res.error) {
        showToast(res.error);
        return;
      }
      showToast("Branding saved");
    } else if (activeTab === "clinical") {
      // Persist auto_request toggles for any document templates the user
      // touched on this tab. Each template needs its own PATCH; failures
      // are surfaced once at the end so a single transient error doesn't
      // wipe the user's other progress.
      const dirtyIds = Object.keys(docTemplatesDirty).filter((id) => docTemplatesDirty[id]);
      let failed = 0;
      for (const id of dirtyIds) {
        const tpl = documentTemplates.find((t) => t.id === id);
        if (!tpl) continue;
        const r = await apiFetch(`/consent-templates/${id}`, {
          method: "PUT",
          body: JSON.stringify({ auto_request: tpl.autoRequest }),
        });
        if (r.error) failed++;
      }
      if (failed > 0) {
        showToast(`${failed} template${failed === 1 ? "" : "s"} failed to save.`);
      } else {
        showToast(dirtyIds.length > 0 ? "Document templates saved." : "Settings saved");
        setDocTemplatesDirty({});
      }
    } else if (activeTab === "scheduling") {
      // Translate the form's friendly tokens into the numeric shape
      // the backend AvailabilityService reads.
      const advanceMap: Record<string, number> = {
        "1week": 7, "2weeks": 14, "1month": 30,
        "2months": 60, "3months": 90, "6months": 180,
      };
      const noticeMap: Record<string, number> = {
        "0h": 0, "1h": 1, "4h": 4, "12h": 12, "24h": 24, "48h": 48, "72h": 72,
      };
      const body = {
        buffer_minutes: parseInt(bufferTime, 10) || 0,
        min_lead_minutes: 0, // exposed in the form later — keep as 0 default
        max_advance_days: advanceMap[maxAdvance] ?? 60,
        require_reason: requireReason,
        cancel_notice_hours: noticeMap[cancelNotice] ?? 24,
        allow_same_day: sameDayBooking,
        late_cancel_fee: lateCancelFee,
        no_show_fee: noShowFee,
      };
      const r = await apiFetch("/practice/scheduling", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (r.error) {
        showToast(r.error);
        return;
      }
      showToast("Scheduling settings saved");
    } else {
      showToast("Settings saved");
    }
    setHasChanges(false);
  };

  // Load branding from the backend on mount so the form reflects what's
  // actually persisted, not just the placeholder defaults.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch<{ branding?: Record<string, string> }>("/practice/me");
      if (cancelled || res.error || !res.data) return;
      const b = (res.data as { branding?: Record<string, string> }).branding;
      if (!b) return;
      if (b.primary_color) setPrimaryColor(b.primary_color);
      if (b.accent_color) setSecondaryColor(b.accent_color);
      if (b.logo_url) setLogoUrl(b.logo_url);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Practice Info State ─────────────────────────────────────────────────
  const [practiceName, setPracticeName] = useState("Clearstone Group");
  const [phone, setPhone] = useState("(555) 123-4567");
  const [email, setEmail] = useState("contact+clearstone@ennhealth.com");
  const [website, setWebsite] = useState("https://clearstonegroup.com");
  const [street, setStreet] = useState("123 Medical Center Dr, Suite 400");
  const [city, setCity] = useState("Baltimore");
  const [state, setState] = useState("MD");
  const [zip, setZip] = useState("21201");
  const [npi, setNpi] = useState("1234567890");
  const [taxId, setTaxId] = useState("12-3456789");
  const [licenseNumber, setLicenseNumber] = useState("MD-PSY-2024-1234");
  const [licenseState, setLicenseState] = useState("MD");

  // ─── Branding State ──────────────────────────────────────────────────────
  const [primaryColor, setPrimaryColor] = useState("#27ab83");
  const [secondaryColor, setSecondaryColor] = useState("#334e68");
  const [accentColor, setAccentColor] = useState("#D4A855");
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [welcomeMsg, setWelcomeMsg] = useState("Welcome to our practice!");
  const [tagline, setTagline] = useState("");
  const [footerText, setFooterText] = useState("");
  const [showLogo, setShowLogo] = useState(true);
  const [showBadge, setShowBadge] = useState(true);

  // ─── Scheduling State ────────────────────────────────────────────────────
  const [officeHours, setOfficeHours] = useState<Record<string, OfficeDay>>(() => {
    const h: Record<string, OfficeDay> = {};
    DAYS.forEach((d, i) => {
      h[d] = { open: i < 5, start: "09:00", end: "17:00" };
    });
    return h;
  });
  const [defaultDuration, setDefaultDuration] = useState("30");
  const [bufferTime, setBufferTime] = useState("10");
  const [maxAdvance, setMaxAdvance] = useState("2months");
  const [selfSchedule, setSelfSchedule] = useState(true);
  const [sameDayBooking, setSameDayBooking] = useState(true);
  const [requireReason, setRequireReason] = useState(false);
  const [cancelNotice, setCancelNotice] = useState("24h");
  const [lateCancelFee, setLateCancelFee] = useState(50);
  const [noShowFee, setNoShowFee] = useState(75);
  const [autoChargeNoShow, setAutoChargeNoShow] = useState(false);

  // ─── Membership State ────────────────────────────────────────────────────
  const [selfEnroll, setSelfEnroll] = useState(true);
  const [requireIntake, setRequireIntake] = useState(true);
  const [showPricing, setShowPricing] = useState(true);
  const [allowSwitch, setAllowSwitch] = useState(true);
  const [proration, setProration] = useState(true);
  const [retryAttempts, setRetryAttempts] = useState("3");
  const [retryDays, setRetryDays] = useState("3");
  const [suspendAfterFail, setSuspendAfterFail] = useState(true);
  const [daysBeforeSuspend, setDaysBeforeSuspend] = useState(10);
  const [daysBeforeExpire, setDaysBeforeExpire] = useState(30);
  const [hsaReceipts, setHsaReceipts] = useState(true);
  const [npiOnReceipts, setNpiOnReceipts] = useState(true);
  const [taxOnReceipts, setTaxOnReceipts] = useState(true);
  const [receiptFooter, setReceiptFooter] = useState("This receipt may be used for HSA/FSA reimbursement");

  // ─── Notifications State ─────────────────────────────────────────────────
  const [practiceNotifs, setPracticeNotifs] = useState<NotificationRow[]>([
    { label: "New Member Enrolled", enabled: true, channel: "both" },
    { label: "Appointment Booked", enabled: true, channel: "both" },
    { label: "Appointment Cancelled", enabled: true, channel: "both" },
    { label: "Payment Received", enabled: true, channel: "email" },
    { label: "Payment Failed", enabled: true, channel: "both" },
    { label: "Intake Submitted", enabled: true, channel: "both" },
    { label: "New Message", enabled: true, channel: "both" },
    { label: "Refill Request", enabled: true, channel: "both" },
  ]);
  const [patientNotifs, setPatientNotifs] = useState<NotificationRow[]>([
    { label: "Appointment Reminder", enabled: true, channel: "24h" },
    { label: "Appointment Confirmation", enabled: true, channel: "" },
    { label: "Payment Receipt", enabled: true, channel: "" },
    { label: "Membership Renewal Reminder", enabled: true, channel: "3d" },
    { label: "Welcome Email", enabled: true, channel: "" },
    { label: "Birthday Message", enabled: false, channel: "" },
  ]);

  // ─── Team State ──────────────────────────────────────────────────────────
  const [teamMembers] = useState<TeamMember[]>(INITIAL_TEAM);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");

  // ─── Compliance State ────────────────────────────────────────────────────
  const [dataRetention, setDataRetention] = useState("7");
  const [auditRetention, setAuditRetention] = useState("3");

  // ─── Clinical Config State (ported from EnnHealth's SystemSettings) ──────
  // Each section is a list of named items the practice can curate. EnnHealth
  // stores these in component state and persists nothing — we mirror that
  // for now and will move to a backend table in a follow-up.
  const [appointmentTypes, setAppointmentTypes] = useState<string[]>([
    "Initial Consultation", "Follow-up", "Medication Management",
    "Therapy Session", "Crisis Intervention",
  ]);
  // The five lists below are now backed by /clinical-settings/{type}.
  // Each list holds full ClinicalListItem rows so we have stable ids
  // for update/delete (chip removes by index would otherwise need a
  // round-trip to look up the id by label). Initial empty arrays —
  // populated by the fetchClinicalLists effect on mount.
  const [visitStatuses, setVisitStatuses] = useState<ClinicalListItem[]>([]);
  const [visitReasons, setVisitReasons] = useState<ClinicalListItem[]>([]);
  const [providerTypes, setProviderTypes] = useState<string[]>([
    "MD", "DO", "NP", "PA", "Therapist", "Counselor",
  ]);
  const [providerSpecialties, setProviderSpecialties] = useState<string[]>([
    "Psychiatry", "Family Medicine", "Internal Medicine",
    "Pediatrics", "Behavioral Health",
  ]);
  const [providerLanguages, setProviderLanguages] = useState<string[]>([
    "English", "Spanish", "French", "Haitian Creole",
  ]);
  const [clinicalConditions, setClinicalConditions] = useState<ClinicalListItem[]>([]);
  const [clinicalModalities, setClinicalModalities] = useState<ClinicalListItem[]>([]);
  const [patientPopulations, setPatientPopulations] = useState<ClinicalListItem[]>([]);
  // Sixth list — surfaces in the membership-cancel dialog (admin and
  // patient self-cancel) so cancels are categorical instead of free
  // text. Fed by the same /clinical-settings/{type} endpoint.
  const [cancellationReasons, setCancellationReasons] = useState<ClinicalListItem[]>([]);

  // Map list-type → setter so add/remove helpers can stay generic. Each
  // helper does the API call first, then updates state with the
  // backend-canonical row (preserves the server-assigned id and
  // sort_order). On failure the error toast surfaces; the UI doesn't
  // optimistically apply, so an admin retrying after a 422 (duplicate
  // label) doesn't see a ghost chip.
  const clinicalSetters: Record<ClinicalListType, React.Dispatch<React.SetStateAction<ClinicalListItem[]>>> = {
    visit_statuses: setVisitStatuses,
    visit_reasons: setVisitReasons,
    conditions: setClinicalConditions,
    treatment_modalities: setClinicalModalities,
    patient_populations: setPatientPopulations,
    cancellation_reasons: setCancellationReasons,
  };

  // Fetch all six clinical lists on mount. Runs once; the helpers
  // below mutate state in place after each individual API call.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const types: ClinicalListType[] = [
        "visit_statuses", "visit_reasons", "conditions",
        "treatment_modalities", "patient_populations", "cancellation_reasons",
      ];
      await Promise.all(types.map(async (t) => {
        const res = await clinicalSettingsService.list(t);
        if (cancelled || res.error || !res.data) return;
        clinicalSetters[t](res.data);
      }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Add an item to one of the clinical lists. Persists via POST and
   *  appends the server-returned row (which carries the id we need
   *  for delete). Empty input is a no-op. */
  const addClinicalItem = async (type: ClinicalListType, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const res = await clinicalSettingsService.create(type, { label: trimmed });
    if (res.error) {
      // Surface as alert so the admin sees the duplicate-label or
      // permission error rather than the chip silently failing to
      // appear. SectionCard doesn't have a toast slot here.
      window.alert(res.error);
      return;
    }
    if (res.data) clinicalSetters[type]((prev) => [...prev, res.data!]);
  };

  /** Remove a clinical-list item by index → soft-delete via the
   *  controller. We carry the id on the row so this is a direct
   *  DELETE; on success we drop it from state. */
  const removeClinicalItem = async (type: ClinicalListType, idx: number) => {
    const setter = clinicalSetters[type];
    let target: ClinicalListItem | undefined;
    setter((prev) => {
      target = prev[idx];
      return prev;
    });
    if (!target?.id) return;
    const res = await clinicalSettingsService.delete(type, target.id);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    setter((prev) => prev.filter((_, i) => i !== idx));
  };
  const [noteTemplates, setNoteTemplates] = useState<string[]>([
    "SOAP — Med Management", "SOAP — Therapy Session",
    "Initial Psychiatric Evaluation", "Follow-up Visit",
    "Wellness Assessment",
  ]);
  // Document templates — backed by consent_templates rows. The "auto-request"
  // toggle is the auto_request column; flipping it persists via PATCH on
  // save. Templates are loaded once on mount; "add new" still uses local
  // state since the full content authoring flow is a separate surface.
  const [documentTemplates, setDocumentTemplates] = useState<
    Array<{ id?: string; name: string; autoRequest: boolean; type?: string; isPlatform?: boolean }>
  >([]);
  const [docTemplatesDirty, setDocTemplatesDirty] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await apiFetch<any>("/consent-templates");
      if (cancelled || res.error || !res.data) return;
      // The endpoint returns { data: { tenant: [...], platformAvailableToFork: [...] } }
      // (snake-case key on the wire, camel after apiFetch's transform).
      // We surface BOTH lists: tenant-owned templates first (auto_request
      // toggleable), then platform templates flagged with isPlatform=true
      // so the UI can show them as fork-able.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = res.data as any;
      const tenantList: unknown[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.tenant)
          ? raw.tenant
          : Array.isArray(raw?.data?.tenant)
            ? raw.data.tenant
            : Array.isArray(raw?.data)
              ? raw.data
              : [];
      const platformList: unknown[] = Array.isArray(raw?.platformAvailableToFork)
        ? raw.platformAvailableToFork
        : Array.isArray(raw?.platform_available_to_fork)
          ? raw.platform_available_to_fork
          : Array.isArray(raw?.data?.platformAvailableToFork)
            ? raw.data.platformAvailableToFork
            : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapTpl = (t: any, isPlatform: boolean) => ({
        id: t.id,
        name: t.name,
        autoRequest: !!(t.autoRequest ?? t.auto_request),
        type: t.type,
        isPlatform,
      });
      const merged = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(tenantList as any[]).filter((t) => t.isActive !== false && t.is_active !== false).map((t) => mapTpl(t, false)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(platformList as any[]).map((t) => mapTpl(t, true)),
      ];
      setDocumentTemplates(merged);
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Helpers for tracked onChange ────────────────────────────────────────
  function set<T>(setter: React.Dispatch<React.SetStateAction<T>>) {
    return (v: T) => { setter(v); markChanged(); };
  }

  // ─── Tab: Practice Info ──────────────────────────────────────────────────
  function renderInfo() {
    return (
      <>
        <SectionCard title="General Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextInput label="Practice Name" value={practiceName} onChange={set(setPracticeName)} />
            <div>
              <FieldLabel label="Specialty" />
              <div className="pt-1.5"><Badge text="Psychiatry" color={C.navy800} bg={C.slate100} /></div>
            </div>
            <div>
              <FieldLabel label="Practice Model" />
              <div className="pt-1.5"><Badge text="Pure DPC" color={C.teal600} bg="#e6f7f1" /></div>
            </div>
            <CopyableInput label="Tenant Code" value="70FEC8" helper="Unique identifier for your practice" />
            <PhoneField label="Phone" value={phone} onChange={(v) => setPhone(v)} />
            <EmailField label="Email" value={email} onChange={(v) => setEmail(v)} />
            <TextInput label="Website" value={website} onChange={set(setWebsite)} />
          </div>
        </SectionCard>

        <SectionCard title="Address">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <AddressField
                label="Street Address"
                value={street}
                onChange={(v) => setStreet(v)}
                onParsed={(p) => {
                  // When the user picks from the OpenStreetMap dropdown,
                  // also fill the city/state/zip fields. Lets one
                  // autocomplete pick populate four fields.
                  if (p.street) setStreet(p.street);
                  if (p.city) setCity(p.city);
                  if (p.state) setState(p.state);
                  if (p.zip) setZip(p.zip);
                }}
              />
            </div>
            <TextInput label="City" value={city} onChange={set(setCity)} />
            <SelectInput
              label="State"
              value={state}
              options={US_STATES.map((s) => ({ value: s, label: s }))}
              onChange={set(setState)}
            />
            <ZipField label="ZIP" value={zip} onChange={(v) => setZip(v)} />
          </div>
        </SectionCard>

        {/* Multi-location — surfaces in patient portal Locations tab */}
        <FacilitiesPanel />

        <SectionCard title="Legal / Tax">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NPIField label="NPI" value={npi} onChange={(v) => setNpi(v)} />
            <MaskedInput label="Tax ID" value={taxId} helper="EIN or SSN (masked for security)" onChange={set(setTaxId)} />
            <TextInput label="License Number" value={licenseNumber} onChange={set(setLicenseNumber)} />
            <SelectInput
              label="License State"
              value={licenseState}
              options={US_STATES.map((s) => ({ value: s, label: s }))}
              onChange={set(setLicenseState)}
            />
          </div>
        </SectionCard>
      </>
    );
  }

  // ─── Tab: Branding ───────────────────────────────────────────────────────
  function renderBranding() {
    const apiBase = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
    return (
      <>
        <SectionCard title="Colors">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ColorPicker label="Primary Color" value={primaryColor} onChange={set(setPrimaryColor)} />
            <ColorPicker label="Secondary Color" value={secondaryColor} onChange={set(setSecondaryColor)} />
            <ColorPicker label="Accent Color" value={accentColor} onChange={set(setAccentColor)} />
          </div>
          <p className="text-xs mt-3" style={{ color: C.slate500 }}>
            Primary color drives buttons and CTAs in patient-facing emails. Secondary is the email header gradient base.
            Save your changes, then click <a href={`${apiBase}/admin/email-preview`} target="_blank" rel="noreferrer" style={{ color: C.teal600, textDecoration: "underline" }}>Preview emails</a> to see how they look.
          </p>
        </SectionCard>

        <SectionCard title="Logo">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <TextInput label="Logo URL" value={logoUrl} onChange={set(setLogoUrl)} />
              <div className="mt-2 flex items-center gap-3">
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setLogoUploading(true);
                    setLogoUploadError(null);
                    const res = await apiUpload<{ logoUrl?: string; logo_url?: string }>("/practice/logo", "logo", file);
                    setLogoUploading(false);
                    if (e.target) e.target.value = "";
                    if (res.error) {
                      setLogoUploadError(res.error);
                      return;
                    }
                    const url = res.data?.logoUrl ?? res.data?.logo_url;
                    if (url) {
                      setLogoUrl(url);
                      showToast("Logo uploaded");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => logoFileInputRef.current?.click()}
                  disabled={logoUploading}
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                  style={{ borderColor: C.slate200 }}
                >
                  {logoUploading ? "Uploading…" : "Upload from computer"}
                </button>
                <span className="text-xs text-slate-400">PNG/JPG/SVG/WebP up to 2MB</span>
              </div>
              {logoUploadError && (
                <p className="mt-2 text-xs" style={{ color: "#dc2626" }}>{logoUploadError}</p>
              )}
              {logoUrl && (
                <div className="mt-3 p-4 rounded-lg border flex items-center justify-center" style={{ borderColor: C.slate200, backgroundColor: C.slate50, minHeight: 80 }}>
                  <img src={logoUrl} alt="Logo preview" className="max-h-16 max-w-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
            </div>
            <TextInput label="Favicon URL" value={faviconUrl} onChange={set(setFaviconUrl)} />
          </div>
        </SectionCard>

        <SectionCard title="Custom Text">
          <div className="space-y-4">
            <TextArea label="Welcome Message" value={welcomeMsg} onChange={set(setWelcomeMsg)} />
            <TextInput label="Tagline" value={tagline} onChange={set(setTagline)} />
            <TextInput label="Footer Text" value={footerText} onChange={set(setFooterText)} />
          </div>
        </SectionCard>

        <SectionCard title="Patient Portal Branding">
          <ToggleSwitch label="Show Practice Logo" checked={showLogo} onChange={set(setShowLogo)} />
          <ToggleSwitch label="Show MemberMD Badge" checked={showBadge} onChange={set(setShowBadge)} />
          <div className="mt-4">
            <TextArea label="Custom CSS (advanced)" value="" disabled helper="Coming Soon" onChange={() => {}} />
          </div>
        </SectionCard>
      </>
    );
  }

  // ─── Tab: Scheduling ─────────────────────────────────────────────────────
  function renderScheduling() {
    const updateDay = (day: string, patch: Partial<OfficeDay>) => {
      setOfficeHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
      markChanged();
    };

    return (
      <>
        <SectionCard title="Office Hours">
          <div className="space-y-3">
            {DAYS.map((day) => {
              const d = officeHours[day];
              return (
                <div key={day} className="flex items-center gap-3 py-2">
                  <div className="w-28 shrink-0">
                    <span className="text-sm font-medium" style={{ color: C.navy800 }}>{day}</span>
                  </div>
                  <button
                    onClick={() => updateDay(day, { open: !d.open })}
                    className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                    style={{ backgroundColor: d.open ? C.teal500 : C.slate300 }}
                  >
                    <div
                      className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
                      style={{ transform: d.open ? "translateX(22px)" : "translateX(2px)" }}
                    />
                  </button>
                  {d.open ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={d.start}
                        onChange={(e) => updateDay(day, { start: e.target.value })}
                        className="px-2 py-1.5 rounded-lg border text-sm"
                        style={{ borderColor: C.slate200, color: C.navy900 }}
                      />
                      <span className="text-sm" style={{ color: C.slate400 }}>to</span>
                      <input
                        type="time"
                        value={d.end}
                        onChange={(e) => updateDay(day, { end: e.target.value })}
                        className="px-2 py-1.5 rounded-lg border text-sm"
                        style={{ borderColor: C.slate200, color: C.navy900 }}
                      />
                    </div>
                  ) : (
                    <span className="text-sm" style={{ color: C.slate400 }}>Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Appointment Settings">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SelectInput
              label="Default Appointment Duration"
              value={defaultDuration}
              options={[
                { value: "15", label: "15 minutes" },
                { value: "20", label: "20 minutes" },
                { value: "30", label: "30 minutes" },
                { value: "45", label: "45 minutes" },
                { value: "60", label: "60 minutes" },
              ]}
              onChange={set(setDefaultDuration)}
            />
            <SelectInput
              label="Buffer Between Appointments"
              value={bufferTime}
              options={[
                { value: "0", label: "0 minutes" },
                { value: "5", label: "5 minutes" },
                { value: "10", label: "10 minutes" },
                { value: "15", label: "15 minutes" },
              ]}
              onChange={set(setBufferTime)}
            />
            <SelectInput
              label="Max Advance Booking"
              value={maxAdvance}
              options={[
                { value: "1week", label: "1 week" },
                { value: "2weeks", label: "2 weeks" },
                { value: "1month", label: "1 month" },
                { value: "2months", label: "2 months" },
                { value: "3months", label: "3 months" },
              ]}
              onChange={set(setMaxAdvance)}
            />
          </div>
          <div className="mt-4 space-y-1">
            <ToggleSwitch label="Allow Online Self-Scheduling" checked={selfSchedule} onChange={set(setSelfSchedule)} />
            <ToggleSwitch label="Allow Same-Day Booking" checked={sameDayBooking} onChange={set(setSameDayBooking)} />
            <ToggleSwitch label="Require Appointment Reason" checked={requireReason} onChange={set(setRequireReason)} />
          </div>
        </SectionCard>

        <SectionCard title="Cancellation Policy">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SelectInput
              label="Cancellation Notice Required"
              value={cancelNotice}
              options={[
                { value: "none", label: "None" },
                { value: "12h", label: "12 hours" },
                { value: "24h", label: "24 hours" },
                { value: "48h", label: "48 hours" },
              ]}
              onChange={set(setCancelNotice)}
            />
            <NumberInput label="Late Cancellation Fee" value={lateCancelFee} prefix="$" onChange={set(setLateCancelFee)} />
            <NumberInput label="No-Show Fee" value={noShowFee} prefix="$" onChange={set(setNoShowFee)} />
          </div>
          <div className="mt-4">
            <ToggleSwitch label="Auto-Charge No-Show Fee" checked={autoChargeNoShow} onChange={set(setAutoChargeNoShow)} />
          </div>
        </SectionCard>
      </>
    );
  }

  // ─── Tab: Membership ─────────────────────────────────────────────────────
  function renderMembership() {
    return (
      <>
        <SectionCard title="Default Settings">
          <ToggleSwitch label="Allow Self-Enrollment" checked={selfEnroll} onChange={set(setSelfEnroll)} />
          <ToggleSwitch label="Require Intake Form Before Enrollment" checked={requireIntake} onChange={set(setRequireIntake)} />
          <ToggleSwitch label="Show Pricing on Enrollment Page" checked={showPricing} onChange={set(setShowPricing)} />
          <ToggleSwitch label="Allow Plan Switching" checked={allowSwitch} onChange={set(setAllowSwitch)} />
          <ToggleSwitch label="Proration on Plan Change" checked={proration} onChange={set(setProration)} />
        </SectionCard>

        <SectionCard title="Dunning Settings">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SelectInput
              label="Payment Retry Attempts"
              value={retryAttempts}
              options={[
                { value: "1", label: "1" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
                { value: "5", label: "5" },
              ]}
              onChange={set(setRetryAttempts)}
            />
            <SelectInput
              label="Days Between Retries"
              value={retryDays}
              options={[
                { value: "1", label: "1 day" },
                { value: "2", label: "2 days" },
                { value: "3", label: "3 days" },
                { value: "5", label: "5 days" },
                { value: "7", label: "7 days" },
              ]}
              onChange={set(setRetryDays)}
            />
          </div>
          <div className="mt-3">
            <ToggleSwitch label="Suspend After Failed Retries" checked={suspendAfterFail} onChange={set(setSuspendAfterFail)} />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberInput label="Days Before Suspension" value={daysBeforeSuspend} suffix="days" onChange={set(setDaysBeforeSuspend)} />
            <NumberInput label="Days Before Expiration" value={daysBeforeExpire} suffix="days" onChange={set(setDaysBeforeExpire)} />
          </div>
        </SectionCard>

        <SectionCard title="HSA/FSA">
          <ToggleSwitch label="Generate HSA-Eligible Receipts" checked={hsaReceipts} onChange={set(setHsaReceipts)} />
          <ToggleSwitch label="Include NPI on Receipts" checked={npiOnReceipts} onChange={set(setNpiOnReceipts)} />
          <ToggleSwitch label="Include Tax ID on Receipts" checked={taxOnReceipts} onChange={set(setTaxOnReceipts)} />
          <div className="mt-3">
            <TextInput label="Receipt Footer Text" value={receiptFooter} onChange={set(setReceiptFooter)} />
          </div>
        </SectionCard>
      </>
    );
  }

  // ─── Tab: Notifications ──────────────────────────────────────────────────
  function renderNotifications() {
    const channelOptions = [
      { value: "email", label: "Email" },
      { value: "sms", label: "SMS" },
      { value: "both", label: "Both" },
    ];

    const timingOptions = [
      { value: "1h", label: "1 hour before" },
      { value: "2h", label: "2 hours before" },
      { value: "12h", label: "12 hours before" },
      { value: "24h", label: "24 hours before" },
      { value: "48h", label: "48 hours before" },
    ];

    const renewalTimingOptions = [
      { value: "1d", label: "1 day before" },
      { value: "3d", label: "3 days before" },
      { value: "7d", label: "7 days before" },
      { value: "14d", label: "14 days before" },
    ];

    const updatePracticeNotif = (idx: number, patch: Partial<NotificationRow>) => {
      setPracticeNotifs((prev) => prev.map((n, i) => (i === idx ? { ...n, ...patch } : n)));
      markChanged();
    };

    const updatePatientNotif = (idx: number, patch: Partial<NotificationRow>) => {
      setPatientNotifs((prev) => prev.map((n, i) => (i === idx ? { ...n, ...patch } : n)));
      markChanged();
    };

    return (
      <>
        <SectionCard title="Practice Notifications">
          <p className="text-xs mb-4" style={{ color: C.slate400 }}>
            Configure what notifications the practice team receives.
          </p>
          <div className="space-y-2">
            {practiceNotifs.map((n, i) => (
              <div key={n.label} className="flex items-center justify-between py-2 border-b" style={{ borderColor: C.slate100 }}>
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => updatePracticeNotif(i, { enabled: !n.enabled })}
                    className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                    style={{ backgroundColor: n.enabled ? C.teal500 : C.slate300 }}
                  >
                    <div
                      className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
                      style={{ transform: n.enabled ? "translateX(22px)" : "translateX(2px)" }}
                    />
                  </button>
                  <span className="text-sm" style={{ color: C.navy800 }}>{n.label}</span>
                </div>
                {n.enabled && (
                  <select
                    value={n.channel}
                    onChange={(e) => updatePracticeNotif(i, { channel: e.target.value })}
                    className="px-2 py-1 rounded border text-xs"
                    style={{ borderColor: C.slate200, color: C.navy800 }}
                  >
                    {channelOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Patient Notifications">
          <p className="text-xs mb-4" style={{ color: C.slate400 }}>
            Default notification preferences for patients. Patients can override these.
          </p>
          <div className="space-y-2">
            {patientNotifs.map((n, i) => {
              const hasTiming = n.label === "Appointment Reminder" || n.label === "Membership Renewal Reminder";
              const opts = n.label === "Appointment Reminder" ? timingOptions : renewalTimingOptions;
              return (
                <div key={n.label} className="flex items-center justify-between py-2 border-b" style={{ borderColor: C.slate100 }}>
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      onClick={() => updatePatientNotif(i, { enabled: !n.enabled })}
                      className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                      style={{ backgroundColor: n.enabled ? C.teal500 : C.slate300 }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
                        style={{ transform: n.enabled ? "translateX(22px)" : "translateX(2px)" }}
                      />
                    </button>
                    <span className="text-sm" style={{ color: C.navy800 }}>{n.label}</span>
                  </div>
                  {n.enabled && hasTiming && (
                    <select
                      value={n.channel}
                      onChange={(e) => updatePatientNotif(i, { channel: e.target.value })}
                      className="px-2 py-1 rounded border text-xs"
                      style={{ borderColor: C.slate200, color: C.navy800 }}
                    >
                      {opts.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      </>
    );
  }

  // ─── Tab: Team ───────────────────────────────────────────────────────────
  function renderTeam() {
    const roleBadge = (role: string) => {
      switch (role) {
        case "Practice Admin": return <Badge text={role} color="#7c3aed" bg="#ede9fe" />;
        case "Provider": return <Badge text={role} color={C.teal600} bg="#e6f7f1" />;
        default: return <Badge text={role} color={C.navy700} bg={C.slate100} />;
      }
    };

    return (
      <>
        <SectionCard title="Current Team Members">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: C.slate200 }}>
                  {["Name", "Email", "Role", "Status", "Last Login", "Actions"].map((h) => (
                    <th key={h} className="text-left py-3 px-3 font-medium" style={{ color: C.slate500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamMembers.map((m) => (
                  <tr key={m.email} className="border-b" style={{ borderColor: C.slate100 }}>
                    <td className="py-3 px-3 font-medium" style={{ color: C.navy900 }}>{m.name}</td>
                    <td className="py-3 px-3" style={{ color: C.slate500 }}>{m.email}</td>
                    <td className="py-3 px-3">{roleBadge(m.role)}</td>
                    <td className="py-3 px-3">
                      <Badge text={m.status} color={C.green600} bg="#dcfce7" />
                    </td>
                    <td className="py-3 px-3" style={{ color: C.slate500 }}>{m.lastLogin}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded-lg hover:bg-slate-100" title="Edit Role">
                          <Pencil className="w-4 h-4" style={{ color: C.slate400 }} />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-slate-100" title="Deactivate">
                          <UserMinus className="w-4 h-4" style={{ color: C.red500 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Invite Team Member">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <FieldLabel label="Email Address" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@practice.com"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2"
                style={{ borderColor: C.slate200, color: C.navy900 }}
              />
            </div>
            <div className="w-full sm:w-40">
              <FieldLabel label="Role" />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none bg-white"
                style={{ borderColor: C.slate200, color: C.navy900 }}
              >
                <option value="provider">Provider</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { showToast("Invitation sent"); setInviteEmail(""); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: C.teal500 }}
              >
                <Send className="w-4 h-4" />
                Send Invitation
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Pending Invitations">
          <div className="text-center py-8">
            <Plus className="w-8 h-8 mx-auto mb-2" style={{ color: C.slate300 }} />
            <p className="text-sm" style={{ color: C.slate400 }}>No pending invitations</p>
          </div>
        </SectionCard>
      </>
    );
  }

  // ─── Tab: Compliance ─────────────────────────────────────────────────────
  function renderCompliance() {
    const consentForms = [
      { name: "HIPAA Notice", status: "Active", required: true },
      { name: "Consent to Treatment", status: "Active", required: true },
      { name: "Telehealth Consent", status: "Active", required: true },
      { name: "Financial Agreement", status: "Active", required: true },
      { name: "Communications Consent", status: "Active", required: true },
    ];

    return (
      <>
        <SectionCard title="HIPAA Compliance">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: C.navy800 }}>PHI Encryption Status</span>
              <Badge text="AES-256 Encrypted" color={C.green600} bg="#dcfce7" />
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: C.navy800 }}>Audit Logging</span>
              <Badge text="Active" color={C.green600} bg="#dcfce7" />
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: C.navy800 }}>BAA Status</span>
              <div className="flex items-center gap-2">
                <Badge text="Not Configured" color={C.amber800} bg={C.amber100} />
                <button
                  className="text-xs px-3 py-1 rounded-lg border font-medium hover:bg-slate-50"
                  style={{ borderColor: C.slate200, color: C.teal600 }}
                >
                  Upload BAA
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: C.navy800 }}>Last Compliance Review</span>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: C.slate400 }}>Not yet conducted</span>
                <button
                  className="text-xs px-3 py-1 rounded-lg border font-medium hover:bg-slate-50"
                  style={{ borderColor: C.slate200, color: C.teal600 }}
                >
                  Schedule Review
                </button>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Consent Forms">
          <p className="text-xs mb-4" style={{ color: C.slate400 }}>
            Assigned based on your specialty
          </p>
          <div className="space-y-2">
            {consentForms.map((f) => (
              <div key={f.name} className="flex items-center justify-between py-2 border-b" style={{ borderColor: C.slate100 }}>
                <span className="text-sm" style={{ color: C.navy800 }}>{f.name}</span>
                <div className="flex items-center gap-2">
                  <Badge text={f.status} color={C.green600} bg="#dcfce7" />
                  {f.required && <Badge text="Required" color={C.navy700} bg={C.slate100} />}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Data Retention">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SelectInput
              label="Patient Data Retention"
              value={dataRetention}
              options={[
                { value: "5", label: "5 years" },
                { value: "7", label: "7 years" },
                { value: "10", label: "10 years" },
              ]}
              onChange={set(setDataRetention)}
            />
            <SelectInput
              label="Audit Log Retention"
              value={auditRetention}
              options={[
                { value: "1", label: "1 year" },
                { value: "3", label: "3 years" },
                { value: "5", label: "5 years" },
              ]}
              onChange={set(setAuditRetention)}
            />
          </div>
          <p className="text-xs mt-4" style={{ color: C.slate400 }}>
            Deleted records are permanently removed after the retention period.
          </p>
        </SectionCard>
      </>
    );
  }

  // ─── Tab: Integrations ───────────────────────────────────────────────────

  function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
      <button
        onClick={() => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
        style={{ color: copied ? C.green600 : C.teal600, backgroundColor: copied ? "#dcfce7" : C.slate50 }}
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    );
  }

  function renderIntegrations() {
    // Use a sample tenant code — in production this comes from auth context / practice data
    const tenantCode = "ABC123";
    const appUrl = "https://app.membermd.io";

    const planEmbedCode = `<iframe src="${appUrl}/#/plans/${tenantCode}" width="100%" height="600" style="border:none" title="Membership Plans"></iframe>`;
    const planDirectLink = `${appUrl}/#/plans/${tenantCode}`;
    const enrollEmbedCode = `<iframe src="${appUrl}/#/enroll/${tenantCode}" width="100%" height="800" style="border:none" title="Patient Enrollment"></iframe>`;
    const enrollDirectLink = `${appUrl}/#/enroll/${tenantCode}`;

    const integrations = [
      {
        name: "Stripe",
        description: "Process membership payments and manage subscriptions",
        category: "Payment Processing",
        status: "Not Connected",
        statusColor: C.amber800,
        statusBg: C.amber100,
        action: "Connect Stripe",
        disabled: false,
      },
      {
        name: "E-Prescribing (DoseSpot)",
        description: "Send and manage electronic prescriptions",
        category: "Electronic Prescribing",
        status: "Coming Soon",
        statusColor: C.slate500,
        statusBg: C.slate100,
        action: "Learn More",
        disabled: true,
      },
      {
        name: "Labs (Quest/Labcorp)",
        description: "Order and receive lab results electronically",
        category: "Lab Ordering",
        status: "Coming Soon",
        statusColor: C.slate500,
        statusBg: C.slate100,
        action: "Learn More",
        disabled: true,
      },
      {
        name: "Calendar Sync",
        description: "Sync appointments with Google Calendar or Outlook",
        category: "Google Calendar / Outlook",
        status: "Not Connected",
        statusColor: C.amber800,
        statusBg: C.amber100,
        action: "Connect Calendar",
        disabled: false,
      },
      {
        name: "Telehealth (Daily.co)",
        description: "Enabled by default for all practices",
        category: "Video Visits",
        status: "Enabled",
        statusColor: C.green600,
        statusBg: "#dcfce7",
        action: "",
        disabled: true,
      },
      {
        name: "Zapier",
        description: "Automate workflows with 5,000+ apps",
        category: "Workflow Automation",
        status: "Coming Soon",
        statusColor: C.slate500,
        statusBg: C.slate100,
        action: "Learn More",
        disabled: true,
      },
    ];

    return (
      <div className="space-y-6">
        {/* ── Outbound Webhooks (real backend, fully functional) ───────────── */}
        <WebhooksPanel />

        {/* ── Embeddable Widgets ─────────────────────────────────────────────── */}
        <div className="rounded-xl border p-6" style={{ borderColor: C.slate200, backgroundColor: C.white }}>
          <div className="flex items-center gap-2 mb-4">
            <Code className="w-5 h-5" style={{ color: C.teal500 }} />
            <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>Embeddable Widgets</h3>
          </div>
          <p className="text-sm mb-6" style={{ color: C.slate500 }}>
            Add these widgets to your practice website so patients can view plans and enroll directly.
          </p>

          {/* Plan Display Widget */}
          <div className="rounded-xl border p-5 mb-4" style={{ borderColor: C.slate200, backgroundColor: C.slate50 }}>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4" style={{ color: C.teal500 }} />
              <h4 className="text-sm font-semibold" style={{ color: C.navy900 }}>Plan Display Widget</h4>
            </div>
            <p className="text-xs mb-4" style={{ color: C.slate500 }}>
              Shows your membership plans with pricing. Patients click "Enroll" to start enrollment.
            </p>

            {/* Mini Preview */}
            <div className="rounded-lg border p-3 mb-4" style={{ borderColor: C.slate200, backgroundColor: C.white }}>
              <div className="flex items-center justify-center gap-3">
                {["Standard", "Professional", "Enterprise"].map((name, i) => (
                  <div
                    key={name}
                    className="flex-1 rounded-lg border p-2 text-center"
                    style={{
                      borderColor: i === 1 ? C.teal500 : C.slate200,
                      maxWidth: "120px",
                    }}
                  >
                    <p className="text-xs font-semibold" style={{ color: C.navy900 }}>{name}</p>
                    <p className="text-xs mt-0.5" style={{ color: C.slate400 }}>
                      ${i === 0 ? "99" : i === 1 ? "179" : "299"}/mo
                    </p>
                    <div
                      className="mt-1.5 py-0.5 rounded text-xs"
                      style={{ backgroundColor: C.teal500, color: C.white, fontSize: "9px" }}
                    >
                      Enroll
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Embed Code */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium" style={{ color: C.navy800 }}>Embed Code</p>
                <CopyButton text={planEmbedCode} />
              </div>
              <div
                className="rounded-lg p-2.5 text-xs font-mono overflow-x-auto"
                style={{ backgroundColor: C.navy900, color: "#93c5fd" }}
              >
                {planEmbedCode}
              </div>
            </div>

            {/* Direct Link */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium" style={{ color: C.navy800 }}>Direct Link</p>
                <CopyButton text={planDirectLink} />
              </div>
              <div className="flex items-center gap-2">
                <Link className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.teal500 }} />
                <a
                  href={planDirectLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs hover:underline truncate"
                  style={{ color: C.teal600 }}
                >
                  {planDirectLink}
                </a>
              </div>
            </div>

            {/* QR Code */}
            <button
              onClick={() => showToast("QR Code generation coming soon")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{ borderColor: C.slate200, color: C.slate600, backgroundColor: C.white }}
            >
              <QrCode className="w-3.5 h-3.5" />
              Generate QR Code
            </button>
          </div>

          {/* Enrollment Widget */}
          <div className="rounded-xl border p-5 mb-4" style={{ borderColor: C.slate200, backgroundColor: C.slate50 }}>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4" style={{ color: C.teal500 }} />
              <h4 className="text-sm font-semibold" style={{ color: C.navy900 }}>Enrollment Widget</h4>
            </div>
            <p className="text-xs mb-4" style={{ color: C.slate500 }}>
              Multi-step enrollment form where patients can sign up for a plan directly from your website.
            </p>

            {/* Embed Code */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium" style={{ color: C.navy800 }}>Embed Code</p>
                <CopyButton text={enrollEmbedCode} />
              </div>
              <div
                className="rounded-lg p-2.5 text-xs font-mono overflow-x-auto"
                style={{ backgroundColor: C.navy900, color: "#93c5fd" }}
              >
                {enrollEmbedCode}
              </div>
            </div>

            {/* Direct Link */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium" style={{ color: C.navy800 }}>Direct Link</p>
                <CopyButton text={enrollDirectLink} />
              </div>
              <div className="flex items-center gap-2">
                <Link className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.teal500 }} />
                <a
                  href={enrollDirectLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs hover:underline truncate"
                  style={{ color: C.teal600 }}
                >
                  {enrollDirectLink}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── API Access ────────────────────────────────────────────────────── */}
        <div className="rounded-xl border p-6" style={{ borderColor: C.slate200, backgroundColor: C.white }}>
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-5 h-5" style={{ color: C.teal500 }} />
            <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>API Access</h3>
          </div>

          {/* API Key */}
          <div className="rounded-xl border p-4 mb-4" style={{ borderColor: C.slate200, backgroundColor: C.slate50 }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium" style={{ color: C.navy800 }}>API Key</p>
              <button
                onClick={() => showToast("API key generation coming soon")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                style={{ borderColor: C.teal500, color: C.teal600, backgroundColor: C.white }}
              >
                <Key className="w-3.5 h-3.5" />
                Generate API Key
              </button>
            </div>
            <div
              className="rounded-lg px-3 py-2 text-sm font-mono"
              style={{ backgroundColor: C.white, border: `1px solid ${C.slate200}`, color: C.slate400 }}
            >
              ••••••••••••••••••••••••••••••••
            </div>
          </div>

          {/* Endpoints */}
          <div className="mb-4">
            <p className="text-sm font-medium mb-3" style={{ color: C.navy800 }}>Available Endpoints</p>
            <div className="space-y-2">
              {[
                { method: "GET", path: `/api/external/plans/${tenantCode}`, desc: "List membership plans" },
                { method: "POST", path: `/api/external/enroll/${tenantCode}`, desc: "Enroll a patient" },
                { method: "GET", path: `/api/external/availability/${tenantCode}`, desc: "Check availability" },
              ].map((ep) => (
                <div
                  key={ep.path}
                  className="flex items-center gap-3 rounded-lg px-3 py-2"
                  style={{ backgroundColor: C.slate50, border: `1px solid ${C.slate200}` }}
                >
                  <span
                    className="px-2 py-0.5 rounded text-xs font-bold"
                    style={{
                      backgroundColor: ep.method === "GET" ? "#dbeafe" : "#dcfce7",
                      color: ep.method === "GET" ? "#1d4ed8" : "#166534",
                    }}
                  >
                    {ep.method}
                  </span>
                  <code className="text-xs font-mono flex-1 truncate" style={{ color: C.navy900 }}>
                    {ep.path}
                  </code>
                  <span className="text-xs hidden md:inline" style={{ color: C.slate400 }}>{ep.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rate Limits */}
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: C.slate500 }}>Rate limit: 60 requests/minute</p>
            <button
              disabled
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{
                borderColor: C.slate200,
                color: C.slate400,
                backgroundColor: C.slate50,
                cursor: "not-allowed",
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Full API Docs
            </button>
          </div>
        </div>

        {/* ── Third-Party Integrations ──────────────────────────────────────── */}
        <div>
          <h3 className="text-base font-semibold mb-4" style={{ color: C.navy900 }}>Third-Party Integrations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrations.map((intg) => (
              <div
                key={intg.name}
                className="rounded-xl border p-5"
                style={{ borderColor: C.slate200, backgroundColor: C.white }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold" style={{ color: C.navy900 }}>{intg.name}</h4>
                    <p className="text-xs mt-0.5" style={{ color: C.slate400 }}>{intg.category}</p>
                  </div>
                  <Badge text={intg.status} color={intg.statusColor} bg={intg.statusBg} />
                </div>
                <p className="text-sm mb-4" style={{ color: C.slate500 }}>{intg.description}</p>
                {intg.action && (
                  <button
                    disabled={intg.disabled}
                    onClick={() => !intg.disabled && showToast(`${intg.name} connection initiated`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                    style={{
                      borderColor: intg.disabled ? C.slate200 : C.teal500,
                      color: intg.disabled ? C.slate400 : C.teal600,
                      backgroundColor: intg.disabled ? C.slate50 : C.white,
                      cursor: intg.disabled ? "not-allowed" : "pointer",
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {intg.action}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Tab: Clinical Config (ported from EnnHealth) ────────────────────────
  //
  // Each sub-section is a curated list of strings (or string+flag for
  // documents). EnnHealth's UI used a heavier dialog-per-add pattern; we
  // simplify with an inline "+" input row + chip list with delete, since
  // the items are short labels not full forms.

  function renderChipList({
    title,
    helper,
    items,
    onAdd,
    onRemove,
    placeholder,
  }: {
    title: string;
    helper: string;
    items: string[];
    onAdd: (v: string) => void;
    onRemove: (idx: number) => void;
    placeholder: string;
  }) {
    return (
      <SectionCard title={title}>
        <p className="text-xs mb-3" style={{ color: C.slate500 }}>{helper}</p>
        <ChipListEditor
          items={items}
          placeholder={placeholder}
          onAdd={(v) => { onAdd(v); markChanged(); }}
          onRemove={(i) => { onRemove(i); markChanged(); }}
        />
      </SectionCard>
    );
  }

  function renderClinical() {
    return (
      <>
        {/* Appointment Configuration */}
        <div className="mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: C.slate500 }}>
            Appointments
          </h2>
        </div>
        {renderChipList({
          title: "Appointment Types",
          helper: "Visit types providers can choose when scheduling.",
          items: appointmentTypes,
          placeholder: "e.g. Annual Physical",
          onAdd: (v) => setAppointmentTypes([...appointmentTypes, v]),
          onRemove: (i) => setAppointmentTypes(appointmentTypes.filter((_, idx) => idx !== i)),
        })}
        {renderChipList({
          title: "Visit Statuses",
          helper: "Lifecycle states an appointment can move through. Saved to /clinical-settings/visit_statuses.",
          items: visitStatuses.map((i) => i.label),
          placeholder: "e.g. Waiting Room",
          onAdd: (v) => addClinicalItem("visit_statuses", v),
          onRemove: (i) => removeClinicalItem("visit_statuses", i),
        })}
        {renderChipList({
          title: "Visit Reasons",
          helper: "Common chief complaints. Surfaces as the \"Reason for visit\" dropdown on the patient booking flow.",
          items: visitReasons.map((i) => i.label),
          placeholder: "e.g. Sleep Disorders",
          onAdd: (v) => addClinicalItem("visit_reasons", v),
          onRemove: (i) => removeClinicalItem("visit_reasons", i),
        })}

        {/* Provider Configuration */}
        <div className="mt-8 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: C.slate500 }}>
            Providers
          </h2>
        </div>
        {renderChipList({
          title: "Provider Types",
          helper: "Credentials and roles your practice supports.",
          items: providerTypes,
          placeholder: "e.g. PMHNP",
          onAdd: (v) => setProviderTypes([...providerTypes, v]),
          onRemove: (i) => setProviderTypes(providerTypes.filter((_, idx) => idx !== i)),
        })}
        {renderChipList({
          title: "Specialties",
          helper: "Used for matching patients with providers and listing on the booking widget.",
          items: providerSpecialties,
          placeholder: "e.g. Geriatric Psychiatry",
          onAdd: (v) => setProviderSpecialties([...providerSpecialties, v]),
          onRemove: (i) => setProviderSpecialties(providerSpecialties.filter((_, idx) => idx !== i)),
        })}
        {renderChipList({
          title: "Languages",
          helper: "Languages your providers can practice in.",
          items: providerLanguages,
          placeholder: "e.g. Mandarin",
          onAdd: (v) => setProviderLanguages([...providerLanguages, v]),
          onRemove: (i) => setProviderLanguages(providerLanguages.filter((_, idx) => idx !== i)),
        })}

        {/* Clinical Taxonomy */}
        <div className="mt-8 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: C.slate500 }}>
            Clinical Taxonomy
          </h2>
        </div>
        {renderChipList({
          title: "Conditions",
          helper: "Diagnosable conditions your practice treats. Saved to /clinical-settings/conditions.",
          items: clinicalConditions.map((i) => i.label),
          placeholder: "e.g. Persistent Depressive Disorder",
          onAdd: (v) => addClinicalItem("conditions", v),
          onRemove: (i) => removeClinicalItem("conditions", i),
        })}
        {renderChipList({
          title: "Treatment Modalities",
          helper: "Therapeutic approaches used in encounters. Saved to /clinical-settings/treatment_modalities.",
          items: clinicalModalities.map((i) => i.label),
          placeholder: "e.g. Mindfulness-Based CBT",
          onAdd: (v) => addClinicalItem("treatment_modalities", v),
          onRemove: (i) => removeClinicalItem("treatment_modalities", i),
        })}
        {renderChipList({
          title: "Patient Populations",
          helper: "Populations your practice serves. Saved to /clinical-settings/patient_populations.",
          items: patientPopulations.map((i) => i.label),
          placeholder: "e.g. First Responders",
          onAdd: (v) => addClinicalItem("patient_populations", v),
          onRemove: (i) => removeClinicalItem("patient_populations", i),
        })}

        {/* Membership lifecycle */}
        <div className="mt-8 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: C.slate500 }}>
            Membership Lifecycle
          </h2>
        </div>
        {renderChipList({
          title: "Cancellation Reasons",
          helper: "Reasons shown to patients (and staff) when a membership is cancelled. Picking a reason becomes categorical reporting instead of free-text. Saved to /clinical-settings/cancellation_reasons.",
          items: cancellationReasons.map((i) => i.label),
          placeholder: "e.g. Moved out of area",
          onAdd: (v) => addClinicalItem("cancellation_reasons", v),
          onRemove: (i) => removeClinicalItem("cancellation_reasons", i),
        })}

        {/* Templates */}
        <div className="mt-8 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: C.slate500 }}>
            Templates
          </h2>
        </div>
        {renderChipList({
          title: "Note Templates",
          helper: "Active SOAP/progress note templates available in the encounter editor.",
          items: noteTemplates,
          placeholder: "e.g. Initial Substance Use Assessment",
          onAdd: (v) => setNoteTemplates([...noteTemplates, v]),
          onRemove: (i) => setNoteTemplates(noteTemplates.filter((_, idx) => idx !== i)),
        })}

        <SectionCard title="Document Templates">
          <p className="text-xs mb-4" style={{ color: C.slate500 }}>
            Documents collected at intake or before specific appointments.
            Toggle <strong>Auto-request</strong> to send the request automatically
            after a patient enrolls.
          </p>
          <div className="space-y-2">
            {documentTemplates.map((doc, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                style={{ borderColor: C.slate200 }}
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4" style={{ color: C.slate400 }} />
                  <span className="text-sm" style={{ color: C.navy900 }}>{doc.name}</span>
                  {doc.isPlatform && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                      style={{ backgroundColor: C.slate100, color: C.slate500 }}
                    >
                      Platform default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: C.slate500 }}>
                    <input
                      type="checkbox"
                      checked={doc.autoRequest}
                      onChange={(e) => {
                        const next = [...documentTemplates];
                        next[idx] = { ...doc, autoRequest: e.target.checked };
                        setDocumentTemplates(next);
                        if (doc.id) {
                          setDocTemplatesDirty((d) => ({ ...d, [doc.id!]: true }));
                        }
                        markChanged();
                      }}
                    />
                    Auto-request
                  </label>
                  <button
                    onClick={() => {
                      setDocumentTemplates(documentTemplates.filter((_, i) => i !== idx));
                      markChanged();
                    }}
                    className="p-1 rounded hover:bg-slate-100"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: C.red500 }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <DocumentTemplateAdder
            onAdd={(name) => {
              setDocumentTemplates([...documentTemplates, { name, autoRequest: false }]);
              markChanged();
            }}
          />
        </SectionCard>
      </>
    );
  }

  // ─── Tab Router ────────────────────────────────────────────────────────────

  function renderTabContent() {
    switch (activeTab) {
      case "info": return renderInfo();
      case "subscription": return <PlatformSubscriptionSection />;
      case "branding": return renderBranding();
      case "widgets": return <BrandedWidgets />;
      case "scheduling": return renderScheduling();
      case "membership": return renderMembership();
      case "payments": return <PaymentSetup />;
      case "clinical": return renderClinical();
      case "agreements": return <AgreementEditor />;
      case "notifications": return renderNotifications();
      case "team": return renderTeam();
      case "compliance": return renderCompliance();
      case "integrations": return renderIntegrations();
      default: return renderInfo();
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Tab Bar — wraps to 2 rows on wider screens, more on narrow */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-1 p-1 rounded-xl" style={{ backgroundColor: C.slate100 }}>
          {TAB_CONFIG.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: isActive ? C.white : "transparent",
                  color: isActive ? C.teal600 : C.slate500,
                  boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {renderTabContent()}

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
          style={{
            backgroundColor: hasChanges ? C.teal500 : C.slate300,
            cursor: hasChanges ? "pointer" : "not-allowed",
          }}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
