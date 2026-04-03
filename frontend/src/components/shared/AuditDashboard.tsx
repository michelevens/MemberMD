// ===== AuditDashboard =====
// HIPAA compliance dashboard with PHI access logs, security events,
// checklist, anomaly alerts, and export

import { useState } from "react";
import {
  Shield,
  Eye,
  Users,
  FileCheck,
  Lock,
  AlertTriangle,
  Download,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  XCircle,
  Activity,
} from "lucide-react";

import { colors as C } from "../ui/design-system";

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_STATS = {
  phiAccesses24h: 156,
  phiAccesses7d: 1043,
  uniqueAccessors: 12,
  consentRate: 94,
  mfaRate: 78,
};

interface ChecklistItem {
  id: string;
  category: "administrative" | "physical" | "technical";
  name: string;
  description: string;
  status: "compliant" | "partial" | "non_compliant";
}

const HIPAA_CHECKLIST: ChecklistItem[] = [
  // Administrative
  { id: "a1", category: "administrative", name: "Security Officer Designation", description: "A designated security officer is responsible for HIPAA security policies", status: "compliant" },
  { id: "a2", category: "administrative", name: "Risk Assessment", description: "Regular risk assessments identify vulnerabilities in ePHI handling", status: "partial" },
  { id: "a3", category: "administrative", name: "Workforce Training", description: "All staff complete annual HIPAA security awareness training", status: "non_compliant" },
  { id: "a4", category: "administrative", name: "Contingency Plan", description: "Data backup, disaster recovery, and emergency mode procedures documented", status: "partial" },
  { id: "a5", category: "administrative", name: "Business Associate Agreements", description: "BAAs signed with all vendors who access ePHI", status: "compliant" },
  // Physical
  { id: "p1", category: "physical", name: "Facility Access Controls", description: "Physical access to servers and data centers is restricted (cloud-hosted)", status: "compliant" },
  { id: "p2", category: "physical", name: "Workstation Security", description: "Workstations with ePHI access have screen locks and encryption", status: "partial" },
  { id: "p3", category: "physical", name: "Device Controls", description: "Mobile devices and removable media are encrypted and tracked", status: "compliant" },
  // Technical
  { id: "t1", category: "technical", name: "Access Control (Role-based)", description: "Role-based access control limits ePHI access to minimum necessary", status: "compliant" },
  { id: "t2", category: "technical", name: "Audit Controls", description: "System activity is logged and monitored for unauthorized access", status: "compliant" },
  { id: "t3", category: "technical", name: "Integrity Controls (Encryption at Rest)", description: "All ePHI is encrypted at rest using AES-256", status: "compliant" },
  { id: "t4", category: "technical", name: "Transmission Security (TLS)", description: "All data in transit uses TLS 1.2+ encryption", status: "compliant" },
  { id: "t5", category: "technical", name: "Authentication (MFA Available)", description: "Multi-factor authentication is available for all user accounts", status: "partial" },
];

interface PhiEntry {
  id: string;
  timestamp: string;
  userName: string;
  patientName: string;
  resource: string;
  accessType: string;
  ip: string;
}

const MOCK_PHI_LOG: PhiEntry[] = [
  { id: "phi1", timestamp: "2026-03-19 14:32:15", userName: "Dr. N. Michel", patientName: "Sarah Johnson", resource: "Medical Record", accessType: "view", ip: "192.168.1.45" },
  { id: "phi2", timestamp: "2026-03-19 14:28:03", userName: "Dr. S. Chen", patientName: "James Williams", resource: "Lab Results", accessType: "view", ip: "192.168.1.22" },
  { id: "phi3", timestamp: "2026-03-19 13:45:22", userName: "Nurse K. Adams", patientName: "Emily Davis", resource: "Prescription", accessType: "view", ip: "192.168.1.30" },
  { id: "phi4", timestamp: "2026-03-19 13:12:07", userName: "Dr. R. Kim", patientName: "Michael Brown", resource: "Encounter Note", accessType: "view", ip: "10.0.0.15" },
  { id: "phi5", timestamp: "2026-03-19 12:55:40", userName: "Admin J. Smith", patientName: "Lisa Anderson", resource: "Patient Demographics", accessType: "export", ip: "192.168.1.10" },
  { id: "phi6", timestamp: "2026-03-19 11:30:18", userName: "Dr. N. Michel", patientName: "Robert Taylor", resource: "Assessment", accessType: "view", ip: "192.168.1.45" },
  { id: "phi7", timestamp: "2026-03-19 10:22:55", userName: "Dr. S. Chen", patientName: "Anna Martinez", resource: "Immunization Record", accessType: "print", ip: "192.168.1.22" },
  { id: "phi8", timestamp: "2026-03-19 09:15:33", userName: "Nurse K. Adams", patientName: "David Wilson", resource: "Vitals", accessType: "list", ip: "192.168.1.30" },
];

