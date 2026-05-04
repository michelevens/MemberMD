// Practice portal — patient detail Consents tab.
// Lists every signature this patient has on file with a download-PDF
// button per row plus a quick view of the body. The "Request Consent"
// button opens a picker that creates a SignatureRequest (emails the
// patient a sign link) — the patient signs at /#/sign/{token} and
// the resulting ConsentSignature shows up in this same list.

import { useCallback, useEffect, useState } from "react";
import { Shield, Download, Eye, Send, Loader2, X, Clock, RotateCcw, XCircle } from "lucide-react";
import { consentService, signatureRequestService, type SignatureRequestRow } from "../../../lib/api";
import { AgreementBody } from "../../shared/AgreementBody";
import type { ConsentTemplate } from "../../../types";

interface SignatureRow {
  id: string;
  template_id: string;
  signed_at: string;
  template_version?: number | null;
  ip_address?: string | null;
  template?: {
    id: string;
    name: string;
    type: string;
    version: string;
    description?: string | null;
    content?: string;
  };
}

export function PatientConsentsTab({
  patientId,
  setToast,
  hideRequestButton = false,
}: {
  patientId: string;
  // Optional — practice portal wires its inline toast; the patient
  // portal reuses this same component without one (download/preview
  // failures still surface via the loading-state UI in the row).
  setToast?: (t: { message: string; type: "success" | "error" }) => void;
  // The "Request Consent" CTA is admin-only — patients viewing their
  // own list shouldn't see it.
  hideRequestButton?: boolean;
}) {
  const toast = setToast ?? (() => {});
  const [signatures, setSignatures] = useState<SignatureRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<SignatureRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<SignatureRow | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);

  // Refetch both lists. Called on mount, after a request is sent,
  // and after cancel/resend so the admin sees fresh state without a
  // page reload.
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [sigRes, reqRes] = await Promise.all([
        consentService.listSignatures({ patient_id: patientId }),
        // Patients only see their own; admin call is fine without
        // status filter (we'll narrow client-side to pending).
        hideRequestButton
          ? Promise.resolve({ data: [] as SignatureRequestRow[] })
          : signatureRequestService.list({ patient_id: patientId }),
      ]);
      setSignatures((sigRes.data as unknown as SignatureRow[]) ?? []);
      const reqs = (reqRes.data as unknown as SignatureRequestRow[]) ?? [];
      setPendingRequests(reqs.filter((r) => r.status === "pending"));
    } catch {
      setSignatures([]);
      setPendingRequests([]);
    } finally {
      setLoading(false);
    }
  }, [patientId, hideRequestButton]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const cancelRequest = async (id: string) => {
    setRequestActionId(id);
    const res = await signatureRequestService.cancel(id);
    setRequestActionId(null);
    if (res.error) {
      toast({ message: res.error, type: "error" });
      return;
    }
    toast({ message: "Request cancelled.", type: "success" });
    void reload();
  };

  const resendRequest = async (id: string) => {
    setRequestActionId(id);
    const res = await signatureRequestService.resend(id);
    setRequestActionId(null);
    if (res.error) {
      toast({ message: res.error, type: "error" });
      return;
    }
    toast({ message: "Reminder email sent.", type: "success" });
    void reload();
  };

  const openPreview = async (sig: SignatureRow) => {
    setPreviewing(sig);
    setPreviewContent(null);
    try {
      const res = await consentService.getSignature(sig.id);
      const fullSig = res.data as unknown as SignatureRow & { template?: { content?: string } };
      setPreviewContent(fullSig.template?.content ?? "");
    } catch {
      setPreviewContent("");
      toast({ message: "Could not load agreement content.", type: "error" });
    }
  };

  const downloadPdf = async (sig: SignatureRow) => {
    setDownloadingId(sig.id);
    try {
      const filename = `${sig.template?.name ?? "Agreement"} - ${formatDate(sig.signed_at)}.pdf`;
      await consentService.downloadSignaturePdf(sig.id, filename);
      toast({ message: "Download started.", type: "success" });
    } catch {
      toast({ message: "Download failed.", type: "error" });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Consents & Authorizations</h3>
        {!hideRequestButton && (
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white transition-colors"
            style={{ backgroundColor: "#635bff" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#544ee0")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#635bff")}
            onClick={() => setRequestModalOpen(true)}
          >
            <Send className="w-3.5 h-3.5" /> Request Consent
          </button>
        )}
      </div>

      {/* Pending requests — visible to admin only (patient view hides
          the request button entirely so this block is empty for them). */}
      {!hideRequestButton && pendingRequests.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40">
          <div className="px-4 py-2.5 border-b border-amber-200/60 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Pending — awaiting patient signature
            </p>
          </div>
          <div className="divide-y divide-amber-100">
            {pendingRequests.map((req) => {
              const tName = req.template?.name ?? "Agreement";
              const sentDate = formatDate(req.created_at);
              const expires = req.expires_at ? formatDate(req.expires_at) : null;
              const busy = requestActionId === req.id;
              return (
                <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{tName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Sent {sentDate}
                      {req.reminded_at ? ` · reminded ${formatDate(req.reminded_at)}` : ""}
                      {expires ? ` · expires ${expires}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => resendRequest(req.id)}
                      disabled={busy}
                      className="p-2 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                      title="Resend reminder email"
                    >
                      {busy
                        ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                        : <RotateCcw className="w-4 h-4 text-slate-500" />}
                    </button>
                    <button
                      onClick={() => cancelRequest(req.id)}
                      disabled={busy}
                      className="p-2 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                      title="Cancel request"
                    >
                      <XCircle className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="glass rounded-xl flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : signatures.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center">
          <Shield className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-500">No consents on file for this patient yet.</p>
        </div>
      ) : (
        <div className="glass rounded-xl divide-y divide-slate-100">
          {signatures.map((sig) => {
            const tName = sig.template?.name ?? "Agreement";
            const tVersion = sig.template_version ?? sig.template?.version ?? "—";
            return (
              <div key={sig.id} className="flex items-center gap-3 p-4">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#ecf9ec" }}
                >
                  <Shield className="w-4 h-4" style={{ color: "#2f8132" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-700 truncate">{tName}</p>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                      v{tVersion}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded font-semibold"
                      style={{ backgroundColor: "#ecf9ec", color: "#2f8132" }}
                    >
                      Signed
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatDate(sig.signed_at)}
                    {sig.ip_address ? ` · IP ${sig.ip_address}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openPreview(sig)}
                    className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                    title="View"
                  >
                    <Eye className="w-4 h-4 text-slate-500" />
                  </button>
                  <button
                    onClick={() => downloadPdf(sig)}
                    disabled={downloadingId === sig.id}
                    className="p-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                    title="Download PDF"
                  >
                    {downloadingId === sig.id
                      ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                      : <Download className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewing && (
        <div
          onClick={() => setPreviewing(null)}
          style={{
            position: "fixed", inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(4px)",
            zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#ffffff", borderRadius: "12px",
              maxWidth: "780px", width: "100%", maxHeight: "90vh",
              display: "flex", flexDirection: "column",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {previewing.template?.name ?? "Agreement"}
                </h3>
                <p className="text-xs mt-0.5 text-slate-500">
                  Signed {formatDate(previewing.signed_at)} · v{previewing.template_version ?? "—"}
                </p>
              </div>
              <button
                onClick={() => setPreviewing(null)}
                className="p-2 rounded-lg hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {previewContent === null
                ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-teal-500" />
                : previewContent === ""
                  ? <p className="text-sm text-slate-400">Could not load content.</p>
                  : <AgreementBody content={previewContent} />
              }
            </div>
          </div>
        </div>
      )}

      {requestModalOpen && (
        <RequestConsentModal
          patientId={patientId}
          onClose={() => setRequestModalOpen(false)}
          onSent={(message) => {
            toast({ message, type: "success" });
            setRequestModalOpen(false);
            void reload();
          }}
          onError={(message) => toast({ message, type: "error" })}
        />
      )}
    </div>
  );
}

// ─── Request Consent modal ───────────────────────────────────────────────────

function RequestConsentModal({
  patientId,
  onClose,
  onSent,
  onError,
}: {
  patientId: string;
  onClose: () => void;
  onSent: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    consentService.listTemplates().then((res) => {
      if (cancelled) return;
      // Merge tenant-customized + platform fork-able into one pickable
      // list. Either source is fine for /signature-requests; the
      // backend resolves both.
      const tenant = res.data?.tenant ?? [];
      const platform = res.data?.platform_available_to_fork ?? [];
      const merged = [...tenant, ...platform].filter((t) => (t as { is_active?: boolean; isActive?: boolean }).is_active !== false && (t as { isActive?: boolean }).isActive !== false);
      setTemplates(merged);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const send = async () => {
    if (!selectedId) return;
    setSending(true);
    const res = await signatureRequestService.create({
      template_id: selectedId,
      patient_id: patientId,
      message: message.trim() || null,
    });
    setSending(false);
    if (res.error) {
      onError(res.error);
      return;
    }
    onSent("Signature request sent — patient will receive an email link.");
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#ffffff", borderRadius: "12px",
          maxWidth: "520px", width: "100%", maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 className="text-base font-semibold text-slate-900">Request Consent Signature</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          <p className="text-xs text-slate-500 mb-3">
            Pick a template — the patient gets an email with a secure sign-in-place link
            that expires in 30 days. They can also sign in-app from their portal.
          </p>

          {loading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No templates available. Add one in Settings → Agreements.
            </p>
          ) : (
            <div className="space-y-1.5 mb-4">
              {templates.map((t) => {
                const id = t.id as string;
                const isSel = selectedId === id;
                return (
                  <label
                    key={id}
                    className="flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors"
                    style={{
                      borderColor: isSel ? "#635bff" : "#e2e8f0",
                      backgroundColor: isSel ? "#f5f3ff" : "#ffffff",
                    }}
                  >
                    <input
                      type="radio"
                      name="consent-template"
                      checked={isSel}
                      onChange={() => setSelectedId(id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                      {(t as { description?: string | null }).description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {(t as { description?: string | null }).description}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">
                      v{(t as { version?: string | number }).version ?? "—"}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Note to patient <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Please review and sign before your appointment on Friday."
            rows={3}
            maxLength={1000}
            className="w-full text-sm border rounded-lg p-2.5 outline-none focus:border-indigo-400 resize-none"
            style={{ borderColor: "#e2e8f0" }}
          />
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={!selectedId || sending}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#635bff" }}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send Request
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}
