// ===== MemberMD Login Screen =====

import { useState, type FormEvent } from "react";
import { useAuth } from "../../contexts/AuthContext";

export function LoginScreen() {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const result = await login({ email, password });
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
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
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

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by MemberMD — HIPAA-compliant DPC platform
        </p>
      </div>
    </div>
  );
}
