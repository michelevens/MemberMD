import { useEffect, useState } from "react";
import {
  ArrowLeft, FileText, DollarSign, Activity, ClipboardList,
  Calendar, User, ShieldAlert, CheckCircle2, AlertCircle, Pill,
} from "lucide-react";
import { encounterService } from "../../lib/api";

interface EncounterDetailPageProps {
  encounterId: string;
  onBack: () => void;
}

type TabId = "chart" | "billing" | "appointment" | "audit";

export function EncounterDetailPage({ encounterId, onBack }: EncounterDetailPageProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [encounter, setEncounter] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("chart");

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
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [encounterId]);

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
              Encounter — {patientName}
            </h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 flex-wrap">
              <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(encounter.encounterDate)}</span>
              <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{providerName}</span>
              {encounter.encounterType && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                  {encounter.encounterType.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: badge.bg, color: badge.color }}
          >
            {isAmended && <ShieldAlert className="w-3.5 h-3.5" />}
            {isSigned && !isAmended && <CheckCircle2 className="w-3.5 h-3.5" />}
            {badge.label}
          </span>
        </div>

        {isAmended && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-900">
              <div className="font-semibold">Amended on {formatDateTime(encounter.amendedAt)}</div>
              {encounter.amendmentReason && <div className="mt-0.5">Reason: {encounter.amendmentReason}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
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

      {activeTab === "chart" && <ChartTab encounter={encounter} />}
      {activeTab === "billing" && <BillingTab encounter={encounter} />}
      {activeTab === "appointment" && <AppointmentTab encounter={encounter} />}
      {activeTab === "audit" && <AuditTab logs={auditLogs} />}
    </div>
  );
}

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
