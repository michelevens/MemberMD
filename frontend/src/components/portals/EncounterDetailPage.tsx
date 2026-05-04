import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ArrowLeft, FileText, DollarSign, Activity, ClipboardList,
  Calendar, User, ShieldAlert, CheckCircle2, AlertCircle, Pill,
  Pencil, X, Save, Sparkles,
} from "lucide-react";
import { encounterService } from "../../lib/api";

interface EncounterDetailPageProps {
  encounterId: string;
  onBack: () => void;
  onSaved?: () => void;
}

type TabId = "chart" | "billing" | "appointment" | "audit";

interface SoapDraft {
  chiefComplaint: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnoses: Array<{ code: string; description: string; type: "primary" | "secondary" }>;
  vitals: {
    bp_systolic?: string; bp_diastolic?: string; hr?: string; rr?: string;
    temp_f?: string; weight_lbs?: string; height_in?: string;
    o2_sat?: string; pain_scale?: string;
  };
  cptCodes: string[];
  durationMinutesActual: string;
  timeSpentDocumenting: string;
  followUpInstructions: string;
  followUpWeeks: string;
}

const emptyDraft = (): SoapDraft => ({
  chiefComplaint: "", subjective: "", objective: "", assessment: "", plan: "",
  diagnoses: [], vitals: {}, cptCodes: [],
  durationMinutesActual: "", timeSpentDocumenting: "",
  followUpInstructions: "", followUpWeeks: "",
});

// Hydrate the editable draft from the loaded encounter. Numbers come back
// as numbers; we coerce to strings so the form inputs stay controlled.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function draftFromEncounter(enc: any): SoapDraft {
  const numStr = (v: unknown): string => v === null || v === undefined ? "" : String(v);
  return {
    chiefComplaint: enc?.chiefComplaint ?? "",
    subjective: enc?.subjective ?? "",
    objective: enc?.objective ?? "",
    assessment: enc?.assessment ?? "",
    plan: enc?.plan ?? "",
    diagnoses: Array.isArray(enc?.diagnoses) ? enc.diagnoses : [],
    vitals: enc?.vitals && typeof enc.vitals === "object" ? { ...enc.vitals } : {},
    cptCodes: Array.isArray(enc?.cptCodes) ? enc.cptCodes : [],
    durationMinutesActual: numStr(enc?.durationMinutesActual),
    timeSpentDocumenting: numStr(enc?.timeSpentDocumenting),
    followUpInstructions: enc?.followUpInstructions ?? "",
    followUpWeeks: numStr(enc?.followUpWeeks),
  };
}

