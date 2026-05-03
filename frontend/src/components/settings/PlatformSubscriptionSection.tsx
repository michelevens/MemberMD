// ===== Platform Subscription Section =====
// The practice's view of their MemberMD bill (Practice → SuperAdmin direction).
// Distinct from Membership tab (Patient → Practice direction).
//
// Surfaces: current plan, usage vs caps, billing history, change-tier flow,
// cancel-with-reason flow.

import { useEffect, useMemo, useState } from "react";
import { Check, AlertCircle, Loader2, Crown, ChevronRight, Star, X, Plus, Minus, TrendingUp, Tag, CreditCard } from "lucide-react";
import {
  subscriptionService,
  type PlatformPlanSummary,
  type PracticeSubscriptionSummary,
  type PlatformInvoiceRow,
  type CancellationReason,
} from "../../lib/api";

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
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  slate800: "#1e293b",
  white: "#ffffff",
  gold: "#fbbf24",
};

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "$0";
  const v = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(v)) return "$0";
  return v % 1 === 0 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;
}

function formatDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function capLabel(used: number, max: number | null): string {
  if (max === null) return `${used} / ∞`;
  return `${used} / ${max}`;
}

function capProgress(used: number, max: number | null): number {
  if (max === null || max === 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

function capColor(progress: number): string {
  if (progress >= 100) return C.red500;
  if (progress >= 90) return C.red500;
  if (progress >= 75) return C.amber500;
  return C.teal500;
}

export function PlatformSubscriptionSection() {
  const [sub, setSub] = useState<PracticeSubscriptionSummary | null>(null);
  const [plans, setPlans] = useState<PlatformPlanSummary[]>([]);
  const [invoices, setInvoices] = useState<PlatformInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showChangeDialog, setShowChangeDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showSeatsDialog, setShowSeatsDialog] = useState(false);

  const reload = async () => {
    setLoading(true);
    const [s, p, i] = await Promise.all([
      subscriptionService.show(),
      subscriptionService.plans(),
      subscriptionService.invoices(),
    ]);
    if (s.error) setError(s.error);
    setSub(s.data ?? null);
    setPlans(p.data ?? []);
    setInvoices(i.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl p-5 animate-pulse" style={{ backgroundColor: C.slate100, height: 160 }} />
        <div className="rounded-2xl p-5 animate-pulse" style={{ backgroundColor: C.slate100, height: 200 }} />
      </div>
    );
  }

  if (error || !sub) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ border: `1px solid ${C.slate200}` }}>
        <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: C.slate300 }} />
        <p className="text-sm" style={{ color: C.slate500 }}>
          {error || "No subscription on file. Contact MemberMD support."}
        </p>
      </div>
    );
  }

  const isFounder = sub.isFounderOverride;
  const isCancelling = sub.cancelsAt !== null;
  const isCancelled = sub.status === "cancelled";

  return (
    <div className="space-y-6">
      {/* Plan card */}
      <div className="rounded-2xl p-6" style={{ background: `linear-gradient(135deg, ${C.navy800}, ${C.teal600})` }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              {isFounder ? <Crown className="w-5 h-5" style={{ color: C.gold }} /> : <Star className="w-5 h-5" style={{ color: C.gold }} />}
              <span className="text-white text-2xl font-bold">{sub.plan.name}</span>
              {isFounder && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: C.gold, color: C.navy800 }}>
                  Internal — never billed
                </span>
              )}
            </div>
            <p className="text-white/80 text-sm mt-1">
              {sub.status === "trial" && sub.trialEndsAt && (
                <>Trial ends {formatDate(sub.trialEndsAt)}</>
              )}
              {sub.status === "active" && !isFounder && <>Active subscription</>}
              {sub.status === "active" && isFounder && <>Founder access</>}
              {sub.status === "past_due" && <>Past due — please update payment method</>}
              {sub.status === "cancelled" && <>Cancelled</>}
            </p>
          </div>
          <div className="text-right">
            <div className="text-white text-3xl font-bold">
              {isFounder ? "$0" : formatCurrency(sub.plan.monthlyPrice)}
            </div>
            <div className="text-white/70 text-xs">{isFounder ? "internal" : "/ month"}</div>
          </div>
        </div>

        {isCancelling && !isCancelled && (
          <div className="mt-4 rounded-lg p-3 flex items-center gap-2" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
            <AlertCircle className="w-4 h-4 text-white shrink-0" />
            <p className="text-white text-sm flex-1">
              Cancellation scheduled for {formatDate(sub.cancelsAt)}
            </p>
            <button
              onClick={async () => {
                const res = await subscriptionService.reactivate();
                if (res.error) {
                  setError(res.error);
                  return;
                }
                await reload();
              }}
              className="text-white text-xs font-semibold underline hover:no-underline"
            >
              Undo
            </button>
          </div>
        )}
      </div>

      {/* Usage card */}
      <div className="rounded-2xl p-5" style={{ border: `1px solid ${C.slate200}` }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: C.navy800 }}>Resource Usage</h3>
        <div className="space-y-3">
          <UsageRow label="Members" used={sub.usage.members} max={sub.plan.maxMembers} />
          <UsageRow label="Providers" used={sub.usage.providers} max={sub.plan.maxProviders} />
          <UsageRow label="Staff seats" used={sub.usage.staff} max={sub.plan.maxStaff} />
          <UsageRow label="Active programs" used={sub.usage.programs} max={sub.plan.maxActivePrograms} />
          <UsageRow label="Locations" used={sub.usage.locations} max={sub.plan.maxLocations} />
          <UsageRow label="Employer accounts" used={sub.usage.employers} max={sub.plan.maxEmployers} />
        </div>
      </div>

      {/* Seat capacity (only when plan supports overage purchases) */}
      {!isFounder && sub.plan.maxMembers !== null && (
        <SeatCapacityCard sub={sub} onBuy={() => setShowSeatsDialog(true)} />
      )}

      {/* Action buttons */}
      {!isFounder && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowChangeDialog(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: C.teal600 }}
          >
            Change Plan
          </button>
          <UpdatePaymentMethodButton />
          {!isCancelling && !isCancelled && (
            <button
              onClick={() => setShowCancelDialog(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold border"
              style={{ borderColor: C.red500, color: C.red500 }}
            >
              Cancel Subscription
            </button>
          )}
        </div>
      )}

      {/* Coupon redemption */}
      {!isFounder && !isCancelled && <CouponRedeemRow onApplied={reload} />}

      {/* Invoice history */}
      <div className="rounded-2xl p-5" style={{ border: `1px solid ${C.slate200}` }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: C.navy800 }}>Billing History</h3>
        {invoices.length === 0 ? (
          <p className="text-sm" style={{ color: C.slate500 }}>
            {isFounder ? "Founder accounts are not billed." : "No invoices yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: C.slate100 }}>
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: C.slate800 }}>
                    {inv.stripeInvoiceNumber || inv.id.slice(0, 8)}
                  </div>
                  <div className="text-xs" style={{ color: C.slate500 }}>{formatDate(inv.issuedAt)}</div>
                </div>
                <div className="text-sm font-semibold mx-3" style={{ color: C.slate800 }}>
                  {formatCurrency(inv.amountTotalCents / 100)}
                </div>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded capitalize"
                  style={{
                    backgroundColor: inv.status === "paid" ? C.teal50 : C.amber50,
                    color: inv.status === "paid" ? C.teal600 : C.amber500,
                  }}
                >
                  {inv.status}
                </span>
                {inv.invoicePdfUrl && (
                  <a
                    href={inv.invoicePdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-xs font-medium"
                    style={{ color: C.teal600 }}
                  >
                    PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showChangeDialog && (
        <ChangePlanDialog
          plans={plans}
          currentPlanKey={sub.plan.key}
          onClose={() => setShowChangeDialog(false)}
          onChanged={async () => {
            setShowChangeDialog(false);
            await reload();
          }}
        />
      )}

      {showCancelDialog && (
        <CancelDialog
          onClose={() => setShowCancelDialog(false)}
          onCancelled={async () => {
            setShowCancelDialog(false);
            await reload();
          }}
        />
      )}

      {showSeatsDialog && sub && (
        <BuySeatsDialog
          sub={sub}
          onClose={() => setShowSeatsDialog(false)}
          onSaved={async () => {
            setShowSeatsDialog(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function UpdatePaymentMethodButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setLoading(true);
    setError(null);
    const res = await subscriptionService.openBillingPortal();
    if (res.error || !res.data?.url) {
      setError(res.error || "Could not open billing portal.");
      setLoading(false);
      setTimeout(() => setError(null), 4000);
      return;
    }
    // Hand off to Stripe-hosted portal. Stripe redirects back to
    // FRONTEND_URL/#/practice/settings?tab=subscription on save/close.
    window.location.href = res.data.url;
  };

  return (
    <>
      <button
        onClick={open}
        disabled={loading}
        className="px-4 py-2 rounded-lg text-sm font-semibold border inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50"
        style={{ borderColor: C.slate300, color: C.slate600 }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
        Update payment method
      </button>
      {error && (
        <span className="text-xs" style={{ color: C.red500 }}>
          {error}
        </span>
      )}
    </>
  );
}

function CouponRedeemRow({ onApplied }: { onApplied: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const submit = async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    const res = await subscriptionService.redeemCoupon(code.trim());
    setSubmitting(false);
    if (res.error) {
      setFeedback({ message: res.error, type: "error" });
      return;
    }
    setFeedback({ message: "Coupon applied — discount appears on your next invoice.", type: "success" });
    setCode("");
    await onApplied();
  };

  return (
    <div className="rounded-2xl p-4" style={{ border: `1px solid ${C.slate200}` }}>
      <div className="flex items-center gap-2 mb-2">
        <Tag className="w-4 h-4" style={{ color: C.slate500 }} />
        <span className="text-sm font-semibold" style={{ color: C.slate800 }}>Have a coupon?</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter code"
          className="flex-1 px-3 py-2 border rounded-lg text-sm uppercase tracking-wide"
          style={{ borderColor: C.slate200 }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <button
          onClick={submit}
          disabled={!code.trim() || submitting}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50"
          style={{ backgroundColor: C.teal600 }}
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Apply
        </button>
      </div>
      {feedback && (
        <div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{
          backgroundColor: feedback.type === "success" ? C.teal50 : C.red50,
          color: feedback.type === "success" ? C.teal600 : C.red500,
        }}>
          {feedback.message}
        </div>
      )}
    </div>
  );
}

function SeatCapacityCard({ sub, onBuy }: { sub: PracticeSubscriptionSummary; onBuy: () => void }) {
  const includedSeats = sub.plan.maxMembers ?? 0;
  const usedMembers = sub.usage.members;
  // Backend's effectiveMemberCap = max_members + purchased * block_size.
  // Falls back to plan-included when not surfaced.
  const effectiveCap = sub.effectiveMemberCap ?? includedSeats;
  const hasPurchased = effectiveCap > includedSeats;
  const headroom = effectiveCap - usedMembers;
  const nearCap = headroom <= 5 || (effectiveCap > 0 && usedMembers / effectiveCap >= 0.85);

  return (
    <div className="rounded-2xl p-5 flex items-center gap-4 flex-wrap" style={{ border: `1px solid ${nearCap ? C.amber500 : C.slate200}`, backgroundColor: nearCap ? C.amber50 : C.white }}>
      <div className="flex-1 min-w-[200px]">
        <h3 className="text-sm font-semibold mb-1" style={{ color: C.navy800 }}>Member capacity</h3>
        <p className="text-xs" style={{ color: C.slate500 }}>
          Using {usedMembers} of {effectiveCap} seats
          {hasPurchased && ` (${includedSeats} included + ${effectiveCap - includedSeats} purchased)`}.
          {headroom > 0 ? ` ${headroom} seat${headroom === 1 ? "" : "s"} available.` : " Capacity is full — buy more to enroll new members."}
        </p>
      </div>
      <button
        onClick={onBuy}
        className="px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
        style={{
          backgroundColor: nearCap ? C.amber500 : C.teal600,
          color: C.white,
        }}
      >
        <TrendingUp className="w-4 h-4" />
        {hasPurchased ? "Manage seats" : "Buy more seats"}
      </button>
    </div>
  );
}

function BuySeatsDialog({
  sub,
  onClose,
  onSaved,
}: {
  sub: PracticeSubscriptionSummary;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const includedSeats = sub.plan.maxMembers ?? 0;
  const effectiveCap = sub.effectiveMemberCap ?? includedSeats;

  // Block size + price + currentBlocks all derive from /me/subscription/plans
  // (the AuthSubscriptionSummary on /me doesn't carry block fields).
  const [blockSize, setBlockSize] = useState<number | null>(null);
  const [blockPrice, setBlockPrice] = useState<number | null>(null);
  const [targetBlocks, setTargetBlocks] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    subscriptionService.plans().then((r) => {
      const p = (r.data ?? []).find((pl) => pl.key === sub.plan.key);
      if (p && p.extraSeatBlockSize) {
        setBlockSize(p.extraSeatBlockSize);
        setBlockPrice(p.extraSeatBlockPrice);
        const blocks = effectiveCap > includedSeats
          ? Math.round((effectiveCap - includedSeats) / p.extraSeatBlockSize)
          : 0;
        setTargetBlocks(blocks);
      }
    });
  }, [sub.plan.key, effectiveCap, includedSeats]);

  const currentBlocks = effectiveCap > includedSeats && blockSize
    ? Math.round((effectiveCap - includedSeats) / blockSize)
    : 0;

  const projectedCap = includedSeats + (blockSize ?? 0) * targetBlocks;
  const projectedExtraCost = (blockPrice ?? 0) * targetBlocks;
  const usedMembers = sub.usage.members;
  const tooSmall = projectedCap < usedMembers;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const res = await subscriptionService.setSeatBlocks(targetBlocks);
    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    await onSaved();
  };

  if (blockSize === null || blockPrice === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: C.teal600 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.slate100 }}>
          <h3 className="text-lg font-bold" style={{ color: C.slate800 }}>Member capacity</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="w-5 h-5" style={{ color: C.slate500 }} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-lg p-3" style={{ backgroundColor: C.slate100 }}>
            <p className="text-xs" style={{ color: C.slate500 }}>{sub.plan.name} includes</p>
            <p className="text-lg font-semibold" style={{ color: C.navy800 }}>
              {includedSeats} members
            </p>
            <p className="text-xs mt-1" style={{ color: C.slate500 }}>
              Each extra block = {blockSize} more members for ${blockPrice}/mo
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: C.slate600 }}>
              Number of extra seat blocks
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTargetBlocks(Math.max(0, targetBlocks - 1))}
                disabled={targetBlocks === 0}
                className="w-10 h-10 rounded-lg border flex items-center justify-center disabled:opacity-40"
                style={{ borderColor: C.slate200 }}
              >
                <Minus className="w-4 h-4" style={{ color: C.slate600 }} />
              </button>
              <div className="flex-1 text-center">
                <div className="text-3xl font-bold" style={{ color: C.navy800 }}>{targetBlocks}</div>
                <div className="text-xs" style={{ color: C.slate500 }}>
                  block{targetBlocks === 1 ? "" : "s"}
                </div>
              </div>
              <button
                onClick={() => setTargetBlocks(Math.min(100, targetBlocks + 1))}
                className="w-10 h-10 rounded-lg border flex items-center justify-center"
                style={{ borderColor: C.slate200 }}
              >
                <Plus className="w-4 h-4" style={{ color: C.slate600 }} />
              </button>
            </div>
          </div>

          <div className="rounded-lg p-3 space-y-1" style={{ backgroundColor: C.teal50 }}>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: C.slate600 }}>New capacity</span>
              <span className="font-semibold" style={{ color: C.navy800 }}>{projectedCap} members</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: C.slate600 }}>Extra monthly cost</span>
              <span className="font-semibold" style={{ color: projectedExtraCost > 0 ? C.teal600 : C.slate500 }}>
                {projectedExtraCost === 0 ? "—" : `+$${projectedExtraCost}/mo`}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1" style={{ color: C.slate500 }}>
              <span>Currently using</span>
              <span>{usedMembers} members</span>
            </div>
          </div>

          {tooSmall && (
            <div className="rounded-lg p-3 text-sm flex items-start gap-2" style={{ backgroundColor: C.red50, color: C.red500 }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>You currently have {usedMembers} active members. Lowering capacity below that will block new enrollments. Existing members keep access.</span>
            </div>
          )}

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
            disabled={submitting || targetBlocks === currentBlocks}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ backgroundColor: C.teal600 }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Saving…" : targetBlocks > currentBlocks ? `Buy ${targetBlocks - currentBlocks} block${targetBlocks - currentBlocks === 1 ? "" : "s"}` : targetBlocks < currentBlocks ? "Reduce capacity" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsageRow({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = capProgress(used, max);
  const color = capColor(pct);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span style={{ color: C.slate500 }}>{label}</span>
        <span className="font-medium" style={{ color: C.slate800 }}>{capLabel(used, max)}</span>
      </div>
      <div className="w-full h-2 rounded-full" style={{ backgroundColor: C.slate200 }}>
        <div
          className="h-2 rounded-full transition-all"
          style={{
            width: max === null ? "8%" : `${pct}%`,
            backgroundColor: max === null ? C.teal500 : color,
            opacity: max === null ? 0.4 : 1,
          }}
        />
      </div>
    </div>
  );
}

