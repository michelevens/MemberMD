// ===== Communications Tab =====
// SLA dashboard, communication stats, patient timeline, phone call logging
// Unified view of all communication channels for DPC practice

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/api";
import {
  Search,
  Phone,
  Mail,
  MessageSquare,
  Video,
  FileText,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  AlertTriangle,
  X,
  CheckCircle2,
  XCircle,
  Timer,
  Smartphone,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SlaStatus {
  withinSla: number;
  breached: number;
  pending: number;
  avgResponseMinutes: number;
}

interface ChannelStats {
  channel: string;
  count: number;
}

interface CommunicationEntry {
  id: string;
  channel: "portal" | "sms" | "email" | "telehealth" | "phone" | "fax";
  direction: "inbound" | "outbound";
  subject: string;
  summary: string;
  timestamp: string;
  durationMinutes?: number;
  senderName: string;
  recipientName: string;
}

// ─── Channel Config ──────────────────────────────────────────────────────────

const CHANNEL_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  portal: { icon: MessageSquare, color: "#3b82f6", bg: "#e0ecff", label: "Portal" },
  sms: { icon: Smartphone, color: "#27ab83", bg: "#e6f7f2", label: "SMS" },
  email: { icon: Mail, color: "#7c3aed", bg: "#f3e8ff", label: "Email" },
  telehealth: { icon: Video, color: "#0891b2", bg: "#e0f7fa", label: "Telehealth" },
  phone: { icon: Phone, color: "#d97706", bg: "#fffbeb", label: "Phone" },
  fax: { icon: FileText, color: "#64748b", bg: "#f1f5f9", label: "Fax" },
};

// ─── Dialog Overlay ──────────────────────────────────────────────────────────

