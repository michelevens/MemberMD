// ===== Lab Orders Tab =====
// Lab order management: create orders, track status, enter results

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/api";
import {
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
  FlaskConical,
  CheckCircle2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LabOrder {
  id: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  providerName: string;
  panels: string[];
  status: "draft" | "pending" | "sent" | "resulted" | "cancelled";
  priority: "routine" | "urgent" | "stat";
  specialInstructions: string | null;
  fasting: boolean;
  orderedDate: string;
  resultedDate: string | null;
  results: LabResult[];
}

interface LabResult {
  id: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: "normal" | "abnormal" | "critical" | null;
}

interface CommonPanel {
  id: string;
  name: string;
  code: string;
  tests: string[];
}

interface NewOrderForm {
  patientId: string;
  patientName: string;
  selectedPanels: string[];
  priority: "routine" | "urgent" | "stat";
  specialInstructions: string;
  fasting: boolean;
}

interface ResultEntryRow {
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  draft: { backgroundColor: "#f3f4f6", color: "#4b5563", border: "1px solid #d1d5db" },
  pending: { backgroundColor: "#fefce8", color: "#ca8a04", border: "1px solid #fef08a" },
  sent: { backgroundColor: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe" },
  resulted: { backgroundColor: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" },
  cancelled: { backgroundColor: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" },
};

const PRIORITY_STYLES: Record<string, React.CSSProperties> = {
  routine: { backgroundColor: "#f3f4f6", color: "#4b5563" },
  urgent: { backgroundColor: "#fff7ed", color: "#ea580c" },
  stat: { backgroundColor: "#fef2f2", color: "#dc2626" },
};

const FLAG_STYLES: Record<string, React.CSSProperties> = {
  normal: { color: "#16a34a" },
  abnormal: { color: "#dc2626" },
  critical: { color: "#dc2626", fontWeight: 700 },
};

const STATUS_OPTIONS = ["all", "draft", "pending", "sent", "resulted", "cancelled"] as const;

// ─── Component ──────────────────────────────────────────────────────────────

export function LabOrdersTab() {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [commonPanels, setCommonPanels] = useState<CommonPanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [patientFilter, setPatientFilter] = useState("");

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Dialogs
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showAddResults, setShowAddResults] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // New order form
  const [orderForm, setOrderForm] = useState<NewOrderForm>({
    patientId: "",
    patientName: "",
    selectedPanels: [],
    priority: "routine",
    specialInstructions: "",
    fasting: false,
  });

  // Result entry
  const [resultRows, setResultRows] = useState<ResultEntryRow[]>([]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (searchQuery) params.set("search", searchQuery);
    if (patientFilter) params.set("patient", patientFilter);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await apiFetch<LabOrder[]>(`/lab-orders${qs}`);
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setOrders(Array.isArray(res.data) ? res.data : (res.data as any)?.data || []);
    }
    setLoading(false);
  }, [statusFilter, searchQuery, patientFilter]);

  const fetchPanels = useCallback(async () => {
    const res = await apiFetch<CommonPanel[]>("/lab-orders/common-panels");
    if (res.data) {
      setCommonPanels(Array.isArray(res.data) ? res.data : (res.data as any)?.data || []);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchPanels();
  }, [fetchOrders, fetchPanels]);

  const handleCreateOrder = async () => {
    if (!orderForm.patientId || orderForm.selectedPanels.length === 0) return;
    setSubmitting(true);
    const res = await apiFetch<LabOrder>("/lab-orders", {
      method: "POST",
      body: JSON.stringify({
        patientId: orderForm.patientId,
        panels: orderForm.selectedPanels,
        priority: orderForm.priority,
        specialInstructions: orderForm.specialInstructions || null,
        fasting: orderForm.fasting,
      }),
    });
    if (res.data) {
      setOrders((prev) => [res.data!, ...prev]);
      setShowNewOrder(false);
      setOrderForm({
        patientId: "",
        patientName: "",
        selectedPanels: [],
        priority: "routine",
        specialInstructions: "",
        fasting: false,
      });
    }
    setSubmitting(false);
  };

  const handleAddResults = async (orderId: string) => {
    if (resultRows.length === 0) return;
    setSubmitting(true);
    const res = await apiFetch<LabOrder>(`/lab-orders/${orderId}/results`, {
      method: "POST",
      body: JSON.stringify({ results: resultRows }),
    });
    if (res.data) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data! : o)));
      setShowAddResults(null);
      setResultRows([]);
    }
    setSubmitting(false);
  };

  const openAddResults = (order: LabOrder) => {
    // Pre-populate result rows from order panels
    const tests: ResultEntryRow[] = [];
    for (const panelName of order.panels) {
      const panel = commonPanels.find((p) => p.name === panelName || p.code === panelName);
      if (panel) {
        for (const test of panel.tests) {
          tests.push({ testName: test, value: "", unit: "", referenceRange: "" });
        }
      } else {
        tests.push({ testName: panelName, value: "", unit: "", referenceRange: "" });
      }
    }
    if (tests.length === 0) {
      tests.push({ testName: "", value: "", unit: "", referenceRange: "" });
    }
    setResultRows(tests);
    setShowAddResults(order.id);
  };

  const togglePanel = (panelName: string) => {
    setOrderForm((f) => ({
      ...f,
      selectedPanels: f.selectedPanels.includes(panelName)
        ? f.selectedPanels.filter((p) => p !== panelName)
        : [...f.selectedPanels, panelName],
    }));
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Filter Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status dropdown */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none border border-gray-300 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Patient filter */}
          <input
            type="text"
            placeholder="Filter by patient..."
            value={patientFilter}
            onChange={(e) => setPatientFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />

          {/* New Order */}
          <button
            onClick={() => setShowNewOrder(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg ml-auto"
            style={{ backgroundColor: "#3b82f6" }}
          >
            <Plus className="w-4 h-4" />
            New Lab Order
          </button>
        </div>
      </div>

      {/* ── Loading / Error ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mr-3" />
          <span className="text-gray-500">Loading lab orders...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-red-600">
          <AlertTriangle className="w-8 h-8 mb-2" />
          <p className="font-medium">{error}</p>
          <button
            onClick={fetchOrders}
            className="mt-4 px-4 py-2 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      ) : (
        /* ── Orders Table ──────────────────────────────────────────────────── */
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="w-8 px-4 py-3" />
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Order #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Patient</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Provider</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Panels</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Ordered</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Resulted</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                      <FlaskConical className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      No lab orders found.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <>
                      <tr
                        key={order.id}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                      >
                        <td className="px-4 py-3 text-gray-400">
                          {expandedId === order.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-700">{order.orderNumber}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{order.patientName}</td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{order.providerName}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {order.panels.map((panel) => (
                              <span
                                key={panel}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                style={{ backgroundColor: "#eff6ff", color: "#2563eb" }}
                              >
                                {panel}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
                            style={STATUS_STYLES[order.status] || {}}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(order.orderedDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {order.resultedDate ? new Date(order.resultedDate).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {(order.status === "sent" || order.status === "pending") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openAddResults(order);
                              }}
                              className="text-xs font-medium px-2 py-1 rounded hover:bg-gray-100"
                              style={{ color: "#2563eb" }}
                            >
                              Add Results
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded details */}
                      {expandedId === order.id && (
                        <tr key={`${order.id}-detail`}>
                          <td colSpan={9} className="px-6 py-4 bg-gray-50">
                            <div className="space-y-4">
                              {/* Order details */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <p className="text-gray-500">Priority</p>
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize mt-1"
                                    style={PRIORITY_STYLES[order.priority] || {}}
                                  >
                                    {order.priority}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-gray-500">Fasting</p>
                                  <p className="font-medium text-gray-900 mt-1">{order.fasting ? "Yes" : "No"}</p>
                                </div>
                                <div className="col-span-2">
                                  <p className="text-gray-500">Special Instructions</p>
                                  <p className="text-gray-900 mt-1">{order.specialInstructions || "None"}</p>
                                </div>
                              </div>

                              {/* Results table */}
                              {order.results && order.results.length > 0 && (
                                <div>
                                  <h4 className="font-semibold text-gray-900 mb-2">Results</h4>
                                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <table className="w-full">
                                      <thead>
                                        <tr className="bg-gray-100">
                                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Test</th>
                                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Value</th>
                                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Unit</th>
                                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Reference</th>
                                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Flag</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {order.results.map((r) => (
                                          <tr key={r.id} className="border-t border-gray-100">
                                            <td className="px-4 py-2 text-sm text-gray-900">{r.testName}</td>
                                            <td
                                              className="px-4 py-2 text-sm font-mono"
                                              style={r.flag ? FLAG_STYLES[r.flag] : { color: "#111827" }}
                                            >
                                              {r.value}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-gray-600">{r.unit}</td>
                                            <td className="px-4 py-2 text-sm text-gray-500">{r.referenceRange}</td>
                                            <td className="px-4 py-2">
                                              {r.flag && r.flag !== "normal" && (
                                                <span
                                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize"
                                                  style={
                                                    r.flag === "critical"
                                                      ? { backgroundColor: "#fef2f2", color: "#dc2626", fontWeight: 700 }
                                                      : { backgroundColor: "#fff7ed", color: "#ea580c" }
                                                  }
                                                >
                                                  {r.flag}
                                                </span>
                                              )}
                                              {r.flag === "normal" && (
                                                <CheckCircle2 className="w-4 h-4" style={{ color: "#16a34a" }} />
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
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── New Lab Order Dialog ────────────────────────────────────────────── */}
      {showNewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNewOrder(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">New Lab Order</h3>
              <button onClick={() => setShowNewOrder(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Patient */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Patient</label>
                <input
                  type="text"
                  placeholder="Patient name or ID..."
                  value={orderForm.patientName}
                  onChange={(e) =>
                    setOrderForm((f) => ({
                      ...f,
                      patientName: e.target.value,
                      patientId: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Panels */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Panels</label>
                <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {commonPanels.length === 0 ? (
                    <p className="text-sm text-gray-400">No panels available.</p>
                  ) : (
                    commonPanels.map((panel) => (
                      <label
                        key={panel.id}
                        className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={orderForm.selectedPanels.includes(panel.name)}
                          onChange={() => togglePanel(panel.name)}
                          className="mt-0.5 rounded border-gray-300"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {panel.name}
                            <span className="text-gray-400 font-normal ml-2">({panel.code})</span>
                          </p>
                          <p className="text-xs text-gray-500">{panel.tests.join(", ")}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                {orderForm.selectedPanels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {orderForm.selectedPanels.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: "#dbeafe", color: "#1e40af" }}
                      >
                        {p}
                        <button onClick={() => togglePanel(p)} className="hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <div className="relative">
                  <select
                    value={orderForm.priority}
                    onChange={(e) =>
                      setOrderForm((f) => ({ ...f, priority: e.target.value as NewOrderForm["priority"] }))
                    }
                    className="w-full appearance-none border border-gray-300 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">STAT</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Special Instructions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
                <textarea
                  value={orderForm.specialInstructions}
                  onChange={(e) => setOrderForm((f) => ({ ...f, specialInstructions: e.target.value }))}
                  rows={2}
                  placeholder="Any special instructions..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Fasting */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={orderForm.fasting}
                  onChange={(e) => setOrderForm((f) => ({ ...f, fasting: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Fasting required</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowNewOrder(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOrder}
                disabled={submitting || !orderForm.patientId || orderForm.selectedPanels.length === 0}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: "#3b82f6" }}
              >
                {submitting ? "Creating..." : "Create Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Results Dialog ──────────────────────────────────────────────── */}
      {showAddResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddResults(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Add Lab Results</h3>
              <button onClick={() => setShowAddResults(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Test Name</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Value</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Unit</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Reference Range</th>
                  </tr>
                </thead>
                <tbody>
                  {resultRows.map((row, idx) => (
                    <tr key={idx} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.testName}
                          onChange={(e) => {
                            const updated = [...resultRows];
                            updated[idx] = { ...updated[idx], testName: e.target.value };
                            setResultRows(updated);
                          }}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => {
                            const updated = [...resultRows];
                            updated[idx] = { ...updated[idx], value: e.target.value };
                            setResultRows(updated);
                          }}
                          placeholder="e.g. 5.7"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.unit}
                          onChange={(e) => {
                            const updated = [...resultRows];
                            updated[idx] = { ...updated[idx], unit: e.target.value };
                            setResultRows(updated);
                          }}
                          placeholder="e.g. %"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.referenceRange}
                          onChange={(e) => {
                            const updated = [...resultRows];
                            updated[idx] = { ...updated[idx], referenceRange: e.target.value };
                            setResultRows(updated);
                          }}
                          placeholder="e.g. 4.0-5.6"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setResultRows((prev) => [...prev, { testName: "", value: "", unit: "", referenceRange: "" }])}
              className="mt-3 text-sm font-medium flex items-center gap-1"
              style={{ color: "#3b82f6" }}
            >
              <Plus className="w-4 h-4" />
              Add Row
            </button>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddResults(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddResults(showAddResults)}
                disabled={submitting || resultRows.every((r) => !r.value)}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: "#3b82f6" }}
              >
                {submitting ? "Saving..." : "Save Results"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
