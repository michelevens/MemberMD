// ===== EngagementSection =====
// Patient engagement dashboard: campaigns, at-risk patients, scoring analytics

import { useState, useEffect, useCallback } from "react";
import {
  Heart,
  AlertTriangle,
  TrendingUp,
  Users,
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Activity,
  ChevronDown,
  ChevronUp,
  Eye,
  Search,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { engagementService } from "../../lib/api";
import {
  colors,
  Badge,
  Button,
  StatCard,
  SubTabNav,
  Modal,
  ProgressBar,
  Skeleton,
  EmptyIllustration,
  SectionHeader,
} from "../../components/ui/design-system";
import type {
  EngagementCampaign,
  PatientEngagementScore,
  EngagementAnalyticsSummary,
  CampaignTriggerType,
  CampaignActionType,
  CampaignAudienceFilter,
  CampaignStatus,
  RiskLevel,
} from "../../types";

// ─── Risk Level Config ──────────────────────────────────────────────────────

const RISK_COLORS: Record<RiskLevel, { bg: string; text: string; label: string; badgeVariant: "success" | "info" | "warning" | "danger" }> = {
  low: { bg: colors.green50, text: colors.green600, label: "Highly Engaged", badgeVariant: "success" },
  normal: { bg: colors.blue50, text: colors.blue500, label: "Engaged", badgeVariant: "info" },
  high: { bg: colors.amber50, text: colors.amber600, label: "At Risk", badgeVariant: "warning" },
  at_risk: { bg: colors.red50, text: colors.red600, label: "Critical Risk", badgeVariant: "danger" },
};

const TRIGGER_LABELS: Record<CampaignTriggerType, string> = {
  no_visit: "No Visit",
  no_message_response: "No Message Response",
  low_engagement: "Low Engagement",
  manual: "Manual",
};

const ACTION_LABELS: Record<CampaignActionType, string> = {
  send_email: "Send Email",
  send_sms: "Send SMS",
  send_message: "Send Message",
};

const STATUS_BADGE_VARIANT: Record<CampaignStatus, "success" | "neutral" | "warning"> = {
  active: "success",
  inactive: "neutral",
  paused: "warning",
};

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_SUMMARY: EngagementAnalyticsSummary = {
  totalPatients: 85,
  atRiskPatients: 12,
  highEngagement: 48,
  averageEngagementScore: 68,
  activeCampaigns: 3,
  recentLogs: [],
};

const MOCK_CAMPAIGNS: EngagementCampaign[] = [
  {
    id: "c1", tenantId: "t1", name: "Re-engage Inactive Patients", description: "Reach out to patients who haven't visited in 60+ days",
    triggerType: "no_visit", triggerConfig: { days: 60 }, actionType: "send_email",
    actionConfig: { subject: "We miss you!", body: "It's been a while since your last visit. Schedule a checkup today.", channels: ["email", "in_app"] },
    audienceFilter: "all", audienceConfig: null, status: "active", activatedAt: "2026-03-15T00:00:00Z",
    createdBy: "u1", creator: { id: "u1", firstName: "Jane", lastName: "Admin" },
    createdAt: "2026-03-15T00:00:00Z", updatedAt: "2026-03-15T00:00:00Z",
  },
  {
    id: "c2", tenantId: "t1", name: "Low Engagement Follow-Up", description: "Follow up with patients scoring below 50",
    triggerType: "low_engagement", triggerConfig: { engagement_score: 50 }, actionType: "send_message",
    actionConfig: { subject: "How can we help?", body: "We noticed you may need additional support. Reply to connect with your provider.", channels: ["in_app"] },
    audienceFilter: "all", audienceConfig: null, status: "active", activatedAt: "2026-03-20T00:00:00Z",
    createdBy: "u1", creator: { id: "u1", firstName: "Jane", lastName: "Admin" },
    createdAt: "2026-03-20T00:00:00Z", updatedAt: "2026-03-20T00:00:00Z",
  },
  {
    id: "c3", tenantId: "t1", name: "Annual Wellness Check", description: "Manual campaign for annual wellness reminders",
    triggerType: "manual", triggerConfig: {}, actionType: "send_email",
    actionConfig: { subject: "Time for your annual wellness visit", body: "Schedule your annual wellness exam today.", channels: ["email"] },
    audienceFilter: "by_plan", audienceConfig: { plan_ids: ["p1", "p2"] }, status: "paused", activatedAt: null,
    createdBy: "u1", creator: { id: "u1", firstName: "Jane", lastName: "Admin" },
    createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-03-25T00:00:00Z",
  },
];

const MOCK_AT_RISK: PatientEngagementScore[] = [
  { id: "es1", tenantId: "t1", patientId: "pat1", overallScore: 22, visitFrequencyScore: 10, messageResponsivenessScore: 30, screeningCompletionScore: 20, portalLoginScore: 15, noShowRateScore: 40, lastVisitDaysAgo: 95, appointmentsThisMonth: 0, noShowCount6m: 3, riskLevel: "at_risk", engagementFlags: ["no_visit_90d", "high_no_show_rate"], lastCalculatedAt: "2026-04-02T01:00:00Z", patient: { id: "pat1", user: { firstName: "Maria", lastName: "Santos" } } as PatientEngagementScore["patient"] },
  { id: "es2", tenantId: "t1", patientId: "pat2", overallScore: 35, visitFrequencyScore: 30, messageResponsivenessScore: 20, screeningCompletionScore: 50, portalLoginScore: 40, noShowRateScore: 60, lastVisitDaysAgo: 72, appointmentsThisMonth: 0, noShowCount6m: 1, riskLevel: "high", engagementFlags: ["no_visit_60d", "low_message_response"], lastCalculatedAt: "2026-04-02T01:00:00Z", patient: { id: "pat2", user: { firstName: "James", lastName: "Wilson" } } as PatientEngagementScore["patient"] },
  { id: "es3", tenantId: "t1", patientId: "pat3", overallScore: 28, visitFrequencyScore: 20, messageResponsivenessScore: 15, screeningCompletionScore: 30, portalLoginScore: 35, noShowRateScore: 50, lastVisitDaysAgo: 120, appointmentsThisMonth: 0, noShowCount6m: 2, riskLevel: "at_risk", engagementFlags: ["no_visit_90d", "low_message_response"], lastCalculatedAt: "2026-04-02T01:00:00Z", patient: { id: "pat3", user: { firstName: "Linda", lastName: "Chen" } } as PatientEngagementScore["patient"] },
  { id: "es4", tenantId: "t1", patientId: "pat4", overallScore: 42, visitFrequencyScore: 40, messageResponsivenessScore: 35, screeningCompletionScore: 50, portalLoginScore: 50, noShowRateScore: 55, lastVisitDaysAgo: 45, appointmentsThisMonth: 1, noShowCount6m: 1, riskLevel: "high", engagementFlags: ["low_message_response"], lastCalculatedAt: "2026-04-02T01:00:00Z", patient: { id: "pat4", user: { firstName: "Robert", lastName: "Brown" } } as PatientEngagementScore["patient"] },
];

// ─── Sub-tabs ───────────────────────────────────────────────────────────────

type SubTab = "overview" | "campaigns" | "at-risk";

// ─── Pie chart colors ───────────────────────────────────────────────────────

const PIE_COLORS: Record<RiskLevel, string> = {
  low: colors.green500,
  normal: colors.blue500,
  high: colors.amber500,
  at_risk: colors.red500,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function EngagementSection() {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [summary, setSummary] = useState<EngagementAnalyticsSummary>(MOCK_SUMMARY);
  const [campaigns, setCampaigns] = useState<EngagementCampaign[]>(MOCK_CAMPAIGNS);
  const [atRiskPatients, setAtRiskPatients] = useState<PatientEngagementScore[]>(MOCK_AT_RISK);
  const [loading, setLoading] = useState(false);
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "at_risk">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Campaign form
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<EngagementCampaign | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: "", description: "", triggerType: "no_visit" as CampaignTriggerType,
    triggerDays: "60", triggerScore: "50", triggerResponseRate: "30",
    actionType: "send_email" as CampaignActionType, subject: "", body: "",
    audienceFilter: "all" as CampaignAudienceFilter,
  });
  const [formLoading, setFormLoading] = useState(false);

  // Score detail
  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } }, [toast]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, campaignsRes, atRiskRes] = await Promise.allSettled([
        engagementService.getAnalyticsSummary(),
        engagementService.listCampaigns(),
        engagementService.getAtRiskPatients(),
      ]);
      if (summaryRes.status === "fulfilled" && summaryRes.value.data) setSummary(summaryRes.value.data);
      if (campaignsRes.status === "fulfilled" && campaignsRes.value.data && Array.isArray(campaignsRes.value.data)) setCampaigns(campaignsRes.value.data);
      if (atRiskRes.status === "fulfilled" && atRiskRes.value.data && Array.isArray(atRiskRes.value.data)) setAtRiskPatients(atRiskRes.value.data);
    } catch { /* mock fallback */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openNewCampaign = () => {
    setEditingCampaign(null);
    setCampaignForm({ name: "", description: "", triggerType: "no_visit", triggerDays: "60", triggerScore: "50", triggerResponseRate: "30", actionType: "send_email", subject: "", body: "", audienceFilter: "all" });
    setShowCampaignForm(true);
  };

  const openEditCampaign = (c: EngagementCampaign) => {
    setEditingCampaign(c);
    setCampaignForm({
      name: c.name, description: c.description || "",
      triggerType: c.triggerType,
      triggerDays: String(c.triggerConfig.days || 60),
      triggerScore: String(c.triggerConfig.engagement_score || 50),
      triggerResponseRate: String((c.triggerConfig.response_rate_threshold || 0.3) * 100),
      actionType: c.actionType, subject: c.actionConfig.subject || "", body: c.actionConfig.body || "",
      audienceFilter: c.audienceFilter,
    });
    setShowCampaignForm(true);
  };

  const saveCampaign = async () => {
    setFormLoading(true);
    const triggerConfig: Record<string, unknown> = {};
    if (campaignForm.triggerType === "no_visit") triggerConfig.days = parseInt(campaignForm.triggerDays);
    if (campaignForm.triggerType === "low_engagement") triggerConfig.engagement_score = parseInt(campaignForm.triggerScore);
    if (campaignForm.triggerType === "no_message_response") triggerConfig.response_rate_threshold = parseInt(campaignForm.triggerResponseRate) / 100;

    const data: Partial<EngagementCampaign> = {
      name: campaignForm.name,
      description: campaignForm.description || null,
      triggerType: campaignForm.triggerType,
      triggerConfig,
      actionType: campaignForm.actionType,
      actionConfig: { subject: campaignForm.subject, body: campaignForm.body, channels: [campaignForm.actionType === "send_email" ? "email" : "in_app"] },
      audienceFilter: campaignForm.audienceFilter,
      audienceConfig: null,
    };

    try {
      if (editingCampaign) {
        const res = await engagementService.updateCampaign(editingCampaign.id, data);
        if (res.data) {
          setCampaigns(prev => prev.map(c => c.id === editingCampaign.id ? { ...c, ...res.data } : c));
          setToast({ message: "Campaign updated", type: "success" });
        }
      } else {
        const res = await engagementService.createCampaign(data);
        if (res.data) {
          setCampaigns(prev => [res.data!, ...prev]);
          setToast({ message: "Campaign created", type: "success" });
        }
      }
      setShowCampaignForm(false);
    } catch {
      setToast({ message: "Failed to save campaign", type: "error" });
    }
    setFormLoading(false);
  };

  const deleteCampaign = async (id: string) => {
    try {
      await engagementService.deleteCampaign(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      setToast({ message: "Campaign deleted", type: "success" });
    } catch {
      setToast({ message: "Failed to delete campaign", type: "error" });
    }
  };

  const toggleCampaignStatus = async (c: EngagementCampaign) => {
    const newStatus: CampaignStatus = c.status === "active" ? "paused" : "active";
    try {
      const res = await engagementService.updateCampaign(c.id, { status: newStatus });
      if (res.data) {
        setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status: newStatus } : x));
        setToast({ message: `Campaign ${newStatus}`, type: "success" });
      }
    } catch {
      setToast({ message: "Failed to update campaign", type: "error" });
    }
  };

  const filteredAtRisk = atRiskPatients.filter(p => {
    if (riskFilter !== "all" && p.riskLevel !== riskFilter) return false;
    if (searchQuery) {
      const name = `${p.patient?.user?.firstName || ""} ${p.patient?.user?.lastName || ""}`.toLowerCase();
      if (!name.includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  });

  const engagementPercent = summary.totalPatients > 0 ? Math.round((summary.highEngagement / summary.totalPatients) * 100) : 0;

  // ─── Pie chart data ─────────────────────────────────────────────────────────

  const pieData = (["low", "normal", "high", "at_risk"] as RiskLevel[]).map(level => {
    const count = atRiskPatients.filter(p => p.riskLevel === level).length + (level === "low" ? summary.highEngagement : 0);
    return { name: RISK_COLORS[level].label, value: count, riskLevel: level };
  });

  // ─── Sub-tab nav ──────────────────────────────────────────────────────────

  const tabs: { id: string; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "campaigns", label: "Campaigns", icon: Megaphone, count: campaigns.length },
    { id: "at-risk", label: "At-Risk Patients", icon: AlertTriangle, count: atRiskPatients.length },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium"
          style={{ backgroundColor: toast.type === "success" ? colors.green600 : colors.red600 }}
          role="alert"
        >
          {toast.message}
        </div>
      )}

      {/* Sub-tab Navigation */}
      <SubTabNav
        tabs={tabs}
        activeTab={subTab}
        onChange={(id) => setSubTab(id as SubTab)}
      />

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} type="stat" />
            ))}
          </div>
          <Skeleton type="card" />
          <Skeleton type="card" />
        </div>
      )}

      {/* ─── Overview ─────────────────────────────────────────────────────── */}
      {subTab === "overview" && !loading && (
        <div className="space-y-6 animate-fade-in-up" role="tabpanel" aria-label="Engagement overview">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Scored Patients", value: summary.totalPatients, icon: Users, color: colors.blue500, bg: colors.blue50 },
              { label: "At-Risk Patients", value: summary.atRiskPatients, icon: AlertTriangle, color: colors.red500, bg: colors.red50 },
              { label: "Highly Engaged", value: `${engagementPercent}%`, icon: Heart, color: colors.green500, bg: colors.green50 },
              { label: "Avg Engagement Score", value: Math.round(summary.averageEngagementScore || 0), icon: TrendingUp, color: colors.teal500, bg: colors.teal50 },
            ].map((stat, i) => (
              <div key={i} className="animate-count-pop">
                <StatCard
                  label={stat.label}
                  value={stat.value}
                  icon={stat.icon}
                  color={stat.color}
                  bg={stat.bg}
                />
              </div>
            ))}
          </div>

          {/* Risk Distribution with PieChart */}
          <div className="rounded-xl shadow-sm border p-6" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
            <SectionHeader title="Risk Distribution" />
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart */}
              <div className="flex items-center justify-center" style={{ minHeight: 220 }}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      animationDuration={800}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.riskLevel} fill={PIE_COLORS[entry.riskLevel]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: `1px solid ${colors.slate200}`,
                        fontSize: 13,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend cards */}
              <div className="grid grid-cols-2 gap-3">
                {pieData.map(entry => {
                  const cfg = RISK_COLORS[entry.riskLevel];
                  return (
                    <div key={entry.riskLevel} className="rounded-lg p-4 text-center" style={{ backgroundColor: cfg.bg }}>
                      <div className="text-xl font-bold animate-count-pop" style={{ color: cfg.text }}>{entry.value}</div>
                      <div className="text-xs font-medium mt-1" style={{ color: cfg.text }}>{cfg.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Campaigns Summary */}
          <div className="rounded-xl shadow-sm border p-6 animate-fade-in-up" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
            <div className="flex items-center justify-between mb-4">
              <SectionHeader title="Active Campaigns" />
              <span className="text-2xl font-bold animate-count-pop" style={{ color: colors.teal500 }}>{summary.activeCampaigns}</span>
            </div>
            <div className="space-y-2">
              {campaigns.filter(c => c.status === "active").slice(0, 3).map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ backgroundColor: colors.slate50 }}>
                  <div>
                    <span className="text-sm font-medium" style={{ color: colors.navy900 }}>{c.name}</span>
                    <span className="ml-2 text-xs" style={{ color: colors.slate500 }}>{TRIGGER_LABELS[c.triggerType]}</span>
                  </div>
                  <Badge variant="success">Active</Badge>
                </div>
              ))}
              {campaigns.filter(c => c.status === "active").length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: colors.slate400 }}>No active campaigns</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Campaigns ────────────────────────────────────────────────────── */}
      {subTab === "campaigns" && !loading && (
        <div className="space-y-4 animate-fade-in-up" role="tabpanel" aria-label="Engagement campaigns">
          <SectionHeader
            title="Engagement Campaigns"
            action={
              <Button onClick={openNewCampaign} icon={<Plus size={16} />}>
                New Campaign
              </Button>
            }
          />

          {/* Campaign Cards */}
          <div className="space-y-3">
            {campaigns.map(c => (
              <div key={c.id} className="rounded-xl shadow-sm border p-5" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="text-sm font-semibold" style={{ color: colors.navy900 }}>{c.name}</h4>
                      <Badge variant={STATUS_BADGE_VARIANT[c.status]}>{c.status}</Badge>
                    </div>
                    {c.description && <p className="text-xs mb-2" style={{ color: colors.slate500 }}>{c.description}</p>}
                    <div className="flex flex-wrap gap-4 text-xs" style={{ color: colors.slate600 }}>
                      <span>Trigger: <strong>{TRIGGER_LABELS[c.triggerType]}</strong></span>
                      <span>Action: <strong>{ACTION_LABELS[c.actionType]}</strong></span>
                      <span>Audience: <strong>{c.audienceFilter}</strong></span>
                      {c.creator && <span>By: {c.creator.firstName} {c.creator.lastName}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCampaignStatus(c)}
                      aria-label={c.status === "active" ? "Pause campaign" : "Activate campaign"}
                      style={{ backgroundColor: c.status === "active" ? colors.amber50 : colors.green50 }}
                    >
                      {c.status === "active"
                        ? <ChevronDown size={14} style={{ color: colors.amber600 }} />
                        : <ChevronUp size={14} style={{ color: colors.green600 }} />
                      }
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditCampaign(c)}
                      aria-label="Edit campaign"
                      style={{ backgroundColor: colors.blue50 }}
                    >
                      <Pencil size={14} style={{ color: colors.blue500 }} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCampaign(c.id)}
                      aria-label="Delete campaign"
                      style={{ backgroundColor: colors.red50 }}
                    >
                      <Trash2 size={14} style={{ color: colors.red500 }} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {campaigns.length === 0 && (
              <EmptyIllustration
                icon={Megaphone}
                title="No campaigns yet"
                description="Create your first engagement campaign to start reaching out to patients."
                action={
                  <Button onClick={openNewCampaign} icon={<Plus size={16} />}>
                    New Campaign
                  </Button>
                }
              />
            )}
          </div>

          {/* Campaign Form Modal */}
          <Modal
            open={showCampaignForm}
            onClose={() => setShowCampaignForm(false)}
            title={editingCampaign ? "Edit Campaign" : "New Campaign"}
            subtitle="Configure campaign trigger, action, and audience"
            footer={
              <>
                <Button variant="secondary" onClick={() => setShowCampaignForm(false)}>Cancel</Button>
                <Button onClick={saveCampaign} loading={formLoading} disabled={!campaignForm.name}>
                  {editingCampaign ? "Update Campaign" : "Create Campaign"}
                </Button>
              </>
            }
          >
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Campaign Name *</label>
                <input value={campaignForm.name} onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} placeholder="e.g. Re-engage Inactive Patients" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Description</label>
                <textarea value={campaignForm.description} onChange={e => setCampaignForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Trigger Type *</label>
                  <select value={campaignForm.triggerType} onChange={e => setCampaignForm(f => ({ ...f, triggerType: e.target.value as CampaignTriggerType }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }}>
                    {(Object.entries(TRIGGER_LABELS) as [CampaignTriggerType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>
                    {campaignForm.triggerType === "no_visit" ? "Days since last visit" : campaignForm.triggerType === "low_engagement" ? "Score threshold" : campaignForm.triggerType === "no_message_response" ? "Response rate %" : "N/A"}
                  </label>
                  {campaignForm.triggerType === "no_visit" && <input type="number" value={campaignForm.triggerDays} onChange={e => setCampaignForm(f => ({ ...f, triggerDays: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} />}
                  {campaignForm.triggerType === "low_engagement" && <input type="number" value={campaignForm.triggerScore} onChange={e => setCampaignForm(f => ({ ...f, triggerScore: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} />}
                  {campaignForm.triggerType === "no_message_response" && <input type="number" value={campaignForm.triggerResponseRate} onChange={e => setCampaignForm(f => ({ ...f, triggerResponseRate: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} />}
                  {campaignForm.triggerType === "manual" && <input disabled className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300, backgroundColor: colors.slate50 }} placeholder="Manual trigger" />}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Action Type *</label>
                  <select value={campaignForm.actionType} onChange={e => setCampaignForm(f => ({ ...f, actionType: e.target.value as CampaignActionType }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }}>
                    {(Object.entries(ACTION_LABELS) as [CampaignActionType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Audience *</label>
                  <select value={campaignForm.audienceFilter} onChange={e => setCampaignForm(f => ({ ...f, audienceFilter: e.target.value as CampaignAudienceFilter }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }}>
                    <option value="all">All Patients</option>
                    <option value="by_plan">By Plan</option>
                    <option value="by_provider">By Provider</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Subject</label>
                <input value={campaignForm.subject} onChange={e => setCampaignForm(f => ({ ...f, subject: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} placeholder="Email/message subject" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Message Body</label>
                <textarea value={campaignForm.body} onChange={e => setCampaignForm(f => ({ ...f, body: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} rows={3} placeholder="Campaign message content..." />
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* ─── At-Risk Patients ─────────────────────────────────────────────── */}
      {subTab === "at-risk" && !loading && (
        <div className="space-y-4 animate-fade-in-up" role="tabpanel" aria-label="At-risk patients">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <SectionHeader title="At-Risk Patients" />
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.slate400 }} />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 pr-3 py-2 rounded-lg border text-sm w-48" style={{ borderColor: colors.slate300 }} placeholder="Search patients..." />
              </div>
              <select value={riskFilter} onChange={e => setRiskFilter(e.target.value as typeof riskFilter)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }}>
                <option value="all">All Risk Levels</option>
                <option value="at_risk">Critical Risk</option>
                <option value="high">At Risk</option>
              </select>
            </div>
          </div>

          {/* Patient Table */}
          <div className="rounded-xl shadow-sm border overflow-hidden" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: colors.slate50 }}>
                  <th className="text-left px-5 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: colors.slate500 }}>Patient</th>
                  <th className="text-left px-5 py-3 font-medium text-xs uppercase tracking-wide hidden md:table-cell" style={{ color: colors.slate500 }}>Score</th>
                  <th className="text-left px-5 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: colors.slate500 }}>Risk</th>
                  <th className="text-left px-5 py-3 font-medium text-xs uppercase tracking-wide hidden lg:table-cell" style={{ color: colors.slate500 }}>Last Visit</th>
                  <th className="text-left px-5 py-3 font-medium text-xs uppercase tracking-wide hidden lg:table-cell" style={{ color: colors.slate500 }}>Flags</th>
                  <th className="text-right px-5 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: colors.slate500 }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredAtRisk.map(p => {
                  const riskCfg = RISK_COLORS[p.riskLevel];
                  const isExpanded = expandedPatient === p.id;
                  return (
                    <>
                      <tr key={p.id} className="border-t" style={{ borderColor: colors.slate100 }}>
                        <td className="px-5 py-3">
                          <span className="font-medium" style={{ color: colors.navy900 }}>
                            {p.patient?.user?.firstName} {p.patient?.user?.lastName}
                          </span>
                        </td>
                        <td className="px-5 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="w-16">
                              <ProgressBar value={p.overallScore} height="h-2" />
                            </div>
                            <span className="text-xs font-medium" style={{ color: colors.slate600 }}>{p.overallScore}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={riskCfg.badgeVariant}>{riskCfg.label}</Badge>
                        </td>
                        <td className="px-5 py-3 hidden lg:table-cell text-xs" style={{ color: colors.slate600 }}>
                          {p.lastVisitDaysAgo !== null ? `${p.lastVisitDaysAgo}d ago` : "Never"}
                        </td>
                        <td className="px-5 py-3 hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {p.engagementFlags.map(flag => (
                              <Badge key={flag} variant="warning">
                                {flag.replace(/_/g, " ")}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedPatient(isExpanded ? null : p.id)}
                            aria-label={isExpanded ? "Collapse patient details" : "Expand patient details"}
                            style={{ backgroundColor: colors.slate50 }}
                          >
                            <Eye size={14} style={{ color: colors.slate500 }} />
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${p.id}-detail`}>
                          <td colSpan={6} className="px-5 py-4 border-t" style={{ backgroundColor: colors.slate50, borderColor: colors.slate100 }}>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                              {[
                                { label: "Visit Frequency", value: p.visitFrequencyScore },
                                { label: "Message Response", value: p.messageResponsivenessScore },
                                { label: "Screening", value: p.screeningCompletionScore },
                                { label: "Portal Login", value: p.portalLoginScore },
                                { label: "No-Show Rate", value: p.noShowRateScore },
                              ].map(s => (
                                <div key={s.label} className="rounded-lg p-3" style={{ backgroundColor: colors.white }}>
                                  <div className="text-xs mb-1" style={{ color: colors.slate500 }}>{s.label}</div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                      <ProgressBar value={s.value} height="h-1.5" />
                                    </div>
                                    <span className="text-xs font-bold" style={{ color: colors.navy900 }}>{s.value}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 flex items-center gap-4 text-xs" style={{ color: colors.slate500 }}>
                              <span>Appointments this month: <strong style={{ color: colors.navy900 }}>{p.appointmentsThisMonth}</strong></span>
                              <span>No-shows (6m): <strong style={{ color: p.noShowCount6m > 2 ? colors.red500 : colors.navy900 }}>{p.noShowCount6m}</strong></span>
                              <span>Last scored: {new Date(p.lastCalculatedAt).toLocaleDateString()}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            {filteredAtRisk.length === 0 && (
              <EmptyIllustration
                icon={AlertTriangle}
                title="No at-risk patients found"
                description="Adjust your filters or check back later."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
