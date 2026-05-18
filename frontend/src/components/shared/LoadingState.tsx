import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  /** Optional label shown beneath the spinner. Defaults to "Loading…". */
  label?: string;
  /** Optional helper text below the label. */
  description?: string;
  /** Compact variant — half the vertical padding, smaller spinner. */
  compact?: boolean;
  /** Override the icon. Useful for non-spinner placeholders. */
  icon?: ReactNode;
}

/**
 * Standard loading state for lists, tables, and section bodies.
 *
 * Visual rules mirror EmptyState — a small icon disc centered above a
 * caption — so a section flipping from loading → empty → populated is
 * a single layout shift, not three. Use whenever the bare text
 * "Loading…" would otherwise appear; for inline spinners (inside a
 * button or next to a field) prefer a raw <Loader2 /> directly.
 */
export function LoadingState({
  label = "Loading…",
  description,
  compact = false,
  icon,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center px-4 text-center ${
        compact ? "py-6" : "py-12"
      }`}
    >
      <div
        className={`rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400 ${
          compact ? "w-10 h-10" : "w-12 h-12"
        }`}
      >
        {icon ?? <Loader2 className={`${compact ? "w-4 h-4" : "w-5 h-5"} animate-spin`} />}
      </div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {description && (
        <p className="text-sm text-slate-500 max-w-sm mt-1">{description}</p>
      )}
    </div>
  );
}
