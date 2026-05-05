// ===== AppointmentBookingWidget =====
// 4-step appointment booking flow: Provider → Type → Date/Time → Confirm
// Includes calendar integration links on success

import { useState, useMemo, useEffect } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Video,
  Clock,
  MapPin,
  Check,
  CheckCircle,
  Calendar as CalendarIcon,
  Crown,
  Repeat,
  AlertTriangle,
} from "lucide-react";
import type { Appointment, ProviderAvailability } from "../../types";
import { appointmentService, providerService, isUsingMockData, authService, apiFetch, programService, clinicalSettingsService, patientService } from "../../lib/api";

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  navy700: "#334e68",
  navy600: "#486581",
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
  slate700: "#334155",
  white: "#ffffff",
  green50: "#ecfdf5",
  green500: "#22c55e",
  amber50: "#fffbeb",
  amber600: "#d97706",
};

// ─── Mock Data ───────────────────────────────────────────────────────────────

/** Patient's view of one of their active program enrollments —
 *  returned by GET /me/enrollments. Drives the booking widget's
 *  program-scoped provider list. assignedProvider is the practice's
 *  preferred clinician for THIS enrollment (may be null);
 *  bookableProviders is everyone attached to the program (the patient
 *  can pick anyone on the list at booking time). */
interface MyEnrollment {
  id: string;
  status: string;
  program: { id: string; name: string; description?: string | null } | null;
  assignedProvider: { id: string; firstName?: string; lastName?: string; credentials?: string | null } | null;
  bookableProviders: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    credentials?: string | null;
    specialty?: string | null;
    timezone?: string | null;
  }>;
}

interface MockProvider {
  id: string;
  name: string;
  credentials: string;
  specialty: string;
  avatarInitials: string;
  nextAvailable: string;
  /** IANA tz string ("America/New_York" etc). Authoritative for the
   *  ProviderAvailability windows. Falls back to practice tz on the
   *  backend when unset. Drives the dual-tz labels in the time picker. */
  timezone?: string | null;
}

const MOCK_PROVIDERS: MockProvider[] = [
  { id: "prov1", name: "Dr. Nageley Michel", credentials: "DNP, PMHNP", specialty: "Psychiatry", avatarInitials: "NM", nextAvailable: "Tomorrow" },
  { id: "prov2", name: "Dr. Sarah Chen", credentials: "MD", specialty: "Primary Care", avatarInitials: "SC", nextAvailable: "Mar 22" },
  { id: "prov3", name: "Dr. Robert Kim", credentials: "MD", specialty: "Pediatrics", avatarInitials: "RK", nextAvailable: "Mar 21" },
];

interface MockAppointmentType {
  id: string;
  name: string;
  durationMinutes: number;
  isTeleHealth: boolean;
  requiresMembership: boolean;
  color: string;
}

const MOCK_TYPES: Record<string, MockAppointmentType[]> = {
  prov1: [
    { id: "t1", name: "Initial Psychiatric Eval", durationMinutes: 60, isTeleHealth: true, requiresMembership: false, color: "#7c3aed" },
    { id: "t2", name: "Medication Management", durationMinutes: 30, isTeleHealth: true, requiresMembership: true, color: "#2563eb" },
    { id: "t3", name: "Therapy Follow-up", durationMinutes: 45, isTeleHealth: true, requiresMembership: true, color: "#0891b2" },
  ],
  prov2: [
    { id: "t4", name: "Annual Wellness Visit", durationMinutes: 45, isTeleHealth: false, requiresMembership: true, color: "#059669" },
    { id: "t5", name: "Sick Visit", durationMinutes: 20, isTeleHealth: false, requiresMembership: false, color: "#dc2626" },
    { id: "t6", name: "Telehealth Consultation", durationMinutes: 30, isTeleHealth: true, requiresMembership: true, color: "#7c3aed" },
  ],
  prov3: [
    { id: "t7", name: "Well-Child Check", durationMinutes: 30, isTeleHealth: false, requiresMembership: true, color: "#f59e0b" },
    { id: "t8", name: "Immunization Visit", durationMinutes: 15, isTeleHealth: false, requiresMembership: false, color: "#10b981" },
    { id: "t9", name: "Sick Visit (Pediatric)", durationMinutes: 20, isTeleHealth: false, requiresMembership: false, color: "#dc2626" },
  ],
};

const MOCK_TIME_SLOTS = [
  "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM",
];

// Staff mode adds a Step 0 (pick which patient this booking is for)
// before the four patient-mode steps. "patient" mode is the default
// and matches every existing call site.
type BookingStep = 0 | 1 | 2 | 3 | 4 | "success";

interface StaffPatientOption {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
}

interface AppointmentBookingWidgetProps {
  onClose: () => void;
  onBooked?: (appointment: Appointment) => void;
  /**
   * "patient" (default) — logged-in user is the patient. Skips Step 0,
   *  enforces the enrollment gate, and adds the telehealth-consent
   *  checkbox before booking.
   * "staff" — staff is booking on behalf of a patient. Adds Step 0
   *  (pick patient) when staffPatientId isn't provided. Skips the
   *  enrollment gate (staff can book ad-hoc — the practice may want
   *  to schedule before formally enrolling) and the telehealth
   *  consent checkbox (consent is verbal/already on file).
   */
  mode?: "patient" | "staff";
  /**
   * Staff mode only — pre-select the patient and skip Step 0. Set when
   *  staff opens the widget from a specific patient's profile so they
   *  don't have to re-pick a patient they already chose.
   */
  staffPatientId?: string;
  staffPatientName?: string;
}

