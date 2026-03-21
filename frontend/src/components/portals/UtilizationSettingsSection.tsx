// ===== Utilization Settings Section =====
// Embeddable section for Practice Settings — configures utilization tracking behavior
// Reads from GET /practice/me, saves via PUT /practice/settings

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/api";
import {
  Activity,
  Calendar,
  Stethoscope,
  FlaskConical,
  Pill,
  AlertTriangle,
  ShieldCheck,
  Eye,
  DollarSign,
  Package,
  UserCog,
  Clock,
  Bell,
  ChevronDown,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UtilizationSettings {
  autoTrackAppointments: boolean;
  autoTrackEncounters: boolean;
  autoTrackLabOrders: boolean;
  autoTrackDispensing: boolean;
  alertThreshold: number;
  defaultOveragePolicy: "block" | "charge" | "notify" | "allow";
  showSavingsToPatients: boolean;
  enableALaCarteBilling: boolean;
  enableVisitPacks: boolean;
  allowProviderOverride: boolean;
  ccmTrackingMode: "manual" | "timer";
  endOfDayReminder: boolean;
}

interface PracticeData {
  utilizationSettings?: UtilizationSettings;
}

const DEFAULT_SETTINGS: UtilizationSettings = {
  autoTrackAppointments: true,
  autoTrackEncounters: true,
  autoTrackLabOrders: false,
  autoTrackDispensing: false,
  alertThreshold: 80,
  defaultOveragePolicy: "notify",
  showSavingsToPatients: true,
  enableALaCarteBilling: false,
  enableVisitPacks: false,
  allowProviderOverride: true,
  ccmTrackingMode: "manual",
  endOfDayReminder: false,
};

const THRESHOLD_OPTIONS = [50, 75, 80, 90];
const OVERAGE_POLICIES = [
  { value: "block", label: "Block — Prevent service delivery" },
  { value: "charge", label: "Charge — Bill a la carte rate" },
  { value: "notify", label: "Notify — Alert only, allow service" },
  { value: "allow", label: "Allow — No restriction or alert" },
];

// ─── Toggle Switch ───────────────────────────────────────────────────────────

function ToggleSwitch({
  enabled,
  onToggle,
  label,
  description,
  icon: Icon,
}: {
  enabled: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-start gap-4 py-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: enabled ? "#e0ecff" : "#f1f5f9" }}>
        <Icon className="w-4.5 h-4.5" style={{ color: enabled ? "#1e40af" : "#94a3b8" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
        style={{ backgroundColor: enabled ? "#1e40af" : "#cbd5e1" }}
      >
        <span
          className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: enabled ? "translateX(22px)" : "translateX(4px)" }}
        />
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function UtilizationSettingsSection() {
  const [settings, setSettings] = useState<UtilizationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Load Settings ──────────────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<PracticeData>("/practice/me");
    if (res.error) {
      setError(res.error);
    } else if (res.data?.utilizationSettings) {
      setSettings({ ...DEFAULT_SETTINGS, ...res.data.utilizationSettings });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ─── Save Settings ──────────────────────────────────────────────────────

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    const res = await apiFetch<void>("/practice/settings", {
      method: "PUT",
      body: JSON.stringify({ utilizationSettings: settings }),
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  // ─── Toggle Helper ──────────────────────────────────────────────────────

  const toggle = (key: keyof UtilizationSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="glass rounded-xl p-6">
        <div className="text-center py-8 text-slate-400">Loading utilization settings...</div>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5" style={{ color: "#1e40af" }} />
            Utilization Tracking
          </h3>
          <p className="text-sm text-slate-500 mt-1">Configure how utilization is tracked and enforced</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: saved ? "#22c55e" : "#1e40af" }}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 rounded-lg text-sm" style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}>
          {error}
        </div>
      )}

      {/* Auto-tracking Section */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">Auto-Tracking Sources</h4>
        <div className="divide-y divide-slate-100">
          <ToggleSwitch
            enabled={settings.autoTrackAppointments}
            onToggle={() => toggle("autoTrackAppointments")}
            label="Auto-track from appointments"
            description="Automatically deduct entitlements when appointments are completed"
            icon={Calendar}
          />
          <ToggleSwitch
            enabled={settings.autoTrackEncounters}
            onToggle={() => toggle("autoTrackEncounters")}
            label="Auto-track from encounters"
            description="Automatically deduct entitlements when encounters are documented"
            icon={Stethoscope}
          />
          <ToggleSwitch
            enabled={settings.autoTrackLabOrders}
            onToggle={() => toggle("autoTrackLabOrders")}
            label="Auto-track from lab orders"
            description="Automatically deduct lab entitlements when orders are placed"
            icon={FlaskConical}
          />
          <ToggleSwitch
            enabled={settings.autoTrackDispensing}
            onToggle={() => toggle("autoTrackDispensing")}
            label="Auto-track from dispensing"
            description="Automatically deduct when medications are dispensed from inventory"
            icon={Pill}
          />
        </div>
      </div>

      {/* Alert & Overage Section */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">Alerts & Overage</h4>

        {/* Alert Threshold */}
        <div className="flex items-start gap-4 py-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#fffbeb" }}>
            <AlertTriangle className="w-4.5 h-4.5" style={{ color: "#d97706" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800">Alert threshold</p>
            <p className="text-xs text-slate-500 mt-0.5">Notify when usage reaches this percentage of entitlements</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {THRESHOLD_OPTIONS.map((t) => (
              <button
                key={t}
                onClick={() => setSettings((prev) => ({ ...prev, alertThreshold: t }))}
                className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                style={{
                  backgroundColor: settings.alertThreshold === t ? "#1e40af" : "#f1f5f9",
                  color: settings.alertThreshold === t ? "#ffffff" : "#64748b",
                }}
              >
                {t}%
              </button>
            ))}
          </div>
        </div>

        {/* Default Overage Policy */}
        <div className="flex items-start gap-4 py-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#fef2f2" }}>
            <ShieldCheck className="w-4.5 h-4.5" style={{ color: "#dc2626" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800">Default overage policy</p>
            <p className="text-xs text-slate-500 mt-0.5">What happens when a patient exceeds their entitlements</p>
          </div>
          <div className="relative flex-shrink-0">
            <select
              value={settings.defaultOveragePolicy}
              onChange={(e) => setSettings((prev) => ({ ...prev, defaultOveragePolicy: e.target.value as UtilizationSettings["defaultOveragePolicy"] }))}
              className="pl-3 pr-8 py-1.5 border border-slate-200 rounded-lg text-sm outline-none appearance-none"
            >
              {OVERAGE_POLICIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Patient Experience Section */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">Patient Experience</h4>
        <div className="divide-y divide-slate-100">
          <ToggleSwitch
            enabled={settings.showSavingsToPatients}
            onToggle={() => toggle("showSavingsToPatients")}
            label="Show savings to patients"
            description="Display how much patients are saving vs. fee-for-service on their portal"
            icon={Eye}
          />
        </div>
      </div>

      {/* Billing Features Section */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">Billing Features</h4>
        <div className="divide-y divide-slate-100">
          <ToggleSwitch
            enabled={settings.enableALaCarteBilling}
            onToggle={() => toggle("enableALaCarteBilling")}
            label="Enable a la carte billing"
            description="Allow charging individual services at set prices beyond plan entitlements"
            icon={DollarSign}
          />
          <ToggleSwitch
            enabled={settings.enableVisitPacks}
            onToggle={() => toggle("enableVisitPacks")}
            label="Enable visit packs"
            description="Allow patients to purchase bundled visit packs at discounted rates"
            icon={Package}
          />
        </div>
      </div>

      {/* Provider Settings Section */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">Provider Settings</h4>
        <div className="divide-y divide-slate-100">
          <ToggleSwitch
            enabled={settings.allowProviderOverride}
            onToggle={() => toggle("allowProviderOverride")}
            label="Allow provider override"
            description="Let providers override utilization limits on a case-by-case basis"
            icon={UserCog}
          />

          {/* CCM Tracking Mode */}
          <div className="flex items-start gap-4 py-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f3e8ff" }}>
              <Clock className="w-4.5 h-4.5" style={{ color: "#7c3aed" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">CCM tracking mode</p>
              <p className="text-xs text-slate-500 mt-0.5">How chronic care management time is recorded</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(["manual", "timer"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSettings((prev) => ({ ...prev, ccmTrackingMode: mode }))}
                  className="px-3 py-1 rounded-md text-sm font-medium capitalize transition-colors"
                  style={{
                    backgroundColor: settings.ccmTrackingMode === mode ? "#7c3aed" : "#f1f5f9",
                    color: settings.ccmTrackingMode === mode ? "#ffffff" : "#64748b",
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <ToggleSwitch
            enabled={settings.endOfDayReminder}
            onToggle={() => toggle("endOfDayReminder")}
            label="End-of-day reminder"
            description="Remind providers to log any unrecorded activities before end of day"
            icon={Bell}
          />
        </div>
      </div>
    </div>
  );
}
