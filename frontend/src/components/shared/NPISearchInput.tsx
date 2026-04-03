// ===== NPISearchInput =====
// Reusable NPI lookup component for provider forms.
// Searches the NPI Registry and auto-fills provider fields on selection.

import { useState, useRef, useEffect } from "react";
import { Search, UserCheck, MapPin, X, Loader2 } from "lucide-react";
import { clinicalLookupService } from "../../lib/api";
import { colors } from "../ui/design-system";

interface NPIResult {
  npi: string;
  name: string;
  credentials: string;
  specialty: string;
  address: string;
  phone: string;
  state: string;
  enumerationType: string;
}

interface NPISearchInputProps {
  onSelect: (result: NPIResult) => void;
  initialValue?: string;
  placeholder?: string;
  label?: string;
}

export function NPISearchInput({ onSelect, initialValue = "", placeholder = "Search by name or NPI number...", label = "NPI Lookup" }: NPISearchInputProps) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<NPIResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<NPIResult | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const isNpiNumber = /^\d{10}$/.test(q.trim());
      const res = isNpiNumber
        ? await clinicalLookupService.searchNPIByNumber(q.trim())
        : await clinicalLookupService.searchNPI(q);

      const data = (res.data || []) as unknown as NPIResult[];
      setResults(data);
      setIsOpen(data.length > 0);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    setSelected(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 400);
  };

  const handleSelect = (result: NPIResult) => {
    setSelected(result);
    setQuery(result.npi);
    setIsOpen(false);
    onSelect(result);
  };

  const clearSelection = () => {
    setSelected(null);
    setQuery("");
    setResults([]);
  };

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>
          {label}
        </label>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.slate400 }} aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          className="w-full pl-9 pr-10 py-2 rounded-lg border text-sm transition-colors"
          style={{ borderColor: isOpen ? colors.teal500 : colors.slate300 }}
          placeholder={placeholder}
          aria-label="Search NPI Registry"
          aria-autocomplete="list"
          aria-expanded={isOpen}
        />
        {loading && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: colors.teal500 }} />
        )}
        {selected && !loading && (
          <button onClick={clearSelection} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100" aria-label="Clear selection">
            <X size={14} style={{ color: colors.slate400 }} />
          </button>
        )}
      </div>

      {/* Selected Provider Preview */}
      {selected && (
        <div className="mt-2 rounded-lg p-3 flex items-start gap-3 animate-fade-in-up" style={{ backgroundColor: colors.teal50, border: `1px solid ${colors.teal500}` }}>
          <UserCheck size={16} style={{ color: colors.teal600 }} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: colors.navy900 }}>{selected.name}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full font-mono" style={{ backgroundColor: colors.white, color: colors.teal600 }}>
                NPI: {selected.npi}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs" style={{ color: colors.slate600 }}>
              {selected.specialty && <span>{selected.specialty}</span>}
              {selected.address && (
                <span className="flex items-center gap-1">
                  <MapPin size={10} aria-hidden="true" /> {selected.address}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dropdown Results */}
      {isOpen && (
        <div
          className="absolute z-40 w-full mt-1 rounded-xl shadow-lg border overflow-hidden animate-fade-in-up"
          style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}
          role="listbox"
          aria-label="NPI search results"
        >
          <div className="max-h-64 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.npi}
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-b hover:bg-slate-50"
                style={{ borderColor: colors.slate100 }}
                role="option"
                aria-selected={selected?.npi === r.npi}
              >
                <UserCheck size={16} style={{ color: colors.teal500 }} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate" style={{ color: colors.navy900 }}>{r.name}</span>
                    <span className="text-xs font-mono" style={{ color: colors.slate400 }}>{r.npi}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-xs mt-0.5" style={{ color: colors.slate500 }}>
                    {r.specialty && <span>{r.specialty}</span>}
                    {r.state && <span>{r.state}</span>}
                    {r.credentials && <span>{r.credentials}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="px-4 py-2 text-xs" style={{ backgroundColor: colors.slate50, color: colors.slate400 }}>
            Data from NPI Registry (CMS)
          </div>
        </div>
      )}
    </div>
  );
}
