// ===== Engagement Dashboard Tab =====
// Patient engagement scoring, at-risk patients, and automated engagement rules

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/api";
import {
  Activity,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
  Users,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  X,
  ChevronDown,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EngagementDashboard {
  averageScore: number;
  distribution: {
    high: number;
    medium: number;
    low: number;
  };
  atRiskPatients: AtRiskPatient[];
}

interface AtRiskPatient {
  id: string;
  name: string;
  score: number;
  riskLevel: "high" | "medium" | "low";
  daysSinceLastVisit: number;
  lastVisitDate: string | null;
}

interface EngagementRule {
  id: string;
  triggerCondition: string;
  actionType: string;
  config: Record<string, string>;
  createdAt: string;
}

interface NewRuleForm {
  triggerCondition: string;
  actionType: string;
  configKey: string;
  configValue: string;
}

const TRIGGER_OPTIONS = [
  { value: "no_visit_30_days", label: "No visit in 30 days" },
  { value: "no_visit_60_days", label: "No visit in 60 days" },
  { value: "no_visit_90_days", label: "No visit in 90 days" },
  { value: "score_below_40", label: "Engagement score below 40" },
  { value: "score_below_60", label: "Engagement score below 60" },
  { value: "missed_appointment", label: "Missed appointment" },
  { value: "no_message_30_days", label: "No message in 30 days" },
];

const ACTION_OPTIONS = [
  { value: "send_email", label: "Send Email" },
  { value: "send_sms", label: "Send SMS" },
  { value: "create_task", label: "Create Staff Task" },
  { value: "flag_patient", label: "Flag Patient Record" },
  { value: "schedule_followup", label: "Schedule Follow-up" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function EngagementDashboardTab() {
  const [dashboard, setDashboard] = useState<EngagementDashboard | null>(null);
  const [rules, setRules] = useState<EngagementRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddRule, setShowAddRule] = useState(false);
  const [ruleForm, setRuleForm] = useState<NewRuleForm>({
    triggerCondition: "",
    actionType: "",
    configKey: "",
    configValue: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<EngagementDashboard>("/engagement/dashboard");
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setDashboard(res.data);
    }
    setLoading(false);
  }, []);

  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    const res = await apiFetch<EngagementRule[]>("/engagement/rules");
    if (res.data) {
      setRules(res.data);
    }
    setRulesLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchRules();
  }, [fetchDashboard, fetchRules]);

  const handleAddRule = async () => {
    if (!ruleForm.triggerCondition || !ruleForm.actionType) return;
    setSubmitting(true);
    const config: Record<string, string> = {};
    if (ruleForm.configKey && ruleForm.configValue) {
      config[ruleForm.configKey] = ruleForm.configValue;
    }
    const res = await apiFetch<EngagementRule>("/engagement/rules", {
      method: "POST",
      body: JSON.stringify({
        triggerCondition: ruleForm.triggerCondition,
        actionType: ruleForm.actionType,
        config,
      }),
    });
    if (res.data) {
      setRules((prev) => [...prev, res.data!]);
      setShowAddRule(false);
      setRuleForm({ triggerCondition: "", actionType: "", configKey: "", configValue: "" });
    }
    setSubmitting(false);
  };

  const handleDeleteRule = async (id: string) => {
    const res = await apiFetch<void>(`/engagement/rules/${id}`, { method: "DELETE" });
    if (!res.error) {
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const getScoreColor = (score: number): string => {
    if (score < 40) return "#ef4444";
    if (score <= 70) return "#eab308";
    return "#22c55e";
  };

  const getRiskBadgeStyle = (level: string): React.CSSProperties => {
    switch (level) {
      case "high":
        return { backgroundColor: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" };
      case "medium":
        return { backgroundColor: "#fefce8", color: "#ca8a04", border: "1px solid #fef08a" };
      case "low":
        return { backgroundColor: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" };
      default:
        return {};
    }
  };

  // ─── Loading / Error ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mr-3" />
        <span className="text-gray-500">Loading engagement data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-red-600">
        <AlertTriangle className="w-8 h-8 mb-2" />
        <p className="font-medium">{error}</p>
        <button
          onClick={fetchDashboard}
          className="mt-4 px-4 py-2 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!dashboard) return null;

  const total = dashboard.distribution.high + dashboard.distribution.medium + dashboard.distribution.low;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Top Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Average Score */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#eff6ff" }}
            >
              <Activity className="w-5 h-5" style={{ color: "#3b82f6" }} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Average Engagement Score</p>
              <p
                className="text-4xl font-bold"
                style={{ color: getScoreColor(dashboard.averageScore) }}
              >
                {dashboard.averageScore}
              </p>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all"
              style={{
                width: `${dashboard.averageScore}%`,
                backgroundColor: getScoreColor(dashboard.averageScore),
              }}
            />
          </div>
        </div>

        {/* Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-4">Risk Distribution</p>
          <div className="flex items-center gap-6">
            {[
              { label: "High Risk", count: dashboard.distribution.high, color: "#ef4444", bgColor: "#fef2f2", Icon: TrendingDown },
              { label: "Medium Risk", count: dashboard.distribution.medium, color: "#eab308", bgColor: "#fefce8", Icon: Activity },
              { label: "Low Risk", count: dashboard.distribution.low, color: "#22c55e", bgColor: "#f0fdf4", Icon: TrendingUp },
            ].map((item) => (
              <div key={item.label} className="flex-1 text-center">
                <div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-2"
                  style={{ backgroundColor: item.bgColor }}
                >
                  <item.Icon className="w-5 h-5" style={{ color: item.color }} />
                </div>
                <p className="text-2xl font-bold" style={{ color: item.color }}>
                  {item.count}
                </p>
                <p className="text-xs text-gray-500">{item.label}</p>
                {total > 0 && (
                  <p className="text-xs text-gray-400">
                    {Math.round((item.count / total) * 100)}%
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── At-Risk Patients Table ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" />
            <h3 className="font-semibold text-gray-900">At-Risk Patients</h3>
            <span className="text-sm text-gray-400">({dashboard.atRiskPatients.length})</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Patient</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Score</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Risk Level</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Days Since Visit</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Last Visit</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.atRiskPatients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                    No at-risk patients found.
                  </td>
                </tr>
              ) : (
                dashboard.atRiskPatients.map((patient) => (
                  <tr key={patient.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{patient.name}</td>
                    <td className="px-6 py-3">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold"
                        style={{
                          color: "#fff",
                          backgroundColor: getScoreColor(patient.score),
                        }}
                      >
                        {patient.score}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
                        style={getRiskBadgeStyle(patient.riskLevel)}
                      >
                        {patient.riskLevel}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{patient.daysSinceLastVisit} days</td>
                    <td className="px-6 py-3 text-gray-600">
                      {patient.lastVisitDate
                        ? new Date(patient.lastVisitDate).toLocaleDateString()
                        : "Never"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Engagement Rules ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-gray-400" />
            <h3 className="font-semibold text-gray-900">Engagement Rules</h3>
          </div>
          <button
            onClick={() => setShowAddRule(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: "#3b82f6" }}
          >
            <Plus className="w-4 h-4" />
            Add Rule
          </button>
        </div>

        <div className="p-6">
          {rulesLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin text-gray-400 mr-2" />
              <span className="text-gray-400 text-sm">Loading rules...</span>
            </div>
          ) : rules.length === 0 ? (
            <p className="text-center text-gray-400 py-8">
              No engagement rules configured yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rules.map((rule) => {
                const trigger = TRIGGER_OPTIONS.find((t) => t.value === rule.triggerCondition);
                const action = ACTION_OPTIONS.find((a) => a.value === rule.actionType);
                return (
                  <div
                    key={rule.id}
                    className="border border-gray-200 rounded-lg p-4 flex items-start justify-between hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm flex-wrap">
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
                          style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
                        >
                          {trigger?.label || rule.triggerCondition}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
                          style={{ backgroundColor: "#dbeafe", color: "#1e40af" }}
                        >
                          {action?.label || rule.actionType}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="ml-3 p-1 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                      title="Delete rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Add Rule Dialog ─────────────────────────────────────────────────── */}
      {showAddRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddRule(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Add Engagement Rule</h3>
              <button onClick={() => setShowAddRule(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Trigger */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trigger Condition
                </label>
                <div className="relative">
                  <select
                    value={ruleForm.triggerCondition}
                    onChange={(e) => setRuleForm((f) => ({ ...f, triggerCondition: e.target.value }))}
                    className="w-full appearance-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white pr-8"
                  >
                    <option value="">Select trigger...</option>
                    {TRIGGER_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Action */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Action Type
                </label>
                <div className="relative">
                  <select
                    value={ruleForm.actionType}
                    onChange={(e) => setRuleForm((f) => ({ ...f, actionType: e.target.value }))}
                    className="w-full appearance-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white pr-8"
                  >
                    <option value="">Select action...</option>
                    {ACTION_OPTIONS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Config */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Configuration (optional)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Key (e.g. template)"
                    value={ruleForm.configKey}
                    onChange={(e) => setRuleForm((f) => ({ ...f, configKey: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    value={ruleForm.configValue}
                    onChange={(e) => setRuleForm((f) => ({ ...f, configValue: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddRule(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRule}
                disabled={submitting || !ruleForm.triggerCondition || !ruleForm.actionType}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: "#3b82f6" }}
              >
                {submitting ? "Adding..." : "Add Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
