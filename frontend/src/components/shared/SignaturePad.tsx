// Shared signature capture component.
//
// Two modes the user can toggle between:
//   - "draw"  — HTML canvas, mouse + touch drawing; outputs base64 PNG dataURL
//   - "typed" — input field, types full name; outputs the string
//
// Canvas drawing tends to suck on mobile (small target, fat finger). The
// typed-name fallback is a recognized e-signature standard (ESIGN Act §
// 7001(a)(2) — any sound, symbol, or process attached to a record with
// intent to sign). We just need the user's intent + identification, not
// a particular pixel pattern.
//
// Usage:
//   <SignaturePad
//     onCapture={(data, type) => setSignature({ data, type })}
//     defaultMode="draw"
//   />

import { useEffect, useRef, useState } from "react";
import { PenTool, Type, RotateCcw } from "lucide-react";

type Mode = "draw" | "typed";

interface SignaturePadProps {
  /** Called when the user has a non-empty signature ready. Pass-through
   * the captured data + type so the consumer can submit it. */
  onCapture?: (data: string, type: "drawn" | "typed") => void;
  /** Default mode on mount. */
  defaultMode?: Mode;
  /** Display height for the canvas (px). */
  height?: number;
  /** When true, locks the pad and clears it (post-submit state). */
  disabled?: boolean;
}

export function SignaturePad({
  onCapture,
  defaultMode = "draw",
  height = 180,
  disabled = false,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [typedName, setTypedName] = useState("");
  const [hasDrawn, setHasDrawn] = useState(false);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  // Set up canvas DPR + size so strokes look crisp on retina displays.
  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, [mode]);

  function pointFromEvent(e: PointerEvent | React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function startDraw(e: React.PointerEvent) {
    if (disabled) return;
    drawingRef.current = true;
    lastRef.current = pointFromEvent(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveDraw(e: React.PointerEvent) {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !lastRef.current) return;
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (!hasDrawn) setHasDrawn(true);
  }

  function endDraw() {
    drawingRef.current = false;
    lastRef.current = null;
    // Emit captured dataURL upward.
    if (hasDrawn && canvasRef.current && onCapture) {
      onCapture(canvasRef.current.toDataURL("image/png"), "drawn");
    }
  }

  function clearDraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function handleTypeChange(value: string) {
    setTypedName(value);
    if (onCapture && value.trim().length > 0) {
      onCapture(value.trim(), "typed");
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Mode toggle */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode("draw")}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
              mode === "draw" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            Draw
          </button>
          <button
            type="button"
            onClick={() => setMode("typed")}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
              mode === "typed" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Type name
          </button>
        </div>
        {mode === "draw" && hasDrawn && !disabled && (
          <button
            type="button"
            onClick={clearDraw}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100"
          >
            <RotateCcw className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Capture surface */}
      {mode === "draw" ? (
        <div className="relative">
          <canvas
            ref={canvasRef}
            style={{ height: `${height}px`, width: "100%", touchAction: "none", cursor: disabled ? "not-allowed" : "crosshair" }}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
          />
          {!hasDrawn && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-300 text-sm">
              Sign with your mouse or finger
            </div>
          )}
        </div>
      ) : (
        <div className="p-4" style={{ height: `${height}px` }}>
          <input
            type="text"
            value={typedName}
            onChange={(e) => handleTypeChange(e.target.value)}
            disabled={disabled}
            placeholder="Type your full legal name"
            className="w-full px-3 py-3 rounded-lg border border-slate-200 text-2xl font-medium text-center"
            style={{ fontFamily: '"Caveat", "Brush Script MT", cursive', letterSpacing: "0.5px" }}
            autoFocus
          />
          <p className="text-[11px] text-slate-400 text-center mt-2">
            Typing your full name and submitting this form is a legally binding signature.
          </p>
        </div>
      )}
    </div>
  );
}
