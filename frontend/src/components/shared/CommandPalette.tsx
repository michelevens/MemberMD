// ===== Command Palette =====
// Keyboard-driven jump-to-anywhere overlay. Cmd+K (Mac) / Ctrl+K (Win)
// opens it; type to fuzzy-search nav items; arrow keys to navigate;
// Enter to jump. Adapted from EnnHealth's CommandPalette pattern but
// scoped to MemberMD's portal nav surface.
//
// Designed to be agnostic to which portal is rendering it — pass in a
// flat list of CommandItem and an onSelect callback. Each portal wires
// its own role-filtered nav into this.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, X } from "lucide-react";

export interface CommandItem {
  id: string;
  label: string;
  /** Optional secondary line (e.g. section name like "Clinical"). */
  hint?: string;
  /** Lucide icon component. */
  icon?: React.ComponentType<{ className?: string }>;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  onSelect: (id: string) => void;
}

export function CommandPalette({
  open,
  onClose,
  items,
  onSelect,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state on open and focus the input.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlightIndex(0);
      // Wait one frame so the modal is mounted before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Lightweight fuzzy matcher: split query into chars, every char
  // must appear in order in the label (case-insensitive). Same
  // algorithm shadcn's command primitive uses, simplified.
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((it) => {
      const haystack = (it.label + " " + (it.hint ?? "")).toLowerCase();
      let qi = 0;
      for (let i = 0; i < haystack.length && qi < q.length; i++) {
        if (haystack[i] === q[qi]) qi++;
      }
      return qi === q.length;
    });
  }, [items, query]);

  // Clamp highlight when the result list changes.
  useEffect(() => {
    if (highlightIndex >= filtered.length) {
      setHighlightIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, highlightIndex]);

  // Scroll the highlighted row into view.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-cmd-index="${highlightIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  // Keyboard handlers — arrow up/down + enter + escape.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[highlightIndex];
      if (item) {
        onSelect(item.id);
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(8px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200/60 overflow-hidden"
          >
            {/* Search row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <Search className="w-5 h-5 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Jump to a section…"
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-gray-400"
              />
              <button
                onClick={onClose}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results */}
            <div
              ref={listRef}
              className="max-h-[50vh] overflow-y-auto py-2"
              role="listbox"
            >
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  No matches for "{query}"
                </div>
              ) : (
                filtered.map((it, i) => {
                  const Icon = it.icon;
                  const isHighlighted = i === highlightIndex;
                  return (
                    <button
                      key={it.id}
                      data-cmd-index={i}
                      role="option"
                      aria-selected={isHighlighted}
                      onMouseEnter={() => setHighlightIndex(i)}
                      onClick={() => {
                        onSelect(it.id);
                        onClose();
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                        isHighlighted
                          ? "bg-gray-100 text-gray-900"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {Icon && (
                        <Icon className="w-[18px] h-[18px] flex-shrink-0 text-gray-500" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{it.label}</p>
                        {it.hint && (
                          <p className="text-xs text-gray-400 truncate">{it.hint}</p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50/60 border-t border-gray-100 text-[11px] text-gray-500">
              <div className="flex items-center gap-3">
                <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px]">↑↓</kbd> navigate</span>
                <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px]">↵</kbd> jump</span>
                <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px]">esc</kbd> close</span>
              </div>
              <span>{filtered.length} {filtered.length === 1 ? "result" : "results"}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook: register a global Cmd+K / Ctrl+K listener that opens the
 * palette. Use in any portal that mounts a CommandPalette.
 */
export function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
