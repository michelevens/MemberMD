// Medication autocomplete using NIH's RxNorm API.
//
// Free, no API key, hosted at https://rxnav.nlm.nih.gov/REST/.
// Returns RxNorm Concept Unique Identifiers (RxCUI) that integrate
// cleanly with prescription tracking and drug-drug interaction checks.
//
// Two endpoints used:
//   - /approximateTerm.json — fuzzy match the user's typed name to
//     candidate RxCUIs. Tolerant of misspellings.
//   - /rxcui/{rxcui}/properties.json — fetch the canonical name + synonym
//     for a selected match. Used to display the standardized form back.
//
// Returns the selected concept so callers can persist both the typed
// text (for human readability) AND the RxCUI (for clinical safety).

import { useEffect, useRef, useState } from "react";
import { Pill, Loader2, X } from "lucide-react";

export interface RxNormConcept {
  rxcui: string;
  name: string;       // canonical name from RxNorm (e.g. "sertraline 100 MG Oral Tablet")
  score: number;      // approximation score from RxNorm (0-100)
  rank: number;
}

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  white: "#ffffff",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  red500: "#ef4444",
};

// Session-level cache. RxNorm's data is stable, so caching same-session
// queries cuts latency dramatically when the user types similar things.
const cache = new Map<string, RxNormConcept[]>();

interface Props {
  value: string;
  /** Fires on every keystroke + on selection (selection passes the concept). */
  onChange: (text: string, concept: RxNormConcept | null) => void;
  placeholder?: string;
  label?: string;
  helper?: string;
  error?: string;
  id?: string;
  className?: string;
  /** Disable the API call entirely (still acts as a plain text input). */
  disabled?: boolean;
}

export function MedicationAutocomplete({
  value,
  onChange,
  placeholder = "Start typing a medication name...",
  label,
  helper,
  error,
  id,
  className,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<RxNormConcept[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

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
    if (q.length < 2) {
      setResults([]);
      return;
    }

    const cached = cache.get(q.toLowerCase());
    if (cached) {
      setResults(cached);
      return;
    }

    setLoading(true);
    try {
      // approximateTerm gives us fuzzy matching — fine for "sertralin",
      // "sertralina", etc. maxEntries=8 keeps the dropdown manageable.
      const url = new URL("https://rxnav.nlm.nih.gov/REST/approximateTerm.json");
      url.searchParams.set("term", q);
      url.searchParams.set("maxEntries", "8");
      url.searchParams.set("option", "1"); // 0=brand+generic, 1=both with synonyms

      const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("RxNorm search failed");
      const data = await res.json();

      // Response shape: { approximateGroup: { candidate: [{ rxcui, score, rank, name? }] } }
      const candidates = data?.approximateGroup?.candidate ?? [];
      const concepts: RxNormConcept[] = candidates
        .filter((c: { rxcui?: string }) => !!c.rxcui)
        .map((c: { rxcui: string; score?: string; rank?: string; name?: string }) => ({
          rxcui: c.rxcui,
          name: c.name ?? "",
          score: parseFloat(c.score ?? "0"),
          rank: parseInt(c.rank ?? "0", 10),
        }));

      // Names aren't always present in approximateTerm — fetch missing
      // ones with a single batch of /rxcui/{id}/properties calls.
      const missingNames = concepts.filter((c) => !c.name).slice(0, 5);
      if (missingNames.length > 0) {
        await Promise.all(
          missingNames.map(async (c) => {
            try {
              const propsRes = await fetch(
                `https://rxnav.nlm.nih.gov/REST/rxcui/${c.rxcui}/properties.json`,
                { headers: { Accept: "application/json" } },
              );
              if (!propsRes.ok) return;
              const propsJson = await propsRes.json();
              const name = propsJson?.properties?.name;
              if (name) c.name = name;
            } catch { /* swallow — name fallback below */ }
          }),
        );
      }

      // Drop entries we still couldn't name + dedupe by name (RxNorm often
      // returns multiple rxcuis pointing at the same canonical name).
      const named = concepts.filter((c) => c.name);
      const seen = new Set<string>();
      const deduped: RxNormConcept[] = [];
      for (const c of named) {
        const key = c.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(c);
        }
      }

      cache.set(q.toLowerCase(), deduped);
      setResults(deduped);
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
    if (disabled) return;
    debounceRef.current = setTimeout(() => search(text), 350);
  };

  const select = (c: RxNormConcept) => {
    setQuery(c.name);
    setResults([]);
    setOpen(false);
    setHighlightedIdx(-1);
    onChange(c.name, c);
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
        <Pill
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
          disabled={disabled}
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
          {results.map((c, idx) => {
            const isHighlighted = idx === highlightedIdx;
            return (
              <button
                key={c.rxcui}
                type="button"
                onClick={() => select(c)}
                onMouseEnter={() => setHighlightedIdx(idx)}
                className="w-full text-left transition-colors"
                style={{
                  padding: "8px 14px",
                  backgroundColor: isHighlighted ? C.slate100 : "transparent",
                  borderBottom: idx < results.length - 1 ? "1px solid " + C.slate200 : "none",
                }}
              >
                <p className="text-sm font-medium" style={{ color: C.navy800 }}>
                  {c.name}
                </p>
                <p className="text-xs" style={{ color: C.slate500 }}>
                  RxCUI: {c.rxcui}
                  {c.score > 0 ? ` · match ${c.score.toFixed(0)}` : ""}
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
            Powered by RxNorm (NIH)
          </div>
        </div>
      )}
    </div>
  );
}
