// ===== MemberMD PWA Install Prompt =====
// Listens for the beforeinstallprompt event (Chromium / Android / desktop)
// and offers a one-tap "Add to Home Screen" CTA. iOS Safari has no native
// event for this, so we render a lightweight tip with the manual steps
// when we detect iOS + non-standalone.
//
// Dismissals are remembered for 14 days in localStorage so we don't
// nag patients on every visit.

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { isStandalone } from "../../lib/pwa";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "membermd_install_dismissed_at";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function recentlyDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return ts > 0 && Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function rememberDismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore — private mode etc.
  }
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (recentlyDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    if (isIOS()) {
      const t = setTimeout(() => setShowIosTip(true), 2000);
      return () => {
        window.removeEventListener("beforeinstallprompt", onPrompt);
        clearTimeout(t);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    rememberDismiss();
    setDeferred(null);
    setShowIosTip(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (!deferred && !showIosTip) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md animate-page-in">
      <div className="rounded-xl border border-slate-200 bg-white shadow-lg p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-[#635bff] flex items-center justify-center text-white shrink-0">
          <Smartphone className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-900">Install MemberMD</p>
          <p className="text-[11px] text-slate-500 leading-snug">
            {deferred
              ? "Add to your home screen for one-tap access and push notifications."
              : "Tap Share, then 'Add to Home Screen' for one-tap access."}
          </p>
        </div>
        {deferred && (
          <button
            onClick={install}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium text-white shrink-0"
            style={{ backgroundColor: "#635bff" }}
          >
            Install
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
