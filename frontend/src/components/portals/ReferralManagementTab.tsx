// ===== Referral Management Tab =====
// Patient referral tracking, specialist directory, and referral workflow management

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { apiFetch } from "../../lib/api";
import {
  ArrowRight,
  Plus,
  Search,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Building2,
  Phone,
  Mail,
  MapPin,
  Send,
  Filter,
  UserPlus,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReferralStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  avgDaysToComplete: number;
}

interface Referral {
  id: string;
  patientId: string;
  patientName: string;
  specialistId: string;
  specialistName: string;
  specialty: string;
  urgency: "routine" | "urgent" | "emergent";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  reason: string;
  notes: string;
  createdAt: string;
  completedAt: string | null;
  daysOpen: number;
  responseNotes?: string;
}

interface Specialist {
  id: string;
  name: string;
  specialty: string;
  practice: string;
  phone: string;
  email: string;
  fax?: string;
  address: string;
  acceptingReferrals: boolean;
  notes?: string;
}

interface NewReferralForm {
  patientName: string;
  specialistId: string;
  reason: string;
  urgency: "routine" | "urgent" | "emergent";
  notes: string;
}

interface NewSpecialistForm {
  name: string;
  specialty: string;
  practice: string;
  phone: string;
  email: string;
  fax: string;
  address: string;
  notes: string;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_STATS: ReferralStats = {
  total: 47,
  pending: 8,
  inProgress: 12,
  completed: 24,
  avgDaysToComplete: 11.3,
};

const MOCK_SPECIALISTS: Specialist[] = [
  { id: "sp1", name: "Dr. Amanda Torres", specialty: "Cardiology", practice: "Heart & Vascular Associates", phone: "(352) 555-0200", email: "atorres@hva.com", fax: "(352) 555-0201", address: "456 Medical Dr, Clermont, FL 34711", acceptingReferrals: true, notes: "Preferred cardiologist — fast turnaround" },
  { id: "sp2", name: "Dr. Kevin Park", specialty: "Orthopedics", practice: "Central FL Ortho", phone: "(352) 555-0300", email: "kpark@cfortho.com", address: "789 Bone Ave, Orlando, FL 32801", acceptingReferrals: true },
  { id: "sp3", name: "Dr. Rachel Green", specialty: "Dermatology", practice: "Skin Health Clinic", phone: "(352) 555-0400", email: "rgreen@skinhc.com", address: "321 Derm Way, Windermere, FL 34786", acceptingReferrals: true },
  { id: "sp4", name: "Dr. Michael Cho", specialty: "Gastroenterology", practice: "GI Specialists of FL", phone: "(407) 555-0500", email: "mcho@gispec.com", fax: "(407) 555-0501", address: "654 Digestive Blvd, Orlando, FL 32819", acceptingReferrals: false, notes: "Waitlist only — 6-8 week wait" },
  { id: "sp5", name: "Dr. Lisa Martinez", specialty: "Psychiatry", practice: "Mind & Wellness Center", phone: "(407) 555-0600", email: "lmartinez@mwcenter.com", address: "147 Wellness Ln, Winter Garden, FL 34787", acceptingReferrals: true },
];

const MOCK_REFERRALS: Referral[] = [
  { id: "r1", patientId: "pt1", patientName: "James Wilson", specialistId: "sp5", specialistName: "Dr. Lisa Martinez", specialty: "Psychiatry", urgency: "routine", status: "in_progress", reason: "Medication management evaluation for depression/anxiety", notes: "Currently on Sertraline 100mg + Bupropion 150mg", createdAt: "Mar 5, 2026", completedAt: null, daysOpen: 15 },
  { id: "r2", patientId: "pt3", patientName: "James Rivera", specialistId: "sp1", specialistName: "Dr. Amanda Torres", specialty: "Cardiology", urgency: "urgent", status: "pending", reason: "Elevated BP readings during RPM monitoring", notes: "BP trending 150/95 despite medication adjustment", createdAt: "Mar 18, 2026", completedAt: null, daysOpen: 2 },
  { id: "r3", patientId: "pt6", patientName: "Lisa Patel", specialistId: "sp3", specialistName: "Dr. Rachel Green", specialty: "Dermatology", urgency: "routine", status: "completed", reason: "Suspicious mole evaluation", notes: "Left shoulder, irregular border noted during physical", createdAt: "Feb 20, 2026", completedAt: "Mar 8, 2026", daysOpen: 0, responseNotes: "Benign nevus — no further action needed" },
  { id: "r4", patientId: "pt7", patientName: "Robert Kim", specialistId: "sp2", specialistName: "Dr. Kevin Park", specialty: "Orthopedics", urgency: "routine", status: "in_progress", reason: "Chronic knee pain — possible meniscus tear", notes: "MRI ordered, awaiting results", createdAt: "Mar 10, 2026", completedAt: null, daysOpen: 10 },
  { id: "r5", patientId: "pt4", patientName: "Emily Chen", specialistId: "sp1", specialistName: "Dr. Amanda Torres", specialty: "Cardiology", urgency: "routine", status: "pending", reason: "Annual cardiac screening — family history", notes: "Mother had MI at age 52", createdAt: "Mar 17, 2026", completedAt: null, daysOpen: 3 },
  { id: "r6", patientId: "pt10", patientName: "Rachel Adams", specialistId: "sp4", specialistName: "Dr. Michael Cho", specialty: "Gastroenterology", urgency: "urgent", status: "pending", reason: "Persistent GI symptoms — rule out IBD", notes: "3 months of symptoms, not responding to empiric treatment", createdAt: "Mar 19, 2026", completedAt: null, daysOpen: 1 },
  { id: "r7", patientId: "pt2", patientName: "Sarah Mitchell", specialistId: "sp3", specialistName: "Dr. Rachel Green", specialty: "Dermatology", urgency: "routine", status: "completed", reason: "Eczema management", notes: "Topical steroids not providing relief", createdAt: "Feb 10, 2026", completedAt: "Feb 28, 2026", daysOpen: 0, responseNotes: "Switched to tacrolimus ointment — follow up in 4 weeks" },
  { id: "r8", patientId: "pt11", patientName: "Carlos Mendez", specialistId: "sp2", specialistName: "Dr. Kevin Park", specialty: "Orthopedics", urgency: "emergent", status: "in_progress", reason: "Acute shoulder injury — possible rotator cuff tear", notes: "Injury occurred during exercise, significant ROM limitation", createdAt: "Mar 16, 2026", completedAt: null, daysOpen: 4 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getUrgencyStyle(urgency: string): React.CSSProperties {
  switch (urgency) {
    case "emergent":
      return { backgroundColor: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" };
    case "urgent":
      return { backgroundColor: "#fffbeb", color: "#d97706", border: "1px solid #fef08a" };
    default:
      return { backgroundColor: "#e0e8f0", color: "#334e68", border: "1px solid #cbd5e1" };
  }
}

function getStatusStyle(status: string): { bg: string; text: string; dot: string } {
  switch (status) {
    case "completed":
      return { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" };
    case "in_progress":
      return { bg: "#e0e8f0", text: "#334e68", dot: "#486581" };
    case "cancelled":
      return { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" };
    default:
      return { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" };
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const EMPTY_REFERRAL_FORM: NewReferralForm = {
  patientName: "",
  specialistId: "",
  reason: "",
  urgency: "routine",
  notes: "",
};

const EMPTY_SPECIALIST_FORM: NewSpecialistForm = {
  name: "",
  specialty: "",
  practice: "",
  phone: "",
  email: "",
  fax: "",
  address: "",
  notes: "",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ReferralManagementTab() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Dialogs
  const [showNewReferral, setShowNewReferral] = useState(false);
  const [referralForm, setReferralForm] = useState<NewReferralForm>(EMPTY_REFERRAL_FORM);
  const [submittingReferral, setSubmittingReferral] = useState(false);

  const [showSpecialistDir, setShowSpecialistDir] = useState(false);
  const [showAddSpecialist, setShowAddSpecialist] = useState(false);
  const [specialistForm, setSpecialistForm] = useState<NewSpecialistForm>(EMPTY_SPECIALIST_FORM);
  const [submittingSpecialist, setSubmittingSpecialist] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [statsRes, refRes, specRes] = await Promise.all([
      apiFetch<ReferralStats>("/referrals/stats"),
      apiFetch<Referral[]>("/referrals"),
      apiFetch<Specialist[]>("/specialists"),
    ]);

    setStats(statsRes.data || MOCK_STATS);
    const refList = Array.isArray(refRes.data) ? refRes.data : (refRes.data as any)?.data || [];
    setReferrals(refList.length > 0 ? refList : MOCK_REFERRALS);
    const specList = Array.isArray(specRes.data) ? specRes.data : (specRes.data as any)?.data || [];
    setSpecialists(specList.length > 0 ? specList : MOCK_SPECIALISTS);

    if (statsRes.error && refRes.error && specRes.error) {
      // All failed — silently use mock data
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Close dialog on outside click
  useEffect(() => {
    if (!showNewReferral) return;
    const handler = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        setShowNewReferral(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNewReferral]);

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleCreateReferral = async () => {
    if (!referralForm.patientName || !referralForm.specialistId || !referralForm.reason) return;
    setSubmittingReferral(true);

    const specialist = specialists.find((s) => s.id === referralForm.specialistId);
    const res = await apiFetch<Referral>("/referrals", {
      method: "POST",
      body: JSON.stringify(referralForm),
    });

    const newReferral: Referral = res.data || {
      id: `r_${Date.now()}`,
      patientId: "",
      patientName: referralForm.patientName,
      specialistId: referralForm.specialistId,
      specialistName: specialist?.name || "Unknown",
      specialty: specialist?.specialty || "",
      urgency: referralForm.urgency,
      status: "pending",
      reason: referralForm.reason,
      notes: referralForm.notes,
      createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      completedAt: null,
      daysOpen: 0,
    };

    setReferrals((prev) => [newReferral, ...prev]);
    setStats((prev) =>
      prev ? { ...prev, total: prev.total + 1, pending: prev.pending + 1 } : prev
    );
    setShowNewReferral(false);
    setReferralForm(EMPTY_REFERRAL_FORM);
    setSubmittingReferral(false);
  };

  const handleCreateSpecialist = async () => {
    if (!specialistForm.name || !specialistForm.specialty) return;
    setSubmittingSpecialist(true);

    const res = await apiFetch<Specialist>("/specialists", {
      method: "POST",
      body: JSON.stringify(specialistForm),
    });

    const newSpec: Specialist = res.data || {
      id: `sp_${Date.now()}`,
      ...specialistForm,
      acceptingReferrals: true,
    };

    setSpecialists((prev) => [...prev, newSpec]);
    setShowAddSpecialist(false);
    setSpecialistForm(EMPTY_SPECIALIST_FORM);
    setSubmittingSpecialist(false);
  };

  // ─── Filtered Referrals ───────────────────────────────────────────

  const filteredReferrals = referrals.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (urgencyFilter !== "all" && r.urgency !== urgencyFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.patientName.toLowerCase().includes(q) ||
        r.specialistName.toLowerCase().includes(q) ||
        r.specialty.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
        <span className="ml-3 text-sm text-slate-500">Loading referrals...</span>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: "#fef2f2" }}
        >
          <AlertTriangle className="w-6 h-6" style={{ color: "#dc2626" }} />
        </div>
        <h3 className="text-sm font-medium text-slate-900 mb-1">Failed to load referral data</h3>
        <p className="text-sm text-slate-500 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: "#27ab83" }}
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Referral Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track and manage specialist referrals</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSpecialistDir(!showSpecialistDir)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200"
          >
            <Building2 className="w-4 h-4" />
            Specialist Directory
          </button>
          <button
            onClick={() => setShowNewReferral(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "#27ab83" }}
          >
            <Plus className="w-4 h-4" />
            New Referral
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="glass rounded-xl p-4 hover-lift text-center">
            <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
            <p className="text-xs text-slate-500 mt-1">Total Referrals</p>
          </div>
          <div className="glass rounded-xl p-4 hover-lift text-center">
            <p className="text-2xl font-bold" style={{ color: "#d97706" }}>{stats.pending}</p>
            <p className="text-xs text-slate-500 mt-1">Pending</p>
          </div>
          <div className="glass rounded-xl p-4 hover-lift text-center">
            <p className="text-2xl font-bold" style={{ color: "#334e68" }}>{stats.inProgress}</p>
            <p className="text-xs text-slate-500 mt-1">In Progress</p>
          </div>
          <div className="glass rounded-xl p-4 hover-lift text-center">
            <p className="text-2xl font-bold" style={{ color: "#2f8132" }}>{stats.completed}</p>
            <p className="text-xs text-slate-500 mt-1">Completed</p>
          </div>
          <div className="glass rounded-xl p-4 hover-lift text-center">
            <p className="text-2xl font-bold text-slate-800">{stats.avgDaysToComplete}</p>
            <p className="text-xs text-slate-500 mt-1">Avg Days to Complete</p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search referrals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="all">All Urgency</option>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="emergent">Emergent</option>
          </select>
        </div>
      </div>

      {/* Referral Table */}
      <div className="glass rounded-xl overflow-hidden">
        {filteredReferrals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "#f1f5f9" }}
            >
              <ArrowRight className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-medium text-slate-900 mb-1">No referrals found</h3>
            <p className="text-sm text-slate-500">
              {searchQuery || statusFilter !== "all" || urgencyFilter !== "all"
                ? "Try adjusting your filters"
                : "Create your first referral to get started"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-medium text-slate-500 px-6 py-3">Patient</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Referred To</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Specialty</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Urgency</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Date</th>
                  <th className="text-right text-xs font-medium text-slate-500 px-6 py-3">Days</th>
                </tr>
              </thead>
              <tbody>
                {filteredReferrals.map((referral) => {
                  const isExpanded = expandedId === referral.id;
                  const ss = getStatusStyle(referral.status);
                  return (
                    <Fragment key={referral.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : referral.id)}
                        className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-3">
                          <span className="text-sm font-medium text-slate-800">{referral.patientName}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-700">{referral.specialistName}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-600">{referral.specialty}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                            style={getUrgencyStyle(referral.urgency)}
                          >
                            {referral.urgency}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: ss.bg, color: ss.text }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ss.dot }} />
                            {formatStatus(referral.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-500">{referral.createdAt}</span>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-sm text-slate-600">
                              {referral.status === "completed" ? "—" : `${referral.daysOpen}d`}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Expanded Detail Row */}
                      {isExpanded && (
                        <tr className="border-b border-slate-100">
                          <td colSpan={7} className="px-6 py-4" style={{ backgroundColor: "#f8fafc" }}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">Reason for Referral</h4>
                                <p className="text-sm text-slate-800">{referral.reason}</p>
                                {referral.notes && (
                                  <>
                                    <h4 className="text-xs font-medium text-slate-500 uppercase mt-3 mb-1">Notes</h4>
                                    <p className="text-sm text-slate-600">{referral.notes}</p>
                                  </>
                                )}
                              </div>
                              <div>
                                {referral.responseNotes && (
                                  <>
                                    <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">Specialist Response</h4>
                                    <p className="text-sm text-slate-800">{referral.responseNotes}</p>
                                  </>
                                )}
                                {referral.completedAt && (
                                  <div className="mt-3">
                                    <span className="text-xs text-slate-500">Completed: {referral.completedAt}</span>
                                  </div>
                                )}
                                <div className="mt-3">
                                  <span className="text-xs text-slate-500">Created: {referral.createdAt}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Specialist Directory (Collapsible) */}
      {showSpecialistDir && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-800">
                  Specialist Directory ({specialists.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddSpecialist(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                  style={{ backgroundColor: "#27ab83" }}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Specialist
                </button>
                <button
                  onClick={() => setShowSpecialistDir(false)}
                  className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-50">
            {specialists.map((spec) => (
              <div key={spec.id} className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{spec.name}</span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: "#e6f7f2", color: "#147d64" }}
                      >
                        {spec.specialty}
                      </span>
                      {!spec.acceptingReferrals && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}
                        >
                          Not Accepting
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{spec.practice}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Phone className="w-3 h-3" /> {spec.phone}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Mail className="w-3 h-3" /> {spec.email}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400 mt-1">
                      <MapPin className="w-3 h-3" /> {spec.address}
                    </span>
                    {spec.notes && (
                      <p className="text-xs text-slate-500 mt-1 italic">{spec.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Referral Dialog */}
      {showNewReferral && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div ref={dialogRef} className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-screen overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">New Referral</h3>
              <button
                onClick={() => setShowNewReferral(false)}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Patient Name */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Patient Name</label>
                <input
                  type="text"
                  value={referralForm.patientName}
                  onChange={(e) => setReferralForm((f) => ({ ...f, patientName: e.target.value }))}
                  placeholder="Enter patient name"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              {/* Specialist */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Specialist</label>
                <select
                  value={referralForm.specialistId}
                  onChange={(e) => setReferralForm((f) => ({ ...f, specialistId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="">Select specialist...</option>
                  {specialists
                    .filter((s) => s.acceptingReferrals)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.specialty} ({s.practice})
                      </option>
                    ))}
                </select>
              </div>
              {/* Urgency */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Urgency</label>
                <select
                  value={referralForm.urgency}
                  onChange={(e) => setReferralForm((f) => ({ ...f, urgency: e.target.value as "routine" | "urgent" | "emergent" }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="emergent">Emergent</option>
                </select>
              </div>
              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Reason for Referral</label>
                <textarea
                  value={referralForm.reason}
                  onChange={(e) => setReferralForm((f) => ({ ...f, reason: e.target.value }))}
                  rows={3}
                  placeholder="Describe the reason for referral..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none"
                />
              </div>
              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Additional Notes</label>
                <textarea
                  value={referralForm.notes}
                  onChange={(e) => setReferralForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Relevant medical history, medications, etc."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowNewReferral(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateReferral}
                disabled={submittingReferral || !referralForm.patientName || !referralForm.specialistId || !referralForm.reason}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#27ab83" }}
              >
                <Send className="w-4 h-4" />
                {submittingReferral ? "Creating..." : "Create Referral"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Specialist Dialog */}
      {showAddSpecialist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-screen overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Add Specialist</h3>
              <button
                onClick={() => setShowAddSpecialist(false)}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Name</label>
                  <input
                    type="text"
                    value={specialistForm.name}
                    onChange={(e) => setSpecialistForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Dr. Jane Smith"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Specialty</label>
                  <input
                    type="text"
                    value={specialistForm.specialty}
                    onChange={(e) => setSpecialistForm((f) => ({ ...f, specialty: e.target.value }))}
                    placeholder="Cardiology"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Practice</label>
                <input
                  type="text"
                  value={specialistForm.practice}
                  onChange={(e) => setSpecialistForm((f) => ({ ...f, practice: e.target.value }))}
                  placeholder="Practice name"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={specialistForm.phone}
                    onChange={(e) => setSpecialistForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="(555) 123-4567"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={specialistForm.email}
                    onChange={(e) => setSpecialistForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="doctor@practice.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Fax</label>
                  <input
                    type="tel"
                    value={specialistForm.fax}
                    onChange={(e) => setSpecialistForm((f) => ({ ...f, fax: e.target.value }))}
                    placeholder="(555) 123-4568"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Address</label>
                  <input
                    type="text"
                    value={specialistForm.address}
                    onChange={(e) => setSpecialistForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="123 Medical Dr, City, ST 12345"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
                <textarea
                  value={specialistForm.notes}
                  onChange={(e) => setSpecialistForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Any relevant notes..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowAddSpecialist(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSpecialist}
                disabled={submittingSpecialist || !specialistForm.name || !specialistForm.specialty}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#27ab83" }}
              >
                <UserPlus className="w-4 h-4" />
                {submittingSpecialist ? "Adding..." : "Add Specialist"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