export function EncounterDetailPage({ encounterId, onBack, onSaved }: EncounterDetailPageProps) {
  const location = useLocation();
  // ?edit=1 in the URL flips the page into edit mode on load — used by
  // "+ New encounter" so newly-created drafts open ready to type into.
  const initialEdit = useMemo(() => {
    const search = location.search || "";
    return /[?&]edit=1\b/.test(search);
  }, [location.search]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [encounter, setEncounter] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("chart");

  // Edit-mode state.
  const [isEditing, setIsEditing] = useState(false);
  const [isAmending, setIsAmending] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState("");
  const [draft, setDraft] = useState<SoapDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    encounterService.getDetail(encounterId).then((res) => {
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d: any = res.data;
        setEncounter(d);
        setAuditLogs(Array.isArray(d.auditLogs) ? d.auditLogs : []);
        setDraft(draftFromEncounter(d));
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    encounterService.getDetail(encounterId).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d: any = res.data;
        setEncounter(d);
        setAuditLogs(Array.isArray(d.auditLogs) ? d.auditLogs : []);
        setDraft(draftFromEncounter(d));
        // Auto-edit on load: only for un-signed drafts. Signed charts
        // require an explicit "Amend" click — never silent edits.
        if (initialEdit && !d.signedAt && d.status !== "signed") {
          setIsEditing(true);
          setActiveTab("chart");
        }
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [encounterId, initialEdit]);

  const startEdit = () => {
    setSaveError(null);
    setIsAmending(false);
    setAmendmentReason("");
    setDraft(draftFromEncounter(encounter));
    setIsEditing(true);
    setActiveTab("chart");
  };

  const startAmend = () => {
    setSaveError(null);
    setIsAmending(true);
    setAmendmentReason("");
    setDraft(draftFromEncounter(encounter));
    setIsEditing(true);
    setActiveTab("chart");
  };

  const cancelEdit = () => {
    setSaveError(null);
    setIsEditing(false);
    setIsAmending(false);
    setAmendmentReason("");
    setDraft(draftFromEncounter(encounter));
  };

  const handleSave = async (alsoSign: boolean) => {
    if (isAmending && !amendmentReason.trim()) {
      setSaveError("Amendment reason is required when editing a signed chart.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const numOrNull = (s: string) => {
        const t = s.trim();
        if (t === "") return null;
        const n = parseInt(t, 10);
        return Number.isFinite(n) ? n : null;
      };
      const vitalsHasAny = Object.values(draft.vitals).some((v) => (v ?? "").toString().trim() !== "");

      const updateRes = await encounterService.update(encounterId, {
        chiefComplaint: draft.chiefComplaint,
        subjective: draft.subjective,
        objective: draft.objective,
        assessment: draft.assessment,
        plan: draft.plan,
        diagnoses: draft.diagnoses.length > 0 ? draft.diagnoses : null,
        vitals: vitalsHasAny ? draft.vitals : null,
        cptCodes: draft.cptCodes.length > 0 ? draft.cptCodes : null,
        durationMinutesActual: numOrNull(draft.durationMinutesActual),
        timeSpentDocumenting: numOrNull(draft.timeSpentDocumenting),
        followUpInstructions: draft.followUpInstructions.trim() || null,
        followUpWeeks: numOrNull(draft.followUpWeeks),
        ...(isAmending ? { amendmentReason: amendmentReason.trim() } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (updateRes.error) {
        setSaveError(updateRes.error);
        setSaving(false);
        return;
      }
      if (alsoSign) {
        const signRes = await encounterService.sign(encounterId);
        if (signRes.error) {
          setSaveError(`Saved, but signing failed: ${signRes.error}`);
          setSaving(false);
          return;
        }
      }
      setIsEditing(false);
      setIsAmending(false);
      setAmendmentReason("");
      reload();
      onSaved?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back to encounters
        </button>
        <div className="glass rounded-xl p-8 text-center text-slate-400 text-sm">Loading encounter…</div>
      </div>
    );
  }

  if (error || !encounter) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back to encounters
        </button>
        <div className="glass rounded-xl p-8 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <div className="text-sm text-slate-700">{error || "Encounter not found"}</div>
        </div>
      </div>
    );
  }

  const patientName = `${encounter.patient?.firstName ?? ""} ${encounter.patient?.lastName ?? ""}`.trim() || "Unknown patient";
  const providerName = encounter.provider?.user?.name
    || `${encounter.provider?.firstName ?? ""} ${encounter.provider?.lastName ?? ""}`.trim()
    || "Unknown provider";
  const isSigned = !!encounter.signedAt || encounter.status === "signed";
  const isAmended = !!encounter.amendedAt;
  const formatDate = (s?: string | null) => {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return s; }
  };
  const formatDateTime = (s?: string | null) => {
    if (!s) return "—";
    try { return new Date(s).toLocaleString(); } catch { return s; }
  };

  const statusBadge = () => {
    if (isAmended) return { label: "Amended", bg: "#fef3c7", color: "#92400e" };
    if (isSigned) return { label: "Signed", bg: "#dcfce7", color: "#166534" };
    if (encounter.status === "draft") return { label: "Draft", bg: "#fef3c7", color: "#92400e" };
    return { label: encounter.status || "—", bg: "#f1f5f9", color: "#475569" };
  };
  const badge = statusBadge();

  return (
    <div className="space-y-5">
      {/* Header / breadcrumb */}
      <div>
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to encounters
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
              {isEditing
                ? (isAmending ? "Amend Signed Encounter" : "Edit Encounter")
                : `Encounter — ${patientName}`}
            </h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 flex-wrap">
              <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(encounter.encounterDate)}</span>
              <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{providerName}</span>
              {encounter.encounterType && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                  {encounter.encounterType.replace(/_/g, " ")}
                </span>
              )}
              {isEditing && <span className="text-xs font-medium text-indigo-700">— editing</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: badge.bg, color: badge.color }}
            >
              {isAmended && <ShieldAlert className="w-3.5 h-3.5" />}
              {isSigned && !isAmended && <CheckCircle2 className="w-3.5 h-3.5" />}
              {badge.label}
            </span>
            {!isEditing && !isSigned && (
              <button
                onClick={startEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: "#635bff" }}
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit chart
              </button>
            )}
            {!isEditing && isSigned && (
              <button
                onClick={startAmend}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-amber-400 text-amber-800 hover:bg-amber-50"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Amend
              </button>
            )}
          </div>
        </div>

        {!isEditing && isAmended && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-900">
              <div className="font-semibold">Amended on {formatDateTime(encounter.amendedAt)}</div>
              {encounter.amendmentReason && <div className="mt-0.5">Reason: {encounter.amendmentReason}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Tabs — hide while editing so the chart form gets full width */}
      {!isEditing && (
        <div className="border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
          {([
            { id: "chart", label: "Chart", icon: FileText },
            { id: "billing", label: "Billing", icon: DollarSign },
            { id: "appointment", label: "Linked Appointment", icon: Calendar },
            { id: "audit", label: "Audit Trail", icon: Activity },
          ] as Array<{ id: TabId; label: string; icon: typeof FileText }>).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? "border-indigo-500 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {isEditing ? (
        <ChartEditor
          draft={draft}
          setDraft={setDraft}
          isAmending={isAmending}
          amendmentReason={amendmentReason}
          setAmendmentReason={setAmendmentReason}
          saving={saving}
          saveError={saveError}
          onCancel={cancelEdit}
          onSaveDraft={() => handleSave(false)}
          onSaveAndSign={() => handleSave(true)}
        />
      ) : (
        <>
          {activeTab === "chart" && <ChartTab encounter={encounter} />}
          {activeTab === "billing" && <BillingTab encounter={encounter} />}
          {activeTab === "appointment" && <AppointmentTab encounter={encounter} />}
          {activeTab === "audit" && <AuditTab logs={auditLogs} />}
        </>
      )}
    </div>
  );
}

