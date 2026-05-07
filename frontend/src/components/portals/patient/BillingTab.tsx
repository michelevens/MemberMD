// ===== Patient BillingTab =====
// Self-contained billing surface for the patient portal. Surfaces:
//   - Current plan card (with trial countdown when applicable)
//   - Visits used / allowed for the current period
//   - Cards on file with rotation flow (Stripe Elements via SetupIntent)
//   - Invoice history
//   - Cancel membership flow (end-of-period, with reason capture)
//
// All four pieces live in one file deliberately — they share state
// (active membership, refresh triggers) and splitting them across
// files would invite prop-drilling without real reuse benefit.

import { useEffect, useMemo, useState } from "react";
import {
  CreditCard, X, AlertCircle, Calendar, CheckCircle2,
  Receipt, Plus, Star, Shield, Loader2, ChevronRight, FileText,
} from "lucide-react";
import {
  membershipService,
  invoiceService,
  paymentMethodService,
  entitlementService,
  clinicalSettingsService,
  apiFetch,
} from "../../../lib/api";
import { formatDate, formatCurrency } from "../../../lib/format";
import { MyAgreementsSection } from "./MyAgreementsSection";
import { FamilyMembersSection } from "./FamilyMembersSection";
import type { PatientMembership, Invoice, PatientEntitlement } from "../../../types";

// ─── Colors ─────────────────────────────────────────────────────────────────

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  navy700: "#334e68",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal50: "#e6fffa",
  gold: "#D4A855",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  white: "#ffffff",
  red500: "#ef4444",
  red50: "#fef2f2",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  green500: "#22c55e",
  green50: "#dcfce7",
};


// ─── Ad-hoc charge row (patient-side shape from /me/ad-hoc-charges) ─────────

interface AdHocChargeRow {
  id: string;
  description: string;
  lineItems: Array<{ description: string; amount_cents?: number; amountCents?: number }> | null;
  amountCents: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "cancelled" | "expired";
  checkoutUrl: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BillingTab() {
  const [membership, setMembership] = useState<PatientMembership | null>(null);
  const [entitlements, setEntitlements] = useState<PatientEntitlement[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  // Ad-hoc charges (one-time bills the practice issued for forms,
  // after-hours calls, etc.). Patients pay via the Stripe-hosted
  // checkout link — we surface unpaid ones prominently so the
  // patient doesn't have to dig through email.
  const [adHocCharges, setAdHocCharges] = useState<AdHocChargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [cancelOpen, setCancelOpen] = useState(false);
  // Stripe-hosted Customer Portal (port shipping in this commit) — opens
  // a Stripe URL for self-serve card / invoice / cancellation management.
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);
  const [billingPortalError, setBillingPortalError] = useState<string | null>(null);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [syncingFromStripe, setSyncingFromStripe] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    // Laravel paginated responses come back as { data: { current_page, data: [...] } }
    // rather than a bare array. Same shape both endpoints use here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unwrap = <T,>(payload: any): T[] => {
      if (Array.isArray(payload)) return payload as T[];
      if (Array.isArray(payload?.data)) return payload.data as T[];
      if (Array.isArray(payload?.items)) return payload.items as T[];
      return [];
    };

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // /memberships scopes to the current user when role=patient.
        const mr = await membershipService.list({ status: "active" });
        if (cancelled) return;
        const memberships = unwrap<PatientMembership>(mr.data);
        const m = memberships.find((x) =>
          ["active", "past_due"].includes(String(x.status))
        ) || memberships[0] || null;
        setMembership(m);

