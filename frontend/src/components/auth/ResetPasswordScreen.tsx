// ===== Reset Password Screen =====
// Lands here from the email link: #/reset-password?token=...&email=...
// Consumes the token via POST /auth/reset-password and redirects to login
// on success. Backend rules enforce strong password (min 12 + classes).

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Lock, ArrowLeft, CheckCircle2, Loader2, Eye, EyeOff } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

function getPasswordIssue(pw: string): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters";
  if (!/[A-Z]/.test(pw)) return "Password needs an uppercase letter";
  if (!/[a-z]/.test(pw)) return "Password needs a lowercase letter";
  if (!/[0-9]/.test(pw)) return "Password needs a number";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password needs a symbol";
  return null;
}

export function ResetPasswordScreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const emailFromUrl = searchParams.get("email") || "";

  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("This reset link is missing its token. Request a new one from the Forgot Password page.");
    }
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const issue = getPasswordIssue(password);
    if (issue) { setError(issue); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (!email) { setError("Email is required"); return; }
    if (!token) { setError("Reset token is missing"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          email,
          token,
          password,
          password_confirmation: confirm,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface the specific reason — usually expired/used token.
        if (json.errors?.email?.[0]) setError(json.errors.email[0]);
        else if (json.message) setError(json.message);
        else setError("Could not reset password. The link may have expired.");
        return;
      }
      setDone(true);
      // Auto-redirect to login after a short pause so the user can read.
      setTimeout(() => navigate("/login", { replace: true }), 2500);
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
          <p className="text-slate-500 text-sm">Choose a new password</p>
        </div>

        <div className="glass rounded-2xl p-8 shadow-navy">
          {done ? (
            <div className="text-center">
              <div
                className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #27ab83, #147d64)" }}
              >
                <CheckCircle2 className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-navy-800 mb-2">Password reset</h2>
              <p className="text-sm text-slate-500 mb-2">Your password has been updated. Redirecting to sign in…</p>
              <a href="#/login" className="text-sm font-medium text-teal-600 hover:text-teal-700">
                Continue
              </a>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-navy-800 mb-2">Set a new password</h2>
              <p className="text-sm text-slate-500 mb-6">
                Choose a password with 12+ characters, mixed case, a number, and a symbol.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 border border-red-200">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    readOnly={!!emailFromUrl}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm
                      focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent
                      read-only:bg-slate-50 read-only:text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm
                        focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
                      placeholder="12+ chars · upper · lower · number · symbol"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm
                      focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !token}
                  className="w-full py-2.5 rounded-xl text-white font-semibold text-sm
                    bg-gradient-to-r from-navy-600 to-teal-600
                    hover:from-navy-700 hover:to-teal-700
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-all duration-200 shadow-navy hover:shadow-navy-lg flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? "Updating..." : "Reset password"}
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
      </div>
    </div>
  );
}
