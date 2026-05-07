// ===== PatientCreditsPanel =====
//
// Practice-side credit ledger for one patient. Mounted inside the
// patient detail page's Billing tab. Shows the patient's available
// balance, lets staff issue new credits + void existing ones, and
// surfaces the application history (which charges consumed which
// credits).
//
// Balance math is server-authoritative — every issue/void response
// returns the canonical balance_cents.

import { useEffect, useState } from "react";
import { Loader2, Plus, AlertCircle, CheckCircle2, Ban, Wallet } from "lucide-react";
import {
  patientCreditService,
  type PatientCreditRow,
  type PatientCreditSummary,
} from "../../lib/api";

interface Props {
  patientId: string;
  patientName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setToast: (msg: { message: string; type: "success" | "error" }) => void;
}

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal50: "#f0fdf9",
  teal100: "#d1fae5",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  amber800: "#92400e",
  red50: "#fef2f2",
  red500: "#ef4444",
  red800: "#7f1d1d",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  white: "#ffffff",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  refund: "Refund-as-credit",
  goodwill: "Goodwill",
  overpayment: "Overpayment",
};

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export function PatientCreditsPanel({ patientId, patientName, setToast }: Props) {
  const [summary, setSummary] = useState<PatientCreditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await patientCreditService.list(patientId);
      setSummary(res.data ?? null);
    } catch {
      setToast({ message: "Could not load credit history.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const handleVoid = async (credit: PatientCreditRow) => {
    const reason = window.prompt(
      `Void credit of ${fmtMoney(credit.amount_cents)}? Enter the reason — this is recorded for audit.`,
    );
    if (!reason || !reason.trim()) return;
    setVoidingId(credit.id);
    try {
      const res = await patientCreditService.void(patientId, credit.id, reason.trim());
      if (res.error) {
        setToast({ message: res.error, type: "error" });
      } else {
        setToast({ message: "Credit voided.", type: "success" });
        await reload();
      }
    } catch {
      setToast({ message: "Could not void the credit.", type: "error" });
    } finally {
      setVoidingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-8 flex items-center justify-center" style={{ borderColor: C.slate200 }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  const balance = summary?.balance_cents ?? 0;
  const credits = summary?.credits ?? [];

  return (
    <div className="space-y-3">
      {/* Header — balance card */}
      <div
        className="rounded-xl border p-4 flex items-center justify-between"
        style={{
          backgroundColor: balance > 0 ? C.teal50 : C.white,
          borderColor: balance > 0 ? C.teal100 : C.slate200,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: balance > 0 ? C.teal100 : C.slate100 }}
          >
            <Wallet className="w-5 h-5" style={{ color: balance > 0 ? C.teal600 : C.slate500 }} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: C.slate500 }}>
              Account Credit Balance
            </div>
            <div className="text-2xl font-bold mt-0.5" style={{ color: balance > 0 ? C.teal600 : C.navy900 }}>
              {fmtMoney(balance)}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowIssueDialog(true)}
          className="px-3 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 hover:opacity-90"
          style={{ backgroundColor: C.teal500 }}
        >
          <Plus className="w-4 h-4" />
          Issue credit
        </button>
      </div>

      {/* Credits list */}
      {credits.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-center" style={{ borderColor: C.slate200 }}>
          <p className="text-sm" style={{ color: C.slate500 }}>
            No credits on file for {patientName}.
          </p>
          <p className="text-xs mt-1" style={{ color: C.slate400 }}>
            Issue a credit for refunds-as-credit, comp visits, overpayments, or goodwill.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: C.slate200 }}>
          <div
            className="px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wider flex items-center justify-between"
            style={{ borderColor: C.slate200, color: C.slate500, backgroundColor: C.slate100 }}
          >
            <span>{credits.length} credit{credits.length === 1 ? "" : "s"}</span>
            <button onClick={reload} className="text-xs font-medium" style={{ color: C.teal600 }}>
              Refresh
            </button>
          </div>
          <ul className="divide-y" style={{ borderColor: C.slate100 }}>
            {credits.map((c) => {
              const used = c.amount_cents - c.balance_cents;
              const isVoided = c.voided_at !== null;
              const isExpired = c.expires_at !== null && new Date(c.expires_at) < new Date();
              const isActive = !isVoided && !isExpired && c.balance_cents > 0;
              return (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: C.navy900 }}>
                          {fmtMoney(c.amount_cents)}
                        </span>
                        {isActive && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                            style={{ backgroundColor: C.teal100, color: C.teal600 }}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                        )}
                        {isVoided && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                            style={{ backgroundColor: C.red50, color: C.red800 }}
                          >
                            <Ban className="w-3 h-3" /> Voided
                          </span>
                        )}
                        {isExpired && !isVoided && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                            style={{ backgroundColor: C.amber50, color: C.amber800 }}
                          >
                            <AlertCircle className="w-3 h-3" /> Expired
                          </span>
                        )}
                        <span className="text-[11px] font-medium" style={{ color: C.slate500 }}>
                          {SOURCE_LABELS[c.source] ?? c.source}
                        </span>
                      </div>
                      {c.notes && (
                        <p className="text-xs mt-1" style={{ color: C.slate600 }}>
                          {c.notes}
                        </p>
                      )}
                      <div className="text-[11px] mt-1.5" style={{ color: C.slate400 }}>
                        Issued {fmtDate(c.created_at)}
                        {c.expires_at && <> · Expires {fmtDate(c.expires_at)}</>}
                        {used > 0 && (
                          <> · Used {fmtMoney(used)} · Remaining <strong style={{ color: C.slate600 }}>{fmtMoney(c.balance_cents)}</strong></>
                        )}
                      </div>
                      {isVoided && c.void_reason && (
                        <div className="text-[11px] mt-1" style={{ color: C.red800 }}>
                          Voided: {c.void_reason}
                        </div>
                      )}
                      {c.applications.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {c.applications.map((app) => (
                            <div key={app.id} className="text-[11px]" style={{ color: C.slate500 }}>
                              · Applied {fmtMoney(app.amount_applied_cents)} to {app.target_type.replace(/_/g, " ")} on {fmtDate(app.applied_at)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {isActive && (
                      <button
                        onClick={() => handleVoid(c)}
                        disabled={voidingId === c.id}
                        className="text-xs font-semibold disabled:opacity-50"
                        style={{ color: C.red500 }}
                      >
                        {voidingId === c.id ? "Voiding…" : "Void"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showIssueDialog && (
        <IssueCreditDialog
          patientId={patientId}
          patientName={patientName}
          onClose={() => setShowIssueDialog(false)}
          onIssued={async () => {
            setShowIssueDialog(false);
            setToast({ message: "Credit issued.", type: "success" });
            await reload();
          }}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}
    </div>
  );
}

// ─── Issue Credit Dialog ──────────────────────────────────────────────────

interface IssueProps {
  patientId: string;
  patientName: string;
  onClose: () => void;
  onIssued: () => void | Promise<void>;
  onError: (msg: string) => void;
}

function IssueCreditDialog({ patientId, patientName, onClose, onIssued, onError }: IssueProps) {
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<"manual" | "refund" | "goodwill" | "overpayment">("goodwill");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const dollars = parseFloat(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      onError("Enter a positive dollar amount.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await patientCreditService.issue(patientId, {
        amountCents: Math.round(dollars * 100),
        source,
        notes: notes.trim() || undefined,
        expiresAt: expiresAt || null,
      });
      if (res.error) {
        onError(res.error);
        setSubmitting(false);
      } else {
        await onIssued();
      }
    } catch {
      onError("Could not issue the credit.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6" style={{ borderColor: C.slate200 }}>
        <h3 className="text-lg font-bold mb-1" style={{ color: C.navy900 }}>
          Issue credit to {patientName}
        </h3>
        <p className="text-xs mb-4" style={{ color: C.slate500 }}>
          The patient's balance auto-applies against their next ad-hoc charge before going to Stripe.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: C.slate600 }}>
              Amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: C.slate400 }}>$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: C.slate300 }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: C.slate600 }}>
              Source
            </label>
            <select
              value={source}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onChange={(e) => setSource(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white"
              style={{ borderColor: C.slate300 }}
            >
              <option value="goodwill">Goodwill / make-good</option>
              <option value="refund">Refund-as-credit</option>
              <option value="overpayment">Overpayment</option>
              <option value="manual">Manual / other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: C.slate600 }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="e.g. Make-good for cancelled visit on 2026-04-30"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: C.slate300 }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: C.slate600 }}>
              Expires (optional)
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: C.slate300 }}
            />
            <p className="text-[11px] mt-1" style={{ color: C.slate400 }}>
              Leave blank for no expiration.
            </p>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: C.slate300, color: C.slate600 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !amount}
            className="px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: C.teal500 }}
          >
            {submitting ? "Issuing…" : "Issue credit"}
          </button>
        </div>
      </div>
    </div>
  );
}
