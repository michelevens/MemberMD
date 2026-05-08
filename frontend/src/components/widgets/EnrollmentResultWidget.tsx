// ===== Enrollment Result Widget =====
// Public landing page after a Stripe Checkout redirect.
//   /#/enrollment/success?pe=<id>    — patient finished payment
//   /#/enrollment/cancelled?pe=<id>  — patient abandoned payment
//
// SUCCESS path: this page calls POST /external/reconcile/{pe} on mount,
// which is the synchronous fallback for the async Stripe webhook. If the
// webhook already fired and claimed the PendingEnrollment, the call is a
// no-op (returns existing membership). If the webhook never fired (config
// drift, outage, controller bug — see commit da2e17b), this call still
// completes the enrollment so the patient is properly active before they
// even leave the success page. We drive UI off the reconcile result so
// "You're enrolled" only renders after the membership truly exists.
//
// CANCELLED path: purely informational, no API call.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, X, Loader2 } from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "https://pure-courage-production.up.railway.app/api";

type ReconcileState =
  | { kind: "loading" }
  | { kind: "success"; membershipId: string | null }
  | { kind: "pending"; message: string }
  | { kind: "error"; message: string };

function SuccessCard({ pendingId }: { pendingId: string | null }) {
  const [state, setState] = useState<ReconcileState>(
    pendingId ? { kind: "loading" } : { kind: "error", message: "Missing enrollment reference." },
  );

  useEffect(() => {
    if (!pendingId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/external/reconcile/${pendingId}`, {
          method: "POST",
          headers: { Accept: "application/json" },
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setState({
            kind: "success",
            membershipId: json?.data?.membership_id ?? json?.data?.membershipId ?? null,
          });
        } else if (res.status === 402) {
          setState({
            kind: "pending",
            message: json?.message || "Payment not yet completed.",
          });
        } else {
          setState({
            kind: "error",
            message: json?.error || json?.message || "Could not verify your enrollment.",
          });
        }
      } catch (e) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Network error.",
        });
      }
    })();
    return () => { cancelled = true; };
  }, [pendingId]);

  if (state.kind === "loading") {
    return (
      <ResultShell accentBg="#f1f5f9" icon={<Loader2 className="w-8 h-8 animate-spin" style={{ color: "#475569" }} strokeWidth={2.5} />}>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Confirming your enrollment…</h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          Just a moment while we verify your payment with Stripe.
        </p>
        <Reference id={pendingId} />
      </ResultShell>
    );
  }

  if (state.kind === "success") {
    return (
      <ResultShell accentBg="#e6f7f2" icon={<Check className="w-8 h-8" style={{ color: "#27ab83" }} strokeWidth={2.5} />}>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">You're enrolled.</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          Your payment went through and your membership is active. We just sent
          you an email with a link to set up your portal password — once you've
          set it, you can sign in below.
        </p>
        <a
          href="#/login"
          className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-md text-sm font-semibold text-white shadow-sm transition-colors"
          style={{ backgroundColor: "#27ab83" }}
        >
          Go to your portal
        </a>
        <Footnote
          text="A receipt was emailed to you by Stripe. If you don't see the welcome email or receipt, check your spam folder."
          pendingId={pendingId}
        />
      </ResultShell>
    );
  }

  if (state.kind === "pending") {
    return (
      <ResultShell accentBg="#fef3c7" icon={<Loader2 className="w-8 h-8" style={{ color: "#d97706" }} strokeWidth={2.5} />}>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Almost there…</h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          {state.message} If you completed payment, this page will update shortly. You can also
          close this window — your practice will be notified once payment lands.
        </p>
        <Reference id={pendingId} />
      </ResultShell>
    );
  }

  return (
    <ResultShell accentBg="#fee2e2" icon={<X className="w-8 h-8" style={{ color: "#dc2626" }} strokeWidth={2.5} />}>
      <h1 className="text-xl font-semibold text-slate-900 mb-2">Something went wrong.</h1>
      <p className="text-sm text-slate-500 leading-relaxed">
        {state.message} If you were charged, please contact your practice with the reference
        below — they can finish setting up your membership.
      </p>
      <Reference id={pendingId} />
    </ResultShell>
  );
}

function CancelledCard({ pendingId }: { pendingId: string | null }) {
  return (
    <ResultShell accentBg="#f1f5f9" icon={<X className="w-8 h-8" style={{ color: "#94a3b8" }} strokeWidth={2.5} />}>
      <h1 className="text-xl font-semibold text-slate-900 mb-2">Enrollment cancelled.</h1>
      <p className="text-sm text-slate-500 leading-relaxed">
        No charge was made and your membership wasn't created. The link you received is still
        valid for 24 hours if you change your mind — or ask your practice to send a new one.
      </p>
      <Footnote text="If you ran into a problem on the payment page, your practice can resend a fresh link or take payment over the phone." pendingId={pendingId} />
    </ResultShell>
  );
}

function ResultShell({ accentBg, icon, children }: {
  accentBg: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-8 pt-10 pb-6 text-center">
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-5"
            style={{ backgroundColor: accentBg }}
          >
            {icon}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function Footnote({ text, pendingId }: { text: string; pendingId: string | null }) {
  return (
    <div className="mt-6">
      <div className="rounded-lg border border-slate-200 px-4 py-3 text-xs text-slate-500 text-left">
        {text}
        {pendingId && (
          <div className="mt-2 text-slate-400 break-all" style={{ fontSize: "11px" }}>
            Reference: {pendingId}
          </div>
        )}
      </div>
    </div>
  );
}

function Reference({ id }: { id: string | null }) {
  if (!id) return null;
  return (
    <div className="mt-4 text-slate-400 break-all" style={{ fontSize: "11px" }}>
      Reference: {id}
    </div>
  );
}

export function EnrollmentSuccessWidget() {
  const [params] = useSearchParams();
  return <SuccessCard pendingId={params.get("pe")} />;
}

export function EnrollmentCancelledWidget() {
  const [params] = useSearchParams();
  return <CancelledCard pendingId={params.get("pe")} />;
}
