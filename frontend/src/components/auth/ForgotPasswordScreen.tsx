// ===== Forgot Password Screen =====
// User enters their email and the backend sends a reset link via the
// branded PasswordReset Mailable. The screen always shows the same
// success message regardless of whether the email exists, to prevent
// user enumeration (the backend already enforces this server-side).

import { useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        const json = await res.json().catch(() => ({}));
        setError(json.message || "Too many attempts. Please wait and try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="animate-page-in w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-md bg-[#635bff] flex items-center justify-center text-white font-semibold text-sm">M</div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">MemberMD</h1>
          </div>
          <p className="text-sm text-slate-500">Reset your password</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
          {submitted ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center bg-emerald-50 border border-emerald-100">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-900 mb-2">Check your inbox</h2>
              <p className="text-sm text-slate-500 mb-6">
                If an account exists for <strong className="text-slate-700">{email}</strong>, we've sent a link to reset the password. The link expires in 60 minutes.
              </p>
              <a
                href="#/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#635bff] hover:text-[#544ee0]"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </a>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-slate-900 mb-1.5">Forgot your password?</h2>
              <p className="text-sm text-slate-500 mb-5">
                Enter your email address and we'll send you a link to reset it.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 text-red-700 text-sm rounded-md px-3 py-2.5 border border-red-200">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-[13px] font-medium text-slate-700 mb-1">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-800 text-sm
                      focus:outline-none focus:border-slate-400 transition-colors"
                    placeholder="you@example.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 rounded-md text-white font-medium text-sm
                    bg-[#635bff] hover:bg-[#544ee0]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? "Sending…" : "Send reset link"}
                </button>
              </form>

              <div className="mt-5 text-center">
                <a href="#/login" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700">
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </a>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by MemberMD — HIPAA-compliant DPC platform
        </p>
      </div>
    </div>
  );
}
