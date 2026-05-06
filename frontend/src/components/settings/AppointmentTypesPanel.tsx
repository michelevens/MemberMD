// AppointmentTypesPanel — Practice Settings → Clinical Config tab.
//
// CRUD on appointment types + the Sprint 1 required-documents gate.
// Each type can have a list of required consents/screenings; when
// configured, the patient-facing booking widget runs a pre-flight
// before letting them pick a slot, surfacing missing items.
//
// Backend endpoints:
//   GET    /appointment-types
//   POST   /appointment-types
//   PUT    /appointment-types/{id}
//   DELETE /appointment-types/{id}    (soft — sets is_active=false)
//
// Reference data (read-only here):
//   GET /consent-templates
//   GET /screening-templates

import { useEffect, useState } from "react";
import {
  Plus, Trash2, FileCheck, ClipboardList, Save, X, Loader2, Edit2,
  Video, Building2, Crown,
} from "lucide-react";
import { appointmentService, apiFetch, stripeConnectService } from "../../lib/api";
import type { AppointmentType, RequiredDocumentSpec } from "../../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Toast = (msg: { message: string; type: "success" | "error" }) => void;

interface ConsentTemplateLite { id: string; name: string }
interface ScreeningTemplateLite { id: string; name: string }

interface Props { setToast: Toast }

