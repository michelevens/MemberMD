// RefreshButton — small icon button used by portal list/dashboard
// headers to manually re-fetch data. Spins the icon while onRefresh
// is in flight so the user gets feedback that the click registered.
//
// Caller passes onRefresh (sync or async). The button disables during
// the call to prevent double-clicks.

import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  onRefresh: () => void | Promise<unknown>;
  /** Optional label shown next to the icon on >=sm screens. */
  label?: string;
  className?: string;
  title?: string;
}

export function RefreshButton({ onRefresh, label = "Refresh", className, title }: Props) {
  const [spinning, setSpinning] = useState(false);

  const handle = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      await onRefresh();
    } finally {
      // Keep the spin going briefly even if the call resolved instantly
      // — prevents a "blink" that feels like nothing happened.
      setTimeout(() => setSpinning(false), 400);
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={spinning}
      className={
        className ||
        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors shrink-0"
      }
      title={title || "Refresh — pulls the latest data from the server"}
      aria-label={title || "Refresh"}
    >
      <RefreshCw className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`} />
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}
