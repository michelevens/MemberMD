// Practice-side multi-location management. Practices register every
// physical address patients may visit (clinic, satellite, mobile,
// telehealth-only); the patient portal Locations tab + future
// enrollment widget pull this list via /external/facilities/{tenantCode}.

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, MapPin, Star, Loader2 } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useConfirm } from "../shared/ConfirmDialog";

interface Facility {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  hours: Record<string, [string, string] | null> | null;
  services: string[] | null;
  isPrimary?: boolean;
  is_primary?: boolean;
  isActive?: boolean;
  is_active?: boolean;
}

const C = {
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate700: "#334e68",
  slate900: "#0f172a",
  red600: "#dc2626",
  amber600: "#d97706",
  amber50: "#fffbeb",
  indigo600: "#4f46e5",
  indigo700: "#4338ca",
};

const DEFAULT_FORM = {
  name: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
  email: "",
  is_primary: false,
};

type FormState = typeof DEFAULT_FORM;

export function FacilitiesPanel() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Facility | "new" | null>(null);

  const load = async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>("/facilities");
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(res.data) ? res.data : (res.data as any)?.data ?? [];
    setFacilities(items);
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="rounded-2xl border bg-white" style={{ borderColor: C.slate200 }}>
      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.slate100 }}>
        <div>
          <h3 className="text-base font-semibold" style={{ color: C.slate900 }}>Locations</h3>
          <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
            Physical addresses patients may visit. Surfaces in the patient portal Locations tab.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: C.indigo600 }}
        >
          <Plus className="w-4 h-4" /> Add location
        </button>
      </div>

      <div className="px-5 py-4">
        {loading && <p className="text-sm" style={{ color: C.slate500 }}>Loading…</p>}
        {error && <p className="text-sm" style={{ color: C.red600 }}>{error}</p>}
        {!loading && !error && facilities.length === 0 && (
          <div className="text-center py-6">
            <MapPin className="w-8 h-8 mx-auto" style={{ color: C.slate400 }} />
            <p className="text-sm font-medium mt-2" style={{ color: C.slate700 }}>No locations yet</p>
            <p className="text-xs mt-1" style={{ color: C.slate500 }}>
              Add at least one so patients know where to find you.
            </p>
          </div>
        )}
        {!loading && !error && facilities.length > 0 && (
          <ul className="divide-y" style={{ borderColor: C.slate100 }}>
            {facilities.map((f) => (
              <FacilityRow
                key={f.id}
                facility={f}
                onEdit={() => setEditing(f)}
                onChange={load}
              />
            ))}
          </ul>
        )}
      </div>

      {editing !== null && (
        <FacilityFormModal
          facility={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}

function FacilityRow({ facility, onEdit, onChange }: {
  facility: Facility;
  onEdit: () => void;
  onChange: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const isPrimary = facility.isPrimary ?? facility.is_primary ?? false;
  const fullAddress = [
    facility.address,
    facility.city,
    [facility.state, facility.zip].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");

  const remove = async () => {
    const ok = await confirm({
      title: "Delete location?",
      message: `${facility.name} will stop appearing in the patient portal.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const res = await apiFetch(`/facilities/${facility.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.error) onChange();
  };

  return (
    <li className="py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold" style={{ color: C.slate900 }}>{facility.name}</span>
          {isPrimary && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: C.amber50, color: C.amber600 }}>
              <Star className="w-3 h-3 fill-current" /> Primary
            </span>
          )}
        </div>
        {fullAddress && <p className="text-sm mt-0.5" style={{ color: C.slate500 }}>{fullAddress}</p>}
        {facility.phone && <p className="text-xs mt-0.5" style={{ color: C.slate400 }}>{facility.phone}</p>}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onEdit} disabled={busy} className="p-2 rounded hover:bg-slate-100 disabled:opacity-50" title="Edit">
          <Pencil className="w-4 h-4" style={{ color: C.slate500 }} />
        </button>
        <button type="button" onClick={remove} disabled={busy} className="p-2 rounded hover:bg-slate-100 disabled:opacity-50" title="Delete">
          <Trash2 className="w-4 h-4" style={{ color: C.red600 }} />
        </button>
      </div>
    </li>
  );
}

function FacilityFormModal({ facility, onClose, onSaved }: {
  facility: Facility | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => {
    if (!facility) return DEFAULT_FORM;
    return {
      name: facility.name,
      address: facility.address ?? "",
      city: facility.city ?? "",
      state: facility.state ?? "",
      zip: facility.zip ?? "",
      phone: facility.phone ?? "",
      email: facility.email ?? "",
      is_primary: facility.isPrimary ?? facility.is_primary ?? false,
    };
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    const url = facility ? `/facilities/${facility.id}` : "/facilities";
    const method = facility ? "PUT" : "POST";
    const res = await apiFetch(url, {
      method,
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b" style={{ borderColor: C.slate100 }}>
          <h3 className="text-base font-semibold" style={{ color: C.slate900 }}>
            {facility ? "Edit location" : "Add location"}
          </h3>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "#fef2f2", color: C.red600 }}>{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: C.slate700 }}>Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Main clinic"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: C.slate200 }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: C.slate700 }}>Street address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="123 Main St, Suite 200"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: C.slate200 }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: C.slate700 }}>City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: C.slate200 }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: C.slate700 }}>State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })}
                placeholder="FL"
                className="w-full px-3 py-2 rounded-lg border text-sm uppercase"
                style={{ borderColor: C.slate200 }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: C.slate700 }}>ZIP</label>
              <input
                type="text"
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: C.slate200 }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: C.slate700 }}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(555) 555-5555"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: C.slate200 }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: C.slate700 }}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: C.slate200 }}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: C.slate700 }}>
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
              className="rounded"
            />
            <span>Primary location <span className="text-xs" style={{ color: C.slate400 }}>(only one allowed)</span></span>
          </label>
        </div>
        <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: C.slate100 }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-100" style={{ color: C.slate700 }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-2"
            style={{ backgroundColor: C.indigo600 }}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? "Saving…" : facility ? "Save changes" : "Add location"}
          </button>
        </div>
      </div>
    </div>
  );
}