function DialogOverlay({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CommunicationsTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SLA & stats
  const [slaStatus, setSlaStatus] = useState<SlaStatus | null>(null);
  const [channelStats, setChannelStats] = useState<ChannelStats[]>([]);

  // Patient search & timeline
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedPatientName, setSelectedPatientName] = useState("");
  const [timeline, setTimeline] = useState<CommunicationEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Log phone call
  const [showLogCall, setShowLogCall] = useState(false);
  const [callForm, setCallForm] = useState({ patientName: "", patientId: "", durationMinutes: "", notes: "" });
  const [submittingCall, setSubmittingCall] = useState(false);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [slaRes, statsRes] = await Promise.all([
      apiFetch<SlaStatus>("/communications/sla-status"),
      apiFetch<{ channels: ChannelStats[] }>("/communications/stats"),
    ]);
    if (slaRes.error) setError(slaRes.error);
    else setSlaStatus(slaRes.data || null);

    if (statsRes.data) setChannelStats(statsRes.data.channels || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const loadTimeline = useCallback(async (patientId: string) => {
    setTimelineLoading(true);
    const res = await apiFetch<CommunicationEntry[]>(`/communications/patient/${patientId}/timeline`);
    if (res.error) {
      setError(res.error);
    } else {
      setTimeline(res.data || []);
    }
    setTimelineLoading(false);
  }, []);

  // ─── Patient Search Handler ──────────────────────────────────────────────

  const handlePatientSearch = () => {
    if (!patientSearch.trim()) return;
    // In a real app this would search an endpoint; here we use the search string as ID
    setSelectedPatientId(patientSearch.trim());
    setSelectedPatientName(patientSearch.trim());
    loadTimeline(patientSearch.trim());
  };

  const handlePatientSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handlePatientSearch();
  };

  // ─── Log Phone Call ──────────────────────────────────────────────────────

  const handleLogCall = async () => {
    setSubmittingCall(true);
    const res = await apiFetch<CommunicationEntry>("/communications/log-call", {
      method: "POST",
      body: JSON.stringify({
        patientId: callForm.patientId || callForm.patientName,
        durationMinutes: parseInt(callForm.durationMinutes),
        notes: callForm.notes,
      }),
    });
    if (res.error) {
      setError(res.error);
    } else {
      setShowLogCall(false);
      setCallForm({ patientName: "", patientId: "", durationMinutes: "", notes: "" });
      // Refresh timeline if viewing the same patient
      if (selectedPatientId && (callForm.patientId === selectedPatientId || callForm.patientName === selectedPatientName)) {
        loadTimeline(selectedPatientId);
      }
      loadDashboard();
    }
    setSubmittingCall(false);
  };

  // ─── Computed ─────────────────────────────────────────────────────────────

  const maxChannelCount = Math.max(...channelStats.map((s) => s.count), 1);

  // ─── Format duration ─────────────────────────────────────────────────────

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}
        >
          <AlertTriangle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="ml-3 text-slate-500">Loading...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* ─── SLA Dashboard ──────────────────────────────────────────── */}
          {slaStatus && (
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-3">SLA Dashboard</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Within SLA */}
                <div className="glass rounded-xl p-5 hover-lift">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#ecf9ec" }}>
                      <CheckCircle2 className="w-5 h-5" style={{ color: "#2f8132" }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{slaStatus.withinSla}</p>
                  <p className="text-sm text-slate-500 mt-0.5">Within SLA</p>
                </div>

                {/* Breached */}
                <div className="glass rounded-xl p-5 hover-lift">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#fef2f2" }}>
                      <XCircle className="w-5 h-5" style={{ color: "#dc2626" }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{slaStatus.breached}</p>
                  <p className="text-sm text-slate-500 mt-0.5">Breached</p>
                </div>

                {/* Pending */}
                <div className="glass rounded-xl p-5 hover-lift">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#fffbeb" }}>
                      <Timer className="w-5 h-5" style={{ color: "#d97706" }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{slaStatus.pending}</p>
                  <p className="text-sm text-slate-500 mt-0.5">Pending</p>
                </div>

                {/* Avg Response Time */}
                <div className="glass rounded-xl p-5 hover-lift">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#e0ecff" }}>
                      <Clock className="w-5 h-5" style={{ color: "#1e40af" }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{formatDuration(slaStatus.avgResponseMinutes)}</p>
                  <p className="text-sm text-slate-500 mt-0.5">Avg Response Time</p>
                </div>
              </div>
            </div>
          )}

          {/* ─── Communication Stats ────────────────────────────────────── */}
          {channelStats.length > 0 && (
            <div className="glass rounded-xl p-5">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Volume by Channel</h3>
              <div className="space-y-3">
                {channelStats.map((stat) => {
                  const cfg = CHANNEL_CONFIG[stat.channel] || CHANNEL_CONFIG.portal;
                  const Icon = cfg.icon;
                  const pct = (stat.count / maxChannelCount) * 100;
                  return (
                    <div key={stat.channel} className="flex items-center gap-3">
                      <div className="flex items-center gap-2 w-28 flex-shrink-0">
                        <div
                          className="w-7 h-7 rounded flex items-center justify-center"
                          style={{ backgroundColor: cfg.bg }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                        </div>
                        <span className="text-sm font-medium text-slate-700">{cfg.label}</span>
                      </div>
                      <div className="flex-1 h-6 rounded-full overflow-hidden" style={{ backgroundColor: "#f1f5f9" }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: cfg.color }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-slate-700 w-10 text-right">{stat.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Patient Search ──────────────────────────────────────────── */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Patient Communication Timeline</h3>
              <button
                onClick={() => setShowLogCall(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: "#27ab83" }}
              >
                <Phone className="w-4 h-4" />
                Log Phone Call
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search patient name or ID..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  onKeyDown={handlePatientSearchKeyDown}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                onClick={handlePatientSearch}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: "#3b82f6" }}
              >
                Search
              </button>
            </div>

            {/* Timeline */}
            {timelineLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                <span className="ml-2 text-sm text-slate-500">Loading timeline...</span>
              </div>
            )}

            {!timelineLoading && selectedPatientId && timeline.length === 0 && (
              <div className="text-center py-8 text-slate-400">No communications found for this patient.</div>
            )}

            {!timelineLoading && timeline.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-slate-500 mb-3">
                  Showing {timeline.length} communication{timeline.length !== 1 ? "s" : ""} for{" "}
                  <strong className="text-slate-700">{selectedPatientName}</strong>
                </p>
                <div className="relative">
                  {/* Vertical timeline line */}
                  <div
                    className="absolute left-5 top-0 bottom-0 w-px"
                    style={{ backgroundColor: "#e2e8f0" }}
                  />

                  {timeline.map((entry) => {
                    const cfg = CHANNEL_CONFIG[entry.channel] || CHANNEL_CONFIG.portal;
                    const Icon = cfg.icon;
                    const isInbound = entry.direction === "inbound";

                    return (
                      <div key={entry.id} className="relative flex gap-4 py-3 pl-2">
                        {/* Channel icon */}
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 border-white"
                          style={{ backgroundColor: cfg.bg }}
                        >
                          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Channel badge */}
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                              style={{ backgroundColor: cfg.bg, color: cfg.color }}
                            >
                              {cfg.label}
                            </span>

                            {/* Direction */}
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                              {isInbound ? (
                                <>
                                  <ArrowDownLeft className="w-3 h-3" style={{ color: "#3b82f6" }} />
                                  Inbound
                                </>
                              ) : (
                                <>
                                  <ArrowUpRight className="w-3 h-3" style={{ color: "#27ab83" }} />
                                  Outbound
                                </>
                              )}
                            </span>

                            {/* Duration for calls/telehealth */}
                            {entry.durationMinutes != null && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                                <Clock className="w-3 h-3" />
                                {formatDuration(entry.durationMinutes)}
                              </span>
                            )}

                            {/* Timestamp */}
                            <span className="text-xs text-slate-400 ml-auto">{entry.timestamp}</span>
                          </div>

                          {/* Subject */}
                          <p className="text-sm font-medium text-slate-800 mt-1">{entry.subject}</p>
                          {entry.summary && (
                            <p className="text-sm text-slate-500 mt-0.5">{entry.summary}</p>
                          )}

                          {/* Sender/Recipient */}
                          <p className="text-xs text-slate-400 mt-1">
                            {isInbound ? `From: ${entry.senderName}` : `To: ${entry.recipientName}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!selectedPatientId && !timelineLoading && (
              <div className="text-center py-8 text-slate-400">
                Search for a patient to view their communication timeline.
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Log Phone Call Dialog ──────────────────────────────────────── */}
      <DialogOverlay open={showLogCall} onClose={() => setShowLogCall(false)} title="Log Phone Call">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
            <input
              type="text"
              value={callForm.patientName}
              onChange={(e) => setCallForm({ ...callForm, patientName: e.target.value, patientId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Search patient name..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Duration (minutes)</label>
            <input
              type="number"
              min="1"
              value={callForm.durationMinutes}
              onChange={(e) => setCallForm({ ...callForm, durationMinutes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="15"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={callForm.notes}
              onChange={(e) => setCallForm({ ...callForm, notes: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              placeholder="Call notes and summary..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowLogCall(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleLogCall}
              disabled={!callForm.patientName || !callForm.durationMinutes || submittingCall}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#27ab83" }}
            >
              {submittingCall ? "Saving..." : "Log Call"}
            </button>
          </div>
        </div>
      </DialogOverlay>
    </div>
  );
}
