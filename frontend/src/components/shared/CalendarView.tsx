// ===== CalendarView =====
// Day / Week / Month / List calendar with appointment blocks.
// Color-coded by status (mirrors EnnHealth's status palette).
// Drag-and-drop reschedule between days (week + month views).
//
// Drag-drop powered by react-dnd. The component wraps its content in a
// DndProvider so callers don't have to.

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { apiFetch, telehealthService, providerService } from "../../lib/api";

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
  providerId: string | null;
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
  /** null = patient self-booked, awaiting staff confirmation.
   *  Non-null = staff confirmed timestamp. */
  confirmedAt?: string | null;
  /** True when this row is part of a recurring series — either the
   *  parent (recurrence_rule set) or a child (parent_appointment_id
   *  set). Drives "Skip this week" and "Apply to series" UI. */
  isRecurring?: boolean;
}

/**
 * Personal-calendar event imported from the provider's external
 * iCal feed (Google/Apple/Outlook). Rendered as a gray, non-
 * clickable block on the calendar grid so the practice can see
 * when the provider is unavailable. Title is intentionally never
 * shown — patient-facing surfaces and admins both see "Busy".
 */
interface BusyBlock {
  id: string;
  providerId: string;
  providerName: string;
  date: Date;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  allDay: boolean;
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
  const confirmedAt = api.confirmedAt ?? api.confirmed_at ?? null;
  const parentId = api.parentAppointmentId ?? api.parent_appointment_id ?? null;
  const recurrenceRule = api.recurrenceRule ?? api.recurrence_rule ?? null;
  const isRecurring = !!(parentId || recurrenceRule);
  return {
    id: api.id,
    patientName,
    providerId: api.providerId ?? api.provider_id ?? api.provider?.id ?? null,
    providerName,
    typeName: t?.name ?? "Appointment",
    date: dt,
    startHour: dt.getHours(),
    startMinute: dt.getMinutes(),
    durationMinutes: duration,
    isTeleHealth,
    color: t?.color ?? DEFAULT_TYPE_COLOR,
    status: api.status,
    confirmedAt,
    isRecurring,
  };
}

// ─── Time Helpers ────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7 AM to 7 PM
const SLOT_MINUTES = 15;
const SLOTS_PER_HOUR = 60 / SLOT_MINUTES; // 4
// Day grid is 13 hours × 4 quarter-hour slots = 52 cells.
const SLOTS_PER_DAY = HOURS.length * SLOTS_PER_HOUR;
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
  onContextMenu,
}: {
  appointment: CalendarAppointment;
  children: React.ReactNode;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
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
      onClick={(e) => {
        // Stop propagation so the click doesn't also fire on the
        // underlying empty time-slot's onClick (which would open
        // quick-create at the same time).
        e.stopPropagation();
        onClick?.();
      }}
      onContextMenu={onContextMenu}
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

// ─── Drop slot — per 15-minute cell. ────────────────────────────────
// Empty time slots are clickable (opens quick-create) AND droppable
// (drag an appointment block onto a different time, not just day).
// Renders a small Plus icon on hover. EnnHealth pattern, ported.
function DropTimeSlot({
  date,
  hour,
  minute,
  onDrop,
  onClick,
}: {
  date: Date;
  hour: number;
  minute: number;
  onDrop: (item: DragItem, date: Date, hour: number, minute: number) => void;
  onClick: (date: Date, hour: number, minute: number) => void;
}) {
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: DRAG_TYPE,
      drop: (item: DragItem) => onDrop(item, date, hour, minute),
      canDrop: (item: DragItem) => {
        // Block dropping on the slot the block is already in.
        if (!isSameDay(item.originalDate, date)) return true;
        return item.originalDate.getHours() !== hour
          || item.originalDate.getMinutes() !== minute;
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }),
    }),
    [date, hour, minute, onDrop]
  );

  const isOnTheHour = minute === 0;
  return (
    <div
      ref={(node) => { if (node) drop(node); }}
      onClick={() => onClick(date, hour, minute)}
      title={`Click to create at ${formatTime(hour, minute)}`}
      style={{
        flex: 1,
        borderTop: isOnTheHour
          ? `1px solid ${C.slate200}`
          : `1px dashed ${C.slate100}`,
        backgroundColor: isOver && canDrop ? "rgba(39, 171, 131, 0.12)" : "transparent",
        cursor: "pointer",
        position: "relative",
      }}
      className="group"
    >
      {/* Hover plus indicator — appears only over empty cells. */}
      <div
        className="absolute opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ top: 1, right: 2, fontSize: 11, color: C.slate400 }}
      >
        +
      </div>
    </div>
  );
}

// ─── Context-menu item — small helper to keep the menu JSX tidy. ────────
function CtxMenuItem({
  children, onClick, danger = false,
}: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-xs rounded transition-colors hover:bg-slate-100"
      style={{
        color: danger ? "#dc2626" : "#243b53",
      }}
    >
      {children}
    </button>
  );
}

