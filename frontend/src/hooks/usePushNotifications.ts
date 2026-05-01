// ===== Web Push notifications hook =====
// Handles the full lifecycle: fetch VAPID public key from the backend,
// request browser permission, subscribe via the active service worker,
// and post the resulting subscription to /api/push/subscriptions.
//
// All errors are surfaced as state so the UI can render a useful CTA
// ("Enable in Settings", "Browser doesn't support push", etc) instead
// of silently failing.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type PushStatus =
  | "unsupported"   // browser lacks Notification or PushManager API
  | "default"       // permission not yet asked
  | "granted"       // permission granted, may or may not be subscribed
  | "denied"        // user blocked notifications
  | "subscribing"   // mid-subscribe call
  | "subscribed"    // active subscription posted to backend
  | "unsubscribing"
  | "error";

interface PushState {
  status: PushStatus;
  error: string | null;
  endpoint: string | null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function detectPlatform(): "ios" | "android" | "desktop" {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>({
    status: "default",
    error: null,
    endpoint: null,
  });

  // Detect support + current permission state on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState({ status: "unsupported", error: null, endpoint: null });
      return;
    }
    const perm = Notification.permission;
    if (perm === "denied") {
      setState({ status: "denied", error: null, endpoint: null });
      return;
    }
    if (perm === "granted") {
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setState({ status: "subscribed", error: null, endpoint: sub.endpoint });
        } else {
          setState({ status: "granted", error: null, endpoint: null });
        }
      }).catch(() => {
        setState({ status: "granted", error: null, endpoint: null });
      });
      return;
    }
    setState({ status: "default", error: null, endpoint: null });
  }, []);

  const subscribe = useCallback(async () => {
    setState((s) => ({ ...s, status: "subscribing", error: null }));
    try {
      if (Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setState({ status: perm === "denied" ? "denied" : "default", error: null, endpoint: null });
          return;
        }
      }

      const keyResp = await apiFetch<{ publicKey: string }>("/push/vapid-key");
      if (keyResp.error || !keyResp.data?.publicKey) {
        throw new Error(keyResp.error || "Server did not return a VAPID public key.");
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyResp.data.publicKey).buffer as ArrayBuffer,
      });

      const json = sub.toJSON();
      const postResp = await apiFetch<{ id: string }>("/push/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          platform: detectPlatform(),
        }),
      });
      if (postResp.error) {
        await sub.unsubscribe().catch(() => undefined);
        throw new Error(postResp.error);
      }

      setState({ status: "subscribed", error: null, endpoint: sub.endpoint });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error subscribing to push.";
      setState({ status: "error", error: msg, endpoint: null });
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState((s) => ({ ...s, status: "unsubscribing", error: null }));
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setState({ status: "granted", error: null, endpoint: null });
        return;
      }
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await apiFetch("/push/subscriptions", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      }).catch(() => undefined);
      setState({ status: "granted", error: null, endpoint: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error unsubscribing.";
      setState({ status: "error", error: msg, endpoint: null });
    }
  }, []);

  return { ...state, subscribe, unsubscribe };
}
