// ===== Provider Detail Page =====
// Full provider management surface for practice admins.
// Tabs: Overview, Profile, Schedule, Panel, Appointments, Licensing, Settings.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, User as UserIcon, Calendar, Users as UsersIcon, Clock, Award,
  Settings as SettingsIcon, Loader2, Search, Save, Video, Mail, Hash,
  CheckCircle2, AlertTriangle,
} from "lucide-react";
import { providerService, patientService } from "../../lib/api";
import type { Provider, ProviderAvailability, Patient, Appointment } from "../../types";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA",
  "WV","WI","WY",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type TabKey = "overview" | "profile" | "schedule" | "panel" | "appointments" | "licensing" | "settings";

const TABS: { key: TabKey; label: string; icon: typeof UserIcon }[] = [
  { key: "overview", label: "Overview", icon: UserIcon },
  { key: "profile", label: "Profile", icon: UserIcon },
  { key: "schedule", label: "Schedule", icon: Calendar },
  { key: "panel", label: "Panel", icon: UsersIcon },
  { key: "appointments", label: "Appointments", icon: Clock },
  { key: "licensing", label: "Licensing", icon: Award },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

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

export function ProviderDetailPage() {
  const { id } = useParams<{ id: string }>();
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Couldn't load provider</h2>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <button
            onClick={() => navigate("/practice")}
            className="px-5 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
          >
            Back to Practice
          </button>
        </div>
      </div>
    );
  }

  const fullName = [provider.user?.firstName, provider.user?.lastName].filter(Boolean).join(" ")
    || (provider as unknown as { firstName?: string; lastName?: string }).firstName
    || "Provider";
  const credentials = (provider as unknown as { credentials?: string }).credentials || "";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <button
            onClick={() => navigate("/practice")}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Practice
          </button>
          <div className="flex items-start gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
              style={{ backgroundColor: "#334e68" }}
            >
              {fullName.split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-slate-900 truncate">
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
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? "border-teal-500 text-teal-700"
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
      <div className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === "overview" && <OverviewTab provider={provider} />}
        {activeTab === "profile" && <ProfileTab provider={provider} onSaved={loadProvider} setToast={setToast} />}
        {activeTab === "schedule" && <ScheduleTab providerId={provider.id} setToast={setToast} />}
        {activeTab === "panel" && <PanelTab providerId={provider.id} />}
        {activeTab === "appointments" && <AppointmentsTab providerId={provider.id} />}
        {activeTab === "licensing" && <LicensingTab provider={provider} onSaved={loadProvider} setToast={setToast} />}
        {activeTab === "settings" && <SettingsTab provider={provider} onSaved={loadProvider} setToast={setToast} />}
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
    </div>
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
      if (apptRes.data) setAppts(apptRes.data);
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
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
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
  });
  const [saving, setSaving] = useState(false);
  const [npiLoading, setNpiLoading] = useState(false);

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
    <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-3xl">
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
    <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-3xl">
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
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Use the standard patient list endpoint and filter by providerId
      // client-side; the backend's analytics panel endpoint returns
      // aggregates, not the raw patient list.
      const res = await patientService.list();
      if (cancelled) return;
      const list = (res.data || []).filter(p =>
        p.primaryProviderId === providerId
      );
      setPatients(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [providerId]);

  const filtered = useMemo(() => {
    if (!search) return patients;
    const q = search.toLowerCase();
    return patients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q)
    );
  }, [patients, search]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Patient panel</h3>
          <p className="text-xs text-slate-500">{patients.length} patients assigned to this provider</p>
        </div>
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-500">
          {patients.length === 0 ? "No patients on this provider's panel yet." : `No matches for "${search}".`}
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
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                  <td className="py-3 pr-4 font-medium text-slate-800">{p.firstName} {p.lastName}</td>
                  <td className="py-3 pr-4 text-slate-600">{p.email || "—"}</td>
                  <td className="py-3 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}>{p.status}</span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => navigate(`/practice?patient=${p.id}`)}
                      className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      setAppts(res.data || []);
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
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
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
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await providerService.update(provider.id, {
      licenseNumber: form.licenseNumber,
      licenseState: form.licenseState,
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
    <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-2xl">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Licensing & DEA</h3>
      <p className="text-xs text-slate-500 mb-6">State medical license and DEA registration.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="License number" value={form.licenseNumber} onChange={v => setForm(f => ({ ...f, licenseNumber: v }))} />
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">License state</label>
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
}

function SettingsTab({ provider, onSaved, setToast }: SettingsTabProps) {
  const [form, setForm] = useState({
    panelCapacity: provider.maxDailyPatients || 500,
    acceptsNewPatients: provider.acceptingNewPatients ?? true,
    telehealthEnabled: provider.teleHealthCapable ?? false,
    panelStatus: (provider as unknown as { panelStatus?: string }).panelStatus || "open",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await providerService.update(provider.id, {
      panelCapacity: form.panelCapacity,
      acceptsNewPatients: form.acceptsNewPatients,
      telehealthEnabled: form.telehealthEnabled,
      panelStatus: form.panelStatus,
    });
    if (res.error) {
      setToast({ message: res.error, type: "error" });
    } else {
      setToast({ message: "Settings saved.", type: "success" });
      onSaved();
    }
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-2xl">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Practice settings</h3>
      <p className="text-xs text-slate-500 mb-6">Panel size, telehealth, and intake controls.</p>

      <div className="space-y-5">
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
  );
}
