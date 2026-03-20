// ===== Employer Management Tab =====
// Sub-tabs: Employers | Contracts | Invoices
// Manages employer accounts, contracts, and billing for DPC practice

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/api";
import {
  Search,
  Plus,
  Building2,
  FileText,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Check,
  AlertTriangle,
  DollarSign,
  X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Employer {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  employeesEnrolled: number;
  activeContracts: number;
  status: "active" | "inactive" | "pending";
  createdAt: string;
}

interface EmployerContract {
  id: string;
  employerId: string;
  employerName: string;
  planName: string;
  pepmRate: number;
  effectiveDate: string;
  endDate: string;
  status: "active" | "expired" | "pending" | "cancelled";
  enrolledCount: number;
}

interface EmployerInvoice {
  id: string;
  invoiceNumber: string;
  employerId: string;
  employerName: string;
  period: string;
  enrolledCount: number;
  total: number;
  status: "draft" | "sent" | "paid" | "overdue";
  dueDate: string;
  createdAt: string;
}

type SubTab = "employers" | "contracts" | "invoices";

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string }> = {
    active: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" },
    paid: { bg: "#ecf9ec", text: "#2f8132", dot: "#3f9142" },
    sent: { bg: "#e0ecff", text: "#1e40af", dot: "#3b82f6" },
    pending: { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" },
    draft: { bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" },
    inactive: { bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" },
    expired: { bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" },
    overdue: { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" },
    cancelled: { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" },
  };
  const c = config[status] || config.active;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
      {status}
    </span>
  );
}

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

export function EmployerManagementTab() {
  const [subTab, setSubTab] = useState<SubTab>("employers");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Employers state
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [employerSearch, setEmployerSearch] = useState("");
  const [expandedEmployer, setExpandedEmployer] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<{ employer: Employer; contracts: EmployerContract[]; invoices: EmployerInvoice[] } | null>(null);
  const [showAddEmployer, setShowAddEmployer] = useState(false);

  // Contracts state
  const [contracts, setContracts] = useState<EmployerContract[]>([]);
  const [showNewContract, setShowNewContract] = useState(false);

  // Invoices state
  const [invoices, setInvoices] = useState<EmployerInvoice[]>([]);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  // New employer form
  const [newEmployer, setNewEmployer] = useState({ name: "", contactName: "", contactEmail: "", contactPhone: "", address: "" });

  // New contract form
  const [newContract, setNewContract] = useState({ employerId: "", planName: "", pepmRate: "", effectiveDate: "", endDate: "" });

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<Employer[]>("/employers");
    if (res.error) {
      setError(res.error);
    } else {
      setEmployers(res.data || []);
    }
    setLoading(false);
  }, []);

  const loadContracts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<EmployerContract[]>("/employer-contracts");
    if (res.error) {
      setError(res.error);
    } else {
      setContracts(res.data || []);
    }
    setLoading(false);
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<EmployerInvoice[]>("/employer-billing/invoices");
    if (res.error) {
      setError(res.error);
    } else {
      setInvoices(res.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (subTab === "employers") loadEmployers();
    else if (subTab === "contracts") loadContracts();
    else if (subTab === "invoices") loadInvoices();
  }, [subTab, loadEmployers, loadContracts, loadInvoices]);

  // ─── Expand Employer ─────────────────────────────────────────────────────

  const toggleEmployerExpand = async (employer: Employer) => {
    if (expandedEmployer === employer.id) {
      setExpandedEmployer(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedEmployer(employer.id);
    const [detailRes, contractsRes, invoicesRes] = await Promise.all([
      apiFetch<Employer>(`/employers/${employer.id}`),
      apiFetch<EmployerContract[]>("/employer-contracts"),
      apiFetch<EmployerInvoice[]>("/employer-billing/invoices"),
    ]);
    setExpandedDetail({
      employer: detailRes.data || employer,
      contracts: (contractsRes.data || []).filter((c) => c.employerId === employer.id),
      invoices: (invoicesRes.data || []).filter((i) => i.employerId === employer.id),
    });
  };

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleAddEmployer = async () => {
    const res = await apiFetch<Employer>("/employers", {
      method: "POST",
      body: JSON.stringify(newEmployer),
    });
    if (res.error) {
      setError(res.error);
    } else {
      setShowAddEmployer(false);
      setNewEmployer({ name: "", contactName: "", contactEmail: "", contactPhone: "", address: "" });
      loadEmployers();
    }
  };

  const handleNewContract = async () => {
    const res = await apiFetch<EmployerContract>("/employer-contracts", {
      method: "POST",
      body: JSON.stringify({ ...newContract, pepmRate: parseFloat(newContract.pepmRate) }),
    });
    if (res.error) {
      setError(res.error);
    } else {
      setShowNewContract(false);
      setNewContract({ employerId: "", planName: "", pepmRate: "", effectiveDate: "", endDate: "" });
      loadContracts();
    }
  };

  const handleGenerateInvoice = async () => {
    setGeneratingInvoice(true);
    const res = await apiFetch<EmployerInvoice>("/employer-billing/invoices/generate", {
      method: "POST",
    });
    if (res.error) {
      setError(res.error);
    } else {
      loadInvoices();
    }
    setGeneratingInvoice(false);
  };

  const handleMarkPaid = async (invoiceId: string) => {
    const res = await apiFetch<EmployerInvoice>(`/employer-billing/invoices/${invoiceId}/paid`, {
      method: "PUT",
    });
    if (res.error) {
      setError(res.error);
    } else {
      loadInvoices();
    }
  };

  // ─── Filtered Employers ──────────────────────────────────────────────────

  const filteredEmployers = employers.filter(
    (e) =>
      e.name.toLowerCase().includes(employerSearch.toLowerCase()) ||
      e.contactName.toLowerCase().includes(employerSearch.toLowerCase())
  );

  // ─── Sub-tab buttons ─────────────────────────────────────────────────────

  const subTabs: { id: SubTab; label: string; icon: React.ElementType }[] = [
    { id: "employers", label: "Employers", icon: Building2 },
    { id: "contracts", label: "Contracts", icon: FileText },
    { id: "invoices", label: "Invoices", icon: CreditCard },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: "#f1f5f9" }}>
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              subTab === tab.id ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

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

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="ml-3 text-slate-500">Loading...</span>
        </div>
      )}

      {/* ─── Employers Tab ──────────────────────────────────────────────── */}
      {!loading && subTab === "employers" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search employers..."
                value={employerSearch}
                onChange={(e) => setEmployerSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={() => setShowAddEmployer(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: "#27ab83" }}
            >
              <Plus className="w-4 h-4" />
              Add Employer
            </button>
          </div>

          {/* Table */}
          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#f8fafc" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Employer</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Contact</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Employees Enrolled</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Active Contracts</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredEmployers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No employers found.
                    </td>
                  </tr>
                )}
                {filteredEmployers.map((emp) => (
                  <>
                    <tr
                      key={emp.id}
                      onClick={() => toggleEmployerExpand(emp)}
                      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">{emp.name}</td>
                      <td className="px-4 py-3 text-slate-600">{emp.contactName}</td>
                      <td className="px-4 py-3 text-center text-slate-700">{emp.employeesEnrolled}</td>
                      <td className="px-4 py-3 text-center text-slate-700">{emp.activeContracts}</td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={emp.status} />
                      </td>
                      <td className="px-4 py-3">
                        {expandedEmployer === emp.id ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </td>
                    </tr>
                    {expandedEmployer === emp.id && expandedDetail && (
                      <tr key={`${emp.id}-detail`}>
                        <td colSpan={6} className="px-4 py-4" style={{ backgroundColor: "#f8fafc" }}>
                          <div className="space-y-4">
                            {/* Employer details */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-slate-500">Email:</span>{" "}
                                <span className="text-slate-800">{expandedDetail.employer.contactEmail}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Phone:</span>{" "}
                                <span className="text-slate-800">{expandedDetail.employer.contactPhone}</span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-slate-500">Address:</span>{" "}
                                <span className="text-slate-800">{expandedDetail.employer.address}</span>
                              </div>
                            </div>

                            {/* Contracts */}
                            <div>
                              <h4 className="text-sm font-semibold text-slate-700 mb-2">Contracts</h4>
                              {expandedDetail.contracts.length === 0 ? (
                                <p className="text-sm text-slate-400">No contracts.</p>
                              ) : (
                                <div className="space-y-2">
                                  {expandedDetail.contracts.map((c) => (
                                    <div key={c.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100">
                                      <div>
                                        <span className="font-medium text-slate-800">{c.planName}</span>
                                        <span className="ml-2 text-slate-500">${c.pepmRate}/PEPM</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-500">{c.effectiveDate}</span>
                                        <StatusBadge status={c.status} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Recent Invoices */}
                            <div>
                              <h4 className="text-sm font-semibold text-slate-700 mb-2">Recent Invoices</h4>
                              {expandedDetail.invoices.length === 0 ? (
                                <p className="text-sm text-slate-400">No invoices.</p>
                              ) : (
                                <div className="space-y-2">
                                  {expandedDetail.invoices.slice(0, 5).map((inv) => (
                                    <div key={inv.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100">
                                      <div>
                                        <span className="font-medium text-slate-800">{inv.invoiceNumber}</span>
                                        <span className="ml-2 text-slate-500">{inv.period}</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="font-medium text-slate-800">${inv.total.toLocaleString()}</span>
                                        <StatusBadge status={inv.status} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Employer Dialog */}
          <DialogOverlay open={showAddEmployer} onClose={() => setShowAddEmployer(false)} title="Add Employer">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={newEmployer.name}
                  onChange={(e) => setNewEmployer({ ...newEmployer, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={newEmployer.contactName}
                  onChange={(e) => setNewEmployer({ ...newEmployer, contactName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={newEmployer.contactEmail}
                  onChange={(e) => setNewEmployer({ ...newEmployer, contactEmail: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="jane@acme.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={newEmployer.contactPhone}
                  onChange={(e) => setNewEmployer({ ...newEmployer, contactPhone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={newEmployer.address}
                  onChange={(e) => setNewEmployer({ ...newEmployer, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="123 Business Ave, Orlando, FL"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowAddEmployer(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEmployer}
                  disabled={!newEmployer.name || !newEmployer.contactEmail}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: "#27ab83" }}
                >
                  Add Employer
                </button>
              </div>
            </div>
          </DialogOverlay>
        </div>
      )}

      {/* ─── Contracts Tab ──────────────────────────────────────────────── */}
      {!loading && subTab === "contracts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Employer Contracts</h3>
            <button
              onClick={() => setShowNewContract(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: "#27ab83" }}
            >
              <Plus className="w-4 h-4" />
              New Contract
            </button>
          </div>

          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#f8fafc" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Employer</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Plan</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">PEPM Rate</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Effective Date</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Enrolled</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No contracts found.
                    </td>
                  </tr>
                )}
                {contracts.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.employerName}</td>
                    <td className="px-4 py-3 text-slate-600">{c.planName}</td>
                    <td className="px-4 py-3 text-right text-slate-700">${c.pepmRate.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-600">{c.effectiveDate}</td>
                    <td className="px-4 py-3 text-center text-slate-700">{c.enrolledCount}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* New Contract Dialog */}
          <DialogOverlay open={showNewContract} onClose={() => setShowNewContract(false)} title="New Contract">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employer</label>
                <select
                  value={newContract.employerId}
                  onChange={(e) => setNewContract({ ...newContract, employerId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select employer...</option>
                  {employers.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Plan Name</label>
                <input
                  type="text"
                  value={newContract.planName}
                  onChange={(e) => setNewContract({ ...newContract, planName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g. Employer Essential"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">PEPM Rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newContract.pepmRate}
                  onChange={(e) => setNewContract({ ...newContract, pepmRate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="150.00"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Effective Date</label>
                  <input
                    type="date"
                    value={newContract.effectiveDate}
                    onChange={(e) => setNewContract({ ...newContract, effectiveDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={newContract.endDate}
                    onChange={(e) => setNewContract({ ...newContract, endDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowNewContract(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNewContract}
                  disabled={!newContract.employerId || !newContract.planName || !newContract.pepmRate}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: "#27ab83" }}
                >
                  Create Contract
                </button>
              </div>
            </div>
          </DialogOverlay>
        </div>
      )}

      {/* ─── Invoices Tab ───────────────────────────────────────────────── */}
      {!loading && subTab === "invoices" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Employer Invoices</h3>
            <button
              onClick={handleGenerateInvoice}
              disabled={generatingInvoice}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#27ab83" }}
            >
              <DollarSign className="w-4 h-4" />
              {generatingInvoice ? "Generating..." : "Generate Invoice"}
            </button>
          </div>

          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#f8fafc" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Invoice #</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Employer</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Period</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Enrolled</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">Total</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Due Date</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      No invoices found.
                    </td>
                  </tr>
                )}
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.employerName}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.period}</td>
                    <td className="px-4 py-3 text-center text-slate-700">{inv.enrolledCount}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">${inv.total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{inv.dueDate}</td>
                    <td className="px-4 py-3">
                      {inv.status !== "paid" && (
                        <button
                          onClick={() => handleMarkPaid(inv.id)}
                          className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-white"
                          style={{ backgroundColor: "#27ab83" }}
                        >
                          <Check className="w-3 h-3" />
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
