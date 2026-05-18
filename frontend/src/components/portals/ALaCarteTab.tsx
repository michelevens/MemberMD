// ===== A La Carte Tab =====
// Sub-tabs: Pricing | Visit Packs | Checkout
// Manages a la carte pricing, visit packs, and patient checkout

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../../lib/api";
import { EmptyState } from "../shared/EmptyState";
import { LoadingState } from "../shared/LoadingState";
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
  // The API returns the entitlement_type relation joined as a nested
  // object. After apiFetch's snake→camel transform it lands as
  // `entitlementType: { id, name, code, category, ... }`. There is
  // also entitlementTypeId (the FK column) on the row itself.
  entitlementTypeId: string;
  entitlementType?: {
    id: string;
    name: string;
    code: string;
    category?: string;
    unitOfMeasure?: string;
  } | null;
  // Server-side numeric in JSON; cast to number for display.
  price: number | string;
  description?: string | null;
  isActive: boolean;
}

interface EntitlementTypeOption {
  id: string;
  name: string;
  code: string;
  category?: string;
  isSystem?: boolean;
}

interface VisitPack {
  id: string;
  name: string;
  // Backend stores entitlement_type_id (FK) + joins entitlementType.
  entitlementTypeId: string;
  entitlementType?: {
    id: string;
    name: string;
    code: string;
    category?: string;
  } | null;
  quantity: number;
  price: number | string;
  description?: string;
  isActive: boolean;
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
  // Catalog of entitlement_types for the "+ Add price" picker. Loaded
  // once on mount so the dialog is instant.
  const [entitlementTypes, setEntitlementTypes] = useState<EntitlementTypeOption[]>([]);
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [addPriceTypeId, setAddPriceTypeId] = useState("");
  const [addPriceValue, setAddPriceValue] = useState("");
  const [addPriceSearch, setAddPriceSearch] = useState("");
  const [addingPrice, setAddingPrice] = useState(false);

