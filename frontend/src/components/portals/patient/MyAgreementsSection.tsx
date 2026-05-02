// "My Agreements" section in the patient portal billing tab.
// Lists every agreement the patient has signed, with version + date,
// view-content modal, and a Download PDF button per row. Also surfaces
// the membership-level Membership Agreement PDF (the actual contract).

import { useEffect, useState } from "react";
import { FileText, Download, Eye, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { consentService, membershipService } from "../../../lib/api";
import { AgreementBody } from "../../shared/AgreementBody";
import type { ConsentSignature, PatientMembership } from "../../../types";

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal50: "#e6fffa",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  white: "#ffffff",
  red500: "#ef4444",
  green500: "#22c55e",
};

// Backend response includes nested template + membership; type system is
// looser than reality here so we cast at the boundary.
interface SignatureRow {
  id: string;
  template_id: string;
  membership_id?: string | null;
  template_version?: number | null;
  signed_at: string;
  signature_type: string;
  ip_address?: string | null;
  template?: {
    id: string;
    name: string;
    type: string;
    version: string;
    description?: string | null;
  };
}

export function MyAgreementsSection() {
  const [signatures, setSignatures] = useState<SignatureRow[]>([]);
  const [memberships, setMemberships] = useState<PatientMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewSig, setPreviewSig] = useState<SignatureRow | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    // Laravel paginated responses come back as { data: { current_page, data: [...] } }.
    // Both consentSignatures and memberships are paginated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unwrap = <T,>(payload: any): T[] => {
      if (Array.isArray(payload)) return payload as T[];
      if (Array.isArray(payload?.data)) return payload.data as T[];
      if (Array.isArray(payload?.items)) return payload.items as T[];
      return [];
    };
    (async () => {
      try {
        const [sigs, mems] = await Promise.all([
          consentService.listSignatures(),
          membershipService.list(),
        ]);
        if (cancelled) return;
        setSignatures(unwrap<SignatureRow>(sigs.data));
        setMemberships(unwrap(mems.data));
      } catch {
        // Silent fail — empty state is fine for patients with no signatures
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openPreview = async (sig: SignatureRow) => {
    setPreviewSig(sig);
    setPreviewContent(null);
    try {
      const res = await consentService.getSignature(sig.id);
      // Backend returns the signature with template eagerly loaded
      const fullSig = res.data as unknown as SignatureRow & { template?: { content?: string } };
      setPreviewContent(fullSig.template?.content ?? "");
    } catch {
      setPreviewContent("");
      setToast({ message: "Could not load agreement content.", type: "error" });
    }
  };

  const downloadSignaturePdf = async (sig: SignatureRow) => {
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

  const downloadMembershipAgreement = async (membershipId: string) => {
    setDownloadingId(membershipId);
    try {
      await consentService.downloadMembershipAgreementPdf(
        membershipId,
        `Membership Agreement.pdf`,
      );
      setToast({ message: "Download started.", type: "success" });
    } catch {
      setToast({ message: "Download failed.", type: "error" });
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.teal500 }} />
        </div>
      </div>
    );
  }

  const activeMembership = memberships.find((m) =>
    ["active", "past_due", "paused"].includes(String((m as { status?: string }).status))
  );

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: C.navy800 }}>
          My Agreements
        </h3>
        <FileText className="w-4 h-4" style={{ color: C.slate400 }} />
      </div>

      {/* Membership Agreement (the contract — pull this even with no signature on file) */}
      {activeMembership && (
        <div
          className="rounded-lg border p-3 mb-3 flex items-center gap-3"
          style={{ borderColor: C.teal500, backgroundColor: C.teal50 }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: C.white }}
          >
            <FileText className="w-4 h-4" style={{ color: C.teal600 }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: C.navy800 }}>
              Direct Primary Care Membership Agreement
            </p>
            <p className="text-xs" style={{ color: C.slate500 }}>
              Your full membership contract with plan entitlements
            </p>
          </div>
          <button
            onClick={() => downloadMembershipAgreement(activeMembership.id)}
            disabled={downloadingId === activeMembership.id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: C.teal500 }}
          >
            {downloadingId === activeMembership.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />}
            PDF
          </button>
        </div>
      )}

      {/* Individual signed consents */}
      {signatures.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: C.slate400 }}>
          No agreements signed yet.
        </p>
      ) : (
        <div className="divide-y" style={{ borderColor: C.slate100 }}>
          {signatures.map((sig) => {
            const tName = sig.template?.name ?? "Agreement";
            const tVersion = sig.template_version ?? sig.template?.version ?? "—";
            return (
              <div key={sig.id} className="flex items-center gap-3 py-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: C.slate100 }}
                >
                  <FileText className="w-4 h-4" style={{ color: C.slate600 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: C.navy800 }}>
                    {tName}
                  </p>
                  <p className="text-xs" style={{ color: C.slate400 }}>
                    Signed {formatDate(sig.signed_at)} · v{tVersion}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openPreview(sig)}
                    className="p-2 rounded-lg transition-colors hover:bg-slate-100"
                    title="View"
                  >
                    <Eye className="w-4 h-4" style={{ color: C.slate500 }} />
                  </button>
                  <button
                    onClick={() => downloadSignaturePdf(sig)}
                    disabled={downloadingId === sig.id}
                    className="p-2 rounded-lg transition-colors hover:bg-slate-100 disabled:opacity-50"
                    title="Download PDF"
                  >
                    {downloadingId === sig.id
                      ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: C.slate500 }} />
                      : <Download className="w-4 h-4" style={{ color: C.slate500 }} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview modal */}
      {previewSig && (
        <div
          onClick={() => setPreviewSig(null)}
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
              backgroundColor: C.white, borderRadius: "12px",
              maxWidth: "780px", width: "100%", maxHeight: "90vh",
              display: "flex", flexDirection: "column",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid " + C.slate200, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>
                  {previewSig.template?.name ?? "Agreement"}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
                  Signed {formatDate(previewSig.signed_at)} · v{previewSig.template_version ?? "—"}
                </p>
              </div>
              <button
                onClick={() => setPreviewSig(null)}
                className="p-2 rounded-lg hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-4 h-4" style={{ color: C.slate500 }} />
              </button>
            </div>
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {previewContent === null
                ? <Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: C.teal500 }} />
                : previewContent === ""
                  ? <p className="text-sm" style={{ color: C.slate400 }}>Could not load content.</p>
                  : <AgreementBody content={previewContent} />
              }
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid " + C.slate200, backgroundColor: "#f8fafc", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => downloadSignaturePdf(previewSig)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: C.teal500 }}
              >
                <Download className="w-3.5 h-3.5" /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 shadow-lg flex items-center gap-2 text-sm font-medium text-white"
          style={{ backgroundColor: toast.type === "success" ? C.green500 : C.red500 }}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
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

// Surface unused-import-clean: ConsentSignature used as type only via shape
// of SignatureRow. Keeping explicit import is unnecessary.
export type { ConsentSignature };