        if (m?.id) {
          const [er, ir, ahr] = await Promise.all([
            entitlementService.listForMembership(m.id),
            invoiceService.list(),
            // Ad-hoc charges live independently of memberships, so we
            // fetch them whether or not there's an active plan. Caller
            // is auth'd as patient; backend scopes by user.id → patient.
            apiFetch<AdHocChargeRow[]>("/me/ad-hoc-charges"),
          ]);
          if (cancelled) return;
          setEntitlements(unwrap<PatientEntitlement>(er.data));
          setInvoices(unwrap<Invoice>(ir.data));
          setAdHocCharges(Array.isArray(ahr.data) ? ahr.data : []);
        } else {
          setEntitlements([]);
          setInvoices([]);
          // Even without a membership, a patient might owe an ad-hoc
          // charge (e.g. self-pay one-off visit before they enroll).
          // Fetch independently of m?.id check.
          try {
            const ahr = await apiFetch<AdHocChargeRow[]>("/me/ad-hoc-charges");
            if (!cancelled) setAdHocCharges(Array.isArray(ahr.data) ? ahr.data : []);
          } catch {
            if (!cancelled) setAdHocCharges([]);
          }
        }
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message || "Could not load billing info.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  // Pull invoices live from Stripe — patient-facing safety valve for the
  // case where invoice.paid webhooks didn't reach our backend and the
  // local Invoice list is missing real charges. Idempotent on the
  // backend; safe to retry.
  const handleRefreshFromStripe = async () => {
    if (!membership?.id) return;
    setSyncingFromStripe(true);
    try {
      const res = await apiFetch<{
        invoicesSeen?: number;
        invoicesCreated?: number;
      }>(`/memberships/${membership.id}/sync-invoices`, { method: "POST" });
      if (res.error) {
        setToast({ message: res.error, type: "error" });
      } else {
        const seen = res.data?.invoicesSeen ?? 0;
        const created = res.data?.invoicesCreated ?? 0;
        setToast({
          message: seen === 0
            ? "No invoices on file with Stripe yet."
            : `Refreshed ${seen} invoice${seen === 1 ? "" : "s"} from Stripe (${created} new).`,
          type: "success",
        });
        if (created > 0) {
          refresh();
        }
      }
    } catch {
      setToast({ message: "Could not refresh from Stripe.", type: "error" });
    }
    setSyncingFromStripe(false);
  };

  // ─── Derived: visits this period ──────────────────────────────────────────
  const visitsLine = useMemo(() => {
    const visit = entitlements.find((e) => e.entitlementType === "visit");
    if (!visit) return null;
    if (visit.allowedQuantity == null || visit.allowedQuantity < 0) {
      return { used: visit.usedQuantity ?? 0, allowed: null, label: "Unlimited visits" };
    }
    return {
      used: visit.usedQuantity ?? 0,
      allowed: visit.allowedQuantity,
      label: `${visit.usedQuantity ?? 0} of ${visit.allowedQuantity} visits used`,
    };
  }, [entitlements]);

  const visitsPct = visitsLine && visitsLine.allowed !== null
    ? Math.min(100, Math.round((visitsLine.used / Math.max(1, visitsLine.allowed)) * 100))
    : null;

