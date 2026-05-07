// ===== NotificationRegistryPanel =====
//
// Registry-driven Notifications surface in Practice Settings. Lists
// every transactional notification the system might send, grouped
// by audience, with a per-tenant on/off toggle. PHI-bearing
// notifications are flagged so admins know which sends require an
// ePHI waiver.
//
// Backed by:
//   GET /api/practice/notifications
//   PUT /api/practice/notifications/{key}

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { apiFetch } from "../../lib/api";

interface NotificationRow {
  key: string;
  audience: "patient" | "membership" | "practice" | "employer" | "operator";
  label: string;
  description: string;
  isPhiBearing: boolean;
  defaultEnabled: boolean;
  enabled: boolean;
  isOverridden: boolean;
}

const AUDIENCE_LABELS: Record<string, string> = {
  patient: "Patient",
  membership: "Membership Lifecycle",
  practice: "Practice Staff",
  employer: "Employer",
  operator: "Operator",
};

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  amber800: "#92400e",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  white: "#ffffff",
};

export function NotificationRegistryPanel() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<NotificationRow[]>("/practice/notifications");
        if (cancelled) return;
        setRows(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load notifications.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (key: string, nextEnabled: boolean) => {
    setSavingKey(key);
    // Optimistic update — flip in UI before server confirms.
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, enabled: nextEnabled, isOverridden: true } : r)));

    try {
      const res = await apiFetch(`/practice/notifications/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (res.error) {
        // Roll back optimistic flip
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, enabled: !nextEnabled } : r)));
        setError(res.error);
      }
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, enabled: !nextEnabled } : r)));
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  // Group rows by audience to mirror Hint's tab-style organization
  // without forcing tabs (just headers).
  const groups = rows.reduce<Record<string, NotificationRow[]>>((acc, r) => {
    if (!acc[r.audience]) acc[r.audience] = [];
    acc[r.audience].push(r);
    return acc;
  }, {});

  const orderedAudiences = ["patient", "membership", "practice", "employer", "operator"]
    .filter((a) => groups[a]?.length);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm" style={{ color: "#7f1d1d" }}>
          {error}
        </div>
      )}

      <div className="rounded-xl border bg-white p-5" style={{ borderColor: C.slate200 }}>
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: C.amber500 }} />
          <div className="text-xs" style={{ color: C.slate600 }}>
            <p className="font-semibold mb-1" style={{ color: C.navy900 }}>About these toggles</p>
            <p>
              Notifications flagged <strong>"Contains PHI"</strong> will only be sent to patients who
              have granted an ePHI communication waiver. Use the <strong>ePHI Waivers</strong> tab to
              record consent for individual patients. Disabling a notification here turns it off for
              your entire practice — patients still controlling their own preferences see this as the
              practice setting.
            </p>
          </div>
        </div>
      </div>

      {orderedAudiences.map((audience) => (
        <section key={audience} className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: C.slate200 }}>
          <div className="px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: C.slate200, color: C.slate500, backgroundColor: C.slate100 }}>
            {AUDIENCE_LABELS[audience] ?? audience}
          </div>
          <ul className="divide-y" style={{ borderColor: C.slate100 }}>
            {(groups[audience] ?? []).map((row) => (
              <li key={row.key} className="px-4 py-3 flex items-start gap-4">
                <button
                  onClick={() => toggle(row.key, !row.enabled)}
                  disabled={savingKey === row.key}
                  className="relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 disabled:opacity-60"
                  style={{ backgroundColor: row.enabled ? C.teal500 : C.slate300 }}
                  aria-label={`${row.enabled ? "Disable" : "Enable"} ${row.label}`}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
                    style={{ transform: row.enabled ? "translateX(22px)" : "translateX(2px)" }}
                  />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: C.navy900 }}>
                      {row.label}
                    </span>
                    {row.isPhiBearing && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                        style={{ backgroundColor: C.amber50, color: C.amber800 }}
                        title="Will only send to patients who have granted an ePHI waiver"
                      >
                        Contains PHI
                      </span>
                    )}
                    {row.isOverridden && (
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: C.slate400 }}>
                        Custom
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
                    {row.description}
                  </p>
                </div>

                <div className="text-xs flex-shrink-0" style={{ color: C.slate400 }}>
                  {row.enabled ? "On" : "Off"}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
