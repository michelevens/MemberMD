// ===== MemberMD App =====
// HashRouter with role-based portals and lazy loading

import { Component, Suspense, lazy, type ComponentType, type ReactNode } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LoginScreen } from "./components/auth/LoginScreen";

// ─── Error Boundary ─────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("MemberMD ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
            <div
              className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4"
            >
              <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-500 mb-6">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Lazy Loading with Retry ──────────────────────────────────────────────────

function lazyRetry<T extends ComponentType<Record<string, unknown>>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch(() => {
      // Chunk load error — reload once
      const key = "chunk_retry";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
      sessionStorage.removeItem(key);
      return factory();
    })
  );
}

// Named export lazy wrapper
function namedLazy<T extends ComponentType<Record<string, unknown>>>(
  factory: () => Promise<Record<string, T>>,
  name: string
): React.LazyExoticComponent<T> {
  return lazyRetry(() =>
    factory().then((mod) => ({ default: mod[name] as T }))
  );
}

// ─── Lazy Portals ─────────────────────────────────────────────────────────────

const SuperAdminPortal = namedLazy(
  () => import("./components/portals/SuperAdminPortal"),
  "SuperAdminPortal"
);

const PracticePortal = namedLazy(
  () => import("./components/portals/PracticePortal"),
  "PracticePortal"
);

const PatientPortal = namedLazy(
  () => import("./components/portals/PatientPortal"),
  "PatientPortal"
);

const PracticeRegistration = namedLazy(
  () => import("./components/auth/PracticeRegistration"),
  "PracticeRegistration"
);

const PlanWidget = namedLazy(
  () => import("./components/widgets/PlanWidget"),
  "PlanWidget"
);

const EnrollmentWidget = namedLazy(
  () => import("./components/widgets/EnrollmentWidget"),
  "EnrollmentWidget"
);

const TelehealthRoom = namedLazy(
  () => import("./components/telehealth/TelehealthRoom"),
  "TelehealthRoom"
);


// ─── Loading Fallback ─────────────────────────────────────────────────────────

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div
          className="w-10 h-10 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"
          style={{ borderWidth: "3px", borderStyle: "solid" }}
        />
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    </div>
  );
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────

function AuthGate() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return <LoadingFallback />;

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/register" element={<PracticeRegistration />} />
          <Route path="/plans/:tenantCode" element={<PlanWidget />} />
          <Route path="/enroll/:tenantCode" element={<EnrollmentWidget />} />
          <Route path="/intake/:tenantCode" element={<div className="min-h-screen flex items-center justify-center"><p className="text-slate-500">Patient Intake — Coming Soon</p></div>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // Role-based portal routing
  const portalPath = getPortalPath(user?.role);

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/superadmin/*" element={<SuperAdminPortal />} />
        <Route path="/practice/*" element={<PracticePortal />} />
        <Route path="/patient/*" element={<PatientPortal />} />
        <Route path="/telehealth/:sessionId" element={<TelehealthRoom />} />
        <Route path="*" element={<Navigate to={portalPath} replace />} />
      </Routes>
    </Suspense>
  );
}

function getPortalPath(role?: string): string {
  switch (role) {
    case "superadmin":
      return "/superadmin";
    case "practice_admin":
    case "provider":
    case "staff":
      return "/practice";
    case "patient":
      return "/patient";
    default:
      return "/login";
  }
}

// ─── Query Client ─────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <AuthProvider>
              <AuthGate />
            </AuthProvider>
          </HashRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