export function AppointmentTypesPanel({ setToast }: Props) {
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [consentTemplates, setConsentTemplates] = useState<ConsentTemplateLite[]>([]);
  const [screeningTemplates, setScreeningTemplates] = useState<ScreeningTemplateLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  // Stripe Connect readiness — gates the cash-pay toggle in the
  // form. We read it once on mount; if the practice connects Stripe
  // mid-session, they can refresh the page to clear the gate.
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);

  const reload = async () => {
    setLoading(true);
    const [typesRes, consentsRes, screeningsRes, stripeRes] = await Promise.all([
      appointmentService.getTypes(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiFetch<any>("/consent-templates").catch(() => ({ data: [] })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiFetch<any>("/screening-templates").catch(() => ({ data: [] })),
      // Non-fatal — if status fetch fails (auth, network), assume
      // not-ready and let the form show the warning. Better to
      // over-warn than let the practice ship a broken type.
      stripeConnectService.status().catch(() => ({ data: null })),
    ]);
    if (typesRes.data) setTypes(typesRes.data);
    setStripeReady(stripeRes.data?.canAcceptPayments ?? false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unwrap = (raw: any): any[] => {
      if (Array.isArray(raw)) return raw;
      if (raw?.data && Array.isArray(raw.data)) return raw.data;
      return [];
    };
    setConsentTemplates(unwrap(consentsRes.data).map((c) => ({
      id: c.id,
      name: c.name ?? c.title ?? "(unnamed)",
    })));
    setScreeningTemplates(unwrap(screeningsRes.data).map((s) => ({
      id: s.id,
      name: s.name ?? s.title ?? s.code ?? "(unnamed)",
    })));
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const handleSave = async (data: Partial<AppointmentType>, id: string | "new") => {
    const res = id === "new"
      ? await appointmentService.createType(data)
      : await appointmentService.updateType(id, data);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
      return;
    }
    setToast({ message: id === "new" ? "Appointment type created." : "Saved.", type: "success" });
    setEditingId(null);
    await reload();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deactivate this appointment type? Existing appointments keep their data.")) return;
    const res = await appointmentService.deleteType(id);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
      return;
    }
    setToast({ message: "Deactivated.", type: "success" });
    await reload();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading appointment types…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Appointment Types</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Visit types patients can book. Optionally require consents or screenings before a type can be booked.
          </p>
        </div>
        {editingId !== "new" && (
          <button
            type="button"
            onClick={() => setEditingId("new")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: "#635bff" }}
          >
            <Plus className="w-3.5 h-3.5" /> New type
          </button>
        )}
      </div>

      {editingId === "new" && (
        <TypeEditor
          consentTemplates={consentTemplates}
          screeningTemplates={screeningTemplates}
          initial={null}
          stripeReady={stripeReady}
          onCancel={() => setEditingId(null)}
          onSave={(data) => handleSave(data, "new")}
        />
      )}

      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white divide-y divide-slate-100">
        {types.length === 0 && editingId !== "new" && (
          <div className="px-4 py-6 text-sm text-slate-400 text-center">
            No types yet. Click "New type" to add one.
          </div>
        )}
        {types.map((t) => {
          const isEditing = editingId === t.id;
          if (isEditing) {
            return (
              <TypeEditor
                key={t.id}
                consentTemplates={consentTemplates}
                screeningTemplates={screeningTemplates}
                initial={t}
                stripeReady={stripeReady}
                onCancel={() => setEditingId(null)}
                onSave={(data) => handleSave(data, t.id)}
              />
            );
          }
          return (
            <div key={t.id} className="px-4 py-3 flex items-center gap-3">
              <span className="w-2 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || "#94a3b8" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 flex items-center gap-2 flex-wrap">
                  {t.name}
                  <span className="text-xs text-slate-400">{t.durationMinutes} min</span>
                  {t.isTeleHealth && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                      <Video className="w-2.5 h-2.5" /> Telehealth
                    </span>
                  )}
                  {!t.isTeleHealth && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-600">
                      <Building2 className="w-2.5 h-2.5" /> In-office
                    </span>
                  )}
                  {t.requiresMembership && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                      <Crown className="w-2.5 h-2.5" /> Members
                    </span>
                  )}
                </div>
                {Array.isArray(t.requiredDocuments) && t.requiredDocuments.length > 0 && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    Required: {t.requiredDocuments.length} document{t.requiredDocuments.length === 1 ? "" : "s"}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditingId(t.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <Edit2 className="w-3 h-3" /> Edit
              </button>
              <button
                type="button"
                onClick={() => handleDelete(t.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3 h-3" /> Deactivate
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Editor row ───────────────────────────────────────────────────────

function TypeEditor({
  initial, consentTemplates, screeningTemplates, stripeReady, onCancel, onSave,
}: {
  initial: AppointmentType | null;
  consentTemplates: ConsentTemplateLite[];
  screeningTemplates: ScreeningTemplateLite[];
  // null = still loading, true = ready, false = needs setup. Drives
  // the cash-pay toggle gate. We block the toggle when explicitly
  // false; null is treated as "still loading, optimistically allow"
  // so the UI doesn't briefly disable the toggle on every render.
  stripeReady: boolean | null;
  onCancel: () => void;
  onSave: (data: Partial<AppointmentType>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [durationMinutes, setDurationMinutes] = useState(initial?.durationMinutes ?? 30);
  const [color, setColor] = useState(initial?.color ?? "#27ab83");
  const [isTeleHealth, setIsTeleHealth] = useState(initial?.isTeleHealth ?? false);
  const [requiresMembership, setRequiresMembership] = useState(initial?.requiresMembership ?? false);
  // is_public exposes this visit type on the public booking widget.
  // Default off so the widget doesn't surface internal-only types
  // (e.g. provider-only follow-ups) to website visitors. Practice
  // admin opts in per type.
  const [isPublic, setIsPublic] = useState((initial as { isPublic?: boolean } | undefined)?.isPublic ?? false);
  // Cash-pay (one-time, pre-pay via Stripe Checkout). Two fields move
  // together — toggle + price. Price held as a string here so the
  // user can type freely; we convert to cents on submit.
  const initCash = initial as { cashPayEnabled?: boolean; cashPriceCents?: number } | undefined;
  const [cashPayEnabled, setCashPayEnabled] = useState(initCash?.cashPayEnabled ?? false);
  const [cashPriceDollars, setCashPriceDollars] = useState<string>(
    initCash?.cashPriceCents != null ? (initCash.cashPriceCents / 100).toFixed(2) : ""
  );
  const [requiredDocs, setRequiredDocs] = useState<RequiredDocumentSpec[]>(
    initial?.requiredDocuments ?? [],
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    // Cash-pay sanity — backend also enforces, but catch this in the
    // UI so the form doesn't bounce with a 422.
    if (cashPayEnabled) {
      const dollars = parseFloat(cashPriceDollars);
      if (!Number.isFinite(dollars) || dollars < 1) {
        // eslint-disable-next-line no-alert
        alert("Set a cash price of at least $1.00 before saving.");
        return;
      }
    }
    setSubmitting(true);
    onSave({
      name: name.trim(),
      durationMinutes,
      color,
      isTeleHealth,
      requiresMembership,
      requiredDocuments: requiredDocs.length > 0 ? requiredDocs : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isPublic,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cashPayEnabled,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cashPriceCents: cashPayEnabled
        ? Math.round(parseFloat(cashPriceDollars) * 100)
        : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cashCurrency: "usd",
    } as any);
  };

  // Templates that aren't already in the requiredDocs list — used by the
  // "Add" picker to avoid duplicate selections.
  const availableConsents = consentTemplates.filter(
    (c) => !requiredDocs.some((d) => d.kind === "consent_template" && d.id === c.id),
  );
  const availableScreenings = screeningTemplates.filter(
    (s) => !requiredDocs.some((d) => d.kind === "screening_template" && d.id === s.id),
  );

  const addRequirement = (kind: RequiredDocumentSpec["kind"], id: string) => {
    setRequiredDocs([...requiredDocs, { kind, id, blocksBooking: true, freshnessDays: null }]);
  };
  const removeRequirement = (idx: number) => {
    setRequiredDocs(requiredDocs.filter((_, i) => i !== idx));
  };
  const updateRequirement = (idx: number, patch: Partial<RequiredDocumentSpec>) => {
    setRequiredDocs(requiredDocs.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const lookupName = (kind: RequiredDocumentSpec["kind"], id: string): string => {
    if (kind === "consent_template") return consentTemplates.find((c) => c.id === id)?.name ?? "(removed)";
    return screeningTemplates.find((s) => s.id === id)?.name ?? "(removed)";
  };

  return (
    <div className="px-4 py-4 bg-slate-50 border-l-4 border-indigo-400 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Initial Psychiatric Eval"
            maxLength={100}
            className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Duration (min)</label>
          <input
            type="number"
            min={5}
            max={480}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 30)}
            className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 bg-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full h-9 rounded-md border border-slate-200 bg-white cursor-pointer"
          />
        </div>
        <div className="flex flex-col gap-2 pb-1">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isTeleHealth}
              onChange={(e) => setIsTeleHealth(e.target.checked)}
              className="rounded border-slate-300"
            />
            Telehealth (default)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresMembership}
              onChange={(e) => setRequiresMembership(e.target.checked)}
              className="rounded border-slate-300"
            />
            Requires active membership
          </label>
          {/* Public booking widget visibility — gates this visit type
              on the embeddable /book/{tenantCode} page. Off by default
              so internal-only types stay internal until the practice
              opts in. */}
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>
              Allow public booking
              <span className="text-xs text-slate-400 ml-1">(shows on the website widget)</span>
            </span>
          </label>
        </div>
      </div>

      {/* Cash-pay (one-time, pre-pay via Stripe Checkout). Disabled
          by default; when enabled the booking widget routes the
          visitor through Checkout before confirming the slot. */}
      <div className="border-t border-slate-200 pt-3">
        {/* Stripe Connect gate. Block the toggle when stripeReady is
            explicitly false (canAcceptPayments=false on the status
            endpoint). null means we're still loading or the call
            failed — be optimistic in that case so we don't lock
            existing users out on a transient network blip. */}
        {stripeReady === false && !cashPayEnabled && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 mb-2 flex items-start gap-2">
            <span className="text-amber-600 text-sm flex-shrink-0">⚠</span>
            <div className="text-xs text-amber-900 flex-1">
              <p className="font-semibold mb-0.5">Stripe Connect setup required</p>
              <p className="text-amber-800">
                Connect Stripe in{" "}
                <a href="#/practice/settings?tab=payments" className="underline font-medium">Settings → Payments</a>{" "}
                to enable cash-pay visit types. Without an active Connect account, payments can't be processed.
              </p>
            </div>
          </div>
        )}
        <label
          className={`flex items-center gap-2 text-sm cursor-pointer mb-2 ${stripeReady === false && !cashPayEnabled ? "opacity-50 cursor-not-allowed" : "text-slate-700"}`}
        >
          <input
            type="checkbox"
            checked={cashPayEnabled}
            disabled={stripeReady === false && !cashPayEnabled}
            onChange={(e) => setCashPayEnabled(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span className="font-medium">
            Cash-pay (one-time payment)
            <span className="text-xs font-normal text-slate-400 ml-1">— visitor pays via Stripe before the slot is confirmed</span>
          </span>
        </label>
        {cashPayEnabled && (
          <div className="ml-6 pl-3 border-l-2 border-slate-100 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Price</span>
              <div className="flex items-center">
                <span className="text-sm text-slate-500 px-2 py-1.5 border border-r-0 border-slate-200 rounded-l-md bg-slate-50">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="1.00"
                  max="10000"
                  value={cashPriceDollars}
                  onChange={(e) => setCashPriceDollars(e.target.value)}
                  placeholder="150.00"
                  className="w-28 border border-slate-200 rounded-r-md px-2 py-1.5 text-sm"
                />
              </div>
              <span className="text-xs text-slate-400">USD</span>
            </div>
            {/* If the practice TURNED OFF Stripe after enabling cash-
                pay on this type (rare but possible), warn them inline
                so they don't ship a broken type. */}
            {stripeReady === false && (
              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                ⚠ Stripe Connect isn't active. Visitors will see "practice not yet set up to accept payments" until you{" "}
                <a href="#/practice/settings?tab=payments" className="underline font-medium">connect Stripe</a>.
              </div>
            )}
            <p className="text-[11px] text-slate-500 leading-relaxed">
              The price visitors see on the booking widget. No subscription is created — this is a single transaction.
            </p>
          </div>
        )}
      </div>

      {/* Required Documents picker */}
      <div className="border-t border-slate-200 pt-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Required documents <span className="text-[10px] font-normal lowercase text-slate-400">(checked at booking before the patient sees the calendar)</span>
        </label>

        {requiredDocs.length === 0 && (
          <div className="text-xs text-slate-400 italic mb-2">No required documents. Patients book this type with no pre-flight checks.</div>
        )}

        <div className="space-y-2">
          {requiredDocs.map((doc, idx) => (
            <div key={`${doc.kind}-${doc.id}-${idx}`} className="bg-white border border-slate-200 rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                {doc.kind === "consent_template" ? (
                  <FileCheck className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                ) : (
                  <ClipboardList className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                )}
                <span className="text-sm text-slate-800 flex-1 truncate">{lookupName(doc.kind, doc.id)}</span>
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                  {doc.kind === "consent_template" ? "Consent" : "Screening"}
                </span>
                <button
                  type="button"
                  onClick={() => removeRequirement(idx)}
                  className="p-0.5 rounded hover:bg-slate-100 text-slate-400"
                  title="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="text-xs text-slate-600">
                  Re-collect every (days)
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    placeholder="never"
                    value={doc.freshnessDays ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : parseInt(e.target.value, 10);
                      updateRequirement(idx, { freshnessDays: v && v > 0 ? v : null });
                    }}
                    className="w-full mt-0.5 px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                  />
                </label>
                <label className="flex items-end gap-1.5 text-xs text-slate-600 pb-1">
                  <input
                    type="checkbox"
                    checked={doc.blocksBooking ?? true}
                    onChange={(e) => updateRequirement(idx, { blocksBooking: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  Block booking until satisfied
                </label>
              </div>
            </div>
          ))}
        </div>

        {/* Add picker */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {availableConsents.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  addRequirement("consent_template", e.target.value);
                  e.currentTarget.value = "";
                }
              }}
              className="px-2 py-1.5 text-xs rounded border border-slate-200 bg-white"
            >
              <option value="">+ Add consent…</option>
              {availableConsents.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {availableScreenings.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  addRequirement("screening_template", e.target.value);
                  e.currentTarget.value = "";
                }
              }}
              className="px-2 py-1.5 text-xs rounded border border-slate-200 bg-white"
            >
              <option value="">+ Add screening…</option>
              {availableScreenings.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {availableConsents.length === 0 && availableScreenings.length === 0 && requiredDocs.length === 0 && (
            <span className="text-xs text-slate-400 italic">No consent or screening templates exist yet — create some first.</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#635bff" }}
        >
          <Save className="w-3.5 h-3.5" />
          {submitting ? "Saving…" : initial ? "Save changes" : "Create type"}
        </button>
      </div>
    </div>
  );
}
