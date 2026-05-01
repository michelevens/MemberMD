// Stripe-grade filter chips: row of removable filter pills above a
// table. Each chip has a label, a value, and an X to remove. Adding
// a new filter is a separate "+ Add filter" button that opens a
// dropdown of available facets.
//
// Stripe pattern: filters STACK (you can apply many at once); each
// chip says "Status: succeeded" with the X to remove just that facet.

import { useState, useRef, useEffect } from "react";
import { X, Plus, ChevronDown } from "lucide-react";

export interface FilterFacet {
  /** Stable key (e.g. "status", "plan_id"). */
  key: string;
  /** Display label (e.g. "Status", "Plan"). */
  label: string;
  /** Available values. If omitted, the chip is freeform text. */
  options?: { value: string; label: string }[];
}

export interface ActiveFilter {
  key: string;
  /** Raw value — sent back to onChange. */
  value: string;
  /** Pretty label for display in the chip. */
  displayValue: string;
}

interface Props {
  facets: FilterFacet[];
  active: ActiveFilter[];
  onChange: (next: ActiveFilter[]) => void;
}

export function FilterChips({ facets, active, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedFacet, setPickedFacet] = useState<FilterFacet | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setPickedFacet(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  const remove = (key: string, value: string) => {
    onChange(active.filter((f) => !(f.key === key && f.value === value)));
  };

  const addFilter = (facet: FilterFacet, opt: { value: string; label: string }) => {
    // Replace existing same-key filter (single-value semantics per facet for now).
    const next = [
      ...active.filter((f) => f.key !== facet.key),
      { key: facet.key, value: opt.value, displayValue: opt.label },
    ];
    onChange(next);
    setPickerOpen(false);
    setPickedFacet(null);
  };

  const availableFacets = facets.filter((f) => !active.some((a) => a.key === f.key));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((f) => {
        const facet = facets.find((x) => x.key === f.key);
        return (
          <span
            key={`${f.key}:${f.value}`}
            className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md text-xs font-medium border border-slate-200 bg-white text-slate-700"
          >
            <span className="text-slate-500">{facet?.label ?? f.key}:</span>
            <span>{f.displayValue}</span>
            <button
              type="button"
              onClick={() => remove(f.key, f.value)}
              className="ml-0.5 p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              aria-label={`Remove ${facet?.label ?? f.key} filter`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => {
            setPickerOpen((o) => !o);
            setPickedFacet(null);
          }}
          disabled={availableFacets.length === 0}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-dashed border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Filter
          <ChevronDown className="w-3 h-3" />
        </button>

        {pickerOpen && (
          <div className="absolute left-0 top-full mt-1 z-30 w-56 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
            {!pickedFacet && (
              <div>
                <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-100">
                  Add filter
                </div>
                {availableFacets.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setPickedFacet(f)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {f.label}
                  </button>
                ))}
                {availableFacets.length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-400">All filters applied</div>
                )}
              </div>
            )}
            {pickedFacet && (
              <div>
                <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-100">
                  <span>{pickedFacet.label}</span>
                  <button
                    type="button"
                    onClick={() => setPickedFacet(null)}
                    className="text-slate-400 hover:text-slate-700 normal-case tracking-normal text-xs"
                  >
                    Back
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {(pickedFacet.options ?? []).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => addFilter(pickedFacet, opt)}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {opt.label}
                    </button>
                  ))}
                  {(!pickedFacet.options || pickedFacet.options.length === 0) && (
                    <div className="px-3 py-2 text-sm text-slate-400">No options</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
