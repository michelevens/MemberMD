// Stripe-grade row action menu: 3-dot vertical button that opens a
// dropdown of contextual actions. Danger items rendered red at the
// bottom, divided by a faint rule.
//
// Stays accessible via aria-haspopup and Escape to close.

import { useState, useRef, useEffect } from "react";
import { MoreVertical } from "lucide-react";

export interface KebabAction {
  label: string;
  onClick: () => void;
  /** Optional icon component. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Render in a danger style (red text); also moves below a divider. */
  danger?: boolean;
  /** Disable the action (e.g. role-gated). */
  disabled?: boolean;
}

interface Props {
  actions: KebabAction[];
  /** Optional aria label for the trigger button. */
  ariaLabel?: string;
  /** Stop click propagation so a row-click handler doesn't fire. */
  stopPropagation?: boolean;
}

export function KebabMenu({ actions, ariaLabel = "Row actions", stopPropagation = true }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const safeActions = actions.filter(Boolean);
  const safe = safeActions.filter((a) => !a.danger);
  const dangerous = safeActions.filter((a) => a.danger);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-30 min-w-[180px] rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden py-1"
          onClick={(e) => stopPropagation && e.stopPropagation()}
        >
          {safe.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                disabled={a.disabled}
                onClick={() => {
                  if (a.disabled) return;
                  a.onClick();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-left"
              >
                {Icon && <Icon className="w-4 h-4 text-slate-400" />}
                {a.label}
              </button>
            );
          })}
          {dangerous.length > 0 && safe.length > 0 && (
            <div className="border-t border-slate-100 my-1" />
          )}
          {dangerous.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                disabled={a.disabled}
                onClick={() => {
                  if (a.disabled) return;
                  a.onClick();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed text-left"
              >
                {Icon && <Icon className="w-4 h-4" />}
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