interface SecurityEntry {
  id: string;
  timestamp: string;
  eventType: string;
  userName: string;
  ip: string;
  details: string;
}

const MOCK_SECURITY_EVENTS: SecurityEntry[] = [
  { id: "se1", timestamp: "2026-03-19 14:30:00", eventType: "login_success", userName: "Dr. N. Michel", ip: "192.168.1.45", details: "Successful login with MFA" },
  { id: "se2", timestamp: "2026-03-19 13:55:22", eventType: "login_failed", userName: "unknown@test.com", ip: "203.0.113.42", details: "Failed login attempt (invalid credentials)" },
  { id: "se3", timestamp: "2026-03-19 12:00:15", eventType: "password_change", userName: "Nurse K. Adams", ip: "192.168.1.30", details: "Password changed successfully" },
  { id: "se4", timestamp: "2026-03-19 11:45:30", eventType: "login_success", userName: "Dr. S. Chen", ip: "192.168.1.22", details: "Successful login" },
  { id: "se5", timestamp: "2026-03-19 10:30:00", eventType: "session_timeout", userName: "Admin J. Smith", ip: "192.168.1.10", details: "Session expired after 30 min inactivity" },
  { id: "se6", timestamp: "2026-03-19 09:00:12", eventType: "mfa_enabled", userName: "Dr. R. Kim", ip: "10.0.0.15", details: "Multi-factor authentication enabled" },
];

interface Anomaly {
  type: string;
  description: string;
  severity: "high" | "medium";
}

