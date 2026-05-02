// ===== Patient Family Members =====
// Shared component used in two places:
//   1. The Billing tab (as one section among several).
//   2. The standalone Family Members tab under Account.
// Both surfaces show the same data — the patient's dependents on their
// active membership — and the same affordances (add, remove). Shipping
// it as one component prevents the two surfaces from drifting.
//
// Backend endpoints (commit 097c7a4):
//   GET    /family/members
//   POST   /family/members
//   DELETE /family/members/{membershipId}
//
// All three are caller-scoped: the active membership is resolved from
// the authenticated patient on the backend; the patient never sees
// membership UUIDs in the URL.

import { useEffect, useState } from "react";
import { Heart, UserPlus, Trash2, Loader2, X } from "lucide-react";
import { familyService } from "../../../lib/api";

interface FamilyMember {
  id: string; // dependent's PatientMembership id
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  relationship: "spouse" | "child" | "parent" | "other" | string;
  email: string | null;
  phone: string | null;
  status: string;
}

const NAVY800 = "#243b53";
const NAVY700 = "#334e68";
const SLATE100 = "#f1f5f9";
const SLATE200 = "#e2e8f0";
const SLATE400 = "#94a3b8";
const SLATE500 = "#64748b";
const SLATE600 = "#475569";
const TEAL500 = "#27ab83";
const TEAL600 = "#147d64";
const RED500 = "#ef4444";
const RED600 = "#dc2626";

const RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: "Spouse",
  child: "Child",
  parent: "Parent",
  other: "Other",
};

interface FamilyMembersSectionProps {
  /** "card" — full-bleed card with its own outer container (used by
   *  the standalone Family Members tab). "embedded" — assumes a
   *  parent already provides the card chrome (used by the Billing
   *  tab section). Both render the same content; only the framing
   *  differs. */
  variant?: "card" | "embedded";
}

