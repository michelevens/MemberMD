// ===== Forgot Password Screen =====
// User enters their email and the backend sends a reset link via the
// branded PasswordReset Mailable. The screen always shows the same
// success message regardless of whether the email exists, to prevent
// user enumeration (the backend already enforces this server-side).

import { useState, type FormEvent } from "react";
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

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
      // Backend always returns the same generic 200 message regardless of
      // whether the email is on file. Show the success state either way.
      setSubmitted(true);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="animate-page-in w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold gradient-text mb-1">MemberMD</h1>
          <p className="text-slate-500 text-sm">Reset your password</p>
        </div>

        <div className="glass rounded-2xl p-8 shadow-navy">
          {submitted ? (
            <div className="text-center">
              <div
                className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
              >
                <CheckCircle2 className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-navy-800 mb-2">Check your inbox</h2>
              <p className="text-sm text-slate-500 mb-6">
                If an account exists for <strong>{email}</strong>, we've sent a link to reset the password. The link expires in 60 minutes.
              </p>
              <a
                href="#/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </a>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-navy-800 mb-2">Forgot your password?</h2>
              <p className="text-sm text-slate-500 mb-6">
                Enter your email address and we'll send you a link to reset it.
              </p>

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
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm
                        focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent
                        transition-all duration-200"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-xl text-white font-semibold text-sm
                    bg-gradient-to-r from-navy-600 to-teal-600
                    hover:from-navy-700 hover:to-teal-700
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-all duration-200 shadow-navy hover:shadow-navy-lg flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? "Sending..." : "Send reset link"}
                </button>
              </form>

              <div className="mt-6 text-center">
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
