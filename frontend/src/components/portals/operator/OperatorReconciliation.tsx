// ===== OperatorReconciliation =====
//
// Cross-network billing rollup for operator finance teams. Replaces
// the "spreadsheet I hand-build every month" workflow that operators
// described in discovery.
//
// What it shows:
//   - Network-wide totals: processed, refunded, net, outstanding
//   - Per-tenant breakdown sorted by net revenue descending
//   - Period selector (MTD / QTD / YTD / last 30d)
//
// Backend: GET /api/operator/analytics/reconciliation?period=...
// Operator-scope is enforced server-side via OperatorContext.

import { useEffect, useState } from "react";
import { Loader2, FileText, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { apiFetch } from "../../../lib/api";

interface TenantRow {
  tenantId: string;
  tenantName: string | null;
  processedCents: number;
  refundedCents: number;
  netCents: number;
  outstandingCents: number;
  paymentCount: number;
}

interface ReconciliationData {
  period: string;
  periodStart: string;
  periodEnd: string;
  totals: {
    processedCents: number;
    refundedCents: number;
    netCents: number;
    outstandingCents: number;
    paymentCount: number;
  };
  byTenant: TenantRow[];
}

const PERIODS = [
  { id: "mtd", label: "Month to date" },
  { id: "qtd", label: "Quarter to date" },
  { id: "ytd", label: "Year to date" },
  { id: "last_30d", label: "Last 30 days" },
];

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal700: "#0e6651",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  red500: "#ef4444",
  red50: "#fef2f2",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  slate700: "#334155",
  white: "#ffffff",
};

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(dollars);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

export function OperatorReconciliation() {
  const [period, setPeriod] = useState("mtd");
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await apiFetch<ReconciliationData>(
          `/operator/analytics/reconciliation?period=${period}`,
        );
        if (cancelled) return;
        if (res.error) {
          setError(res.error);
        } else {
          setData(res.data ?? null);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load reconciliation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="space-y-5">
      {/* Header + period chips */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold" style={{ color: C.navy900 }}>
            Billing reconciliation
          </h2>
          <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
            Network-wide payment totals across every clinic in this operator.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 p-1 rounded-lg border" style={{ borderColor: C.slate200 }}>
          {PERIODS.map((p) => {
            const active = p.id === period;
            return (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  backgroundColor: active ? C.navy800 : "transparent",
                  color: active ? C.white : C.slate600,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.slate400 }} />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm" style={{ color: "#7f1d1d" }}>
          {error}
        </div>
      )}

      {data && !loading && !error && (
        <>
          {/* Totals cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <TotalCard
              label="Processed"
              value={formatMoney(data.totals.processedCents)}
              hint={`${data.totals.paymentCount} payment${data.totals.paymentCount === 1 ? "" : "s"}`}
            />
            <TotalCard
              label="Refunded"
              value={formatMoney(data.totals.refundedCents)}
              tone={data.totals.refundedCents > 0 ? "muted" : "default"}
            />
            <TotalCard
              label="Net"
              value={formatMoney(data.totals.netCents)}
              tone="success"
              hint={`${formatDate(data.periodStart)} – ${formatDate(data.periodEnd)}`}
            />
            <TotalCard
              label="Outstanding"
              value={formatMoney(data.totals.outstandingCents)}
              tone={data.totals.outstandingCents > 0 ? "warn" : "default"}
            />
          </div>

          {/* Per-tenant breakdown */}
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: C.slate200 }}>
              <h3 className="text-sm font-semibold" style={{ color: C.navy900 }}>
                By clinic
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: C.slate100 }}>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.slate500 }}>
                      Clinic
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.slate500 }}>
                      Processed
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.slate500 }}>
                      Refunded
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.slate500 }}>
                      Net
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.slate500 }}>
                      Outstanding
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.slate500 }}>
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: C.slate100 }}>
                  {data.byTenant.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm" style={{ color: C.slate400 }}>
                        No clinics in scope.
                      </td>
                    </tr>
                  )}
                  {data.byTenant.map((row) => {
                    const inactive = row.paymentCount === 0;
                    return (
                      <tr key={row.tenantId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm" style={{ color: inactive ? C.slate400 : C.navy900 }}>
                          {row.tenantName ?? row.tenantId.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: inactive ? C.slate400 : C.slate700 }}>
                          {formatMoney(row.processedCents)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: row.refundedCents > 0 ? C.red500 : C.slate400 }}>
                          {formatMoney(row.refundedCents)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums" style={{ color: inactive ? C.slate400 : C.teal700 }}>
                          {formatMoney(row.netCents)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: row.outstandingCents > 0 ? C.amber500 : C.slate400 }}>
                          {formatMoney(row.outstandingCents)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: C.slate500 }}>
                          {row.paymentCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs" style={{ color: C.slate400 }}>
            Net = Processed − Refunded. Outstanding = pending payments not yet captured. Refer to the per-clinic Stripe Connect dashboard for transaction-level detail.
          </p>
        </>
      )}
    </div>
  );
}

interface TotalCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warn" | "muted";
}

function TotalCard({ label, value, hint, tone = "default" }: TotalCardProps) {
  const valueColor = tone === "success" ? C.teal700
    : tone === "warn" ? C.amber500
    : tone === "muted" ? C.slate400
    : C.navy900;

  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
      <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: C.slate500 }}>
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: valueColor }}>
        {value}
      </p>
      {hint && <p className="text-[11px] mt-1" style={{ color: C.slate400 }}>{hint}</p>}
    </div>
  );
}

// Suppress unused-icon warning for icons reserved for future arrows
void ArrowDown;
void ArrowUp;
void Minus;
void FileText;