// ─── Quick-create dialog ────────────────────────────────────────────────
// Opened when the user clicks an empty time slot. Minimal form:
// patient + provider + duration. Type is optional (the patient picks
// reason later in their portal). Posts to /appointments and closes.
function QuickCreateDialog({
  slot,
  onClose,
  onCreated,
}: {
  slot: { date: Date; hour: number; minute: number };
  onClose: () => void;
  onCreated: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [patients, setPatients] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [providers, setProviders] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [facilities, setFacilities] = useState<any[]>([]);
  const [patientId, setPatientId] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("");
  const [facilityId, setFacilityId] = useState<string>("");
  const [duration, setDuration] = useState<number>(30);
  const [isTelehealth, setIsTelehealth] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [pRes, prRes, fRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiFetch<any>("/patients?per_page=200"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiFetch<any>("/providers"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiFetch<any>("/facilities"),
      ]);
      if (cancelled) return;
      // Patients are paginated; providers + facilities are flat.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pList: any[] = Array.isArray(pRes.data)
        ? pRes.data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : Array.isArray((pRes.data as any)?.data)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (pRes.data as any).data
          : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prList: any[] = Array.isArray(prRes.data)
        ? prRes.data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : Array.isArray((prRes.data as any)?.data)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (prRes.data as any).data
          : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fList: any[] = Array.isArray(fRes.data)
        ? fRes.data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : Array.isArray((fRes.data as any)?.data)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (fRes.data as any).data
          : [];
      setPatients(pList);
      setProviders(prList);
      // Filter to active facilities only — single-facility practice
      // ends up with 1 item and the picker stays hidden.
      const activeFacilities = fList.filter((f) => f.isActive !== false && f.is_active !== false);
      setFacilities(activeFacilities);
      if (prList.length === 1) setProviderId(prList[0].id);
      // Auto-pick the primary facility (or the only one).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const primary = activeFacilities.find((f: any) => f.isPrimary || f.is_primary)
        ?? activeFacilities[0];
      if (primary) setFacilityId(primary.id);
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit() {
    if (!patientId || !providerId) {
      setError("Pick a patient and a provider.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const dt = new Date(
      slot.date.getFullYear(), slot.date.getMonth(), slot.date.getDate(),
      slot.hour, slot.minute, 0, 0,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>("/appointments", {
      method: "POST",
      body: JSON.stringify({
        patient_id: patientId,
        provider_id: providerId,
        // Telehealth visits don't need a facility; in-person visits at
        // multi-facility practices send the picked id; single-facility
        // practices send the auto-picked primary.
        facility_id: isTelehealth ? null : (facilityId || null),
        scheduled_at: dt.toISOString(),
        duration_minutes: duration,
        is_telehealth: isTelehealth,
        notes: notes.trim() || null,
      }),
    });
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onCreated();
  }

  const patientName = (p: { firstName?: string; first_name?: string; lastName?: string; last_name?: string }) => {
    const f = p.firstName ?? p.first_name ?? "";
    const l = p.lastName ?? p.last_name ?? "";
    return `${f} ${l}`.trim() || "Unnamed";
  };
  const providerName = (p: { user?: { firstName?: string; first_name?: string; lastName?: string; last_name?: string; name?: string } | null; firstName?: string; first_name?: string; lastName?: string; last_name?: string }) => {
    const u = p.user;
    if (u?.name) return u.name;
    const f = u?.firstName ?? u?.first_name ?? p.firstName ?? p.first_name ?? "";
    const l = u?.lastName ?? u?.last_name ?? p.lastName ?? p.last_name ?? "";
    return `${f} ${l}`.trim() || "Provider";
  };

  return (
    <div
      onClick={onClose}
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
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          maxWidth: "480px",
          width: "100%",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #e2e8f0" }}>
          <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: "#94a3b8" }}>
            New appointment
          </p>
          <h3 className="text-base font-semibold" style={{ color: "#243b53" }}>
            {slot.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            {" · "}
            {formatTime(slot.hour, slot.minute)}
          </h3>
        </div>
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Patient</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: "#e2e8f0" }}
            >
              <option value="">Select patient…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{patientName(p)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Provider</label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: "#e2e8f0" }}
            >
              <option value="">Select provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{providerName(p)}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <div style={{ flex: 1 }}>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: "#e2e8f0" }}
              >
                {[15, 20, 30, 45, 60, 75, 90].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end" }}>
              <label className="flex items-center gap-2 text-sm cursor-pointer pb-2" style={{ color: "#475569" }}>
                <input
                  type="checkbox"
                  checked={isTelehealth}
                  onChange={(e) => setIsTelehealth(e.target.checked)}
                />
                Telehealth
              </label>
            </div>
          </div>
          {/* Facility picker — only renders when the practice has 2+
              active facilities AND the visit isn't telehealth.
              Single-facility practices auto-pick their primary and
              the field stays hidden (no extra UI noise). */}
          {!isTelehealth && facilities.length > 1 && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Location</label>
              <select
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: "#e2e8f0" }}
              >
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}{(f.isPrimary || f.is_primary) ? " (primary)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Notes <span style={{ color: "#94a3b8" }}>(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ borderColor: "#e2e8f0" }}
            />
          </div>
          {error && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#fef2f2", color: "#b91c1c" }}>{error}</div>
          )}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium rounded-lg hover:bg-slate-100"
            style={{ color: "#475569" }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: "#27ab83" }}
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit dialog ────────────────────────────────────────────────────────
// Opened from the right-click context menu's "Edit" item. Lets the
// admin tweak date / time / duration / notes without going through
// the multi-step booking widget. Uses PUT /appointments/{id} (the
// generic update — reschedule endpoint is reserved for time-only
// changes that fire emails, which the admin may not always want
// when correcting a typo).
function EditAppointmentDialog({
  appointment,
  onClose,
  onSaved,
}: {
  appointment: CalendarAppointment;
  onClose: () => void;
  onSaved: (a: CalendarAppointment) => void;
}) {
  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmtTime = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const [date, setDate] = useState(fmtDate(appointment.date));
  const [time, setTime] = useState(fmtTime(appointment.startHour, appointment.startMinute));
  const [duration, setDuration] = useState(appointment.durationMinutes);
  const [isTelehealth, setIsTelehealth] = useState(appointment.isTeleHealth);
  // Series-edit toggle — only meaningful when this appointment is
  // recurring. Applies non-time fields (duration, telehealth flag,
  // notes) to this AND all future occurrences. Time-of-day shifts
  // intentionally stay single-row only because every occurrence
  // would need its own availability re-check.
  const [applyToSeries, setApplyToSeries] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSubmitting(true);
    setError(null);
    const [h, m] = time.split(":").map(Number);
    const [y, mo, d] = date.split("-").map(Number);
    const dt = new Date(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, m ?? 0, 0, 0);
    if (isNaN(dt.getTime())) {
      setSubmitting(false);
      setError("Invalid date or time.");
      return;
    }

    // Step 1 — always update THIS row (date/time can only apply to
    // a single occurrence; series-wide time shifts aren't supported
    // here).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>(`/appointments/${appointment.id}`, {
      method: "PUT",
      body: JSON.stringify({
        scheduled_at: dt.toISOString(),
        duration_minutes: duration,
        is_telehealth: isTelehealth,
      }),
    });
    if (res.error) {
      setSubmitting(false);
      setError(res.error);
      return;
    }

    // Step 2 — if "apply to series" is checked, propagate the
    // non-time fields (duration + telehealth) to all future siblings
    // via the dedicated /series endpoint. Time-of-day stays per-row
    // since the future occurrences are at different absolute dates.
    if (applyToSeries && appointment.isRecurring) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r2 = await apiFetch<any>(`/appointments/${appointment.id}/series`, {
        method: "PUT",
        body: JSON.stringify({
          duration_minutes: duration,
          is_telehealth: isTelehealth,
        }),
      });
      if (r2.error) {
        // Don't roll back — the single-row update succeeded; the
        // series update is a best-effort follow-on. Surface the
        // partial failure so the user knows.
        setSubmitting(false);
        setError(`This visit was updated, but applying to the series failed: ${r2.error}`);
        return;
      }
    }

    setSubmitting(false);
    onSaved({
      ...appointment,
      date: dt,
      startHour: dt.getHours(),
      startMinute: dt.getMinutes(),
      durationMinutes: duration,
      isTeleHealth: isTelehealth,
    });
  }

  return (
    <div
      onClick={onClose}
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
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          maxWidth: "440px",
          width: "100%",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #e2e8f0" }}>
          <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: "#94a3b8" }}>Edit appointment</p>
          <h3 className="text-base font-semibold" style={{ color: "#243b53" }}>{appointment.patientName}</h3>
          <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>{appointment.typeName} · {appointment.providerName}</p>
        </div>
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: "#e2e8f0" }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: "#e2e8f0" }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: "#e2e8f0" }}
            >
              {[15, 20, 30, 45, 60, 75, 90].map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "#475569" }}>
            <input
              type="checkbox"
              checked={isTelehealth}
              onChange={(e) => setIsTelehealth(e.target.checked)}
            />
            Telehealth visit
          </label>
          {/* Series-edit toggle — only when this row is part of a
              recurring series. Date/time still applies only to this
              occurrence; duration + telehealth flag propagate. */}
          {appointment.isRecurring && (
            <label
              className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded-lg"
              style={{ color: "#475569", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}
            >
              <input
                type="checkbox"
                checked={applyToSeries}
                onChange={(e) => setApplyToSeries(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">Apply duration + format to all future occurrences</span>
                <br />
                <span style={{ color: "#94a3b8" }}>
                  Date and time still apply only to this visit. Past occurrences are untouched.
                </span>
              </span>
            </label>
          )}
          {error && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#fef2f2", color: "#b91c1c" }}>{error}</div>
          )}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium rounded-lg hover:bg-slate-100"
            style={{ color: "#475569" }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: "#27ab83" }}
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

function CalendarViewInner({ onAppointmentClick, onBookNew, onReschedule }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  // External busy blocks fetched per provider seen in the appointment
  // payload. Rendered as gray non-clickable strips alongside real
  // appointments so admins can see when a provider is unavailable
  // due to a personal-calendar event.
  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[]>([]);
  // Toolbar filters — client-side narrow on the already-fetched window.
  // "all" = no filter for that dimension. Provider id "all" leaves the
  // dropdown showing all unique providers in the visible appointments.
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterFormat, setFilterFormat] = useState<"all" | "telehealth" | "in_office">("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  // Toggle: when true, only show appointments awaiting staff
  // confirmation (confirmedAt === null AND not cancelled / completed).
  // Wired to the "N awaiting approval" badge in the toolbar.
  const [filterPending, setFilterPending] = useState(false);
  // Drag-to-resize state — held in a ref because the pointermove
  // handler runs at a much higher rate than React's state update
  // cadence; we only commit to state on snap or release.
  const resizeRef = useRef<{
    id: string;
    startY: number;
    pixelsPerMinute: number;
    originalDuration: number;
    currentDuration: number;
  } | null>(null);
  // The "preview" duration (snapped to 15-min) shown DURING a drag —
  // committed to state so the block visibly grows/shrinks as the
  // user drags. Cleared on pointer-up.
  const [resizingPreview, setResizingPreview] = useState<{
    id: string; durationMinutes: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reschedFailed, setReschedFailed] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<CalendarAppointment | null>(null);
  const [editFor, setEditFor] = useState<CalendarAppointment | null>(null);
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

  // Patient self-booked appointments land with confirmedAt=null;
  // staff approves via POST /appointments/{id}/confirm. Deny is a
  // soft-DELETE with a "denied by staff" cancel reason so the row
  // stays in the audit trail with a clear paper-trail of why.
  async function approveAppointment(id: string) {
    setDetailBusy(true);
    setDetailMsg(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>(`/appointments/${id}/confirm`, { method: "POST" });
    setDetailBusy(false);
    if (res.error) {
      setDetailMsg(res.error);
      return;
    }
    setAppointments((prev) => prev.map((a) =>
      a.id === id
        ? { ...a, status: "confirmed", confirmedAt: new Date().toISOString() }
        : a
    ));
    setDetailFor(null);
  }

  async function denyAppointment(id: string) {
    const reason = window.prompt("Reason for denying this appointment (visible to the patient):")?.trim();
    if (!reason) return;
    setDetailBusy(true);
    setDetailMsg(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>(`/appointments/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ cancel_reason: `Denied by staff: ${reason}` }),
    });
    setDetailBusy(false);
    if (res.error) {
      setDetailMsg(res.error);
      return;
    }
    setAppointments((prev) => prev.map((a) =>
      a.id === id ? { ...a, status: "cancelled" } : a
    ));
    setDetailFor(null);
  }

  // Skip a single occurrence in a recurring series — soft-delete with
  // reason="skipped" so the row is preserved for audit (the series
  // continues; only this date is dropped).
  async function skipOccurrence(id: string) {
    if (!window.confirm("Skip this occurrence? The rest of the recurring series stays scheduled.")) return;
    setDetailBusy(true);
    setDetailMsg(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>(`/appointments/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ cancel_reason: "Skipped (recurring series continues)" }),
    });
    setDetailBusy(false);
    if (res.error) {
      setDetailMsg(res.error);
      return;
    }
    setAppointments((prev) => prev.map((a) =>
      a.id === id ? { ...a, status: "cancelled" } : a
    ));
    setDetailFor(null);
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

  // ─── Fetch appointments — exposed as `reload` so post-create /
  //     post-edit handlers can refresh without remounting.
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      date_from: range.from,
      date_to: range.to,
      per_page: "200",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>(`/appointments?${qs.toString()}`);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      setAppointments([]);
      return;
    }
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
    const mapped = items.map(mapAppointment).filter((a): a is CalendarAppointment => a !== null);
    setAppointments(mapped);

    // Pull busy blocks (personal-calendar imports) for every provider
    // visible in the appointment list. A provider with no personal
    // calendar configured returns an empty array — no harm. Failures
    // don't block the appointment grid; we just render zero blocks.
    const providerIdToName = new Map<string, string>();
    mapped.forEach((a) => {
      if (a.providerId) providerIdToName.set(a.providerId, a.providerName);
    });

    if (providerIdToName.size === 0) {
      setBusyBlocks([]);
    } else {
      const tasks = Array.from(providerIdToName.entries()).map(async ([pid, pname]) => {
        const r = await providerService.getBusyBlocks(pid, range.from, range.to);
        if (!r.data) return [] as BusyBlock[];
        return r.data.map((b): BusyBlock | null => {
          const start = new Date(b.starts_at);
          const end = new Date(b.ends_at);
          if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
          const durationMinutes = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
          return {
            id: b.id,
            providerId: pid,
            providerName: pname,
            date: start,
            startHour: start.getHours(),
            startMinute: start.getMinutes(),
            durationMinutes,
            allDay: !!b.all_day,
          };
        }).filter((b): b is BusyBlock => b !== null);
      });
      const all = (await Promise.all(tasks)).flat();
      setBusyBlocks(all);
    }
  }, [range.from, range.to]);

  useEffect(() => { void reload(); }, [reload]);

  // ─── Reschedule Handler ────────────────────────────────────────────────────
  // Optimistic local update + API PATCH to /reschedule. On failure we roll
  // back and surface the server's validation error.
  //
  // Accepts optional hour+minute — when provided (drop on a per-15-min
  // slot), the appointment moves to that exact time. When omitted (legacy
  // drop-on-day target), keeps the original time-of-day.
  const handleDrop = useCallback(
    (item: DragItem, newDate: Date, newHour?: number, newMinute?: number) => {
      const original = appointments.find((a) => a.id === item.id);
      if (!original) return;
      const newDateTime = new Date(
        newDate.getFullYear(), newDate.getMonth(), newDate.getDate(),
        newHour ?? original.startHour, newMinute ?? original.startMinute,
      );

      // Optimistic update.
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === item.id
            ? {
                ...a,
                date: newDateTime,
                startHour: newDateTime.getHours(),
                startMinute: newDateTime.getMinutes(),
              }
            : a
        )
      );

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
            prev.map((a) => (a.id === item.id ? { ...a, date: original.date, startHour: original.startHour, startMinute: original.startMinute } : a))
          );
          setReschedFailed(res.error);
          window.setTimeout(() => setReschedFailed(null), 5000);
        }
      })();

      onReschedule?.(item.id, newDateTime);
    },
    [appointments, onReschedule]
  );

  // ─── Quick-create dialog state — fires when user clicks an empty slot.
  const [quickCreate, setQuickCreate] = useState<{
    date: Date; hour: number; minute: number;
  } | null>(null);
  const handleSlotClick = useCallback((date: Date, hour: number, minute: number) => {
    setQuickCreate({ date, hour, minute });
  }, []);

  // ─── Right-click context menu state ──────────────────────────────────────
  // Custom inline menu (no shadcn dependency). Positioned at click coords.
  const [ctxMenu, setCtxMenu] = useState<{
    appointment: CalendarAppointment;
    x: number;
    y: number;
  } | null>(null);
  // Dismiss on any click outside or Escape.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  function openContextMenu(apt: CalendarAppointment, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ appointment: apt, x: e.clientX, y: e.clientY });
  }

  // ─── Drag-to-resize ───────────────────────────────────────────────────
  // Started by pointer-down on the small handle at the bottom of an
  // appointment block. We capture the starting Y, the "px per minute"
  // ratio derived from the day grid height, and the original duration.
  // pointermove updates the preview duration in 15-min snaps; pointerup
  // commits via PUT /appointments/{id} with the new duration_minutes.
  function startResize(apt: CalendarAppointment, e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    // Walk up to find the day-column element so we can read its
    // pixel height (covers 13 hours = 13 * 60 minutes).
    let el: HTMLElement | null = e.currentTarget.parentElement;
    while (el && !el.dataset.daygrid) el = el.parentElement;
    const gridHeight = el?.clientHeight ?? 650;
    const pxPerMinute = gridHeight / (13 * 60);
    resizeRef.current = {
      id: apt.id,
      startY: e.clientY,
      pixelsPerMinute: pxPerMinute,
      originalDuration: apt.durationMinutes,
      currentDuration: apt.durationMinutes,
    };
    setResizingPreview({ id: apt.id, durationMinutes: apt.durationMinutes });

    const onMove = (ev: PointerEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const deltaPx = ev.clientY - r.startY;
      const deltaMin = deltaPx / r.pixelsPerMinute;
      // Snap to 15-min increments; min 15, max 480.
      let next = Math.round((r.originalDuration + deltaMin) / 15) * 15;
      next = Math.max(15, Math.min(480, next));
      r.currentDuration = next; // <- ref tracks the live value
      setResizingPreview({ id: r.id, durationMinutes: next });
    };
    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const r = resizeRef.current;
      resizeRef.current = null;
      if (!r) return;
      const finalDuration = r.currentDuration;
      if (finalDuration === r.originalDuration) {
        setResizingPreview(null);
        return;
      }
      // Optimistic update on the appointment.
      setAppointments((prev) => prev.map((a) =>
        a.id === r.id ? { ...a, durationMinutes: finalDuration } : a
      ));
      setResizingPreview(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await apiFetch<any>(`/appointments/${r.id}`, {
        method: "PUT",
        body: JSON.stringify({ duration_minutes: finalDuration }),
      });
      if (res.error) {
        // Roll back on conflict or validation fail.
        setAppointments((prev) => prev.map((a) =>
          a.id === r.id ? { ...a, durationMinutes: r.originalDuration } : a
        ));
        setReschedFailed(res.error);
        window.setTimeout(() => setReschedFailed(null), 5000);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  function navigate(dir: -1 | 1) {
    const d = new Date(currentDate);
    if (viewMode === "day") d.setDate(d.getDate() + dir);
    else if (viewMode === "week" || viewMode === "list") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  }

  // ─── Keyboard nav — global shortcuts when no input is focused. ───────
  // ←/→  paginate by view granularity
  // T    today
  // D/W/M/L  switch view
  // Esc  close topmost open dialog (ctx menu, edit, quick-create, detail)
  useEffect(() => {
    const isTextEditing = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextEditing(e.target)) return;

      if (e.key === "Escape") {
        if (ctxMenu) { setCtxMenu(null); return; }
        if (editFor) { setEditFor(null); return; }
        if (quickCreate) { setQuickCreate(null); return; }
        if (detailFor) { setDetailFor(null); return; }
        return;
      }

      // Skip nav keys while any modal is open — Esc is the explicit
      // close. Avoids paginating the calendar behind a focused dialog.
      if (detailFor || editFor || quickCreate || ctxMenu) return;

      switch (e.key) {
        case "ArrowLeft":  e.preventDefault(); navigate(-1); break;
        case "ArrowRight": e.preventDefault(); navigate(1); break;
        case "t": case "T": e.preventDefault(); setCurrentDate(new Date()); break;
        case "d": case "D": e.preventDefault(); setViewMode("day"); break;
        case "w": case "W": e.preventDefault(); setViewMode("week"); break;
        case "m": case "M": e.preventDefault(); setViewMode("month"); break;
        case "l": case "L": e.preventDefault(); setViewMode("list"); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // currentDate / viewMode change every key press; intentionally
    // omit so the listener stays stable. The handler closes over
    // setters which are referentially stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxMenu, editFor, quickCreate, detailFor]);

  function goToday() {
    setCurrentDate(new Date());
  }

  // ─── Filter appointments ──────────────────────────────────────────────────
  // Filters apply BEFORE the day-bucketing so the count badges on the
  // toolbar reflect what's actually rendered. List of providers /
  // statuses for the filter dropdowns is derived from the visible
  // window so the dropdown never offers options that have zero matches.
  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (filterProvider !== "all" && a.providerName !== filterProvider) return false;
      if (filterFormat === "telehealth" && !a.isTeleHealth) return false;
      if (filterFormat === "in_office" && a.isTeleHealth) return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (filterPending) {
        if (a.confirmedAt) return false;
        if (["cancelled", "completed", "no_show"].includes(a.status)) return false;
      }
      return true;
    });
  }, [appointments, filterProvider, filterFormat, filterStatus, filterPending]);

  const pendingCount = useMemo(
    () => appointments.filter((a) =>
      !a.confirmedAt
      && !["cancelled", "completed", "no_show"].includes(a.status)
    ).length,
    [appointments]
  );

  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach((a) => set.add(a.providerName));
    return Array.from(set).sort();
  }, [appointments]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach((a) => set.add(a.status));
    return Array.from(set).sort();
  }, [appointments]);

  function getAppointmentsForDay(date: Date): CalendarAppointment[] {
    return filteredAppointments.filter((a) => isSameDay(a.date, date));
  }

  // Honor the provider filter for busy blocks too — when an admin
  // filters down to one provider, we only show that provider's
  // personal-calendar blocks.
  function getBusyBlocksForDay(date: Date): BusyBlock[] {
    return busyBlocks.filter((b) => {
      if (filterProvider !== "all" && b.providerName !== filterProvider) return false;
      return isSameDay(b.date, date);
    });
  }

  // Render a single gray busy block. Same time math as
  // renderAppointmentBlock so the two render in the same coordinate
  // system. Non-clickable, no dropdown — these are read-only personal
  // commitments. Z-index sits BEHIND appointments so that if an
  // appointment somehow overlaps a busy block (shouldn't happen, but
  // could during the 15-min sync lag), the appointment wins visually.
  function renderBusyBlock(b: BusyBlock) {
    const topPercent = ((b.startHour * 60 + b.startMinute - 7 * 60) / (13 * 60)) * 100;
    const heightPercent = (b.durationMinutes / (13 * 60)) * 100;
    // Skip blocks entirely outside the visible 7am-8pm window so we
    // don't render off-screen / negative-height strips.
    if (topPercent + heightPercent < 0 || topPercent > 100) return null;
    return (
      <div
        key={b.id}
        className="absolute left-1 right-1 rounded-md overflow-hidden text-left z-0"
        style={{
          top: `${Math.max(topPercent, 0)}%`,
          height: `${Math.max(heightPercent, 1.5)}%`,
          backgroundColor: "rgba(100, 116, 139, 0.18)", // slate-500 @ 18% — quiet
          backgroundImage: "repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,0.35) 6px 7px)",
          border: `1px dashed ${C.slate400}`,
          pointerEvents: "none",
        }}
        title={`${b.providerName} — Busy (personal calendar)`}
      >
        <div
          className="px-1.5 py-0.5 text-[10px] font-medium truncate"
          style={{ color: C.slate600 }}
        >
          Busy
        </div>
      </div>
    );
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
    // Render with the live drag-preview duration if this block is
    // actively being resized; otherwise its committed duration.
    const previewDuration = resizingPreview?.id === apt.id
      ? resizingPreview.durationMinutes
      : apt.durationMinutes;
    const topPercent = ((apt.startHour * 60 + apt.startMinute - 7 * 60) / (13 * 60)) * 100;
    const heightPercent = (previewDuration / (13 * 60)) * 100;
    const status = getStatusStyle(apt.status);
    const canResize = isDraggable(apt.status); // same eligibility as drag-move

    return (
      <DraggableBlock
        key={apt.id}
        appointment={apt}
        onClick={() => handleAppointmentClick(apt.id)}
        onContextMenu={(e) => openContextMenu(apt, e)}
      >
        <div
          className="absolute left-1 right-1 rounded-lg overflow-hidden text-left transition-all hover:opacity-90 z-10"
          style={{
            top: `${topPercent}%`,
            height: `${Math.max(heightPercent, 3)}%`,
            backgroundColor: status.bg,
            borderLeft: `3px solid ${apt.color}`,
            boxShadow: resizingPreview?.id === apt.id
              ? `0 0 0 2px ${C.teal500}`
              : `0 1px 2px rgba(0,0,0,0.05)`,
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
              {resizingPreview?.id === apt.id && (
                <span className="text-[10px] font-semibold ml-auto" style={{ color: status.text }}>
                  {previewDuration}m
                </span>
              )}
            </div>
          </div>
          {/* Resize handle — bottom edge. Pointer-down captures and
              starts the drag-resize flow. Stop-propagation so the
              block's onClick / drag don't also fire. */}
          {canResize && (
            <div
              onPointerDown={(e) => startResize(apt, e)}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                bottom: 0, left: 0, right: 0,
                height: 6,
                cursor: "ns-resize",
                touchAction: "none",
              }}
              title="Drag to resize duration"
            />
          )}
        </div>
      </DraggableBlock>
    );
  }

  // ─── Day View ──────────────────────────────────────────────────────────────

  function renderDayView() {
    const dayAppts = getAppointmentsForDay(currentDate);
    const dayBusy = getBusyBlocksForDay(currentDate);

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

          <div data-daygrid="day" className="absolute left-16 right-0 top-0 bottom-0">
            {/* Per-15-min slot grid as the clickable + droppable background. */}
            <div className="absolute inset-0 flex flex-col">
              {Array.from({ length: SLOTS_PER_DAY }).map((_, i) => {
                const hour = HOURS[Math.floor(i / SLOTS_PER_HOUR)];
                const minute = (i % SLOTS_PER_HOUR) * SLOT_MINUTES;
                return (
                  <DropTimeSlot
                    key={i}
                    date={currentDate}
                    hour={hour}
                    minute={minute}
                    onDrop={handleDrop}
                    onClick={handleSlotClick}
                  />
                );
              })}
            </div>
            {/* Personal-calendar busy blocks render BEHIND appointments
                so a (rare) overlap doesn't hide a real appointment. */}
            {dayBusy.map((b) => renderBusyBlock(b))}
            {/* Foreground: appointment blocks + current-time indicator. */}
            {dayAppts.map((apt) => renderAppointmentBlock(apt))}
            {isSameDay(currentDate, now) && timeIndicatorTop >= 0 && timeIndicatorTop <= 100 && (
              <div
                className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
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
              const dayBusy = getBusyBlocksForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  data-daygrid="week"
                  className="flex-1 relative"
                  style={{ borderLeft: `1px solid ${C.slate100}` }}
                >
                  {/* Background grid: 52 per-15-min slots. Each is
                      clickable (open quick-create) AND droppable
                      (target for drag-reschedule). */}
                  <div className="absolute inset-0 flex flex-col">
                    {Array.from({ length: SLOTS_PER_DAY }).map((_, i) => {
                      const hour = HOURS[Math.floor(i / SLOTS_PER_HOUR)];
                      const minute = (i % SLOTS_PER_HOUR) * SLOT_MINUTES;
                      return (
                        <DropTimeSlot
                          key={i}
                          date={day}
                          hour={hour}
                          minute={minute}
                          onDrop={handleDrop}
                          onClick={handleSlotClick}
                        />
                      );
                    })}
                  </div>
                  {/* Personal-calendar busy blocks render BEHIND
                      appointments. */}
                  {dayBusy.map((b) => renderBusyBlock(b))}
                  {/* Foreground: appointment blocks. */}
                  {dayAppts.map((apt) => renderAppointmentBlock(apt, true))}
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
    const weekAppts = filteredAppointments
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

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filters — narrow the visible appointments client-side.
              Provider list is derived from the loaded window so the
              dropdown never offers options that have zero matches. */}
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white outline-none"
            style={{ border: `1px solid ${filterProvider !== "all" ? C.teal500 : C.slate200}`, color: C.slate600 }}
            title="Filter by provider"
          >
            <option value="all">All providers</option>
            {providerOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={filterFormat}
            onChange={(e) => setFilterFormat(e.target.value as "all" | "telehealth" | "in_office")}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white outline-none"
            style={{ border: `1px solid ${filterFormat !== "all" ? C.teal500 : C.slate200}`, color: C.slate600 }}
            title="Filter by visit format"
          >
            <option value="all">All formats</option>
            <option value="telehealth">Telehealth</option>
            <option value="in_office">In-office</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white outline-none"
            style={{ border: `1px solid ${filterStatus !== "all" ? C.teal500 : C.slate200}`, color: C.slate600 }}
            title="Filter by status"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{(STATUS_COLORS[s]?.label ?? s)}</option>
            ))}
          </select>
          {(filterProvider !== "all" || filterFormat !== "all" || filterStatus !== "all" || filterPending) && (
            <button
              onClick={() => { setFilterProvider("all"); setFilterFormat("all"); setFilterStatus("all"); setFilterPending(false); }}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-slate-100"
              style={{ color: C.slate500 }}
            >
              Clear
            </button>
          )}

          {/* Pending-approval badge — clickable filter. Hides when zero
              so it doesn't clutter the toolbar in steady state. */}
          {pendingCount > 0 && (
            <button
              onClick={() => setFilterPending((v) => !v)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-full flex items-center gap-1.5 transition-colors"
              style={{
                backgroundColor: filterPending ? "#fde68a" : "#fffbeb",
                color: "#92400e",
                border: `1px solid ${filterPending ? "#f59e0b" : "#fde68a"}`,
              }}
              title={filterPending ? "Showing only pending — click to show all" : "Show only appointments awaiting approval"}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {pendingCount} awaiting approval
            </button>
          )}

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

      {/* Right-click context menu — fixed-position, dismissed on
          click-outside / Escape (wired via the useEffect above). */}
      {ctxMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 60,
            backgroundColor: C.white,
            border: `1px solid ${C.slate200}`,
            borderRadius: "8px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            minWidth: "200px",
            padding: "4px",
          }}
        >
          <div style={{ padding: "6px 10px 4px", borderBottom: `1px solid ${C.slate100}` }}>
            <p className="text-xs font-semibold truncate" style={{ color: C.navy800 }}>
              {ctxMenu.appointment.patientName}
            </p>
            <p className="text-[10px]" style={{ color: C.slate400 }}>
              {ctxMenu.appointment.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {" · "}
              {formatTime(ctxMenu.appointment.startHour, ctxMenu.appointment.startMinute)}
            </p>
          </div>
          <CtxMenuItem
            onClick={() => { setEditFor(ctxMenu.appointment); setCtxMenu(null); }}
          >
            Edit
          </CtxMenuItem>
          {ctxMenu.appointment.isTeleHealth && (
            <CtxMenuItem
              onClick={() => { joinTelehealth(ctxMenu.appointment.id); setCtxMenu(null); }}
            >
              Join video
            </CtxMenuItem>
          )}
          {!ctxMenu.appointment.confirmedAt && (
            <CtxMenuItem
              onClick={() => { approveAppointment(ctxMenu.appointment.id); setCtxMenu(null); }}
            >
              Approve
            </CtxMenuItem>
          )}
          {!["completed", "cancelled", "no_show"].includes(ctxMenu.appointment.status) && (
            <CtxMenuItem
              onClick={() => { markComplete(ctxMenu.appointment.id); setCtxMenu(null); }}
            >
              Mark complete
            </CtxMenuItem>
          )}
          {/* Recurring-only: skip this single occurrence. Useful when
              the patient is travelling one week but the series continues. */}
          {ctxMenu.appointment.isRecurring
           && !["completed", "cancelled", "no_show"].includes(ctxMenu.appointment.status) && (
            <CtxMenuItem
              onClick={() => { skipOccurrence(ctxMenu.appointment.id); setCtxMenu(null); }}
            >
              Skip this week
            </CtxMenuItem>
          )}
          <div style={{ borderTop: `1px solid ${C.slate100}`, marginTop: 4, paddingTop: 4 }}>
            <CtxMenuItem
              danger
              onClick={() => { cancelAppointment(ctxMenu.appointment.id); setCtxMenu(null); }}
            >
              Cancel
            </CtxMenuItem>
          </div>
        </div>
      )}

      {/* Quick-create dialog — opens when user clicks an empty slot. */}
      {quickCreate && (
        <QuickCreateDialog
          slot={quickCreate}
          onClose={() => setQuickCreate(null)}
          onCreated={() => {
            setQuickCreate(null);
            // Refetch by toggling a key — reuse the existing range
            // useEffect by mutating currentDate to itself.
            void reload();
          }}
        />
      )}

      {/* Edit dialog — date / time / duration / notes. */}
      {editFor && (
        <EditAppointmentDialog
          appointment={editFor}
          onClose={() => setEditFor(null)}
          onSaved={(updated) => {
            setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setEditFor(null);
          }}
        />
      )}

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
              <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: !detailFor.confirmedAt ? "#d97706" : C.slate400 }}>
                {!detailFor.confirmedAt ? "Pending approval" : getStatusStyle(detailFor.status).label}
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
                  {/* Patient self-booked — confirmedAt null = waiting
                      for staff approval. Approve flips to confirmed +
                      stamps confirmed_at; Deny soft-cancels with a
                      "Denied by staff" reason so the patient's email
                      tells them why. Once approved/denied, these
                      buttons disappear and the normal Cancel / Mark
                      complete / Join video set takes over. */}
                  {!detailFor.confirmedAt ? (
                    <>
                      <button
                        onClick={() => denyAppointment(detailFor.id)}
                        disabled={detailBusy}
                        className="px-3 py-2 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
                        style={{ color: C.red500, border: `1px solid ${C.slate200}` }}
                      >
                        Deny
                      </button>
                      <button
                        onClick={() => approveAppointment(detailFor.id)}
                        disabled={detailBusy}
                        className="px-3 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
                        style={{ backgroundColor: C.teal500 }}
                      >
                        Approve
                      </button>
                    </>
                  ) : (
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
