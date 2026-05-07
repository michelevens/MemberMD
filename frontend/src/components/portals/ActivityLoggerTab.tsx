// ===== Activity Logger Tab =====
// Log off-platform activities: phone calls, texts, home visits, CCM/RPM time, etc.
// Features: quick log form, timer mode for CCM/RPM, recent activities table

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../../lib/api";
import {
  Search,
  Play,
  Square,
  Clock,
  ClipboardList,
  Phone,
  MessageSquare,
  Home,
  Stethoscope,
  BookOpen,
  Pill,
  Activity,
  Eye,
  Filter,
  X,
  ChevronDown,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PatientSearchResult {
  id: string;
  name: string;
  email?: string | null;
  planName?: string;
}

interface Entitlement {
  id: string;
  label: string;
  remaining: number;
}

interface ActivityRecord {
  id: string;
  patientId: string;
  patientName: string;
  activityType: string;
  durationMinutes: number | null;
  notes: string;
  entitlementDeducted: string | null;
  createdAt: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Activity Type Config ────────────────────────────────────────────────────

const ACTIVITY_TYPES = [
  { value: "phone_call", label: "Phone Call", icon: Phone, category: "communication" },
  { value: "text_message", label: "Text Message", icon: MessageSquare, category: "communication" },
  { value: "after_hours_call", label: "After Hours Call", icon: Phone, category: "communication" },
  { value: "home_visit", label: "Home Visit", icon: Home, category: "clinical" },
  { value: "care_coordination", label: "Care Coordination", icon: Stethoscope, category: "clinical" },
  { value: "referral_call", label: "Referral Call", icon: Phone, category: "clinical" },
  { value: "education", label: "Education", icon: BookOpen, category: "clinical" },
  { value: "medication_dispensed", label: "Medication Dispensed", icon: Pill, category: "clinical" },
  { value: "ccm_time", label: "CCM Time", icon: Clock, category: "chronic" },
  { value: "rpm_review", label: "RPM Review", icon: Activity, category: "chronic" },
  { value: "other", label: "Other", icon: ClipboardList, category: "other" },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  communication: { bg: "#e0ecff", text: "#1e40af" },
  clinical: { bg: "#e6f7f2", text: "#147d64" },
  chronic: { bg: "#f3e8ff", text: "#7c3aed" },
  other: { bg: "#f1f5f9", text: "#64748b" },
};

// ─── Badge ───────────────────────────────────────────────────────────────────

function ActivityBadge({ type }: { type: string }) {
  const config = ACTIVITY_TYPES.find((a) => a.value === type);
  const category = config?.category || "other";
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {config?.icon && <config.icon className="w-3 h-3" />}
      {config?.label || type}
    </span>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="glass rounded-xl p-5 hover-lift">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

// ─── Dialog Overlay ──────────────────────────────────────────────────────────

// ─── Timer Display ───────────────────────────────────────────────────────────

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ActivityLoggerTab() {
  // Form state
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<PatientSearchResult[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [activityType, setActivityType] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [selectedEntitlement, setSelectedEntitlement] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Pending approvals queue (supervisor view)
  interface PendingItem {
    id: string;
    patientId: string;
    patientName: string;
    activityType: string;
    subject: string | null;
    summary: string | null;
    durationMinutes: number | null;
    loggedAt: string;
  }
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [showPendingPanel, setShowPendingPanel] = useState(false);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>("/activity-log/pending");
    setPendingLoading(false);
    if (res.error || !res.data) {
      setPending([]);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(res.data) ? res.data : (res.data as any).data ?? [];
    setPending(items.map((p) => ({
      id: p.id,
      patientId: p.patientId ?? p.patient_id,
      patientName: p.patientName ?? p.patient_name,
      activityType: p.activityType ?? p.activity_type ?? "other",
      subject: p.subject ?? null,
      summary: p.summary ?? null,
      durationMinutes: p.durationMinutes ?? p.duration_minutes ?? null,
      loggedAt: p.loggedAt ?? p.logged_at,
    })));
  }, []);

  useEffect(() => { void loadPending(); }, [loadPending]);

  const approve = async (id: string) => {
    await apiFetch(`/activity-log/${id}/approve`, { method: "POST" });
    void loadPending();
  };

  const reject = async (id: string) => {
    const reason = window.prompt("Optional reason for rejection:") ?? null;
    await apiFetch(`/activity-log/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    void loadPending();
  };

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recent activities state
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Debounce ref for patient search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Patient Search (debounced 400ms) ───────────────────────────────────

  const searchPatients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setPatientResults([]);
      setSearchingPatients(false);
      return;
    }
    setSearchingPatients(true);
    const res = await apiFetch<unknown>(`/patients?search=${encodeURIComponent(query)}`);
    setSearchingPatients(false);
    if (!res.error && res.data) {
      // /patients returns Laravel paginator: { data: [...], current_page, ... }
      // which apiFetch unwraps to res.data = the paginator wrapper. The actual
      // list lives at res.data.data (or res.data when the response is already
      // a flat array).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPatientResults(list.map((p: any) => {
        // Patient.fullName fallback for rows where first/last didn't
        // round-trip cleanly.
        const first = p.firstName || p.first_name || "";
        const last = p.lastName || p.last_name || "";
        const name = `${first} ${last}`.trim() || p.name || p.fullName || "Unnamed patient";
        return {
          id: p.id,
          name,
          email: p.email ?? null,
          planName: p.activeMembership?.plan?.name ?? p.plan ?? undefined,
        };
      }));
    } else {
      setPatientResults([]);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!patientSearch || selectedPatient) return;
    debounceRef.current = setTimeout(() => {
      searchPatients(patientSearch);
      setShowPatientDropdown(true);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [patientSearch, selectedPatient, searchPatients]);

  // ─── Load patient entitlements when patient selected ────────────────────

  useEffect(() => {
    if (!selectedPatient) {
      setEntitlements([]);
      setSelectedEntitlement("");
      return;
    }
    (async () => {
      const res = await apiFetch<Entitlement[]>(`/patients/${selectedPatient.id}/entitlements`);
      if (!res.error && res.data) {
        setEntitlements(res.data);
      }
    })();
  }, [selectedPatient]);

  // ─── Timer ──────────────────────────────────────────────────────────────

  const startTimer = () => {
    setTimerRunning(true);
    setTimerSeconds(0);
    timerRef.current = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    setTimerRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Auto-fill duration in minutes (rounded up)
    const minutes = Math.ceil(timerSeconds / 60);
    setDuration(minutes.toString());
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ─── Load Recent Activities ─────────────────────────────────────────────

  const loadActivities = useCallback(async () => {
    setActivitiesLoading(true);
    setActivitiesError(null);
    const params = new URLSearchParams({ page: page.toString(), pageSize: "20" });
    if (typeFilter) params.set("type", typeFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await apiFetch<PaginatedResponse<ActivityRecord>>(`/activity-log?${params.toString()}`);
    if (res.error) {
      setActivitiesError(res.error);
    } else if (res.data) {
      setActivities(res.data.items);
      setTotalPages(Math.ceil(res.data.total / res.data.pageSize));
    }
    setActivitiesLoading(false);
  }, [page, typeFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  // ─── Submit Activity ────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!selectedPatient || !activityType) return;
    setSubmitting(true);
    // Backend expects entitlement_code (string code on the EntitlementType,
    // e.g. "visit"), not the row id. The /patients/{id}/entitlements
    // endpoint returns rows with the type's code in `label` so we look up
    // the matching entitlement and ship its code field if present, or fall
    // back to the id (server tolerates either).
    const ent = entitlements.find((e) => e.id === selectedEntitlement);
    const body: Record<string, unknown> = {
      patientId: selectedPatient.id,
      activityType,
      durationMinutes: duration ? parseInt(duration, 10) : null,
      notes,
      requiresApproval,
    };
    if (ent) {
      const codeFromEnt = (ent as unknown as { code?: string; entitlementCode?: string }).code
        ?? (ent as unknown as { entitlementCode?: string }).entitlementCode
        ?? ent.label;
      body.entitlementCode = codeFromEnt;
    }
    const res = await apiFetch<ActivityRecord>("/activity-log", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.error) {
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 2000);
      // Reset form
      setPatientSearch("");
      setSelectedPatient(null);
      setActivityType("");
      setDuration("");
      setNotes("");
      setSelectedEntitlement("");
      setRequiresApproval(false);
      setTimerSeconds(0);
      // Refresh activities list + pending queue (in case the new entry
      // was a billable opt-in and now needs supervisor sign-off).
      loadActivities();
      void loadPending();
    }
  };

  // ─── Select Patient ─────────────────────────────────────────────────────

  const selectPatient = (p: PatientSearchResult) => {
    setSelectedPatient(p);
    setPatientSearch(p.name);
    setShowPatientDropdown(false);
    setPatientResults([]);
  };

  const clearPatient = () => {
    setSelectedPatient(null);
    setPatientSearch("");
    setPatientResults([]);
    setEntitlements([]);
    setSelectedEntitlement("");
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Activities Today" value={activities.filter((a) => {
          const today = new Date().toISOString().split("T")[0];
          return a.createdAt.startsWith(today);
        }).length.toString()} color="#1e40af" />
        <StatCard icon={Clock} label="Total Minutes Today" value={activities.filter((a) => {
          const today = new Date().toISOString().split("T")[0];
          return a.createdAt.startsWith(today);
        }).reduce((sum, a) => sum + (a.durationMinutes || 0), 0).toString()} color="#7c3aed" />
        <StatCard icon={Phone} label="Calls Today" value={activities.filter((a) => {
          const today = new Date().toISOString().split("T")[0];
          return a.createdAt.startsWith(today) && (a.activityType === "phone_call" || a.activityType === "after_hours_call");
        }).length.toString()} color="#147d64" />
        <StatCard icon={Activity} label="CCM/RPM Minutes" value={activities.filter((a) => {
          const today = new Date().toISOString().split("T")[0];
          return a.createdAt.startsWith(today) && (a.activityType === "ccm_time" || a.activityType === "rpm_review");
        }).reduce((sum, a) => sum + (a.durationMinutes || 0), 0).toString()} color="#d97706" />
      </div>

      {/* Quick Log Form */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <ClipboardList className="w-5 h-5" style={{ color: "#1e40af" }} />
          Quick Log Activity
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Patient Search */}
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  if (selectedPatient) setSelectedPatient(null);
                }}
                onFocus={() => setShowPatientDropdown(true)}
                placeholder="Type 2+ chars to search by name or email"
                className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              {selectedPatient && (
                <button onClick={clearPatient} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
            {/* Dropdown — renders searching, no-results, or hits.
                Hidden once a patient is selected so the chip-style
                cleared input doesn't keep popping it open. */}
            {showPatientDropdown && !selectedPatient && patientSearch.length >= 2 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchingPatients ? (
                  <div className="px-3 py-2 text-sm text-slate-400">Searching…</div>
                ) : patientResults.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-400">
                    No patients match "{patientSearch}".
                  </div>
                ) : (
                  patientResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectPatient(p)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                    >
                      <span className="font-medium text-slate-800">{p.name}</span>
                      {p.email && (
                        <span className="ml-2 text-xs text-slate-400">{p.email}</span>
                      )}
                      {p.planName && (
                        <span className="ml-2 text-xs text-slate-400">{p.planName}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
            {showPatientDropdown && !selectedPatient && patientSearch.length > 0 && patientSearch.length < 2 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg">
                <div className="px-3 py-2 text-sm text-slate-400">Type at least 2 characters…</div>
              </div>
            )}
          </div>

          {/* Activity Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Activity Type *</label>
            <div className="relative">
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none"
              >
                <option value="">Select type...</option>
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Duration (minutes)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Optional"
              min="0"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Entitlement to deduct */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Entitlement to Deduct</label>
            <div className="relative">
              <select
                value={selectedEntitlement}
                onChange={(e) => setSelectedEntitlement(e.target.value)}
                disabled={!selectedPatient || entitlements.length === 0}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">None</option>
                {entitlements.map((e) => (
                  <option key={e.id} value={e.id}>{e.label} ({e.remaining} remaining)</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Notes */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the activity..."
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>

          {/* Requires approval — opt-in for billable CCM/RPM time */}
          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                className="rounded"
              />
              <span>
                Requires supervisor approval
                <span className="ml-2 text-xs text-slate-400">
                  (use for billable CCM/RPM time)
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Timer Mode + Submit */}
        <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-slate-100">
          {/* Timer for CCM/RPM */}
          {(activityType === "ccm_time" || activityType === "rpm_review") && (
            <div className="flex items-center gap-3 mr-auto">
              <span className="text-sm font-medium text-slate-600">Timer:</span>
              <span
                className="font-mono text-lg font-bold min-w-[70px] text-center"
                style={{ color: timerRunning ? "#7c3aed" : "#334e68" }}
              >
                {formatTimer(timerSeconds)}
              </span>
              {!timerRunning ? (
                <button
                  onClick={startTimer}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: "#22c55e" }}
                >
                  <Play className="w-4 h-4" /> Start
                </button>
              ) : (
                <button
                  onClick={stopTimer}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: "#ef4444" }}
                >
                  <Square className="w-4 h-4" /> Stop
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 ml-auto">
            {submitSuccess && (
              <span className="text-sm font-medium" style={{ color: "#22c55e" }}>
                Activity logged!
              </span>
            )}
            <button
              onClick={handleSubmit}
              disabled={!selectedPatient || !activityType || submitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#1e40af" }}
            >
              {submitting ? "Logging..." : "Log Activity"}
            </button>
          </div>
        </div>
      </div>

      {/* Pending approvals — supervisor sign-off queue for billable time */}
      {(pending.length > 0 || pendingLoading) && (
        <div className="glass rounded-xl p-6 border" style={{ borderColor: "#fcd34d", backgroundColor: "#fffbeb" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5" style={{ color: "#d97706" }} />
                Pending approval ({pending.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Time entries that need supervisor sign-off before they're billable.
              </p>
            </div>
            {pending.length > 3 && (
              <button
                type="button"
                onClick={() => setShowPendingPanel((s) => !s)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                {showPendingPanel ? "Show less" : `Show all ${pending.length}`}
              </button>
            )}
          </div>
          {pendingLoading && pending.length === 0 ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "#fde68a" }}>
              {(showPendingPanel ? pending : pending.slice(0, 3)).map((p) => (
                <li key={p.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{p.patientName}</span>
                      <span className="text-xs text-slate-500">{p.subject ?? p.activityType}</span>
                      {p.durationMinutes != null && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                          {p.durationMinutes} min
                        </span>
                      )}
                    </div>
                    {p.summary && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{p.summary}</p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-1">
                      {new Date(p.loggedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => approve(p.id)}
                      className="px-2.5 py-1 rounded text-xs font-semibold text-white"
                      style={{ backgroundColor: "#16a34a" }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => reject(p.id)}
                      className="px-2.5 py-1 rounded text-xs font-semibold"
                      style={{ color: "#dc2626", backgroundColor: "#fef2f2" }}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Recent Activities */}
      <div className="glass rounded-xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Eye className="w-5 h-5" style={{ color: "#7c3aed" }} />
            Recent Activities
          </h3>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none appearance-none pr-8"
              >
                <option value="">All Types</option>
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <Filter className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none"
              placeholder="From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none"
              placeholder="To"
            />
          </div>
        </div>

        {activitiesError && (
          <div className="p-3 mb-4 rounded-lg text-sm" style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}>
            {activitiesError}
          </div>
        )}

        {activitiesLoading ? (
          <div className="text-center py-12 text-slate-400">Loading activities...</div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12 text-slate-400">No activities found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-3 font-semibold text-slate-600">Date/Time</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600">Patient</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600">Activity Type</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600">Duration</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600">Notes</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600">Entitlement Deducted</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleDateString()}{" "}
                        <span className="text-slate-400">{new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800">{a.patientName}</td>
                      <td className="py-3 px-3"><ActivityBadge type={a.activityType} /></td>
                      <td className="py-3 px-3 text-slate-600">
                        {a.durationMinutes ? `${a.durationMinutes} min` : "—"}
                      </td>
                      <td className="py-3 px-3 text-slate-500 max-w-xs truncate">{a.notes || "—"}</td>
                      <td className="py-3 px-3 text-slate-500">{a.entitlementDeducted || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
