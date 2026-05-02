// ===== Patient Lab Results Tab =====
// Read-only patient view of /lab-orders, scoped server-side to the
// caller's own labs. Each LabOrder carries an array of nested
// LabResult rows (test_name, value, unit, reference_range_low/high,
// flag, notes). Cards expand to show all results; status pill on each
// row mirrors the backend's `flag` column (high/low/normal).

import { useEffect, useState } from "react";
import { FlaskConical, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { labService } from "../../../lib/api";

interface LabResultRow {
  id: string;
  testName: string;
  value: string | number | null;
  unit: string | null;
  referenceRangeText: string | null;
  referenceRangeLow: string | number | null;
  referenceRangeHigh: string | number | null;
  flag: string | null; // "normal" | "high" | "low" | "critical_high" | "critical_low" | null
  notes: string | null;
  resultedAt: string | null;
}

interface LabOrderRow {
  id: string;
  orderNumber: string | null;
  status: string;
  orderedAt: string | null;
  resultedAt: string | null;
  labPartner: string | null;
  panels: string[] | null;
  results: LabResultRow[];
}

const NAVY800 = "#243b53";
const SLATE200 = "#e2e8f0";
const SLATE300 = "#cbd5e1";
const SLATE400 = "#94a3b8";
const SLATE500 = "#64748b";
const SLATE600 = "#475569";
const SLATE700 = "#334155";
const TEAL500 = "#27ab83";
const TEAL600 = "#147d64";
const RED500 = "#ef4444";
const RED600 = "#dc2626";
const AMBER600 = "#d97706";
const GREEN700 = "#15803d";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Map the backend's flag string to a visual treatment. The UI spans
 *  three buckets — green normal, amber high/low, red critical_*. Any
 *  unknown flag falls back to a neutral pill so we don't render a
 *  blank space when the lab partner ships an enum we haven't seen. */
function flagToBadge(flag: string | null): { label: string; bg: string; color: string } {
  const f = (flag ?? "").toLowerCase();
  if (f === "normal" || f === "" || f === null) return { label: "Normal", bg: "#dcfce7", color: GREEN700 };
  if (f === "high" || f === "h") return { label: "High", bg: "#fef3c7", color: AMBER600 };
  if (f === "low" || f === "l") return { label: "Low", bg: "#fef3c7", color: AMBER600 };
  if (f.includes("critical")) return { label: "Critical", bg: "#fee2e2", color: RED600 };
  return { label: f, bg: "#e2e8f0", color: SLATE600 };
}

export function LabResultsTab() {
  const [orders, setOrders] = useState<LabOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await labService.list();
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setOrders([]);
        return;
      }
      // Paginated envelope: { data: { data: [...] } } → apiFetch
      // unwrapped the outer; .data here is the inner pagination obj.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = res.data as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const mapped: LabOrderRow[] = list.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber ?? o.order_number ?? null,
        status: o.status ?? "",
        orderedAt: o.orderedAt ?? o.ordered_at ?? null,
        resultedAt: o.resultedAt ?? o.resulted_at ?? null,
        labPartner: o.labPartner ?? o.lab_partner ?? null,
        panels: Array.isArray(o.panels) ? o.panels : (o.panels ? [o.panels] : null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results: ((o.results ?? []) as any[]).map((r) => ({
          id: r.id,
          testName: r.testName ?? r.test_name ?? "",
          value: r.value ?? null,
          unit: r.unit ?? null,
          referenceRangeText: r.referenceRangeText ?? r.reference_range_text ?? null,
          referenceRangeLow: r.referenceRangeLow ?? r.reference_range_low ?? null,
          referenceRangeHigh: r.referenceRangeHigh ?? r.reference_range_high ?? null,
          flag: r.flag ?? null,
          notes: r.notes ?? null,
          resultedAt: r.resultedAt ?? r.resulted_at ?? null,
        })),
      }));
      // Most recent first.
      mapped.sort((a, b) => {
        const ta = a.resultedAt ? new Date(a.resultedAt).getTime() : 0;
        const tb = b.resultedAt ? new Date(b.resultedAt).getTime() : 0;
        return tb - ta;
      });
      setOrders(mapped);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Summary counters for the three-card row at the top.
  const totalTests = orders?.reduce((sum, o) => sum + o.results.length, 0) ?? 0;
  const normalCount = orders?.reduce((sum, o) => sum + o.results.filter((r) => (r.flag ?? "normal").toLowerCase() === "normal").length, 0) ?? 0;
  const flaggedCount = totalTests - normalCount;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: NAVY800 }}>
          Lab Results
        </h1>
        <p className="text-sm mt-0.5" style={{ color: SLATE500 }}>
          View and track your laboratory test results
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: SLATE200 }}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium" style={{ color: SLATE500 }}>Total tests</p>
            <FlaskConical className="w-4 h-4" style={{ color: TEAL500 }} />
          </div>
          <p className="text-2xl font-semibold" style={{ color: NAVY800 }}>{orders === null ? "—" : totalTests}</p>
          <p className="text-xs mt-0.5" style={{ color: SLATE400 }}>All time</p>
        </div>
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: SLATE200 }}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium" style={{ color: SLATE500 }}>Normal results</p>
          </div>
          <p className="text-2xl font-semibold" style={{ color: GREEN700 }}>{orders === null ? "—" : normalCount}</p>
          <p className="text-xs mt-0.5" style={{ color: SLATE400 }}>
            {totalTests > 0 ? `${Math.round((normalCount / totalTests) * 100)}% of all tests` : "No tests yet"}
          </p>
        </div>
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: SLATE200 }}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium" style={{ color: SLATE500 }}>Needs attention</p>
            {flaggedCount > 0 && <AlertTriangle className="w-4 h-4" style={{ color: AMBER600 }} />}
          </div>
          <p className="text-2xl font-semibold" style={{ color: flaggedCount > 0 ? AMBER600 : SLATE400 }}>
            {orders === null ? "—" : flaggedCount}
          </p>
          <p className="text-xs mt-0.5" style={{ color: SLATE400 }}>
            {flaggedCount > 0 ? "Discuss with your provider" : "Nothing flagged"}
          </p>
        </div>
      </div>

      {/* Loading / error / empty states */}
      {orders === null && !error && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="text-sm" style={{ color: SLATE500 }}>Loading lab results…</p>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border p-4" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
          <p className="text-sm font-medium" style={{ color: RED600 }}>Couldn't load lab results</p>
          <p className="text-xs mt-1" style={{ color: RED500 }}>{error}</p>
        </div>
      )}
      {orders && orders.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <FlaskConical className="w-8 h-8 mx-auto mb-2" style={{ color: SLATE300 }} />
          <p className="text-sm font-medium" style={{ color: NAVY800 }}>No lab results yet</p>
          <p className="text-xs mt-1" style={{ color: SLATE500 }}>
            Once your provider orders labs, results appear here as they come in.
          </p>
        </div>
      )}

      {/* Order cards. Each is a panel summary that expands to show
          individual results with reference ranges. */}
      <div className="space-y-3">
        {orders?.map((o) => {
          const isOpen = expanded.has(o.id);
          const orderTitle = (o.panels && o.panels.length > 0)
            ? o.panels.join(" + ")
            : (o.orderNumber ? `Order ${o.orderNumber}` : "Lab order");
          const flaggedInOrder = o.results.filter((r) => {
            const f = (r.flag ?? "normal").toLowerCase();
            return f !== "normal" && f !== "";
          }).length;
          const orderStatus = flaggedInOrder > 0
            ? { label: "Needs attention", bg: "#fef3c7", color: AMBER600 }
            : { label: "Normal", bg: "#dcfce7", color: GREEN700 };
          return (
            <div key={o.id} className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: SLATE200 }}>
              <button
                onClick={() => toggle(o.id)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "#e6fffa" }}
                  >
                    <FlaskConical className="w-5 h-5" style={{ color: TEAL600 }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: NAVY800 }}>
                      {orderTitle}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: SLATE500 }}>
                      {formatDate(o.resultedAt ?? o.orderedAt)}
                      {o.labPartner ? ` · ${o.labPartner}` : ""}
                      {o.results.length > 0 ? ` · ${o.results.length} result${o.results.length === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-xs font-semibold px-2 py-1 rounded-full"
                    style={{ backgroundColor: orderStatus.bg, color: orderStatus.color }}
                  >
                    {orderStatus.label}
                  </span>
                  {isOpen
                    ? <ChevronUp className="w-4 h-4" style={{ color: SLATE400 }} />
                    : <ChevronDown className="w-4 h-4" style={{ color: SLATE400 }} />}
                </div>
              </button>

              {isOpen && (
                <div className="border-t px-4 py-3" style={{ borderColor: SLATE200 }}>
                  {o.results.length === 0 && (
                    <p className="text-xs italic" style={{ color: SLATE400 }}>
                      Order placed; results not yet returned.
                    </p>
                  )}
                  {o.results.length > 0 && (
                    <div className="space-y-2">
                      {o.results.map((r) => {
                        const badge = flagToBadge(r.flag);
                        const refText = r.referenceRangeText
                          ?? (r.referenceRangeLow !== null && r.referenceRangeHigh !== null
                            ? `${r.referenceRangeLow}–${r.referenceRangeHigh}${r.unit ? ` ${r.unit}` : ""}`
                            : null);
                        return (
                          <div
                            key={r.id}
                            className="flex items-start justify-between gap-3 p-3 rounded-lg"
                            style={{ backgroundColor: "#f8fafc" }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium" style={{ color: SLATE700 }}>
                                {r.testName}
                              </p>
                              {refText && (
                                <p className="text-xs mt-0.5" style={{ color: SLATE500 }}>
                                  Reference: {refText}
                                </p>
                              )}
                              {r.notes && (
                                <p className="text-xs mt-1 italic" style={{ color: SLATE600 }}>
                                  Note: {r.notes}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold" style={{ color: NAVY800 }}>
                                {r.value ?? "—"}
                                {r.unit ? <span className="text-xs ml-1" style={{ color: SLATE500 }}>{r.unit}</span> : null}
                              </p>
                              <span
                                className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: badge.bg, color: badge.color }}
                              >
                                {badge.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs italic" style={{ color: SLATE400 }}>
        Reference ranges are guidance — your provider interprets your results in the context of your full medical history. Reach out via Messages with questions.
      </p>
    </div>
  );
}

