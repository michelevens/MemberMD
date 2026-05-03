// ===== Operator Plan Templates =====
// Operator-defined master plan templates that tenants inherit from.
// List/create/edit/publish/archive + lock matrix + price bounds.
// Apply to tenant + sync to all linked plans.

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  ChevronRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  Send,
  Archive,
  RefreshCw,
  X,
  Save,
  FileText,
} from "lucide-react";
import {
  masterPlanTemplateService,
  LOCKABLE_TEMPLATE_FIELDS,
  type MasterPlanTemplate,
  type LockableField,
  type TemplateStatus,
  type OperatorMe,
} from "../../../lib/api";
import { useConfirm } from "../../shared/ConfirmDialog";

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  navy700: "#334e68",
  teal500: "#27ab83",
  teal600: "#147d64",
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  red500: "#ef4444",
  red50: "#fef2f2",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  amber800: "#92400e",
  green500: "#22c55e",
  green50: "#f0fdf4",
  green700: "#15803d",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toast(msg: string, kind: "success" | "error" = "success") {
  const el = document.createElement("div");
  el.textContent = msg;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: kind === "success" ? C.navy900 : C.red500,
    color: C.white,
    padding: "10px 20px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "500",
    zIndex: "9999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    transition: "opacity 0.3s",
    opacity: "1",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

const FIELD_LABELS: Record<LockableField, string> = {
  name: "Plan name",
  description: "Description",
  badge_text: "Badge text",
  monthly_price: "Monthly price",
  annual_price: "Annual price",
  visits_per_month: "Visits per month",
  telehealth_included: "Telehealth included",
  messaging_included: "Messaging included",
  messaging_response_sla_hours: "Message response SLA (hours)",
  crisis_support: "Crisis support",
  lab_discount_pct: "Lab discount %",
  prescription_management: "Prescription management",
  specialist_referrals: "Specialist referrals",
  care_plan_included: "Care plan included",
  visit_rollover: "Visit rollover",
  overage_fee: "Overage fee",
  family_eligible: "Family eligible",
  family_member_price: "Family member price",
  min_commitment_months: "Min. commitment (months)",
  features_list: "Features list",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function OperatorPlanTemplates({ me }: { me: OperatorMe }) {
  const [templates, setTemplates] = useState<MasterPlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MasterPlanTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await masterPlanTemplateService.list();
    if (res.error) setError(res.error);
    if (res.data) setTemplates(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setEditing(null);
    setCreating(false);
    await load();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: C.slate400 }} /></div>;
  }

  if (error) {
    return <ErrorPanel message={error} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: C.slate500 }}>
          {templates.length} {templates.length === 1 ? "template" : "templates"} across {me.operator.tenantCount} {me.operator.tenantCount === 1 ? "clinic" : "clinics"}
        </p>
        {me.canWrite && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
            style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
          >
            <Plus className="w-4 h-4" />
            New template
          </button>
        )}
      </div>

      {templates.length === 0 && (
        <div
          className="rounded-2xl border p-12 text-center"
          style={{ backgroundColor: C.white, borderColor: C.slate200 }}
        >
          <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: C.slate400 }} />
          <p className="text-sm font-medium" style={{ color: C.navy900 }}>No plan templates yet</p>
          <p className="text-xs mt-1" style={{ color: C.slate500 }}>
            Create a master template to enforce consistent plan structures across all your clinics.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            canWrite={me.canWrite}
            onSelect={() => setEditing(t)}
            onChanged={load}
          />
        ))}
      </div>

      {(editing || creating) && (
        <TemplateEditor
          template={editing}
          canWrite={me.canWrite}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={onSave}
        />
      )}
    </div>
  );
}

// ─── Template Card ──────────────────────────────────────────────────────────

