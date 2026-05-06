// ===== Booking Widget =====
//
// Public, embeddable appointment-booking flow. Practice drops this on
// their marketing site via iframe pointed at /#/book/{tenantCode}.
// No auth — visitors land cold, pick a provider + visit type, pick a
// date + slot, fill in basic contact info, and submit. Backend
// creates a "lead" patient record + pending appointment that the
// practice approves from the intake queue.
//
// Slot availability honors external_busy_blocks (Path A imports) so
// time the provider has on their personal calendar can never be
// double-booked from this widget. Same AvailabilityService used by
// the in-app patient portal.
//
// Steps:
//   1. Provider + appointment type pick
//   2. Date + slot pick
//   3. Contact info + reason for visit
//   4. Confirmation screen
//
// Pre-fill via URL query: ?provider=<id>&type=<id> skips step 1.

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Calendar, Clock, Check, Loader2, AlertCircle, Video, MapPin } from "lucide-react";
import { useWidgetTheme } from "../../hooks/useWidgetTheme";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "https://pure-courage-production.up.railway.app/api";

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal700: "#0e6651",
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  red500: "#ef4444",
};

interface ProviderRow {
  id: string;
  name: string;
  title: string | null;
  credentials: string | null;
  specialty: string | null;
  bio: string | null;
  telehealth_enabled: boolean;
}
interface AppointmentTypeRow {
  id: string;
  name: string;
  duration_minutes: number;
  is_telehealth: boolean;
  color: string | null;
}
interface OptionsResp {
  data: {
    practice_name: string;
    specialty: string | null;
    timezone: string | null;
    providers: ProviderRow[];
    appointment_types: AppointmentTypeRow[];
  };
}
interface SlotsResp {
  data: Array<{ start: string; end: string }>;
}

type Step = "pick" | "date" | "form" | "confirm";

