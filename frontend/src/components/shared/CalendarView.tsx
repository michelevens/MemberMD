// ===== CalendarView =====
// Day / Week / Month / List calendar with appointment blocks.
// Color-coded by status (mirrors EnnHealth's status palette).
// Drag-and-drop reschedule between days (week + month views).
//
// Drag-drop powered by react-dnd. The component wraps its content in a
// DndProvider so callers don't have to.

import { useState, useCallback, useEffect, useMemo } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  ChevronLeft,
  ChevronRight,
  Video,
  Clock,
  Building2,
  GripVertical,
  CalendarDays,
  List,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch, telehealthService } from "../../lib/api";

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

// ─── Status Colors (ported from EnnHealth) ──────────────────────────────────
//
// EnnHealth's CalendarView color-codes blocks by *status*, not by visit type.
// We mirror that — the visit-type tint becomes a thin left border on each
// block so providers still see type at a glance.

const STATUS_COLORS: Record<
  string,
  { bg: string; border: string; text: string; label: string }
> = {
  confirmed:    { bg: "#dcfce7", border: "#16a34a", text: "#15803d", label: "Confirmed" },
  scheduled:    { bg: "#fef3c7", border: "#d97706", text: "#92400e", label: "Scheduled" },
  pending:      { bg: "#fef3c7", border: "#d97706", text: "#92400e", label: "Pending" },
  checked_in:   { bg: "#dbeafe", border: "#2563eb", text: "#1d4ed8", label: "Checked In" },
  in_session:   { bg: "#e0e7ff", border: "#4f46e5", text: "#4338ca", label: "In Session" },
  completed:    { bg: "#dbeafe", border: "#2563eb", text: "#1d4ed8", label: "Completed" },
  cancelled:    { bg: "#fee2e2", border: "#dc2626", text: "#b91c1c", label: "Cancelled" },
  no_show:      { bg: "#fee2e2", border: "#dc2626", text: "#b91c1c", label: "No Show" },
  blocked:      { bg: "#f1f5f9", border: "#64748b", text: "#475569", label: "Blocked" },
};

function getStatusStyle(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.scheduled;
}

// ─── Types ───────────────────────────────────────────────────────────────────

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
  /** Type-color tint shown as a thin left border on the block. */
  color: string;
  status: string;
}

type ViewMode = "day" | "week" | "month" | "list";

interface CalendarViewProps {
  /** Called BEFORE the built-in detail modal opens. Return true from
   *  this callback to suppress the modal (host wants to handle it). */
  onAppointmentClick?: (appointmentId: string) => boolean | void;
  onBookNew?: () => void;
  /** Optional: notify caller when an appointment is rescheduled via drag-drop. */
  onReschedule?: (appointmentId: string, newDate: Date) => void;
}

// ─── API → CalendarAppointment mapping ───────────────────────────────────────
//
// The /appointments endpoint returns Eloquent models with eager-loaded
// patient + provider.user + appointmentType. apiFetch runs snake→camel
// on every response so we read camelCase first; snake_case fallbacks
// kept in case a future call path skips the transform.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiAppointment = any;

const DEFAULT_TYPE_COLOR = "#64748b";

function mapAppointment(api: ApiAppointment): CalendarAppointment | null {
  if (!api) return null;
  const scheduledAt = api.scheduledAt ?? api.scheduled_at ?? null;
  if (!scheduledAt) return null;
  const dt = new Date(scheduledAt);
  if (isNaN(dt.getTime())) return null;
  const t = api.appointmentType ?? api.appointment_type ?? null;
  const providerUser = api.provider?.user ?? null;
  const firstName = providerUser?.firstName ?? providerUser?.first_name;
  const lastName = providerUser?.lastName ?? providerUser?.last_name;
  const providerName = providerUser?.name
    ?? ([firstName, lastName].filter(Boolean).join(" ").trim() || "Provider");
  const patientFirst = api.patient?.firstName ?? api.patient?.first_name;
  const patientLast = api.patient?.lastName ?? api.patient?.last_name;
  const patientName = [patientFirst, patientLast].filter(Boolean).join(" ").trim() || "Patient";
  const isTeleHealth = !!(api.isTelehealth ?? api.is_telehealth);
  const duration = api.durationMinutes ?? api.duration_minutes ?? 30;
  return {
    id: api.id,
    patientName,
    providerName,
    typeName: t?.name ?? "Appointment",
    date: dt,
    startHour: dt.getHours(),
    startMinute: dt.getMinutes(),
    durationMinutes: duration,
    isTeleHealth,
    color: t?.color ?? DEFAULT_TYPE_COLOR,
    status: api.status,
  };
}

