// ===== MobileTodayScreen =====
//
// Phone-first triage view for practice_admin + provider. The wide-table-
// heavy desktop portal doesn't fit on a phone, but the realistic mobile
// use case is small: glance at today's schedule, see new messages, see
// what charts need signing, see if a new intake landed. Everything else
// they do on desktop.
//
// This screen is the ENTIRE mobile portal for those roles. No sidebar,
// no drawer, no 30-tab nav. Each section row links to the same desktop
// view they'd reach via the sidebar — on phone that's still the existing
// (cramped) view, but at least the deep link works.
//
// Renders only when window.innerWidth < 768 (mobile breakpoint) AND the
// user is practice_admin / provider. SuperAdmin and staff still see the
// desktop shell since they have less use for "today" triage.

import { useState, useEffect } from "react";
import {
  Calendar,
  MessageSquare,
  Stethoscope,
  ClipboardList,
  ChevronRight,
  Loader2,
  LogOut,
  Monitor,
} from "lucide-react";
import {
  appointmentService,
  messageService,
  encounterService,
  apiFetch,
} from "../../lib/api";

interface TodayCounts {
  appointmentsToday: number;
  unreadMessages: number;
  unsignedEncounters: number;
  pendingIntakes: number;
  loading: boolean;
}

interface AppointmentRow {
  id: string;
  patientName: string;
  scheduledAt: string;
  type?: string;
  status?: string;
}

interface MobileTodayScreenProps {
  userName: string;
  roleLabel: string;
  onNavigate: (tabId: string) => void;
  onLogout: () => void;
}

export function MobileTodayScreen({ userName, roleLabel, onNavigate, onLogout }: MobileTodayScreenProps) {
  const [counts, setCounts] = useState<TodayCounts>({
    appointmentsToday: 0,
    unreadMessages: 0,
    unsignedEncounters: 0,
    pendingIntakes: 0,
    loading: true,
  });
  const [appts, setAppts] = useState<AppointmentRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [todayRes, msgRes, encRes, intakeRes] = await Promise.allSettled([
        appointmentService.today(),
        messageService.getUnreadCount(),
        encounterService.list({ status: "draft" }),
        apiFetch<unknown[]>("/intakes").catch(() => ({ data: [] })),
      ]);

      if (cancelled) return;

      // Appointments: surface the next 5 by start time. The API returns
      // today's appointments in the practice's local TZ — we don't need
      // to refilter, just sort.
      let apptList: AppointmentRow[] = [];
      let apptCount = 0;
      if (todayRes.status === "fulfilled" && todayRes.value.data) {
        const raw = Array.isArray(todayRes.value.data) ? todayRes.value.data : [];
        apptCount = raw.length;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apptList = (raw as any[])
          .map((a) => {
            const patientName = [
              a.patient?.firstName ?? a.patient?.first_name,
              a.patient?.lastName ?? a.patient?.last_name,
            ]
              .filter(Boolean)
              .join(" ")
              .trim() || a.patientName || "Patient";
            return {
              id: a.id,
              patientName,
              scheduledAt: a.scheduledAt ?? a.scheduled_at ?? "",
              type: a.appointmentType?.name ?? a.appointment_type?.name ?? a.type,
              status: a.status,
            };
          })
          .sort((x, y) => (x.scheduledAt > y.scheduledAt ? 1 : -1))
          .slice(0, 5);
      }

      const unreadMessages =
        msgRes.status === "fulfilled" ? (msgRes.value.data?.count ?? 0) : 0;

      const unsignedEncounters =
        encRes.status === "fulfilled" && Array.isArray(encRes.value.data)
          ? encRes.value.data.length
          : 0;

      // Intakes endpoint returns pending widget submissions. We just
      // count them — the deep link sends the user to the full list.
      let pendingIntakes = 0;
      if (intakeRes.status === "fulfilled" && intakeRes.value.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = Array.isArray(intakeRes.value.data) ? intakeRes.value.data : (intakeRes.value.data as any).data || [];
        pendingIntakes = raw.length;
      }

      setAppts(apptList);
      setCounts({
        appointmentsToday: apptCount,
        unreadMessages,
        unsignedEncounters,
        pendingIntakes,
        loading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <header
        className="px-4 py-4 flex items-center justify-between"
        style={{ backgroundColor: "#102a43", color: "#ffffff" }}
      >
        <div className="min-w-0">
          <p className="text-xs opacity-70 truncate">{roleLabel}</p>
          <h1 className="text-lg font-semibold truncate">{userName}</h1>
        </div>
        <button
          onClick={onLogout}
          aria-label="Sign out"
          className="p-2 rounded-lg"
          style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* ─── Today's overview ──────────────────────────────────────────────── */}
      <main className="flex-1 p-4 space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Today</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {counts.loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Counter grid — 2x2 quick-glance numbers. Tapping a card
                jumps to the relevant desktop tab. */}
            <div className="grid grid-cols-2 gap-3">
              <CounterCard
                label="Appointments"
                value={counts.appointmentsToday}
                icon={Calendar}
                tint="#0e6651"
                onTap={() => onNavigate("appointments")}
              />
              <CounterCard
                label="Unread"
                value={counts.unreadMessages}
                icon={MessageSquare}
                tint="#635bff"
                onTap={() => onNavigate("messages")}
              />
              <CounterCard
                label="Unsigned charts"
                value={counts.unsignedEncounters}
                icon={Stethoscope}
                tint="#c2410c"
                onTap={() => onNavigate("encounters")}
              />
              <CounterCard
                label="New intakes"
                value={counts.pendingIntakes}
                icon={ClipboardList}
                tint="#1d4ed8"
                onTap={() => onNavigate("intakes")}
              />
            </div>

            {/* Today's schedule — first 5 appointments. Each row taps
                through to the appointments view (desktop layout still). */}
            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Schedule</h3>
                <button
                  onClick={() => onNavigate("appointments")}
                  className="text-xs font-medium"
                  style={{ color: "#0e6651" }}
                >
                  View all
                </button>
              </div>
              {appts.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">
                  No appointments today.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {appts.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => onNavigate("appointments")}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50"
                      >
                        <div
                          className="w-12 text-center flex-shrink-0"
                        >
                          <p className="text-sm font-semibold text-slate-900">
                            {formatTime(a.scheduledAt)}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {a.patientName}
                          </p>
                          {a.type && (
                            <p className="text-xs text-slate-500 truncate">{a.type}</p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* "Open on desktop" hint — phone is for triage, full work
                happens on the laptop. */}
            <div
              className="rounded-xl p-3 flex items-start gap-2 text-xs"
              style={{ backgroundColor: "#f0fdf4", color: "#0e6651" }}
            >
              <Monitor className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                Charting, billing, and admin tools are designed for desktop. Open
                MemberMD on your computer to access them.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

interface CounterCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  onTap: () => void;
}

function CounterCard({ label, value, icon: Icon, tint, onTap }: CounterCardProps) {
  return (
    <button
      onClick={onTap}
      className="bg-white rounded-xl border border-slate-200 p-4 text-left active:bg-slate-50"
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${tint}1a`, color: tint }}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </button>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}
