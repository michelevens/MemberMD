// ===== SuperAdmin Platform Plans =====
// Manage the MemberMD tier definitions practices subscribe to (Solo / Group /
// Multi-Site / Enterprise + internal Founder). Read-first surface — full
// edit-in-place modal lives below; the create-new flow is intentionally
// minimal because tier creation is a deliberate product decision, not a
// daily action.

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Edit2, X, Check, AlertCircle, Crown, Star, Lock, Zap } from "lucide-react";
import { platformPlanService, type PlatformPlanRow } from "../../../lib/api";

const C = {
  navy800: "#082544",
  teal600: "#147d64",
  teal500: "#27ab83",
  teal50: "#e6f7f2",
  amber500: "#f59e0b",
  amber50: "#fef3c7",
  red500: "#dc2626",
  red50: "#fef2f2",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate500: "#64748b",
  slate600: "#475569",
  slate800: "#1e293b",
  white: "#ffffff",
  gold: "#fbbf24",
};

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const v = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(v)) return "—";
  return v % 1 === 0 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;
}

function capDisplay(n: number | null): string {
  return n === null ? "Unlimited" : n.toString();
}

export function PlatformPlansSection() {
  const [plans, setPlans] = useState<PlatformPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlatformPlanRow | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await platformPlanService.list();
    if (res.error) setError(res.error);
    setPlans(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSync = async (plan: PlatformPlanRow) => {
    setSyncingId(plan.id);
    const res = await platformPlanService.syncToStripe(plan.id);
    if (res.error) {
      setToast(`Sync failed: ${res.error}`);
    } else {
      setToast(`${plan.name} synced to Stripe.`);
      await load();
    }
    setSyncingId(null);
    setTimeout(() => setToast(null), 4000);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl p-5 animate-pulse" style={{ backgroundColor: C.slate100, height: 120 }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ backgroundColor: C.red50, color: C.red500 }}>
        <AlertCircle className="w-8 h-8 mx-auto mb-2" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: C.navy800 }}>Platform Plans</h2>
          <p className="text-sm mt-0.5" style={{ color: C.slate500 }}>
            The MemberMD tiers practices subscribe to. Sync to Stripe to enable billing on each tier.
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 rounded-lg text-sm font-medium border inline-flex items-center gap-1.5 hover:bg-slate-50"
          style={{ borderColor: C.slate200, color: C.slate600 }}
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {toast && (
        <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: C.teal50, color: C.teal600 }}>
          {toast}
        </div>
      )}

      <div className="space-y-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onEdit={() => setEditing(plan)}
            onSync={() => handleSync(plan)}
            syncing={syncingId === plan.id}
          />
        ))}
      </div>

      {editing && (
        <EditPlanModal
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function PlanCard({
  plan,
  onEdit,
  onSync,
  syncing,
}: {
  plan: PlatformPlanRow;
  onEdit: () => void;
  onSync: () => void;
  syncing: boolean;
}) {
  const isFounder = plan.key === "founder";
  const isEnterprise = plan.isQuoteOnly;
  const stripeStatus = plan.stripeMonthlyPriceId ? "synced" : "not-synced";

  return (
    <div className="rounded-xl border p-5" style={{ borderColor: C.slate200, backgroundColor: C.white }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              background: isFounder
                ? `linear-gradient(135deg, ${C.gold}, #d97706)`
                : isEnterprise
                  ? `linear-gradient(135deg, #7c3aed, #5b21b6)`
                  : `linear-gradient(135deg, ${C.navy800}, ${C.teal600})`,
            }}
          >
            {isFounder ? <Crown className="w-6 h-6 text-white" /> : isEnterprise ? <Lock className="w-6 h-6 text-white" /> : <Star className="w-6 h-6 text-white" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold" style={{ color: C.navy800 }}>{plan.name}</h3>
              {plan.badgeText && (
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: C.gold, color: C.navy800 }}>
                  {plan.badgeText}
                </span>
              )}
              {!plan.isPubliclyListed && (
                <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: C.slate100, color: C.slate600 }}>
                  Internal
                </span>
              )}
              {!plan.isActive && (
                <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: C.red50, color: C.red500 }}>
                  Inactive
                </span>
              )}
            </div>
            <p className="text-sm mt-1" style={{ color: C.slate500 }}>{plan.description}</p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <Cap label="Members" v={capDisplay(plan.maxMembers)} />
              <Cap label="Providers" v={capDisplay(plan.maxProviders)} />
              <Cap label="Programs" v={capDisplay(plan.maxActivePrograms)} />
              <Cap label="Locations" v={capDisplay(plan.maxLocations)} />
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold" style={{ color: C.navy800 }}>
            {isEnterprise ? "Quote" : formatCurrency(plan.monthlyPrice)}
          </div>
          {!isEnterprise && (
            <div className="text-xs" style={{ color: C.slate500 }}>
              {plan.annualPrice ? `${formatCurrency(plan.annualPrice)} / yr` : "/ month"}
            </div>
          )}
          {plan.extraSeatBlockSize && plan.extraSeatBlockPrice ? (
            <div className="text-xs mt-1" style={{ color: C.slate500 }}>
              +{formatCurrency(plan.extraSeatBlockPrice)} per {plan.extraSeatBlockSize}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: C.slate100 }}>
        <div className="flex items-center gap-3 text-xs" style={{ color: C.slate500 }}>
          <span className="inline-flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Stripe:
          </span>
          {stripeStatus === "synced" ? (
            <span className="inline-flex items-center gap-1 font-medium" style={{ color: C.teal600 }}>
              <Check className="w-3 h-3" /> Synced
            </span>
          ) : (
            <span className="font-medium" style={{ color: C.amber500 }}>
              Not synced
            </span>
          )}
          {plan.subscriptionsCount !== undefined && (
            <>
              <span className="text-slate-300">•</span>
              <span>{plan.subscriptionsCount} subscriber{plan.subscriptionsCount === 1 ? "" : "s"}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isFounder && !isEnterprise && (
            <button
              onClick={onSync}
              disabled={syncing}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 disabled:opacity-50"
              style={{ borderColor: C.teal600, color: C.teal600 }}
            >
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {syncing ? "Syncing…" : "Sync to Stripe"}
            </button>
          )}
          <button
            onClick={onEdit}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 hover:bg-slate-50"
            style={{ borderColor: C.slate200, color: C.slate600 }}
          >
            <Edit2 className="w-3 h-3" /> Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function Cap({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="font-medium" style={{ color: C.slate800 }}>{v}</div>
      <div style={{ color: C.slate500 }}>{label}</div>
    </div>
  );
}

function EditPlanModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: PlatformPlanRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: plan.name,
    description: plan.description ?? "",
    badgeText: plan.badgeText ?? "",
    monthlyPrice: plan.monthlyPrice,
    annualPrice: plan.annualPrice ?? "",
    maxMembers: plan.maxMembers,
    maxProviders: plan.maxProviders,
    maxStaff: plan.maxStaff,
    maxActivePrograms: plan.maxActivePrograms,
    maxLocations: plan.maxLocations,
    maxEmployers: plan.maxEmployers,
    extraSeatBlockSize: plan.extraSeatBlockSize ?? "",
    extraSeatBlockPrice: plan.extraSeatBlockPrice ?? "",
    isActive: plan.isActive,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const payload: Partial<PlatformPlanRow> = {
      name: form.name,
      description: form.description || null,
      badgeText: form.badgeText || null,
      monthlyPrice: typeof form.monthlyPrice === "string" ? parseFloat(form.monthlyPrice) : form.monthlyPrice,
      annualPrice: form.annualPrice === "" ? null : (typeof form.annualPrice === "string" ? parseFloat(form.annualPrice) : form.annualPrice),
      maxMembers: form.maxMembers,
      maxProviders: form.maxProviders,
      maxStaff: form.maxStaff,
      maxActivePrograms: form.maxActivePrograms,
      maxLocations: form.maxLocations,
      maxEmployers: form.maxEmployers,
      extraSeatBlockSize: form.extraSeatBlockSize === "" ? null : Number(form.extraSeatBlockSize),
      extraSeatBlockPrice: form.extraSeatBlockPrice === "" ? null : Number(form.extraSeatBlockPrice),
      isActive: form.isActive,
    };
    const res = await platformPlanService.update(plan.id, payload);
    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    await onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.slate100 }}>
          <h3 className="text-lg font-bold" style={{ color: C.slate800 }}>Edit {plan.name}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="w-5 h-5" style={{ color: C.slate500 }} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: C.slate200 }} />
            </Field>
            <Field label="Badge text (optional)">
              <input value={form.badgeText} onChange={(e) => setForm({ ...form, badgeText: e.target.value })} placeholder="Most Popular" className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: C.slate200 }} />
            </Field>
          </div>
          <Field label="Description">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: C.slate200 }} />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Monthly price ($)">
              <input type="number" min="0" step="0.01" value={form.monthlyPrice} onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value as unknown as number })} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: C.slate200 }} />
            </Field>
            <Field label="Annual price ($, optional)">
              <input type="number" min="0" step="0.01" value={form.annualPrice} onChange={(e) => setForm({ ...form, annualPrice: e.target.value as unknown as number })} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: C.slate200 }} />
            </Field>
          </div>

          <div className="rounded-lg p-3" style={{ backgroundColor: C.slate100 }}>
            <p className="text-xs font-semibold mb-2" style={{ color: C.slate600 }}>Resource caps (blank = unlimited)</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <CapField label="Max members" value={form.maxMembers} onChange={(v) => setForm({ ...form, maxMembers: v })} />
              <CapField label="Max providers" value={form.maxProviders} onChange={(v) => setForm({ ...form, maxProviders: v })} />
              <CapField label="Max staff" value={form.maxStaff} onChange={(v) => setForm({ ...form, maxStaff: v })} />
              <CapField label="Max programs" value={form.maxActivePrograms} onChange={(v) => setForm({ ...form, maxActivePrograms: v })} />
              <CapField label="Max locations" value={form.maxLocations} onChange={(v) => setForm({ ...form, maxLocations: v })} />
              <CapField label="Max employers" value={form.maxEmployers} onChange={(v) => setForm({ ...form, maxEmployers: v })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Extra seat block size (members per overage block)">
              <input type="number" min="1" value={form.extraSeatBlockSize} onChange={(e) => setForm({ ...form, extraSeatBlockSize: e.target.value as unknown as number })} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: C.slate200 }} />
            </Field>
            <Field label="Extra seat block price ($)">
              <input type="number" min="0" step="0.01" value={form.extraSeatBlockPrice} onChange={(e) => setForm({ ...form, extraSeatBlockPrice: e.target.value as unknown as number })} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: C.slate200 }} />
            </Field>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span className="text-sm" style={{ color: C.slate600 }}>Plan is active (practices can subscribe)</span>
          </label>

          {error && (
            <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: C.red50, color: C.red500 }}>
              {error}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: C.slate100 }}>
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-100" style={{ color: C.slate600 }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ backgroundColor: C.teal600 }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: C.slate600 }}>{label}</label>
      {children}
    </div>
  );
}

function CapField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: C.slate600 }}>{label}</label>
      <input
        type="number"
        min="0"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder="∞"
        className="w-full px-2 py-1.5 border rounded-lg text-sm"
        style={{ borderColor: C.slate200 }}
      />
    </div>
  );
}