// ─── Time Helpers ────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7 AM to 7 PM
const DRAG_TYPE = "calendar-appointment";

function formatHour(h: number): string {
  if (h === 0 || h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

function formatTime(h: number, min: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${min.toString().padStart(2, "0")} ${ampm}`;
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

// ─── Drag Source ────────────────────────────────────────────────────────────

interface DragItem {
  id: string;
  originalDate: Date;
}

function isDraggable(status: string): boolean {
  // Mirror EnnHealth: completed / cancelled / blocked / no-show are locked.
  return !["completed", "cancelled", "blocked", "no_show"].includes(status);
}

function DraggableBlock({
  appointment,
  children,
  onClick,
}: {
  appointment: CalendarAppointment;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const draggable = isDraggable(appointment.status);
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: DRAG_TYPE,
      item: { id: appointment.id, originalDate: appointment.date } as DragItem,
      canDrag: draggable,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [appointment.id, appointment.date, draggable]
  );

  return (
    <div
      ref={(node) => {
        if (node) drag(node);
      }}
      onClick={onClick}
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: draggable ? "grab" : "pointer",
      }}
    >
      {children}
    </div>
  );
}

function DropDay({
  date,
  onDrop,
  children,
}: {
  date: Date;
  onDrop: (item: DragItem, newDate: Date) => void;
  children: React.ReactNode;
}) {
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: DRAG_TYPE,
      drop: (item: DragItem) => onDrop(item, date),
      canDrop: (item: DragItem) => !isSameDay(item.originalDate, date),
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [date, onDrop]
  );

  return (
    <div
      ref={(node) => {
        if (node) drop(node);
      }}
      style={{
        backgroundColor: isOver && canDrop ? "rgba(39, 171, 131, 0.08)" : "transparent",
        outline: isOver && canDrop ? `2px dashed ${C.teal500}` : "none",
        outlineOffset: "-2px",
        height: "100%",
        position: "relative",
      }}
    >
      {children}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

function CalendarViewInner({ onAppointmentClick, onBookNew, onReschedule }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reschedFailed, setReschedFailed] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<CalendarAppointment | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailMsg, setDetailMsg] = useState<string | null>(null);

  function handleAppointmentClick(id: string) {
    // Host has the chance to intercept — if they return true, we
    // assume they're handling the click and skip the built-in modal.
    const handled = onAppointmentClick?.(id);
    if (handled === true) return;
    const apt = appointments.find((a) => a.id === id);
    if (apt) setDetailFor(apt);
  }

  async function cancelAppointment(id: string) {
    if (!window.confirm("Cancel this appointment?")) return;
    setDetailBusy(true);
    setDetailMsg(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>(`/appointments/${id}`, { method: "DELETE" });
    setDetailBusy(false);
    if (res.error) {
      setDetailMsg(res.error);
      return;
    }
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "cancelled" } : a)));
    setDetailFor(null);
  }

  // useNavigate alias — there's a local navigate(dir) helper below
  // for prev/next paging that takes precedence on the bare name.
  const routerNavigate = useNavigate();
  async function joinTelehealth(id: string) {
    setDetailBusy(true);
    setDetailMsg(null);
    const res = await telehealthService.openForAppointment(id);
    setDetailBusy(false);
    if (res.error || !res.data?.sessionId) {
      setDetailMsg(res.error || "Could not open the video room.");
      return;
    }
    setDetailFor(null);
    routerNavigate(`/telehealth/${res.data.sessionId}`);
  }

  async function markComplete(id: string) {
    setDetailBusy(true);
    setDetailMsg(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>(`/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
    setDetailBusy(false);
    if (res.error) {
      setDetailMsg(res.error);
      return;
    }
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "completed" } : a)));
    setDetailFor(null);
  }

  // ─── Compute the date range to fetch based on view + currentDate ──────────
  // Fetch one extra week of padding around the visible window so when the
  // user pages forward we usually already have the data cached locally.
  const range = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);
    if (viewMode === "day") {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() + 1);
    } else if (viewMode === "week" || viewMode === "list") {
      const week = getWeekDays(currentDate);
      start.setTime(week[0].getTime());
      start.setDate(start.getDate() - 1);
      end.setTime(week[6].getTime());
      end.setDate(end.getDate() + 1);
    } else {
      start.setDate(1);
      start.setDate(start.getDate() - 7);
      end.setMonth(end.getMonth() + 1);
      end.setDate(7);
    }
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { from: fmt(start), to: fmt(end) };
  }, [currentDate, viewMode]);

  // ─── Fetch appointments whenever the visible range changes ────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      // Pull a generous page size so a busy week doesn't get truncated.
      // Backend caps via per_page validation.
      const qs = new URLSearchParams({
        date_from: range.from,
        date_to: range.to,
        per_page: "200",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await apiFetch<any>(`/appointments?${qs.toString()}`);
      if (cancelled) return;
      setLoading(false);
      if (res.error) {
        setError(res.error);
        setAppointments([]);
        return;
      }
      // Index returns { data: { current_page, data: [...], ... } } via
      // Laravel's paginator. Some envs return a flat array; tolerate both.
      const raw = res.data;
      const items: ApiAppointment[] = Array.isArray(raw)
        ? raw
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : Array.isArray((raw as any)?.data)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (raw as any).data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : Array.isArray((raw as any)?.data?.data)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? (raw as any).data.data
            : [];
      setAppointments(items.map(mapAppointment).filter((a): a is CalendarAppointment => a !== null));
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  // ─── Reschedule Handler ────────────────────────────────────────────────────
  // Optimistic local update + API PATCH. On failure we roll back and
  // surface the server's validation error (e.g. "time slot conflicts
  // with existing appointment"). Same date but different time isn't
  // possible via drag-drop today (drop targets are days, not time
  // slots) — only the day shifts; the time-of-day stays.
  const handleDrop = useCallback(
    (item: DragItem, newDate: Date) => {
      const original = appointments.find((a) => a.id === item.id);
      if (!original) return;
      const newDateTime = new Date(
        newDate.getFullYear(), newDate.getMonth(), newDate.getDate(),
        original.startHour, original.startMinute,
      );

      // Optimistic update.
      setAppointments((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, date: newDateTime } : a))
      );

      // Backend wants ISO datetime. PATCH to /appointments/{id}/reschedule
      // (the existing endpoint that re-checks availability + sends an
      // email + appends an audit note).
      (async () => {
        const isoLocal = newDateTime.toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await apiFetch<any>(`/appointments/${item.id}/reschedule`, {
          method: "PUT",
          body: JSON.stringify({ scheduled_at: isoLocal }),
        });
        if (res.error) {
          // Roll back.
          setAppointments((prev) =>
            prev.map((a) => (a.id === item.id ? { ...a, date: original.date } : a))
          );
          setReschedFailed(res.error);
          window.setTimeout(() => setReschedFailed(null), 5000);
        }
      })();

      onReschedule?.(item.id, newDate);
    },
    [appointments, onReschedule]
  );

  // ─── Navigation ────────────────────────────────────────────────────────────

  function navigate(dir: -1 | 1) {
    const d = new Date(currentDate);
    if (viewMode === "day") d.setDate(d.getDate() + dir);
    else if (viewMode === "week" || viewMode === "list") d.setDate(d.getDate() + dir * 7);
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
    if (viewMode === "week" || viewMode === "list") {
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

  // ─── Appointment Block (status-colored) ────────────────────────────────────

  function renderAppointmentBlock(apt: CalendarAppointment, slim = false) {
    const topPercent = ((apt.startHour * 60 + apt.startMinute - 7 * 60) / (13 * 60)) * 100;
    const heightPercent = (apt.durationMinutes / (13 * 60)) * 100;
    const status = getStatusStyle(apt.status);

    return (
      <DraggableBlock
        key={apt.id}
        appointment={apt}
        onClick={() => handleAppointmentClick(apt.id)}
      >
        <div
          className="absolute left-1 right-1 rounded-lg overflow-hidden text-left transition-all hover:opacity-90 z-10"
          style={{
            top: `${topPercent}%`,
            height: `${Math.max(heightPercent, 3)}%`,
            backgroundColor: status.bg,
            borderLeft: `3px solid ${apt.color}`,
            boxShadow: `0 1px 2px rgba(0,0,0,0.05)`,
          }}
        >
          <div className="p-1.5 h-full flex flex-col">
            <div className="flex items-start justify-between gap-1">
              <p
                className="text-xs font-semibold truncate leading-tight"
                style={{ color: status.text }}
              >
                {slim ? apt.patientName.split(" ")[0] : apt.patientName}
              </p>
              {isDraggable(apt.status) && (
                <GripVertical
                  className="w-3 h-3 shrink-0 opacity-50"
                  style={{ color: status.text }}
                />
              )}
            </div>
            {!slim && (
              <p
                className="text-xs truncate leading-tight"
                style={{ color: status.text, opacity: 0.7 }}
              >
                {apt.typeName}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-auto">
              {apt.isTeleHealth ? (
                <Video className="w-3 h-3" style={{ color: status.text, opacity: 0.7 }} />
              ) : (
                <Building2 className="w-3 h-3" style={{ color: status.text, opacity: 0.7 }} />
              )}
            </div>
          </div>
        </div>
      </DraggableBlock>
    );
  }

  // ─── Day View ──────────────────────────────────────────────────────────────

  function renderDayView() {
    const dayAppts = getAppointmentsForDay(currentDate);

    return (
      <div className="glass rounded-xl overflow-hidden">
        <div className="relative" style={{ height: "700px" }}>
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

          <div className="absolute left-16 right-0 top-0 bottom-0">
            <DropDay date={currentDate} onDrop={handleDrop}>
              {dayAppts.map((apt) => renderAppointmentBlock(apt))}

              {isSameDay(currentDate, now) && timeIndicatorTop >= 0 && timeIndicatorTop <= 100 && (
                <div
                  className="absolute left-0 right-0 z-20 flex items-center"
                  style={{ top: `${timeIndicatorTop}%` }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: C.red500 }} />
                  <div className="flex-1 h-px" style={{ backgroundColor: C.red500 }} />
                </div>
              )}
            </DropDay>
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
                  style={{ color: isToday ? C.teal500 : C.navy800 }}
                >
                  {day.getDate()}
                </p>
              </div>
            );
          })}
        </div>

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

          <div className="absolute left-16 right-0 top-0 bottom-0 flex">
            {weekDays.map((day) => {
              const dayAppts = getAppointmentsForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 relative"
                  style={{ borderLeft: `1px solid ${C.slate100}` }}
                >
                  <DropDay date={day} onDrop={handleDrop}>
                    {dayAppts.map((apt) => renderAppointmentBlock(apt, true))}
                  </DropDay>
                </div>
              );
            })}
          </div>

          {timeIndicatorTop >= 0 && timeIndicatorTop <= 100 && (
            <div
              className="absolute left-16 right-0 z-20 flex items-center pointer-events-none"
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
        <div className="grid grid-cols-7" style={{ borderBottom: `1px solid ${C.slate200}` }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center py-2 text-xs font-medium" style={{ color: C.slate400 }}>
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className="min-h-24 border-b border-r" style={{ borderColor: C.slate100 }} />;
            const dayAppts = getAppointmentsForDay(day);
            const isToday = isSameDay(day, now);
            const maxVisible = 3;
            const overflow = dayAppts.length - maxVisible;

            return (
              <div
                key={day.toISOString()}
                className="min-h-24 border-b border-r relative"
                style={{ borderColor: C.slate100 }}
              >
                <DropDay date={day} onDrop={handleDrop}>
                  <button
                    onClick={() => {
                      setCurrentDate(day);
                      setViewMode("day");
                    }}
                    className="w-full h-full p-1.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <p
                      className="text-xs mb-1"
                      style={{
                        color: isToday ? C.teal500 : C.slate600,
                        fontWeight: isToday ? 700 : 500,
                      }}
                    >
                      {day.getDate()}
                    </p>
                    <div className="space-y-0.5">
                      {dayAppts.slice(0, maxVisible).map((apt) => {
                        const status = getStatusStyle(apt.status);
                        return (
                          <div
                            key={apt.id}
                            className="flex items-center gap-1 px-1 py-0.5 rounded truncate"
                            style={{
                              backgroundColor: status.bg,
                              color: status.text,
                              borderLeft: `2px solid ${apt.color}`,
                              fontSize: "10px",
                            }}
                          >
                            {apt.isTeleHealth ? (
                              <Video className="w-2.5 h-2.5 shrink-0" />
                            ) : (
                              <Building2 className="w-2.5 h-2.5 shrink-0" />
                            )}
                            <span className="truncate">{apt.patientName.split(" ")[0]}</span>
                          </div>
                        );
                      })}
                      {overflow > 0 && (
                        <p className="text-xs font-medium px-1" style={{ color: C.slate400, fontSize: "10px" }}>
                          +{overflow} more
                        </p>
                      )}
                    </div>
                  </button>
                </DropDay>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── List View ─────────────────────────────────────────────────────────────
  // Paginated week-at-a-time list of appointments — useful when providers want
  // to scan everything coming up without the visual grid.

  function renderListView() {
    const weekDays = getWeekDays(currentDate);
    const weekAppts = appointments
      .filter((a) => weekDays.some((d) => isSameDay(d, a.date)))
      .sort((a, b) => {
        const dayDiff = a.date.getTime() - b.date.getTime();
        if (dayDiff !== 0) return dayDiff;
        return a.startHour * 60 + a.startMinute - (b.startHour * 60 + b.startMinute);
      });

    if (weekAppts.length === 0) {
      return (
        <div className="glass rounded-xl p-12 text-center">
          <CalendarDays className="w-10 h-10 mx-auto mb-3" style={{ color: C.slate300 }} />
          <p className="text-sm" style={{ color: C.slate500 }}>No appointments this week.</p>
        </div>
      );
    }

    // Group by date
    const grouped: Record<string, CalendarAppointment[]> = {};
    for (const apt of weekAppts) {
      const key = apt.date.toDateString();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(apt);
    }

    return (
      <div className="glass rounded-xl divide-y" style={{ borderColor: C.slate100 }}>
        {Object.entries(grouped).map(([dateKey, appts]) => {
          const date = new Date(dateKey);
          const isToday = isSameDay(date, now);
          return (
            <div key={dateKey} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <p
                  className="text-sm font-semibold"
                  style={{ color: isToday ? C.teal500 : C.navy800 }}
                >
                  {date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </p>
                {isToday && (
                  <span
                    className="px-2 py-0.5 rounded text-xs font-semibold"
                    style={{ backgroundColor: C.teal50, color: C.teal600 }}
                  >
                    Today
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {appts.map((apt) => {
                  const status = getStatusStyle(apt.status);
                  return (
                    <button
                      key={apt.id}
                      onClick={() => handleAppointmentClick(apt.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-slate-50"
                      style={{ border: `1px solid ${C.slate200}` }}
                    >
                      <div
                        className="w-1 self-stretch rounded-full"
                        style={{ backgroundColor: apt.color }}
                      />
                      <div className="w-20 shrink-0">
                        <p className="text-sm font-semibold" style={{ color: C.navy800 }}>
                          {formatTime(apt.startHour, apt.startMinute)}
                        </p>
                        <p className="text-xs" style={{ color: C.slate400 }}>
                          {apt.durationMinutes} min
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: C.navy800 }}>
                          {apt.patientName}
                        </p>
                        <p className="text-xs truncate" style={{ color: C.slate500 }}>
                          {apt.typeName} · {apt.providerName}
                        </p>
                      </div>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium shrink-0"
                        style={{
                          backgroundColor: apt.isTeleHealth ? "#ede9fe" : C.slate100,
                          color: apt.isTeleHealth ? "#7c3aed" : C.slate600,
                        }}
                      >
                        {apt.isTeleHealth ? <Video className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                        {apt.isTeleHealth ? "Telehealth" : "On-Site"}
                      </span>
                      <span
                        className="px-2 py-1 rounded text-xs font-semibold shrink-0"
                        style={{ backgroundColor: status.bg, color: status.text }}
                      >
                        {status.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
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
            {(["day", "week", "month", "list"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-3 py-1.5 text-xs font-medium capitalize transition-colors flex items-center gap-1"
                style={{
                  backgroundColor: viewMode === mode ? C.teal500 : C.white,
                  color: viewMode === mode ? C.white : C.slate500,
                }}
              >
                {mode === "list" && <List className="w-3 h-3" />}
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

      {/* Status banners — loading / error / reschedule failure */}
      {loading && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: C.slate50, color: C.slate500 }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading appointments…
        </div>
      )}
      {error && !loading && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#fef2f2", color: "#b91c1c", border: `1px solid #fecaca` }}>
          Couldn't load appointments: {error}
        </div>
      )}
      {reschedFailed && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#fef2f2", color: "#b91c1c", border: `1px solid #fecaca` }}>
          Reschedule failed: {reschedFailed}
        </div>
      )}

      {/* Calendar Content */}
      {viewMode === "day" && renderDayView()}
      {viewMode === "week" && renderWeekView()}
      {viewMode === "month" && renderMonthView()}
      {viewMode === "list" && renderListView()}

      {/* Status legend */}
      <div className="glass rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="font-semibold" style={{ color: C.slate600 }}>Status:</span>
          {Object.entries(STATUS_COLORS).map(([key, s]) => (
            <span key={key} className="flex items-center gap-1.5" style={{ color: C.slate500 }}>
              <span
                className="inline-block w-3 h-3 rounded"
                style={{ backgroundColor: s.bg, borderLeft: `2px solid ${s.border}` }}
              />
              {s.label}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: C.slate400 }}>
          <span className="flex items-center gap-1.5">
            <Video className="w-3 h-3" /> Telehealth
          </span>
          <span className="flex items-center gap-1.5">
            <Building2 className="w-3 h-3" /> On-Site
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Block height = duration
          </span>
          <span className="flex items-center gap-1.5">
            <GripVertical className="w-3 h-3" /> Drag to reschedule
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: C.red500 }} />
            Current time
          </span>
        </div>
      </div>

      {/* Built-in appointment detail modal — host can suppress by
          returning true from onAppointmentClick. */}
      {detailFor && (
        <div
          onClick={() => setDetailFor(null)}
          style={{
            position: "fixed", inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(4px)",
            zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: C.white, borderRadius: "12px",
              maxWidth: "440px", width: "100%",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.slate200}` }}>
              <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: C.slate400 }}>
                {getStatusStyle(detailFor.status).label}
              </p>
              <h3 className="text-base font-semibold" style={{ color: C.navy800 }}>
                {detailFor.patientName}
              </h3>
              <p className="text-sm mt-0.5" style={{ color: C.slate500 }}>
                {detailFor.typeName} · {detailFor.providerName}
              </p>
            </div>
            <div style={{ padding: "14px 18px" }}>
              <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
                <dt style={{ color: C.slate400 }}>When</dt>
                <dd style={{ color: C.navy700 }}>
                  {detailFor.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {" · "}
                  {formatTime(detailFor.startHour, detailFor.startMinute)}
                </dd>
                <dt style={{ color: C.slate400 }}>Duration</dt>
                <dd style={{ color: C.navy700 }}>{detailFor.durationMinutes} min</dd>
                <dt style={{ color: C.slate400 }}>Format</dt>
                <dd style={{ color: C.navy700 }}>{detailFor.isTeleHealth ? "Telehealth" : "On-site"}</dd>
              </dl>
              {detailMsg && (
                <p className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#fef2f2", color: "#b91c1c" }}>
                  {detailMsg}
                </p>
              )}
            </div>
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.slate200}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setDetailFor(null)}
                className="px-3 py-2 text-sm font-medium rounded-lg hover:bg-slate-100"
                style={{ color: C.slate600 }}
              >
                Close
              </button>
              {!["cancelled", "completed", "no_show"].includes(detailFor.status) && (
                <>
                  <button
                    onClick={() => cancelAppointment(detailFor.id)}
                    disabled={detailBusy}
                    className="px-3 py-2 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
                    style={{ color: C.red500, border: `1px solid ${C.slate200}` }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => markComplete(detailFor.id)}
                    disabled={detailBusy}
                    className="px-3 py-2 text-sm font-semibold rounded-lg disabled:opacity-50"
                    style={{ color: C.navy700, border: `1px solid ${C.slate200}` }}
                  >
                    Mark complete
                  </button>
                  {detailFor.isTeleHealth && (
                    <button
                      onClick={() => joinTelehealth(detailFor.id)}
                      disabled={detailBusy}
                      className="px-3 py-2 text-sm font-semibold rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50"
                      style={{ backgroundColor: C.teal500 }}
                    >
                      <Video className="w-3.5 h-3.5" /> Join video
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CalendarView(props: CalendarViewProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <CalendarViewInner {...props} />
    </DndProvider>
  );
}
