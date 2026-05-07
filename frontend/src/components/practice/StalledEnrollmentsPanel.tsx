// ===== StalledEnrollmentsPanel =====
//
// Practice-side recovery queue for patients who started enrollment but
// didn't complete payment. Backed by /practice/pending-enrollments.
//
// Each row is a pending_enrollments record. Actions:
//   - Resend payment link (auto-refreshes Stripe session if expired)
//   - Copy payment link to clipboard
//   - Cancel (marks the row cancelled and expires Stripe session)
//
// The reminder cron is firing automated drips at T-2h / T+24h / T+72h
// in the background — this surface is for staff who want to nudge
// outside that cadence or kill a stale lead.

import { useEffect, useState } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, Mail, X, Copy, Clock,
  ExternalLink, CheckCircle2,
} from "lucide-react";
import {
  stalledEnrollmentService,
  type StalledEnrollmentRow,
} from "../../lib/api";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setToast: (msg: { message: string; type: "success" | "error" }) => void;
  // Called whenever the list count changes so the parent can render
  // its banner. Optional — pass-through is fine for standalone use.
  onCountChange?: (count: number) => void;
}

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  amber200: "#fde68a",
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

const fmtRelative = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
};

const fmtMoney = (v: number | null) => {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(v);
};

export function StalledEnrollmentsPanel({ setToast, onCountChange }: Props) {
  const [rows, setRows] = useState<StalledEnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all" | "cancelled">("pending");

  const load = async () => {
    setLoading(true);
    try {
      const res = await stalledEnrollmentService.list(filter);
      const list = Array.isArray(res.data) ? res.data : [];
      setRows(list);
      onCountChange?.(res.meta?.pending_count ?? list.filter((r) => r.status === "pending").length);
    } catch {
      setToast({ message: "Could not load stalled enrollments.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleResend = async (row: StalledEnrollmentRow) => {
    setBusyId(row.id);
    try {
      const res = await stalledEnrollmentService.resend(row.id);
      if (res.error) {
        setToast({ message: res.error, type: "error" });
      } else {
        setToast({ message: `Payment link resent to ${row.email}.`, type: "success" });
        await load();
      }
    } catch {
      setToast({ message: "Could not resend the link.", type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async (row: StalledEnrollmentRow) => {
    if (!row.checkout_url) {
      setToast({ message: "No payment link on file. Hit Resend to mint one.", type: "error" });
      return;
    }
    try {
      await navigator.clipboard.writeText(row.checkout_url);
      setToast({ message: "Payment link copied.", type: "success" });
    } catch {
      setToast({ message: "Could not access clipboard.", type: "error" });
    }
  };

  const handleCancel = async (row: StalledEnrollmentRow) => {
    if (!confirm(`Cancel this enrollment? ${row.first_name} ${row.last_name} will no longer be able to pay this link. They can re-enroll later if they want to.`)) return;
    setBusyId(row.id);
    try {
      const res = await stalledEnrollmentService.cancel(row.id);
      if (res.error) {
        setToast({ message: res.error, type: "error" });
      } else {
        setToast({ message: "Enrollment cancelled.", type: "success" });
        await load();
      }
    } catch {
      setToast({ message: "Could not cancel.", type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-12 flex items-center justify-center" style={{ borderColor: C.slate200 }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold" style={{ color: C.navy900 }}>Stalled enrollments</h2>
          <p className="text-xs" style={{ color: C.slate500 }}>
            Patients who started enrolling but didn't pay. Automatic reminders at T-2h, T+24h, and T+72h.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-white overflow-hidden" style={{ borderColor: C.slate200 }}>
            {(["pending", "all", "cancelled"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setFilter(opt)}
                className="px-3 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: filter === opt ? C.navy900 : C.white,
                  color: filter === opt ? C.white : C.slate600,
                }}
              >
                {opt === "pending" ? "Pending" : opt === "all" ? "All" : "Cancelled"}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white inline-flex items-center gap-1.5"
            style={{ borderColor: C.slate200, color: C.slate600 }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center" style={{ borderColor: C.slate200 }}>
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: C.teal500 }} />
          <p className="text-sm font-semibold" style={{ color: C.navy900 }}>
            {filter === "pending" ? "No stalled enrollments" : "No matching enrollments"}
          </p>
          <p className="text-xs mt-1" style={{ color: C.slate500 }}>
            {filter === "pending"
              ? "Every recent enrollment was either completed or cancelled."
              : "Switch back to Pending to see active rescue queue."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: C.slate200 }}>
          <ul className="divide-y" style={{ borderColor: C.slate100 }}>
            {rows.map((r) => {
              const fullName = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "Unknown patient";
              const remindersFired = r.reminders_sent ? Object.keys(r.reminders_sent).length : 0;
              const isExpiringSoon =
                r.expires_at && new Date(r.expires_at).getTime() - Date.now() < 4 * 3600_000 && r.status === "pending";
              const isStillPending = r.status === "pending";
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: C.navy900 }}>
                          {fullName}
                        </span>
                        {r.status === "pending" && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                            style={{ backgroundColor: C.amber50, color: C.amber800 }}
                          >
                            <Clock className="w-3 h-3" /> Pending payment
                          </span>
                        )}
                        {r.status === "cancelled" && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                            style={{ backgroundColor: C.red50, color: C.red800 }}
                          >
                            <X className="w-3 h-3" /> Cancelled
                          </span>
                        )}
                        {r.status === "claimed" && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                            style={{ backgroundColor: "#dcfce7", color: "#166534" }}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        )}
                        {isExpiringSoon && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                            style={{ backgroundColor: C.red50, color: C.red800 }}
                          >
                            <AlertTriangle className="w-3 h-3" /> Link expires soon
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
                        {r.email ?? "(no email)"}
                      </p>
                      <div className="text-[11px] mt-1.5" style={{ color: C.slate500 }}>
                        {r.plan_name ?? "—"}
                        {r.billing_frequency === "annual" && r.plan_annual_price !== null && (
                          <> · {fmtMoney(r.plan_annual_price)}/yr</>
                        )}
                        {r.billing_frequency === "monthly" && r.plan_monthly_price !== null && (
                          <> · {fmtMoney(r.plan_monthly_price)}/mo</>
                        )}
                        <> · Started {fmtRelative(r.created_at)}</>
                        {remindersFired > 0 && (
                          <> · <span style={{ color: C.amber800 }}>{remindersFired} auto-reminder{remindersFired === 1 ? "" : "s"} sent</span></>
                        )}
                        {r.last_resent_at && (
                          <> · Last touched {fmtRelative(r.last_resent_at)}</>
                        )}
                      </div>
                    </div>

                    {isStillPending && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleResend(r)}
                          disabled={busyId === r.id}
                          title="Resend payment link"
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                          style={{ backgroundColor: C.teal500 }}
                        >
                          <Mail className="w-3.5 h-3.5" /> Resend
                        </button>
                        <button
                          onClick={() => handleCopy(r)}
                          title="Copy payment link"
                          className="p-1.5 rounded-lg border bg-white hover:bg-slate-50"
                          style={{ borderColor: C.slate200, color: C.slate600 }}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {r.checkout_url && (
                          <a
                            href={r.checkout_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open payment link"
                            className="p-1.5 rounded-lg border bg-white hover:bg-slate-50"
                            style={{ borderColor: C.slate200, color: C.slate600 }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleCancel(r)}
                          disabled={busyId === r.id}
                          title="Cancel enrollment"
                          className="p-1.5 rounded-lg border hover:bg-red-50 disabled:opacity-50"
                          style={{ borderColor: C.red200, color: C.red500 }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
