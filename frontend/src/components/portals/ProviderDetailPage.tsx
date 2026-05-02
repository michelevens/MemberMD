// ===== Provider Detail Page =====
// Full provider management surface for practice admins.
// Tabs: Overview, Profile, Schedule, Panel, Appointments, Licensing, Settings.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, User as UserIcon, Calendar, Users as UsersIcon, Clock, Award,
  Settings as SettingsIcon, Loader2, Search, Save, Video, Mail, Hash,
  CheckCircle2, AlertTriangle, Copy, RefreshCw, ShieldCheck, Plus,
  Trash2, Pencil, FileCheck2, X as XIcon, Upload,
} from "lucide-react";
import { providerService, calendarService, credentialService } from "../../lib/api";
import type { ProviderCredentialDTO } from "../../lib/api";
import type { Provider, ProviderAvailability, Appointment } from "../../types";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA",
  "WV","WI","WY",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type TabKey = "overview" | "profile" | "schedule" | "panel" | "appointments" | "licensing" | "credentials" | "settings";

const TABS: { key: TabKey; label: string; icon: typeof UserIcon }[] = [
  { key: "overview", label: "Overview", icon: UserIcon },
  { key: "profile", label: "Profile", icon: UserIcon },
  { key: "schedule", label: "Schedule", icon: Calendar },
  { key: "panel", label: "Panel", icon: UsersIcon },
  { key: "appointments", label: "Appointments", icon: Clock },
  { key: "licensing", label: "Licensing", icon: Award },
  { key: "credentials", label: "Credentials", icon: ShieldCheck },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

// Several backend endpoints return Laravel pagination envelopes —
// { data: T[], current_page, total, ... } — wrapped inside the
// outer ApiResponse<{ data: ... }>. The list endpoints unwrap the
// outer envelope but pass the inner pagination object through
// untouched. These helpers normalize to plain arrays so the
// component never sees the envelope shape.
function unwrapAppointments(value: unknown): Appointment[] {
  if (Array.isArray(value)) return value as Appointment[];
  if (value && typeof value === "object" && "data" in (value as Record<string, unknown>)) {
    const inner = (value as { data: unknown }).data;
    if (Array.isArray(inner)) return inner as Appointment[];
  }
  return [];
}

// Shape returned by the analytics panel endpoint (fields are loose because
// the backend may evolve; we read defensively).
interface PanelSummary {
  totalPatients?: number;
  activeMembers?: number;
  averageAge?: number;
  engagementMetrics?: {
    engagedPatients?: number;
    atRiskPatients?: number;
    averageEngagementScore?: number;
  };
}

interface ProviderDetailPageProps {
  /**
   * When provided, the page reads the provider id from props instead
   * of useParams. Lets a parent portal (e.g. PracticePortal) embed
   * this page inside its sidebar layout via state instead of routing.
   */
  providerId?: string;
  /**
   * When true, drops the standalone full-page chrome (navy header,
   * outer min-h-screen wrapper) so the page nests cleanly inside an
   * existing portal layout. The tab bar + body still render.
   */
  embedded?: boolean;
  /**
   * Custom back-button handler for embedded mode. Defaults to
   * navigate("/practice") when standalone.
   */
  onBack?: () => void;
  /**
   * "admin" (default): full edit access for practice admins.
   * "self": the logged-in provider is viewing their own row from the
   *  My Profile tab. Hides admin-only Settings fields (panel capacity,
   *  panel status, telehealth flag, consultation fee) and reframes the
   *  page as the provider's own profile rather than a third-party
   *  detail view. Backend ProviderController::update strips those
   *  same fields server-side for provider role — defense in depth.
   */
  mode?: "admin" | "self";
}

export function ProviderDetailPage({ providerId, embedded = false, onBack, mode = "admin" }: ProviderDetailPageProps = {}) {
  const params = useParams<{ id: string }>();
  const id = providerId ?? params.id;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get("tab") as TabKey) || "overview";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Sync URL when tab changes so refresh / share-link works.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams);
    if (sp.get("tab") !== activeTab) {
      sp.set("tab", activeTab);
      setSearchParams(sp, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const loadProvider = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await providerService.getById(id);
    if (res.error || !res.data) {
      setError(res.error || "Provider not found.");
    } else {
      setProvider(res.data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { loadProvider(); }, [loadProvider]);

  if (loading) {
    return (
      <div className={embedded ? "flex items-center justify-center py-20" : "min-h-screen flex items-center justify-center bg-slate-50"}>
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className={embedded ? "flex items-center justify-center py-20 px-4" : "min-h-screen flex items-center justify-center bg-slate-50 px-4"}>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Couldn't load provider</h2>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <button
            onClick={() => (onBack ? onBack() : navigate("/practice"))}
            className="px-5 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
          >
            Back to Providers
          </button>
        </div>
      </div>
    );
  }

  const fullName = [provider.user?.firstName, provider.user?.lastName].filter(Boolean).join(" ")
    || (provider as unknown as { firstName?: string; lastName?: string }).firstName
    || "Provider";
  const credentials = (provider as unknown as { credentials?: string }).credentials || "";

  const handleBack = () => (onBack ? onBack() : navigate("/practice"));

  // When embedded, the parent (PracticePortal) provides the page chrome
  // (sidebar, top nav). We render only the header card + body, in the
  // parent's content column.
  const RootWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? <div>{children}</div> : <div className="min-h-screen bg-slate-50">{children}</div>;

  return (
    <RootWrapper>
      {/* Header */}
      <div className={embedded ? "bg-white rounded-t-2xl border border-b-0 border-slate-200" : "bg-white border-b border-slate-200"}>
        <div className={embedded ? "px-6 py-4" : "max-w-6xl mx-auto px-6 py-4"}>
          {mode !== "self" && (
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-3"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Providers
            </button>
          )}
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center text-white text-base font-bold shrink-0"
              style={{ background: "linear-gradient(135deg, #334e68, #243b53)" }}
            >
              {fullName.split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 truncate">
                {fullName}{credentials && `, ${credentials}`}
              </h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                {provider.user?.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{provider.user.email}</span>}
                {provider.npi && <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />NPI {provider.npi}</span>}
                {provider.teleHealthCapable && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Video className="w-3.5 h-3.5" />Telehealth
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6 -mb-px overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon;
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-2 px-3 py-2 text-[13px] font-medium border-b-2 transition-colors ${
                    isActive
                      ? "border-[#635bff] text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className={embedded ? "px-6 py-6 bg-white rounded-b-2xl border border-t-0 border-slate-200" : "max-w-6xl mx-auto px-6 py-8"}>
        {activeTab === "overview" && <OverviewTab provider={provider} />}
        {activeTab === "profile" && <ProfileTab provider={provider} onSaved={loadProvider} setToast={setToast} />}
        {activeTab === "schedule" && <ScheduleTab providerId={provider.id} setToast={setToast} />}
        {activeTab === "panel" && <PanelTab providerId={provider.id} />}
        {activeTab === "appointments" && <AppointmentsTab providerId={provider.id} />}
        {activeTab === "licensing" && <LicensingTab provider={provider} onSaved={loadProvider} setToast={setToast} />}
        {activeTab === "credentials" && <CredentialsTab provider={provider} setToast={setToast} mode={mode} />}
        {activeTab === "settings" && <SettingsTab provider={provider} onSaved={loadProvider} setToast={setToast} mode={mode} />}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </RootWrapper>
  );
}

// ─── Overview Tab ───────────────────────────────────────────────────────────

function OverviewTab({ provider }: { provider: Provider }) {
  const [panel, setPanel] = useState<PanelSummary | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [panelRes, apptRes] = await Promise.all([
        providerService.getPatientPanel(provider.id),
        providerService.getAppointments(provider.id),
      ]);
      if (cancelled) return;
      if (panelRes.data) setPanel(panelRes.data as PanelSummary);
      setAppts(unwrapAppointments(apptRes.data));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [provider.id]);

  const monthAppts = useMemo(() => {
    const now = new Date();
    return appts.filter(a => {
      const d = new Date(a.scheduledAt || "");
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [appts]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>;
  }

  const stats = [
    { label: "Total patients", value: panel?.totalPatients ?? 0, icon: UsersIcon },
    { label: "Active members", value: panel?.activeMembers ?? 0, icon: CheckCircle2 },
    { label: "Appointments this month", value: monthAppts, icon: Calendar },
    { label: "Engagement score", value: panel?.engagementMetrics?.averageEngagementScore?.toFixed(0) ?? "—", icon: Award },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="glass rounded-2xl border border-gray-200/50 p-5">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="glass rounded-2xl border border-gray-200/50 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Provider info</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <InfoRow label="Title" value={provider.title} />
          <InfoRow label="NPI" value={provider.npi} />
          <InfoRow label="License #" value={provider.licenseNumber} />
          <InfoRow label="License state" value={provider.licenseState} />
          <InfoRow label="DEA" value={provider.deaNumber} />
          <InfoRow label="Max daily patients" value={provider.maxDailyPatients?.toString()} />
          <InfoRow label="Accepting new patients" value={provider.acceptingNewPatients ? "Yes" : "No"} />
          <InfoRow label="Telehealth" value={provider.teleHealthCapable ? "Enabled" : "Disabled"} />
        </dl>
        {provider.bio && (
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">Bio</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{provider.bio}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value || "—"}</dd>
    </div>
  );
}

// ─── Profile Tab ────────────────────────────────────────────────────────────

interface ProfileTabProps {
  provider: Provider;
  onSaved: () => void;
  setToast: (t: { message: string; type: "success" | "error" } | null) => void;
}

// Common US tzs the picker exposes. Other IANA tzs can be entered via
// the freeform field below the dropdown.
const PROVIDER_TZ_OPTIONS: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Phoenix", label: "Arizona (no DST) (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska Time (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

function ProfileTab({ provider, onSaved, setToast }: ProfileTabProps) {
  const [form, setForm] = useState({
    firstName: provider.user?.firstName || "",
    lastName: provider.user?.lastName || "",
    email: provider.user?.email || "",
    phone: (provider as unknown as { phone?: string }).phone || provider.user?.phone || "",
    title: provider.title || "",
    credentials: (provider as unknown as { credentials?: string }).credentials || "",
    bio: provider.bio || "",
    npiNumber: provider.npi || "",
    languages: Array.isArray(provider.languages) ? provider.languages : [],
    timezone: provider.timezone || "",
  });
  const [saving, setSaving] = useState(false);
  const [npiLoading, setNpiLoading] = useState(false);
  const [languageInput, setLanguageInput] = useState("");

  const addLanguage = (raw: string) => {
    const lang = raw.trim();
    if (!lang) return;
    setForm(f => f.languages.includes(lang) ? f : { ...f, languages: [...f.languages, lang] });
    setLanguageInput("");
  };
  const removeLanguage = (lang: string) => {
    setForm(f => ({ ...f, languages: f.languages.filter(l => l !== lang) }));
  };

  const lookupNpi = async () => {
    if (!/^\d{10}$/.test(form.npiNumber)) {
      setToast({ message: "NPI must be exactly 10 digits.", type: "error" });
      return;
    }
    setNpiLoading(true);
    try {
      const res = await fetch(`https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${form.npiNumber}`);
      const data = await res.json();
      const result = data.results?.[0];
      if (!result) {
        setToast({ message: "NPI not found in registry.", type: "error" });
        return;
      }
      const basic = result.basic || {};
      setForm(f => ({
        ...f,
        firstName: f.firstName || basic.first_name || "",
        lastName: f.lastName || basic.last_name || "",
        credentials: f.credentials || (basic.credential || "").replace(/\./g, ""),
      }));
      setToast({ message: `Verified: ${basic.first_name} ${basic.last_name}`, type: "success" });
    } catch {
      setToast({ message: "NPI lookup failed.", type: "error" });
    }
    setNpiLoading(false);
  };

  const save = async () => {
    setSaving(true);
    const res = await providerService.update(provider.id, form);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
    } else {
      setToast({ message: "Profile saved.", type: "success" });
      onSaved();
    }
    setSaving(false);
  };

  return (
    <div className="glass rounded-2xl border border-gray-200/50 p-6 max-w-3xl">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Edit profile</h3>
      <p className="text-xs text-slate-500 mb-6">Update the provider's identity, credentials, and bio.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First name" value={form.firstName} onChange={v => setForm(f => ({ ...f, firstName: v }))} />
        <Field label="Last name" value={form.lastName} onChange={v => setForm(f => ({ ...f, lastName: v }))} />
        <Field label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
        <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
        <Field label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g. Senior Physician" />
        <Field label="Credentials" value={form.credentials} onChange={v => setForm(f => ({ ...f, credentials: v }))} placeholder="MD, DNP, NP..." />

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1.5">NPI</label>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.npiNumber}
              onChange={e => setForm(f => ({ ...f, npiNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
              placeholder="10-digit NPI"
              maxLength={10}
            />
            <button
              type="button"
              onClick={lookupNpi}
              disabled={form.npiNumber.length !== 10 || npiLoading}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {npiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Lookup
            </button>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Bio</label>
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
            rows={4}
            value={form.bio}
            onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            placeholder="Patient-facing professional bio"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Working timezone</label>
          <p className="text-xs text-slate-500 mb-2">
            Your weekly availability hours are interpreted in this zone. Patients in other zones see slots in their local time with this one shown alongside.
          </p>
          <select
            value={PROVIDER_TZ_OPTIONS.some(o => o.value === form.timezone) ? form.timezone : (form.timezone ? "__custom__" : "")}
            onChange={e => {
              const v = e.target.value;
              if (v === "__custom__") return;
              setForm(f => ({ ...f, timezone: v }));
            }}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Use practice default</option>
            {PROVIDER_TZ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            {form.timezone && !PROVIDER_TZ_OPTIONS.some(o => o.value === form.timezone) && (
              <option value="__custom__">{form.timezone} (custom)</option>
            )}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Languages spoken</label>
          <p className="text-xs text-slate-500 mb-2">Patients see these on the booking widget. Type a language and press Enter or comma.</p>
          {form.languages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.languages.map(lang => (
                <span
                  key={lang}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                >
                  {lang}
                  <button
                    type="button"
                    onClick={() => removeLanguage(lang)}
                    className="text-slate-400 hover:text-slate-700"
                    aria-label={`Remove ${lang}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={languageInput}
            onChange={e => {
              const v = e.target.value;
              // Comma submits — handy for paste-list workflows.
              if (v.endsWith(",")) {
                addLanguage(v.slice(0, -1));
              } else {
                setLanguageInput(v);
              }
            }}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLanguage(languageInput);
              } else if (e.key === "Backspace" && !languageInput && form.languages.length > 0) {
                removeLanguage(form.languages[form.languages.length - 1]);
              }
            }}
            placeholder="e.g. English, Spanish, Haitian Creole"
          />
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save changes
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1.5">{label}</label>
      <input
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

// ─── Schedule Tab ───────────────────────────────────────────────────────────

interface DaySchedule {
  isWorking: boolean;
  startTime: string;
  endTime: string;
}

interface ScheduleTabProps {
  providerId: string;
  setToast: (t: { message: string; type: "success" | "error" } | null) => void;
}

function ScheduleTab({ providerId, setToast }: ScheduleTabProps) {
  const [schedule, setSchedule] = useState<DaySchedule[]>(
    Array.from({ length: 7 }, () => ({ isWorking: false, startTime: "09:00", endTime: "17:00" }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await providerService.getAvailability(providerId);
      if (cancelled) return;
      const slots = res.data || [];
      setSchedule(prev => prev.map((day, i) => {
        const slot = slots.find(s => s.dayOfWeek === i);
        if (!slot) return day;
        return {
          isWorking: slot.isAvailable,
          startTime: (slot.startTime || "09:00").slice(0, 5),
          endTime: (slot.endTime || "17:00").slice(0, 5),
        };
      }));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [providerId]);

  const updateDay = (idx: number, patch: Partial<DaySchedule>) => {
    setSchedule(s => s.map((d, i) => i === idx ? { ...d, ...patch } : d));
  };

  const save = async () => {
    setSaving(true);
    const slots = schedule
      .map((d, i) => ({
        dayOfWeek: i as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        startTime: d.startTime,
        endTime: d.endTime,
        isAvailable: d.isWorking,
      }))
      .filter(s => s.isAvailable);
    const res = await providerService.setAvailability(providerId, slots as Partial<ProviderAvailability>[]);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
    } else {
      setToast({ message: "Schedule saved.", type: "success" });
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>;
  }

  return (
    <div className="glass rounded-2xl border border-gray-200/50 p-6 max-w-3xl">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Weekly schedule</h3>
      <p className="text-xs text-slate-500 mb-6">Set the hours this provider is available for appointments. Toggle a day off to mark it unavailable.</p>

      <div className="space-y-3">
        {schedule.map((day, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-b-0">
            <label className="flex items-center gap-2 w-24 shrink-0">
              <input
                type="checkbox"
                checked={day.isWorking}
                onChange={e => updateDay(i, { isWorking: e.target.checked })}
                className="w-4 h-4 rounded accent-teal-600"
              />
              <span className="text-sm font-medium text-slate-700">{DAY_NAMES[i]}</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                disabled={!day.isWorking}
                value={day.startTime}
                onChange={e => updateDay(i, { startTime: e.target.value })}
                className="border border-slate-200 rounded px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
              <span className="text-slate-400 text-sm">to</span>
              <input
                type="time"
                disabled={!day.isWorking}
                value={day.endTime}
                onChange={e => updateDay(i, { endTime: e.target.value })}
                className="border border-slate-200 rounded px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-6">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save schedule
        </button>
      </div>
    </div>
  );
}

// ─── Panel Tab ──────────────────────────────────────────────────────────────

function PanelTab({ providerId }: { providerId: string }) {
  const navigate = useNavigate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assigned, setAssigned] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [recent, setRecent] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await providerService.panelMembers(providerId);
    if (res.data) {
      setAssigned(res.data.assigned ?? []);
      setRecent(res.data.recent ?? []);
    }
    setLoading(false);
  }, [providerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await reload(); } catch { /* ignore */ }
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [reload]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchesSearch = useCallback((p: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${p.firstName ?? p.first_name ?? ""} ${p.lastName ?? p.last_name ?? ""}`.toLowerCase();
    const email = String(p.email ?? "").toLowerCase();
    return name.includes(q) || email.includes(q);
  }, [search]);

  const filteredAssigned = useMemo(() => assigned.filter(matchesSearch), [assigned, matchesSearch]);
  const filteredRecent = useMemo(() => recent.filter(matchesSearch), [recent, matchesSearch]);

  const handleAssign = async (patientId: string) => {
    setActionLoading(patientId);
    try {
      await providerService.assignToPanel(providerId, patientId);
      await reload();
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const handleUnassign = async (patientId: string) => {
    setActionLoading(patientId);
    try {
      await providerService.unassignFromPanel(providerId, patientId);
      await reload();
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderRow = (p: any, isAssigned: boolean) => {
    const name = `${p.firstName ?? p.first_name ?? ""} ${p.lastName ?? p.last_name ?? ""}`.trim() || "Unknown";
    const email = p.email || "—";
    const isActive = p.isActive !== false && p.is_active !== false;
    return (
      <tr key={p.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
        <td className="py-3 pr-4 font-medium text-slate-800">{name}</td>
        <td className="py-3 pr-4 text-slate-600">{email}</td>
        <td className="py-3 pr-4">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}>{isActive ? "active" : "inactive"}</span>
        </td>
        <td className="py-3 text-right">
          <div className="flex items-center justify-end gap-3">
            {isAssigned ? (
              <button
                onClick={() => handleUnassign(p.id)}
                disabled={actionLoading === p.id}
                className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {actionLoading === p.id ? "Removing…" : "Remove"}
              </button>
            ) : (
              <button
                onClick={() => handleAssign(p.id)}
                disabled={actionLoading === p.id}
                className="text-xs font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50"
              >
                {actionLoading === p.id ? "Adding…" : "Add to panel"}
              </button>
            )}
            <button
              onClick={() => navigate(`/practice?patient=${p.id}`)}
              className="text-teal-600 hover:text-teal-700 text-sm font-medium"
            >
              View
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Patient panel</h3>
          <p className="text-xs text-slate-500">
            {assigned.length} assigned · {recent.length} recent (last 12 months)
          </p>
        </div>
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Assigned panel */}
      <div className="glass rounded-2xl border border-gray-200/50 p-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Assigned to this provider
        </h4>
        {filteredAssigned.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500">
            {assigned.length === 0
              ? "No patients formally on this provider's panel yet. Add one from the Recent list below."
              : `No matches for "${search}".`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Email</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredAssigned.map((p) => renderRow(p, true))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent (appointment history but not assigned) */}
      {recent.length > 0 && (
        <div className="glass rounded-2xl border border-gray-200/50 p-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Recently seen by this provider
          </h4>
          <p className="text-xs text-slate-400 mb-3">
            Patients with appointments in the last 12 months who aren't formally assigned. Click "Add to panel" to formalize the relationship.
          </p>
          {filteredRecent.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-500">
              No matches for "{search}".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 pr-4">Email</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecent.map((p) => renderRow(p, false))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Appointments Tab ───────────────────────────────────────────────────────

function AppointmentsTab({ providerId }: { providerId: string }) {
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await providerService.getAppointments(providerId);
      if (cancelled) return;
      setAppts(unwrapAppointments(res.data));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [providerId]);

  const partitioned = useMemo(() => {
    const now = Date.now();
    const upcoming: Appointment[] = [];
    const past: Appointment[] = [];
    for (const a of appts) {
      const when = new Date(a.scheduledAt || "").getTime();
      if (when >= now) upcoming.push(a); else past.push(a);
    }
    upcoming.sort((a, b) => new Date(a.scheduledAt || "").getTime() - new Date(b.scheduledAt || "").getTime());
    past.sort((a, b) => new Date(b.scheduledAt || "").getTime() - new Date(a.scheduledAt || "").getTime());
    return { upcoming, past };
  }, [appts]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>;
  }

  const list = view === "upcoming" ? partitioned.upcoming : partitioned.past;

  return (
    <div className="glass rounded-2xl border border-gray-200/50 p-6">
      <div className="flex items-center gap-1 mb-6 border-b border-slate-200">
        <button
          onClick={() => setView("upcoming")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            view === "upcoming" ? "border-teal-500 text-teal-700" : "border-transparent text-slate-500"
          }`}
        >
          Upcoming ({partitioned.upcoming.length})
        </button>
        <button
          onClick={() => setView("past")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            view === "past" ? "border-teal-500 text-teal-700" : "border-transparent text-slate-500"
          }`}
        >
          Past ({partitioned.past.length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-500">
          No {view} appointments.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(a => {
            const when = new Date(a.scheduledAt || "");
            const apptWithRel = a as unknown as { patient?: { firstName?: string; lastName?: string }; appointmentType?: { name?: string } };
            return (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {when.toLocaleDateString()} · {when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {apptWithRel.patient ? `${apptWithRel.patient.firstName ?? ""} ${apptWithRel.patient.lastName ?? ""}`.trim() : "—"}
                    {apptWithRel.appointmentType?.name ? ` · ${apptWithRel.appointmentType.name}` : ""}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  a.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                  a.status === "canceled" || a.status === "no_show" ? "bg-red-50 text-red-700" :
                  "bg-slate-100 text-slate-600"
                }`}>
                  {a.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Licensing Tab ──────────────────────────────────────────────────────────

interface LicensingTabProps {
  provider: Provider;
  onSaved: () => void;
  setToast: (t: { message: string; type: "success" | "error" } | null) => void;
}

function LicensingTab({ provider, onSaved, setToast }: LicensingTabProps) {
  const [form, setForm] = useState({
    licenseNumber: provider.licenseNumber || "",
    licenseState: provider.licenseState || "",
    deaNumber: provider.deaNumber || "",
    licensedStates: Array.isArray(provider.licensedStates) ? provider.licensedStates : [],
  });
  const [saving, setSaving] = useState(false);

  // Toggle a state in the multi-state list. Adding the primary
  // licenseState to the list automatically when it's set ensures the
  // primary state always shows in the chip set; we don't enforce the
  // inverse (you can have a primary state without listing it as
  // secondary).
  const toggleState = (s: string) => {
    setForm(f => ({
      ...f,
      licensedStates: f.licensedStates.includes(s)
        ? f.licensedStates.filter(x => x !== s)
        : [...f.licensedStates, s].sort(),
    }));
  };

  const save = async () => {
    setSaving(true);
    const res = await providerService.update(provider.id, {
      licenseNumber: form.licenseNumber,
      licenseState: form.licenseState,
      // licensedStates maps to licensed_states JSONB on the backend.
      // toProviderApiPayload doesn't translate it specially — we
      // include the primary licenseState in the array so the column
      // is self-consistent even if a downstream feature only reads
      // licensed_states.
      licensedStates: form.licenseState && !form.licensedStates.includes(form.licenseState)
        ? [...form.licensedStates, form.licenseState].sort()
        : form.licensedStates,
    });
    if (res.error) {
      setToast({ message: res.error, type: "error" });
    } else {
      setToast({ message: "Licensing saved.", type: "success" });
      onSaved();
    }
    setSaving(false);
  };

  return (
    <div className="glass rounded-2xl border border-gray-200/50 p-6 max-w-2xl">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Licensing & DEA</h3>
      <p className="text-xs text-slate-500 mb-6">State medical license and DEA registration.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="License number" value={form.licenseNumber} onChange={v => setForm(f => ({ ...f, licenseNumber: v }))} />
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Primary license state</label>
          <select
            value={form.licenseState}
            onChange={e => setForm(f => ({ ...f, licenseState: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Select state</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Field label="DEA number (read-only — contact support to update)" value={form.deaNumber} onChange={() => {}} />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1.5">All licensed states</label>
          <p className="text-xs text-slate-500 mb-2">
            Click a state to toggle. Telehealth bookings into states you're not licensed in will fail their compliance check.
          </p>
          {form.licensedStates.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {form.licensedStates.map(s => (
                <button
                  key={s}
                  onClick={() => toggleState(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100"
                  type="button"
                >
                  {s}
                  <span aria-hidden className="text-teal-500 ml-0.5">×</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-8 sm:grid-cols-10 gap-1">
            {US_STATES.map(s => {
              const selected = form.licensedStates.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleState(s)}
                  className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                    selected
                      ? "bg-teal-600 text-white"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save licensing
        </button>
      </div>
    </div>
  );
}

// ─── Settings Tab ───────────────────────────────────────────────────────────

interface SettingsTabProps {
  provider: Provider;
  onSaved: () => void;
  setToast: (t: { message: string; type: "success" | "error" } | null) => void;
  mode?: "admin" | "self";
}

function SettingsTab({ provider, onSaved, setToast, mode = "admin" }: SettingsTabProps) {
  const isSelf = mode === "self";
  const initialFee = (provider.consultationFee !== undefined && provider.consultationFee !== null)
    ? String(provider.consultationFee)
    : "";
  const [form, setForm] = useState({
    panelCapacity: provider.maxDailyPatients || 500,
    acceptsNewPatients: provider.acceptingNewPatients ?? true,
    telehealthEnabled: provider.teleHealthCapable ?? false,
    panelStatus: (provider as unknown as { panelStatus?: string }).panelStatus || "open",
    consultationFee: initialFee,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    // In self mode the provider can only flip "Accepts new patients" —
    // panel capacity, panel status, the telehealth flag, and the
    // consultation fee are practice-policy controls. Don't even
    // include them in the payload (backend strips them anyway, but
    // this keeps the wire shape honest about what was edited).
    const payload = isSelf
      ? { acceptsNewPatients: form.acceptsNewPatients }
      : {
          panelCapacity: form.panelCapacity,
          acceptsNewPatients: form.acceptsNewPatients,
          telehealthEnabled: form.telehealthEnabled,
          panelStatus: form.panelStatus,
          // Empty string clears the fee (sends null); a number sends
          // the parsed value. Keeps the column nullable per the
          // migration default.
          consultationFee: form.consultationFee === "" ? null : parseFloat(form.consultationFee),
        };
    const res = await providerService.update(provider.id, payload);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
    } else {
      setToast({ message: "Settings saved.", type: "success" });
      onSaved();
    }
    setSaving(false);
  };

  return (
    <>
    <div className="glass rounded-2xl border border-gray-200/50 p-6 max-w-2xl">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">{isSelf ? "Intake preferences" : "Practice settings"}</h3>
      <p className="text-xs text-slate-500 mb-6">
        {isSelf
          ? "Toggle whether you're currently accepting new patients. Panel capacity and telehealth availability are managed by your practice."
          : "Panel size, telehealth, and intake controls."}
      </p>

      <div className="space-y-5">
        {!isSelf && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Panel capacity</label>
              <input
                type="number"
                min={0}
                value={form.panelCapacity}
                onChange={e => setForm(f => ({ ...f, panelCapacity: parseInt(e.target.value) || 0 }))}
                className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">Maximum number of active patients on this provider's panel.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Panel status</label>
              <select
                value={form.panelStatus}
                onChange={e => setForm(f => ({ ...f, panelStatus: e.target.value }))}
                className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="open">Open — accepting new patients</option>
                <option value="limited">Limited — selectively accepting</option>
                <option value="closed">Closed — not accepting</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Consultation fee (USD)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.consultationFee}
                onChange={e => setForm(f => ({ ...f, consultationFee: e.target.value }))}
                className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. 150.00"
              />
              <p className="text-xs text-slate-500 mt-1">Default fee for visits without a per-type override. Leave blank for no default.</p>
            </div>
          </>
        )}

        {isSelf && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Panel capacity</span>
              <span className="font-medium text-slate-700">{form.panelCapacity}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Panel status</span>
              <span className="font-medium text-slate-700">{form.panelStatus}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Telehealth</span>
              <span className="font-medium text-slate-700">{form.telehealthEnabled ? "Enabled" : "Disabled"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Consultation fee</span>
              <span className="font-medium text-slate-700">
                {form.consultationFee ? `$${parseFloat(form.consultationFee).toFixed(2)}` : "—"}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <input
            type="checkbox"
            id="acceptsNew"
            checked={form.acceptsNewPatients}
            onChange={e => setForm(f => ({ ...f, acceptsNewPatients: e.target.checked }))}
            className="w-4 h-4 rounded accent-teal-600"
          />
          <label htmlFor="acceptsNew" className="text-sm text-slate-700">Accepts new patients</label>
        </div>

        {!isSelf && (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="telehealth"
              checked={form.telehealthEnabled}
              onChange={e => setForm(f => ({ ...f, telehealthEnabled: e.target.checked }))}
              className="w-4 h-4 rounded accent-teal-600"
            />
            <label htmlFor="telehealth" className="text-sm text-slate-700">Telehealth enabled</label>
          </div>
        )}
      </div>

      <div className="flex justify-end mt-6">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save settings
        </button>
      </div>
      </div>
      <CalendarSyncCard provider={provider} mode={mode} setToast={setToast} onSaved={onSaved} />
    </>
  );
}

// ─── Calendar Sync Card ─────────────────────────────────────────────────────
// Shown beneath the main Settings card. iCal feed is per-provider — the
// backend's /calendar/ical/generate-token mints a token for the current
// user, so admins viewing someone else's profile see a stub instead of
// being able to mint a token they shouldn't have. Google Calendar OAuth
// is a backend stub today (CalendarController::googleRedirect returns
// "not yet configured"); the card surfaces that state honestly so the
// user knows what works.

interface CalendarSyncCardProps {
  provider: Provider;
  mode: "admin" | "self";
  setToast: (t: { message: string; type: "success" | "error" } | null) => void;
  onSaved: () => void;
}

function CalendarSyncCard({ provider, mode, setToast, onSaved }: CalendarSyncCardProps) {
  const isSelf = mode === "self";
  const [token, setToken] = useState<string | null>(provider.icalFeedToken ?? null);
  const [generating, setGenerating] = useState(false);

  // The feed URL the backend would expose. Cheaper to construct
  // client-side than to round-trip every render. The host should
  // match the backend (api.membermd.io / Railway), so read from the
  // configured API base URL when available.
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
  const feedUrl = token ? `${apiBase.replace(/\/$/, "")}/calendar/ical/${token}` : null;

  const generate = async () => {
    setGenerating(true);
    const res = await calendarService.generateIcalToken();
    if (res.error || !res.data) {
      setToast({ message: res.error || "Couldn't generate calendar feed.", type: "error" });
    } else {
      setToken(res.data.token);
      setToast({ message: "Calendar feed ready.", type: "success" });
      onSaved();
    }
    setGenerating(false);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ message: "Copied to clipboard.", type: "success" });
    } catch {
      setToast({ message: "Couldn't copy. Long-press the URL to select it.", type: "error" });
    }
  };

  return (
    <div className="glass rounded-2xl border border-gray-200/50 p-6 max-w-2xl mt-6">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Calendar sync</h3>
      <p className="text-xs text-slate-500 mb-6">
        Subscribe in Google Calendar, Apple Calendar, or Outlook to see appointments alongside personal events.
      </p>

      {/* iCal feed — only the logged-in provider can mint their own
          token. Admins on someone else's page see an explainer instead
          of a button that would silently fail. */}
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-start gap-3 mb-3">
            <Calendar className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">iCal subscribe URL</p>
              <p className="text-xs text-slate-500 mt-0.5">Read-only. Anyone with this URL can see the appointment list — treat it as a secret.</p>
            </div>
          </div>

          {!isSelf && !feedUrl && (
            <p className="text-xs text-slate-500 italic">
              The provider can mint their own iCal feed from their My Profile → Settings tab.
            </p>
          )}

          {isSelf && !feedUrl && (
            <button
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Generate feed URL
            </button>
          )}

          {feedUrl && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={feedUrl}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 bg-slate-50"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => copy(feedUrl)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  type="button"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
              {isSelf && (
                <button
                  onClick={generate}
                  disabled={generating}
                  className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1.5"
                  type="button"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate (revokes the old URL)
                </button>
              )}
            </div>
          )}
        </div>

        {/* Google Calendar — backend OAuth is a placeholder today. We
            surface that state honestly instead of pretending the
            button works. */}
        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">Google Calendar (coming soon)</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Two-way sync via Google OAuth is on the roadmap. For now, use the iCal subscribe URL above —
                paste it into Google Calendar's "Subscribe to calendar" by URL. Apple Calendar and Outlook accept the same URL.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Credentials Tab ────────────────────────────────────────────────────────
// Lifecycle view of provider_credentials rows. Backend exposes a full
// CRUD apiResource at /provider-credentials plus auto-status derivation
// from expiration_date. provider_id on this table is actually the
// User.id (FK targets users.id per the migration), so we filter and
// create using provider.userId, not provider.id.

const CREDENTIAL_TYPES: { value: string; label: string }[] = [
  { value: "medical_license", label: "Medical License" },
  { value: "dea", label: "DEA Registration" },
  { value: "board_cert", label: "Board Certification" },
  { value: "malpractice", label: "Malpractice Insurance" },
  { value: "cpr", label: "CPR / BLS / ACLS" },
  { value: "npi", label: "NPI" },
  { value: "other", label: "Other" },
];

interface CredentialsTabProps {
  provider: Provider;
  setToast: (t: { message: string; type: "success" | "error" } | null) => void;
  mode: "admin" | "self";
}

function CredentialsTab({ provider, setToast, mode }: CredentialsTabProps) {
  // Filter by the User id — provider_credentials.provider_id targets
  // users.id (see migration 2026_03_20_000007).
  const ownerUserId = provider.userId;
  const isSelf = mode === "self";

  type Credential = ProviderCredentialDTO;
  const [rows, setRows] = useState<Credential[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Credential> | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Credential | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await credentialService.list({ providerId: ownerUserId });
    if (res.error) {
      setToast({ message: res.error, type: "error" });
      setRows([]);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
      setRows(list as Credential[]);
    }
    setLoading(false);
  }, [ownerUserId, setToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);

  const openNew = () => setEditing({
    type: "medical_license",
    name: "",
    credentialNumber: "",
    issuer: "",
    issuedDate: "",
    expirationDate: "",
    documentUrl: "",
    notes: "",
  });

  const openEdit = (c: Credential) => setEditing({ ...c });

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.type || !editing.name) {
      setToast({ message: "Type and name are required.", type: "error" });
      return;
    }
    setSaving(true);
    const payload: Partial<Credential> & { providerId?: string } = {
      type: editing.type,
      name: editing.name,
      credentialNumber: editing.credentialNumber || null,
      issuer: editing.issuer || null,
      issuedDate: editing.issuedDate || null,
      expirationDate: editing.expirationDate || null,
      documentUrl: editing.documentUrl || null,
      notes: editing.notes || null,
    };
    let res;
    if (editing.id) {
      res = await credentialService.update(editing.id, payload);
    } else {
      // The backend's StoreRequest expects provider_id (snake) — apiFetch
      // camelToSnake transforms it in flight, so providerId on the
      // wire becomes provider_id at the controller.
      res = await credentialService.create({ ...payload, providerId: ownerUserId });
    }
    if (res.error) {
      setToast({ message: res.error, type: "error" });
    } else {
      setToast({ message: editing.id ? "Credential updated." : "Credential added.", type: "success" });
      setEditing(null);
      await reload();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete?.id) return;
    const res = await credentialService.delete(confirmDelete.id);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
    } else {
      setToast({ message: "Credential removed.", type: "success" });
      setConfirmDelete(null);
      await reload();
    }
  };

  // Derive a "now" status pill if backend hasn't set one (or to
  // explain why it picked the value it did). 30 days = expiring_soon
  // matches ProviderCredentialController::calculateStatus.
  const statusOf = (c: Credential): { label: string; color: string; bg: string } => {
    const s = c.status;
    if (s === "expired") return { label: "Expired", color: "#b91c1c", bg: "#fee2e2" };
    if (s === "expiring_soon") return { label: "Expiring soon", color: "#b45309", bg: "#fef3c7" };
    if (s === "pending") return { label: "Pending", color: "#1d4ed8", bg: "#dbeafe" };
    if (s === "revoked") return { label: "Revoked", color: "#374151", bg: "#e5e7eb" };
    return { label: "Active", color: "#047857", bg: "#d1fae5" };
  };

  const formatDate = (d?: string | null) => {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Credentials</h3>
          <p className="text-xs text-slate-500">
            Licenses, DEA, board certs, malpractice, and other expiring credentials. Status is derived from the expiration date.
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
        >
          <Plus className="w-3.5 h-3.5" />
          Add credential
        </button>
      </div>

      <div className="glass rounded-2xl border border-gray-200/50 p-6">
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        )}

        {!loading && rows && rows.length === 0 && (
          <div className="text-center py-10">
            <FileCheck2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-700 font-medium">No credentials on file yet</p>
            <p className="text-xs text-slate-500 mt-1">
              {isSelf
                ? "Add your medical license, DEA registration, malpractice policy, and any board certifications you hold."
                : "Click \"Add credential\" to record this provider's licenses, DEA, and board certifications."}
            </p>
          </div>
        )}

        {!loading && rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Number</th>
                  <th className="pb-3 pr-4">Expires</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const s = statusOf(c);
                  const typeLabel = CREDENTIAL_TYPES.find(t => t.value === c.type)?.label || c.type;
                  return (
                    <tr key={c.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                      <td className="py-3 pr-4 text-slate-600">{typeLabel}</td>
                      <td className="py-3 pr-4 font-medium text-slate-800">
                        {c.name}
                        {c.issuer && <div className="text-xs text-slate-400">{c.issuer}</div>}
                      </td>
                      <td className="py-3 pr-4 text-slate-600 font-mono text-xs">{c.credentialNumber || "—"}</td>
                      <td className="py-3 pr-4 text-slate-600">{formatDate(c.expirationDate)}</td>
                      <td className="py-3 pr-4">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ color: s.color, backgroundColor: s.bg }}
                        >
                          {s.label}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {c.documentUrl && (
                            <a
                              href={c.documentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-teal-600 hover:text-teal-700 inline-flex items-center gap-1 text-xs"
                            >
                              <Upload className="w-3 h-3" />
                              Document
                            </a>
                          )}
                          <button
                            onClick={() => openEdit(c)}
                            className="text-slate-500 hover:text-slate-700"
                            aria-label="Edit"
                            type="button"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(c)}
                            className="text-red-500 hover:text-red-700"
                            aria-label="Delete"
                            type="button"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{editing.id ? "Edit credential" : "Add credential"}</h3>
              <button onClick={() => setEditing(null)} className="p-1 rounded hover:bg-slate-100 text-slate-400" aria-label="Close" type="button">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Type *</label>
                <select
                  value={editing.type || "medical_license"}
                  onChange={e => setEditing(s => s ? { ...s, type: e.target.value } : s)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {CREDENTIAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <Field label="Name *" value={editing.name || ""} onChange={v => setEditing(s => s ? { ...s, name: v } : s)} placeholder="e.g. New York State Medical License" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Credential number" value={editing.credentialNumber || ""} onChange={v => setEditing(s => s ? { ...s, credentialNumber: v } : s)} placeholder="License / cert number" />
                <Field label="Issuer" value={editing.issuer || ""} onChange={v => setEditing(s => s ? { ...s, issuer: v } : s)} placeholder="e.g. NY State Department of Health" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Issued date</label>
                  <input
                    type="date"
                    value={editing.issuedDate || ""}
                    onChange={e => setEditing(s => s ? { ...s, issuedDate: e.target.value } : s)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Expiration date</label>
                  <input
                    type="date"
                    value={editing.expirationDate || ""}
                    onChange={e => setEditing(s => s ? { ...s, expirationDate: e.target.value } : s)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <Field
                label="Document URL"
                value={editing.documentUrl || ""}
                onChange={v => setEditing(s => s ? { ...s, documentUrl: v } : s)}
                placeholder="https://… (Drive, Dropbox, S3, or any sharable link)"
              />
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Notes</label>
                <textarea
                  rows={3}
                  value={editing.notes || ""}
                  onChange={e => setEditing(s => s ? { ...s, notes: e.target.value } : s)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
                  placeholder="Internal notes — restrictions, scope, etc."
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50" type="button">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 inline-flex items-center gap-2" type="button">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing.id ? "Save changes" : "Add credential"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-slate-900 mb-1">Remove credential?</h3>
            <p className="text-sm text-slate-500 mb-4">
              This deletes <span className="font-medium text-slate-800">{confirmDelete.name}</span> permanently. To
              record that it was retired or replaced, edit it and set the status instead.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100" type="button">
                Cancel
              </button>
              <button onClick={handleDelete} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700" type="button">
                Yes, remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
