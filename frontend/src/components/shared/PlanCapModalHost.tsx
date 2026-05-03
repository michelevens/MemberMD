// ===== Plan-Cap Reached Modal =====
// Listens for the global "plan:cap-reached" event dispatched by apiFetch
// when EnforcePlanCap returns 402, and renders a friendly upgrade modal.
//
// Mounted once at the app root so any create-screen that hits a cap shows
// a consistent "you've outgrown your plan" experience instead of a raw
// API error toast.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowUpRight, X } from "lucide-react";

interface CapDetail {
  key?: string;
  current?: number;
  max?: number;
  plan?: string;
  upgradeTo?: string;
}

interface PlanCapEvent {
  cap: CapDetail;
  message: string;
}

const TIER_DISPLAY: Record<string, string> = {
  solo: "Solo",
  group: "Group",
  multi_site: "Multi-Site",
  multiSite: "Multi-Site",
  enterprise: "Enterprise",
};

export function PlanCapModalHost() {
  const navigate = useNavigate();
  const [event, setEvent] = useState<PlanCapEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<PlanCapEvent>;
      setEvent(ce.detail);
    };
    window.addEventListener("plan:cap-reached", handler as EventListener);
    return () => window.removeEventListener("plan:cap-reached", handler as EventListener);
  }, []);

  if (!event) return null;

  const close = () => setEvent(null);
  const goUpgrade = () => {
    setEvent(null);
    // PracticeSettings reads ?tab= from the URL on mount.
    navigate("/practice/settings?tab=subscription");
  };

  const upgradeName = event.cap.upgradeTo ? TIER_DISPLAY[event.cap.upgradeTo] || event.cap.upgradeTo : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 flex items-start gap-3" style={{ background: "linear-gradient(135deg, #f59e0b, #fbbf24)" }}>
          <AlertCircle className="w-6 h-6 text-white shrink-0 mt-0.5" />
          <div className="flex-1 text-white">
            <h3 className="font-bold text-lg">Plan limit reached</h3>
            <p className="text-sm opacity-90 mt-0.5">
              You've outgrown your current plan.
            </p>
          </div>
          <button onClick={close} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-700 leading-relaxed">{event.message}</p>
          {event.cap.current !== undefined && event.cap.max !== undefined && (
            <div className="mt-4 rounded-lg p-3 flex items-center justify-between" style={{ backgroundColor: "#f1f5f9" }}>
              <span className="text-xs font-medium text-slate-500 uppercase">{event.cap.key}</span>
              <span className="text-sm font-semibold text-slate-800">
                {event.cap.current} / {event.cap.max}
              </span>
            </div>
          )}
        </div>
        <div className="px-6 pb-6 flex gap-2 justify-end">
          <button
            onClick={close}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Maybe later
          </button>
          <button
            onClick={goUpgrade}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5"
            style={{ backgroundColor: "#147d64" }}
          >
            {upgradeName ? `Upgrade to ${upgradeName}` : "View plans"}
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