const MOCK_ANOMALIES: Anomaly[] = [
  { type: "Unusual Volume", description: "Dr. Chen accessed 47 patient records in the last hour", severity: "high" },
  { type: "Suspicious IP", description: "Login attempt from unusual IP: 203.0.113.42", severity: "medium" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function AuditDashboard() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>("administrative");
  const [showToast, setShowToast] = useState(false);

  function handleExport() {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  }

  // ─── Status Badge ──────────────────────────────────────────────────────────

  function StatusBadge({ status }: { status: ChecklistItem["status"] }) {
    const config = {
      compliant: { bg: C.green50, color: C.green600, icon: CheckCircle, label: "Compliant" },
      partial: { bg: C.amber50, color: C.amber600, icon: AlertCircle, label: "Partial" },
      non_compliant: { bg: C.red50, color: C.red600, icon: XCircle, label: "Non-Compliant" },
    };
    const c = config[status];
    const Icon = c.icon;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
        style={{ backgroundColor: c.bg, color: c.color }}
      >
        <Icon className="w-3 h-3" /> {c.label}
      </span>
    );
  }

  // ─── Event Type Badge ─────────────────────────────────────────────────────

  function EventBadge({ type }: { type: string }) {
    const config: Record<string, { bg: string; color: string }> = {
      login_success: { bg: C.green50, color: C.green600 },
      login_failed: { bg: C.red50, color: C.red600 },
      password_change: { bg: C.blue50, color: C.blue500 },
      session_timeout: { bg: C.amber50, color: C.amber600 },
      mfa_enabled: { bg: C.teal50, color: C.teal600 },
    };
    const c = config[type] || { bg: C.slate100, color: C.slate600 };
    return (
      <span
        className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: c.bg, color: c.color }}
      >
        {type.replace(/_/g, " ")}
      </span>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Export Toast */}
      {showToast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white"
          style={{ backgroundColor: C.teal500 }}
        >
          <CheckCircle className="w-4 h-4" />
          Export feature ready for production
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.teal50 }}>
              <Eye className="w-4 h-4" style={{ color: C.teal500 }} />
            </div>
            <span className="text-xs font-medium" style={{ color: C.slate400 }}>PHI Accesses (24h)</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: C.navy800 }}>{MOCK_STATS.phiAccesses24h}</p>
          <p className="text-xs mt-1" style={{ color: C.slate400 }}>{MOCK_STATS.phiAccesses7d} in 7 days</p>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.blue50 }}>
              <Users className="w-4 h-4" style={{ color: C.blue500 }} />
            </div>
            <span className="text-xs font-medium" style={{ color: C.slate400 }}>Unique Accessors (7d)</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: C.navy800 }}>{MOCK_STATS.uniqueAccessors}</p>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.green50 }}>
              <FileCheck className="w-4 h-4" style={{ color: C.green500 }} />
            </div>
            <span className="text-xs font-medium" style={{ color: C.slate400 }}>Consent Rate</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: C.navy800 }}>{MOCK_STATS.consentRate}%</p>
          <div className="w-full h-2 rounded-full mt-2" style={{ backgroundColor: C.slate100 }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${MOCK_STATS.consentRate}%`, backgroundColor: C.green500 }}
            />
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.amber50 }}>
              <Lock className="w-4 h-4" style={{ color: C.amber500 }} />
            </div>
            <span className="text-xs font-medium" style={{ color: C.slate400 }}>MFA Adoption</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: C.navy800 }}>{MOCK_STATS.mfaRate}%</p>
          <div className="w-full h-2 rounded-full mt-2" style={{ backgroundColor: C.slate100 }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${MOCK_STATS.mfaRate}%`, backgroundColor: C.amber500 }}
            />
          </div>
        </div>
      </div>

      {/* Anomaly Alerts */}
      {MOCK_ANOMALIES.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: C.navy800 }}>
            <AlertTriangle className="w-4 h-4" style={{ color: C.amber500 }} />
            Anomaly Alerts
          </h3>
          {MOCK_ANOMALIES.map((anomaly, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{
                backgroundColor: anomaly.severity === "high" ? C.red50 : C.amber50,
                border: `1px solid ${anomaly.severity === "high" ? C.red500 : C.amber500}`,
              }}
            >
              <AlertTriangle
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: anomaly.severity === "high" ? C.red500 : C.amber500 }}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold" style={{ color: anomaly.severity === "high" ? C.red600 : C.amber600 }}>
                    {anomaly.severity.toUpperCase()}
                  </span>
                  <span className="text-xs font-medium" style={{ color: C.slate600 }}>{anomaly.type}</span>
                </div>
                <p className="text-sm mt-0.5" style={{ color: C.slate700 }}>{anomaly.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HIPAA Security Rule Checklist */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${C.slate200}` }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: C.navy800 }}>
            <Shield className="w-4 h-4" style={{ color: C.teal500 }} />
            HIPAA Security Rule Checklist
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <span style={{ color: C.green600 }}>
              {HIPAA_CHECKLIST.filter((i) => i.status === "compliant").length} Compliant
            </span>
            <span style={{ color: C.amber600 }}>
              {HIPAA_CHECKLIST.filter((i) => i.status === "partial").length} Partial
            </span>
            <span style={{ color: C.red600 }}>
              {HIPAA_CHECKLIST.filter((i) => i.status === "non_compliant").length} Non-Compliant
            </span>
          </div>
        </div>

        {(["administrative", "physical", "technical"] as const).map((cat) => {
          const items = HIPAA_CHECKLIST.filter((i) => i.category === cat);
          const isExpanded = expandedCategory === cat;
          const catLabels = {
            administrative: "Administrative Safeguards",
            physical: "Physical Safeguards",
            technical: "Technical Safeguards",
          };

          return (
            <div key={cat}>
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50"
                style={{ borderBottom: `1px solid ${C.slate100}` }}
              >
                <span className="text-sm font-medium" style={{ color: C.navy700 }}>
                  {catLabels[cat]}
                  <span className="ml-2 text-xs font-normal" style={{ color: C.slate400 }}>
                    ({items.length} items)
                  </span>
                </span>
                <ChevronDown
                  className="w-4 h-4 transition-transform"
                  style={{
                    color: C.slate400,
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
              {isExpanded && (
                <div className="divide-y" style={{ borderColor: C.slate100 }}>
                  {items.map((item) => (
                    <div key={item.id} className="px-6 py-3 flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color: C.navy800 }}>{item.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>{item.description}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent PHI Access Log */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${C.slate200}` }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: C.navy800 }}>
            <Eye className="w-4 h-4" style={{ color: C.teal500 }} />
            Recent PHI Access Log
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.slate50 }}>
                <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>Timestamp</th>
                <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>User</th>
                <th className="text-left px-4 py-2 font-medium text-xs hidden sm:table-cell" style={{ color: C.slate500 }}>Patient</th>
                <th className="text-left px-4 py-2 font-medium text-xs hidden md:table-cell" style={{ color: C.slate500 }}>Resource</th>
                <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>Type</th>
                <th className="text-left px-4 py-2 font-medium text-xs hidden lg:table-cell" style={{ color: C.slate500 }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_PHI_LOG.map((entry) => (
                <tr key={entry.id} className="border-t hover:bg-slate-50 transition-colors" style={{ borderColor: C.slate100 }}>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: C.slate500 }}>{entry.timestamp}</td>
                  <td className="px-4 py-2.5 text-xs font-medium" style={{ color: C.navy800 }}>{entry.userName}</td>
                  <td className="px-4 py-2.5 text-xs hidden sm:table-cell" style={{ color: C.slate600 }}>{entry.patientName}</td>
                  <td className="px-4 py-2.5 text-xs hidden md:table-cell" style={{ color: C.slate600 }}>{entry.resource}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: entry.accessType === "export" || entry.accessType === "print" ? C.amber50 : C.slate100,
                        color: entry.accessType === "export" || entry.accessType === "print" ? C.amber600 : C.slate600,
                      }}
                    >
                      {entry.accessType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono hidden lg:table-cell" style={{ color: C.slate400 }}>{entry.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Events */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${C.slate200}` }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: C.navy800 }}>
            <Activity className="w-4 h-4" style={{ color: C.teal500 }} />
            Security Events
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.slate50 }}>
                <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>Timestamp</th>
                <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>Event</th>
                <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: C.slate500 }}>User</th>
                <th className="text-left px-4 py-2 font-medium text-xs hidden sm:table-cell" style={{ color: C.slate500 }}>IP</th>
                <th className="text-left px-4 py-2 font-medium text-xs hidden md:table-cell" style={{ color: C.slate500 }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_SECURITY_EVENTS.map((event) => (
                <tr key={event.id} className="border-t hover:bg-slate-50 transition-colors" style={{ borderColor: C.slate100 }}>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: C.slate500 }}>{event.timestamp}</td>
                  <td className="px-4 py-2.5"><EventBadge type={event.eventType} /></td>
                  <td className="px-4 py-2.5 text-xs font-medium" style={{ color: C.navy800 }}>{event.userName}</td>
                  <td className="px-4 py-2.5 text-xs font-mono hidden sm:table-cell" style={{ color: C.slate400 }}>{event.ip}</td>
                  <td className="px-4 py-2.5 text-xs hidden md:table-cell" style={{ color: C.slate600 }}>{event.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export Button */}
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ backgroundColor: C.navy700 }}
        >
          <Download className="w-4 h-4" /> Export Audit Log (CSV)
        </button>
      </div>
    </div>
  );
}
