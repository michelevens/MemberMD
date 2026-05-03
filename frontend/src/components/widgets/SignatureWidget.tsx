// Public e-signature page. Reached via emailed link with a token in the
// hash route: /#/sign/:token. No auth required — the token is the auth.
//
// Lifecycle:
//   1. Mount → fetch /external/signature-requests/:token
//   2. Render template content + SignaturePad
//   3. Submit → POST /external/signature-requests/:token/sign
//   4. Show "Signed. Thanks." card with date stamp
//
// Mirrors the EnrollmentResultWidget look so practices' patients see a
// consistent visual across the email-link surfaces.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Loader2, AlertTriangle, FileText } from "lucide-react";
import { SignaturePad } from "../shared/SignaturePad";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "https://pure-courage-production.up.railway.app/api";

interface PublicTemplate {
  id: string;
  name: string;
  type: string;
  version: string | number;
  content: string;
  description?: string | null;
}

interface SignaturePayload {
  id: string;
  status: "pending" | "signed" | "expired" | "cancelled";
  message: string | null;
  expires_at: string | null;
  practice_name: string;
  practice_logo_url: string | null;
  template: PublicTemplate;
  patient: { first_name: string | null; last_name: string | null };
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; payload: SignaturePayload }
  | { kind: "submitting"; payload: SignaturePayload }
  | { kind: "signed"; signedAt: string; templateName: string }
  | { kind: "gone"; reason: string }
  | { kind: "error"; message: string };

export function SignatureWidget() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [signature, setSignature] = useState<{ data: string; type: "drawn" | "typed" } | null>(null);

  useEffect(() => {
    if (!token) {
      setState({ kind: "error", message: "Missing signature token." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/external/signature-requests/${token}`, {
          headers: { Accept: "application/json" },
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 410) {
          setState({ kind: "gone", reason: json?.message || "This link is no longer active." });
          return;
        }
        if (!res.ok) {
          setState({ kind: "error", message: json?.message || "Could not load signature request." });
          return;
        }
        setState({ kind: "ready", payload: json.data });
      } catch (e) {
        if (cancelled) return;
        setState({ kind: "error", message: e instanceof Error ? e.message : "Network error." });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit() {
    if (!token || !signature || state.kind !== "ready") return;
    setState({ kind: "submitting", payload: state.payload });
    try {
      const res = await fetch(`${API_BASE_URL}/external/signature-requests/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          signature_data: signature.data,
          signature_type: signature.type,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", message: json?.message || "Could not record signature." });
        return;
      }
      setState({
        kind: "signed",
        signedAt: json?.data?.signed_at || new Date().toISOString(),
        templateName: state.payload.template.name,
      });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Network error." });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ backgroundColor: "#f8fafc" }}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {state.kind === "loading" && (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto text-slate-400 animate-spin mb-3" />
            <p className="text-sm text-slate-500">Loading signature request…</p>
          </div>
        )}

        {state.kind === "gone" && (
          <Outcome icon={AlertTriangle} accent="#94a3b8" accentBg="#f1f5f9" title="Link no longer active" body={state.reason} />
        )}

        {state.kind === "error" && (
          <Outcome icon={AlertTriangle} accent="#dc2626" accentBg="#fee2e2" title="Couldn't load this signature link" body={state.message} />
        )}

        {state.kind === "signed" && (
          <Outcome
            icon={Check}
            accent="#27ab83"
            accentBg="#e6f7f2"
            title="Signature recorded"
            body={`Thanks. Your signature on "${state.templateName}" was received on ${new Date(state.signedAt).toLocaleString()}. You can close this window.`}
          />
        )}

        {(state.kind === "ready" || state.kind === "submitting") && (
          <SignForm
            payload={state.payload}
            submitting={state.kind === "submitting"}
            signature={signature}
            onSignature={setSignature}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}

function SignForm({ payload, submitting, signature, onSignature, onSubmit }: {
  payload: SignaturePayload;
  submitting: boolean;
  signature: { data: string; type: "drawn" | "typed" } | null;
  onSignature: (s: { data: string; type: "drawn" | "typed" } | null) => void;
  onSubmit: () => void;
}) {
  const fullName = [payload.patient.first_name, payload.patient.last_name].filter(Boolean).join(" ").trim();
  return (
    <>
      {/* Header */}
      <div className="px-6 pt-8 pb-4 border-b border-slate-100 text-center">
        {payload.practice_logo_url ? (
          <img src={payload.practice_logo_url} alt={payload.practice_name} className="h-10 mx-auto mb-3 object-contain" />
        ) : (
          <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-indigo-600 flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
        )}
        <p className="text-xs text-slate-500 uppercase tracking-wider">{payload.practice_name}</p>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">{payload.template.name}</h1>
        {fullName && (
          <p className="text-sm text-slate-500 mt-1">For {fullName}</p>
        )}
      </div>

      {/* Optional message */}
      {payload.message && (
        <div className="mx-6 mt-4 rounded-lg border-l-4 border-indigo-400 bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-700 italic">{payload.message}</p>
        </div>
      )}

      {/* Document body */}
      <div className="px-6 py-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 max-h-72 overflow-y-auto whitespace-pre-line text-sm text-slate-700 leading-relaxed">
          {payload.template.content}
        </div>
      </div>

      {/* Signature pad */}
      <div className="px-6 pb-2">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Your signature</label>
        <SignaturePad onCapture={(data, type) => onSignature({ data, type })} disabled={submitting} />
      </div>

      {/* Submit */}
      <div className="px-6 py-5 border-t border-slate-100 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400 leading-relaxed flex-1">
          By submitting, you agree that your electronic signature is the legal equivalent of your handwritten signature.
        </p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!signature || submitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit signature"}
        </button>
      </div>
    </>
  );
}

function Outcome({ icon: Icon, accent, accentBg, title, body }: {
  icon: typeof Check;
  accent: string;
  accentBg: string;
  title: string;
  body: string;
}) {
  return (
    <div className="px-8 py-12 text-center">
      <div
        className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-5"
        style={{ backgroundColor: accentBg }}
      >
        <Icon className="w-8 h-8" style={{ color: accent }} strokeWidth={2.5} />
      </div>
      <h1 className="text-xl font-semibold text-slate-900 mb-2">{title}</h1>
      <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto">{body}</p>
    </div>
  );
}
