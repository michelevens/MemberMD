// ===== CalendarView =====
// Day / Week / Month calendar with appointment blocks
// Color-coded by type, telehealth indicators, click-to-view

import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Video,
  Clock,
} from "lucide-react";

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  navy800: "#243b53",
  navy700: "#334e68",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal50: "#e6fffa",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  white: "#ffffff",
  red500: "#ef4444",
  green500: "#22c55e",
  blue500: "#3b82f6",
  purple500: "#8b5cf6",
  amber500: "#f59e0b",
};

// ─── Mock Calendar Appointments ──────────────────────────────────────────────

interface CalendarAppointment {
  id: string;
  patientName: string;
  providerName: string;
  typeName: string;
  date: Date;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  isTeleHealth: boolean;
  color: string;
  status: string;
}

function generateMockAppointments(): CalendarAppointment[] {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();

  return [
    { id: "ca1", patientName: "Sarah Johnson", providerName: "Dr. Michel", typeName: "Psychiatric Eval", date: new Date(y, m, d), startHour: 9, startMinute: 0, durationMinutes: 60, isTeleHealth: true, color: "#7c3aed", status: "confirmed" },
    { id: "ca2", patientName: "James Williams", providerName: "Dr. Michel", typeName: "Med Management", date: new Date(y, m, d), startHour: 10, startMinute: 30, durationMinutes: 30, isTeleHealth: true, color: "#2563eb", status: "confirmed" },
    { id: "ca3", patientName: "Emily Davis", providerName: "Dr. Chen", typeName: "Annual Wellness", date: new Date(y, m, d), startHour: 11, startMinute: 0, durationMinutes: 45, isTeleHealth: false, color: "#059669", status: "scheduled" },
    { id: "ca4", patientName: "Michael Brown", providerName: "Dr. Kim", typeName: "Well-Child Check", date: new Date(y, m, d), startHour: 14, startMinute: 0, durationMinutes: 30, isTeleHealth: false, color: "#f59e0b", status: "confirmed" },
    { id: "ca5", patientName: "Lisa Anderson", providerName: "Dr. Chen", typeName: "Sick Visit", date: new Date(y, m, d), startHour: 15, startMinute: 0, durationMinutes: 20, isTeleHealth: false, color: "#dc2626", status: "checked_in" },
    { id: "ca6", patientName: "Robert Taylor", providerName: "Dr. Michel", typeName: "Therapy Follow-up", date: new Date(y, m, d + 1), startHour: 9, startMinute: 30, durationMinutes: 45, isTeleHealth: true, color: "#0891b2", status: "scheduled" },
    { id: "ca7", patientName: "Anna Martinez", providerName: "Dr. Kim", typeName: "Immunization", date: new Date(y, m, d + 1), startHour: 10, startMinute: 0, durationMinutes: 15, isTeleHealth: false, color: "#10b981", status: "scheduled" },
    { id: "ca8", patientName: "David Wilson", providerName: "Dr. Chen", typeName: "Telehealth Consult", date: new Date(y, m, d + 2), startHour: 13, startMinute: 0, durationMinutes: 30, isTeleHealth: true, color: "#7c3aed", status: "scheduled" },
  ];
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = "day" | "week" | "month";

interface CalendarViewProps {
  onAppointmentClick?: (appointmentId: string) => void;
  onBookNew?: () => void;
}

// ─── Time Helpers ────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7 AM to 7 PM

function formatHour(h: number): string {
  if (h === 0 || h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd;
  });
}

