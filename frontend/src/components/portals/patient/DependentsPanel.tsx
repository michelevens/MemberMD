// ===== DependentsPanel =====
//
// Patient-dashboard panel for guardians managing dependents on their
// family membership. Renders one card per dependent with the three
// things a guardian needs to glance at:
//   - upcoming appointment
//   - unread messages
//   - open balance (sum of unpaid ad-hoc charges)
//
// Tap a card → routes to the relevant filtered view in the patient
// portal (appointments, messages, billing). Backend data comes from
// /me/dependents-summary which is tightly tenant + family scoped.
//
// What this is NOT: full "act as my dependent" impersonation. The
// guardian views a glance summary; deeper management lives on the
// practice side. A proper switch-profile flow is a larger auth
// refactor — this captures the 80% case.

import { useEffect, useState } from "react";
import { Calendar, MessageSquare, AlertCircle, ChevronRight, Loader2, Users } from "lucide-react";
import { apiFetch } from "../../../lib/api";

interface DependentSummary {
  dependent: {
    id: string;
    patientId: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    dateOfBirth: string | null;
    relationship: string;
    isMinor: boolean;
  };
  upcomingAppointment: {
    id: string;
    scheduledAt: string;
    durationMinutes: number;
    status: string;
    isTelehealth: boolean;
  } | null;
  unreadMessages: number;
  openBalanceCents: number;
  openChargesCount: number;
}

interface Props {
  onNavigate: (target: "appointments" | "messages" | "billing" | "family") => void;
}

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal700: "#0e6651",
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

const RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: "Spouse",
  child: "Child",
  parent: "Parent",
  other: "Other",
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function DependentsPanel({ onNavigate }: Props) {
  const [rows, setRows] = useState<DependentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<DependentSummary[]>("/me/dependents-summary");
        if (cancelled) return;
        setRows(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  // No dependents → no panel. The Family Members tab is the place
  // for a guardian to add their first dependent; we don't bait this
  // empty surface on the dashboard.
  if (rows.length === 0) return null;

  return (
    <section
      className="rounded-2xl border bg-white p-5 space-y-4"
      style={{ borderColor: C.slate200 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: C.teal500 }} />
          <h3 className="text-sm font-semibold" style={{ color: C.navy900 }}>
            Family
          </h3>
        </div>
        <button
          onClick={() => onNavigate("family")}
          className="text-xs font-medium"
          style={{ color: C.teal700 }}
        >
          Manage
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const fullName = [row.dependent.firstName, row.dependent.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() || "Family member";
          const display = row.dependent.preferredName || fullName;
          const relationshipLabel = RELATIONSHIP_LABELS[row.dependent.relationship] || row.dependent.relationship;
          const hasAlert = row.openBalanceCents > 0 || row.unreadMessages > 0;

          return (
            <div
              key={row.dependent.id}
              className="rounded-lg border p-3"
              style={{
                borderColor: hasAlert ? "#fde68a" : C.slate200,
                backgroundColor: hasAlert ? C.amber50 : C.white,
              }}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                    style={{ backgroundColor: C.navy800 }}
                  >
                    {display.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: C.navy900 }}>
                      {display}
                    </p>
                    <p className="text-xs truncate" style={{ color: C.slate500 }}>
                      {relationshipLabel}
                      {row.dependent.isMinor ? " · Minor" : ""}
                    </p>
                  </div>
                </div>
              </div>

              {/* Three rollup buttons — tap to filter the relevant
                  patient-portal tab. Each row shows the count and
                  is muted when there's nothing actionable. */}
              <div className="grid grid-cols-3 gap-2">
                <RollupButton
                  icon={Calendar}
                  label="Next visit"
                  value={row.upcomingAppointment ? formatTime(row.upcomingAppointment.scheduledAt) : "None"}
                  onClick={() => onNavigate("appointments")}
                  active={Boolean(row.upcomingAppointment)}
                />
                <RollupButton
                  icon={MessageSquare}
                  label="Unread"
                  value={row.unreadMessages > 0 ? `${row.unreadMessages}` : "0"}
                  onClick={() => onNavigate("messages")}
                  active={row.unreadMessages > 0}
                  highlight={row.unreadMessages > 0}
                />
                <RollupButton
                  icon={AlertCircle}
                  label="Owed"
                  value={row.openBalanceCents > 0 ? formatCurrency(row.openBalanceCents) : "$0"}
                  onClick={() => onNavigate("billing")}
                  active={row.openBalanceCents > 0}
                  highlight={row.openBalanceCents > 0}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs" style={{ color: C.slate400 }}>
        Showing data linked to your family membership. To add or remove a dependent, open Family Members.
      </p>
    </section>
  );
}

interface RollupButtonProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  onClick: () => void;
  active: boolean;
  highlight?: boolean;
}

function RollupButton({ icon: Icon, label, value, onClick, active, highlight }: RollupButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 p-2 rounded-md text-left transition-colors hover:bg-white/60"
      style={{
        backgroundColor: highlight ? C.white : "transparent",
      }}
    >
      <Icon
        className="w-3.5 h-3.5 flex-shrink-0"
        style={{ color: highlight ? C.amber800 : active ? C.teal700 : C.slate400 }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: C.slate500 }}>
          {label}
        </p>
        <p
          className="text-xs font-semibold truncate"
          style={{ color: highlight ? C.amber800 : active ? C.navy900 : C.slate400 }}
        >
          {value}
        </p>
      </div>
      {active && (
        <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: C.slate400 }} />
      )}
    </button>
  );
}

// Suppress unused-loader warning in some bundlers
void Loader2;
