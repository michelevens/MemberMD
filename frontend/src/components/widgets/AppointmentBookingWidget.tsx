// ===== AppointmentBookingWidget =====
// 4-step appointment booking flow: Provider → Type → Date/Time → Confirm
// Includes calendar integration links on success

import { useState, useMemo } from "react";
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
} from "lucide-react";
import type { Appointment } from "../../types";

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

interface MockProvider {
  id: string;
  name: string;
  credentials: string;
  specialty: string;
  avatarInitials: string;
  nextAvailable: string;
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

type BookingStep = 1 | 2 | 3 | 4 | "success";

interface AppointmentBookingWidgetProps {
  onClose: () => void;
  onBooked?: (appointment: Appointment) => void;
}

export function AppointmentBookingWidget({ onClose, onBooked }: AppointmentBookingWidgetProps) {
  const [step, setStep] = useState<BookingStep>(1);
  const [selectedProvider, setSelectedProvider] = useState<MockProvider | null>(null);
  const [selectedType, setSelectedType] = useState<MockAppointmentType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFreq, setRecurrenceFreq] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [telehealthConsent, setTelehealthConsent] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [booking, setBooking] = useState(false);

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

  function isDateAvailable(day: number): boolean {
    const d = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    const dow = d.getDay();
    if (dow === 0) return false; // Sunday
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d >= today;
  }

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
    // Simulate API call
    await new Promise((r) => setTimeout(r, 1200));

    const mockAppointment: Appointment = {
      id: `apt_${Date.now()}`,
      practiceId: "p1",
      patientId: "pat1",
      providerId: selectedProvider.id,
      appointmentTypeId: selectedType.id,
      status: "scheduled",
      scheduledAt: selectedDate.toISOString(),
      durationMinutes: selectedType.durationMinutes,
      chiefComplaint: notes || null,
      notes: null,
      isTeleHealth: selectedType.isTeleHealth,
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
  }

  // ─── Step Titles ───────────────────────────────────────────────────────────

  const stepTitles: Record<string, string> = {
    "1": "Select Provider",
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
            {step !== 1 && step !== "success" && (
              <button
                onClick={() => setStep(((Number(step) - 1) || 1) as BookingStep)}
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

          {/* Step 1: Select Provider */}
          {step === 1 && (
            <div className="space-y-3">
              {MOCK_PROVIDERS.map((prov) => {
                const selected = selectedProvider?.id === prov.id;
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
                      <p className="text-sm font-semibold" style={{ color: C.navy800 }}>
                        {prov.name}, {prov.credentials}
                      </p>
                      <span
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mt-1"
                        style={{ backgroundColor: C.slate100, color: C.slate600 }}
                      >
                        {prov.specialty}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs" style={{ color: C.slate400 }}>Next available</p>
                      <p className="text-xs font-semibold" style={{ color: C.teal600 }}>{prov.nextAvailable}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Select Type */}
          {step === 2 && selectedProvider && (
            <div className="space-y-3">
              <p className="text-xs mb-2" style={{ color: C.slate400 }}>
                Available appointment types for {selectedProvider.name}
              </p>
              {(MOCK_TYPES[selectedProvider.id] || []).map((type) => {
                const selected = selectedType?.id === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => {
                      setSelectedType(type);
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
              {/* Calendar */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                    <ChevronLeft className="w-4 h-4" style={{ color: C.slate500 }} />
                  </button>
                  <h3 className="text-sm font-semibold" style={{ color: C.navy800 }}>
                    {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </h3>
                  <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
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
                            setSelectedTime(null);
                          }
                        }}
                        disabled={!available}
                        className="aspect-square flex items-center justify-center rounded-lg text-sm transition-all"
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
                    Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {MOCK_TIME_SLOTS.map((slot) => {
                      const selected = selectedTime === slot;
                      return (
                        <button
                          key={slot}
                          onClick={() => {
                            setSelectedTime(slot);
                            setStep(4);
                          }}
                          className="py-2.5 rounded-lg text-sm font-medium transition-all"
                          style={{
                            border: `1.5px solid ${selected ? C.teal500 : C.slate200}`,
                            backgroundColor: selected ? C.teal50 : C.white,
                            color: selected ? C.teal600 : C.slate600,
                          }}
                        >
                          {slot}
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
                {selectedType.isTeleHealth && (
                  <div className="flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" style={{ color: C.teal500 }} />
                    <span className="text-xs font-medium" style={{ color: C.teal600 }}>Telehealth Video Visit</span>
                  </div>
                )}
                {!selectedType.isTeleHealth && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" style={{ color: C.slate500 }} />
                    <span className="text-xs font-medium" style={{ color: C.slate600 }}>In-Office Visit</span>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: C.slate500 }}>
                  Notes for your provider (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg text-sm p-3 resize-none focus:outline-none"
                  style={{ border: `1px solid ${C.slate200}`, color: C.slate700 }}
                  placeholder="Describe your symptoms or reason for visit..."
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

              {/* Telehealth Consent */}
              {selectedType.isTeleHealth && (
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

              {/* Book Button */}
              <button
                onClick={handleBook}
                disabled={booking || (selectedType.isTeleHealth && !telehealthConsent)}
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
