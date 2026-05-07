// ===== PracticeROISection =====
//
// Self-fetched dashboard card for the practice's cash-value-delivered
// rollup. Backed by /entitlement-usage/practice — already implemented in
// EntitlementUsageController::practiceUtilization, just never wired to
// any UI before this.
//
// Hidden when there's no usage data yet (brand-new practice) so we don't
// surface a "$0 delivered" tile that looks broken.

import { useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { apiFetch } from "../../lib/api";

interface CategoryRow {
  category: string;
  total_used: number;
  total_savings: number;
  members_using: number;
}

interface TopEntitlement {
  id: string;
  name: string;
  category: string;
  total_used: number;
  total_savings: number;
}

interface PracticeUtilization {
  period_start: string;
  total_active_members: number;
  total_usage_events: number;
  total_savings: number;
  usage_by_category: CategoryRow[];
  top_entitlements: TopEntitlement[];
}

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal50: "#f0fdf9",
  green700: "#15803d",
  green50: "#f0fdf4",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  white: "#ffffff",
};

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

export function PracticeROISection() {
  const [data, setData] = useState<PracticeUtilization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<PracticeUtilization>("/entitlement-usage/practice");
        if (!cancelled) setData(res.data ?? null);
      } catch {
        // Silent — section just hides if the endpoint hiccups.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-8 flex items-center justify-center" style={{ borderColor: C.slate200 }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  if (!data || data.total_savings === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border p-5 space-y-4 bg-white" style={{ borderColor: C.slate200 }}>
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4" style={{ color: C.teal600 }} />
        <h3 className="text-sm font-semibold" style={{ color: C.navy900 }}>
          Value delivered to members this month
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg p-3 border" style={{ borderColor: "#bbf7d0", backgroundColor: C.green50 }}>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.green700 }}>
            This month · cash value
          </div>
          <div className="text-2xl font-bold mt-1" style={{ color: C.green700 }}>
            {fmtMoney(data.total_savings)}
          </div>
          <div className="text-[11px] mt-1" style={{ color: C.slate500 }}>
            in cash-equivalent care
          </div>
        </div>
        <div className="rounded-lg p-3 border" style={{ borderColor: C.slate200 }}>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.slate500 }}>
            Usage events
          </div>
          <div className="text-2xl font-bold mt-1" style={{ color: C.navy900 }}>
            {data.total_usage_events}
          </div>
          <div className="text-[11px] mt-1" style={{ color: C.slate500 }}>
            visits + services + activities
          </div>
        </div>
        <div className="rounded-lg p-3 border" style={{ borderColor: C.slate200 }}>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.slate500 }}>
            Active members
          </div>
          <div className="text-2xl font-bold mt-1" style={{ color: C.navy900 }}>
            {data.total_active_members}
          </div>
          <div className="text-[11px] mt-1" style={{ color: C.slate500 }}>
            across all plans
          </div>
        </div>
      </div>

      {data.top_entitlements.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.slate500 }}>
            Top services this month
          </div>
          <ul className="divide-y" style={{ borderColor: C.slate100 }}>
            {data.top_entitlements.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate" style={{ color: C.navy800 }}>{t.name}</span>
                <span style={{ color: C.slate600 }}>
                  {t.total_used} use{Number(t.total_used) === 1 ? "" : "s"} ·{" "}
                  <strong style={{ color: C.teal600 }}>{fmtMoney(Number(t.total_savings))}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px]" style={{ color: C.slate400 }}>
        Cash value uses retail-equivalent pricing per service. Lets you tell members and employers what their membership delivered.
      </p>
    </div>
  );
}