  const visitsBarColor = visitsPct === null ? C.teal500
    : visitsPct >= 100 ? C.red500
    : visitsPct >= 90 ? C.red500
    : visitsPct >= 75 ? C.amber500
    : C.teal500;

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    // Skeleton mirrors the eventual layout: trial banner placeholder
    // → plan card → entitlement meter → invoice rows. Better than a
    // spinner because the user sees the page taking shape rather than
    // staring at a blank screen, and there's no layout shift when the
    // real content lands.
    const Bar = ({ w, h }: { w: string; h: string }) => (
      <div className="rounded-md animate-pulse" style={{ width: w, height: h, backgroundColor: C.slate100 }} />
    );
    return (
      <div className="space-y-4">
        <div className="glass rounded-2xl p-5 space-y-3">
          <Bar w="40%" h="14px" />
          <Bar w="70%" h="20px" />
          <Bar w="50%" h="14px" />
        </div>
        <div className="glass rounded-2xl p-5 space-y-3">
          <Bar w="35%" h="12px" />
          <Bar w="100%" h="8px" />
          <Bar w="55%" h="12px" />
        </div>
        <div className="glass rounded-2xl p-5 space-y-3">
          <Bar w="30%" h="14px" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-9 h-9 rounded-lg animate-pulse" style={{ backgroundColor: C.slate100 }} />
                <div className="flex-1 space-y-1.5">
                  <Bar w="60%" h="12px" />
                  <Bar w="40%" h="10px" />
                </div>
              </div>
              <Bar w="56px" h="20px" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !membership) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: C.slate300 }} />
        <p className="text-sm" style={{ color: C.slate500 }}>
          {error || "You don't have an active membership yet."}
        </p>
      </div>
    );
  }

  const plan = (membership as PatientMembership).plan;
  const planName = plan?.name || "Membership";
  const billingFreq = (membership as unknown as Record<string, string>).billingFrequency
    || (membership as unknown as Record<string, string>).billing_frequency
    || (membership as PatientMembership).billingCycle
    || "monthly";
  const monthlyPrice = (plan as unknown as Record<string, string | number | null> | undefined)?.monthly_price
    ?? (plan as unknown as Record<string, string | number | null> | undefined)?.monthlyPrice;
  const annualPrice = (plan as unknown as Record<string, string | number | null> | undefined)?.annual_price
    ?? (plan as unknown as Record<string, string | number | null> | undefined)?.annualPrice;
  const displayPrice = billingFreq === "annual" ? annualPrice : monthlyPrice;

  const periodEnd = (membership as unknown as Record<string, string | null>).currentPeriodEnd
    || (membership as unknown as Record<string, string | null>).current_period_end;

  // Status string comparison via cast — backend uses British "cancelled" but
  // the local type uses American "canceled". Match both spellings safely
  // until the type catches up.
  const statusStr = String(membership.status ?? "");
  const isCancelled = statusStr === "cancelled" || statusStr === "canceled";

  return (
    <div className="space-y-6">
      {/* ── Plan card ─────────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold mb-4" style={{ color: C.navy800 }}>My Membership</h3>
        <div
          className="rounded-xl p-5 mb-4"
          style={{ background: `linear-gradient(135deg, ${C.navy800}, ${C.teal600})` }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-lg">{planName}</span>
                <Star className="w-4 h-4" style={{ color: C.gold }} />
              </div>
              <p className="text-white/70 text-xs mt-1">
                Billed {billingFreq}
              </p>
              {statusStr === "past_due" && (
                <span
                  className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded text-xs font-semibold"
                  style={{ backgroundColor: C.red50, color: C.red500 }}
                >
                  <AlertCircle className="w-3 h-3" /> Past due
                </span>
              )}
            </div>
            <span className="text-white text-2xl font-bold">
              {displayPrice != null ? formatCurrency(displayPrice as number) : "—"}
            </span>
          </div>
        </div>

        {/* Visits usage */}
        {visitsLine && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span style={{ color: C.slate500 }}>{visitsLine.label}</span>
              {visitsPct !== null && (
                <span className="font-semibold" style={{ color: visitsBarColor }}>{visitsPct}%</span>
              )}
            </div>
            <div className="w-full h-2 rounded-full" style={{ backgroundColor: C.slate200 }}>
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: visitsPct === null ? "30%" : `${visitsPct}%`,
                  backgroundColor: visitsBarColor,
                  opacity: visitsPct === null ? 0.4 : 1,
                }}
              />
            </div>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span style={{ color: C.slate500 }}>Current period ends</span>
            <span className="font-medium" style={{ color: C.navy800 }}>{formatDate(periodEnd)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2 mt-4 pt-3 border-t" style={{ borderColor: C.slate200 }}>
          <button
            onClick={() => setCardsOpen(true)}
            className="flex-1 py-2 rounded-lg text-sm font-medium border flex items-center justify-center gap-1.5 transition-colors hover:bg-slate-50"
            style={{ borderColor: C.slate300, color: C.slate600 }}
          >
            <CreditCard className="w-4 h-4" /> Manage Cards
          </button>
          <button
            onClick={async () => {
              setBillingPortalLoading(true);
              setBillingPortalError(null);
              const res = await apiFetch<{ url: string }>("/me/billing-portal", { method: "POST" });
              setBillingPortalLoading(false);
              if (res.error || !res.data?.url) {
                setBillingPortalError(res.error || "Could not open billing portal.");
                return;
              }
              window.location.href = res.data.url;
            }}
            disabled={billingPortalLoading || isCancelled}
            className="flex-1 py-2 rounded-lg text-sm font-medium border flex items-center justify-center gap-1.5 transition-colors hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: "#a5b4fc", color: "#4338ca" }}
          >
            {billingPortalLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</>
            ) : (
              <><Receipt className="w-4 h-4" /> Stripe Billing</>
            )}
          </button>
          <button
            onClick={() => setCancelOpen(true)}
            disabled={isCancelled}
            className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: C.red500, color: C.red500 }}
          >
            {isCancelled ? "Cancelled" : "Cancel Membership"}
          </button>
        </div>
        {billingPortalError && (
          <p className="text-xs mt-2" style={{ color: C.red500 }}>{billingPortalError}</p>
        )}
      </div>

      {/* ── Family on this membership ──────────────────────────────────────
          Same component as the standalone Family Members tab — drops
          its own card chrome to nest inside this section.  */}
      <FamilyMembersSection variant="card" />

      {/* ── Open ad-hoc charges ──────────────────────────────────────────── */}
      {/* Surfaces practice-issued one-time bills (forms, after-hours
          calls, etc.) so patients can pay in-app instead of digging
          through email. Only renders when there's at least one
          'sent' charge — paid history rolls up into the Invoice list
          below. */}
      {(() => {
        const open = adHocCharges.filter((c) => c.status === "sent");
        if (open.length === 0) return null;
        const totalDueCents = open.reduce((acc, c) => acc + (c.amountCents || 0), 0);
        return (
          <div
            className="rounded-2xl p-5 border"
            style={{ backgroundColor: C.amber50, borderColor: "#fde68a" }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" style={{ color: C.amber500 }} />
                <h3 className="text-sm font-semibold" style={{ color: "#92400e" }}>
                  Open balance
                </h3>
              </div>
              <span className="text-sm font-bold" style={{ color: "#92400e" }}>
                {formatCurrency(totalDueCents / 100)} due
              </span>
            </div>
            <ul className="space-y-2">
              {open.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 p-3 rounded-lg"
                  style={{ backgroundColor: C.white, border: `1px solid #fde68a` }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: C.amber50, color: C.amber500 }}
                  >
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: C.navy900 }}>
                      {c.description || "One-time charge"}
                    </p>
                    <p className="text-xs" style={{ color: C.slate500 }}>
                      Sent {c.sentAt ? formatDate(c.sentAt) : formatDate(c.createdAt)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold flex-shrink-0" style={{ color: C.navy800 }}>
                    {formatCurrency(c.amountCents / 100)}
                  </span>
                  <button
                    onClick={() => {
                      if (!c.checkoutUrl) {
                        setToast({ message: "Payment link unavailable. Please contact the practice.", type: "error" });
                        return;
                      }
                      window.open(c.checkoutUrl, "_blank", "noopener,noreferrer");
                    }}
                    disabled={!c.checkoutUrl}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: C.teal500 }}
                  >
                    Pay now
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* ── Invoice list ──────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: C.navy800 }}>
            Recent Invoices
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshFromStripe}
              disabled={syncingFromStripe}
              className="text-xs font-semibold disabled:opacity-50"
              style={{ color: C.teal500 }}
              title="Refresh invoices live from Stripe"
            >
              {syncingFromStripe ? "Refreshing…" : "Refresh"}
            </button>
            <Receipt className="w-4 h-4" style={{ color: C.slate400 }} />
          </div>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: C.slate400 }}>
            No invoices yet.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: C.slate100 }}>
            {invoices.slice(0, 12).map((inv) => {
              const total = (inv as unknown as Record<string, number | null>).total
                ?? (inv as unknown as Record<string, number | null>).amount
                ?? 0;
              const status = (inv as unknown as Record<string, string>).status || "draft";
              const statusColors: Record<string, { bg: string; text: string }> = {
                paid: { bg: C.green50, text: "#15803d" },
                open: { bg: C.amber50, text: "#92400e" },
                pending: { bg: C.amber50, text: "#92400e" },
                draft: { bg: C.slate100, text: C.slate600 },
                void: { bg: C.slate100, text: C.slate500 },
                uncollectible: { bg: C.red50, text: "#b91c1c" },
              };
              const sc = statusColors[status] || statusColors.draft;
              const date = (inv as unknown as Record<string, string>).paidAt
                || (inv as unknown as Record<string, string>).paid_at
                || (inv as unknown as Record<string, string>).dueDate
                || (inv as unknown as Record<string, string>).due_date
                || (inv as unknown as Record<string, string>).createdAt
                || (inv as unknown as Record<string, string>).created_at;
              const pdfUrl = (inv as unknown as Record<string, string | null>).pdfUrl
                || (inv as unknown as Record<string, string | null>).pdf_url;

              return (
                <div key={inv.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: sc.bg }}
                    >
                      <Receipt className="w-4 h-4" style={{ color: sc.text }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: C.navy800 }}>
                        {formatCurrency(total)}
                      </p>
                      <p className="text-xs" style={{ color: C.slate400 }}>{formatDate(date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold capitalize"
                      style={{ backgroundColor: sc.bg, color: sc.text }}
                    >
                      {status}
                    </span>
                    {pdfUrl && (
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-slate-100"
                        title="View invoice"
                      >
                        <ChevronRight className="w-4 h-4" style={{ color: C.slate400 }} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── My Agreements ─────────────────────────────────────────────────── */}
      <MyAgreementsSection />

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      {cardsOpen && (
        <PaymentMethodsDialog
          onClose={() => setCardsOpen(false)}
          onSuccess={(message) => {
            setToast({ message, type: "success" });
            refresh();
          }}
        />
      )}
      {cancelOpen && (
        <CancelMembershipDialog
          membershipId={membership.id}
          onClose={() => setCancelOpen(false)}
          onCancelled={(message) => {
            setToast({ message, type: "success" });
            setCancelOpen(false);
            refresh();
          }}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 shadow-lg flex items-center gap-2 text-sm font-medium text-white"
          style={{ backgroundColor: toast.type === "success" ? C.green500 : C.red500 }}
        >
          {toast.type === "success"
            ? <CheckCircle2 className="w-4 h-4" />
            : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─── PaymentMethodsDialog ──────────────────────────────────────────────────
//
// Lists the patient's saved cards. The "Add card" flow uses Stripe Elements
// loaded dynamically — we don't bundle @stripe/stripe-js because card capture
// is a rare action and lazy-loading keeps the patient portal bundle lean.

function PaymentMethodsDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [cards, setCards] = useState<Array<{
    id: string;
    brand: string | null;
    last4: string | null;
    exp_month: number | null;
    exp_year: number | null;
    is_default: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await paymentMethodService.list();
        // Defensive: handle bare array OR paginated envelope.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d: any = res.data;
        const list = Array.isArray(d) ? d
          : Array.isArray(d?.data) ? d.data
          : [];
        setCards(list);
      } catch (e) {
        setError((e as Error).message || "Could not load cards.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const startAddFlow = async () => {
    setError(null);
    setAdding(true);
    try {
      const res = await paymentMethodService.createSetupIntent();
      if (!res.data) throw new Error(res.error || "Could not start card setup.");
      setSetupClientSecret(res.data.client_secret);
      setStripePublishableKey(res.data.stripe_publishable_key);
      setStripeAccountId(res.data.stripe_account_id);
    } catch (e) {
      setError((e as Error).message || "Could not start card setup.");
      setAdding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200/60 overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5" style={{ color: C.teal600 }} />
            <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>
              Payment Methods
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" style={{ color: C.slate400 }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.teal500 }} />
            </div>
          ) : (
            <>
              {/* Existing cards */}
              {cards.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: C.slate400 }}>
                  No cards on file yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {cards.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      style={{ borderColor: c.is_default ? C.teal500 : C.slate200 }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: C.slate100 }}
                        >
                          <CreditCard className="w-4 h-4" style={{ color: C.slate600 }} />
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: C.navy800 }}>
                            <span className="capitalize">{c.brand || "Card"}</span> ···· {c.last4 || "····"}
                          </p>
                          <p className="text-xs" style={{ color: C.slate400 }}>
                            Expires {String(c.exp_month || "").padStart(2, "0")}/{c.exp_year || "—"}
                          </p>
                        </div>
                      </div>
                      {c.is_default && (
                        <span
                          className="px-2 py-0.5 rounded text-xs font-semibold"
                          style={{ backgroundColor: C.teal50, color: C.teal600 }}
                        >
                          Default
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add a card flow */}
              {!setupClientSecret ? (
                <button
                  onClick={startAddFlow}
                  disabled={adding}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: C.teal500 }}
                >
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add a new card
                </button>
              ) : (
                <StripeElementsForm
                  clientSecret={setupClientSecret}
                  publishableKey={stripePublishableKey || ""}
                  stripeAccountId={stripeAccountId || ""}
                  onComplete={async (paymentMethodId) => {
                    try {
                      const r = await paymentMethodService.attach(paymentMethodId);
                      if (r.error) throw new Error(r.error);
                      onSuccess("Card on file updated.");
                      onClose();
                    } catch (e) {
                      setError((e as Error).message || "Could not save the new card.");
                    }
                  }}
                  onError={(msg) => setError(msg)}
                  onCancel={() => {
                    setSetupClientSecret(null);
                    setAdding(false);
                  }}
                />
              )}

              {error && (
                <div
                  className="p-3 rounded-lg flex items-start gap-2 text-sm"
                  style={{ backgroundColor: C.red50, color: "#b91c1c" }}
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div
                className="p-3 rounded-lg flex items-start gap-2 text-xs"
                style={{ backgroundColor: C.slate100, color: C.slate600 }}
              >
                <Shield className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.teal600 }} />
                <span>
                  Your card details are processed and stored by Stripe. We never see or
                  store your full card number.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StripeElementsForm ────────────────────────────────────────────────────
//
// Lazy-loads @stripe/stripe-js (already in many bundlers as a CDN-loaded
// module) and mounts a Card Element. confirmCardSetup with the SetupIntent
// client_secret yields a payment_method id which we hand back to the parent.
//
// We use the global window.Stripe loaded via script tag rather than the npm
// SDK so the patient portal bundle stays small. Falls back gracefully if
// Stripe.js fails to load.

declare global {
  interface Window {
    Stripe?: (key: string, opts?: Record<string, unknown>) => unknown;
  }
}

function StripeElementsForm({
  clientSecret,
  publishableKey,
  stripeAccountId,
  onComplete,
  onError,
  onCancel,
}: {
  clientSecret: string;
  publishableKey: string;
  stripeAccountId: string;
  onComplete: (paymentMethodId: string) => void;
  onError: (message: string) => void;
  onCancel: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stripe, setStripe] = useState<unknown>(null);
  const [card, setCard] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    const ensureScript = (): Promise<void> => new Promise((resolve, reject) => {
      if (window.Stripe) return resolve();
      const tag = document.createElement("script");
      tag.src = "https://js.stripe.com/v3/";
      tag.async = true;
      tag.onload = () => resolve();
      tag.onerror = () => reject(new Error("Could not load Stripe.js"));
      document.head.appendChild(tag);
    });

    (async () => {
      try {
        await ensureScript();
        if (cancelled || !window.Stripe) return;
        // Cards are charged on the connected account, so initialize the
        // Stripe instance with stripeAccount = practice's account id.
        const s = window.Stripe(publishableKey, { stripeAccount: stripeAccountId });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const elements = (s as any).elements();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cardEl = (elements as any).create("card", {
          style: {
            base: {
              fontSize: "14px",
              color: C.navy900,
              "::placeholder": { color: C.slate400 },
              fontFamily: "inherit",
            },
          },
        });
        cardEl.mount("#stripe-card-element");
        setStripe(s);
        setCard(cardEl);
        setReady(true);
      } catch (e) {
        onError((e as Error).message || "Could not load Stripe.");
      }
    })();

    return () => { cancelled = true; };
  }, [publishableKey, stripeAccountId, onError]);

  const handleSubmit = async () => {
    if (!stripe || !card) return;
    setSubmitting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (stripe as any).confirmCardSetup(clientSecret, {
        payment_method: { card },
      });
      if (result.error) {
        onError(result.error.message || "Card declined.");
        setSubmitting(false);
        return;
      }
      const pmId = result.setupIntent?.payment_method;
      if (!pmId) {
        onError("Card was confirmed but no payment method was returned.");
        setSubmitting(false);
        return;
      }
      onComplete(pmId as string);
    } catch (e) {
      onError((e as Error).message || "Could not save the new card.");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        id="stripe-card-element"
        className="p-3 rounded-lg border bg-white"
        style={{ borderColor: C.slate200, minHeight: "40px" }}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-slate-50"
          style={{ borderColor: C.slate300, color: C.slate600 }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!ready || submitting}
          className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: C.teal500 }}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save card"}
        </button>
      </div>
    </div>
  );
}

// ─── CancelMembershipDialog ────────────────────────────────────────────────

function CancelMembershipDialog({
  membershipId,
  onClose,
  onCancelled,
}: {
  membershipId: string;
  onClose: () => void;
  onCancelled: (message: string) => void;
}) {
  // Reason is now a free-form string (the label of whatever the
  // practice has configured under Practice Settings → Clinical →
  // Cancellation Reasons). selfCancel takes `reason: string` so any
  // label flows through fine. If the practice hasn't configured the
  // list yet we fall back to a sensible default below.
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Practice-curated reasons. null = still loading. Empty array =
  // practice hasn't configured any → render fallback list.
  const [practiceReasons, setPracticeReasons] = useState<Array<{ id: string; label: string }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await clinicalSettingsService.list("cancellation_reasons");
      if (cancelled) return;
      if (res.error || !res.data) {
        setPracticeReasons([]);
        return;
      }
      const list = res.data
        .filter((r) => r.isActive !== false)
        .map((r) => ({ id: r.label, label: r.label }));
      setPracticeReasons(list);
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    if (!reason) {
      setError("Please pick a reason.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await membershipService.selfCancel(membershipId, {
        reason,
        reason_notes: notes || undefined,
      });
      if (res.error) throw new Error(res.error);
      onCancelled(
        "Your membership will end at the close of your current billing period. You can reactivate any time before then."
      );
    } catch (e) {
      setError((e as Error).message || "Could not cancel membership.");
      setSubmitting(false);
    }
  };

  // Fallback list shown when the practice hasn't configured their own
  // reasons yet. Same five we shipped pre-config so existing patients
  // see no behavior change until the practice opts into customization.
  const FALLBACK_REASONS = [
    { id: "Too expensive", label: "Too expensive" },
    { id: "I'm moving", label: "I'm moving" },
    { id: "Not satisfied with care", label: "Not satisfied with care" },
    { id: "Switching to another provider", label: "Switching to another provider" },
    { id: "Other", label: "Other" },
  ];
  const reasons: Array<{ id: string; label: string }> =
    practiceReasons && practiceReasons.length > 0 ? practiceReasons : FALLBACK_REASONS;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200/60 overflow-hidden flex flex-col"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5" style={{ color: C.red500 }} />
            <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>
              Cancel Membership
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" style={{ color: C.slate400 }} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div
            className="p-3 rounded-lg flex items-start gap-2 text-sm"
            style={{ backgroundColor: C.amber50, color: "#92400e" }}
          >
            <Calendar className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              You'll keep access until the end of your current billing period.
              You won't be charged again, and you can reactivate any time before then.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: C.navy800 }}>
              Why are you cancelling?
            </label>
            <div className="space-y-2">
              {reasons.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setReason(r.id)}
                  className="w-full text-left p-3 rounded-lg border transition-colors"
                  style={{
                    borderColor: reason === r.id ? C.red500 : C.slate200,
                    backgroundColor: reason === r.id ? C.red50 : C.white,
                  }}
                >
                  <span className="text-sm" style={{ color: C.navy800 }}>{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: C.navy800 }}>
              Anything you'd like us to know? (optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Your feedback helps us improve."
              className="w-full p-3 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2"
              style={{ borderColor: C.slate200, color: C.navy900 }}
            />
          </div>

          {error && (
            <div
              className="p-3 rounded-lg flex items-start gap-2 text-sm"
              style={{ backgroundColor: C.red50, color: "#b91c1c" }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-white"
            style={{ borderColor: C.slate300, color: C.slate600 }}
          >
            Keep my membership
          </button>
          <button
            onClick={submit}
            disabled={submitting || !reason}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: C.red500 }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Cancel membership"}
          </button>
        </div>
      </div>
    </div>
  );
}
