// ===== MobileSheet =====
// Centered modal on desktop, bottom sheet on mobile. Drop-in replacement
// for the existing "fixed inset-0 ... centered card" pattern used across
// the patient portal — same children, but on phones it slides up from the
// bottom edge with a drag-handle and rounded top corners. The single
// biggest "this feels like a real app" upgrade for mobile.
//
// Behavior:
//   - <sm (mobile):  fixed bottom, full-width, rounded-t-2xl, slide-up
//                    transform, drag-handle bar at top
//   - sm+ (desktop): fixed center, rounded-2xl, fade-in, max-w-md by default
//   - Tapping the backdrop closes
//   - Esc key closes (desktop convenience)
//   - Body scroll-locked while open
//
// Usage:
//   <MobileSheet open={x} onClose={...} title="Cancel membership">
//     <div className="p-6">...form fields...</div>
//     <div className="px-6 pb-6 pt-3 border-t flex justify-end gap-2">
//       <button>Cancel</button>
//       <button>Confirm</button>
//     </div>
//   </MobileSheet>

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  /** Optional title shown in a sticky header. Pass null/undefined for headerless. */
  title?: ReactNode;
  /** Tailwind max-width class for the desktop centered version. Default max-w-md. */
  maxWidth?: string;
  /** Hide the close X (e.g. when actions are mandatory). Default false. */
  hideCloseButton?: boolean;
  children: ReactNode;
}

export function MobileSheet({
  open,
  onClose,
  title,
  maxWidth = "max-w-md",
  hideCloseButton = false,
  children,
}: MobileSheetProps) {
  // Body scroll lock + Esc-to-close
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}
      onClick={onClose}
    >
      <div
        // Mobile: full-width sheet anchored to bottom with rounded top.
        // Desktop: centered card with all corners rounded.
        // Slide-up on mobile via translate-y, fade-in via opacity.
        className={`
          bg-white shadow-2xl w-full ${maxWidth} overflow-hidden
          rounded-t-2xl sm:rounded-2xl
          max-h-[90vh] sm:max-h-[85vh]
          flex flex-col
          animate-mobile-sheet
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "#cbd5e1" }} />
        </div>

        {/* Header */}
        {(title || !hideCloseButton) && (
          <div className="flex items-center justify-between px-5 sm:px-6 pt-3 pb-3 sm:pt-4 sm:pb-4 border-b border-slate-100 shrink-0">
            <div className="text-base font-semibold text-slate-900 truncate">
              {title}
            </div>
            {!hideCloseButton && (
              <button
                onClick={onClose}
                className="p-1 -mr-1 rounded hover:bg-slate-100 shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            )}
          </div>
        )}

        {/* Body — scrollable when content exceeds max height */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