export function BookingWidget() {
  const { tenantCode = "" } = useParams<{ tenantCode: string }>();
  const [searchParams] = useSearchParams();
  const preProviderId = searchParams.get("provider");
  const preTypeId = searchParams.get("type");

  useWidgetTheme(tenantCode, "booking");

  const [step, setStep] = useState<Step>("pick");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionsResp["data"] | null>(null);

  const [providerId, setProviderId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);

  const [date, setDate] = useState<string>(() => {
    // Default to tomorrow — most practices have lead-time gates
    // that block today's slots anyway.
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [slots, setSlots] = useState<Array<{ start: string; end: string }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [chosenSlot, setChosenSlot] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    reason: "",
    website_url: "", // honeypot
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ reference: string; message: string } | null>(null);

  // ─── Load options ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/external/booking/${tenantCode}/options`);
        if (!res.ok) {
          setError(res.status === 404 ? "Practice not found." : "Couldn't load booking options.");
          setLoading(false);
          return;
        }
        const json: OptionsResp = await res.json();
        if (cancelled) return;
        setOptions(json.data);
        // Pre-fill from URL params, skip ahead if both are valid.
        if (preProviderId && json.data.providers.some(p => p.id === preProviderId)) {
          setProviderId(preProviderId);
        }
        if (preTypeId && json.data.appointment_types.some(t => t.id === preTypeId)) {
          setTypeId(preTypeId);
        }
      } catch {
        if (!cancelled) setError("Couldn't reach the practice's booking system. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantCode, preProviderId, preTypeId]);

  // Auto-advance past pick screen when both params resolved.
  useEffect(() => {
    if (step === "pick" && providerId && typeId && options) {
      setStep("date");
    }
  }, [step, providerId, typeId, options]);

  // ─── Load slots when date or provider changes ──────────────────────────
  const loadSlots = useCallback(async () => {
    if (!providerId || !typeId || !options) return;
    const t = options.appointment_types.find((x) => x.id === typeId);
    if (!t) return;
    setSlotsLoading(true);
    setChosenSlot(null);
    try {
      const qs = new URLSearchParams({
        provider_id: providerId,
        date,
        duration_minutes: String(t.duration_minutes),
      });
      const res = await fetch(`${API_BASE_URL}/external/booking/${tenantCode}/slots?${qs}`);
      if (!res.ok) {
        setSlots([]);
        setSlotsLoading(false);
        return;
      }
      const json: SlotsResp = await res.json();
      setSlots(json.data || []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [providerId, typeId, date, options, tenantCode]);

  useEffect(() => {
    if (step === "date") loadSlots();
  }, [step, loadSlots]);

  // ─── Submit ────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!providerId || !typeId || !chosenSlot) return;
    setSubmitting(true);
    setSubmitError(null);

    // chosenSlot is "HH:mm" — combine with the picked date.
    const scheduledLocal = new Date(`${date}T${chosenSlot}:00`);

    try {
      const res = await fetch(`${API_BASE_URL}/external/booking/${tenantCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          date_of_birth: form.date_of_birth || undefined,
          reason: form.reason.trim() || undefined,
          provider_id: providerId,
          appointment_type_id: typeId,
          scheduled_at: scheduledLocal.toISOString(),
          website_url: form.website_url, // honeypot
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.message || "Couldn't submit your request. Try a different time.");
        // If the slot was taken between pick and submit, refetch slots.
        if (res.status === 422) loadSlots();
        setSubmitting(false);
        return;
      }
      setConfirmation({
        reference: json.data?.reference ?? "BOOK-",
        message: json.data?.message ?? "Request received.",
      });
      setStep("confirm");
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────
  const provider = useMemo(
    () => options?.providers.find((p) => p.id === providerId) ?? null,
    [options, providerId]
  );
  const apptType = useMemo(
    () => options?.appointment_types.find((t) => t.id === typeId) ?? null,
    [options, typeId]
  );
  const formatTime = (hhmm: string): string => {
    const [h, m] = hhmm.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  // ─── Render ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.teal500 }} />
          <p className="mt-3 text-sm" style={{ color: C.slate500 }}>Loading…</p>
        </div>
      </Shell>
    );
  }

  if (error || !options) {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center py-16 px-6">
          <AlertCircle className="w-10 h-10 mb-3" style={{ color: C.red500 }} />
          <h2 className="text-lg font-semibold" style={{ color: C.navy900 }}>{error || "Booking unavailable"}</h2>
        </div>
      </Shell>
    );
  }

  if (step === "confirm" && confirmation) {
    return (
      <Shell practiceName={options.practice_name}>
        <div className="flex flex-col items-center text-center py-16 px-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#dcfce7" }}>
            <Check className="w-8 h-8" style={{ color: C.teal600 }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: C.navy900 }}>Request received</h2>
          <p className="text-sm max-w-md" style={{ color: C.slate600 }}>
            {confirmation.message} You'll get an email at <strong>{form.email}</strong> as soon as the practice confirms.
          </p>
          <div className="mt-4 text-xs font-mono px-3 py-1 rounded" style={{ backgroundColor: C.slate100, color: C.slate500 }}>
            Ref: {confirmation.reference}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell practiceName={options.practice_name} specialty={options.specialty ?? undefined}>
      {/* Step bar */}
      <div className="flex items-center gap-2 mb-6 px-2">
        <StepDot active={step === "pick"} done={step !== "pick"} label="Visit" />
        <div className="flex-1 h-px" style={{ backgroundColor: C.slate200 }} />
        <StepDot active={step === "date"} done={step === "form" || step === "confirm"} label="Time" />
        <div className="flex-1 h-px" style={{ backgroundColor: C.slate200 }} />
        <StepDot active={step === "form"} done={step === "confirm"} label="Details" />
      </div>

      {step === "pick" && (
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: C.slate600 }}>VISIT TYPE</label>
            <div className="space-y-2">
              {options.appointment_types.length === 0 && (
                <p className="text-sm italic" style={{ color: C.slate400 }}>No public booking types configured. Contact the practice directly.</p>
              )}
              {options.appointment_types.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTypeId(t.id)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors"
                  style={{
                    borderColor: typeId === t.id ? C.teal500 : C.slate200,
                    backgroundColor: typeId === t.id ? "#f0fdf4" : C.white,
                  }}
                >
                  <div>
                    <div className="text-sm font-semibold" style={{ color: C.navy900 }}>{t.name}</div>
                    <div className="text-xs flex items-center gap-2 mt-0.5" style={{ color: C.slate500 }}>
                      <Clock className="w-3 h-3" /> {t.duration_minutes} min
                      {t.is_telehealth && <><Video className="w-3 h-3 ml-1" /> Telehealth</>}
                    </div>
                  </div>
                  {typeId === t.id && <Check className="w-4 h-4" style={{ color: C.teal600 }} />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: C.slate600 }}>PROVIDER</label>
            <div className="space-y-2">
              {options.providers.length === 0 && (
                <p className="text-sm italic" style={{ color: C.slate400 }}>No providers accepting new patients.</p>
              )}
              {options.providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProviderId(p.id)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors"
                  style={{
                    borderColor: providerId === p.id ? C.teal500 : C.slate200,
                    backgroundColor: providerId === p.id ? "#f0fdf4" : C.white,
                  }}
                >
                  <div>
                    <div className="text-sm font-semibold" style={{ color: C.navy900 }}>
                      {p.name}{p.credentials ? `, ${p.credentials}` : ""}
                    </div>
                    {(p.specialty || p.title) && (
                      <div className="text-xs mt-0.5" style={{ color: C.slate500 }}>{[p.title, p.specialty].filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                  {providerId === p.id && <Check className="w-4 h-4" style={{ color: C.teal600 }} />}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              disabled={!providerId || !typeId}
              onClick={() => setStep("date")}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: C.teal600 }}
            >
              Pick a time <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === "date" && provider && apptType && (
        <div className="space-y-4">
          <SummaryRow provider={provider} apptType={apptType} />

          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: C.slate600 }}>DATE</label>
            <input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm"
              style={{ borderColor: C.slate200 }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: C.slate600 }}>AVAILABLE TIMES</label>
            {slotsLoading && (
              <div className="flex items-center gap-2 py-4 text-sm" style={{ color: C.slate500 }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Loading slots…
              </div>
            )}
            {!slotsLoading && slots.length === 0 && (
              <p className="text-sm italic py-4" style={{ color: C.slate400 }}>
                No open times that day. Try a different date.
              </p>
            )}
            {!slotsLoading && slots.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.start}
                    onClick={() => setChosenSlot(s.start)}
                    className="px-3 py-2 rounded-lg border text-sm font-medium transition-colors"
                    style={{
                      borderColor: chosenSlot === s.start ? C.teal500 : C.slate200,
                      backgroundColor: chosenSlot === s.start ? C.teal500 : C.white,
                      color: chosenSlot === s.start ? C.white : C.navy900,
                    }}
                  >
                    {formatTime(s.start)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-between">
            <button
              onClick={() => setStep("pick")}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium"
              style={{ color: C.slate500 }}
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              disabled={!chosenSlot}
              onClick={() => setStep("form")}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: C.teal600 }}
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === "form" && provider && apptType && chosenSlot && (
        <div className="space-y-4">
          <SummaryRow provider={provider} apptType={apptType} when={`${date} · ${formatTime(chosenSlot)}`} />

          {submitError && (
            <div className="rounded-lg p-3 text-sm flex items-start gap-2" style={{ backgroundColor: "#fef2f2", color: "#991b1b" }}>
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{submitError}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="First name *" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
            <FormField label="Last name *" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
          </div>
          <FormField label="Email *" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <FormField label="Phone *" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <FormField label="Date of birth *" type="date" value={form.date_of_birth} onChange={(v) => setForm({ ...form, date_of_birth: v })} />
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: C.slate600 }}>REASON FOR VISIT</label>
            <textarea
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Brief reason — helps the practice prep for your visit"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: C.slate200 }}
            />
          </div>

          {/* Honeypot — bots fill this, real users don't see it */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website_url}
            onChange={(e) => setForm({ ...form, website_url: e.target.value })}
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
            aria-hidden
          />

          <div className="pt-2 flex justify-between">
            <button
              onClick={() => setStep("date")}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium"
              style={{ color: C.slate500 }}
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              disabled={submitting || !form.first_name || !form.last_name || !form.email || !form.phone || !form.date_of_birth}
              onClick={submit}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: C.teal600 }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Request appointment
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function Shell({ children, practiceName, specialty }: { children: React.ReactNode; practiceName?: string; specialty?: string }) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.slate50, padding: "24px 16px" }}>
      <div className="mx-auto max-w-xl rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: C.white, border: `1px solid ${C.slate200}` }}>
        {practiceName && (
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${C.slate100}` }}>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: C.teal600 }} />
              <h1 className="text-base font-bold" style={{ color: C.navy900 }}>{practiceName}</h1>
            </div>
            {specialty && <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>{specialty}</p>}
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  const bg = done ? C.teal500 : active ? C.teal500 : C.slate200;
  const color = done || active ? C.white : C.slate500;
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ backgroundColor: bg, color }}
      >
        {done ? <Check className="w-3 h-3" /> : <span>{label[0]}</span>}
      </div>
      <span className={`text-xs ${active ? "font-semibold" : ""}`} style={{ color: active ? C.navy900 : C.slate500 }}>{label}</span>
    </div>
  );
}

function SummaryRow({ provider, apptType, when }: { provider: ProviderRow; apptType: AppointmentTypeRow; when?: string }) {
  return (
    <div className="rounded-lg p-3 flex items-center gap-3" style={{ backgroundColor: C.slate50, border: `1px solid ${C.slate200}` }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: C.teal500, color: C.white }}>
        {provider.name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: C.navy900 }}>{provider.name}</div>
        <div className="text-xs flex items-center gap-1.5" style={{ color: C.slate500 }}>
          {apptType.is_telehealth ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
          {apptType.name} · {apptType.duration_minutes} min
        </div>
      </div>
      {when && <div className="text-xs font-medium" style={{ color: C.slate600 }}>{when}</div>}
    </div>
  );
}

function FormField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: C.slate600 }}>{label.toUpperCase()}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border text-sm"
        style={{ borderColor: C.slate200 }}
      />
    </div>
  );
}

export default BookingWidget;
