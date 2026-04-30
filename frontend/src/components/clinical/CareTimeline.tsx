// ===== CareTimeline =====
// Practice-wide chronological feed of clinical events: encounters,
// prescriptions, screenings, lab results, vitals, referrals, and
// status changes. Inspired by EnnHealth's WellnessActivityList
// pattern but reshaped as a true vertical timeline (connector line +
// dots) and broadened to clinical events across all patients.
//
// Filterable by event type. Grouped by date.
//
// Data source: this component accepts an `events` prop. Callers can
// hydrate from real services or pass demo data — the included
// `generateDemoTimelineEvents()` helper produces realistic-looking
// activity for empty installs.

import { useMemo, useState } from "react";
import {
  Stethoscope,
  Pill,
  ClipboardList,
  FlaskConical,
  Activity,
  FileText,
  UserPlus,
  AlertCircle,
  Filter,
} from "lucide-react";

// ─── Colors ─────────────────────────────────────────────────────────────────

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  navy700: "#334e68",
  teal500: "#27ab83",
  teal600: "#147d64",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  white: "#ffffff",
};

// ─── Types ──────────────────────────────────────────────────────────────────

export type CareEventType =
  | "encounter"
  | "prescription"
  | "screening"
  | "lab"
  | "vital"
  | "document"
  | "referral"
  | "alert";

export interface CareEvent {
  id: string;
  type: CareEventType;
  date: Date;
  patientName: string;
  /** Provider who recorded the event. */
  providerName?: string;
  /** Short headline shown in the timeline row. */
  title: string;
  /** Optional one-liner shown under the title. */
  detail?: string;
}

interface CareTimelineProps {
  events: CareEvent[];
  /** Optional click handler on a row — caller can route to the patient. */
  onEventClick?: (event: CareEvent) => void;
}

// ─── Per-type styling ───────────────────────────────────────────────────────

const TYPE_META: Record<
  CareEventType,
  { label: string; color: string; bg: string; icon: typeof Stethoscope }
> = {
  encounter:    { label: "Encounter",    color: "#147d64", bg: "#e6f7f2", icon: Stethoscope },
  prescription: { label: "Prescription", color: "#7c3aed", bg: "#f3e8ff", icon: Pill },
  screening:    { label: "Screening",    color: "#d97706", bg: "#fffbeb", icon: ClipboardList },
  lab:          { label: "Lab Result",   color: "#1d4ed8", bg: "#dbeafe", icon: FlaskConical },
  vital:        { label: "Vitals",       color: "#dc2626", bg: "#fee2e2", icon: Activity },
  document:     { label: "Document",     color: "#475569", bg: "#f1f5f9", icon: FileText },
  referral:     { label: "Referral",     color: "#0891b2", bg: "#cffafe", icon: UserPlus },
  alert:        { label: "Alert",        color: "#b91c1c", bg: "#fee2e2", icon: AlertCircle },
};

const ALL_TYPES: CareEventType[] = [
  "encounter", "prescription", "screening", "lab",
  "vital", "document", "referral", "alert",
];

// ─── Demo data generator ────────────────────────────────────────────────────
// Used by callers that want realistic-looking activity in empty
// installs — wire to real services for production data.