export function AppointmentBookingWidget({
  onClose,
  onBooked,
  mode = "patient",
  staffPatientId,
  staffPatientName,
}: AppointmentBookingWidgetProps) {
  const isStaffMode = mode === "staff";
  // Staff mode starts at 0 (pick patient) unless a patient was
  // pre-selected via the staffPatientId prop, in which case we skip
  // straight to provider selection.
  const initialStep: BookingStep = isStaffMode && !staffPatientId ? 0 : 1;
  const [step, setStep] = useState<BookingStep>(initialStep);
  // The patient this booking is for. In patient mode this is always
  // the logged-in user (resolved by /auth/me). In staff mode it's
  // either the staffPatientId prop or whoever the staff picks at
  // Step 0.
  const [staffSelectedPatient, setStaffSelectedPatient] = useState<StaffPatientOption | null>(
    isStaffMode && staffPatientId
      ? { id: staffPatientId, name: staffPatientName ?? "" }
      : null,
  );
  const [selectedProvider, setSelectedProvider] = useState<MockProvider | null>(null);
  const [selectedType, setSelectedType] = useState<MockAppointmentType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  // When a real (API-mode) slot is picked we also stash the underlying
  // UTC instant — handleBook sends that directly so we don't have to
  // re-parse the AM/PM label and re-anchor it in browser tz, which is
  // what was causing the cross-tz booking bug.
  const [selectedSlotInstant, setSelectedSlotInstant] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFreq, setRecurrenceFreq] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [telehealthConsent, setTelehealthConsent] = useState(false);
  // Format override on the review screen — defaults to the
  // appointment_type.is_telehealth flag but the booker can flip it
  // (e.g. patient prefers telehealth for a visit type the practice
  // normally does in-office, or vice-versa). Reset whenever the
  // selected type changes so the default tracks the new type.
  const [formatOverride, setFormatOverride] = useState<"telehealth" | "in_office" | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // ─── Real-data state ─────────────────────────────────────────────────────
  // In production we replace MOCK_PROVIDERS / MOCK_TYPES with the
  // practice's actual providers + appointment types, and resolve
  // patient_id from the logged-in user. Mock state stays for demo mode.
  // Appointment types are practice-scoped on the backend, so we keep one
  // flat list (not keyed by provider) — the previous fan-out had a stale
  // closure bug where types arrived before providers and the widget showed
  // "No appointment types configured" even when the API returned types.
  const [apiProviders, setApiProviders] = useState<MockProvider[] | null>(null);
  const [apiTypes, setApiTypes] = useState<MockAppointmentType[] | null>(null);
  const [typesError, setTypesError] = useState<string | null>(null);
  // Backend StoreAppointmentRequest needs patient_id. In patient mode
  // this comes from /auth/me; in staff mode from the staffPatientId
  // prop or the patient picked on Step 0.
  const [patientId, setPatientId] = useState<string | null>(
    isStaffMode && staffPatientId ? staffPatientId : null,
  );
  // Staff mode only — patient picker state for Step 0.
  const [staffPatientSearch, setStaffPatientSearch] = useState("");
  const [staffPatientOptions, setStaffPatientOptions] = useState<StaffPatientOption[]>([]);
  const [staffPatientLoading, setStaffPatientLoading] = useState(false);
  // Provider's weekly working windows from /providers/{id}/availability.
  // Used to render only valid time slots on step 3 and to grey out days
  // the provider doesn't work in the calendar — matches the backend's
  // ProviderAvailability check in AppointmentController::store so the
  // patient can't pick a slot that the API would just reject.
  const [providerAvailability, setProviderAvailability] = useState<ProviderAvailability[] | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  // Practice tz from /auth/me — fallback when the chosen provider
  // doesn't have their own tz set yet (existing rows pre-migration).
  const [practiceTz, setPracticeTz] = useState<string | null>(null);
  // Patient's active enrollments (with assigned + bookable providers).
  // null = still loading (so we don't flash the "you must enroll" gate
  // for a beat). [] = loaded, no enrollments → block booking. Otherwise
  // → show only providers from those programs.
  const [myEnrollments, setMyEnrollments] = useState<MyEnrollment[] | null>(null);
  // If the patient has 2+ enrollments we ask them which one this visit
  // is for. Single-enrollment auto-selects.
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  // Practice-curated reasons for visit. Loaded from /clinical-settings/
  // visit_reasons; the practice admin manages this list under Practice
  // Settings → Clinical. Surfaces as a required dropdown on Step 4.
  // null = still loading; [] = none configured (we hide the dropdown
  // and fall back to free-text only).
  const [visitReasonOptions, setVisitReasonOptions] = useState<Array<{ id: string; label: string }> | null>(null);
  const [selectedVisitReason, setSelectedVisitReason] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    if (isUsingMockData()) return;
    (async () => {
      // 1) Resolve patient_id (patient mode only — in staff mode the
      //    patient is the staffPatientId prop or whoever the staff
      //    picks on Step 0). Practice tz is fetched in either mode
      //    so the slot picker has its fallback when provider tz is
      //    unset.
      try {
        const meRes = await authService.me();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meData = meRes.data as any;
        if (!isStaffMode) {
          const pid = meData?.patient?.id ?? meData?.patientId ?? null;
          if (!cancelled && pid) setPatientId(pid);
        }
        const ptz = meData?.practice?.timezone ?? null;
        if (!cancelled && ptz) setPracticeTz(ptz);
      } catch { /* ignore */ }

      // 2) Load providers + map to the widget's display shape.
      try {
        const provRes = await providerService.list();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: any[] = Array.isArray(provRes.data) ? provRes.data : (provRes.data as any)?.data || [];
        const providers: MockProvider[] = list.map((p) => {
          const first = p.firstName || p.first_name || p.user?.firstName || "";
          const last = p.lastName || p.last_name || p.user?.lastName || "";
          const name = [first, last].filter(Boolean).join(" ") || "Provider";
          const initials = ((first[0] || "") + (last[0] || "")).toUpperCase() || "??";
          return {
            id: p.id,
            name,
            credentials: p.credentials || "",
            specialty: (Array.isArray(p.specialties) ? p.specialties[0] : p.specialty) || "",
            avatarInitials: initials,
            nextAvailable: "",
            timezone: (p.timezone ?? null) as string | null,
          };
        });
        if (!cancelled) setApiProviders(providers);
      } catch { /* ignore */ }

      // 3) Load practice-scoped appointment types. Backend self-heals
      //    by seeding three defaults if the practice has none, so an
      //    empty array here is a real "nothing configured" signal.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typesRes = await apiFetch<any>("/appointment-types");
        if (cancelled) return;
        if (typesRes.error) {
          setTypesError(typesRes.error);
          setApiTypes([]);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tlist: any[] = Array.isArray(typesRes.data) ? typesRes.data : (typesRes.data as any)?.data || [];
        const mapped: MockAppointmentType[] = tlist.map((t) => ({
          id: t.id,
          name: t.name,
          durationMinutes: t.durationMinutes ?? t.duration_minutes ?? 30,
          isTeleHealth: !!(t.isTelehealth ?? t.is_telehealth),
          requiresMembership: !!(t.requiresMembership ?? t.requires_membership),
          color: t.color || "#27ab83",
        }));
        setApiTypes(mapped);
      } catch (e) {
        if (cancelled) return;
        setTypesError(e instanceof Error ? e.message : "Failed to load appointment types");
        setApiTypes([]);
      }

      // (Enrollments are fetched in a separate effect below — they
      // depend on patientId which is set asynchronously above in
      // patient mode and via prop / Step 0 in staff mode.)

      // 5) Practice-curated visit reasons. Drives the required
      //    "Reason for visit" dropdown on Step 4. Empty list = the
      //    practice hasn't configured any; we hide the dropdown and
      //    leave only the free-text notes field as a fallback.
      try {
        const vrRes = await clinicalSettingsService.list("visit_reasons");
        if (cancelled) return;
        const opts = (vrRes.data ?? [])
          .filter((r) => r.isActive !== false)
          .map((r) => ({ id: r.id, label: r.label }));
        setVisitReasonOptions(opts);
      } catch {
        if (cancelled) return;
        setVisitReasonOptions([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch active enrollments. Re-runs whenever the active patient id
  // changes — patient mode resolves it once via /auth/me; staff mode
  // sets it from the staffPatientId prop or the Step 0 picker.
  // Endpoint differs per mode (/me/enrollments vs
  // /patients/{id}/enrollments) but the payload shape is identical so
  // the parser is shared.
  useEffect(() => {
    if (isUsingMockData()) return;
    if (!patientId) {
      // No patient resolved yet (staff mode pre-Step-0). Don't show
      // the "no enrollments" gate; just leave the state as null so
      // Step 1 renders the "loading" skeleton.
      setMyEnrollments(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const enrollRes = isStaffMode
          ? await programService.patientEnrollments(patientId)
          : await programService.myEnrollments();
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: any[] = Array.isArray(enrollRes.data) ? enrollRes.data : (enrollRes.data as any)?.data || [];
        const mapped: MyEnrollment[] = list.map((e) => ({
          id: e.id,
          status: e.status,
          program: e.program ? { id: e.program.id, name: e.program.name, description: e.program.description } : null,
          assignedProvider: e.assignedProvider
            ? {
                id: e.assignedProvider.id,
                firstName: e.assignedProvider.firstName ?? e.assignedProvider.first_name ?? "",
                lastName: e.assignedProvider.lastName ?? e.assignedProvider.last_name ?? "",
                credentials: e.assignedProvider.credentials ?? null,
              }
            : null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          bookableProviders: (e.bookableProviders ?? e.bookable_providers ?? []).map((p: any) => ({
            id: p.id,
            firstName: p.firstName ?? p.first_name ?? "",
            lastName: p.lastName ?? p.last_name ?? "",
            credentials: p.credentials ?? null,
            specialty: p.specialty ?? null,
            timezone: p.timezone ?? null,
          })),
        }));
        setMyEnrollments(mapped);
        // Auto-select the only enrollment so single-program patients
        // don't see a redundant "which program?" picker.
        if (mapped.length === 1) setSelectedEnrollmentId(mapped[0].id);
      } catch {
        if (cancelled) return;
        setMyEnrollments([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, isStaffMode]);

  // Staff Step 0 — debounced patient search. Re-runs every 350ms after
  // the staff types in the search box. Two-character minimum so we
  // don't pull every patient on every keystroke. Skipped entirely in
  // patient mode and when staff has already pre-selected a patient.
  useEffect(() => {
    if (!isStaffMode || isUsingMockData()) return;
    if (staffPatientSearch.trim().length < 2) {
      setStaffPatientOptions([]);
      return;
    }
    let cancelled = false;
    setStaffPatientLoading(true);
    const timer = setTimeout(async () => {
      const res = await patientService.list({ search: staffPatientSearch.trim() });
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
      setStaffPatientOptions(list.slice(0, 20).map((p) => ({
        id: p.id,
        firstName: p.firstName ?? p.first_name ?? "",
        lastName: p.lastName ?? p.last_name ?? "",
        email: p.email ?? "",
      })));
      setStaffPatientLoading(false);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isStaffMode, staffPatientSearch]);

  // Fetch the chosen provider's weekly availability whenever the patient
  // picks a provider. Skipped in demo mode (the mock time slots are fine
  // for the demo flow) and when no provider is selected yet.
  useEffect(() => {
    if (isUsingMockData() || !selectedProvider) return;
    let cancelled = false;
    setAvailabilityLoading(true);
    (async () => {
      const res = await providerService.getAvailability(selectedProvider.id);
      if (cancelled) return;
      if (res.error) {
        setProviderAvailability([]);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: any[] = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
        setProviderAvailability(list as ProviderAvailability[]);
      }
      setAvailabilityLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedProvider]);

  // The lists the widget actually renders. Switch by demoMode.
  const demoMode = isUsingMockData();

  // Patient's active enrollment that drives THIS booking. If they have
  // multiple, we use whichever they selected on the program-picker step;
  // single-enrollment auto-selects upstream so this is rarely null
  // unless the patient hasn't enrolled yet (in which case we render the
  // "you must enroll first" gate before reaching the provider step).
  const activeEnrollment: MyEnrollment | null = useMemo(() => {
    if (demoMode || !myEnrollments) return null;
    if (selectedEnrollmentId) return myEnrollments.find(e => e.id === selectedEnrollmentId) ?? null;
    if (myEnrollments.length === 1) return myEnrollments[0];
    return null;
  }, [demoMode, myEnrollments, selectedEnrollmentId]);

  // Filter the practice-wide provider list to only those attached to
  // the active enrollment's program. If the practice admin assigned a
  // primary provider for this enrollment, surface that one first;
  // patient can still pick any program-attached provider.
  const providers: MockProvider[] = useMemo(() => {
    if (demoMode) return MOCK_PROVIDERS;
    const all = apiProviders || [];
    if (!activeEnrollment) return all;
    const allowedIds = new Set(activeEnrollment.bookableProviders.map(p => p.id));
    if (allowedIds.size === 0) return all; // program has no providers attached → show none, picker UI flags it
    const filtered = all.filter(p => allowedIds.has(p.id));
    // Surface the assigned provider first, then the rest alphabetical
    // by name for a stable order.
    const assignedId = activeEnrollment.assignedProvider?.id ?? null;
    return filtered.sort((a, b) => {
      if (a.id === assignedId) return -1;
      if (b.id === assignedId) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [demoMode, apiProviders, activeEnrollment]);
  // In demo mode types are keyed per-provider; in API mode they're
  // practice-scoped, so the same flat list applies to whichever
  // provider the patient picked.
  const typesForSelectedProvider: MockAppointmentType[] = demoMode
    ? (selectedProvider ? (MOCK_TYPES[selectedProvider.id] || []) : [])
    : (apiTypes || []);
  const typesLoading = !demoMode && apiTypes === null;

  // ─── Calendar Helpers ──────────────────────────────────────────────────────

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [calendarMonth]);

  // ─── Timezone helpers ──────────────────────────────────────────────────
  // MemberMD is telehealth-first — a Florida-based provider sees clients
  // across all five US zones. ProviderAvailability windows are stored as
  // wall-clock hours in the PROVIDER'S local tz. Slot labels render in
  // the patient's browser tz so they pick a slot that makes sense to
  // them. handleBook sends the underlying UTC instant.

  /** Patient browser tz, from Intl. */
  const patientTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  /** Provider's effective tz: own value, then practice fallback,
   *  then America/New_York as a last guard so we never produce
   *  undefined behavior on a malformed setup. */
  const providerTz = useMemo(() => {
    return selectedProvider?.timezone || practiceTz || "America/New_York";
  }, [selectedProvider, practiceTz]);

  const showDualTz = patientTz !== providerTz;

  /** Compute a Date representing year/month/day at hour:minute interpreted
   *  IN tz `tz`. The standard trick: take Date.UTC of those wall-clock
   *  values, then subtract the offset that `tz` would render at that
   *  instant — `toLocaleString` gives us the tz-localized rendering
   *  which we re-parse. Handles DST correctly because the runtime
   *  knows the tz rules for any given moment. */
  function instantInTz(year: number, month0: number, day: number, hour: number, minute: number, tz: string): Date {
    const utcMs = Date.UTC(year, month0, day, hour, minute);
    const localized = new Date(utcMs).toLocaleString("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    // localized format: "MM/DD/YYYY, HH:MM:SS" — parse back to UTC.
    const m = localized.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/);
    if (!m) return new Date(utcMs);
    const [, mm, dd, yy, hh, mi, ss] = m.map(Number) as unknown as number[];
    const tzAsUtcMs = Date.UTC(yy, mm - 1, dd, hh, mi, ss);
    const offset = tzAsUtcMs - utcMs;
    return new Date(utcMs - offset);
  }

  /** Format a Date in a given tz as "h:mm AM/PM". */
  function fmtTimeInTz(d: Date, tz: string): string {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric", minute: "2-digit", hour12: true,
    }).format(d);
  }

  // Set of weekday numbers (0=Sun..6=Sat) the provider has at least one
  // is_available window for. Day-of-week is interpreted in PROVIDER tz —
  // not patient tz — because availability is anchored on the provider's
  // local calendar. In demo mode, fall back to "Mon–Sat" so the mock
  // calendar keeps its previous behavior.
  //
  // NOTE: We approximate "calendar day overlap" with the simpler
  // "day-of-week" check, which is correct as long as no provider works
  // overnight across a date boundary in their tz. The whole codebase
  // assumes that today.
  const workingDaysOfWeek = useMemo<Set<number>>(() => {
    if (demoMode || !providerAvailability) return new Set([1, 2, 3, 4, 5, 6]);
    const s = new Set<number>();
    for (const a of providerAvailability) {
      if (a.isAvailable) s.add(a.dayOfWeek);
    }
    return s;
  }, [demoMode, providerAvailability]);

  function isDateAvailable(day: number): boolean {
    const d = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) return false;
    return workingDaysOfWeek.has(d.getDay());
  }

  /** Each slot is the underlying UTC instant; the labels are derived
   *  client-side. Booking sends the UTC ISO directly so the backend
   *  doesn't have to second-guess. */
  interface SlotInstant {
    instant: Date;
    /** Patient-tz label, e.g. "12:00 PM" — what the button shows large. */
    patientLabel: string;
    /** Provider-tz label, secondary line shown when tz differs. */
    providerLabel: string;
  }

  // Generate display time slots from the provider's availability windows
  // for the selected date. Slots are 30-minute increments anchored in
  // PROVIDER tz; each yields a UTC instant, then dual-tz labels.
  const computedTimeSlots = useMemo<SlotInstant[]>(() => {
    if (demoMode || !selectedDate || !providerAvailability) return [];
    // The selectedDate came from the calendar grid (browser tz, midnight
    // local). What we need is "the calendar day in PROVIDER tz". Take
    // the y/m/d as-rendered in browser, then build instants anchored in
    // provider tz on those same y/m/d. That keeps the calendar grid
    // intuitive (clicking "May 2" books slots on May 2 in provider's
    // local calendar) and matches the day-of-week filter above.
    const y = selectedDate.getFullYear();
    const mo = selectedDate.getMonth();
    const d = selectedDate.getDate();
    const dow = selectedDate.getDay();
    const windows = providerAvailability.filter(a => a.isAvailable && a.dayOfWeek === dow);
    if (windows.length === 0) return [];
    const duration = selectedType?.durationMinutes ?? 30;
    const out: SlotInstant[] = [];
    const seenInstants = new Set<number>();
    for (const w of windows) {
      const [sh, sm] = w.startTime.split(":").map(Number);
      const [eh, em] = w.endTime.split(":").map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      // Stop at endMin - duration so the visit fits inside the window.
      for (let t = startMin; t + duration <= endMin; t += 30) {
        const h = Math.floor(t / 60);
        const m = t % 60;
        const instant = instantInTz(y, mo, d, h, m, providerTz);
        const ms = instant.getTime();
        if (seenInstants.has(ms)) continue;
        seenInstants.add(ms);
        out.push({
          instant,
          patientLabel: fmtTimeInTz(instant, patientTz),
          providerLabel: fmtTimeInTz(instant, providerTz),
        });
      }
    }
    out.sort((a, b) => a.instant.getTime() - b.instant.getTime());
    return out;
  }, [demoMode, selectedDate, providerAvailability, selectedType, providerTz, patientTz]);

  // Demo mode keeps the static label list; API mode uses computed slots.
  const visibleTimeSlots: (string | SlotInstant)[] = demoMode ? MOCK_TIME_SLOTS : computedTimeSlots;

  function prevMonth() {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  }

  // ─── Book Handler ──────────────────────────────────────────────────────────

  async function handleBook() {
    if (!selectedProvider || !selectedType || !selectedDate || !selectedTime) return;
    setBooking(true);
    setBookingError(null);

    // Two paths to compose `scheduled`:
    //   API mode: we already stashed the precise UTC instant when the
    //   patient picked a real slot — use it directly. This is what
    //   keeps the cross-tz math correct (slot was anchored in provider
    //   tz at generation time).
    //   Demo mode: parse the 12h label and compose with selectedDate
    //   in browser tz — fine for the demo flow.
    let scheduled: Date;
    if (selectedSlotInstant) {
      scheduled = selectedSlotInstant;
    } else {
      const tm = selectedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      let hours = 0;
      let minutes = 0;
      if (tm) {
        hours = parseInt(tm[1], 10);
        minutes = parseInt(tm[2], 10);
        const meridiem = tm[3]?.toUpperCase();
        if (meridiem === "PM" && hours < 12) hours += 12;
        if (meridiem === "AM" && hours === 12) hours = 0;
      }
      scheduled = new Date(selectedDate);
      scheduled.setHours(hours, minutes, 0, 0);
    }

    // Belt-and-suspenders: backend rejects past times with a generic
    // "scheduled_at must be a date after now" — catch it here with a
    // friendlier message that points at what to change.
    if (scheduled.getTime() <= Date.now()) {
      setBooking(false);
      setBookingError("That time is in the past. Pick a later time or a future date.");
      return;
    }

    // chief_complaint is a single backend column; merge the structured
    // reason (when configured) with the optional free-text notes so
    // the provider sees both. "Anxiety — Sleep has been off the past
    // two weeks" reads better than two separate truncated fields.
    const chief = [selectedVisitReason, notes].filter(Boolean).join(" — ").trim() || null;
    // Effective format respects the booker's review-screen override
    // and falls back to the appointment_type default. Used for both
    // mock-mode + real POST so the success screen reflects the choice.
    const effectiveIsTelehealth = formatOverride
      ? formatOverride === "telehealth"
      : selectedType.isTeleHealth;

    // In demo mode, return a fabricated appointment so the UI flow still
    // demos. In production we make a real API call — without this, success
    // screens fired with no DB write (audit finding B9, 2026-04-28).
    if (isUsingMockData()) {
      await new Promise((r) => setTimeout(r, 600));
      const mockAppointment: Appointment = {
        id: `apt_${Date.now()}`,
        practiceId: "p1",
        patientId: "pat1",
        providerId: selectedProvider.id,
        appointmentTypeId: selectedType.id,
        status: "scheduled",
        scheduledAt: scheduled.toISOString(),
        durationMinutes: selectedType.durationMinutes,
        chiefComplaint: chief,
        notes: null,
        isTeleHealth: effectiveIsTelehealth,
        teleHealthUrl: null,
        canceledAt: null,
        cancelReason: null,
        checkedInAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onBooked?.(mockAppointment);
      setBooking(false);
      setStep("success");
      return;
    }

    if (!patientId) {
      setBooking(false);
      setBookingError("Patient profile not loaded yet — try again in a moment.");
      return;
    }

    // Backend StoreAppointmentRequest requires patientId. Earlier
    // versions of this widget omitted it and got a generic 422.
    //
    // Field name note: backend column is `is_telehealth` (one word).
    // apiFetch's camelToSnake transformer converts each capital
    // letter to `_<lower>`, so `isTeleHealth` (capital H mid-word)
    // becomes `is_tele_health` — three words — which the validator
    // strips silently, so the appointment ends up with the default
    // `is_telehealth=false`. Send the camel-2-words form so the
    // transform lands on the right column. Bug caught when a patient
    // picked Telehealth and got an in-office row instead.
    const res = await appointmentService.create({
      patientId,
      providerId: selectedProvider.id,
      appointmentTypeId: selectedType.id,
      scheduledAt: scheduled.toISOString(),
      durationMinutes: selectedType.durationMinutes,
      chiefComplaint: chief,
      isTelehealth: effectiveIsTelehealth,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (res.error || !res.data) {
      setBooking(false);
      setBookingError(res.error || "Could not book the appointment. Please try again.");
      return;
    }

    onBooked?.(res.data);
    setBooking(false);
    setStep("success");
  }

  // ─── Step Titles ───────────────────────────────────────────────────────────

  const stepTitles: Record<string, string> = {
    "0": "Select Patient",
    "1": isStaffMode && staffSelectedPatient
      ? `Provider for ${staffSelectedPatient.name || "patient"}`
      : "Select Provider",
    "2": "Appointment Type",
    "3": "Date & Time",
    "4": "Review & Confirm",
    success: "Confirmed!",
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div
        className="w-full max-w-xl rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: C.white, maxHeight: "90vh" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${C.slate200}` }}
        >
          <div className="flex items-center gap-3">
            {/* Back button: hidden on the first navigable step (1 in
                patient mode, 0 in staff-mode-no-preselect) and on
                success. In staff mode, going back from Step 1 returns
                to the patient picker — but only when no patient was
                pre-selected (otherwise back would just bounce them
                somewhere they can't change anything). */}
            {step !== "success" && step !== initialStep && (
              <button
                onClick={() => setStep(((Number(step) - 1) || initialStep) as BookingStep)}
                className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
              >
                <ChevronLeft className="w-4 h-4" style={{ color: C.slate500 }} />
              </button>
            )}
            <h2 className="text-lg font-bold" style={{ color: C.navy800 }}>
              {stepTitles[String(step)]}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-slate-100"
          >
            <X className="w-5 h-5" style={{ color: C.slate400 }} />
          </button>
        </div>

        {/* Progress Steps */}
        {step !== "success" && (
          <div className="flex items-center gap-1 px-6 py-3 shrink-0" style={{ backgroundColor: C.slate50 }}>
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex-1 flex items-center gap-1">
                <div
                  className="h-1.5 flex-1 rounded-full transition-all"
                  style={{
                    backgroundColor: Number(step) >= s ? C.teal500 : C.slate200,
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Step 0: Pick patient — staff mode only, hidden when a
              patient was pre-selected via the staffPatientId prop. */}
          {step === 0 && isStaffMode && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: C.slate500 }}>
                Which patient is this booking for?
              </p>
              <div className="relative">
                <input
                  autoFocus
                  value={staffPatientSearch}
                  onChange={(e) => setStaffPatientSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: C.slate200, color: C.navy800 }}
                />
                {staffPatientLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: C.slate400 }}>
                    Searching…
                  </div>
                )}
              </div>
              {staffPatientSearch.trim().length < 2 && (
                <p className="text-xs italic" style={{ color: C.slate400 }}>
                  Type at least two characters to search.
                </p>
              )}
              {staffPatientSearch.trim().length >= 2 && !staffPatientLoading && staffPatientOptions.length === 0 && (
                <p className="text-xs" style={{ color: C.slate500 }}>
                  No matching patients found.
                </p>
              )}
              <div className="space-y-2">
                {staffPatientOptions.map((p) => {
                  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "Unknown";
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setStaffSelectedPatient({ ...p, name: fullName });
                        setPatientId(p.id);
                        setStep(1);
                      }}
                      className="w-full text-left p-3 rounded-xl transition-all"
                      style={{ border: `2px solid ${C.slate200}`, backgroundColor: C.white }}
                    >
                      <p className="text-sm font-semibold" style={{ color: C.navy800 }}>{fullName}</p>
                      {p.email && <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>{p.email}</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 1: Select Provider — gated on enrollment.
              Three sub-cases for API mode:
                a) loading: show a spinner-ish placeholder.
                b) no active enrollments: block booking, show CTA.
                c) multiple enrollments and none picked yet: program
                   picker. Auto-skipped for single-enrollment patients
                   (selectedEnrollmentId is set in the fetch).
                d) one enrollment chosen: show its bookable providers,
                   with the assigned one (if any) flagged. */}
          {step === 1 && (
            <div className="space-y-3">
              {/* (a) still loading */}
              {!demoMode && myEnrollments === null && (
                <div className="text-center py-8 text-sm" style={{ color: C.slate500 }}>
                  Loading your programs…
                </div>
              )}

              {/* (b) zero active enrollments — block booking in patient
                  mode, allow ad-hoc booking in staff mode (the practice
                  may want to schedule the patient before formally
                  enrolling them). The staff banner is informational so
                  they can decide to enroll first if desired. */}
              {!demoMode && myEnrollments && myEnrollments.length === 0 && !isStaffMode && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2" style={{ color: C.amber600 }} />
                  <p className="text-sm font-semibold" style={{ color: C.navy800 }}>
                    Enroll in a program first
                  </p>
                  <p className="text-xs mt-1 mb-4" style={{ color: C.slate500 }}>
                    Booking is open to active members. Pick a plan from your dashboard, then come back here to schedule.
                  </p>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: C.teal500 }}
                  >
                    Back to dashboard
                  </button>
                </div>
              )}
              {!demoMode && isStaffMode && myEnrollments && myEnrollments.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs mb-2" style={{ color: C.amber600 }}>
                  This patient isn't enrolled in any program. You can still book — all practice providers will be shown.
                </div>
              )}

              {/* (c) multi-enrollment — pick which program first */}
              {!demoMode && myEnrollments && myEnrollments.length > 1 && !selectedEnrollmentId && (
                <div className="space-y-3">
                  <p className="text-xs" style={{ color: C.slate500 }}>
                    Which program is this visit for?
                  </p>
                  {myEnrollments.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setSelectedEnrollmentId(e.id)}
                      className="w-full text-left p-4 rounded-xl transition-all"
                      style={{ border: `2px solid ${C.slate200}`, backgroundColor: C.white }}
                    >
                      <p className="text-sm font-semibold" style={{ color: C.navy800 }}>
                        {e.program?.name ?? "Program"}
                      </p>
                      {e.assignedProvider && (
                        <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
                          Your provider: {e.assignedProvider.firstName} {e.assignedProvider.lastName}
                          {e.assignedProvider.credentials ? `, ${e.assignedProvider.credentials}` : ""}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* (d) program chosen (or single-enrollment auto-pick) →
                  show that program's bookable providers. Assigned
                  provider sorted to top. Staff mode also reaches this
                  branch when the patient has zero enrollments — the
                  provider filter falls through to "all providers"
                  because activeEnrollment is null. */}
              {(demoMode
                || (myEnrollments && (selectedEnrollmentId || myEnrollments.length === 1))
                || (isStaffMode && myEnrollments && myEnrollments.length === 0)
              ) && (
                <>
                  {!demoMode && activeEnrollment && (
                    <div className="flex items-center justify-between mb-2 px-1">
                      <p className="text-xs" style={{ color: C.slate500 }}>
                        Booking under: <span className="font-semibold" style={{ color: C.navy800 }}>{activeEnrollment.program?.name}</span>
                      </p>
                      {myEnrollments && myEnrollments.length > 1 && (
                        <button
                          onClick={() => { setSelectedEnrollmentId(null); setSelectedProvider(null); }}
                          className="text-xs underline"
                          style={{ color: C.slate500 }}
                        >
                          Change program
                        </button>
                      )}
                    </div>
                  )}
                  {providers.length === 0 && !demoMode && (
                    <div className="text-center py-8 text-sm" style={{ color: C.slate500 }}>
                      {activeEnrollment?.bookableProviders.length === 0
                        ? "This program has no providers yet. Contact your practice."
                        : "No providers available yet. Contact the practice."}
                    </div>
                  )}
                  {providers.map((prov) => {
                    const selected = selectedProvider?.id === prov.id;
                    const isAssigned = !demoMode && activeEnrollment?.assignedProvider?.id === prov.id;
                    return (
                      <button
                        key={prov.id}
                        onClick={() => {
                          setSelectedProvider(prov);
                          setSelectedType(null);
                          setStep(2);
                        }}
                        className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all"
                        style={{
                          border: `2px solid ${selected ? C.teal500 : C.slate200}`,
                          backgroundColor: selected ? C.teal50 : C.white,
                        }}
                      >
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                          style={{ background: `linear-gradient(135deg, ${C.navy700}, ${C.teal500})` }}
                        >
                          {prov.avatarInitials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold" style={{ color: C.navy800 }}>
                              {prov.name}{prov.credentials ? `, ${prov.credentials}` : ""}
                            </p>
                            {isAssigned && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: C.teal50, color: C.teal600 }}>
                                Your provider
                              </span>
                            )}
                          </div>
                          {prov.specialty && (
                            <span
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mt-1"
                              style={{ backgroundColor: C.slate100, color: C.slate600 }}
                            >
                              {prov.specialty}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs" style={{ color: C.slate400 }}>Next available</p>
                          <p className="text-xs font-semibold" style={{ color: C.teal600 }}>{prov.nextAvailable}</p>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Step 2: Select Type */}
          {step === 2 && selectedProvider && (
            <div className="space-y-3">
              <p className="text-xs mb-2" style={{ color: C.slate400 }}>
                Available appointment types for {selectedProvider.name}
              </p>
              {typesLoading && (
                <div className="text-center py-8 text-sm" style={{ color: C.slate500 }}>
                  Loading appointment types…
                </div>
              )}
              {!typesLoading && typesError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm" style={{ color: C.amber600 }}>
                  Couldn't load appointment types: {typesError}
                </div>
              )}
              {!typesLoading && !typesError && typesForSelectedProvider.length === 0 && !demoMode && (
                <div className="text-center py-8 text-sm" style={{ color: C.slate500 }}>
                  No appointment types configured. Contact the practice.
                </div>
              )}
              {typesForSelectedProvider.map((type) => {
                const selected = selectedType?.id === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => {
                      setSelectedType(type);
                      // Reset the format override so the next type's
                      // default (is_telehealth) takes effect on the
                      // review screen until the booker chooses again.
                      setFormatOverride(null);
                      setStep(3);
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all"
                    style={{
                      border: `2px solid ${selected ? C.teal500 : C.slate200}`,
                      backgroundColor: selected ? C.teal50 : C.white,
                    }}
                  >
                    <div
                      className="w-3 h-10 rounded-full shrink-0"
                      style={{ backgroundColor: type.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: C.navy800 }}>
                        {type.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color: C.slate500 }}>
                          <Clock className="w-3 h-3" /> {type.durationMinutes} min
                        </span>
                        {type.isTeleHealth && (
                          <span
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: C.green50, color: C.green500 }}
                          >
                            <Video className="w-3 h-3" /> Telehealth
                          </span>
                        )}
                        {type.requiresMembership && (
                          <span
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: C.amber50, color: C.amber600 }}
                          >
                            <Crown className="w-3 h-3" /> Members
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: C.slate300 }} />
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 3: Date & Time */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Mobile: native date picker. Renders as <input type="date">
                  which on iOS/Android brings up the system date picker —
                  faster + thumb-friendlier than the custom 7-col calendar
                  grid, which also overflowed the modal on small screens. */}
              <div className="md:hidden">
                <label className="block text-xs font-semibold mb-2" style={{ color: C.slate500 }}>
                  CHOOSE A DATE
                </label>
                <input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={selectedDate ? selectedDate.toISOString().slice(0, 10) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) { setSelectedDate(null); return; }
                    // Parse as local date so we don't shift a day in non-UTC timezones.
                    const [y, m, d] = v.split("-").map(Number);
                    setSelectedDate(new Date(y, (m ?? 1) - 1, d ?? 1));
                    setSelectedTime(null); setSelectedSlotInstant(null);
                  }}
                  className="w-full px-3 py-3 rounded-lg border text-base"
                  style={{ borderColor: C.slate200, color: C.navy800, backgroundColor: C.white }}
                />
              </div>

              {/* Desktop: custom calendar (gives a fuller month overview). */}
              <div className="hidden md:block">
                <div className="flex items-center justify-between mb-3">
                  <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-tap">
                    <ChevronLeft className="w-4 h-4" style={{ color: C.slate500 }} />
                  </button>
                  <h3 className="text-sm font-semibold" style={{ color: C.navy800 }}>
                    {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </h3>
                  <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-tap">
                    <ChevronRight className="w-4 h-4" style={{ color: C.slate500 }} />
                  </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 mb-1">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div key={d} className="text-center text-xs py-1 font-medium" style={{ color: C.slate400 }}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, i) => {
                    if (day === null) return <div key={`empty-${i}`} />;
                    const available = isDateAvailable(day);
                    const isSelected =
                      selectedDate &&
                      selectedDate.getDate() === day &&
                      selectedDate.getMonth() === calendarMonth.getMonth() &&
                      selectedDate.getFullYear() === calendarMonth.getFullYear();
                    const isToday =
                      new Date().getDate() === day &&
                      new Date().getMonth() === calendarMonth.getMonth() &&
                      new Date().getFullYear() === calendarMonth.getFullYear();

                    return (
                      <button
                        key={day}
                        onClick={() => {
                          if (available) {
                            setSelectedDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                            setSelectedTime(null); setSelectedSlotInstant(null);
                          }
                        }}
                        disabled={!available}
                        className="aspect-square flex items-center justify-center rounded-lg text-sm transition-all shrink-tap"
                        style={{
                          backgroundColor: isSelected ? C.teal500 : "transparent",
                          color: isSelected ? C.white : available ? C.navy800 : C.slate300,
                          fontWeight: isToday || isSelected ? 700 : 400,
                          border: isToday && !isSelected ? `2px solid ${C.teal500}` : "2px solid transparent",
                          cursor: available ? "pointer" : "default",
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Slots */}
              {selectedDate && (
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: C.slate500 }}>
                    AVAILABLE TIMES &mdash;{" "}
                    {selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                  <div className="text-xs mb-2" style={{ color: C.slate400 }}>
                    Your timezone: {patientTz}
                    {!demoMode && showDualTz && (
                      <span className="ml-2 text-amber-600">
                        · Provider is in {providerTz} — slots show your local time with provider time below.
                      </span>
                    )}
                  </div>
                  {!demoMode && availabilityLoading && (
                    <div className="text-center py-6 text-sm" style={{ color: C.slate500 }}>
                      Loading available times…
                    </div>
                  )}
                  {!demoMode && !availabilityLoading && visibleTimeSlots.length === 0 && (
                    <div className="text-center py-6 text-sm" style={{ color: C.slate500 }}>
                      {(providerAvailability && providerAvailability.length > 0)
                        ? "Provider isn't working this day. Pick another date."
                        : "Provider hasn't set their availability yet. Contact the practice."}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {visibleTimeSlots.map((slot) => {
                      // Two slot types: demo strings ("9:00 AM") and real
                      // SlotInstant objects from computedTimeSlots. Treat
                      // them uniformly via small extractors.
                      const isInstant = typeof slot !== "string";
                      const label = isInstant ? slot.patientLabel : slot;
                      const subLabel = isInstant && showDualTz ? slot.providerLabel : null;
                      const key = isInstant ? slot.instant.toISOString() : slot;
                      const selected = selectedTime === label && (
                        !isInstant || selectedSlotInstant?.getTime() === slot.instant.getTime()
                      );
                      // Past-slot disabling: real slots use the underlying
                      // UTC instant directly. Demo slots fall back to
                      // composing into selectedDate in browser tz (good
                      // enough for the demo flow).
                      let isPast = false;
                      if (isInstant) {
                        isPast = slot.instant.getTime() <= Date.now();
                      } else {
                        const m = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
                        let slotHour = 0; let slotMin = 0;
                        if (m) {
                          slotHour = parseInt(m[1], 10);
                          slotMin = parseInt(m[2], 10);
                          const mer = m[3]?.toUpperCase();
                          if (mer === "PM" && slotHour < 12) slotHour += 12;
                          if (mer === "AM" && slotHour === 12) slotHour = 0;
                        }
                        const slotDate = new Date(selectedDate);
                        slotDate.setHours(slotHour, slotMin, 0, 0);
                        isPast = slotDate.getTime() <= Date.now();
                      }
                      return (
                        <button
                          key={key}
                          disabled={isPast}
                          onClick={() => {
                            setSelectedTime(label);
                            setSelectedSlotInstant(isInstant ? slot.instant : null);
                            setStep(4);
                          }}
                          className="py-2.5 rounded-lg text-sm font-medium transition-all disabled:cursor-not-allowed"
                          style={{
                            border: `1.5px solid ${selected ? C.teal500 : C.slate200}`,
                            backgroundColor: selected ? C.teal50 : C.white,
                            color: isPast ? C.slate300 : (selected ? C.teal600 : C.slate600),
                            textDecoration: isPast ? "line-through" : "none",
                          }}
                        >
                          <div>{label}</div>
                          {subLabel && (
                            <div className="text-[10px] mt-0.5" style={{ color: C.slate400 }}>
                              {subLabel} provider
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && selectedProvider && selectedType && selectedDate && selectedTime && (
            <div className="space-y-5">
              {/* Summary Card */}
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: C.slate50, border: `1px solid ${C.slate200}` }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: `linear-gradient(135deg, ${C.navy700}, ${C.teal500})` }}
                  >
                    {selectedProvider.avatarInitials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.navy800 }}>
                      {selectedProvider.name}, {selectedProvider.credentials}
                    </p>
                    <p className="text-xs" style={{ color: C.slate500 }}>{selectedProvider.specialty}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs" style={{ color: C.slate400 }}>Type</p>
                    <p className="text-sm font-medium" style={{ color: C.navy800 }}>{selectedType.name}</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: C.slate400 }}>Duration</p>
                    <p className="text-sm font-medium" style={{ color: C.navy800 }}>{selectedType.durationMinutes} min</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: C.slate400 }}>Date</p>
                    <p className="text-sm font-medium" style={{ color: C.navy800 }}>
                      {selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: C.slate400 }}>Time</p>
                    <p className="text-sm font-medium" style={{ color: C.navy800 }}>{selectedTime}</p>
                  </div>
                </div>
                {/* Format toggle — defaults to the appointment_type's
                    is_telehealth flag but the booker can override.
                    Telehealth here means "LiveKit room (or provider's
                    BYOV link) auto-created on book"; in-office means
                    no room. */}
                {(() => {
                  const effectiveFormat = formatOverride
                    ?? (selectedType.isTeleHealth ? "telehealth" : "in_office");
                  return (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFormatOverride("in_office")}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors"
                        style={{
                          backgroundColor: effectiveFormat === "in_office" ? C.slate100 : "transparent",
                          color: effectiveFormat === "in_office" ? C.navy800 : C.slate500,
                          border: `1px solid ${effectiveFormat === "in_office" ? C.slate300 : C.slate200}`,
                        }}
                      >
                        <MapPin className="w-3 h-3" /> In-office
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormatOverride("telehealth")}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors"
                        style={{
                          backgroundColor: effectiveFormat === "telehealth" ? "#e6fffa" : "transparent",
                          color: effectiveFormat === "telehealth" ? C.teal600 : C.slate500,
                          border: `1px solid ${effectiveFormat === "telehealth" ? C.teal500 : C.slate200}`,
                        }}
                      >
                        <Video className="w-3 h-3" /> Telehealth
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Reason for visit — required dropdown sourced from
                  Practice Settings → Clinical → Visit Reasons. Hidden
                  when the practice hasn't configured any options yet. */}
              {visitReasonOptions && visitReasonOptions.length > 0 && (
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: C.slate500 }}>
                    Reason for visit *
                  </label>
                  <select
                    value={selectedVisitReason}
                    onChange={(e) => setSelectedVisitReason(e.target.value)}
                    className="w-full rounded-lg text-sm p-3 focus:outline-none bg-white"
                    style={{ border: `1px solid ${C.slate200}`, color: C.slate700 }}
                  >
                    <option value="">Select a reason…</option>
                    {visitReasonOptions.map((r) => (
                      <option key={r.id} value={r.label}>{r.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes — supplements the reason dropdown when present. */}
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: C.slate500 }}>
                  {visitReasonOptions && visitReasonOptions.length > 0
                    ? "Anything else? (optional)"
                    : "Notes for your provider (optional)"}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg text-sm p-3 resize-none focus:outline-none"
                  style={{ border: `1px solid ${C.slate200}`, color: C.slate700 }}
                  placeholder={
                    visitReasonOptions && visitReasonOptions.length > 0
                      ? "Add details for your provider…"
                      : "Describe your symptoms or reason for visit..."
                  }
                />
              </div>

              {/* Recurring */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="rounded"
                />
                <div className="flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5" style={{ color: C.slate500 }} />
                  <span className="text-sm font-medium" style={{ color: C.navy800 }}>
                    Make this recurring
                  </span>
                </div>
              </label>

              {isRecurring && (
                <div className="pl-8 space-y-3">
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: C.slate500 }}>Frequency</label>
                    <select
                      value={recurrenceFreq}
                      onChange={(e) => setRecurrenceFreq(e.target.value as "weekly" | "biweekly" | "monthly")}
                      className="w-full rounded-lg text-sm p-2 focus:outline-none"
                      style={{ border: `1px solid ${C.slate200}`, color: C.slate700 }}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Every 2 Weeks</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: C.slate500 }}>End Date</label>
                    <input
                      type="date"
                      value={recurrenceEndDate}
                      onChange={(e) => setRecurrenceEndDate(e.target.value)}
                      className="w-full rounded-lg text-sm p-2 focus:outline-none"
                      style={{ border: `1px solid ${C.slate200}`, color: C.slate700 }}
                    />
                  </div>
                </div>
              )}

              {/* Telehealth Consent — patient mode only. In staff mode
                  consent is verbal/already on file; the checkbox would
                  imply staff is consenting on the patient's behalf
                  which is the wrong record-keeping model. Reads the
                  effective format (override or type default) so a
                  patient who flipped a non-telehealth type to
                  telehealth still sees the consent prompt. */}
              {(formatOverride ? formatOverride === "telehealth" : selectedType.isTeleHealth) && !isStaffMode && (
                <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer" style={{ backgroundColor: C.teal50, border: `1px solid ${C.teal500}` }}>
                  <input
                    type="checkbox"
                    checked={telehealthConsent}
                    onChange={(e) => setTelehealthConsent(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <p className="text-xs" style={{ color: C.teal600 }}>
                    I consent to receive care via telehealth. I understand this visit will be conducted
                    through a secure, HIPAA-compliant video connection.
                  </p>
                </label>
              )}

              {bookingError && (
                <div
                  className="rounded-lg border p-3 flex items-start gap-2"
                  style={{ borderColor: "#fca5a5", backgroundColor: "#fef2f2" }}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#dc2626" }} />
                  <p className="text-xs" style={{ color: "#991b1b" }}>{bookingError}</p>
                </div>
              )}

              {/* Book Button — sticky at the bottom of the modal body so
                  on small screens (where this column overflows) the
                  primary action stays in reach without scrolling. The
                  -mx-6 -mb-5 pulls it to the edges of the px-6 py-5
                  body, mimicking a footer bar. */}
              <div
                className="sticky bottom-0 -mx-6 -mb-5 px-6 py-3 mt-2"
                style={{ backgroundColor: C.white, borderTop: `1px solid ${C.slate200}` }}
              >
                <button
                  onClick={handleBook}
                  disabled={
                    booking
                    // Telehealth consent gate is patient-mode only.
                    // Reads effective format so override → telehealth
                    // still requires consent.
                    || (!isStaffMode && (formatOverride ? formatOverride === "telehealth" : selectedType.isTeleHealth) && !telehealthConsent)
                    // Block submit when the practice has visit reasons
                    // configured but the user hasn't picked one. Same
                    // rule applies in both modes — structured chief
                    // complaint is useful for the provider regardless
                    // of who's typing.
                    || (!!visitReasonOptions && visitReasonOptions.length > 0 && !selectedVisitReason)
                  }
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: C.teal500 }}
                >
                  {booking ? (
                    <>
                      <div
                        className="w-4 h-4 rounded-full animate-spin"
                        style={{ borderWidth: "2px", borderStyle: "solid", borderColor: C.white, borderTopColor: "transparent" }}
                      />
                      Booking...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Book Appointment
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Success State */}
          {step === "success" && selectedProvider && selectedType && selectedDate && selectedTime && (
            <div className="text-center py-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: C.green50 }}
              >
                <CheckCircle className="w-8 h-8" style={{ color: C.green500 }} />
              </div>
              <h3 className="text-lg font-bold mb-1" style={{ color: C.navy800 }}>
                Appointment Booked!
              </h3>
              <p className="text-sm mb-6" style={{ color: C.slate500 }}>
                {selectedType.name} with {selectedProvider.name}
                <br />
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {selectedTime}
              </p>

              {/* Calendar Links */}
              <div>
                <p className="text-xs font-semibold mb-3" style={{ color: C.slate400 }}>
                  ADD TO CALENDAR
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={buildGoogleCalUrl(selectedProvider.name, selectedType.name, selectedDate, selectedTime, selectedType.durationMinutes)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50"
                    style={{ border: `1px solid ${C.slate200}`, color: C.slate600 }}
                  >
                    <CalendarIcon className="w-4 h-4" /> Google
                  </a>
                  <a
                    href={buildOutlookCalUrl(selectedProvider.name, selectedType.name, selectedDate, selectedTime, selectedType.durationMinutes)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50"
                    style={{ border: `1px solid ${C.slate200}`, color: C.slate600 }}
                  >
                    <CalendarIcon className="w-4 h-4" /> Outlook
                  </a>
                  <a
                    href={buildYahooCalUrl(selectedProvider.name, selectedType.name, selectedDate, selectedTime, selectedType.durationMinutes)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50"
                    style={{ border: `1px solid ${C.slate200}`, color: C.slate600 }}
                  >
                    <CalendarIcon className="w-4 h-4" /> Yahoo
                  </a>
                  <button
                    onClick={() => downloadIcal(selectedProvider.name, selectedType.name, selectedDate, selectedTime, selectedType.durationMinutes)}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50"
                    style={{ border: `1px solid ${C.slate200}`, color: C.slate600 }}
                  >
                    <CalendarIcon className="w-4 h-4" /> iCal
                  </button>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full mt-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ backgroundColor: C.teal500 }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Calendar URL Builders ───────────────────────────────────────────────────

function parseTimeToHours(timeStr: string): number {
  const parts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!parts) return 9;
  let h = parseInt(parts[1]);
  const m = parseInt(parts[2]);
  if (parts[3].toUpperCase() === "PM" && h < 12) h += 12;
  if (parts[3].toUpperCase() === "AM" && h === 12) h = 0;
  return h + m / 60;
}

function formatIsoDate(date: Date, hours: number): string {
  const d = new Date(date);
  d.setHours(Math.floor(hours), (hours % 1) * 60, 0, 0);
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function buildGoogleCalUrl(provider: string, type: string, date: Date, time: string, duration: number): string {
  const hours = parseTimeToHours(time);
  const start = formatIsoDate(date, hours);
  const end = formatIsoDate(date, hours + duration / 60);
  const title = encodeURIComponent(`${type} - ${provider}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}`;
}

function buildOutlookCalUrl(provider: string, type: string, date: Date, time: string, duration: number): string {
  const hours = parseTimeToHours(time);
  const d = new Date(date);
  d.setHours(Math.floor(hours), (hours % 1) * 60, 0, 0);
  const start = d.toISOString();
  d.setMinutes(d.getMinutes() + duration);
  const end = d.toISOString();
  const title = encodeURIComponent(`${type} - ${provider}`);
  return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${start}&enddt=${end}`;
}

function buildYahooCalUrl(provider: string, type: string, date: Date, time: string, duration: number): string {
  const hours = parseTimeToHours(time);
  const start = formatIsoDate(date, hours);
  const title = encodeURIComponent(`${type} - ${provider}`);
  const dur = `${String(Math.floor(duration / 60)).padStart(2, "0")}${String(duration % 60).padStart(2, "0")}`;
  return `https://calendar.yahoo.com/?v=60&title=${title}&st=${start}&dur=${dur}`;
}

function downloadIcal(provider: string, type: string, date: Date, time: string, duration: number) {
  const hours = parseTimeToHours(time);
  const start = formatIsoDate(date, hours);
  const end = formatIsoDate(date, hours + duration / 60);
  const ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${type} - ${provider}`,
    "DESCRIPTION:MemberMD Appointment",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ical], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "appointment.ics";
  a.click();
  URL.revokeObjectURL(url);
}
