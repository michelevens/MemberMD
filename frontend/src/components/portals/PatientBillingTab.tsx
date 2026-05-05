// PatientBillingTab — Stripe-dashboard-parity surface for one patient.
//
// Three sections, mirroring Stripe's customer page:
//   Insights      Spent + MRR + member-since + billing email
//   Subscriptions Active membership(s) with kebab: Update / Pause collection /
//                 Resume collection / Send card-update link / Cancel
//   Payments      Past invoices/charges with kebab: Refund / Send receipt /
//                 Copy payment ID
//
// Uses the new endpoints shipped 2026-05-05. Designed so PracticePortal
// can simply import and mount this in place of the inline Billing tab —
// keeps PracticePortal.tsx from growing further.

import { useEffect, useRef, useState } from "react";
import {
  CreditCard, MoreHorizontal, Mail, MessageSquare, RefreshCw,
  PauseCircle, PlayCircle, Receipt, Copy, AlertCircle, Calendar,
  DollarSign, Clock, ExternalLink, X,
} from "lucide-react";
import { membershipService, patientBillingService, apiFetch } from "../../lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Toast = (msg: { message: string; type: "success" | "error" }) => void;

interface Props {
  patientId: string;
  patientName: string;
  membershipId: string | null;
  // Patient-detail card data already loaded by PracticePortal — passed
  // through so we don't double-fetch what's already on screen.
  planName?: string | null;
  planPrice?: number | null;
  memberSince?: string | null;
  // Existing kebab actions in PracticePortal still drive change-plan +
  // enroll dialogs; we accept a callback for parity.
  onChangePlan?: () => void;
  onEnroll?: () => void;
  setToast: Toast;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Invoice = Record<string, any>;

export function PatientBillingTab({
  patientId,
  patientName,
  membershipId,
  planName,
  planPrice,
  memberSince,
  onChangePlan,
  onEnroll,
  setToast,
}: Props) {
  // ─── Loaded data ───────────────────────────────────────────────────
  const [insights, setInsights] = useState<{
    spent: number;
    mrr: number;
    billingFrequency: string | null;
    memberSince: string | null;
    billingEmail: string | null;
    billingEmailOverride: string | null;
  } | null>(null);
  const [upcoming, setUpcoming] = useState<{
    amountDue: number;
    nextPaymentAttempt: string | null;
  } | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Dialog state ──────────────────────────────────────────────────
  const [showCardUpdate, setShowCardUpdate] = useState(false);
  const [showPauseCollection, setShowPauseCollection] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showBillingEmail, setShowBillingEmail] = useState(false);
  const [refundDialog, setRefundDialog] = useState<{ paymentIntent: string; amount: number } | null>(null);

  // ─── Per-row kebab open state (Subscriptions + Payments) ───────────
  const [openKebab, setOpenKebab] = useState<string | null>(null);