export function generateDemoTimelineEvents(): CareEvent[] {
  const now = new Date();
  const day = (offset: number, h = 9, m = 0) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, h, m);

  return [
    {
      id: "ev1", type: "encounter", date: day(0, 9, 30),
      patientName: "James Wilson", providerName: "Dr. Michel",
      title: "Med Management visit completed",
      detail: "PHQ-9 improved 14 → 9. Continued Sertraline 100mg. F/U 4 weeks.",
    },
    {
      id: "ev2", type: "screening", date: day(0, 9, 0),
      patientName: "James Wilson", providerName: "Dr. Michel",
      title: "PHQ-9 administered",
      detail: "Score 9 — mild. Down from 14 last visit.",
    },
    {
      id: "ev3", type: "prescription", date: day(0, 11, 15),
      patientName: "Emily Davis", providerName: "Dr. Chen",
      title: "Sertraline 50mg started",
      detail: "Once daily. 30-day supply, 2 refills.",
    },
    {
      id: "ev4", type: "vital", date: day(1, 14, 10),
      patientName: "Michael Brown", providerName: "Dr. Kim",
      title: "Vitals recorded",
      detail: "BP 128/82, HR 76, Temp 98.4°F, BMI 27.1.",
    },
    {
      id: "ev5", type: "lab", date: day(1, 16, 0),
      patientName: "Sarah Johnson", providerName: "NP Johnson",
      title: "TSH result back — within range",
      detail: "2.1 mIU/L. CBC and CMP unremarkable.",
    },
    {
      id: "ev6", type: "alert", date: day(2, 8, 45),
      patientName: "Karen Thomas", providerName: "Dr. Michel",
      title: "No-show flagged",
      detail: "Second consecutive no-show. Outreach call required.",
    },
    {
      id: "ev7", type: "document", date: day(2, 13, 20),
      patientName: "David Wilson", providerName: undefined,
      title: "HIPAA consent signed",
      detail: "Uploaded by patient via portal.",
    },
    {
      id: "ev8", type: "referral", date: day(3, 10, 30),
      patientName: "Lisa Anderson", providerName: "Dr. Chen",
      title: "Referred to behavioral therapy",
      detail: "CBT — Ennhealth Behavioral Group, weekly.",
    },
    {
      id: "ev9", type: "encounter", date: day(3, 14, 0),
      patientName: "Robert Taylor", providerName: "Dr. Michel",
      title: "Therapy session — 45 min",
      detail: "Continued exposure work. Homework assigned.",
    },
    {
      id: "ev10", type: "prescription", date: day(4, 9, 0),
      patientName: "James Wilson", providerName: "Dr. Michel",
      title: "Bupropion 150mg XL refilled",
      detail: "30-day supply.",
    },
    {
      id: "ev11", type: "screening", date: day(5, 11, 30),
      patientName: "Emily Davis", providerName: "Dr. Chen",
      title: "GAD-7 administered",
      detail: "Score 12 — moderate.",
    },
    {
      id: "ev12", type: "vital", date: day(6, 9, 15),
      patientName: "Anna Martinez", providerName: "Dr. Kim",
      title: "Vitals recorded",
      detail: "BP 118/74, HR 68, Temp 98.2°F.",
    },
  ];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDayHeader(d: Date, today: Date): string {
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CareTimeline({ events, onEventClick }: CareTimelineProps) {
  const [activeFilters, setActiveFilters] = useState<Set<CareEventType>>(
    () => new Set(ALL_TYPES)
  );

  const toggleFilter = (type: CareEventType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const showAll = () => setActiveFilters(new Set(ALL_TYPES));
  const showNone = () => setActiveFilters(new Set());

  const filtered = useMemo(
    () =>
      events
        .filter((e) => activeFilters.has(e.type))
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [events, activeFilters]
  );

  const grouped = useMemo(() => {
    const groups: Array<{ key: string; date: Date; events: CareEvent[] }> = [];
    for (const ev of filtered) {
      const key = ev.date.toDateString();
      const existing = groups.find((g) => g.key === key);
      if (existing) existing.events.push(ev);
      else groups.push({ key, date: new Date(ev.date.getFullYear(), ev.date.getMonth(), ev.date.getDate()), events: [ev] });
    }
    return groups;
  }, [filtered]);

  const today = new Date();

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="glass rounded-xl p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 shrink-0" style={{ color: C.slate400 }} />
          <span className="text-xs font-semibold mr-1" style={{ color: C.slate600 }}>
            Filter:
          </span>
          {ALL_TYPES.map((type) => {
            const meta = TYPE_META[type];
            const Icon = meta.icon;
            const active = activeFilters.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleFilter(type)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  backgroundColor: active ? meta.bg : C.slate100,
                  color: active ? meta.color : C.slate400,
                  border: `1px solid ${active ? meta.color : C.slate200}`,
                  opacity: active ? 1 : 0.7,
                }}
              >
                <Icon className="w-3 h-3" />
                {meta.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={showAll}
              className="text-xs font-medium hover:underline"
              style={{ color: C.teal600 }}
            >
              All
            </button>
            <span style={{ color: C.slate300 }}>·</span>
            <button
              onClick={showNone}
              className="text-xs font-medium hover:underline"
              style={{ color: C.slate500 }}
            >
              None
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {grouped.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <Activity className="w-10 h-10 mx-auto mb-3" style={{ color: C.slate300 }} />
          <p className="text-sm" style={{ color: C.slate500 }}>
            {events.length === 0
              ? "No clinical events to show yet."
              : "No events match the selected filters."}
          </p>
        </div>
      ) : (
        <div className="glass rounded-xl p-6">
          <div className="relative">
            {/* Vertical connector line */}
            <div
              className="absolute top-2 bottom-2 w-px"
              style={{ left: "11px", backgroundColor: C.slate200 }}
            />

            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.key}>
                  {/* Day header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10"
                      style={{
                        backgroundColor: C.teal500,
                        color: C.white,
                        boxShadow: `0 0 0 4px ${C.white}`,
                      }}
                    >
                      {group.events.length}
                    </div>
                    <p className="text-sm font-semibold" style={{ color: C.navy800 }}>
                      {formatDayHeader(group.date, today)}
                    </p>
                    <p className="text-xs" style={{ color: C.slate400 }}>
                      {group.events.length} {group.events.length === 1 ? "event" : "events"}
                    </p>
                  </div>

                  {/* Day events */}
                  <div className="space-y-2 ml-9">
                    {group.events.map((ev) => {
                      const meta = TYPE_META[ev.type];
                      const Icon = meta.icon;
                      return (
                        <button
                          key={ev.id}
                          onClick={() => onEventClick?.(ev)}
                          className="w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors hover:bg-slate-50"
                          style={{ border: `1px solid ${C.slate200}` }}
                        >
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: meta.bg }}
                          >
                            <Icon className="w-4 h-4" style={{ color: meta.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-0.5">
                              <span
                                className="text-xs font-semibold uppercase tracking-wider"
                                style={{ color: meta.color }}
                              >
                                {meta.label}
                              </span>
                              <span className="text-xs" style={{ color: C.slate400 }}>
                                · {ev.patientName}
                              </span>
                              {ev.providerName && (
                                <span className="text-xs" style={{ color: C.slate400 }}>
                                  · {ev.providerName}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium" style={{ color: C.navy800 }}>
                              {ev.title}
                            </p>
                            {ev.detail && (
                              <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
                                {ev.detail}
                              </p>
                            )}
                          </div>
                          <span className="text-xs shrink-0" style={{ color: C.slate400 }}>
                            {formatTime(ev.date)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
