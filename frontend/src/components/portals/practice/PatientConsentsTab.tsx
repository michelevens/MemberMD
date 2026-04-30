// Practice portal — patient detail Consents tab.
// Lists every signature this patient has on file with a download-PDF
// button per row plus a quick view of the body. The "Request Consent"
// button is currently a placeholder until the request-flow UI ships.

import { useEffect, useState } from "react";
import { Shield, Download, Eye, Send, Loader2, X } from "lucide-react";
import { consentService } from "../../../lib/api";
import { AgreementBody } from "../../shared/AgreementBody";

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
}: {
  patientId: string;
  setToast: (t: { message: string; type: "success" | "error" }) => void;
}) {
  const [signatures, setSignatures] = useState<SignatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<SignatureRow | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    consentService.listSignatures({ patient_id: patientId })
      .then((res) => {
        if (cancelled) return;
        setSignatures((res.data as unknown as SignatureRow[]) ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setSignatures([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [patientId]);

  const openPreview = async (sig: SignatureRow) => {
    setPreviewing(sig);
    setPreviewContent(null);
    try {
      const res = await consentService.getSignature(sig.id);
      const fullSig = res.data as unknown as SignatureRow & { template?: { content?: string } };
      setPreviewContent(fullSig.template?.content ?? "");
    } catch {
      setPreviewContent("");
      setToast({ message: "Could not load agreement content.", type: "error" });
    }
  };

  const downloadPdf = async (sig: SignatureRow) => {
    setDownloadingId(sig.id);
    try {
      const filename = `${sig.template?.name ?? "Agreement"} - ${formatDate(sig.signed_at)}.pdf`;
      await consentService.downloadSignaturePdf(sig.id, filename);
      setToast({ message: "Download started.", type: "success" });
    } catch {
      setToast({ message: "Download failed.", type: "error" });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Consents & Authorizations</h3>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
          style={{ backgroundColor: "#27ab83" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#147d64")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ab83")}
          onClick={() => setToast({ message: "Request Consent flow — coming soon.", type: "success" })}
        >
          <Send className="w-3.5 h-3.5" /> Request Consent
        </button>
      </div>

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
