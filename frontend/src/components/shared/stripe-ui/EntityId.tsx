// Stripe-grade resource identifier: monospace, click-to-copy, prefixed
// with a type sigil (mbr_, inv_, py_, etc.) just like Stripe IDs.
//
// Example display: <EntityId prefix="inv" id="019de07a-1234-..." />
// Renders: inv_019de07a (mono, click copies the full UUID)

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface Props {
  /** Type prefix shown before the truncated id (e.g. "inv", "mbr"). */
  prefix?: string;
  /** Full identifier (UUID, etc.) — copied to clipboard on click. */
  id: string;
  /** Number of characters from the id to display after the prefix. Default 8. */
  shortLength?: number;
  /** Optional className for layout. */
  className?: string;
  /** When true, never truncates — shows the full id. */
  full?: boolean;
}

export function EntityId({ prefix, id, shortLength = 8, className, full = false }: Props) {
  const [copied, setCopied] = useState(false);

  if (!id) return <span className="text-slate-300">—</span>;

  const cleanId = String(id);
  const display = full
    ? cleanId
    : cleanId.replace(/-/g, "").slice(0, shortLength);
  const label = prefix ? `${prefix}_${display}` : display;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(cleanId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — older browsers / non-secure contexts
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy ${cleanId}`}
      className={`inline-flex items-center gap-1 font-mono text-xs text-slate-500 hover:text-slate-800 transition-colors ${className ?? ""}`}
    >
      <span className="tabular-nums">{label}</span>
      {copied
        ? <Check className="w-3 h-3 text-emerald-600" />
        : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      }
    </button>
  );
}
