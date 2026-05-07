// ===== EmployerEligibilityPanel =====
//
// Pre-enrollment allow-list for sponsored employers. Practice admin
// (or employer HR) drops in the emails of employees who should be able
// to enroll without paying — the public enrollment widget checks this
// list and short-circuits Stripe Checkout for matches.
//
// Surfaces:
//   - Pending / Claimed / Removed counts
//   - Per-row table with status pill, claimed-patient link (when claimed),
//     remove action
//   - "Add one" inline form
//   - "Bulk paste" textarea — one email per line, auto-de-duplicated

import { useEffect, useState } from "react";
import {
  Loader2, Plus, X, Mail, CheckCircle2, Ban, ClipboardPaste, Users,
} from "lucide-react";
import {
  employerEligibleEmailService,
  type EligibleEmailRow,
  type EligibleEmailsSummary,
} from "../../lib/api";

interface Props {
  employerId: string;
  employerName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setToast: (msg: { message: string; type: "success" | "error" }) => void;
}

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal50: "#f0fdf9",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  amber800: "#92400e",
  red500: "#ef4444",
  red50: "#fef2f2",
  red200: "#fecaca",
  red800: "#7f1d1d",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  white: "#ffffff",
};

export function EmployerEligibilityPanel({ employerId, employerName, setToast }: Props) {
  const [summary, setSummary] = useState<EligibleEmailsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  // Single-add form
  const [newEmail, setNewEmail] = useState("");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await employerEligibleEmailService.list(employerId);
      setSummary(res ?? null);
    } catch {
      setToast({ message: "Could not load eligible emails.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employerId]);

  const handleAdd = async () => {
    if (!newEmail.trim()) return;
    setAdding(true);
    try {
      const res = await employerEligibleEmailService.add(employerId, {
        email: newEmail.trim(),
        firstName: newFirst.trim() || undefined,
        lastName: newLast.trim() || undefined,
      });
      if (res.error) {
        setToast({ message: res.error, type: "error" });
      } else {
        setToast({ message: `Added ${newEmail.trim()} to the eligibility list.`, type: "success" });
        setNewEmail("");
        setNewFirst("");
        setNewLast("");
        await load();
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (row: EligibleEmailRow) => {
    if (!confirm(`Remove ${row.email} from the eligibility list? They will no longer be able to enroll without paying.`)) return;
    try {
      const res = await employerEligibleEmailService.remove(employerId, row.id, "removed_by_admin");
      if (res.error) {
        setToast({ message: res.error, type: "error" });
      } else {
        setToast({ message: "Removed.", type: "success" });
        await load();
      }
    } catch {
      setToast({ message: "Could not remove.", type: "error" });
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-12 flex items-center justify-center" style={{ borderColor: C.slate200 }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  const meta = summary?.meta ?? { total: 0, pending: 0, claimed: 0, removed: 0 };
  const rows = summary?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>
            Eligible employees · {employerName}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
            Emails on this list enroll without paying — {employerName} is billed via the monthly PEPM invoice instead.
          </p>
        </div>
        <button
          onClick={() => setShowBulk((s) => !s)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white inline-flex items-center gap-1.5"
          style={{ borderColor: C.slate200, color: C.slate600 }}
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          {showBulk ? "Cancel bulk paste" : "Bulk paste"}
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryTile icon={Users} label="Total" value={meta.total} />
        <SummaryTile icon={Mail} label="Pending" value={meta.pending} color={C.amber800} bg={C.amber50} />
        <SummaryTile icon={CheckCircle2} label="Enrolled" value={meta.claimed} color={C.teal600} bg={C.teal50} />
        <SummaryTile icon={Ban} label="Removed" value={meta.removed} color={C.red800} bg={C.red50} />
      </div>

      {/* Add-one inline form */}
      {!showBulk && (
        <div className="rounded-lg border p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end" style={{ borderColor: C.slate200, backgroundColor: C.white }}>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold mb-1" style={{ color: C.slate600 }}>Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="employee@acme.com"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: C.slate300 }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: C.slate600 }}>First name (optional)</label>
            <input
              type="text"
              value={newFirst}
              onChange={(e) => setNewFirst(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: C.slate300 }}
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newLast}
              onChange={(e) => setNewLast(e.target.value)}
              placeholder="Last name (optional)"
              className="flex-1 px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: C.slate300 }}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newEmail.trim()}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-white inline-flex items-center gap-1 disabled:opacity-50"
              style={{ backgroundColor: C.teal500 }}
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>
      )}

      {showBulk && (
        <BulkPasteForm
          employerId={employerId}
          onDone={async (msg) => {
            setShowBulk(false);
            setToast({ message: msg, type: "success" });
            await load();
          }}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}

      {/* Rows table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center" style={{ borderColor: C.slate200 }}>
          <p className="text-sm" style={{ color: C.slate500 }}>No eligible emails on file yet.</p>
          <p className="text-xs mt-1" style={{ color: C.slate400 }}>
            Add the emails {employerName}'s employees will use when they sign up. They'll skip Stripe and enroll for free.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: C.slate200 }}>
          <ul className="divide-y" style={{ borderColor: C.slate100 }}>
            {rows.map((r) => {
              const isClaimed = r.claimed_at !== null;
              const isRemoved = r.removed_at !== null;
              return (
                <li key={r.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: C.navy900 }}>{r.email}</span>
                      {isClaimed && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                          style={{ backgroundColor: C.teal50, color: C.teal600 }}
                        >
                          <CheckCircle2 className="w-3 h-3" /> Enrolled
                        </span>
                      )}
                      {!isClaimed && !isRemoved && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                          style={{ backgroundColor: C.amber50, color: C.amber800 }}
                        >
                          <Mail className="w-3 h-3" /> Pending
                        </span>
                      )}
                      {isRemoved && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                          style={{ backgroundColor: C.red50, color: C.red800 }}
                        >
                          <Ban className="w-3 h-3" /> Removed
                        </span>
                      )}
                    </div>
                    {(r.first_name || r.last_name) && (
                      <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
                        {[r.first_name, r.last_name].filter(Boolean).join(" ")}
                      </p>
                    )}
                    {isRemoved && r.removed_reason && (
                      <p className="text-[11px] mt-0.5" style={{ color: C.red800 }}>
                        Reason: {r.removed_reason}
                      </p>
                    )}
                  </div>
                  {!isRemoved && !isClaimed && (
                    <button
                      onClick={() => handleRemove(r)}
                      title="Remove from eligibility list"
                      className="p-1.5 rounded-lg border hover:bg-red-50"
                      style={{ borderColor: C.red200, color: C.red500 }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value, color, bg }: {
  icon: React.ElementType; label: string; value: number; color?: string; bg?: string;
}) {
  return (
    <div
      className="rounded-lg border p-3 flex items-center gap-2"
      style={{ borderColor: C.slate200, backgroundColor: bg ?? C.white }}
    >
      <Icon className="w-4 h-4" style={{ color: color ?? C.slate400 }} />
      <div>
        <div className="text-lg font-bold leading-none" style={{ color: color ?? C.navy900 }}>{value}</div>
        <div className="text-[11px] uppercase tracking-wide font-semibold mt-1" style={{ color: color ?? C.slate500 }}>{label}</div>
      </div>
    </div>
  );
}

interface BulkProps {
  employerId: string;
  onDone: (message: string) => void | Promise<void>;
  onError: (message: string) => void;
}

function BulkPasteForm({ employerId, onDone, onError }: BulkProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const lines = text
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.includes("@"));
    if (lines.length === 0) {
      onError("Paste at least one email (one per line, or comma-separated).");
      return;
    }
    if (lines.length > 5000) {
      onError(`Too many emails (${lines.length}). Max 5000 per batch.`);
      return;
    }
    setSubmitting(true);
    try {
      const rows = lines.map((email) => ({ email }));
      const res = await employerEligibleEmailService.bulkAdd(employerId, rows);
      if (res.error || !res.data) {
        onError(res.error ?? "Bulk add failed.");
        setSubmitting(false);
        return;
      }
      const { added, reactivated, skipped, errors } = res.data;
      const errCount = errors.length;
      const msg = `${added} added, ${reactivated} reactivated, ${skipped} already on list${errCount > 0 ? `, ${errCount} errors` : ""}.`;
      await onDone(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: C.slate200, backgroundColor: C.white }}>
      <label className="block text-xs font-semibold mb-1" style={{ color: C.slate600 }}>
        Paste emails — one per line or comma-separated
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"alice@acme.com\nbob@acme.com\ncarol@acme.com"}
        className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
        style={{ borderColor: C.slate300 }}
      />
      <div className="flex justify-end mt-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || !text.trim()}
          className="px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5"
          style={{ backgroundColor: C.teal500 }}
        >
          {submitting ? "Adding…" : "Add all"}
        </button>
      </div>
    </div>
  );
}
