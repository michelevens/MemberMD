// ===== EntitlementCatalogPanel =====
//
// Practice Settings → Entitlements tab. Lets a practice admin browse
// the platform-default entitlement catalog AND their own custom rows
// in one view, organized by category. Three actions per row:
//
//   System row (locked):  "Make a copy" — POST /entitlement-types/{id}/fork
//   Tenant row (custom):   "Edit" — opens an inline editor
//   Tenant row (custom):   "Deactivate" — soft delete via DELETE
//
// New custom-from-scratch is also available via "+ New entitlement".
//
// Loads with ?source=both implicit (the controller dedupes — system
// rows that the tenant has already forked don't appear, only the
// fork). One round-trip per tab open + one after each mutation.

import { useEffect, useMemo, useState } from "react";
import {
  Award, Copy, Pencil, Trash2, Plus, Lock, Loader2, Search, X, Check,
} from "lucide-react";
import { apiFetch } from "../../lib/api";

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  navy700: "#334e68",
  teal500: "#27ab83",
  teal600: "#147d64",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  red500: "#ef4444",
  amber50: "#fffbeb",
  amber200: "#fde68a",
  amber700: "#92400e",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntitlementType {
  id: string;
  tenantId: string | null;
  isSystem: boolean;
  parentEntitlementTypeId: string | null;
  code: string;
  name: string;
  category: string;
  description: string | null;
  unitOfMeasure: string;
  cashValue: string | number | null;
  visibility: "everyone" | "admin_only" | "superadmin_only";
  isActive: boolean;
  sortOrder: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  visits: "Visits & Encounters",
  visit: "Visits & Encounters",
  communication: "Communication & Non-Visit Care",
  procedures: "In-Office Procedures",
  procedure: "In-Office Procedures",
  labs_imaging: "Labs & Imaging",
  lab: "Labs & Imaging",
  wellness: "Wellness & Preventive",
  chronic_care: "Chronic Care Management",
  pharmacy: "Pharmacy & Dispensary",
  rx: "Pharmacy & Dispensary",
  perks: "Specialty & Membership Perks",
  program: "Programs",
  access: "Access",
  internal: "Internal (Admin Only)",
};

const CATEGORY_ORDER = [
  "visits", "visit",
  "communication",
  "procedures", "procedure",
  "labs_imaging", "lab",
  "wellness",
  "chronic_care",
  "pharmacy", "rx",
  "perks", "program", "access",
  "internal",
];

