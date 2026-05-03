// Compliance Command Center widget — port from Credentik's compliance.js
// (compute-locally + render score breakdown). Slot this into any portal
// dashboard; it self-fetches /compliance/score on mount.
//
// Renders:
//   - Big score (0–100) with grade letter
//   - Per-component breakdown bar
//   - Top 3 actions to bump the score
//
// Designed to be a standalone widget — no props beyond `compact` (which
// trims the action list for sidebar use).

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Shield, AlertTriangle, ChevronRight } from "lucide-react";
import { apiFetch } from "../../lib/api";

interface Component {
  name: string;
  description: string;
  score: number;
  max: number;
  detail: string;
  action: string | null;
}

interface ComplianceData {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  totalPoints: number;
  maxPoints: number;
  components: Component[];
  topActions: Array<{ component: string; action: string; lostPoints: number }>;
  computedAt: string;
}

const gradeColor: Record<ComplianceData["grade"], { fg: string; bg: string; ring: string; Icon: typeof Shield }> = {
  A: { fg: "#065f46", bg: "#ecfdf5", ring: "#10b981", Icon: ShieldCheck },
  B: { fg: "#0e7490", bg: "#ecfeff", ring: "#06b6d4", Icon: ShieldCheck },
  C: { fg: "#92400e", bg: "#fffbeb", ring: "#f59e0b", Icon: Shield },
  D: { fg: "#9a3412", bg: "#fff7ed", ring: "#f97316", Icon: ShieldAlert },
  F: { fg: "#991b1b", bg: "#fef2f2", ring: "#ef4444", Icon: AlertTriangle },
};

export function ComplianceWidget({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch<ComplianceData>("/compliance/score");
      if (cancelled) return;
      setLoading(false);
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setData(res.data);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
        <div className="h-4 w-24 bg-slate-100 rounded mb-3" />
        <div className="h-12 w-32 bg-slate-100 rounded" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm text-red-700">Couldn't load compliance score: {error || "no data"}</p>
      </div>
    );
  }

  const cfg = gradeColor[data.grade];
  const Icon = cfg.Icon;
  const actions = compact ? data.topActions.slice(0, 2) : data.topActions;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header score */}
      <div className="p-5 flex items-center gap-4" style={{ backgroundColor: cfg.bg }}>
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "white", border: `2px solid ${cfg.ring}` }}
        >
          <Icon className="w-7 h-7" style={{ color: cfg.fg }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: cfg.fg }}>
            Compliance score
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-3xl font-bold tabular-nums" style={{ color: cfg.fg }}>{data.score}</span>
            <span className="text-sm font-semibold opacity-80" style={{ color: cfg.fg }}>/ 100</span>
            <span className="text-2xl font-bold ml-2" style={{ color: cfg.fg }}>{data.grade}</span>
          </div>
          <p className="text-xs mt-1" style={{ color: cfg.fg, opacity: 0.7 }}>
            {data.totalPoints} of {data.maxPoints} weighted points
          </p>
        </div>
      </div>

      {/* Component breakdown */}
      {!compact && (
        <div className="px-5 py-4 space-y-3 border-t border-slate-100">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">By component</h3>
          {data.components.map((c) => {
            const pct = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
            const barColor = pct >= 90 ? "#10b981" : pct >= 70 ? "#f59e0b" : "#ef4444";
            return (
              <div key={c.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-slate-800">{c.name}</span>
                  <span className="text-slate-500 tabular-nums">{c.score} / {c.max}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </div>
                <p className="text-xs text-slate-500 mt-1">{c.detail}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Action queue */}
      {actions.length > 0 && (
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Top {actions.length === 1 ? "action" : `${actions.length} actions`} to improve your score
          </h3>
          <ul className="space-y-1.5">
            {actions.map((a, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <span className="flex-1 text-slate-700">
                  <span className="font-medium">{a.component}:</span> {a.action}
                </span>
                <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                  +{a.lostPoints} pts
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