function ChangePlanDialog({
  plans,
  currentPlanKey,
  onClose,
  onChanged,
}: {
  plans: PlatformPlanSummary[];
  currentPlanKey: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visiblePlans = useMemo(
    () => plans.filter((p) => p.isPubliclyListed && !p.isQuoteOnly),
    [plans]
  );

  const submit = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    const res = await subscriptionService.changePlan({ platformPlanId: selectedId, billingCycle });
    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    // First-time subscribers get bounced to Stripe Checkout to collect a
    // card. The webhook flips the subscription to active when they complete;
    // Stripe redirects them back to this tab afterward.
    const data = res.data as { checkoutUrl?: string; requiresCheckout?: boolean } | null;
    if (data?.requiresCheckout && data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    await onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.slate100 }}>
          <h3 className="text-lg font-bold" style={{ color: C.slate800 }}>Choose your plan</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="w-5 h-5" style={{ color: C.slate500 }} />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setBillingCycle("monthly")}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: billingCycle === "monthly" ? C.teal600 : C.slate100,
                color: billingCycle === "monthly" ? C.white : C.slate600,
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: billingCycle === "annual" ? C.teal600 : C.slate100,
                color: billingCycle === "annual" ? C.white : C.slate600,
              }}
            >
              Annual <span className="text-xs">(2 months free)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {visiblePlans.map((p) => {
              const isCurrent = p.key === currentPlanKey;
              const isSelected = selectedId === p.id;
              const price = billingCycle === "annual" ? p.annualPrice : p.monthlyPrice;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => setSelectedId(p.id)}
                  className="text-left p-4 rounded-xl border-2 transition-all relative"
                  style={{
                    borderColor: isSelected ? C.teal600 : isCurrent ? C.slate200 : C.slate100,
                    backgroundColor: isCurrent ? C.slate100 : C.white,
                    opacity: isCurrent ? 0.7 : 1,
                    cursor: isCurrent ? "default" : "pointer",
                  }}
                >
                  {p.badgeText && (
                    <div
                      className="absolute -top-2 left-3 text-xs font-bold px-2 py-0.5 rounded"
                      style={{ backgroundColor: C.gold, color: C.navy800 }}
                    >
                      {p.badgeText}
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-bold" style={{ color: C.slate800 }}>{p.name}</span>
                    {isCurrent && (
                      <span className="text-xs font-medium" style={{ color: C.slate500 }}>Current</span>
                    )}
                  </div>
                  <div className="mb-3">
                    <span className="text-2xl font-bold" style={{ color: C.navy800 }}>
                      {formatCurrency(price)}
                    </span>
                    <span className="text-xs" style={{ color: C.slate500 }}>
                      {billingCycle === "annual" ? " / year" : " / month"}
                    </span>
                  </div>
                  <p className="text-xs mb-3" style={{ color: C.slate500 }}>{p.description}</p>
                  <ul className="space-y-1 text-xs" style={{ color: C.slate600 }}>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 shrink-0" style={{ color: C.teal600 }} />
                      {p.maxMembers === null ? "Unlimited members" : `${p.maxMembers} members`}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 shrink-0" style={{ color: C.teal600 }} />
                      {p.maxProviders === null ? "Unlimited providers" : `${p.maxProviders} provider${p.maxProviders === 1 ? "" : "s"}`}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 shrink-0" style={{ color: C.teal600 }} />
                      {p.maxActivePrograms === null ? "Unlimited programs" : `${p.maxActivePrograms} active program${p.maxActivePrograms === 1 ? "" : "s"}`}
                    </li>
                    {p.maxEmployers !== 0 && (
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3 h-3 shrink-0" style={{ color: C.teal600 }} />
                        {p.maxEmployers === null ? "Unlimited employers" : `${p.maxEmployers} employer accounts`}
                      </li>
                    )}
                    {p.extraSeatBlockSize && (
                      <li className="flex items-center gap-1.5 pt-1" style={{ color: C.slate400 }}>
                        +{formatCurrency(p.extraSeatBlockPrice)} per {p.extraSeatBlockSize} more
                      </li>
                    )}
                  </ul>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mt-4 rounded-lg p-3 text-sm" style={{ backgroundColor: C.red50, color: C.red500 }}>
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
            disabled={!selectedId || submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ backgroundColor: C.teal600 }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Switching…" : "Switch plan"}
            {!submitting && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelDialog({
  onClose,
  onCancelled,
}: {
  onClose: () => void;
  onCancelled: () => Promise<void>;
}) {
  const [reasons, setReasons] = useState<CancellationReason[]>([]);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [notes, setNotes] = useState("");
  const [immediate, setImmediate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    subscriptionService.cancellationReasons().then((r) => setReasons(r.data ?? []));
  }, []);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const isOther = reasons.find((r) => r.id === reasonId)?.label === "Other";
    const res = await subscriptionService.cancel({
      cancellationReasonId: reasonId,
      cancellationReasonOther: isOther ? otherText : null,
      cancellationNotes: notes || null,
      cancelImmediately: immediate,
    });
    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    await onCancelled();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-5" style={{ background: `linear-gradient(135deg, ${C.red500}, #ef4444)` }}>
          <h3 className="text-white text-lg font-bold">Cancel MemberMD subscription</h3>
          <p className="text-white/85 text-sm mt-1">Tell us why so we can keep improving.</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.slate600 }}>
              Reason
            </label>
            <select
              value={reasonId || ""}
              onChange={(e) => setReasonId(e.target.value || null)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: C.slate200 }}
            >
              <option value="">Choose a reason…</option>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>

          {reasons.find((r) => r.id === reasonId)?.label === "Other" && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.slate600 }}>
                Please describe
              </label>
              <input
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                maxLength={200}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                style={{ borderColor: C.slate200 }}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.slate600 }}>
              Anything else? (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: C.slate200 }}
              placeholder="Help us improve…"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={immediate}
              onChange={(e) => setImmediate(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm" style={{ color: C.slate600 }}>
              Cancel immediately (no refund of current period). Default is end-of-billing-cycle.
            </span>
          </label>

          {error && (
            <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: C.red50, color: C.red500 }}>
              {error}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: C.slate100 }}>
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-100" style={{ color: C.slate600 }}>
            Keep my subscription
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ backgroundColor: C.red500 }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {immediate ? "Cancel now" : "Cancel at end of cycle"}
          </button>
        </div>
      </div>
    </div>
  );
}