const UNIT_LABELS: Record<string, string> = {
  count: "per count",
  visit: "per visit",
  panel: "per panel",
  message: "per message",
  session: "per session",
  item: "per item",
  access: "access",
  time_minutes: "minutes",
  dollar_credit: "dollar credit",
  boolean_access: "yes/no",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function EntitlementCatalogPanel() {
  const [types, setTypes] = useState<EntitlementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<EntitlementType | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const reload = async () => {
    setLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>("/entitlement-types?is_active=" + (showInactive ? "" : "true"));
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: EntitlementType[] = Array.isArray(res.data)
      ? res.data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : Array.isArray((res.data as any)?.data)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (res.data as any).data
        : [];
    setTypes(list);
  };

  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showInactive]);

  // Group by category, ordered by CATEGORY_ORDER then alpha within.
  const grouped = useMemo(() => {
    const lower = search.trim().toLowerCase();
    const filtered = types.filter((t) => {
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (!lower) return true;
      return (
        t.name.toLowerCase().includes(lower)
        || t.code.toLowerCase().includes(lower)
        || (t.description ?? "").toLowerCase().includes(lower)
      );
    });
    const map = new Map<string, EntitlementType[]>();
    for (const t of filtered) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    // Sort each bucket by sortOrder + name.
    map.forEach((arr) => arr.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name)));
    // Order categories.
    const cats = Array.from(map.keys()).sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return cats.map((c) => ({ category: c, items: map.get(c)! }));
  }, [types, search, categoryFilter]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    types.forEach((t) => set.add(t.category));
    return Array.from(set);
  }, [types]);

  async function fork(type: EntitlementType) {
    setBusyId(type.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>(`/entitlement-types/${type.id}/fork`, { method: "POST" });
    setBusyId(null);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
      return;
    }
    setToast({ message: "Copied — you can now edit it.", type: "success" });
    await reload();
    // Open the fork in the editor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fork = (res.data as any)?.data ?? res.data;
    if (fork?.id) {
      const fresh = await apiFetch<EntitlementType>(`/entitlement-types/${fork.id}`);
      if (!fresh.error && fresh.data) setEditing(fresh.data as unknown as EntitlementType);
    }
  }

  async function deactivate(type: EntitlementType) {
    if (!window.confirm(`Deactivate "${type.name}"? It won't appear in plan pickers anymore.`)) return;
    setBusyId(type.id);
    const res = await apiFetch(`/entitlement-types/${type.id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
      return;
    }
    setToast({ message: "Deactivated.", type: "success" });
    await reload();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: C.navy800 }}>
            <Award className="w-4 h-4" /> Entitlement catalog
          </h2>
          <p className="text-xs mt-1" style={{ color: C.slate500 }}>
            Browse the platform-default benefits that come with MemberMD. Make a copy of any default to customize it for your practice, or add your own from scratch.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-2 rounded-lg text-sm font-semibold text-white shrink-0 inline-flex items-center gap-1.5"
          style={{ backgroundColor: C.teal500 }}
        >
          <Plus className="w-3.5 h-3.5" /> New entitlement
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: C.slate400 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, or description…"
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: `1px solid ${C.slate200}` }}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-sm px-2.5 py-2 rounded-lg bg-white outline-none"
          style={{ border: `1px solid ${C.slate200}`, color: C.slate600 }}
        >
          <option value="all">All categories</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
          ))}
        </select>
        <label className="text-xs flex items-center gap-1.5 cursor-pointer" style={{ color: C.slate600 }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show deactivated
        </label>
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.slate400 }} />
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 rounded-xl" style={{ backgroundColor: C.slate50 }}>
          <Award className="w-10 h-10 mx-auto mb-2" style={{ color: C.slate300 }} />
          <p className="text-sm" style={{ color: C.slate500 }}>No matching entitlements.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.category}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.slate500 }}>
                {CATEGORY_LABELS[group.category] ?? group.category}
              </h3>
              <div className="rounded-xl divide-y" style={{ border: `1px solid ${C.slate200}`, backgroundColor: "#ffffff", borderColor: C.slate100 }}>
                {group.items.map((t) => (
                  <Row
                    key={t.id}
                    type={t}
                    busy={busyId === t.id}
                    onFork={() => fork(t)}
                    onEdit={() => setEditing(t)}
                    onDeactivate={() => deactivate(t)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <Editor
          source={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={async () => {
            setEditing(null);
            setCreating(false);
            await reload();
            setToast({ message: "Saved.", type: "success" });
          }}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-6 right-6 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg"
          style={{
            backgroundColor: toast.type === "success" ? C.teal500 : C.red500,
            zIndex: 60,
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({
  type, busy, onFork, onEdit, onDeactivate,
}: {
  type: EntitlementType;
  busy: boolean;
  onFork: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const isLocked = type.isSystem; // system row, can't edit
  const isFork = !type.isSystem && type.parentEntitlementTypeId !== null;
  const cash = type.cashValue !== null && type.cashValue !== undefined && Number(type.cashValue) > 0
    ? `$${Number(type.cashValue).toFixed(2)}`
    : null;
  const unitLabel = UNIT_LABELS[type.unitOfMeasure] ?? type.unitOfMeasure;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-medium truncate ${type.isActive ? "" : "line-through"}`} style={{ color: C.navy800 }}>
            {type.name}
          </p>
          {isLocked && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: C.slate100, color: C.slate600 }}
              title="Platform default — make a copy to customize"
            >
              <Lock className="w-2.5 h-2.5" /> Platform
            </span>
          )}
          {isFork && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: "#fef3c7", color: C.amber700 }}
              title="A custom copy of a platform default"
            >
              Custom
            </span>
          )}
          {type.visibility !== "everyone" && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: C.slate100, color: C.slate600 }}
              title={type.visibility === "admin_only" ? "Hidden from patients" : "Platform-locked"}
            >
              {type.visibility === "admin_only" ? "Admin only" : "Superadmin"}
            </span>
          )}
          {!type.isActive && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: "#fef2f2", color: "#b91c1c" }}
            >
              Deactivated
            </span>
          )}
        </div>
        {type.description && (
          <p className="text-xs mt-0.5 truncate" style={{ color: C.slate500 }}>
            {type.description}
          </p>
        )}
        <p className="text-[10px] mt-0.5 font-mono" style={{ color: C.slate400 }}>
          {type.code} · {unitLabel}{cash ? ` · ${cash}` : ""}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        {isLocked ? (
          <button
            onClick={onFork}
            disabled={busy}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-50 inline-flex items-center gap-1"
            style={{ color: C.navy700, border: `1px solid ${C.slate200}` }}
            title="Make an editable copy for this practice"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
            Make a copy
          </button>
        ) : (
          <>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg hover:bg-slate-100"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" style={{ color: C.slate500 }} />
            </button>
            {type.isActive && (
              <button
                onClick={onDeactivate}
                disabled={busy}
                className="p-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
                title="Deactivate"
              >
                {busy
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: C.red500 }} />
                  : <Trash2 className="w-3.5 h-3.5" style={{ color: C.red500 }} />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Editor (create + edit) ──────────────────────────────────────────────────

function Editor({
  source, isCreate, onClose, onSaved,
}: {
  source: EntitlementType | null;
  isCreate: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(source?.name ?? "");
  const [code, setCode] = useState(source?.code ?? "");
  const [category, setCategory] = useState(source?.category ?? "visits");
  const [unit, setUnit] = useState(source?.unitOfMeasure ?? "count");
  const [cashValue, setCashValue] = useState<string>(
    source?.cashValue !== null && source?.cashValue !== undefined
      ? String(source.cashValue)
      : ""
  );
  const [description, setDescription] = useState(source?.description ?? "");
  const [visibility, setVisibility] = useState<EntitlementType["visibility"]>(source?.visibility ?? "everyone");
  const [isActive, setIsActive] = useState(source?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSubmitting(true);
    setError(null);
    const body = {
      code: code.trim(),
      name: name.trim(),
      category,
      unit_of_measure: unit,
      description: description.trim() || null,
      cash_value: cashValue.trim() === "" ? null : Number(cashValue),
      visibility,
      is_active: isActive,
    };
    const res = isCreate
      ? await apiFetch("/entitlement-types", { method: "POST", body: JSON.stringify(body) })
      : await apiFetch(`/entitlement-types/${source!.id}`, { method: "PUT", body: JSON.stringify(body) });
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          maxWidth: "560px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.slate200}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 className="text-base font-semibold" style={{ color: C.navy800 }}>
            {isCreate ? "New entitlement" : "Edit entitlement"}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100">
            <X className="w-4 h-4" style={{ color: C.slate500 }} />
          </button>
        </div>
        <div style={{ padding: "14px 18px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {source && source.parentEntitlementTypeId && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: C.amber50, color: C.amber700, border: `1px solid ${C.amber200}` }}>
              Forked from a platform default. Changes you save here only affect your practice.
            </div>
          )}

          <Field label="Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: C.slate200 }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Code" required hint="Internal identifier — letters, numbers, underscores">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
                style={{ borderColor: C.slate200 }}
              />
            </Field>
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-white"
                style={{ borderColor: C.slate200 }}
              >
                {Object.keys(CATEGORY_LABELS).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Unit type" hint="How this entitlement is counted">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-white"
                style={{ borderColor: C.slate200 }}
              >
                <option value="count">Count (e.g. 4 visits)</option>
                <option value="time_minutes">Time (minutes)</option>
                <option value="dollar_credit">Dollar credit</option>
                <option value="boolean_access">Yes/no access</option>
              </select>
            </Field>
            <Field label="Cash value" hint="Self-pay rate for savings calc">
              <input
                type="number"
                min="0"
                step="0.01"
                value={cashValue}
                onChange={(e) => setCashValue(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: C.slate200 }}
                placeholder="0.00"
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ borderColor: C.slate200 }}
            />
          </Field>

          <Field label="Visibility" hint="Hide internal entitlements from patients">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: C.slate600 }}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === "everyone"}
                  onChange={() => setVisibility("everyone")}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Everyone</span>
                  <span className="text-xs ml-1" style={{ color: C.slate400 }}>— patients see this in their Entitlements tab</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: C.slate600 }}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === "admin_only"}
                  onChange={() => setVisibility("admin_only")}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Admin only</span>
                  <span className="text-xs ml-1" style={{ color: C.slate400 }}>— hidden from patients (e.g. supervisor time, internal tracking)</span>
                </span>
              </label>
            </div>
          </Field>

          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: C.slate600 }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active (available in plan picker)
          </label>

          {error && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#fef2f2", color: "#b91c1c" }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.slate200}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium rounded-lg hover:bg-slate-100"
            style={{ color: C.slate600 }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={submitting || !name.trim() || !code.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50 inline-flex items-center gap-1.5"
            style={{ backgroundColor: C.teal500 }}
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isCreate ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, required = false, hint, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: C.slate600 }}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="ml-1.5 font-normal" style={{ color: C.slate400 }}>— {hint}</span>}
      </label>
      {children}
    </div>
  );
}
