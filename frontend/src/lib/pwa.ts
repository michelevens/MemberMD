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

    upgradeManifestForTenant();
  });
}

/**
 * If we're running on a tenant custom domain (e.g. portal.clearstone.health),
 * swap the static MemberMD manifest for the dynamic per-tenant manifest so
 * "Add to Home Screen" installs the app branded as the practice. We always
 * try to upgrade — the backend resolves Host header → tenant and falls back
 * to the platform-default manifest if no domain match is found, so this is
 * safe on app.membermd.io too.
 */
function upgradeManifestForTenant(): void {
  try {
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    link.href = `${apiBase.replace(/\/$/, "")}/public/manifest`;
  } catch {
    // Non-fatal — the static manifest already shipped in index.html still applies.
  }
}

// Returns true when the app is running as an installed PWA (standalone window).
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari pre-PWA support
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}
