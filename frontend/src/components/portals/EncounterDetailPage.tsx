import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ArrowLeft, FileText, DollarSign, Activity, ClipboardList,
  Calendar, User, ShieldAlert, CheckCircle2, AlertCircle, Pill,
  Pencil, X, Save, Sparkles, Lock, Brain, Video as VideoIcon,
  Cake, AlertTriangle, History, FlaskConical, Send, Plus,
  Folder, FileSignature, FileBadge, Download, ExternalLink,
} from "lucide-react";
import {
  encounterService, chartTemplateService, labService, referralService,
  documentService, consentService, signatureRequestService, screeningService,
  prescriptionService,
} from "../../lib/api";
import type { ChartTemplate, ChartTemplateField } from "../../lib/api";

interface EncounterDetailPageProps {
  encounterId: string;
  onBack: () => void;
  onSaved?: () => void;
}

type TabId = "chart" | "billing" | "appointment" | "documents" | "audit";

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

  // Template-driven authoring. When the encounter has a template_id we
  // fetch the template definition, render its fields above the SOAP
  // narrative, and persist responses into structured_data on the
  // encounter. SOAP narrative columns stay so we keep a queryable
  // canonical summary even when most authoring is structured.
  const [template, setTemplate] = useState<ChartTemplate | null>(null);
  const [structuredDraft, setStructuredDraft] = useState<Record<string, unknown>>({});

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
        setStructuredDraft(d?.structuredData && typeof d.structuredData === "object" ? { ...d.structuredData } : {});
        // Fetch template if linked. Errors are non-fatal — fall back
        // to free-form SOAP rendering if the template is missing.
        if (d?.templateId) {
          chartTemplateService.get(d.templateId).then((tres) => {
            if (tres.data) setTemplate(tres.data);
          });
        } else {
          setTemplate(null);
        }
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Reset all per-encounter state up front so navigating from
    // encounter A → B never flashes A's chart, edit mode, audit log,
    // or template while B's fetch is in flight. Without this reset,
    // the page can appear "stuck" on the previous encounter until a
    // refresh re-runs initial state.
    setEncounter(null);
    setAuditLogs([]);
    setTemplate(null);
    setDraft(emptyDraft());
    setStructuredDraft({});
    setIsEditing(false);
    setIsAmending(false);
    setAmendmentReason("");
    setSaveError(null);
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
        setStructuredDraft(d?.structuredData && typeof d.structuredData === "object" ? { ...d.structuredData } : {});
        // Same template fetch as reload(). Kept inline here so we can
        // race-guard against unmount via `cancelled`.
        if (d?.templateId) {
          chartTemplateService.get(d.templateId).then((tres) => {
            if (cancelled) return;
            if (tres.data) setTemplate(tres.data);
          });
        } else {
          setTemplate(null);
        }
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
    setStructuredDraft(encounter?.structuredData && typeof encounter.structuredData === "object" ? { ...encounter.structuredData } : {});
    setIsEditing(true);
    setActiveTab("chart");
  };

  const startAmend = () => {
    setSaveError(null);
    setIsAmending(true);
    setAmendmentReason("");
    setDraft(draftFromEncounter(encounter));
    setStructuredDraft(encounter?.structuredData && typeof encounter.structuredData === "object" ? { ...encounter.structuredData } : {});
    setIsEditing(true);
    setActiveTab("chart");
  };

  const cancelEdit = () => {
    setSaveError(null);
    setIsEditing(false);
    setIsAmending(false);
    setAmendmentReason("");
    setDraft(draftFromEncounter(encounter));
    setStructuredDraft(encounter?.structuredData && typeof encounter.structuredData === "object" ? { ...encounter.structuredData } : {});
  };

  // Sign-from-header path. Used by the Sign & lock button next to
  // Edit chart in the page header for charts that have already been
  // saved at least once (status=draft, not currently editing). Skips
  // the editor-flow because the provider has already saved their
  // narrative — they just want to lock it.
  const [signing, setSigning] = useState(false);
  const handleSignFromHeader = async () => {
    setSigning(true);
    const res = await encounterService.sign(encounterId);
    setSigning(false);
    if (res.error) {
      // Reuse saveError surface — it's the only inline error channel
      // this page currently has, and the user is already trained to
      // look there.
      setSaveError(res.error);
      return;
    }
    reload();
    onSaved?.();
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

      // structuredData: only send when at least one key has a non-empty
      // value so an empty template doesn't poison the column with {}.
      const structuredHasAny = Object.values(structuredDraft).some(
        (v) => v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : v.toString().trim() !== "")
      );
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
        structuredData: structuredHasAny ? structuredDraft : null,
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
            {/* Sign & lock — promoted to the page header so providers
                can lock a chart they already edited without re-entering
                the editor. Only renders for unsigned drafts that have
                some content; an entirely-empty chart shouldn't be
                lockable from here (the provider needs to write into it
                first via Edit chart). */}
            {!isEditing && !isSigned && hasAnyChartContent(encounter) && (
              <button
                onClick={handleSignFromHeader}
                disabled={signing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#147d64" }}
                title="Sign and lock this encounter. Cannot be edited after signing — only amended."
              >
                <Lock className="w-3.5 h-3.5" />
                {signing ? "Signing…" : "Sign & lock"}
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

      {/* Surface header-sign errors (saveError is also used by the
          editor; the editor renders its own copy). Only shown when not
          editing so we don't duplicate. */}
      {!isEditing && saveError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">{saveError}</div>
          <button onClick={() => setSaveError(null)} className="text-red-600 hover:text-red-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Patient summary strip — clinical context the provider needs at
          the top of every chart. Pulled from patient_summary on the
          detail endpoint (DOB, allergies, active meds, last visit).
          apiFetch transforms snake_case → camelCase, so the backend's
          `patient_summary` arrives here as `patientSummary`. Also
          coalesce keys inside the strip so it's defensive against the
          raw shape if the transform ever changes. */}
      {!isEditing && (encounter.patientSummary || encounter.patient_summary) && (
        <PatientSummaryStrip
          patientName={patientName}
          summary={encounter.patientSummary ?? encounter.patient_summary}
        />
      )}

      {/* Tabs — hide while editing so the chart form gets full width */}
      {!isEditing && (
        <div className="border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
          {([
            { id: "chart", label: "Chart", icon: FileText },
            { id: "billing", label: "Billing", icon: DollarSign },
            { id: "appointment", label: "Linked Appointment", icon: Calendar },
            // Documents is patient-scoped, not encounter-scoped — shows
            // every document/consent/signature/screening/Rx/lab tied to
            // this patient across all visits. Labeled inside the tab so
            // there's no confusion about scope.
            { id: "documents", label: "Documents", icon: Folder },
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
          template={template}
          structuredDraft={structuredDraft}
          setStructuredDraft={setStructuredDraft}
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
          {activeTab === "chart" && <ChartTab encounter={encounter} onReload={reload} />}
          {activeTab === "billing" && <BillingTab encounter={encounter} />}
          {activeTab === "appointment" && <AppointmentTab encounter={encounter} />}
          {activeTab === "documents" && (
            <PatientDocumentsTab
              patientId={encounter.patient?.id ?? encounter.patientId ?? encounter.patient_id ?? null}
              patientName={patientName}
            />
          )}
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
  template: ChartTemplate | null;
  structuredDraft: Record<string, unknown>;
  setStructuredDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
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
  draft, setDraft, template, structuredDraft, setStructuredDraft,
  isAmending, amendmentReason, setAmendmentReason,
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

      {template && (
        <TemplateFieldsBlock
          template={template}
          structuredDraft={structuredDraft}
          setStructuredDraft={setStructuredDraft}
        />
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
          Chief Complaint
          {template && <span className="ml-2 text-[10px] font-normal text-slate-400 normal-case">canonical narrative — also captured in template above</span>}
        </label>
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

// ─── Template-driven authoring block ───────────────────────────────────
// Renders the active template's fields grouped by section, persisting
// values into structured_data on the encounter. Falls back to a sane
// rendering when a field type isn't recognized so a typo'd template
// definition doesn't crash the editor.
function TemplateFieldsBlock({
  template,
  structuredDraft,
  setStructuredDraft,
}: {
  template: ChartTemplate;
  structuredDraft: Record<string, unknown>;
  setStructuredDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  // Group fields by section, preserving the order they appear in the
  // template definition (sections shown in first-appearance order).
  const sections = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ChartTemplateField[]>();
    for (const f of template.fields) {
      const sec = f.section || "General";
      if (!map.has(sec)) {
        map.set(sec, []);
        order.push(sec);
      }
      map.get(sec)!.push(f);
    }
    return order.map((s) => ({ name: s, fields: map.get(s)! }));
  }, [template.fields]);

  const setVal = (id: string, value: unknown) => {
    setStructuredDraft((d) => ({ ...d, [id]: value }));
  };

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-4 space-y-4">
      <div className="flex items-baseline justify-between gap-2 border-b border-indigo-100 pb-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{template.name}</div>
          {template.description && <div className="text-xs text-slate-500 mt-0.5">{template.description}</div>}
        </div>
        <span className="text-[10px] uppercase font-semibold tracking-wide text-indigo-500">Template</span>
      </div>
      {sections.map((section) => (
        <div key={section.name} className="space-y-2">
          <div className="text-[11px] font-semibold uppercase text-slate-500">{section.name}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {section.fields.map((field) => (
              <TemplateFieldInput
                key={field.id}
                field={field}
                value={structuredDraft[field.id]}
                onChange={(v) => setVal(field.id, v)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplateFieldInput({
  field, value, onChange,
}: {
  field: ChartTemplateField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const labelEl = (
    <label className="block text-xs font-medium text-slate-700 mb-1">
      {field.label}
      {field.required && <span className="text-red-500 ml-1">*</span>}
      {field.unit && <span className="text-slate-400 font-normal ml-1">({field.unit})</span>}
    </label>
  );
  const wrapWide = field.type === "textarea" ? "sm:col-span-2" : "";

  switch (field.type) {
    case "textarea":
      return (
        <div className={wrapWide}>
          {labelEl}
          <textarea
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "text":
      return (
        <div>
          {labelEl}
          <input
            type="text"
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "number":
      return (
        <div>
          {labelEl}
          <input
            type="number"
            step="0.1"
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            value={(value as string | number) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.referenceRange && (field.referenceRange.min !== undefined || field.referenceRange.max !== undefined) && (
            <div className="text-[10px] text-slate-400 mt-0.5">
              Reference: {field.referenceRange.min ?? "—"} to {field.referenceRange.max ?? "—"}
            </div>
          )}
        </div>
      );
    case "select":
    case "radio":
      return (
        <div>
          {labelEl}
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— select —</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    case "checkbox":
      return (
        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            id={`tpl-${field.id}`}
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-slate-300"
          />
          <label htmlFor={`tpl-${field.id}`} className="text-sm text-slate-700">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        </div>
      );
    case "checkbox_group": {
      const arr: string[] = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className={wrapWide}>
          {labelEl}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {(field.options ?? []).map((opt) => (
              <label key={opt} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={arr.includes(opt)}
                  onChange={(e) => onChange(e.target.checked ? [...arr, opt] : arr.filter((x) => x !== opt))}
                  className="rounded border-slate-300"
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      );
    }
    case "date":
      return (
        <div>
          {labelEl}
          <input
            type="date"
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "vitals":
      // Template-defined vitals fall through to the dedicated vitals
      // widget already in the editor below — render a placeholder
      // pointing the user there so we don't duplicate inputs.
      return (
        <div className={wrapWide}>
          {labelEl}
          <div className="text-xs text-slate-500 italic">Use the Vitals widget below.</div>
        </div>
      );
    default:
      return (
        <div>
          {labelEl}
          <input
            type="text"
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
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

// ─── Phase 1: Patient summary + ancillary cards ────────────────────────

// "Has anything been documented?" — drives the header Sign & lock
// button visibility and the ChartTab empty-state nudge. We only
// require ONE of these to be present; an empty chart shouldn't be
// signable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasAnyChartContent(enc: any): boolean {
  if (!enc) return false;
  const narrativeFields = [enc.chiefComplaint, enc.subjective, enc.objective, enc.assessment, enc.plan];
  if (narrativeFields.some((f) => typeof f === "string" && f.trim() !== "")) return true;
  if (Array.isArray(enc.diagnoses) && enc.diagnoses.length > 0) return true;
  if (Array.isArray(enc.cptCodes) && enc.cptCodes.length > 0) return true;
  if (enc.vitals && typeof enc.vitals === "object" && Object.values(enc.vitals).some((v) => (v ?? "").toString().trim() !== "")) return true;
  if (enc.structuredData && typeof enc.structuredData === "object" && Object.keys(enc.structuredData).length > 0) return true;
  return false;
}

// Compute age in whole years from a YYYY-MM-DD birthdate string.
function ageFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;
  return years >= 0 && years < 150 ? years : null;
}

// apiFetch transforms snake_case → camelCase on the way in, but we
// also accept the raw shape to stay defensive (and to make this
// component reusable from places that bypass apiFetch).
interface PatientSummaryShape {
  dateOfBirth?: string | null;
  date_of_birth?: string | null;
  allergies?: unknown[];
  activePrescriptionCount?: number;
  active_prescription_count?: number;
  lastVisitDate?: string | null;
  last_visit_date?: string | null;
}

function PatientSummaryStrip({ patientName, summary }: { patientName: string; summary: PatientSummaryShape }) {
  const dob = summary.dateOfBirth ?? summary.date_of_birth ?? null;
  const activeRx = summary.activePrescriptionCount ?? summary.active_prescription_count ?? 0;
  const lastVisitRaw = summary.lastVisitDate ?? summary.last_visit_date ?? null;
  const age = ageFromDob(dob);
  const allergyList = Array.isArray(summary.allergies) ? summary.allergies : [];
  const allergyLabels = allergyList
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: any) => {
      if (typeof a === "string") return a;
      return a?.name ?? a?.allergen ?? a?.label ?? null;
    })
    .filter((s): s is string => typeof s === "string" && s.trim() !== "");
  const hasAllergies = allergyLabels.length > 0;
  const lastVisit = lastVisitRaw
    ? new Date(lastVisitRaw).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-xs flex-shrink-0">
          {patientName.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"}
        </div>
        <div className="font-semibold text-slate-900 truncate">{patientName}</div>
      </div>

      {/* Age + DOB */}
      {(age !== null || dob) && (
        <div className="flex items-center gap-1.5 text-slate-600">
          <Cake className="w-3.5 h-3.5 text-slate-400" />
          {age !== null && <span className="font-medium">{age} y</span>}
          {dob && (
            <span className="text-xs text-slate-400">
              ({new Date(dob).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })})
            </span>
          )}
        </div>
      )}

      {/* Allergies — prominent red when present */}
      <div className={`flex items-center gap-1.5 ${hasAllergies ? "text-red-700" : "text-slate-500"}`}>
        <AlertTriangle className={`w-3.5 h-3.5 ${hasAllergies ? "text-red-500" : "text-slate-400"}`} />
        {hasAllergies ? (
          <span className="font-semibold" title={allergyLabels.join(", ")}>
            {allergyLabels.length === 1
              ? allergyLabels[0]
              : `${allergyLabels[0]} +${allergyLabels.length - 1}`}
          </span>
        ) : (
          <span>No known allergies</span>
        )}
      </div>

      {/* Active prescriptions */}
      <div className="flex items-center gap-1.5 text-slate-600">
        <Pill className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-medium">{activeRx}</span>
        <span className="text-slate-500">active med{activeRx === 1 ? "" : "s"}</span>
      </div>

      {/* Last visit */}
      {lastVisit && (
        <div className="flex items-center gap-1.5 text-slate-600">
          <History className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500">Last visit</span>
          <span className="font-medium">{lastVisit}</span>
        </div>
      )}
    </div>
  );
}

// PHQ-9 / GAD-7 / etc. — captured during booking pre-flight or
// administered in the visit. ScreeningResponse rows are eager-loaded
// on encounter detail; this surfaces them as a card with score +
// severity so the provider can see results at a glance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScreeningsCard({ responses }: { responses: any[] }) {
  if (!responses || responses.length === 0) return null;
  const severityColor = (sev?: string | null): { bg: string; color: string } => {
    const s = (sev ?? "").toLowerCase();
    if (s === "severe" || s === "high") return { bg: "#fee2e2", color: "#991b1b" };
    if (s === "moderate" || s === "moderately_severe" || s === "mod") return { bg: "#fef3c7", color: "#92400e" };
    if (s === "mild" || s === "low") return { bg: "#fef9c3", color: "#854d0e" };
    if (s === "minimal" || s === "none") return { bg: "#dcfce7", color: "#166534" };
    return { bg: "#f1f5f9", color: "#475569" };
  };
  return (
    <div className="glass rounded-xl p-5">
      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Brain className="w-4 h-4 text-indigo-600" /> Screenings
      </h3>
      <div className="space-y-2">
        {responses.map((r) => {
          const tplName = r.template?.name ?? r.template?.code ?? "Screening";
          const sev = r.severity ?? null;
          const adminAt = r.administeredAt ?? r.administered_at ?? null;
          const { bg, color } = severityColor(sev);
          return (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{tplName}</div>
                {adminAt && (
                  <div className="text-[11px] text-slate-500">
                    {new Date(adminAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {r.score !== null && r.score !== undefined && (
                  <span className="font-mono text-sm font-bold text-slate-900">{r.score}</span>
                )}
                {sev && (
                  <span className="text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded" style={{ backgroundColor: bg, color }}>
                    {sev.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Telehealth session card — surfaces TelehealthSession data (start /
// end / duration / admit timestamps) when the linked appointment was
// a video visit. Reaches through encounter.appointment.telehealthSession
// (eager-loaded on detail).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TelehealthSessionCard({ session }: { session: any }) {
  if (!session) return null;
  const fmt = (s?: string | null) => s ? new Date(s).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
  const startedAt = session.startedAt ?? session.started_at ?? null;
  const endedAt = session.endedAt ?? session.ended_at ?? null;
  const admittedAt = session.admittedAt ?? session.admitted_at ?? null;
  const durationSeconds = session.durationSeconds ?? session.duration_seconds ?? null;
  const isExternal = session.isExternal ?? session.is_external ?? false;
  const minutes = durationSeconds ? Math.max(1, Math.round(durationSeconds / 60)) : null;
  return (
    <div className="glass rounded-xl p-5">
      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <VideoIcon className="w-4 h-4 text-emerald-600" /> Telehealth Session
      </h3>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-medium text-slate-800 capitalize">{session.status ?? "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Started</dt><dd className="font-medium text-slate-800 text-xs">{fmt(startedAt)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Ended</dt><dd className="font-medium text-slate-800 text-xs">{fmt(endedAt)}</dd></div>
        {minutes !== null && (
          <div className="flex justify-between"><dt className="text-slate-500">Duration</dt><dd className="font-semibold text-slate-900">{minutes} min</dd></div>
        )}
        {admittedAt && (
          <div className="flex justify-between"><dt className="text-slate-500">Admitted</dt><dd className="font-medium text-slate-800 text-xs">{fmt(admittedAt)}</dd></div>
        )}
        {isExternal && (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            BYOV (external link) — no in-app metrics captured.
          </div>
        )}
      </dl>
    </div>
  );
}

// ─── Phase 2: Lab Orders + Referrals (encounter-scoped) ────────────────

// LabOrdersCard — list orders attached to this encounter + inline
// "Order labs" form. Submits to POST /lab-orders with encounter_id +
// patient_id + provider_id pre-filled. Closes the form on success and
// asks the parent to reload so the new row shows up.
//
// Status badge colors are kept in lockstep with the backend's status
// enum (draft / sent / resulted / cancelled).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LabOrdersCard({ orders, encounterId, patientId, providerId, isSigned, onChanged }: { orders: any[]; encounterId: string; patientId: string | null; providerId: string | null; isSigned: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [panelCode, setPanelCode] = useState("");
  const [panelName, setPanelName] = useState("");
  const [priority, setPriority] = useState<"routine" | "urgent" | "stat">("routine");
  const [fasting, setFasting] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const statusBadge = (status: string): { bg: string; color: string } => {
    if (status === "resulted") return { bg: "#dcfce7", color: "#166534" };
    if (status === "sent") return { bg: "#dbeafe", color: "#1e40af" };
    if (status === "cancelled") return { bg: "#fee2e2", color: "#991b1b" };
    return { bg: "#fef3c7", color: "#92400e" }; // draft
  };

  const submit = async () => {
    if (!patientId || !providerId) {
      setErr("Patient or provider missing on this encounter.");
      return;
    }
    if (!panelName.trim()) {
      setErr("Enter a panel name (e.g., CBC, CMP, TSH).");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await labService.create({
      patient_id: patientId,
      provider_id: providerId,
      encounter_id: encounterId,
      priority,
      fasting_required: fasting,
      panels: [{ code: panelCode.trim() || panelName.trim().toUpperCase().replace(/\s+/g, "_"), name: panelName.trim() }],
      special_instructions: instructions.trim() || undefined,
    });
    setSaving(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    setPanelCode("");
    setPanelName("");
    setPriority("routine");
    setFasting(false);
    setInstructions("");
    setOpen(false);
    onChanged();
  };

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-cyan-600" /> Lab Orders
        </h3>
        {!open && !isSigned && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
          >
            <Plus className="w-3.5 h-3.5" /> Order labs
          </button>
        )}
      </div>

      {orders.length === 0 && !open && (
        <div className="text-sm text-slate-400 italic">No labs ordered for this visit.</div>
      )}

      {orders.length > 0 && (
        <div className="space-y-2 mb-3">
          {orders.map((o) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const panels: any[] = Array.isArray(o.panels) ? o.panels : [];
            const panelLabel = panels.map((p) => p.name ?? p.code).filter(Boolean).join(", ") || "—";
            const sb = statusBadge(o.status ?? "draft");
            return (
              <div key={o.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{panelLabel}</div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <span className="capitalize">{o.priority ?? "routine"}</span>
                    {o.fastingRequired && <span className="text-amber-700">Fasting</span>}
                    {o.orderedAt && <span>{new Date(o.orderedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                  </div>
                </div>
                <span
                  className="text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded flex-shrink-0"
                  style={{ backgroundColor: sb.bg, color: sb.color }}
                >
                  {o.status ?? "draft"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-3">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{err}</div>}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Panel name *</label>
              <input
                value={panelName}
                onChange={(e) => setPanelName(e.target.value)}
                placeholder="CBC w/ Diff"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Code</label>
              <input
                value={panelCode}
                onChange={(e) => setPanelCode(e.target.value)}
                placeholder="CBC"
                className="w-full border rounded px-2 py-1.5 text-sm font-mono"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "routine" | "urgent" | "stat")}
              className="border rounded px-2 py-1.5 text-sm"
            >
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-700">
              <input type="checkbox" checked={fasting} onChange={(e) => setFasting(e.target.checked)} />
              Fasting required
            </label>
          </div>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Special instructions (optional)"
            rows={2}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setOpen(false); setErr(null); }}
              className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#0891b2" }}
            >
              <Save className="w-3 h-3" /> {saving ? "Saving…" : "Save order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ReferralsCard — same shape as labs. Encounter-scoped referrals list +
// inline "New referral" form. Submits to POST /referrals.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReferralsCard({ referrals, encounterId, patientId, providerUserId, isSigned, onChanged }: { referrals: any[]; encounterId: string; patientId: string | null; providerUserId: string | null; isSigned: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [referredTo, setReferredTo] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [urgency, setUrgency] = useState<"routine" | "urgent" | "emergent">("routine");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const urgencyBadge = (u: string): { bg: string; color: string } => {
    if (u === "emergent") return { bg: "#fee2e2", color: "#991b1b" };
    if (u === "urgent") return { bg: "#fef3c7", color: "#92400e" };
    return { bg: "#dbeafe", color: "#1e40af" };
  };
  const statusBadge = (s: string): { bg: string; color: string } => {
    if (s === "completed") return { bg: "#dcfce7", color: "#166534" };
    if (s === "sent" || s === "acknowledged" || s === "scheduled") return { bg: "#dbeafe", color: "#1e40af" };
    if (s === "cancelled") return { bg: "#fee2e2", color: "#991b1b" };
    return { bg: "#fef3c7", color: "#92400e" };
  };

  const submit = async () => {
    if (!patientId || !providerUserId) {
      setErr("Patient or referring provider missing on this encounter.");
      return;
    }
    if (!referredTo.trim()) {
      setErr("Enter who you're referring to.");
      return;
    }
    if (!reason.trim()) {
      setErr("Enter a reason for referral.");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await referralService.create({
      patient_id: patientId,
      // Backend expects referring_provider_id to be a USER id, not
      // a Provider model id — encounter.provider.user.id.
      referring_provider_id: providerUserId,
      encounter_id: encounterId,
      referred_to_name: referredTo.trim(),
      referred_to_specialty: specialty.trim() || undefined,
      urgency,
      reason: reason.trim(),
    });
    setSaving(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    setReferredTo("");
    setSpecialty("");
    setUrgency("routine");
    setReason("");
    setOpen(false);
    onChanged();
  };

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Send className="w-4 h-4 text-purple-600" /> Referrals
        </h3>
        {!open && !isSigned && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
          >
            <Plus className="w-3.5 h-3.5" /> New referral
          </button>
        )}
      </div>

      {referrals.length === 0 && !open && (
        <div className="text-sm text-slate-400 italic">No referrals from this visit.</div>
      )}

      {referrals.length > 0 && (
        <div className="space-y-2 mb-3">
          {referrals.map((r) => {
            const ub = urgencyBadge(r.urgency ?? "routine");
            const sb = statusBadge(r.status ?? "draft");
            return (
              <div key={r.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{r.referredToName ?? "—"}</div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    {r.referredToSpecialty && <span>{r.referredToSpecialty}</span>}
                    {r.sentAt && <span>{new Date(r.sentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span
                    className="text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded"
                    style={{ backgroundColor: ub.bg, color: ub.color }}
                  >
                    {r.urgency ?? "routine"}
                  </span>
                  <span
                    className="text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded"
                    style={{ backgroundColor: sb.bg, color: sb.color }}
                  >
                    {r.status ?? "draft"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-3">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{err}</div>}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Referred to *</label>
            <input
              value={referredTo}
              onChange={(e) => setReferredTo(e.target.value)}
              placeholder="Dr. Smith / ABC Cardiology"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Specialty</label>
              <input
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="Cardiology"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Urgency</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as "routine" | "urgent" | "emergent")}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="emergent">Emergent</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Patient reports..."
              rows={2}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setOpen(false); setErr(null); }}
              className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#7c3aed" }}
            >
              <Save className="w-3 h-3" /> {saving ? "Saving…" : "Save referral"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Read-only tabs (unchanged from prior version) ─────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTab({ encounter, onReload }: { encounter: any; onReload: () => void }) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const screenings: any[] = Array.isArray(encounter.screeningResponses)
    ? encounter.screeningResponses
    : Array.isArray(encounter.screening_responses) ? encounter.screening_responses : [];
  const telehealthSession = encounter.appointment?.telehealthSession
    ?? encounter.appointment?.telehealth_session
    ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labOrders: any[] = Array.isArray(encounter.labOrders)
    ? encounter.labOrders
    : Array.isArray(encounter.lab_orders) ? encounter.lab_orders : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const referrals: any[] = Array.isArray(encounter.referrals) ? encounter.referrals : [];
  const isFullyEmpty = !hasAnyChartContent(encounter) && rx.length === 0 && screenings.length === 0 && labOrders.length === 0 && referrals.length === 0;
  // Patient + provider IDs for the inline order/referral forms.
  // The backend's referral endpoint expects a USER id for the
  // referring provider, not the Provider model id — pull through
  // encounter.provider.user.id with a snake_case fallback.
  const patientId = encounter.patient?.id ?? encounter.patientId ?? encounter.patient_id ?? null;
  const providerModelId = encounter.provider?.id ?? encounter.providerId ?? encounter.provider_id ?? null;
  const providerUserId = encounter.provider?.user?.id ?? encounter.provider?.userId ?? encounter.provider?.user_id ?? null;
  const isSigned = !!encounter.signedAt || encounter.status === "signed";

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

        {/* Lab orders + referrals. Inline create form on unsigned
            drafts; read-only list once signed (the cards' isSigned
            prop hides the "+ Order labs" / "+ New referral" buttons).
            Both cards self-hide when there are zero items AND the
            chart is signed — nothing to show or do at that point. */}
        {(labOrders.length > 0 || !isSigned) && (
          <LabOrdersCard
            orders={labOrders}
            encounterId={encounter.id}
            patientId={patientId}
            providerId={providerModelId}
            isSigned={isSigned}
            onChanged={onReload}
          />
        )}
        {(referrals.length > 0 || !isSigned) && (
          <ReferralsCard
            referrals={referrals}
            encounterId={encounter.id}
            patientId={patientId}
            providerUserId={providerUserId}
            isSigned={isSigned}
            onChanged={onReload}
          />
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

        <ScreeningsCard responses={screenings} />
        <TelehealthSessionCard session={telehealthSession} />
      </div>

      {/* Empty-chart nudge — when there's literally nothing on the chart
          yet (auto-drafted from a telehealth call but no SOAP / dx /
          vitals / Rx), show a quick-start instead of a wall of "—
          not documented —" placeholders. The Edit chart button in the
          page header is the obvious next step; we just call it out. */}
      {isFullyEmpty && (
        <div className="lg:col-span-3 -mt-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-5 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-indigo-500 flex-shrink-0" />
          <div className="text-sm text-indigo-900">
            <div className="font-semibold">This chart is empty.</div>
            <div className="text-indigo-800/80">Click <span className="font-semibold">Edit chart</span> at the top right to enter SOAP narrative, vitals, diagnoses, and CPT codes.</div>
          </div>
        </div>
      )}
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

// ─── Documents Tab (patient-scoped, all visits) ────────────────────────
//
// Aggregates everything tied to the patient (across visits) into a
// single chronological list. Five sources, all filtered by patient_id:
//   • Documents (uploaded files)        — /documents?patient_id=
//   • Consent signatures                — /consent-signatures?patient_id=
//   • Pending signature requests        — /signature-requests?patient_id=
//   • Screening responses (PHQ-9/GAD-7) — /screenings?patient_id=
//   • Prescriptions written             — /prescriptions?patient_id=
//
// We label the tab "Patient documents (all visits)" inside the body
// so there's no confusion that this is patient-scoped, not encounter-
// scoped. Lab orders + referrals are deliberately omitted from this
// tab — the Chart tab already shows encounter-specific orders, and
// patient-scoped labs/referrals get their own dedicated PatientPortal
// surfaces. A pure "documents" view = files + signatures + screenings
// + Rx (the artifacts that have a paper analog).

interface DocRow {
  id: string;
  kind: "document" | "consent" | "signature_request" | "screening" | "prescription";
  title: string;
  subtitle: string;
  occurredAt: string | null; // ISO; sortable
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  badge?: { label: string; bg: string; color: string };
}

function PatientDocumentsTab({ patientId, patientName }: { patientId: string | null; patientName: string }) {
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const params = { patient_id: patientId };
      // Fan out — we don't fail the whole tab if one source errors.
      // Each Promise.allSettled slot is mapped independently.
      const [docsR, consentsR, sigR, scrR, rxR] = await Promise.allSettled([
        documentService.list(params),
        consentService.listSignatures({ patient_id: patientId }),
        signatureRequestService.list({ patient_id: patientId }),
        screeningService.list(params),
        prescriptionService.list(params),
      ]);
      if (cancelled) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unwrap = (r: PromiseSettledResult<{ data?: any; error?: string }>): any[] => {
        if (r.status !== "fulfilled") return [];
        const d = r.value?.data;
        if (Array.isArray(d)) return d;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (d && typeof d === "object" && Array.isArray((d as any).data)) return (d as any).data;
        return [];
      };

      const out: DocRow[] = [];

      // Documents (uploaded files) — primary "document" surface.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unwrap(docsR).forEach((d: any) => {
        out.push({
          id: `doc-${d.id}`,
          kind: "document",
          title: d.originalName ?? d.name ?? "Document",
          subtitle: [d.category, d.mimeType].filter(Boolean).join(" · ") || "File",
          occurredAt: d.createdAt ?? d.created_at ?? null,
          actionLabel: "Download",
          onAction: async () => {
            const res = await documentService.download(d.id);
            if (res.data) {
              const url = URL.createObjectURL(res.data);
              const a = document.createElement("a");
              a.href = url;
              a.download = d.originalName ?? d.name ?? "document";
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }
          },
        });
      });

      // Signed consent agreements — link to the bundled PDF.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unwrap(consentsR).forEach((c: any) => {
        const tplName = c.template?.name ?? c.templateName ?? "Consent agreement";
        const isRevoked = !!(c.revokedAt ?? c.revoked_at);
        out.push({
          id: `consent-${c.id}`,
          kind: "consent",
          title: tplName,
          subtitle: isRevoked
            ? `Revoked${c.revokedReason ?? c.revoked_reason ? ` — ${c.revokedReason ?? c.revoked_reason}` : ""}`
            : `Signed via ${c.signatureType ?? c.signature_type ?? "portal"}`,
          occurredAt: c.signedAt ?? c.signed_at ?? null,
          badge: isRevoked
            ? { label: "Revoked", bg: "#fee2e2", color: "#991b1b" }
            : { label: "Signed", bg: "#dcfce7", color: "#166534" },
          actionLabel: "Download PDF",
          onAction: () => consentService.downloadSignaturePdf(c.id, `${tplName}.pdf`),
        });
      });

      // Pending or signed/cancelled signature requests (admin → patient).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unwrap(sigR).forEach((s: any) => {
        const tplName = s.template?.name ?? "Signature request";
        const status = s.status ?? "pending";
        const badge = status === "signed"
          ? { label: "Signed", bg: "#dcfce7", color: "#166534" }
          : status === "expired" || status === "cancelled"
            ? { label: status, bg: "#fee2e2", color: "#991b1b" }
            : { label: "Pending", bg: "#fef3c7", color: "#92400e" };
        out.push({
          id: `sigreq-${s.id}`,
          kind: "signature_request",
          title: tplName,
          subtitle: status === "pending"
            ? `Sent${s.expiresAt || s.expires_at ? `, expires ${new Date(s.expiresAt ?? s.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}`
            : `Requested ${new Date(s.createdAt ?? s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
          occurredAt: s.signedAt ?? s.signed_at ?? s.createdAt ?? s.created_at ?? null,
          badge,
        });
      });

      // Screenings — score + severity already in the row.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unwrap(scrR).forEach((sc: any) => {
        const tplName = sc.template?.name ?? sc.template?.code ?? "Screening";
        const score = sc.score ?? null;
        const sev = sc.severity ?? null;
        out.push({
          id: `screen-${sc.id}`,
          kind: "screening",
          title: tplName,
          subtitle: [
            score !== null ? `Score ${score}` : null,
            sev ? sev.replace(/_/g, " ") : null,
          ].filter(Boolean).join(" · ") || "Completed",
          occurredAt: sc.administeredAt ?? sc.administered_at ?? sc.createdAt ?? sc.created_at ?? null,
        });
      });

      // Prescriptions — most recent first; status badge surfaces
      // active vs discontinued.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unwrap(rxR).forEach((p: any) => {
        const med = p.medicationName ?? p.medication_name ?? p.drugName ?? p.drug_name ?? "Medication";
        const dose = [p.dosage, p.frequency].filter(Boolean).join(" · ");
        const status = p.status ?? "active";
        const badge = status === "active"
          ? { label: "Active", bg: "#dcfce7", color: "#166534" }
          : status === "discontinued"
            ? { label: "D/C", bg: "#fee2e2", color: "#991b1b" }
            : { label: status, bg: "#f1f5f9", color: "#475569" };
        out.push({
          id: `rx-${p.id}`,
          kind: "prescription",
          title: med,
          subtitle: dose || "—",
          occurredAt: p.prescribedAt ?? p.prescribed_at ?? p.createdAt ?? p.created_at ?? null,
          badge,
        });
      });

      // Sort newest-first. Rows with no timestamp sink to the bottom.
      out.sort((a, b) => {
        if (!a.occurredAt && !b.occurredAt) return 0;
        if (!a.occurredAt) return 1;
        if (!b.occurredAt) return -1;
        return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
      });

      setRows(out);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  if (!patientId) {
    return (
      <div className="glass rounded-xl p-8 text-center text-slate-400 text-sm">
        Patient is missing on this encounter — can't list documents.
      </div>
    );
  }

  if (loading) {
    return <div className="glass rounded-xl p-8 text-center text-slate-400 text-sm">Loading documents…</div>;
  }

  if (error) {
    return <div className="glass rounded-xl p-6 text-sm text-red-700">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Patient documents (all visits)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Files, consents, signature requests, screenings, and prescriptions for {patientName}.
          </p>
        </div>
        <span className="text-xs text-slate-500">{rows.length} item{rows.length === 1 ? "" : "s"}</span>
      </div>

      {rows.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center">
          <Folder className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <div className="text-sm text-slate-500">No documents on file for this patient yet.</div>
        </div>
      ) : (
        <div className="glass rounded-xl divide-y divide-slate-100">
          {rows.map((r) => (
            <DocumentRow key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentRow({ row }: { row: DocRow }) {
  const Icon = (() => {
    switch (row.kind) {
      case "document": return FileText;
      case "consent": return FileSignature;
      case "signature_request": return FileBadge;
      case "screening": return Brain;
      case "prescription": return Pill;
      default: return FileText;
    }
  })();
  const iconColor = (() => {
    switch (row.kind) {
      case "document": return "#2563eb";
      case "consent": return "#0891b2";
      case "signature_request": return "#d97706";
      case "screening": return "#6366f1";
      case "prescription": return "#16a34a";
      default: return "#64748b";
    }
  })();
  const kindLabel = (() => {
    switch (row.kind) {
      case "document": return "File";
      case "consent": return "Consent";
      case "signature_request": return "E-sig";
      case "screening": return "Screening";
      case "prescription": return "Rx";
    }
  })();
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${iconColor}15` }}
      >
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            {kindLabel}
          </span>
          <div className="text-sm font-medium text-slate-800 truncate">{row.title}</div>
        </div>
        <div className="text-xs text-slate-500 truncate">{row.subtitle}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {row.badge && (
          <span
            className="text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded"
            style={{ backgroundColor: row.badge.bg, color: row.badge.color }}
          >
            {row.badge.label}
          </span>
        )}
        {row.occurredAt && (
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            {new Date(row.occurredAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
          </span>
        )}
        {row.actionLabel && row.onAction && (
          <button
            onClick={() => { void row.onAction?.(); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-indigo-700 hover:bg-indigo-50"
          >
            {row.kind === "document" ? <Download className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
            {row.actionLabel}
          </button>
        )}
      </div>
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