// ─── Chart Editor (edit mode) ───────────────────────────────────────────

interface ChartEditorProps {
  draft: SoapDraft;
  setDraft: React.Dispatch<React.SetStateAction<SoapDraft>>;
  isAmending: boolean;
  amendmentReason: string;
  setAmendmentReason: (s: string) => void;
  saving: boolean;
  saveError: string | null;
  onCancel: () => void;
  onSaveDraft: () => void;
  onSaveAndSign: () => void;
}

function ChartEditor({
  draft, setDraft, isAmending, amendmentReason, setAmendmentReason,
  saving, saveError, onCancel, onSaveDraft, onSaveAndSign,
}: ChartEditorProps) {
  return (
    <div className="glass rounded-xl p-6 space-y-5">
      {isAmending && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-900">
              <div className="font-semibold mb-0.5">You are amending a signed chart.</div>
              <div>The original is preserved in the audit log. Please describe why this amendment is being made.</div>
            </div>
          </div>
          <label className="block text-[11px] font-semibold text-amber-900 uppercase mb-1">Amendment Reason <span className="text-red-600">*</span></label>
          <textarea
            rows={2}
            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white"
            value={amendmentReason}
            onChange={e => setAmendmentReason(e.target.value)}
            placeholder="e.g., Lab result corrected the diagnosis; updated medication dose..."
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Chief Complaint</label>
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm"
          value={draft.chiefComplaint}
          onChange={e => setDraft(f => ({ ...f, chiefComplaint: e.target.value }))}
          placeholder="Reason for visit..."
        />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#27ab83" }}>S — Subjective</label>
        <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={draft.subjective} onChange={e => setDraft(f => ({ ...f, subjective: e.target.value }))} placeholder="Patient's reported symptoms..." />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#334e68" }}>O — Objective</label>
        <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={draft.objective} onChange={e => setDraft(f => ({ ...f, objective: e.target.value }))} placeholder="Clinical findings, vitals, exam..." />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#d97706" }}>A — Assessment</label>
        <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={draft.assessment} onChange={e => setDraft(f => ({ ...f, assessment: e.target.value }))} placeholder="Diagnoses, clinical impression..." />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#147d64" }}>P — Plan</label>
        <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={draft.plan} onChange={e => setDraft(f => ({ ...f, plan: e.target.value }))} placeholder="Treatment plan, follow-up..." />
      </div>

      {/* Vitals */}
      <div className="border-t pt-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Vitals</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {([
            ["bp_systolic", "BP Systolic", "120"],
            ["bp_diastolic", "BP Diastolic", "80"],
            ["hr", "Heart Rate (bpm)", "72"],
            ["rr", "Resp Rate", "16"],
            ["temp_f", "Temp (°F)", "98.6"],
            ["weight_lbs", "Weight (lbs)", "170"],
            ["height_in", "Height (in)", "68"],
            ["o2_sat", "O₂ Sat (%)", "98"],
            ["pain_scale", "Pain (0–10)", "0"],
          ] as Array<[keyof SoapDraft["vitals"], string, string]>).map(([key, label, ph]) => (
            <div key={key as string}>
              <div className="text-[11px] text-slate-500 mb-0.5">{label}</div>
              <input
                type="number"
                step={key === "temp_f" || key === "weight_lbs" || key === "height_in" ? "0.1" : undefined}
                className="w-full border rounded px-2 py-1.5 text-sm"
                placeholder={ph}
                value={draft.vitals[key] ?? ""}
                onChange={e => setDraft(f => ({ ...f, vitals: { ...f.vitals, [key]: e.target.value } }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Diagnoses */}
      <div className="border-t pt-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Diagnoses (ICD-10)</label>
        {draft.diagnoses.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {draft.diagnoses.map((dx, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-slate-50 border rounded-lg px-2 py-1.5">
                <span className="font-mono text-xs font-semibold text-slate-700 w-16">{dx.code}</span>
                <span className="text-sm text-slate-700 flex-1">{dx.description}</span>
                <select
                  className="border rounded px-1.5 py-0.5 text-xs"
                  value={dx.type}
                  onChange={e => setDraft(f => ({ ...f, diagnoses: f.diagnoses.map((d, i) => i === idx ? { ...d, type: e.target.value as "primary" | "secondary" } : d) }))}
                >
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                </select>
                <button
                  type="button"
                  onClick={() => setDraft(f => ({ ...f, diagnoses: f.diagnoses.filter((_, i) => i !== idx) }))}
                  className="p-1 rounded hover:bg-slate-200 text-slate-500"
                  title="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <DiagnosisAdder onAdd={(code, description) => setDraft(f => ({
          ...f,
          diagnoses: [...f.diagnoses, { code, description, type: f.diagnoses.length === 0 ? "primary" : "secondary" }],
        }))} />
      </div>

      {/* CPT codes */}
      <div className="border-t pt-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">
          CPT Codes <span className="text-[10px] font-normal text-slate-400 normal-case">(for insurance billing — optional)</span>
        </label>
        {draft.cptCodes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {draft.cptCodes.map((cpt, idx) => (
              <span key={idx} className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1 text-xs font-mono text-indigo-700">
                {cpt}
                <button
                  type="button"
                  onClick={() => setDraft(f => ({ ...f, cptCodes: f.cptCodes.filter((_, i) => i !== idx) }))}
                  className="hover:text-indigo-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {["99213", "99214", "99215", "99490", "99454", "90834", "90837"].map(code => (
            <button
              key={code}
              type="button"
              disabled={draft.cptCodes.includes(code)}
              onClick={() => setDraft(f => ({ ...f, cptCodes: [...f.cptCodes, code] }))}
              className="px-2 py-1 rounded text-xs font-mono border transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              + {code}
            </button>
          ))}
          <CptCustomInput
            existing={draft.cptCodes}
            onAdd={(val) => setDraft(f => ({ ...f, cptCodes: [...f.cptCodes, val] }))}
          />
        </div>
      </div>

      {/* Time */}
      <div className="border-t pt-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">
          Time <span className="text-[10px] font-normal text-slate-400 normal-case">(supports time-based billing codes)</span>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[11px] text-slate-500 mb-0.5">Face-to-face (min)</div>
            <input type="number" min={0} className="w-full border rounded px-2 py-1.5 text-sm" value={draft.durationMinutesActual} onChange={e => setDraft(f => ({ ...f, durationMinutesActual: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 mb-0.5">Documentation (min)</div>
            <input type="number" min={0} className="w-full border rounded px-2 py-1.5 text-sm" value={draft.timeSpentDocumenting} onChange={e => setDraft(f => ({ ...f, timeSpentDocumenting: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 mb-0.5">Total</div>
            <div className="w-full border rounded px-2 py-1.5 text-sm bg-slate-50 text-slate-600">
              {(() => {
                const a = parseInt(draft.durationMinutesActual, 10);
                const d = parseInt(draft.timeSpentDocumenting, 10);
                const total = (Number.isFinite(a) ? a : 0) + (Number.isFinite(d) ? d : 0);
                return total > 0 ? `${total} min` : "—";
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Follow-up */}
      <div className="border-t pt-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Follow-up</label>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <div className="text-[11px] text-slate-500 mb-0.5">Instructions</div>
            <textarea rows={2} className="w-full border rounded px-2 py-1.5 text-sm" value={draft.followUpInstructions} onChange={e => setDraft(f => ({ ...f, followUpInstructions: e.target.value }))} placeholder="Return in 4 weeks for medication review..." />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 mb-0.5">Weeks</div>
            <input type="number" min={1} max={52} className="w-full border rounded px-2 py-1.5 text-sm" value={draft.followUpWeeks} onChange={e => setDraft(f => ({ ...f, followUpWeeks: e.target.value }))} placeholder="4" />
          </div>
        </div>
      </div>

      {saveError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {saveError}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onSaveDraft}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50"
          style={{ borderColor: "#27ab83", color: "#27ab83" }}
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Saving..." : isAmending ? "Save Amendment" : "Save Draft"}
        </button>
        {!isAmending && (
          <button
            onClick={onSaveAndSign}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: "#635bff" }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {saving ? "Signing..." : "Save & Sign"}
          </button>
        )}
      </div>
    </div>
  );
}

function DiagnosisAdder({ onAdd }: { onAdd: (code: string, description: string) => void }) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder="ICD-10 code (e.g., F41.1)"
        className="border rounded px-2 py-1.5 text-sm w-36 font-mono"
        value={code}
        onChange={e => setCode(e.target.value)}
      />
      <input
        type="text"
        placeholder="Description"
        className="border rounded px-2 py-1.5 text-sm flex-1"
        value={description}
        onChange={e => setDescription(e.target.value)}
      />
      <button
        type="button"
        className="px-3 py-1.5 rounded text-xs font-medium border transition-colors"
        style={{ borderColor: "#635bff", color: "#635bff" }}
        onClick={() => {
          const c = code.trim().toUpperCase();
          const d = description.trim();
          if (!c || !d) return;
          onAdd(c, d);
          setCode("");
          setDescription("");
        }}
      >
        + Add
      </button>
    </div>
  );
}

function CptCustomInput({ existing, onAdd }: { existing: string[]; onAdd: (val: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <input
      type="text"
      placeholder="Custom CPT"
      className="border rounded px-2 py-1 text-xs font-mono w-28"
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter") {
          e.preventDefault();
          const t = val.trim();
          if (t && !existing.includes(t)) {
            onAdd(t);
            setVal("");
          }
        }
      }}
    />
  );
}

// ─── Read-only tabs (unchanged from prior version) ─────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTab({ encounter }: { encounter: any }) {
  const Section = ({ label, value, color }: { label: string; value?: string | null; color?: string }) => (
    <div>
      <div className="text-xs font-semibold uppercase mb-1" style={{ color: color ?? "#475569" }}>{label}</div>
      <div className="text-sm text-slate-700 whitespace-pre-wrap">{value || <span className="text-slate-400 italic">— not documented —</span>}</div>
    </div>
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dx: Array<{ code: string; description: string; type?: string }> = Array.isArray(encounter.diagnoses) ? encounter.diagnoses : [];
  const vitals = encounter.vitals ?? {};
  const vitalsHasAny = vitals && typeof vitals === "object" && Object.values(vitals).some((v) => (v ?? "").toString().trim() !== "");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rx: any[] = Array.isArray(encounter.prescriptions) ? encounter.prescriptions : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <div className="glass rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-slate-800">SOAP Note</h3>
          <Section label="Chief Complaint" value={encounter.chiefComplaint} />
          <Section label="S — Subjective" value={encounter.subjective} color="#27ab83" />
          <Section label="O — Objective" value={encounter.objective} color="#334e68" />
          <Section label="A — Assessment" value={encounter.assessment} color="#d97706" />
          <Section label="P — Plan" value={encounter.plan} color="#147d64" />
        </div>

        {dx.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Diagnoses (ICD-10)</h3>
            <div className="space-y-1.5">
              {dx.map((d, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 border rounded-lg px-3 py-2">
                  <span className="font-mono text-xs font-semibold text-slate-700 w-20">{d.code}</span>
                  <span className="text-sm text-slate-700 flex-1">{d.description}</span>
                  {d.type && (
                    <span className="text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                      {d.type}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {rx.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Pill className="w-4 h-4 text-indigo-600" /> Prescriptions Written
            </h3>
            <div className="space-y-1.5">
              {rx.map((r, i) => (
                <div key={i} className="text-sm text-slate-700 border-b border-slate-100 pb-1.5 last:border-0">
                  <span className="font-medium">{r.medicationName ?? r.medication_name ?? "—"}</span>
                  {(r.dosage || r.frequency) && <span className="text-slate-500 ml-2">{[r.dosage, r.frequency].filter(Boolean).join(" · ")}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {(encounter.followUpInstructions || encounter.followUpWeeks) && (
          <div className="glass rounded-xl p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Follow-up</h3>
            {encounter.followUpInstructions && (
              <div className="text-sm text-slate-700 mb-2 whitespace-pre-wrap">{encounter.followUpInstructions}</div>
            )}
            {encounter.followUpWeeks && (
              <div className="text-xs text-slate-500">In {encounter.followUpWeeks} {encounter.followUpWeeks === 1 ? "week" : "weeks"}</div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-5">
        {vitalsHasAny && (
          <div className="glass rounded-xl p-5">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-rose-500" /> Vitals
            </h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {vitals.bp_systolic && vitals.bp_diastolic && (
                <div><div className="text-[11px] text-slate-500">Blood Pressure</div><div className="font-semibold">{vitals.bp_systolic}/{vitals.bp_diastolic}</div></div>
              )}
              {vitals.hr && <div><div className="text-[11px] text-slate-500">Heart Rate</div><div className="font-semibold">{vitals.hr} bpm</div></div>}
              {vitals.rr && <div><div className="text-[11px] text-slate-500">Resp Rate</div><div className="font-semibold">{vitals.rr}</div></div>}
              {vitals.temp_f && <div><div className="text-[11px] text-slate-500">Temperature</div><div className="font-semibold">{vitals.temp_f}°F</div></div>}
              {vitals.weight_lbs && <div><div className="text-[11px] text-slate-500">Weight</div><div className="font-semibold">{vitals.weight_lbs} lbs</div></div>}
              {vitals.height_in && <div><div className="text-[11px] text-slate-500">Height</div><div className="font-semibold">{vitals.height_in} in</div></div>}
              {vitals.o2_sat && <div><div className="text-[11px] text-slate-500">O₂ Sat</div><div className="font-semibold">{vitals.o2_sat}%</div></div>}
              {vitals.pain_scale && <div><div className="text-[11px] text-slate-500">Pain</div><div className="font-semibold">{vitals.pain_scale}/10</div></div>}
            </div>
          </div>
        )}

        <div className="glass rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-slate-500" /> Visit Details
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Type</dt><dd className="font-medium text-slate-800">{(encounter.encounterType ?? "—").replace(/_/g, " ")}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Provider</dt><dd className="font-medium text-slate-800">{encounter.provider?.user?.name ?? "—"}</dd></div>
            {encounter.program?.name && <div className="flex justify-between"><dt className="text-slate-500">Program</dt><dd className="font-medium text-slate-800">{encounter.program.name}</dd></div>}
            {encounter.signer?.name && <div className="flex justify-between"><dt className="text-slate-500">Signed by</dt><dd className="font-medium text-slate-800">{encounter.signer.name}</dd></div>}
            {encounter.signedAt && <div className="flex justify-between"><dt className="text-slate-500">Signed at</dt><dd className="font-medium text-slate-800 text-xs">{new Date(encounter.signedAt).toLocaleString()}</dd></div>}
            {encounter.cosigner?.name && <div className="flex justify-between"><dt className="text-slate-500">Cosigned by</dt><dd className="font-medium text-slate-800">{encounter.cosigner.name}</dd></div>}
          </dl>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BillingTab({ encounter }: { encounter: any }) {
  const cpt: string[] = Array.isArray(encounter.cptCodes) ? encounter.cptCodes : [];
  const billStatus = encounter.billStatus ?? "not_billed";
  const billStatusLabels: Record<string, { label: string; bg: string; color: string }> = {
    not_billed: { label: "Not billed", bg: "#f1f5f9", color: "#475569" },
    queued: { label: "Queued", bg: "#dbeafe", color: "#1e40af" },
    submitted: { label: "Submitted", bg: "#fef3c7", color: "#92400e" },
    paid: { label: "Paid", bg: "#dcfce7", color: "#166534" },
    denied: { label: "Denied", bg: "#fee2e2", color: "#991b1b" },
  };
  const bs = billStatusLabels[billStatus] ?? billStatusLabels.not_billed;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="glass rounded-xl p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Time Tracked</h3>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Face-to-face</dt>
            <dd className="font-semibold text-slate-800">{encounter.durationMinutesActual ?? "—"} min</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Documentation</dt>
            <dd className="font-semibold text-slate-800">{encounter.timeSpentDocumenting ?? "—"} min</dd>
          </div>
          <div className="flex justify-between pt-1">
            <dt className="text-slate-500 font-semibold">Total</dt>
            <dd className="font-bold text-slate-900">{encounter.totalTimeMinutes ?? "—"} min</dd>
          </div>
        </dl>
      </div>

      <div className="glass rounded-xl p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Billing Status</h3>
        <div className="mb-4">
          <span
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: bs.bg, color: bs.color }}
          >
            {bs.label}
          </span>
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Units billed</dt><dd className="font-medium text-slate-800">{encounter.unitsBilled ?? "—"}</dd></div>
        </dl>
      </div>

      <div className="glass rounded-xl p-5 lg:col-span-2">
        <h3 className="font-semibold text-slate-800 mb-3">CPT Codes</h3>
        {cpt.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {cpt.map((code, i) => (
              <span key={i} className="inline-flex items-center bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1 text-sm font-mono text-indigo-700">
                {code}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-400 italic">No CPT codes captured</div>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AppointmentTab({ encounter }: { encounter: any }) {
  const apt = encounter.appointment;
  if (!apt) {
    return (
      <div className="glass rounded-xl p-8 text-center text-slate-400 text-sm">
        This encounter is not linked to an appointment.
      </div>
    );
  }
  const formatDateTime = (s?: string | null) => {
    if (!s) return "—";
    try { return new Date(s).toLocaleString(); } catch { return s; }
  };
  return (
    <div className="glass rounded-xl p-5">
      <h3 className="font-semibold text-slate-800 mb-3">Linked Appointment</h3>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6 text-sm">
        <div><dt className="text-xs text-slate-500 uppercase mb-0.5">Scheduled</dt><dd className="font-medium text-slate-800">{formatDateTime(apt.scheduledAt)}</dd></div>
        <div><dt className="text-xs text-slate-500 uppercase mb-0.5">Status</dt><dd className="font-medium text-slate-800">{apt.status ?? "—"}</dd></div>
        <div><dt className="text-xs text-slate-500 uppercase mb-0.5">Duration (scheduled)</dt><dd className="font-medium text-slate-800">{apt.durationMinutes ?? "—"} min</dd></div>
        <div><dt className="text-xs text-slate-500 uppercase mb-0.5">Telehealth</dt><dd className="font-medium text-slate-800">{apt.isTelehealth ? "Yes" : "No"}</dd></div>
        {apt.completedAt && <div><dt className="text-xs text-slate-500 uppercase mb-0.5">Completed at</dt><dd className="font-medium text-slate-800">{formatDateTime(apt.completedAt)}</dd></div>}
        {apt.reasonForVisit && <div className="md:col-span-2"><dt className="text-xs text-slate-500 uppercase mb-0.5">Reason for visit</dt><dd className="text-slate-700">{apt.reasonForVisit}</dd></div>}
      </dl>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AuditTab({ logs }: { logs: any[] }) {
  if (!logs || logs.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center text-slate-400 text-sm">
        No audit entries for this encounter yet.
      </div>
    );
  }
  return (
    <div className="glass rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left text-[11px] font-semibold uppercase text-slate-500 px-4 py-2.5">When</th>
            <th className="text-left text-[11px] font-semibold uppercase text-slate-500 px-4 py-2.5">Action</th>
            <th className="text-left text-[11px] font-semibold uppercase text-slate-500 px-4 py-2.5">User</th>
            <th className="text-left text-[11px] font-semibold uppercase text-slate-500 px-4 py-2.5">From</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const when = log.createdAt ?? log.created_at;
            const user = log.user?.name ?? "System";
            return (
              <tr key={log.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{when ? new Date(when).toLocaleString() : "—"}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                    {log.action ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-700">{user}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{log.ipAddress ?? log.ip_address ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// `Sparkles` import is unused but keeps the lint-clean parity with the
// inline editor's "Documentation Assistant" button if/when we wire it
// here next. Cheap to keep — saves a future import roundtrip.
void Sparkles;