export function FamilyMembersSection({ variant = "card" }: FamilyMembersSectionProps) {
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<FamilyMember | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    relationship: "child",
    email: "",
    phone: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const reload = async () => {
    setError(null);
    const res = await familyService.list();
    if (res.error) {
      setError(res.error);
      setMembers([]);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = Array.isArray(res.data) ? res.data : ((res.data as any)?.data ?? []);
    setMembers(list.map((r) => ({
      id: r.id,
      firstName: r.firstName ?? r.first_name ?? "",
      lastName: r.lastName ?? r.last_name ?? "",
      dateOfBirth: r.dateOfBirth ?? r.date_of_birth ?? "",
      relationship: r.relationship ?? "other",
      email: r.email ?? null,
      phone: r.phone ?? null,
      status: r.status ?? "active",
    })));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await familyService.list();
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setMembers([]);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = Array.isArray(res.data) ? res.data : ((res.data as any)?.data ?? []);
      setMembers(list.map((r) => ({
        id: r.id,
        firstName: r.firstName ?? r.first_name ?? "",
        lastName: r.lastName ?? r.last_name ?? "",
        dateOfBirth: r.dateOfBirth ?? r.date_of_birth ?? "",
        relationship: r.relationship ?? "other",
        email: r.email ?? null,
        phone: r.phone ?? null,
        status: r.status ?? "active",
      })));
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAdd = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.dateOfBirth) {
      setFormError("Name and date of birth are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const res = await familyService.add({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: form.dateOfBirth,
      relationship: form.relationship,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
    });
    if (res.error) {
      setFormError(res.error);
      setSubmitting(false);
      return;
    }
    setAddOpen(false);
    setForm({ firstName: "", lastName: "", dateOfBirth: "", relationship: "child", email: "", phone: "" });
    setSubmitting(false);
    await reload();
  };

  const handleRemove = async () => {
    if (!confirmRemove) return;
    setSubmitting(true);
    const res = await familyService.remove(confirmRemove.id);
    setSubmitting(false);
    if (res.error) {
      // Surface inline on the confirm dialog rather than a top-level
      // toast so the user knows which row failed.
      setFormError(res.error);
      return;
    }
    setConfirmRemove(null);
    await reload();
  };

  const activeMembers = (members ?? []).filter((m) => m.status !== "cancelled");

  // Header content shared between variants.
  const Header = (
    <div className="flex items-center justify-between mb-4 gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <Heart className="w-4 h-4 shrink-0" style={{ color: TEAL500 }} />
        <h3 className="text-sm font-semibold" style={{ color: NAVY800 }}>
          Family on this membership
        </h3>
      </div>
      <button
        onClick={() => setAddOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0"
        style={{ backgroundColor: TEAL500 }}
      >
        <UserPlus className="w-3.5 h-3.5" />
        Add member
      </button>
    </div>
  );

  // Body content (loading / error / empty / list) — shared.
  const Body = (
    <>
      {members === null && !error && (
        <p className="text-xs italic" style={{ color: SLATE400 }}>
          Loading family members…
        </p>
      )}
      {error && (
        <div className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2", color: RED600 }}
        >
          {error}
        </div>
      )}
      {members && activeMembers.length === 0 && !error && (
        <p className="text-xs" style={{ color: SLATE500 }}>
          No family members on your plan yet. Click <span className="font-semibold">Add member</span> to add a spouse, child, or other dependent. Your plan must be family-eligible — your practice can confirm.
        </p>
      )}
      <div className="space-y-2">
        {activeMembers.map((m) => {
          const fullName = [m.firstName, m.lastName].filter(Boolean).join(" ").trim() || "Member";
          const initials = ((m.firstName[0] || "") + (m.lastName[0] || "")).toUpperCase() || "??";
          const dobLabel = m.dateOfBirth
            ? new Date(m.dateOfBirth).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
            : "";
          const relLabel = RELATIONSHIP_LABELS[m.relationship] ?? m.relationship;
          return (
            <div
              key={m.id}
              className="rounded-xl p-3 flex items-center gap-3"
              style={{ backgroundColor: SLATE100 }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${NAVY700}, ${TEAL500})` }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate" style={{ color: NAVY800 }}>
                    {fullName}
                  </p>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "#e6fffa", color: TEAL600 }}
                  >
                    {relLabel}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: SLATE500 }}>
                  {dobLabel}{m.email ? ` · ${m.email}` : ""}
                </p>
              </div>
              <button
                onClick={() => { setConfirmRemove(m); setFormError(null); }}
                className="p-2 rounded-lg hover:bg-white/60 transition-colors shrink-0"
                title="Remove from membership"
                aria-label={`Remove ${fullName}`}
              >
                <Trash2 className="w-4 h-4" style={{ color: SLATE500 }} />
              </button>
            </div>
          );
        })}
      </div>
      {activeMembers.length > 0 && (
        <p className="text-xs italic mt-3" style={{ color: SLATE400 }}>
          Adding or removing a member adjusts your billing on the next invoice.
        </p>
      )}
    </>
  );

  const Container = variant === "card"
    ? (
      <div className="rounded-2xl border bg-white p-5" style={{ borderColor: SLATE200 }}>
        {Header}
        {Body}
      </div>
    )
    : (
      <div>
        {Header}
        {Body}
      </div>
    );

  return (
    <>
      {Container}

      {/* Add member dialog */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}
          onClick={() => !submitting && setAddOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Add family member</h3>
              <button
                onClick={() => setAddOpen(false)}
                className="p-1 rounded hover:bg-slate-100 text-slate-400"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">First name *</label>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Last name *</label>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Date of birth *</label>
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Relationship *</label>
                  <select
                    value={form.relationship}
                    onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="spouse">Spouse</option>
                    <option value="child">Child</option>
                    <option value="parent">Parent</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phone (optional)</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <p className="text-xs italic" style={{ color: SLATE400 }}>
                Adding a member adjusts your billing on the next invoice.
              </p>
              {formError && (
                <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2", color: RED600 }}>
                  {formError}
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button
                onClick={() => setAddOpen(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleAdd()}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: TEAL500 }}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Adding…" : "Add member"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm remove dialog */}
      {confirmRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}
          onClick={() => !submitting && setConfirmRemove(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-3">
              <h3 className="text-lg font-bold" style={{ color: NAVY800 }}>
                Remove from membership?
              </h3>
              <p className="text-sm" style={{ color: SLATE600 }}>
                <span className="font-semibold">
                  {[confirmRemove.firstName, confirmRemove.lastName].filter(Boolean).join(" ")}
                </span> will no longer be on your plan. Their access ends today and your next invoice drops by their share.
              </p>
              <p className="text-xs italic" style={{ color: SLATE400 }}>
                Their patient record stays on file with the practice; only the membership changes.
              </p>
              {formError && (
                <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2", color: RED600 }}>
                  {formError}
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button
                onClick={() => { setConfirmRemove(null); setFormError(null); }}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Keep
              </button>
              <button
                onClick={() => void handleRemove()}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: RED500 }}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