  // Visit Packs state
  const [packs, setPacks] = useState<VisitPack[]>([]);
  const [showCreatePack, setShowCreatePack] = useState(false);
  const [newPack, setNewPack] = useState({ name: "", entitlementTypeId: "", quantity: "", price: "", description: "" });
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>("/a-la-carte/prices");
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: ALaCartePrice[] = Array.isArray(res.data)
        ? res.data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : Array.isArray((res.data as any)?.data)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (res.data as any).data
          : [];
      setPrices(list);
    }
    setLoading(false);
  }, []);

  // Load the entitlement-type catalog once for the "+ Add price"
  // picker. Backend returns system + tenant rows deduped.
  const loadEntitlementTypes = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await apiFetch<any>("/entitlement-types?is_active=true");
    if (res.error || !res.data) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: EntitlementTypeOption[] = Array.isArray(res.data)
      ? res.data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : Array.isArray((res.data as any)?.data)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (res.data as any).data
        : [];
    setEntitlementTypes(list);
  }, []);

  useEffect(() => { void loadEntitlementTypes(); }, [loadEntitlementTypes]);

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
    const res = await apiFetch<unknown>(`/patients?search=${encodeURIComponent(query)}`);
    if (!res.error && res.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCheckoutPatientResults(list.map((p: any) => ({
        id: p.id,
        name: `${p.firstName || p.first_name || ""} ${p.lastName || p.last_name || ""}`.trim(),
      })));
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

  const handleSavePrice = async (priceRow: ALaCartePrice) => {
    // Backend upserts on (tenant_id, entitlement_type_id), so we send
    // the entitlement_type_id from the existing row + new price. The
    // controller doesn't accept an `id` field; passing it was a noop
    // and is why edits never persisted before this fix.
    setSavingPrice(true);
    const res = await apiFetch<ALaCartePrice>("/a-la-carte/prices", {
      method: "POST",
      body: JSON.stringify({
        entitlement_type_id: priceRow.entitlementTypeId,
        price: parseFloat(editPrice),
        is_active: priceRow.isActive,
      }),
    });
    setSavingPrice(false);
    if (!res.error) {
      setEditingId(null);
      setEditPrice("");
      loadPrices();
    } else {
      setError(res.error);
    }
  };

  const handleAddPrice = async () => {
    if (!addPriceTypeId || !addPriceValue) return;
    setAddingPrice(true);
    const res = await apiFetch<ALaCartePrice>("/a-la-carte/prices", {
      method: "POST",
      body: JSON.stringify({
        entitlement_type_id: addPriceTypeId,
        price: parseFloat(addPriceValue),
        is_active: true,
      }),
    });
    setAddingPrice(false);
    if (!res.error) {
      setShowAddPrice(false);
      setAddPriceTypeId("");
      setAddPriceValue("");
      setAddPriceSearch("");
      loadPrices();
    } else {
      setError(res.error);
    }
  };

  // ─── Create Pack ────────────────────────────────────────────────────────

  const handleCreatePack = async () => {
    setCreatingPack(true);
    const res = await apiFetch<VisitPack>("/visit-packs", {
      method: "POST",
      body: JSON.stringify({
        name: newPack.name,
        entitlement_type_id: newPack.entitlementTypeId,
        quantity: parseInt(newPack.quantity, 10),
        price: parseFloat(newPack.price),
        description: newPack.description,
      }),
    });
    setCreatingPack(false);
    if (!res.error) {
      setShowCreatePack(false);
      setNewPack({ name: "", entitlementTypeId: "", quantity: "", price: "", description: "" });
      loadPacks();
    } else {
      setError(res.error);
    }
  };

  // ─── Checkout ───────────────────────────────────────────────────────────

  const selectedPriceItem = prices.find((p) => p.id === checkoutService);
  const checkoutTotal = selectedPriceItem
    ? (typeof selectedPriceItem.price === "string" ? parseFloat(selectedPriceItem.price) : selectedPriceItem.price)
      * parseInt(checkoutQuantity || "0", 10)
    : 0;

  const handleCheckout = async () => {
    if (!checkoutPatient || !checkoutService) return;
    const priceRow = prices.find((p) => p.id === checkoutService);
    if (!priceRow) return;
    setCheckoutSubmitting(true);
    // Backend expects entitlement_type_id (it looks up the
    // ALaCartePrice row by tenant + type internally), not the
    // ALaCartePrice row id.
    const res = await apiFetch<CheckoutResult>("/a-la-carte/checkout", {
      method: "POST",
      body: JSON.stringify({
        patient_id: checkoutPatient.id,
        entitlement_type_id: priceRow.entitlementTypeId,
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

  const renderPricing = () => {
    // Filter the catalog for the "+ Add price" picker — exclude
    // entitlement types that already have a price row.
    const pricedTypeIds = new Set(prices.map((p) => p.entitlementTypeId));
    const lower = addPriceSearch.trim().toLowerCase();
    const pickable = entitlementTypes
      .filter((et) => !pricedTypeIds.has(et.id))
      .filter((et) => !lower
        || et.name.toLowerCase().includes(lower)
        || et.code.toLowerCase().includes(lower));

    return (
    <div className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Tag className="w-5 h-5" style={{ color: "#1e40af" }} />
          A La Carte Pricing
        </h3>
        <button
          onClick={() => setShowAddPrice(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: "#27ab83" }}
        >
          <Plus className="w-3.5 h-3.5" /> Add price
        </button>
      </div>

      {loading ? (
        <LoadingState label="Loading prices…" />
      ) : prices.length === 0 ? (
        <EmptyState
          icon={<Tag className="w-5 h-5" />}
          title="No pricing configured yet"
          description='Click "Add price" to set self-pay rates from your entitlement catalog.'
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-3 font-semibold text-slate-600">Entitlement</th>
                <th className="text-left py-3 px-3 font-semibold text-slate-600">Category</th>
                <th className="text-left py-3 px-3 font-semibold text-slate-600">Price</th>
                <th className="text-left py-3 px-3 font-semibold text-slate-600">Status</th>
                <th className="text-right py-3 px-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => {
                const et = p.entitlementType;
                const name = et?.name ?? "(unknown)";
                const code = et?.code ?? "";
                const category = et?.category ?? "";
                const priceNum = typeof p.price === "string" ? parseFloat(p.price) : p.price;
                return (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-3">
                    <p className="font-medium text-slate-800">{name}</p>
                    <p className="text-xs text-slate-400 font-mono">{code}</p>
                  </td>
                  <td className="py-3 px-3">
                    {category && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: "#e0ecff", color: "#1e40af" }}
                      >
                        {category.replace(/_/g, " ")}
                      </span>
                    )}
                  </td>
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
                      <span className="font-medium text-slate-800">${(priceNum || 0).toFixed(2)}</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: p.isActive ? "#e6f7f2" : "#f1f5f9",
                        color: p.isActive ? "#147d64" : "#64748b",
                      }}
                    >
                      {p.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    {editingId === p.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleSavePrice(p)}
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
                        onClick={() => { setEditingId(p.id); setEditPrice(String(priceNum)); }}
                        className="p-1.5 rounded hover:bg-slate-100 transition-colors"
                        title="Edit price"
                      >
                        <Pencil className="w-4 h-4 text-slate-400" />
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DialogOverlay
        open={showAddPrice}
        onClose={() => { setShowAddPrice(false); setAddPriceTypeId(""); setAddPriceValue(""); setAddPriceSearch(""); }}
        title="Add à la carte price"
      >
        <p className="text-xs text-slate-500 mb-3">
          Pick an entitlement from your catalog and set the self-pay price. Practice members can buy this from their portal under "À La Carte" or staff can charge it on their behalf via Checkout.
        </p>

        <label className="block text-xs font-medium text-slate-600 mb-1">Entitlement</label>
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={addPriceSearch}
            onChange={(e) => setAddPriceSearch(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
          />
        </div>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 mb-3">
          {pickable.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">
              {entitlementTypes.length === 0
                ? "Loading catalog…"
                : "Every entitlement already has a price. Edit existing rows above."}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pickable.slice(0, 50).map((et) => {
                const sel = addPriceTypeId === et.id;
                return (
                  <button
                    key={et.id}
                    onClick={() => setAddPriceTypeId(et.id)}
                    className="w-full text-left px-3 py-2 transition-colors"
                    style={{
                      backgroundColor: sel ? "#eff6ff" : "transparent",
                    }}
                  >
                    <p className="text-sm font-medium text-slate-800">{et.name}</p>
                    <p className="text-xs text-slate-400 font-mono">
                      {et.code}
                      {et.category ? ` · ${et.category.replace(/_/g, " ")}` : ""}
                      {et.isSystem ? " · platform default" : ""}
                    </p>
                  </button>
                );
              })}
              {pickable.length > 50 && (
                <p className="text-xs text-slate-400 text-center py-2">
                  Showing first 50 — refine your search to narrow.
                </p>
              )}
            </div>
          )}
        </div>

        <label className="block text-xs font-medium text-slate-600 mb-1">Price (USD)</label>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-slate-400">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={addPriceValue}
            onChange={(e) => setAddPriceValue(e.target.value)}
            placeholder="0.00"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setShowAddPrice(false); setAddPriceTypeId(""); setAddPriceValue(""); setAddPriceSearch(""); }}
            className="px-3 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleAddPrice}
            disabled={!addPriceTypeId || !addPriceValue || addingPrice}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "#27ab83" }}
          >
            {addingPrice ? "Saving…" : "Add price"}
          </button>
        </div>
      </DialogOverlay>
    </div>
    );
  };

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
        <LoadingState label="Loading visit packs…" />
      ) : packs.length === 0 ? (
        <EmptyState
          icon={<Package className="w-5 h-5" />}
          title="No visit packs created yet"
          description='Click "Create Pack" to add a bundle patients can buy outside of a subscription.'
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packs.map((pack) => {
            const priceNum = typeof pack.price === "string" ? parseFloat(pack.price) : pack.price;
            const etName = pack.entitlementType?.name ?? "Entitlement";
            return (
            <div key={pack.id} className="glass rounded-xl p-5 hover-lift">
              <div className="flex items-start justify-between mb-3">
                <h4 className="font-semibold text-slate-800">{pack.name}</h4>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: pack.isActive ? "#e6f7f2" : "#f1f5f9",
                    color: pack.isActive ? "#147d64" : "#64748b",
                  }}
                >
                  {pack.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mb-3"
                style={{ backgroundColor: "#f3e8ff", color: "#7c3aed" }}
              >
                {etName}
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
                  <span className="text-2xl font-bold text-slate-800">${(priceNum || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
            );
          })}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Entitlement *</label>
            <select
              value={newPack.entitlementTypeId}
              onChange={(e) => setNewPack({ ...newPack, entitlementTypeId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="">Select an entitlement…</option>
              {entitlementTypes.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.name}{et.category ? ` (${et.category.replace(/_/g, " ")})` : ""}
                </option>
              ))}
            </select>
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
              disabled={!newPack.name || !newPack.entitlementTypeId || !newPack.quantity || !newPack.price || creatingPack}
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
              {prices.filter((p) => p.isActive).map((p) => {
                const priceNum = typeof p.price === "string" ? parseFloat(p.price) : p.price;
                const label = p.entitlementType?.name ?? "Service";
                return (
                  <option key={p.id} value={p.id}>{label} — ${(priceNum || 0).toFixed(2)}</option>
                );
              })}
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
        <StatCard icon={Tag} label="Active Prices" value={prices.filter((p) => p.isActive).length.toString()} color="#1e40af" />
        <StatCard icon={Package} label="Visit Packs" value={packs.length.toString()} color="#7c3aed" />
        <StatCard icon={DollarSign} label="Avg. Pack Price" value={
          packs.length > 0
            ? "$" + (packs.reduce((s, p) => {
                const n = typeof p.price === "string" ? parseFloat(p.price) : p.price;
                return s + (n || 0);
              }, 0) / packs.length).toFixed(0)
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
