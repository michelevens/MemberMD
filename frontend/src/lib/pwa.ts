// ===== MemberMD PWA registration =====
// Registers the service worker on production builds. Skips registration
// in dev so vite's HMR isn't intercepted by stale caches. The worker
// itself lives at /service-worker.js — see frontend/public/service-worker.js.

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    const url = `${import.meta.env.BASE_URL || "/"}service-worker.js`;
    navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL || "/" }).catch((err) => {
      // Registration failures are non-fatal — the app still works without the SW.
      console.warn("[pwa] service worker registration failed", err);
    });
  });
}

// Returns true when the app is running as an installed PWA (standalone window).
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari pre-PWA support
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}