  // Close kebab on outside click. Single document listener vs. one per
  // row keeps the DOM cheap on long invoice lists.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpenKebab(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const reload = async () => {
    setLoading(true);
    const [insightsRes, upcomingRes, invoicesRes] = await Promise.all([
      patientBillingService.getInsights(patientId),
      membershipId ? membershipService.upcomingInvoice(membershipId) : Promise.resolve({ data: null }),
      // Reuse the existing patient invoices endpoint that PracticePortal
      // already calls — keeps the data shape consistent.
      apiFetch<Invoice[]>(`/patients/${patientId}/invoices`).catch(() => ({ data: [] as Invoice[] })),
    ]);
    if (insightsRes.data) setInsights(insightsRes.data);
    setUpcoming(upcomingRes.data ?? null);
    if (invoicesRes.data) {
      const list = Array.isArray(invoicesRes.data)
        ? invoicesRes.data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : ((invoicesRes.data as any).data ?? []);
      setInvoices(list);
    }
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, membershipId]);

  const memberSinceDisplay = insights?.memberSince ?? memberSince ?? null;

  return (
    <div ref={containerRef} className="space-y-6">
      {/* ── Insights row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightCard
          icon={DollarSign}
          label="Spent"
          value={loading ? "—" : `$${(insights?.spent ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          hint="Sum of paid invoices"
        />
        <InsightCard
          icon={RefreshCw}
          label="MRR"
          value={loading ? "—" : `$${(insights?.mrr ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo`}
          hint={insights?.billingFrequency === "annual" ? "Annual plan, normalized" : "Current monthly rate"}
        />
        <InsightCard
          icon={Calendar}
          label="Member since"
          value={memberSinceDisplay ? new Date(memberSinceDisplay).toLocaleDateString() : "—"}
          hint=""
        />
        <button
          type="button"
          onClick={() => setShowBillingEmail(true)}
          className="rounded-xl p-4 text-left transition-colors hover:bg-slate-50"
          style={{ backgroundColor: "rgba(255,255,255,0.6)", border: "1px solid #e2e8f0" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Billing email</span>
          </div>
          <div className="text-sm font-medium text-slate-800 truncate">{insights?.billingEmail ?? "—"}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {insights?.billingEmailOverride ? "Override active" : "Click to override"}
          </div>
        </button>
      </div>

      {/* ── Subscriptions section ────────────────────────────────────── */}
      <div className="glass rounded-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Subscription</h3>
        </div>

        {membershipId ? (
          <div>
            <div className="px-5 py-4 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "#e0e7ff", color: "#3730a3" }}
              >
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800">{planName ?? "Active membership"}</div>
                <div className="text-xs text-slate-500">
                  {planPrice ? `$${Number(planPrice).toLocaleString()}/mo · ` : ""}
                  Active
                </div>
              </div>
              <KebabMenu
                id={`sub-${membershipId}`}
                open={openKebab === `sub-${membershipId}`}
                onToggle={() => setOpenKebab(openKebab === `sub-${membershipId}` ? null : `sub-${membershipId}`)}
                actions={[
                  ...(onChangePlan ? [{ label: "Change plan", icon: RefreshCw, onClick: () => { setOpenKebab(null); onChangePlan(); } }] : []),
                  { label: "Send card-update link", icon: Mail, onClick: () => { setOpenKebab(null); setShowCardUpdate(true); } },
                  { label: "Pause collection", icon: PauseCircle, onClick: () => { setOpenKebab(null); setShowPauseCollection(true); } },
                  { label: "Resume collection", icon: PlayCircle, onClick: async () => {
                    setOpenKebab(null);
                    const res = await membershipService.resumeCollection(membershipId);
                    if (res.error) setToast({ message: res.error, type: "error" });
                    else { setToast({ message: "Collection resumed.", type: "success" }); reload(); }
                  } },
                  { label: "Cancel subscription", icon: X, danger: true, onClick: () => { setOpenKebab(null); setShowCancel(true); } },
                ]}
              />
            </div>

            {/* Upcoming invoice preview */}
            {upcoming && (
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <Clock className="w-4 h-4 text-slate-400" />
                <div className="flex-1 text-xs text-slate-600">
                  Next charge: <strong>${upcoming.amountDue.toFixed(2)}</strong>
                  {upcoming.nextPaymentAttempt ? ` on ${new Date(upcoming.nextPaymentAttempt).toLocaleDateString()}` : ""}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium text-slate-700 mb-1">No active membership</p>
            <p className="text-xs text-slate-500 mb-4">{patientName} hasn't enrolled in a plan yet.</p>
            {onEnroll && (
              <button
                type="button"
                onClick={onEnroll}
                className="px-4 py-2 rounded-md text-sm font-medium text-white"
                style={{ backgroundColor: "#635bff" }}
              >
                Enroll in plan
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Payments section ────────────────────────────────────────── */}
      <div className="glass rounded-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Payments</h3>
          {membershipId && (
            <button
              type="button"
              onClick={async () => {
                const res = await apiFetch<{ data: { synced?: number } }>(`/memberships/${membershipId}/sync-invoices`, {
                  method: "POST",
                  body: "{}",
                });
                if (res.error) setToast({ message: res.error, type: "error" });
                else { setToast({ message: "Synced from Stripe.", type: "success" }); reload(); }
              }}
              className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
              style={{ borderColor: "#635bff", color: "#635bff" }}
            >
              Sync from Stripe
            </button>
          )}
        </div>
        {invoices.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No payments yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.map((inv) => {
              const amount = Number(inv.amount ?? inv.totalAmount ?? inv.total_amount ?? 0);
              const status = inv.status ?? "unknown";
              const date = inv.date ?? inv.createdAt ?? inv.created_at;
              const description = inv.description ?? inv.memo ?? "Subscription payment";
              const paymentIntent = inv.paymentIntentId ?? inv.payment_intent_id ?? null;
              const kebabId = `pay-${inv.id}`;
              return (
                <div key={inv.id} className="px-5 py-3 flex items-center gap-3">
                  <StatusDot status={status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800">${amount.toFixed(2)} · {description}</div>
                    <div className="text-xs text-slate-500">
                      {date ? new Date(date).toLocaleString() : "—"} · {status}
                    </div>
                  </div>
                  {paymentIntent && (
                    <KebabMenu
                      id={kebabId}
                      open={openKebab === kebabId}
                      onToggle={() => setOpenKebab(openKebab === kebabId ? null : kebabId)}
                      actions={[
                        ...(status === "paid" ? [{
                          label: "Refund payment",
                          icon: RefreshCw,
                          onClick: () => { setOpenKebab(null); setRefundDialog({ paymentIntent, amount }); },
                        }] : []),
                        {
                          label: "Send receipt",
                          icon: Receipt,
                          onClick: async () => {
                            setOpenKebab(null);
                            if (!membershipId) return;
                            const res = await membershipService.sendReceipt(membershipId, { paymentIntent });
                            if (res.error) setToast({ message: res.error, type: "error" });
                            else setToast({ message: "Receipt sent.", type: "success" });
                          },
                        },
                        {
                          label: "Copy payment ID",
                          icon: Copy,
                          onClick: () => {
                            setOpenKebab(null);
                            navigator.clipboard?.writeText(paymentIntent).catch(() => {});
                            setToast({ message: "Copied.", type: "success" });
                          },
                        },
                      ]}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────── */}
      {showCardUpdate && membershipId && (
        <CardUpdateDialog
          membershipId={membershipId}
          onClose={() => setShowCardUpdate(false)}
          setToast={setToast}
        />
      )}
      {showPauseCollection && membershipId && (
        <PauseCollectionDialog
          membershipId={membershipId}
          onClose={() => setShowPauseCollection(false)}
          onSaved={reload}
          setToast={setToast}
        />
      )}
      {showCancel && membershipId && (
        <CancelSubscriptionDialog
          membershipId={membershipId}
          onClose={() => setShowCancel(false)}
          onSaved={reload}
          setToast={setToast}
        />
      )}
      {showBillingEmail && (
        <BillingEmailDialog
          patientId={patientId}
          current={insights?.billingEmailOverride ?? ""}
          onClose={() => setShowBillingEmail(false)}
          onSaved={reload}
          setToast={setToast}
        />
      )}
      {refundDialog && membershipId && (
        <RefundDialog
          membershipId={membershipId}
          paymentIntent={refundDialog.paymentIntent}
          amount={refundDialog.amount}
          onClose={() => setRefundDialog(null)}
          onSaved={reload}
          setToast={setToast}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function InsightCard({
  icon: Icon, label, value, hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.6)", border: "1px solid #e2e8f0" }}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-slate-400" />
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const c =
    status === "paid" ? "#10b981"
    : status === "refunded" ? "#94a3b8"
    : status === "failed" || status === "past_due" ? "#ef4444"
    : "#f59e0b";
  return <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />;
}

function KebabMenu({
  id, open, onToggle, actions,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  actions: Array<{ label: string; icon: React.ElementType; onClick: () => void; danger?: boolean }>;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Actions for ${id}`}
        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-md shadow-lg bg-white border border-slate-200 py-1">
          {actions.map((a, i) => {
            const I = a.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={a.onClick}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 ${a.danger ? "text-red-600" : "text-slate-700"}`}
              >
                <I className="w-3.5 h-3.5" />
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Dialog: card-update link ─────────────────────────────────────────

function CardUpdateDialog({
  membershipId, onClose, setToast,
}: {
  membershipId: string;
  onClose: () => void;
  setToast: Toast;
}) {
  const [channels, setChannels] = useState<{ email: boolean; sms: boolean }>({ email: true, sms: false });
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSend = async () => {
    const ch: Array<"email" | "sms"> = [];
    if (channels.email) ch.push("email");
    if (channels.sms) ch.push("sms");
    if (ch.length === 0) {
      setToast({ message: "Pick at least one channel.", type: "error" });
      return;
    }
    setSubmitting(true);
    const res = await membershipService.sendBillingPortalLink(membershipId, { channels: ch, note: note || undefined });
    setSubmitting(false);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
      return;
    }
    setToast({ message: `Card-update link sent via ${ch.join(" + ")}.`, type: "success" });
    onClose();
  };

  return (
    <Modal title="Send card-update link" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">
        Patient gets a Stripe-hosted page to swap their card. Link is single-use and short-lived.
      </p>
      <label className="flex items-center gap-2 mb-2 text-sm">
        <input type="checkbox" checked={channels.email} onChange={(e) => setChannels({ ...channels, email: e.target.checked })} />
        <Mail className="w-4 h-4 text-slate-400" /> Email
      </label>
      <label className="flex items-center gap-2 mb-3 text-sm">
        <input type="checkbox" checked={channels.sms} onChange={(e) => setChannels({ ...channels, sms: e.target.checked })} />
        <MessageSquare className="w-4 h-4 text-slate-400" /> SMS
      </label>
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-600 mb-1">Personal note (optional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Quick favor — your card on file expired."
          maxLength={500}
          className="w-full px-3 py-2 text-sm rounded-md border border-slate-200"
        />
      </div>
      <DialogActions>
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={submitting}
          className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#635bff" }}
        >
          {submitting ? "Sending…" : "Send link"}
        </button>
      </DialogActions>
    </Modal>
  );
}

// ─── Dialog: pause collection ─────────────────────────────────────────

function PauseCollectionDialog({
  membershipId, onClose, onSaved, setToast,
}: {
  membershipId: string;
  onClose: () => void;
  onSaved: () => void;
  setToast: Toast;
}) {
  const [resumeAt, setResumeAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handlePause = async () => {
    setSubmitting(true);
    const res = await membershipService.pauseCollection(membershipId, {
      behavior: "keep_as_draft",
      resumeAt: resumeAt || undefined,
    });
    setSubmitting(false);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
      return;
    }
    setToast({ message: "Collection paused.", type: "success" });
    onSaved();
    onClose();
  };

  return (
    <Modal title="Pause Stripe collection" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">
        Stops Stripe from charging until resumed, but keeps the membership active. Patient stays enrolled; no churn signal.
      </p>
      <p className="text-xs text-slate-500 mb-4">
        Different from <strong>Cancel</strong> (ends membership) or membership <strong>Pause</strong> (locks the patient out of services).
      </p>
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-600 mb-1">Auto-resume on (optional)</label>
        <input
          type="date"
          value={resumeAt}
          onChange={(e) => setResumeAt(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
          className="w-full px-3 py-2 text-sm rounded-md border border-slate-200"
        />
        <p className="text-xs text-slate-400 mt-1">Leave blank to pause indefinitely; resume manually.</p>
      </div>
      <DialogActions>
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
        <button
          type="button"
          onClick={handlePause}
          disabled={submitting}
          className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#f59e0b" }}
        >
          {submitting ? "Pausing…" : "Pause collection"}
        </button>
      </DialogActions>
    </Modal>
  );
}

// ─── Dialog: cancel subscription (Stripe-style) ───────────────────────

function CancelSubscriptionDialog({
  membershipId, onClose, onSaved, setToast,
}: {
  membershipId: string;
  onClose: () => void;
  onSaved: () => void;
  setToast: Toast;
}) {
  const [when, setWhen] = useState<"end_of_period" | "immediately" | "custom">("end_of_period");
  const [customDate, setCustomDate] = useState("");
  const [reason, setReason] = useState<"moved" | "cost" | "dissatisfied" | "switching_provider" | "other">("other");
  const [reasonNotes, setReasonNotes] = useState("");
  const [refundLastPayment, setRefundLastPayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const showRefundOption = when === "immediately";
  const showCancelWithRefundHint = when === "immediately" && refundLastPayment;

  const handleCancel = async () => {
    if (when === "custom" && !customDate) {
      setToast({ message: "Pick a date.", type: "error" });
      return;
    }
    setSubmitting(true);
    const res = await membershipService.adminCancel(membershipId, {
      reason,
      reasonNotes: reasonNotes || undefined,
      immediately: when === "immediately",
      cancelAt: when === "custom" ? new Date(customDate + "T00:00:00").toISOString() : undefined,
      refundLastPayment: showRefundOption ? refundLastPayment : undefined,
    });
    setSubmitting(false);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
      return;
    }
    setToast({ message: "Subscription cancelled.", type: "success" });
    onSaved();
    onClose();
  };

  return (
    <Modal title="Cancel subscription" onClose={onClose} wide>
      {showCancelWithRefundHint && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-900">
            Cancelling with a refund issues a credit note. Consider <strong>End of current period</strong> instead — patient keeps coverage they paid for, no refund needed.
          </div>
        </div>
      )}

      <div className="space-y-3 mb-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Cancel</label>
        <CancelOption
          checked={when === "immediately"}
          onChange={() => setWhen("immediately")}
          label="Immediately"
          sub={new Date().toLocaleDateString()}
        />
        <CancelOption
          checked={when === "end_of_period"}
          onChange={() => setWhen("end_of_period")}
          label="End of the current period"
          sub="Keeps coverage through the period they paid for"
        />
        <CancelOption
          checked={when === "custom"}
          onChange={() => setWhen("custom")}
          label="On a custom date"
          sub={
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              onClick={() => setWhen("custom")}
              className="mt-1 px-2 py-1 text-xs rounded border border-slate-200"
            />
          }
        />
      </div>

      {showRefundOption && (
        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Refund</label>
          <label className="flex items-start gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={refundLastPayment}
              onChange={(e) => setRefundLastPayment(e.target.checked)}
              className="mt-0.5"
            />
            <span>Refund last payment</span>
          </label>
        </div>
      )}

      <div className="mb-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Reason</label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
          className="w-full px-3 py-2 text-sm rounded-md border border-slate-200"
        >
          <option value="moved">Moved</option>
          <option value="cost">Cost</option>
          <option value="dissatisfied">Dissatisfied</option>
          <option value="switching_provider">Switching provider</option>
          <option value="other">Other</option>
        </select>
        <input
          type="text"
          value={reasonNotes}
          onChange={(e) => setReasonNotes(e.target.value)}
          placeholder="Optional details"
          maxLength={500}
          className="w-full mt-2 px-3 py-2 text-sm rounded-md border border-slate-200"
        />
      </div>

      <DialogActions>
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100">
          Don't cancel
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#dc2626" }}
        >
          {submitting ? "Cancelling…" : "Cancel subscription"}
        </button>
      </DialogActions>
    </Modal>
  );
}

function CancelOption({
  checked, onChange, label, sub,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  sub: React.ReactNode;
}) {
  return (
    <label
      className="flex items-start gap-3 cursor-pointer p-3 rounded-md border transition-colors"
      style={{
        borderColor: checked ? "#635bff" : "#e2e8f0",
        backgroundColor: checked ? "rgba(99,91,255,0.05)" : "transparent",
      }}
    >
      <input type="radio" checked={checked} onChange={onChange} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
      </div>
    </label>
  );
}

// ─── Dialog: refund a single payment ──────────────────────────────────

function RefundDialog({
  membershipId, paymentIntent, amount, onClose, onSaved, setToast,
}: {
  membershipId: string;
  paymentIntent: string;
  amount: number;
  onClose: () => void;
  onSaved: () => void;
  setToast: Toast;
}) {
  const [partial, setPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState(amount.toFixed(2));
  const [reason, setReason] = useState<"requested_by_customer" | "duplicate" | "fraudulent">("requested_by_customer");
  const [submitting, setSubmitting] = useState(false);

  const handleRefund = async () => {
    setSubmitting(true);
    const cents = partial ? Math.round(parseFloat(partialAmount) * 100) : undefined;
    const res = await membershipService.refundSinglePayment(membershipId, {
      paymentIntent,
      amountCents: cents,
      reason,
    });
    setSubmitting(false);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
      return;
    }
    setToast({ message: `Refunded $${res.data?.amount?.toFixed(2) ?? amount.toFixed(2)}.`, type: "success" });
    onSaved();
    onClose();
  };

  return (
    <Modal title="Refund payment" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-4">
        Original charge: <strong>${amount.toFixed(2)}</strong>
      </p>
      <label className="flex items-start gap-2 cursor-pointer text-sm mb-3">
        <input type="radio" checked={!partial} onChange={() => setPartial(false)} className="mt-0.5" />
        <span>Full refund (${amount.toFixed(2)})</span>
      </label>
      <label className="flex items-start gap-2 cursor-pointer text-sm mb-3">
        <input type="radio" checked={partial} onChange={() => setPartial(true)} className="mt-0.5" />
        <span className="flex-1">
          Partial refund
          {partial && (
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={amount}
              value={partialAmount}
              onChange={(e) => setPartialAmount(e.target.value)}
              className="ml-2 w-24 px-2 py-1 text-sm rounded border border-slate-200"
            />
          )}
        </span>
      </label>
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-600 mb-1">Reason</label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
          className="w-full px-3 py-2 text-sm rounded-md border border-slate-200"
        >
          <option value="requested_by_customer">Requested by customer</option>
          <option value="duplicate">Duplicate</option>
          <option value="fraudulent">Fraudulent</option>
        </select>
      </div>
      <DialogActions>
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleRefund}
          disabled={submitting}
          className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#dc2626" }}
        >
          {submitting ? "Refunding…" : "Issue refund"}
        </button>
      </DialogActions>
    </Modal>
  );
}

// ─── Dialog: billing email override ───────────────────────────────────

function BillingEmailDialog({
  patientId, current, onClose, onSaved, setToast,
}: {
  patientId: string;
  current: string;
  onClose: () => void;
  onSaved: () => void;
  setToast: Toast;
}) {
  const [value, setValue] = useState(current);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async (clear = false) => {
    setSubmitting(true);
    const res = await patientBillingService.setBillingEmail(patientId, clear ? null : (value.trim() || null));
    setSubmitting(false);
    if (res.error) {
      setToast({ message: res.error, type: "error" });
      return;
    }
    setToast({ message: clear ? "Override cleared." : "Billing email saved.", type: "success" });
    onSaved();
    onClose();
  };

  return (
    <Modal title="Billing email override" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-4">
        Receipts and card-update prompts go to this address instead of the patient's primary email. Clinical email stays unchanged.
      </p>
      <input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="billing@example.com"
        className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 mb-4"
      />
      <DialogActions>
        {current && (
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={submitting}
            className="mr-auto px-4 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Clear override
          </button>
        )}
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={submitting}
          className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#635bff" }}
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </DialogActions>
    </Modal>
  );
}

// ─── Modal scaffolding ────────────────────────────────────────────────

function Modal({
  title, children, onClose, wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div
        className="bg-white rounded-xl shadow-xl w-full overflow-hidden"
        style={{ maxWidth: wide ? "560px" : "440px" }}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2 mt-2">{children}</div>;
}

// External link icon kept exported — used by future "Open in Stripe" link
// from the kebab once we expose that route.
void ExternalLink;
