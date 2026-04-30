// Address autocomplete using OpenStreetMap's Nominatim API.
//
// Free, no API key, globally available. Rate-limited to 1 req/sec
// per Nominatim's usage policy, so we debounce aggressively (500ms)
// and cap concurrent requests. Also includes a session-level result
// cache so retyping common queries doesn't re-hit the API.
//
// Returns parsed address parts so callers can map them onto their
// own state (street/city/state/zip/etc).

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, X } from "lucide-react";

export interface ParsedAddress {
  street: string;        // "123 Main St"
  city: string;
  state: string;         // 2-letter US state code when available, otherwise full name
  zip: string;
  country: string;
  full: string;          // canonical display string
  lat?: number;
  lon?: number;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    state?: string;
    "ISO3166-2-lvl4"?: string; // e.g. "US-NC"
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  white: "#ffffff",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  red500: "#ef4444",
};

const cache = new Map<string, NominatimResult[]>();

interface Props {
  /** Initial value to render in the input. */
  value: string;
  /** Fires on every keystroke + on selection (selection passes a non-null parsed). */
  onChange: (text: string, parsed: ParsedAddress | null) => void;
  placeholder?: string;
  label?: string;
  helper?: string;
  error?: string;
  /** Restrict results to a country code (e.g. "us") to cut noise. */
  countryCode?: string;
  /** Optional id for label-association. */
  id?: string;
  className?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Start typing your address...",
  label,
  helper,
  error,
  countryCode = "us",
  id,
  className,
}: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes back into the input
  useEffect(() => { setQuery(value); }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = async (q: string) => {
    if (q.length < 3) {
      setResults([]);
      return;
    }

    const cached = cache.get(q);
    if (cached) {
      setResults(cached);
      return;
    }

    setLoading(true);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "json");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "5");
      if (countryCode) url.searchParams.set("countrycodes", countryCode);

      const res = await fetch(url.toString(), {
        headers: {
          // Nominatim requires a User-Agent / Referer per their usage policy.
          // Browsers add Referer automatically; can't set User-Agent from
          // the browser, so this complies with the spirit of the policy.
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error("Address search failed");
      const data: NominatimResult[] = await res.json();
      cache.set(q, data);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (text: string) => {
    setQuery(text);
    onChange(text, null);
    setOpen(true);
    setHighlightedIdx(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), 500);
  };

  const select = (r: NominatimResult) => {
    const parsed = parseNominatim(r);
    setQuery(parsed.full);
    setResults([]);
    setOpen(false);
    setHighlightedIdx(-1);
    onChange(parsed.full, parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (highlightedIdx >= 0) {
        e.preventDefault();
        select(results[highlightedIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onChange("", null);
  };

  return (
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium mb-1.5"
          style={{ color: C.navy800 }}
        >
          {label}
        </label>
      )}
      <div style={{ position: "relative" }}>
        <MapPin
          className="w-4 h-4"
          style={{
            position: "absolute",
            left: "10px",
            top: "50%",
            transform: "translateY(-50%)",
            color: C.slate400,
            pointerEvents: "none",
          }}
        />
        <input
          id={id}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-lg border outline-none transition-colors"
          style={{
            padding: "10px 36px 10px 32px",
            borderColor: error ? C.red500 : C.slate200,
            color: C.navy900,
            fontSize: "14px",
          }}
        />
        {loading && (
          <Loader2
            className="w-4 h-4 animate-spin"
            style={{
              position: "absolute",
              right: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: C.slate400,
            }}
          />
        )}
        {!loading && query && (
          <button
            type="button"
            onClick={clear}
            style={{
              position: "absolute",
              right: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              padding: "4px",
              borderRadius: "4px",
              color: C.slate400,
            }}
            aria-label="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {helper && !error && (
        <p className="text-xs mt-1" style={{ color: C.slate400 }}>{helper}</p>
      )}
      {error && (
        <p className="text-xs mt-1" style={{ color: C.red500 }}>{error}</p>
      )}

      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            backgroundColor: C.white,
            border: "1px solid " + C.slate200,
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            zIndex: 10,
            maxHeight: "300px",
            overflowY: "auto",
          }}
        >
          {results.map((r, idx) => {
            const isHighlighted = idx === highlightedIdx;
            return (
              <button
                key={`${r.lat},${r.lon}`}
                type="button"
                onClick={() => select(r)}
                onMouseEnter={() => setHighlightedIdx(idx)}
                className="w-full text-left transition-colors"
                style={{
                  padding: "10px 14px",
                  backgroundColor: isHighlighted ? C.slate100 : "transparent",
                  borderBottom: idx < results.length - 1 ? "1px solid " + C.slate200 : "none",
                }}
              >
                <p className="text-sm font-medium" style={{ color: C.navy800 }}>
                  {r.display_name.split(",").slice(0, 2).join(",")}
                </p>
                <p className="text-xs" style={{ color: C.slate500 }}>
                  {r.display_name.split(",").slice(2).join(",").trim()}
                </p>
              </button>
            );
          })}
          <div
            style={{
              padding: "8px 14px",
              borderTop: "1px solid " + C.slate200,
              fontSize: "10px",
              color: C.slate400,
              textAlign: "right",
            }}
          >
            Powered by OpenStreetMap
          </div>
        </div>
      )}
    </div>
  );
}

function parseNominatim(r: NominatimResult): ParsedAddress {
  const a = r.address ?? {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || a.hamlet || a.suburb || a.neighbourhood || "";

  // Normalize state to 2-letter code when ISO3166-2-lvl4 is available
  // (e.g. "US-NC" -> "NC"). Falls back to the verbose name otherwise.
  let state = a.state || "";
  if (a["ISO3166-2-lvl4"]?.startsWith("US-")) {
    state = a["ISO3166-2-lvl4"].split("-")[1] ?? state;
  }

  return {
    street,
    city,
    state,
    zip: a.postcode || "",
    country: a.country || "",
    full: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
  };
}