function TemplateCard({
  template,
  canWrite,
  onSelect,
  onChanged,
}: {
  template: MasterPlanTemplate;
  canWrite: boolean;
  onSelect: () => void;
  onChanged: () => void;
}) {
  const [acting, setActing] = useState<string | null>(null);
  const confirm = useConfirm();

  const publish = async () => {
    setActing("publish");
    const res = await masterPlanTemplateService.publish(template.id);
    setActing(null);
    if (res.error) {
      toast(res.error, "error");
    } else {
      toast("Template published.");
      onChanged();
    }
  };

  const syncAll = async () => {
    const ok = await confirm({
      title: "Sync defaults to all linked plans?",
      message: `Push current defaults to all ${template.plansCount ?? 0} linked plans. Tenant overrides are preserved.`,
      confirmLabel: "Sync all",
      variant: "warning",
    });
    if (!ok) return;
    setActing("sync");
    const res = await masterPlanTemplateService.syncAll(template.id);
    setActing(null);
    if (res.error) {
      toast(res.error, "error");
    } else {
      toast(`Synced ${res.data?.plansSynced ?? 0} plans.`);
      onChanged();
    }
  };

  const archive = async () => {
    const ok = await confirm({
      title: "Archive this template?",
      message: "Linked plans keep their values but no longer receive updates.",
      confirmLabel: "Archive",
      variant: "warning",
    });
    if (!ok) return;
    setActing("archive");
    const res = await masterPlanTemplateService.archive(template.id);
    setActing(null);
    if (res.error) {
      toast(res.error, "error");
    } else {
      toast("Template archived.");
      onChanged();
    }
  };

  return (
    <div
      className="rounded-2xl border p-5 hover:shadow-md transition-shadow"
      style={{ backgroundColor: C.white, borderColor: C.slate200 }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold truncate" style={{ color: C.navy900 }}>{template.name}</h3>
            <StatusBadge status={template.status} />
            {template.badgeText && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ backgroundColor: "rgba(39,171,131,0.15)", color: C.teal600 }}
              >
                {template.badgeText}
              </span>
            )}
          </div>
          {template.description && (
            <p className="text-xs mt-1" style={{ color: C.slate500 }}>{template.description}</p>
          )}
        </div>
        <button
          onClick={onSelect}
          className="p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
          title={canWrite ? "Edit" : "View"}
        >
          <ChevronRight className="w-4 h-4" style={{ color: C.slate400 }} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Monthly" value={`$${template.defaultMonthlyPrice.toFixed(0)}`} />
        <Stat label="Visits/mo" value={String(template.defaultVisitsPerMonth)} />
        <Stat label="Linked" value={String(template.plansCount ?? 0)} />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs" style={{ color: C.slate500 }}>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Lock className="w-3 h-3" />
            {template.lockedFields.length} locked
          </span>
          <span>v{template.version}</span>
        </div>

        {canWrite && (
          <div className="flex items-center gap-1">
            {template.status === "draft" && (
              <button
                onClick={publish}
                disabled={acting === "publish"}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors hover:bg-slate-50"
                style={{ color: C.teal600 }}
              >
                {acting === "publish" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Publish
              </button>
            )}
            {template.status === "published" && (template.plansCount ?? 0) > 0 && (
              <button
                onClick={syncAll}
                disabled={acting === "sync"}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors hover:bg-slate-50"
                style={{ color: C.navy700 }}
              >
                {acting === "sync" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Sync all
              </button>
            )}
            {template.status !== "archived" && (
              <button
                onClick={archive}
                disabled={acting === "archive"}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-red-50"
                style={{ color: C.red500 }}
              >
                <Archive className="w-3 h-3" />
                Archive
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-2.5 py-2 border"
      style={{ borderColor: C.slate200, backgroundColor: C.slate50 }}
    >
      <p className="text-xs" style={{ color: C.slate500 }}>{label}</p>
      <p className="text-sm font-semibold mt-0.5" style={{ color: C.navy900 }}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: TemplateStatus }) {
  const cfg: Record<TemplateStatus, { label: string; bg: string; color: string }> = {
    draft: { label: "Draft", bg: C.slate100, color: C.slate500 },
    published: { label: "Published", bg: C.green50, color: C.green700 },
    archived: { label: "Archived", bg: C.amber50, color: C.amber800 },
  };
  const c = cfg[status];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: c.bg, color: c.color }}>
      {c.label}
    </span>
  );
}

// ─── Editor Modal ───────────────────────────────────────────────────────────

interface EditorState {
  name: string;
  description: string;
  badge_text: string;
  default_monthly_price: number;
  default_annual_price: number | null;
  default_visits_per_month: number;
  default_telehealth_included: boolean;
  default_messaging_included: boolean;
  default_messaging_response_sla_hours: number | null;
  default_crisis_support: boolean;
  default_lab_discount_pct: number | null;
  default_prescription_management: boolean;
  default_specialist_referrals: boolean;
  default_care_plan_included: boolean;
  default_visit_rollover: boolean;
  default_overage_fee: number | null;
  default_family_eligible: boolean;
  default_family_member_price: number | null;
  default_min_commitment_months: number | null;
  default_features_list: string[];
  locked_fields: LockableField[];
  monthly_price_min: number | null;
  monthly_price_max: number | null;
  annual_price_min: number | null;
  annual_price_max: number | null;
}

function defaultState(): EditorState {
  return {
    name: "",
    description: "",
    badge_text: "",
    default_monthly_price: 99,
    default_annual_price: 990,
    default_visits_per_month: 4,
    default_telehealth_included: true,
    default_messaging_included: true,
    default_messaging_response_sla_hours: 24,
    default_crisis_support: false,
    default_lab_discount_pct: 0,
    default_prescription_management: true,
    default_specialist_referrals: false,
    default_care_plan_included: false,
    default_visit_rollover: false,
    default_overage_fee: null,
    default_family_eligible: false,
    default_family_member_price: null,
    default_min_commitment_months: null,
    default_features_list: [],
    locked_fields: [],
    monthly_price_min: null,
    monthly_price_max: null,
    annual_price_min: null,
    annual_price_max: null,
  };
}

function fromTemplate(t: MasterPlanTemplate): EditorState {
  return {
    name: t.name,
    description: t.description ?? "",
    badge_text: t.badgeText ?? "",
    default_monthly_price: t.defaultMonthlyPrice,
    default_annual_price: t.defaultAnnualPrice,
    default_visits_per_month: t.defaultVisitsPerMonth,
    default_telehealth_included: t.defaultTelehealthIncluded,
    default_messaging_included: t.defaultMessagingIncluded,
    default_messaging_response_sla_hours: t.defaultMessagingResponseSlaHours,
    default_crisis_support: t.defaultCrisisSupport,
    default_lab_discount_pct: t.defaultLabDiscountPct,
    default_prescription_management: t.defaultPrescriptionManagement,
    default_specialist_referrals: t.defaultSpecialistReferrals,
    default_care_plan_included: t.defaultCarePlanIncluded,
    default_visit_rollover: t.defaultVisitRollover,
    default_overage_fee: t.defaultOverageFee,
    default_family_eligible: t.defaultFamilyEligible,
    default_family_member_price: t.defaultFamilyMemberPrice,
    default_min_commitment_months: t.defaultMinCommitmentMonths,
    default_features_list: t.defaultFeaturesList ?? [],
    locked_fields: t.lockedFields,
    monthly_price_min: t.monthlyPriceMin,
    monthly_price_max: t.monthlyPriceMax,
    annual_price_min: t.annualPriceMin,
    annual_price_max: t.annualPriceMax,
  };
}

function TemplateEditor({
  template,
  canWrite,
  onClose,
  onSaved,
}: {
  template: MasterPlanTemplate | null;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, setState] = useState<EditorState>(template ? fromTemplate(template) : defaultState());
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"defaults" | "locks" | "bounds">("defaults");
  const isCreating = !template;
  const readOnly = !canWrite;

  const update = <K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  };

  const toggleLock = (field: LockableField) => {
    setState((s) => ({
      ...s,
      locked_fields: s.locked_fields.includes(field)
        ? s.locked_fields.filter((f) => f !== field)
        : [...s.locked_fields, field],
    }));
  };

  const save = async () => {
    if (!state.name.trim()) {
      toast("Name is required.", "error");
      return;
    }
    setSaving(true);
    const payload = state as unknown as Partial<MasterPlanTemplate>;
    const res = isCreating
      ? await masterPlanTemplateService.create(payload)
      : await masterPlanTemplateService.update(template!.id, payload);
    setSaving(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast(isCreating ? "Template created." : "Template updated.");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ backgroundColor: "rgba(16,42,67,0.5)" }} onClick={onClose}>
      <div
        className="ml-auto w-full max-w-2xl h-full overflow-y-auto"
        style={{ backgroundColor: C.white, boxShadow: "-12px 0 32px rgba(16,42,67,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.slate500 }}>
              {isCreating ? "New plan template" : `Editing ${template?.name}`}
            </p>
            {template && (
              <p className="text-xs mt-0.5" style={{ color: C.slate400 }}>
                v{template.version} · {template.plansCount ?? 0} linked plan{(template.plansCount ?? 0) === 1 ? "" : "s"}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-50 transition-colors">
            <X className="w-5 h-5" style={{ color: C.slate500 }} />
          </button>
        </div>

        <div className="px-6 py-4 border-b" style={{ borderColor: C.slate200 }}>
          <div className="inline-flex rounded-lg border" style={{ borderColor: C.slate200, padding: "2px" }}>
            {(["defaults", "locks", "bounds"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize"
                style={{
                  backgroundColor: tab === t ? C.navy700 : "transparent",
                  color: tab === t ? C.white : C.slate500,
                }}
              >
                {t === "defaults" ? "Defaults" : t === "locks" ? "Lock matrix" : "Price bounds"}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {tab === "defaults" && (
            <>
              <Field label="Name *">
                <Input value={state.name} onChange={(v) => update("name", v)} disabled={readOnly} />
              </Field>
              <Field label="Description">
                <Textarea value={state.description} onChange={(v) => update("description", v)} disabled={readOnly} rows={2} />
              </Field>
              <Field label="Badge text">
                <Input value={state.badge_text} onChange={(v) => update("badge_text", v)} disabled={readOnly} placeholder="e.g. Most popular" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Monthly price (USD)">
                  <Input type="number" value={String(state.default_monthly_price)} onChange={(v) => update("default_monthly_price", Number(v))} disabled={readOnly} />
                </Field>
                <Field label="Annual price (USD)">
                  <Input type="number" value={String(state.default_annual_price ?? "")} onChange={(v) => update("default_annual_price", v === "" ? null : Number(v))} disabled={readOnly} />
                </Field>
              </div>

              <Field label="Visits per month">
                <Input type="number" value={String(state.default_visits_per_month)} onChange={(v) => update("default_visits_per_month", Number(v))} disabled={readOnly} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Toggle label="Telehealth included" value={state.default_telehealth_included} onChange={(v) => update("default_telehealth_included", v)} disabled={readOnly} />
                <Toggle label="Messaging included" value={state.default_messaging_included} onChange={(v) => update("default_messaging_included", v)} disabled={readOnly} />
                <Toggle label="Crisis support" value={state.default_crisis_support} onChange={(v) => update("default_crisis_support", v)} disabled={readOnly} />
                <Toggle label="Prescription mgmt" value={state.default_prescription_management} onChange={(v) => update("default_prescription_management", v)} disabled={readOnly} />
                <Toggle label="Specialist referrals" value={state.default_specialist_referrals} onChange={(v) => update("default_specialist_referrals", v)} disabled={readOnly} />
                <Toggle label="Care plan included" value={state.default_care_plan_included} onChange={(v) => update("default_care_plan_included", v)} disabled={readOnly} />
                <Toggle label="Visit rollover" value={state.default_visit_rollover} onChange={(v) => update("default_visit_rollover", v)} disabled={readOnly} />
                <Toggle label="Family eligible" value={state.default_family_eligible} onChange={(v) => update("default_family_eligible", v)} disabled={readOnly} />
              </div>
            </>
          )}

          {tab === "locks" && (
            <div>
              <p className="text-xs mb-3" style={{ color: C.slate500 }}>
                Locked fields cannot be overridden by tenants. Use this to enforce
                brand-consistent inclusions across your network.
              </p>
              <div className="space-y-1">
                {LOCKABLE_TEMPLATE_FIELDS.map((field) => {
                  const isLocked = state.locked_fields.includes(field);
                  return (
                    <button
                      key={field}
                      onClick={() => !readOnly && toggleLock(field)}
                      disabled={readOnly}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-left transition-colors disabled:opacity-60"
                      style={{ borderColor: C.slate200, backgroundColor: isLocked ? C.slate50 : C.white }}
                    >
                      <span className="text-sm" style={{ color: C.navy700 }}>{FIELD_LABELS[field]}</span>
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.navy700 }}>
                          <Lock className="w-3.5 h-3.5" />
                          Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color: C.slate400 }}>
                          <Unlock className="w-3.5 h-3.5" />
                          Open
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "bounds" && (
            <div className="space-y-4">
              <p className="text-xs" style={{ color: C.slate500 }}>
                When monthly_price or annual_price are not locked, tenants can only
                price within these bounds. Leave blank for no bound.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monthly price min ($)">
                  <Input type="number" value={String(state.monthly_price_min ?? "")} onChange={(v) => update("monthly_price_min", v === "" ? null : Number(v))} disabled={readOnly} />
                </Field>
                <Field label="Monthly price max ($)">
                  <Input type="number" value={String(state.monthly_price_max ?? "")} onChange={(v) => update("monthly_price_max", v === "" ? null : Number(v))} disabled={readOnly} />
                </Field>
                <Field label="Annual price min ($)">
                  <Input type="number" value={String(state.annual_price_min ?? "")} onChange={(v) => update("annual_price_min", v === "" ? null : Number(v))} disabled={readOnly} />
                </Field>
                <Field label="Annual price max ($)">
                  <Input type="number" value={String(state.annual_price_max ?? "")} onChange={(v) => update("annual_price_max", v === "" ? null : Number(v))} disabled={readOnly} />
                </Field>
              </div>
            </div>
          )}
        </div>

        {canWrite && (
          <div className="sticky bottom-0 px-6 py-4 border-t flex justify-end gap-2" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50" style={{ color: C.slate600 }}>
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isCreating ? "Create template" : "Save changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: C.slate600 }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, disabled, type = "text", placeholder }: { value: string; onChange: (v: string) => void; disabled?: boolean; type?: string; placeholder?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50"
      style={{ borderColor: C.slate200 }}
    />
  );
}

function Textarea({ value, onChange, disabled, rows = 3 }: { value: string; onChange: (v: string) => void; disabled?: boolean; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={rows}
      className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50"
      style={{ borderColor: C.slate200 }}
    />
  );
}

function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-left transition-colors disabled:opacity-60"
      style={{ borderColor: C.slate200, backgroundColor: C.white }}
    >
      <span className="text-xs" style={{ color: C.slate600 }}>{label}</span>
      <span
        className="inline-flex items-center gap-1 text-xs font-semibold"
        style={{ color: value ? C.green700 : C.slate400 }}
      >
        {value ? <CheckCircle2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
        {value ? "On" : "Off"}
      </span>
    </button>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: C.red50, borderColor: C.red500, color: C.red500 }}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}
