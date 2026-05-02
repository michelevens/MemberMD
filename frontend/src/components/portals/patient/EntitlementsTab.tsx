// ===== Patient Entitlements Tab =====
// Patient-facing view of:
//   1. Active membership / plan (the contract they're on)
//   2. Entitlement balances + utilization (visits, telehealth, lab credits…)
//   3. Signed agreements (consent signatures with version + signed-at)
//
// Pulls from existing endpoints:
//   GET /patients/{id}                       → active membership info
//   GET /memberships/{id}/entitlements       → balances
//   GET /entitlement-usage/patient/{mid}     → utilization aggregates
//   GET /consent-signatures?patient_id={id}  → signed agreements

import { useEffect, useState } from "react";
import { Award, FileText, Activity, Download, AlertCircle } from "lucide-react";
import { apiFetch } from "../../../lib/api";

interface Props {
  patientId: string;
}

interface ActiveMembership {
  id: string;
  status: string;
  startedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  billingFrequency: string | null;
  billingMode: string | null;
  plan: {
    id: string;
    name: string;
    monthlyPrice: number | string | null;
    annualPrice: number | string | null;
    description: string | null;
    visitsPerMonth: number | null;
    telehealthIncluded: boolean | null;
    messagingIncluded: boolean | null;
    refundWindowDays: number | null;
  } | null;
}