function getMonthDays(date: Date): (Date | null)[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) result.push(null);
  for (let i = 1; i <= daysInMonth; i++) result.push(new Date(year, month, i));
  return result;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CalendarView({ onAppointmentClick, onBookNew }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const appointments = useMemo(generateMockAppointments, []);

  // ─── Navigation ────────────────────────────────────────────────────────────

  function navigate(dir: -1 | 1) {
    const d = new Date(currentDate);
    if (viewMode === "day") d.setDate(d.getDate() + dir);
    else if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  // ─── Filter appointments ──────────────────────────────────────────────────

  function getAppointmentsForDay(date: Date): CalendarAppointment[] {
    return appointments.filter((a) => isSameDay(a.date, date));
  }

  // ─── Current Time Indicator ───────────────────────────────────────────────

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const timeIndicatorTop = ((nowMinutes - 7 * 60) / (13 * 60)) * 100;

  // ─── Header Label ──────────────────────────────────────────────────────────

  function getHeaderLabel(): string {
    if (viewMode === "day") {
      return currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }
    if (viewMode === "week") {
      const week = getWeekDays(currentDate);
      const start = week[0];
      const end = week[6];
      if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString("en-US", { month: "long" })} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${start.toLocaleDateString("en-US", { month: "short" })} ${start.getDate()} - ${end.toLocaleDateString("en-US", { month: "short" })} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  // ─── Appointment Block ────────────────────────────────────────────────────

  function renderAppointmentBlock(apt: CalendarAppointment, slim = false) {
    const topPercent = ((apt.startHour * 60 + apt.startMinute - 7 * 60) / (13 * 60)) * 100;
    const heightPercent = (apt.durationMinutes / (13 * 60)) * 100;

    return (
      <button
        key={apt.id}
        onClick={() => onAppointmentClick?.(apt.id)}
        className="absolute left-1 right-1 rounded-lg overflow-hidden text-left transition-all hover:opacity-90 cursor-pointer z-10"
        style={{
          top: `${topPercent}%`,
          height: `${Math.max(heightPercent, 2.5)}%`,
          backgroundColor: apt.color,
          opacity: 0.9,
        }}
      >
        <div className="p-1.5 h-full flex flex-col">
          <p className="text-xs font-semibold text-white truncate leading-tight">
            {slim ? apt.patientName.split(" ")[0] : apt.patientName}
          </p>
          {!slim && (
            <p className="text-xs text-white truncate leading-tight" style={{ opacity: 0.85 }}>
              {apt.typeName}
            </p>
          )}
          {apt.isTeleHealth && (
            <Video className="w-3 h-3 text-white mt-auto" style={{ opacity: 0.85 }} />
          )}
        </div>
      </button>
    );
  }

  // ─── Day View ──────────────────────────────────────────────────────────────

  function renderDayView() {
    const dayAppts = getAppointmentsForDay(currentDate);

    return (
      <div className="glass rounded-xl overflow-hidden">
        <div className="relative" style={{ height: "700px" }}>
          {/* Time grid */}
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute w-full flex"
              style={{ top: `${((h - 7) / 13) * 100}%`, height: `${100 / 13}%` }}
            >
              <div
                className="w-16 shrink-0 text-right pr-2 text-xs font-medium"
                style={{ color: C.slate400, paddingTop: "2px" }}
              >
                {formatHour(h)}
              </div>
              <div className="flex-1 border-t" style={{ borderColor: C.slate100 }} />
            </div>
          ))}

          {/* Appointments */}
          <div className="absolute left-16 right-0 top-0 bottom-0">
            {dayAppts.map((apt) => renderAppointmentBlock(apt))}

            {/* Current time indicator */}
            {isSameDay(currentDate, now) && timeIndicatorTop >= 0 && timeIndicatorTop <= 100 && (
              <div
                className="absolute left-0 right-0 z-20 flex items-center"
                style={{ top: `${timeIndicatorTop}%` }}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: C.red500 }} />
                <div className="flex-1 h-px" style={{ backgroundColor: C.red500 }} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Week View ─────────────────────────────────────────────────────────────

  function renderWeekView() {
    const weekDays = getWeekDays(currentDate);

    return (
      <div className="glass rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className="flex" style={{ borderBottom: `1px solid ${C.slate200}` }}>
          <div className="w-16 shrink-0" />
          {weekDays.map((day) => {
            const isToday = isSameDay(day, now);
            return (
              <div
                key={day.toISOString()}
                className="flex-1 text-center py-2"
                style={{ borderLeft: `1px solid ${C.slate100}` }}
              >
                <p className="text-xs" style={{ color: C.slate400 }}>
                  {day.toLocaleDateString("en-US", { weekday: "short" })}
                </p>
                <p
                  className="text-sm font-bold mt-0.5"
                  style={{
                    color: isToday ? C.teal500 : C.navy800,
                  }}
                >
                  {day.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="relative" style={{ height: "650px" }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute w-full flex"
              style={{ top: `${((h - 7) / 13) * 100}%`, height: `${100 / 13}%` }}
            >
              <div
                className="w-16 shrink-0 text-right pr-2 text-xs font-medium"
                style={{ color: C.slate400, paddingTop: "2px" }}
              >
                {formatHour(h)}
              </div>
              <div className="flex-1 border-t" style={{ borderColor: C.slate100 }} />
            </div>
          ))}

          {/* Day columns with appointments */}
          <div className="absolute left-16 right-0 top-0 bottom-0 flex">
            {weekDays.map((day) => {
              const dayAppts = getAppointmentsForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 relative"
                  style={{ borderLeft: `1px solid ${C.slate100}` }}
                >
                  {dayAppts.map((apt) => renderAppointmentBlock(apt, true))}
                </div>
              );
            })}
          </div>

          {/* Current time indicator */}
          {timeIndicatorTop >= 0 && timeIndicatorTop <= 100 && (
            <div
              className="absolute left-16 right-0 z-20 flex items-center"
              style={{ top: `${timeIndicatorTop}%` }}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: C.red500 }} />
              <div className="flex-1 h-px" style={{ backgroundColor: C.red500 }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Month View ────────────────────────────────────────────────────────────

  function renderMonthView() {
    const days = getMonthDays(currentDate);

    return (
      <div className="glass rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7" style={{ borderBottom: `1px solid ${C.slate200}` }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center py-2 text-xs font-medium" style={{ color: C.slate400 }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className="min-h-24 border-b border-r" style={{ borderColor: C.slate100 }} />;
            const dayAppts = getAppointmentsForDay(day);
            const isToday = isSameDay(day, now);
            const maxVisible = 3;
            const overflow = dayAppts.length - maxVisible;

            return (
              <button
                key={day.toISOString()}
                onClick={() => {
                  setCurrentDate(day);
                  setViewMode("day");
                }}
                className="min-h-24 p-1.5 text-left border-b border-r transition-colors hover:bg-slate-50"
                style={{ borderColor: C.slate100 }}
              >
                <p
                  className="text-xs font-medium mb-1"
                  style={{
                    color: isToday ? C.teal500 : C.slate600,
                    fontWeight: isToday ? 700 : 500,
                  }}
                >
                  {day.getDate()}
                </p>
                <div className="space-y-0.5">
                  {dayAppts.slice(0, maxVisible).map((apt) => (
                    <div
                      key={apt.id}
                      className="flex items-center gap-1 px-1 py-0.5 rounded text-white truncate"
                      style={{ backgroundColor: apt.color, fontSize: "10px" }}
                    >
                      {apt.isTeleHealth && <Video className="w-2.5 h-2.5 shrink-0" />}
                      <span className="truncate">{apt.patientName.split(" ")[0]}</span>
                    </div>
                  ))}
                  {overflow > 0 && (
                    <p className="text-xs font-medium px-1" style={{ color: C.slate400, fontSize: "10px" }}>
                      +{overflow} more
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg transition-colors hover:bg-slate-100"
            style={{ border: `1px solid ${C.slate200}` }}
          >
            <ChevronLeft className="w-4 h-4" style={{ color: C.slate500 }} />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-slate-100"
            style={{ border: `1px solid ${C.slate200}`, color: C.slate600 }}
          >
            Today
          </button>
          <button
            onClick={() => navigate(1)}
            className="p-2 rounded-lg transition-colors hover:bg-slate-100"
            style={{ border: `1px solid ${C.slate200}` }}
          >
            <ChevronRight className="w-4 h-4" style={{ color: C.slate500 }} />
          </button>
          <h3 className="text-sm font-semibold ml-2" style={{ color: C.navy800 }}>
            {getHeaderLabel()}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Tabs */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.slate200}` }}>
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-3 py-1.5 text-xs font-medium capitalize transition-colors"
                style={{
                  backgroundColor: viewMode === mode ? C.teal500 : C.white,
                  color: viewMode === mode ? C.white : C.slate500,
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          {onBookNew && (
            <button
              onClick={onBookNew}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: C.teal500 }}
            >
              + Book
            </button>
          )}
        </div>
      </div>

      {/* Calendar Content */}
      {viewMode === "day" && renderDayView()}
      {viewMode === "week" && renderWeekView()}
      {viewMode === "month" && renderMonthView()}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: C.slate400 }}>
        <span className="flex items-center gap-1.5">
          <Video className="w-3 h-3" /> Telehealth
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" /> Duration shown by block height
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded" style={{ backgroundColor: C.red500 }} />
          Current time
        </span>
      </div>
    </div>
  );
}
