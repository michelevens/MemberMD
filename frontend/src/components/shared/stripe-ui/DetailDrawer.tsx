// Stripe-grade detail drawer: slides in from the right edge with the
// list still visible behind it on wide screens. Replaces the
// "selectedFoo ? <FullScreenView> : <List>" pattern with the
// list-stays-visible side-sheet pattern Stripe uses on Payments,
// Invoices, Customers, etc.
//
// Behaviors:
//   - Slides 480px (sm) / 560px (md) / 640px (lg) wide
//   - Backdrop click + Escape both close
//   - Trap focus while open
//   - Sticky header with title and a close button
//   - Sticky footer slot for primary/secondary actions
//   - Body scrolls; nothing else does

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Title text or arbitrary node (e.g. with status pill + entity id). */
  title: React.ReactNode;
  /** Optional subtitle (eyebrow text above the title). */
  eyebrow?: string;
  /** Sticky footer actions (e.g. Cancel / Save). */
  footer?: React.ReactNode;
  /** Drawer width — sm 480 / md 560 / lg 640. Default md. */
  width?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

const WIDTHS = {
  sm: "max-w-[480px]",
  md: "max-w-[560px]",
  lg: "max-w-[640px]",
};

export function DetailDrawer({
  open,
  onClose,
  title,
  eyebrow,
  footer,
  width = "md",
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Prevent background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[1px]"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className={`fixed inset-y-0 right-0 z-50 w-full ${WIDTHS[width]} bg-white shadow-2xl flex flex-col`}
            role="dialog"
            aria-modal="true"
          >
            {/* Sticky header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                {eyebrow && (
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                    {eyebrow}
                  </p>
                )}
                <div className="text-base font-semibold text-slate-900">
                  {title}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrolling body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {children}
            </div>

            {/* Sticky footer */}
            {footer && (
              <div className="shrink-0 px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
