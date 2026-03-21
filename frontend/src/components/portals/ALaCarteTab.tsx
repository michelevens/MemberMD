// ===== A La Carte Tab =====
// Sub-tabs: Pricing | Visit Packs | Checkout
// Manages a la carte pricing, visit packs, and patient checkout

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../../lib/api";
import {
  DollarSign,
  Package,
  CreditCard,
  Search,
  Plus,
  Pencil,
  Check,
  X,
  ChevronDown,
  ShoppingCart,
  Tag,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ALaCartePrice {
  id: string;
  entitlementType: string;
  label: string;
  price: number;
  active: boolean;
}

interface VisitPack {
  id: string;
  name: string;
  entitlementType: string;
  quantity: number;
  price: number;
  description?: string;
  active: boolean;
}

interface PatientSearchResult {
  id: string;
  name: string;
  email?: string;
}

interface CheckoutResult {
  invoiceId: string;
  amount: number;
  status: string;
}

type SubTab = "pricing" | "visit-packs" | "checkout";

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

export function ALaCarteTab() {
  const [subTab, setSubTab] = useState<SubTab>("pricing");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pricing state
  const [prices, setPrices] = useState<ALaCartePrice[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  // Visit Packs state
  const [packs, setPacks] = useState<VisitPack[]>([]);
  const [showCreatePack, setShowCreatePack] = useState(false);
  const [newPack, setNewPack] = useState({ name: "", entitlementType: "", quantity: "", price: "", description: "" });
  const [creatingPack, setCreatingPack] = useState(false);

  // Checkout state
  const [checkoutPatientSearch, setCheckoutPatientSearch] = useState("");
  const [checkoutPatientResults, setCheckoutPatientResults] = useState<PatientSearchResult[]>([]);
  const [checkoutPatient, setCheckoutPatient] = useState<PatientSearchResult | null>(null);
  const [showCheckoutDropdown, setShowCheckoutDropdown] = useState(false);
  const [checkoutService, setCheckoutService] = useState("");
  const [checkoutQuantity, setCheckoutQuantity] = useState("1");
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Sub-tab Config ─────────────────────────────────────────────────────

  const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType }[] = [
    { id: "pricing", label: "Pricing", icon: Tag },
    { id: "visit-packs", label: "Visit Packs", icon: Package },
    { id: "checkout", label: "Checkout", icon: ShoppingCart },
  ];

  // ─── Load Data ──────────────────────────────────────────────────────────

  const loadPrices = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<ALaCartePrice[]>("/a-la-carte/prices");
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setPrices(res.data);
    }
    setLoading(false);
  }, []);

  const loadPacks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<VisitPack[]>("/visit-packs");
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setPacks(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (subTab === "pricing") loadPrices();
    else if (subTab === "visit-packs") loadPacks();
    else {
      loadPrices(); // checkout needs prices
      setLoading(false);
    }
  }, [subTab, loadPrices, loadPacks]);

  // ─── Patient Search for Checkout (debounced 400ms) ──────────────────────

  const searchCheckoutPatients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCheckoutPatientResults([]);
      return;
    }
    const res = await apiFetch<PatientSearchResult[]>(`/patients/search?q=${encodeURIComponent(query)}`);
    if (!res.error && res.data) {
      setCheckoutPatientResults(res.data);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!checkoutPatientSearch || checkoutPatient) return;
    debounceRef.current = setTimeout(() => {
      searchCheckoutPatients(checkoutPatientSearch);
      setShowCheckoutDropdown(true);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [checkoutPatientSearch, checkoutPatient, searchCheckoutPatients]);

  // ─── Save Price ─────────────────────────────────────────────────────────

  const handleSavePrice = async (id: string) => {
    setSavingPrice(true);
    const res = await apiFetch<ALaCartePrice>("/a-la-carte/prices", {
      method: "POST",
      body: JSON.stringify({ id, price: parseFloat(editPrice) }),
    });
    setSavingPrice(false);
    if (!res.error) {
      setEditingId(null);
      setEditPrice("");
      loadPrices();
    }
  };

  // ─── Create Pack ────────────────────────────────────────────────────────

  const handleCreatePack = async () => {
    setCreatingPack(true);
    const res = await apiFetch<VisitPack>("/visit-packs", {
      method: "POST",
      body: JSON.stringify({
        name: newPack.name,
        entitlementType: newPack.entitlementType,
        quantity: parseInt(newPack.quantity, 10),
        price: parseFloat(newPack.price),
        description: newPack.description,
      }),
    });
    setCreatingPack(false);
    if (!res.error) {
      setShowCreatePack(false);
      setNewPack({ name: "", entitlementType: "", quantity: "", price: "", description: "" });
      loadPacks();
    }
  };

  // ─── Checkout ───────────────────────────────────────────────────────────

  const selectedPriceItem = prices.find((p) => p.id === checkoutService);
  const checkoutTotal = selectedPriceItem ? selectedPriceItem.price * parseInt(checkoutQuantity || "0", 10) : 0;

  const handleCheckout = async () => {
    if (!checkoutPatient || !checkoutService) return;
    setCheckoutSubmitting(true);
    const res = await apiFetch<CheckoutResult>("/a-la-carte/checkout", {
      method: "POST",
      body: JSON.stringify({
        patientId: checkoutPatient.id,
        priceId: checkoutService,
        quantity: parseInt(checkoutQuantity, 10),
      }),
    });
    setCheckoutSubmitting(false);
    if (!res.error && res.data) {
      setCheckoutResult(res.data);
      // Reset
      setCheckoutPatient(null);
      setCheckoutPatientSearch("");
      setCheckoutService("");
      setCheckoutQuantity("1");
    }
  };

  // ─── Render Pricing Tab ─────────────────────────────────────────────────

  const renderPricing = () => (
    <div className="glass rounded-xl p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <Tag className="w-5 h-5" style={{ color: "#1e40af" }} />
        A La Carte Pricing
      </h3>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading prices...</div>
      ) : prices.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No pricing configured yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-3 font-semibold text-slate-600">Entitlement Type</th>
                <th className="text-left py-3 px-3 font-semibold text-slate-600">Label</th>
                <th className="text-left py-3 px-3 font-semibold text-slate-600">Price</th>
                <th className="text-left py-3 px-3 font-semibold text-slate-600">Status</th>
                <th className="text-right py-3 px-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      style={{ backgroundColor: "#e0ecff", color: "#1e40af" }}
                    >
                      {p.entitlementType}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-800">{p.label}</td>
                  <td className="py-3 px-3">
                    {editingId === p.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">$</span>
                        <input
                          type="number"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          step="0.01"
                          min="0"
                          className="w-24 px-2 py-1 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <span className="font-medium text-slate-800">${p.price.toFixed(2)}</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: p.active ? "#e6f7f2" : "#f1f5f9",
                        color: p.active ? "#147d64" : "#64748b",
                      }}
                    >
                      {p.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    {editingId === p.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleSavePrice(p.id)}
                          disabled={savingPrice}
                          className="p-1.5 rounded hover:bg-green-50 transition-colors"
                          title="Save"
                        >
                          <Check className="w-4 h-4" style={{ color: "#22c55e" }} />
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditPrice(""); }}
                          className="p-1.5 rounded hover:bg-red-50 transition-colors"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" style={{ color: "#ef4444" }} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingId(p.id); setEditPrice(p.price.toString()); }}
                        className="p-1.5 rounded hover:bg-slate-100 transition-colors"
                        title="Edit price"
                      >
                        <Pencil className="w-4 h-4 text-slate-400" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ─── Render Visit Packs Tab ─────────────────────────────────────────────

  const renderVisitPacks = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Package className="w-5 h-5" style={{ color: "#7c3aed" }} />
          Visit Packs
        </h3>
        <button
          onClick={() => setShowCreatePack(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
          style={{ backgroundColor: "#1e40af" }}
        >
          <Plus className="w-4 h-4" /> Create Pack
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading visit packs...</div>
      ) : packs.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center text-slate-400">
          No visit packs created yet. Click "Create Pack" to add one.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packs.map((pack) => (
            <div key={pack.id} className="glass rounded-xl p-5 hover-lift">
              <div className="flex items-start justify-between mb-3">
                <h4 className="font-semibold text-slate-800">{pack.name}</h4>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: pack.active ? "#e6f7f2" : "#f1f5f9",
                    color: pack.active ? "#147d64" : "#64748b",
                  }}
                >
                  {pack.active ? "Active" : "Inactive"}
                </span>
              </div>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mb-3"
                style={{ backgroundColor: "#f3e8ff", color: "#7c3aed" }}
              >
                {pack.entitlementType}
              </span>
              {pack.description && (
                <p className="text-sm text-slate-500 mb-3">{pack.description}</p>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div>
                  <span className="text-sm text-slate-500">Quantity: </span>
                  <span className="font-medium text-slate-800">{pack.quantity}</span>
                </div>
                <div>
                  <span className="text-2xl font-bold text-slate-800">${pack.price.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Pack Dialog */}
      <DialogOverlay open={showCreatePack} onClose={() => setShowCreatePack(false)} title="Create Visit Pack">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Pack Name *</label>
            <input
              type="text"
              value={newPack.name}
              onChange={(e) => setNewPack({ ...newPack, name: e.target.value })}
              placeholder="e.g., 5-Visit Office Pack"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Entitlement Type *</label>
            <input
              type="text"
              value={newPack.entitlementType}
              onChange={(e) => setNewPack({ ...newPack, entitlementType: e.target.value })}
              placeholder="e.g., office_visit"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
              <input
                type="number"
                value={newPack.quantity}
                onChange={(e) => setNewPack({ ...newPack, quantity: e.target.value })}
                min="1"
                placeholder="5"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Pack Price ($) *</label>
              <input
                type="number"
                value={newPack.price}
                onChange={(e) => setNewPack({ ...newPack, price: e.target.value })}
                step="0.01"
                min="0"
                placeholder="199.00"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={newPack.description}
              onChange={(e) => setNewPack({ ...newPack, description: e.target.value })}
              placeholder="Optional description..."
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowCreatePack(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePack}
              disabled={!newPack.name || !newPack.entitlementType || !newPack.quantity || !newPack.price || creatingPack}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#1e40af" }}
            >
              {creatingPack ? "Creating..." : "Create Pack"}
            </button>
          </div>
        </div>
      </DialogOverlay>
    </div>
  );

  // ─── Render Checkout Tab ────────────────────────────────────────────────

  const renderCheckout = () => (
    <div className="glass rounded-xl p-6 max-w-2xl">
      <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <ShoppingCart className="w-5 h-5" style={{ color: "#147d64" }} />
        Patient Checkout
      </h3>

      {checkoutResult && (
        <div
          className="p-3 mb-4 rounded-lg text-sm"
          style={{ backgroundColor: "#e6f7f2", color: "#147d64" }}
        >
          Charged ${checkoutResult.amount.toFixed(2)} — Invoice #{checkoutResult.invoiceId} ({checkoutResult.status})
        </div>
      )}

      <div className="space-y-4">
        {/* Patient Search */}
        <div className="relative">
          <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={checkoutPatientSearch}
              onChange={(e) => {
                setCheckoutPatientSearch(e.target.value);
                if (checkoutPatient) setCheckoutPatient(null);
              }}
              placeholder="Search patient..."
              className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            {checkoutPatient && (
              <button
                onClick={() => { setCheckoutPatient(null); setCheckoutPatientSearch(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>
          {showCheckoutDropdown && checkoutPatientResults.length > 0 && !checkoutPatient && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {checkoutPatientResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setCheckoutPatient(p);
                    setCheckoutPatientSearch(p.name);
                    setShowCheckoutDropdown(false);
                    setCheckoutPatientResults([]);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                >
                  <span className="font-medium text-slate-800">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Service Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Service *</label>
          <div className="relative">
            <select
              value={checkoutService}
              onChange={(e) => setCheckoutService(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
            >
              <option value="">Select service...</option>
              {prices.filter((p) => p.active).map((p) => (
                <option key={p.id} value={p.id}>{p.label} — ${p.price.toFixed(2)}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
          <input
            type="number"
            value={checkoutQuantity}
            onChange={(e) => setCheckoutQuantity(e.target.value)}
            min="1"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Total */}
        <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: "#f8fafc" }}>
          <span className="text-sm font-medium text-slate-600">Total</span>
          <span className="text-2xl font-bold text-slate-800">${checkoutTotal.toFixed(2)}</span>
        </div>

        {/* Charge Button */}
        <button
          onClick={handleCheckout}
          disabled={!checkoutPatient || !checkoutService || checkoutSubmitting}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "#147d64" }}
        >
          <CreditCard className="w-4 h-4" />
          {checkoutSubmitting ? "Processing..." : `Charge $${checkoutTotal.toFixed(2)}`}
        </button>
      </div>
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Tag} label="Active Prices" value={prices.filter((p) => p.active).length.toString()} color="#1e40af" />
        <StatCard icon={Package} label="Visit Packs" value={packs.length.toString()} color="#7c3aed" />
        <StatCard icon={DollarSign} label="Avg. Pack Price" value={
          packs.length > 0
            ? "$" + (packs.reduce((s, p) => s + p.price, 0) / packs.length).toFixed(0)
            : "$0"
        } color="#147d64" />
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: "#f1f5f9" }}>
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              backgroundColor: subTab === tab.id ? "#ffffff" : "transparent",
              color: subTab === tab.id ? "#1e40af" : "#64748b",
              boxShadow: subTab === tab.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}>
          {error}
        </div>
      )}

      {/* Content */}
      {subTab === "pricing" && renderPricing()}
      {subTab === "visit-packs" && renderVisitPacks()}
      {subTab === "checkout" && renderCheckout()}
    </div>
  );
}
