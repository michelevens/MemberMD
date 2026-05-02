// ===== Enrollment Result Widget =====
// Public landing page after a Stripe Checkout redirect from the
// "Send payment link" admin flow. Stripe redirects to
// /#/enrollment/success?pe=<id> on completion or
// /#/enrollment/cancelled?pe=<id> on abandonment.
//
// The actual membership row is created by the checkout.session.completed
// webhook on the backend, not here. This page is purely informational —
// it doesn't poll, fetch, or write anything.
//
// Two named exports so each route can be lazy-loaded with namedLazy
// without needing prop-typed lazy components.

import { useSearchParams } from "react-router-dom";
import { Check, X } from "lucide-react";

function ResultCard({ outcome }: { outcome: "success" | "cancelled" }) {
  const [params] = useSearchParams();
  const pendingId = params.get("pe");

  const isSuccess = outcome === "success";
  const accent = isSuccess ? "#27ab83" : "#94a3b8";
  const accentBg = isSuccess ? "#e6f7f2" : "#f1f5f9";
  const Icon = isSuccess ? Check : X;

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-8 pt-10 pb-6 text-center">
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-5"
            style={{ backgroundColor: accentBg }}
          >
            <Icon className="w-8 h-8" style={{ color: accent }} strokeWidth={2.5} />
          </div>

          {isSuccess ? (
            <>
              <h1 className="text-xl font-semibold text-slate-900 mb-2">
                You're enrolled.
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                Your payment went through and your membership is active. Your practice
                has been notified and will reach out with next steps. You can close this
                window.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900 mb-2">
                Enrollment cancelled.
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                No charge was made and your membership wasn't created. The link you
                received is still valid for 24 hours if you change your mind — or ask
                your practice to send a new one.
              </p>
            </>
          )}
        </div>

        <div className="px-8 pb-8">
          <div className="rounded-lg border border-slate-200 px-4 py-3 text-xs text-slate-500">
            {isSuccess
              ? "A receipt was emailed to you by Stripe. If you don't see it, check your spam folder."
              : "If you ran into a problem on the payment page, your practice can resend a fresh link or take payment over the phone."}
            {pendingId && (
              <div className="mt-2 text-slate-400 break-all" style={{ fontSize: "11px" }}>
                Reference: {pendingId}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EnrollmentSuccessWidget() {
  return <ResultCard outcome="success" />;
}

export function EnrollmentCancelledWidget() {
  return <ResultCard outcome="cancelled" />;
}
