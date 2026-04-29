// ===== MemberMD Auth Context =====
// Handles authentication state, login/logout, MFA, session timeout
// Pattern from ShiftPulse/EnnHealth

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { User, UserRole, LoginCredentials, OperatorMembership } from "../types";
import {
  authService,
  setAuthToken,
  removeAuthToken,
  getAuthToken,
  setActiveOperatorId,
  setActiveTenantId,
  getActiveOperatorId,
  getActiveTenantId,
} from "../lib/api";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaRequired: boolean;
  mfaToken: string | null;
  sessionExpiresAt: number | null;
  showSessionWarning: boolean;
  activeOperatorId: string | null;
  activeTenantId: string | null;
}

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string; mfaRequired?: boolean }>;
  verifyMFA: (code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  extendSession: () => void;
  dismissSessionWarning: () => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  /** Operators this user belongs to, if any. */
  operators: OperatorMembership[];
  /** True if the user has at least one operator membership. */
  isOperatorMember: boolean;
  /** Switch active operator (when user belongs to multiple). */
  switchOperator: (operatorId: string) => void;
  /** Switch active tenant within current operator scope. */
  switchTenant: (tenantId: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes
const SESSION_WARNING_BEFORE = 5 * 60 * 1000; // Warn 5 min before

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    mfaRequired: false,
    mfaToken: null,
    sessionExpiresAt: null,
    showSessionWarning: false,
    activeOperatorId: getActiveOperatorId(),
    activeTenantId: getActiveTenantId(),
  });

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      const stored = authService.getStoredUser();
      const token = getAuthToken();

      if (!stored || !token) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Demo mode — trust sessionStorage
      if (token.startsWith("mock_token_")) {
        setState(prev => ({
          ...prev,
          user: stored,
          isAuthenticated: true,
          isLoading: false,
          sessionExpiresAt: Date.now() + SESSION_DURATION,
        }));
        return;
      }

      // Production — validate token with backend
      const result = await authService.me();
      if (result.data) {
        sessionStorage.setItem("membermd_user", JSON.stringify(result.data));
        setState(prev => ({
          ...prev,
          user: result.data!,
          isAuthenticated: true,
          isLoading: false,
          sessionExpiresAt: Date.now() + SESSION_DURATION,
        }));
      } else {
        removeAuthToken();
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    restoreSession();
  }, []);

  // Session timeout check
  useEffect(() => {
    if (!state.isAuthenticated || !state.sessionExpiresAt) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const expiresAt = state.sessionExpiresAt!;

      if (now >= expiresAt) {
        logout();
      } else if (now >= expiresAt - SESSION_WARNING_BEFORE && !state.showSessionWarning) {
        setState(prev => ({ ...prev, showSessionWarning: true }));
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [state.isAuthenticated, state.sessionExpiresAt, state.showSessionWarning]);

  // Listen for 401 unauthorized events
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener("auth:unauthorized", handler);
    return () => window.removeEventListener("auth:unauthorized", handler);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setState(prev => ({ ...prev, isLoading: true }));

    const result = await authService.login(credentials);

    if (result.error) {
      setState(prev => ({ ...prev, isLoading: false }));
      return { success: false, error: result.error };
    }

    if (result.data?.mfaRequired) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        mfaRequired: true,
        mfaToken: result.data!.mfaToken || null,
      }));
      return { success: true, mfaRequired: true };
    }

    if (result.data) {
      setAuthToken(result.data.accessToken);
      sessionStorage.setItem("membermd_user", JSON.stringify(result.data.user));
      const initialOperatorId = result.data.user.operators?.[0]?.id ?? null;
      setActiveOperatorId(initialOperatorId);
      setActiveTenantId(null); // user picks tenant or backend defaults to first
      setState(prev => ({
        ...prev,
        user: result.data!.user,
        isAuthenticated: true,
        isLoading: false,
        mfaRequired: false,
        mfaToken: null,
        sessionExpiresAt: Date.now() + SESSION_DURATION,
        showSessionWarning: false,
        activeOperatorId: initialOperatorId,
        activeTenantId: null,
      }));
      return { success: true };
    }

    setState(prev => ({ ...prev, isLoading: false }));
    return { success: false, error: "Unknown error" };
  }, []);

  const verifyMFA = useCallback(async (code: string) => {
    if (!state.mfaToken) {
      return { success: false, error: "MFA session expired. Please log in again." };
    }

    const result = await authService.mfaLogin(state.mfaToken, code);

    if (result.data?.accessToken) {
      setAuthToken(result.data.accessToken);
      sessionStorage.setItem("membermd_user", JSON.stringify(result.data.user));
      const initialOperatorId = result.data.user.operators?.[0]?.id ?? null;
      setActiveOperatorId(initialOperatorId);
      setActiveTenantId(null);
      setState(prev => ({
        ...prev,
        user: result.data!.user,
        isAuthenticated: true,
        mfaRequired: false,
        mfaToken: null,
        sessionExpiresAt: Date.now() + SESSION_DURATION,
        showSessionWarning: false,
        activeOperatorId: initialOperatorId,
        activeTenantId: null,
      }));
      return { success: true };
    }

    return { success: false, error: result.error || "Invalid verification code" };
  }, [state.mfaToken]);

  const logout = useCallback(() => {
    authService.logout();
    removeAuthToken();
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      mfaRequired: false,
      mfaToken: null,
      sessionExpiresAt: null,
      showSessionWarning: false,
      activeOperatorId: null,
      activeTenantId: null,
    });
  }, []);

  const switchOperator = useCallback((operatorId: string) => {
    setActiveOperatorId(operatorId);
    setActiveTenantId(null);
    setState(prev => ({ ...prev, activeOperatorId: operatorId, activeTenantId: null }));
  }, []);

  const switchTenant = useCallback((tenantId: string | null) => {
    setActiveTenantId(tenantId);
    setState(prev => ({ ...prev, activeTenantId: tenantId }));
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setState(prev => {
      if (!prev.user) return prev;
      const updated = { ...prev.user, ...updates };
      sessionStorage.setItem("membermd_user", JSON.stringify(updated));
      return { ...prev, user: updated };
    });
  }, []);

  const extendSession = useCallback(() => {
    setState(prev => ({
      ...prev,
      sessionExpiresAt: Date.now() + SESSION_DURATION,
      showSessionWarning: false,
    }));
  }, []);

  const dismissSessionWarning = useCallback(() => {
    setState(prev => ({ ...prev, showSessionWarning: false }));
  }, []);

  const hasRole = useCallback((roles: UserRole | UserRole[]): boolean => {
    if (!state.user) return false;
    const arr = Array.isArray(roles) ? roles : [roles];
    return arr.includes(state.user.role);
  }, [state.user]);

  const operators = state.user?.operators ?? [];
  const isOperatorMember = operators.length > 0;

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        verifyMFA,
        logout,
        updateUser,
        extendSession,
        dismissSessionWarning,
        hasRole,
        operators,
        isOperatorMember,
        switchOperator,
        switchTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
