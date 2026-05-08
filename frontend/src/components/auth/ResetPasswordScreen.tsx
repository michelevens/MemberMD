// ===== Reset Password Screen =====
// Lands here from the email link: #/reset-password?token=...&email=...
// Consumes the token via POST /auth/reset-password and redirects to login
// on success. Backend rules enforce strong password (min 12 + classes).

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Eye, EyeOff, Sparkles, Copy, Check } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

function getPasswordIssue(pw: string): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters";
  if (!/[A-Z]/.test(pw)) return "Password needs an uppercase letter";
  if (!/[a-z]/.test(pw)) return "Password needs a lowercase letter";
  if (!/[0-9]/.test(pw)) return "Password needs a number";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password needs a symbol";
  return null;
}

// Generate a 16-char password that always passes the validator above.
//
// crypto.getRandomValues over Math.random because the latter is biased
// and predictable — fine for shuffling cards, not for a credential.
//
// We exclude visually ambiguous characters (0/O, 1/l/I) so a patient
// reading the password off the screen to type into their password
// manager doesn't fat-finger it. Symbol set excludes quotes/backslash
// to avoid copy-paste escaping issues.
const ALPHA_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ALPHA_LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+?";
const ALL_CHARS = ALPHA_UPPER + ALPHA_LOWER + DIGITS + SYMBOLS;

function pick(set: string): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return set[buf[0] % set.length];
}

function generateStrongPassword(): string {
  const chars: string[] = [
    pick(ALPHA_UPPER),
    pick(ALPHA_LOWER),
    pick(DIGITS),
    pick(SYMBOLS),
  ];
  while (chars.length < 16) chars.push(pick(ALL_CHARS));
  // Fisher-Yates shuffle so the guaranteed-class chars aren't always
  // at positions 0-3 (which would leak structure to anyone watching).
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
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
  const [justGenerated, setJustGenerated] = useState(false);

  const handleGenerate = async () => {
    const pw = generateStrongPassword();
    setPassword(pw);
    setConfirm(pw);
    setShowPassword(true);
    setError("");
    try {
      await navigator.clipboard?.writeText(pw);
    } catch {
      // Clipboard write can fail in non-secure contexts or when the user
      // denies permission — the password is still visible on screen, so
      // that's a soft failure, not worth surfacing.
    }
    setJustGenerated(true);
    setTimeout(() => setJustGenerated(false), 3000);
  };

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
        if (json.errors?.email?.[0]) setError(json.errors.email[0]);
        else if (json.message) setError(json.message);
        else setError("Could not reset password. The link may have expired.");
        return;
      }
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="animate-page-in w-full max-w-md">
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-md bg-[#635bff] flex items-center justify-center text-white font-semibold text-sm">M</div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">MemberMD</h1>
          </div>
          <p className="text-sm text-slate-500">Choose a new password</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
          {done ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center bg-emerald-50 border border-emerald-100">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-900 mb-2">Password reset</h2>
              <p className="text-sm text-slate-500 mb-2">Your password has been updated. Redirecting to sign in…</p>
              <a href="#/login" className="text-sm font-medium text-[#635bff] hover:text-[#544ee0]">
                Continue
              </a>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-slate-900 mb-1.5">Set a new password</h2>
              <p className="text-sm text-slate-500 mb-5">
                Choose a password with 12+ characters, mixed case, a number, and a symbol.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 text-red-700 text-sm rounded-md px-3 py-2.5 border border-red-200">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-[13px] font-medium text-slate-700 mb-1">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    readOnly={!!emailFromUrl}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-800 text-sm
                      focus:outline-none focus:border-slate-400 transition-colors
                      read-only:bg-slate-50 read-only:text-slate-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[13px] font-medium text-slate-700">New password</label>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#635bff] hover:text-[#544ee0]"
                    >
                      {justGenerated ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Generated &amp; copied
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Generate strong password
                        </>
                      )}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="w-full pl-3 pr-10 py-2 rounded-md border border-slate-200 bg-white text-slate-800 text-sm
                        focus:outline-none focus:border-slate-400 transition-colors"
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
                  {justGenerated && (
                    <p className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1">
                      <Copy className="w-3 h-3" />
                      Saved to your clipboard — paste it into your password manager before submitting.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-slate-700 mb-1">Confirm password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-800 text-sm
                      focus:outline-none focus:border-slate-400 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !token}
                  className="w-full py-2 rounded-md text-white font-medium text-sm
                    bg-[#635bff] hover:bg-[#544ee0]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? "Updating…" : "Reset password"}
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
      </div>
    </div>
  );
}
