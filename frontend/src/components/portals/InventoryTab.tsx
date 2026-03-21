// ===== Inventory Tab =====
// Sub-tabs: Inventory | Dispensing Report
// Manages medication/supply inventory, dispensing, and reporting

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/api";
import {
  Search,
  Plus,
  Package,
  BarChart3,
  AlertTriangle,
  X,
  Minus,
  ArrowDownToLine,
  Calendar,
  DollarSign,
  TrendingUp,
  Pill,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantityOnHand: number;
  reorderPoint: number;
  unitCost: number;
  sellPrice: number;
  expirationDate: string;
  ndc?: string;
  supplier?: string;
}

interface DispensingRecord {
  id: string;
  itemId: string;
  itemName: string;
  patientId: string;
  patientName: string;
  quantity: number;
  unitCost: number;
  sellPrice: number;
  notes: string;
  dispensedAt: string;
}

interface DispensingReportSummary {
  itemsDispensed: number;
  totalCost: number;
  totalRevenue: number;
  profitMargin: number;
}

interface DispensingReportGroup {
  itemName: string;
  totalQuantity: number;
  totalCost: number;
  totalRevenue: number;
  records: DispensingRecord[];
}

type SubTab = "inventory" | "dispensing-report";

// ─── Category Badge ──────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    medication: { bg: "#e6f7f2", text: "#147d64" },
    vaccine: { bg: "#e0ecff", text: "#1e40af" },
    supply: { bg: "#fffbeb", text: "#d97706" },
    lab: { bg: "#f3e8ff", text: "#7c3aed" },
    equipment: { bg: "#fef2f2", text: "#dc2626" },
  };
  const c = config[category.toLowerCase()] || { bg: "#f1f5f9", text: "#64748b" };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {category}
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

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="glass rounded-xl p-5 hover-lift">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function InventoryTab() {
  const [subTab, setSubTab] = useState<SubTab>("inventory");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inventory state
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState("");
  const [dispenseItem, setDispenseItem] = useState<InventoryItem | null>(null);

  // Dispense form
  const [dispenseForm, setDispenseForm] = useState({ patientId: "", patientName: "", quantity: "", notes: "" });

  // Add item form
  const [newItem, setNewItem] = useState({
    name: "", category: "medication", quantityOnHand: "", reorderPoint: "",
    unitCost: "", sellPrice: "", expirationDate: "",
  });

  // Dispensing report state
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [reportSummary, setReportSummary] = useState<DispensingReportSummary | null>(null);
  const [reportGroups, setReportGroups] = useState<DispensingReportGroup[]>([]);

  // ─── Categories ──────────────────────────────────────────────────────────

  const categories = Array.from(new Set(items.map((i) => i.category)));

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [itemsRes, lowStockRes] = await Promise.all([
      apiFetch<InventoryItem[]>("/inventory"),
      apiFetch<InventoryItem[]>("/inventory/low-stock"),
    ]);
    if (itemsRes.error) {
      setError(itemsRes.error);
    } else {
      const list = Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.data as any)?.data || [];
      setItems(list);
    }
    const lowList = Array.isArray(lowStockRes.data) ? lowStockRes.data : (lowStockRes.data as any)?.data || [];
    setLowStockItems(lowList);
    setLoading(false);
  }, []);

  const loadDispensingReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (reportDateFrom) params.set("from", reportDateFrom);
    if (reportDateTo) params.set("to", reportDateTo);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    const res = await apiFetch<{ summary: DispensingReportSummary; groups: DispensingReportGroup[] }>(`/inventory/dispensing-report${queryString}`);
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setReportSummary(res.data.summary);
      setReportGroups(res.data.groups);
    }
    setLoading(false);
  }, [reportDateFrom, reportDateTo]);

  useEffect(() => {
    if (subTab === "inventory") loadInventory();
    else if (subTab === "dispensing-report") loadDispensingReport();
  }, [subTab, loadInventory, loadDispensingReport]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleAddItem = async () => {
    const res = await apiFetch<InventoryItem>("/inventory", {
      method: "POST",
      body: JSON.stringify({
        ...newItem,
        quantityOnHand: parseInt(newItem.quantityOnHand),
        reorderPoint: parseInt(newItem.reorderPoint),
        unitCost: parseFloat(newItem.unitCost),
        sellPrice: parseFloat(newItem.sellPrice),
      }),
    });
    if (res.error) {
      setError(res.error);
    } else {
      setShowAddItem(false);
      setNewItem({ name: "", category: "medication", quantityOnHand: "", reorderPoint: "", unitCost: "", sellPrice: "", expirationDate: "" });
      loadInventory();
    }
  };

  const handleRestock = async (itemId: string) => {
    const qty = parseInt(restockQty);
    if (!qty || qty <= 0) return;
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const res = await apiFetch<InventoryItem>(`/inventory/${itemId}`, {
      method: "PUT",
      body: JSON.stringify({ quantityOnHand: item.quantityOnHand + qty }),
    });
    if (res.error) {
      setError(res.error);
    } else {
      setRestockingId(null);
      setRestockQty("");
      loadInventory();
    }
  };

  const handleDispense = async () => {
    if (!dispenseItem) return;
    const res = await apiFetch<DispensingRecord>(`/inventory/${dispenseItem.id}/dispense`, {
      method: "POST",
      body: JSON.stringify({
        patientId: dispenseForm.patientId,
        quantity: parseInt(dispenseForm.quantity),
        notes: dispenseForm.notes,
      }),
    });
    if (res.error) {
      setError(res.error);
    } else {
      setDispenseItem(null);
      setDispenseForm({ patientId: "", patientName: "", quantity: "", notes: "" });
      loadInventory();
    }
  };

  // ─── Filtered Items ──────────────────────────────────────────────────────

  const lowStockIds = new Set(lowStockItems.map((i) => i.id));

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // ─── Sub-tabs ─────────────────────────────────────────────────────────────

  const subTabs: { id: SubTab; label: string; icon: React.ElementType }[] = [
    { id: "inventory", label: "Inventory", icon: Package },
    { id: "dispensing-report", label: "Dispensing Report", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{ backgroundColor: "#fffbeb", borderLeft: "4px solid #f59e0b" }}
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: "#d97706" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#92400e" }}>
              Low Stock Alert
            </p>
            <p className="text-sm" style={{ color: "#a16207" }}>
              {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} below reorder point:{" "}
              {lowStockItems.map((i) => i.name).join(", ")}
            </p>
          </div>
        </div>
      )}

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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="ml-3 text-slate-500">Loading...</span>
        </div>
      )}

      {/* ─── Inventory Tab ──────────────────────────────────────────────── */}
      {!loading && subTab === "inventory" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search inventory..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowAddItem(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: "#27ab83" }}
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>

          {/* Table */}
          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#f8fafc" }}>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Category</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">Qty on Hand</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">Reorder Point</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">Unit Cost</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">Sell Price</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Expiration</th>
                  <th className="w-40" />
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      No items found.
                    </td>
                  </tr>
                )}
                {filteredItems.map((item) => {
                  const isLowStock = lowStockIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-slate-100 transition-colors"
                      style={isLowStock ? { backgroundColor: "#fffbeb" } : undefined}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {item.name}
                        {isLowStock && (
                          <AlertTriangle className="inline w-3.5 h-3.5 ml-1.5" style={{ color: "#d97706" }} />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={item.category} />
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{item.quantityOnHand}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{item.reorderPoint}</td>
                      <td className="px-4 py-3 text-right text-slate-700">${item.unitCost.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">${item.sellPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-600">{item.expirationDate}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {restockingId === item.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                value={restockQty}
                                onChange={(e) => setRestockQty(e.target.value)}
                                className="w-16 px-2 py-1 rounded border border-slate-200 text-xs"
                                placeholder="Qty"
                              />
                              <button
                                onClick={() => handleRestock(item.id)}
                                className="p-1 rounded text-white"
                                style={{ backgroundColor: "#27ab83" }}
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => { setRestockingId(null); setRestockQty(""); }}
                                className="p-1 rounded hover:bg-slate-100"
                              >
                                <X className="w-3 h-3 text-slate-400" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setRestockingId(item.id)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-slate-200 hover:bg-slate-50"
                              >
                                <ArrowDownToLine className="w-3 h-3" />
                                Restock
                              </button>
                              <button
                                onClick={() => setDispenseItem(item)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-white"
                                style={{ backgroundColor: "#3b82f6" }}
                              >
                                <Minus className="w-3 h-3" />
                                Dispense
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Item Dialog */}
          <DialogOverlay open={showAddItem} onClose={() => setShowAddItem(false)} title="Add Inventory Item">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g. Amoxicillin 500mg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="medication">Medication</option>
                  <option value="vaccine">Vaccine</option>
                  <option value="supply">Supply</option>
                  <option value="lab">Lab</option>
                  <option value="equipment">Equipment</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity on Hand</label>
                  <input
                    type="number"
                    value={newItem.quantityOnHand}
                    onChange={(e) => setNewItem({ ...newItem, quantityOnHand: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reorder Point</label>
                  <input
                    type="number"
                    value={newItem.reorderPoint}
                    onChange={(e) => setNewItem({ ...newItem, reorderPoint: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newItem.unitCost}
                    onChange={(e) => setNewItem({ ...newItem, unitCost: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="5.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sell Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newItem.sellPrice}
                    onChange={(e) => setNewItem({ ...newItem, sellPrice: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="15.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expiration Date</label>
                <input
                  type="date"
                  value={newItem.expirationDate}
                  onChange={(e) => setNewItem({ ...newItem, expirationDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowAddItem(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={!newItem.name || !newItem.quantityOnHand || !newItem.unitCost || !newItem.sellPrice}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: "#27ab83" }}
                >
                  Add Item
                </button>
              </div>
            </div>
          </DialogOverlay>

          {/* Dispense Dialog */}
          <DialogOverlay
            open={!!dispenseItem}
            onClose={() => { setDispenseItem(null); setDispenseForm({ patientId: "", patientName: "", quantity: "", notes: "" }); }}
            title={`Dispense — ${dispenseItem?.name || ""}`}
          >
            {dispenseItem && (
              <div className="space-y-4">
                <div
                  className="flex items-center gap-2 p-3 rounded-lg text-sm"
                  style={{ backgroundColor: "#f0fdf4", color: "#166534" }}
                >
                  <Package className="w-4 h-4" />
                  Current stock: <strong>{dispenseItem.quantityOnHand}</strong> units
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
                  <input
                    type="text"
                    value={dispenseForm.patientName}
                    onChange={(e) => setDispenseForm({ ...dispenseForm, patientName: e.target.value, patientId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Search patient name..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    max={dispenseItem.quantityOnHand}
                    value={dispenseForm.quantity}
                    onChange={(e) => setDispenseForm({ ...dispenseForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea
                    value={dispenseForm.notes}
                    onChange={(e) => setDispenseForm({ ...dispenseForm, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    placeholder="Dispensing notes..."
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => { setDispenseItem(null); setDispenseForm({ patientId: "", patientName: "", quantity: "", notes: "" }); }}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDispense}
                    disabled={!dispenseForm.patientName || !dispenseForm.quantity}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: "#3b82f6" }}
                  >
                    Dispense
                  </button>
                </div>
              </div>
            )}
          </DialogOverlay>
        </div>
      )}

      {/* ─── Dispensing Report Tab ───────────────────────────────────────── */}
      {!loading && subTab === "dispensing-report" && (
        <div className="space-y-6">
          {/* Date range picker */}
          <div className="flex items-center gap-3 flex-wrap">
            <Calendar className="w-4 h-4 text-slate-400" />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={reportDateFrom}
                onChange={(e) => setReportDateFrom(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-slate-400 text-sm">to</span>
              <input
                type="date"
                value={reportDateTo}
                onChange={(e) => setReportDateTo(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={loadDispensingReport}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: "#27ab83" }}
            >
              Apply
            </button>
          </div>

          {/* Summary cards */}
          {reportSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Pill} label="Items Dispensed" value={reportSummary.itemsDispensed.toString()} color="#3b82f6" />
              <StatCard icon={DollarSign} label="Total Cost" value={`$${reportSummary.totalCost.toLocaleString()}`} color="#ef4444" />
              <StatCard icon={DollarSign} label="Total Revenue" value={`$${reportSummary.totalRevenue.toLocaleString()}`} color="#27ab83" />
              <StatCard icon={TrendingUp} label="Profit Margin" value={`${reportSummary.profitMargin.toFixed(1)}%`} color="#7c3aed" />
            </div>
          )}

          {/* Grouped table */}
          {reportGroups.length === 0 && !loading && (
            <div className="text-center py-8 text-slate-400">No dispensing records for this period.</div>
          )}
          {reportGroups.map((group) => (
            <div key={group.itemName} className="glass rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: "#f8fafc" }}>
                <h4 className="font-semibold text-slate-800">{group.itemName}</h4>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span>Qty: {group.totalQuantity}</span>
                  <span>Cost: ${group.totalCost.toFixed(2)}</span>
                  <span>Revenue: ${group.totalRevenue.toFixed(2)}</span>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-slate-100">
                    <th className="text-left px-4 py-2 font-medium text-slate-500">Patient</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-500">Qty</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-500">Cost</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-500">Revenue</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-500">Notes</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {group.records.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-800">{r.patientName}</td>
                      <td className="px-4 py-2 text-right text-slate-700">{r.quantity}</td>
                      <td className="px-4 py-2 text-right text-slate-700">${(r.unitCost * r.quantity).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-slate-700">${(r.sellPrice * r.quantity).toFixed(2)}</td>
                      <td className="px-4 py-2 text-slate-500">{r.notes || "—"}</td>
                      <td className="px-4 py-2 text-slate-500">{r.dispensedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