interface EntitlementRow {
  id: string;
  visitsAllowed: number | null;
  visitsUsed: number | null;
  telehealthSessionsUsed: number | null;
  messagesSent: number | null;
  rolloverVisits: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

interface UtilizationItem {
  entitlementType?: { name?: string; category?: string; code?: string };
  entitlementTypeName?: string;
  category?: string;
  used?: number;
  usedQuantity?: number;
  allowed?: number;
  allowedQuantity?: number;
  total?: number;
  unlimited?: boolean;
}

interface ConsentSignature {
  id: string;
  signedAt: string | null;
  signatureType: string | null;
  templateVersion: number | null;
  template?: { id: string; name: string; type: string; description?: string | null } | null;
}

function formatPrice(p: number | string | null | undefined): string {
  if (p === null || p === undefined) return "—";
  const n = typeof p === "string" ? parseFloat(p) : p;
  if (Number.isNaN(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length > 10 ? value : value + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function EntitlementsTab({ patientId }: Props) {
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<ActiveMembership | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementRow[]>([]);
  const [utilization, setUtilization] = useState<UtilizationItem[]>([]);
  const [agreements, setAgreements] = useState<ConsentSignature[]>([]);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      // 1. Patient → active membership
      const patientRes = await apiFetch<{ activeMembership?: ActiveMembership } & Record<string, unknown>>(`/patients/${patientId}`);
      if (cancelled) return;

      const am = (patientRes.data as { activeMembership?: ActiveMembership } | undefined)?.activeMembership ?? null;
      setMembership(am);

      // 2. Entitlement balances + utilization (only if there's a membership)
      if (am?.id) {
        const [entRes, utilRes] = await Promise.all([
          apiFetch<EntitlementRow[]>(`/memberships/${am.id}/entitlements`),
          apiFetch<UtilizationItem[]>(`/entitlement-usage/patient/${am.id}`),
        ]);
        if (!cancelled) {
          setEntitlements(Array.isArray(entRes.data) ? entRes.data : []);
          setUtilization(Array.isArray(utilRes.data) ? utilRes.data : []);
        }
      } else {
        setEntitlements([]);
        setUtilization([]);
      }

      // 3. Signed agreements (consent signatures filtered to this patient)
      try {
        const sigRes = await apiFetch<ConsentSignature[]>(`/consent-signatures?patient_id=${patientId}`);
        if (!cancelled) {
          setAgreements(Array.isArray(sigRes.data) ? sigRes.data : []);
        }
      } catch {
        if (!cancelled) setAgreements([]);
      }

      if (!cancelled) setLoading(false);
    })().catch((e) => {
      if (!cancelled) {
        setError(e instanceof Error ? e.message : "Could not load entitlements.");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "#e2e8f0", borderTopColor: "#635bff" }} />
        <span className="ml-2 text-sm text-slate-500">Loading entitlements…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="w-4 h-4 inline mr-2" />
        {error}
      </div>
    );
  }

  const refundWindow = (() => {
    if (!membership || !membership.startedAt || membership.status !== "active") {
      return { eligible: false, daysLeft: 0, deadline: null as Date | null, windowDays: 0 };
    }
    const days = membership.plan?.refundWindowDays ?? 14;
    const started = new Date(membership.startedAt);
    if (isNaN(started.getTime())) return { eligible: false, daysLeft: 0, deadline: null, windowDays: days };
    const deadline = new Date(started.getTime() + days * 86400000);
    const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000));
    return { eligible: deadline.getTime() > Date.now(), daysLeft, deadline, windowDays: days };
  })();

  const handleCancelAndRefund = async () => {
    if (!membership) return;
    setCancelLoading(true);
    setCancelError(null);
    const res = await apiFetch<{ refundedAmount?: number; message?: string }>(
      `/memberships/${membership.id}/cancel-and-refund`,
      { method: "POST", body: JSON.stringify({}) },
    );
    setCancelLoading(false);
    if (res.error) {
      setCancelError(res.error);
      return;
    }
    const amt = (res.data as { refundedAmount?: number } | undefined)?.refundedAmount ?? 0;
    setCancelSuccess(
      amt > 0
        ? `Membership cancelled. $${amt.toFixed(2)} has been refunded.`
        : "Membership cancelled.",
    );
    setCancelDialog(false);
    setMembership(null);
    setEntitlements([]);
    setUtilization([]);
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Entitlements</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Your plan, what's included, what you've used, and what you've signed.
        </p>
      </div>

      {/* Active plan / contract card */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Active plan
        </h3>
        {membership && membership.plan ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-lg font-semibold text-slate-900">{membership.plan.name}</h4>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider"
                    style={{
                      backgroundColor: membership.status === "active" ? "#dcfce7" : "#fef3c7",
                      color: membership.status === "active" ? "#166534" : "#92400e",
                    }}
                  >
                    {membership.status}
                  </span>
                </div>
                {membership.plan.description && (
                  <p className="text-sm text-slate-600 mt-1">{membership.plan.description}</p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">Monthly</p>
                    <p className="font-semibold text-slate-900 tabular-nums">{formatPrice(membership.plan.monthlyPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">Annual</p>
                    <p className="font-semibold text-slate-900 tabular-nums">{formatPrice(membership.plan.annualPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">Period</p>
                    <p className="text-slate-700 text-xs tabular-nums">
                      {formatDate(membership.currentPeriodStart)} → {formatDate(membership.currentPeriodEnd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">Billing</p>
                    <p className="text-slate-700 capitalize">{membership.billingFrequency ?? "—"}</p>
                  </div>
                </div>
              </div>
              <Award className="w-6 h-6 shrink-0 text-[#635bff]" />
            </div>
            {refundWindow.eligible && membership.billingMode === "stripe" && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-slate-500">
                    Not satisfied? Cancel within {refundWindow.windowDays} days for a full refund.{" "}
                    <span className="font-medium text-slate-700">
                      {refundWindow.daysLeft} day{refundWindow.daysLeft === 1 ? "" : "s"} left
                    </span>
                    .
                  </p>
                  <button
                    onClick={() => { setCancelDialog(true); setCancelError(null); }}
                    className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors text-slate-700"
                  >
                    Cancel & refund
                  </button>
                </div>
              </div>
            )}
            {cancelSuccess && (
              <div className="mt-4 pt-4 border-t border-slate-100 text-sm text-emerald-700">
                {cancelSuccess}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <Award className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-700">No active membership</p>
            <p className="text-xs text-slate-500 mt-1">
              When you enroll in a plan, your benefits and balances will appear here.
            </p>
          </div>
        )}
      </section>

      {/* Entitlement balances + utilization */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Benefits & utilization
        </h3>
        {utilization.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {utilization.map((item, idx) => {
              const name = item.entitlementType?.name
                || item.entitlementTypeName
                || (item.entitlementType?.code ? item.entitlementType.code.replace(/_/g, " ") : "Benefit");
              const category = item.entitlementType?.category || item.category || "";
              const used = Number(item.used ?? item.usedQuantity ?? 0);
              const rawAllowed = item.allowed ?? item.allowedQuantity ?? item.total;
              const isUnlimited = item.unlimited || rawAllowed === -1 || rawAllowed === null || rawAllowed === undefined;
              const allowed = isUnlimited ? null : Number(rawAllowed);
              const pct = isUnlimited ? null : Math.min(100, Math.max(0, allowed && allowed > 0 ? (used / allowed) * 100 : 0));
              const barColor = pct === null ? "#3b82f6" : pct >= 90 ? "#dc2626" : pct >= 70 ? "#d97706" : "#22c55e";
              return (
                <div key={`${name}-${idx}`} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-slate-800 truncate">{name}</span>
                      {category && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-slate-100 text-slate-500 shrink-0">
                          {category.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-600 tabular-nums shrink-0">
                      {used}{" / "}{isUnlimited ? "∞" : allowed} used
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: pct === null ? "30%" : `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : entitlements.length > 0 ? (
          // Fallback: legacy PatientEntitlement counters when the new
          // EntitlementUsage ledger has no rows yet.
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            {entitlements.map((ent) => {
              const used = Number(ent.visitsUsed ?? 0);
              const allowed = Number(ent.visitsAllowed ?? 0);
              const isUnlimited = allowed === -1;
              const pct = isUnlimited ? null : Math.min(100, Math.max(0, allowed > 0 ? (used / allowed) * 100 : 0));
              const barColor = pct === null ? "#3b82f6" : pct >= 90 ? "#dc2626" : pct >= 70 ? "#d97706" : "#22c55e";
              return (
                <div key={ent.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-800">Office visits</span>
                    <span className="text-xs text-slate-600 tabular-nums">
                      {used}{" / "}{isUnlimited ? "∞" : allowed}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: pct === null ? "30%" : `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                    Period: {formatDate(ent.periodStart)} → {formatDate(ent.periodEnd)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-700">No utilization recorded yet</p>
            <p className="text-xs text-slate-500 mt-1">
              {membership ? "Your benefits will fill in as you use them." : "Enroll in a plan to see your benefits here."}
            </p>
          </div>
        )}
      </section>

      {/* Signed agreements */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Signed agreements
        </h3>
        {agreements.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {agreements.map((sig) => (
              <div key={sig.id} className="px-5 py-3.5 flex items-center gap-3">
                <FileText className="w-5 h-5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {sig.template?.name ?? sig.template?.type ?? "Agreement"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Signed {formatDate(sig.signedAt)}
                    {sig.templateVersion !== null && sig.templateVersion !== undefined && (
                      <span className="opacity-60"> · v{sig.templateVersion}</span>
                    )}
                    {sig.signatureType && (
                      <span className="opacity-60"> · {sig.signatureType}</span>
                    )}
                  </p>
                </div>
                <a
                  href={`/api/consent-signatures/${sig.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
                  title="Download signed PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-700">No agreements signed yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Consents you sign during enrollment or visits will appear here.
            </p>
          </div>
        )}
      </section>

      {cancelDialog && membership && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(15,23,42,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">Cancel & refund</h3>
              <p className="text-sm text-slate-500 mt-0.5">Cancels {membership.plan?.name} immediately and refunds your last payment.</p>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm text-slate-700">
              <p>
                You're within the {refundWindow.windowDays}-day satisfaction window
                ({refundWindow.daysLeft} day{refundWindow.daysLeft === 1 ? "" : "s"} left).
                Confirming will:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li>End your membership today (no further charges)</li>
                <li>Refund your most recent payment in full</li>
                <li>Remove your access to plan benefits immediately</li>
              </ul>
              {cancelError && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {cancelError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => { setCancelDialog(false); setCancelError(null); }}
                disabled={cancelLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Keep membership
              </button>
              <button
                onClick={handleCancelAndRefund}
                disabled={cancelLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#dc2626" }}
              >
                {cancelLoading ? "Processing…" : "Confirm cancel & refund"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
