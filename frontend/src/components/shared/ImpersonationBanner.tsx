// ===== ImpersonationBanner =====
// Persistent fixed top banner shown while a Superadmin is impersonating
// a practice. Pattern adopted from ShiftPulse:
//
//   - sessionStorage only (cleared on tab close, not localStorage). A
//     forgotten impersonation never persists across browser restarts.
//   - Live countdown to the token's expiry (server-issued, 2h).
//   - "Exit" button immediately discards the impersonation token,
//     restores whatever auth token was active before, and reloads.
//
// Wire-up: when superadmin clicks "Login As" on the practice detail
// page, the parent calls beginImpersonation(session). The banner
// reads from sessionStorage on every page so it persists across
// route changes.

import { useEffect, useState } from "react";
import { LogOut, ShieldAlert } from "lucide-react";

const STORAGE_KEY = "membermd_impersonation_session";
const PRIOR_TOKEN_KEY = "membermd_prior_token";
const PRIOR_USER_KEY = "membermd_prior_user";
// Matches getAuthToken() / setAuthToken() in lib/api.ts.
const AUTH_TOKEN_KEY = "membermd_token";
const USER_KEY = "membermd_user";

export interface ImpersonationSession {
  token: string;
  tenantId: string;
  tenantName: string;
  impersonatedUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  expiresAt: string; // ISO
}

export function loadImpersonationSession(): ImpersonationSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImpersonationSession;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Begin an impersonation session. Stashes the prior auth token + user
 * so we can restore them on exit. Then hard-reloads so AuthContext
 * re-bootstraps with the impersonated identity.
 */
export function beginImpersonation(session: ImpersonationSession): void {
  try {
    const priorToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
    const priorUser = sessionStorage.getItem(USER_KEY);
    if (priorToken) sessionStorage.setItem(PRIOR_TOKEN_KEY, priorToken);
    if (priorUser) sessionStorage.setItem(PRIOR_USER_KEY, priorUser);

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    sessionStorage.setItem(AUTH_TOKEN_KEY, session.token);
    // Force AuthContext to re-fetch /auth/me as the impersonated user
    // by clearing the cached user payload — the next page load will
    // resolve identity from the new token.
    sessionStorage.removeItem(USER_KEY);

    window.location.assign("/#/practice");
    window.location.reload();
  } catch {
    // sessionStorage unavailable — bail silently
  }
}

function exitImpersonation(): void {
  try {
    const priorToken = sessionStorage.getItem(PRIOR_TOKEN_KEY);
    const priorUser = sessionStorage.getItem(PRIOR_USER_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(PRIOR_TOKEN_KEY);
    sessionStorage.removeItem(PRIOR_USER_KEY);

    if (priorToken) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, priorToken);
      if (priorUser) sessionStorage.setItem(USER_KEY, priorUser);
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
    window.location.assign("/#/superadmin");
    window.location.reload();
  } catch {
    window.location.reload();
  }
}

function useCountdown(expiresAt: string): string {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Expired");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

/**
 * Mounted at the App root. Reads sessionStorage on every render so it
 * appears immediately after beginImpersonation() reloads the page,
 * and disappears after exit.
 */
export function ImpersonationBannerHost() {
  const [session, setSession] = useState<ImpersonationSession | null>(null);

  useEffect(() => {
    setSession(loadImpersonationSession());
  }, []);

  if (!session) return null;
  return <ImpersonationBanner session={session} onExit={exitImpersonation} />;
}

function ImpersonationBanner({
  session,
  onExit,
}: {
  session: ImpersonationSession;
  onExit: () => void;
}) {
  const remaining = useCountdown(session.expiresAt);
  const expired = remaining === "Expired";

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] text-white shadow-md"
      style={{ backgroundColor: expired ? "#dc2626" : "#7c3aed" }}
      role="alert"
    >
      <div className="px-4 py-2 flex items-center gap-3 text-sm">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-semibold">Impersonating:</span>
          <span className="truncate">{session.tenantName}</span>
          <span className="opacity-70">·</span>
          <span className="text-xs opacity-90">
            as {session.impersonatedUser.firstName} {session.impersonatedUser.lastName} ({session.impersonatedUser.email})
          </span>
          <span className="opacity-70">·</span>
          <span className="text-xs font-mono">
            {expired ? "Token expired" : `Expires in ${remaining}`}
          </span>
        </div>
        <button
          onClick={onExit}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-white/20 hover:bg-white/30 transition-colors shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          Exit impersonation
        </button>
      </div>
    </div>
  );
}
