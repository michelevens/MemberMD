// ===== Embedded Stripe Connect onboarding =====
// Renders Stripe's <ConnectAccountOnboarding> component inline so the
// practice never leaves MemberMD. Mints an AccountSession on mount via
// the backend, hands the client_secret to loadConnectAndInitialize(),
// and surfaces onExit so the parent can refresh the Connect status.
//
// Stripe's docs:
//   https://docs.stripe.com/connect/embedded-onboarding-quickstart
//
// Heavy stack (loadConnectAndInitialize is ~30KB) is dynamically
// imported on first render so the rest of the settings page isn't
// slowed down for users who don't open the panel.

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { stripeConnectService } from "../../lib/api";
import type { StripeConnectInstance } from "@stripe/connect-js";

interface Props {
  onExit: () => void;
  onError?: (msg: string) => void;
}

export function EmbeddedConnectOnboarding({ onExit, onError }: Props) {
  const [instance, setInstance] = useState<StripeConnectInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const sessionResp = await stripeConnectService.createAccountSession();
        if (cancelled) return;

        if (sessionResp.error || !sessionResp.data?.clientSecret) {
          const msg = sessionResp.error || "Could not start Stripe onboarding session.";
          setError(msg);
          setLoading(false);
          onError?.(msg);
          return;
        }

        const { publishableKey } = sessionResp.data;
        if (!publishableKey) {
          const msg = "Stripe publishable key is not configured on the server.";
          setError(msg);
          setLoading(false);
          onError?.(msg);
          return;
        }

        const { loadConnectAndInitialize } = await import("@stripe/connect-js");

        if (cancelled) return;

        const connect = loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret: async () => {
            // Stripe will call this whenever a new session is needed.
            // Always mint a fresh secret so expiring sessions self-heal.
            const refreshed = await stripeConnectService.createAccountSession();
            if (refreshed.error || !refreshed.data?.clientSecret) {
              throw new Error(refreshed.error || "Could not refresh Connect session");
            }
            return refreshed.data.clientSecret;
          },
          appearance: {
            variables: {
              colorPrimary: "#635bff",
              fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
              borderRadius: "8px",
            },
          },
        });

        setInstance(connect);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Could not load Stripe Connect.";
        setError(msg);
        setLoading(false);
        onError?.(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
        <span className="text-sm text-slate-500">Loading Stripe onboarding…</span>
      </div>
    );
  }

  if (error || !instance) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-red-700">Could not start onboarding</p>
          <p className="text-xs text-red-600 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <ConnectComponentsWrapper instance={instance} onExit={onExit} />
    </div>
  );
}

// Stripe's React bindings live in @stripe/react-connect-js. We import
// dynamically the same way so the React bundle is not loaded until needed.
function ConnectComponentsWrapper({
  instance,
  onExit,
}: {
  instance: StripeConnectInstance;
  onExit: () => void;
}) {
  const [Components, setComponents] = useState<{
    Provider: React.ComponentType<{ connectInstance: StripeConnectInstance; children: React.ReactNode }>;
    Onboarding: React.ComponentType<{ onExit: () => void }>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("@stripe/react-connect-js");
      if (cancelled) return;
      setComponents({
        Provider: mod.ConnectComponentsProvider,
        Onboarding: mod.ConnectAccountOnboarding,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Components) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  const { Provider, Onboarding } = Components;
  return (
    <Provider connectInstance={instance}>
      <Onboarding onExit={onExit} />
    </Provider>
  );
}
