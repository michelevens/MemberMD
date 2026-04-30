// ===== MemberMD Login Screen =====

import { useState, type FormEvent } from "react";
import { useAuth } from "../../contexts/AuthContext";

const DEMO_ACCOUNTS: Array<{ role: string; email: string; password: string; tint: string }> = [
  { role: "Superadmin", email: "super@membermd.io", password: "MemberMD2026", tint: "from-purple-500 to-purple-600" },
  { role: "Practice Admin", email: "admin@clearstone.test", password: "demo", tint: "from-navy-600 to-teal-600" },
  { role: "Provider", email: "provider@clearstone.test", password: "demo", tint: "from-teal-500 to-emerald-600" },
  { role: "Staff", email: "staff@clearstone.test", password: "demo", tint: "from-amber-500 to-orange-500" },
  { role: "Patient", email: "patient1@clearstone.test", password: "demo", tint: "from-sky-500 to-blue-600" },
];

export function LoginScreen() {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [demoOpen, setDemoOpen] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const result = await login({ email, password });
    if (!result.success && result.error) {
      setError(result.error);
    }
  };

  const signInAs = async (acct: { email: string; password: string }) => {
    setError("");
    setEmail(acct.email);
    setPassword(acct.password);
    const result = await login({ email: acct.email, password: acct.password });
    if (!result.success && result.error) {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="animate-page-in w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold gradient-text mb-1">MemberMD</h1>
          <p className="text-slate-500 text-sm">Direct Primary Care Membership Platform</p>
        </div>

        {/* Login Card */}
        <div className="glass rounded-2xl p-8 shadow-navy">
          <h2 className="text-xl font-semibold text-navy-800 mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 border border-red-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm
                  focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent
                  transition-all duration-200"
                placeholder="you@practice.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <a href="#/forgot-password" className="text-xs font-medium text-teal-600 hover:text-teal-700">
                  Forgot password?
                </a>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm
                  focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent
                  transition-all duration-200"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl text-white font-semibold text-sm
                bg-gradient-to-r from-navy-600 to-teal-600
                hover:from-navy-700 hover:to-teal-700
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 shadow-navy hover:shadow-navy-lg"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a href="#/register" className="text-sm text-teal-600 hover:text-teal-700 font-medium">
              Create a new practice account
            </a>
          </div>
        </div>

        {/* Demo accounts — sandbox tenant for evaluation */}
        <div className="mt-4 glass rounded-2xl p-5 shadow-navy">
          <button
            type="button"
            onClick={() => setDemoOpen((o) => !o)}
            className="w-full flex items-center justify-between text-left"
            aria-expanded={demoOpen}
          >
            <div>
              <p className="text-sm font-semibold text-navy-800">Try a demo account</p>
              <p className="text-xs text-slate-500 mt-0.5">One-click sign-in to the sandbox tenant</p>
            </div>
            <span className={`text-slate-400 text-xs transition-transform ${demoOpen ? "rotate-180" : ""}`}>▼</span>
          </button>

          {demoOpen && (
            <div className="mt-4 space-y-2">
              {DEMO_ACCOUNTS.map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => signInAs(acct)}
                  disabled={isLoading}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl
                    bg-gradient-to-r ${acct.tint} text-white text-sm font-medium
                    disabled:opacity-50 disabled:cursor-not-allowed
                    hover:opacity-95 transition-opacity shadow-sm`}
                >
                  <span>{acct.role}</span>
                  <span className="text-xs opacity-80 font-mono">{acct.email}</span>
                </button>
              ))}
              <p className="text-[11px] text-slate-400 text-center pt-1">
                Sandbox data only — do not enter real PHI
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by MemberMD — HIPAA-compliant DPC platform
        </p>
      </div>
    </div>
  );
}
