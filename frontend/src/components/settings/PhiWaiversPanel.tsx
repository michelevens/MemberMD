// ===== PhiWaiversPanel =====
//
// Practice Settings → Compliance tab section. Lists patients who
// have NOT granted an ePHI communication waiver (and therefore
// won't receive PHI-bearing notifications). Practice admin can
// record consent per-patient when collected verbally / on paper.
//
// Deliberately does NOT include a "Grant for All Patients" bulk
// button — that isn't a valid waiver under HIPAA. Each consent
// must be granted per patient with a real basis.

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { apiFetch } from "../../lib/api";

interface PendingPatient {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  amber800: "#92400e",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  white: "#ffffff",
};

export function PhiWaiversPanel() {
  const [rows, setRows] = useState<PendingPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<PendingPatient[]>("/practice/phi-waivers/pending");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grant = async (patientId: string) => {
    if (!confirm("Confirm: this patient has consented (verbally, on paper, or via signed waiver) to receive electronic communications that may contain PHI. This action is logged.")) {
      return;
    }
    setGrantingId(patientId);
    try {
      const res = await apiFetch(`/practice/phi-waivers/${patientId}`, { method: "POST" });
      if (res.error) {
        setError(res.error);
      } else {
        // Optimistic — remove the row from the list
        setRows((prev) => prev.filter((r) => r.id !== patientId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setGrantingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.slate400 }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4 flex items-start gap-3"
        style={{ backgroundColor: C.amber50, borderColor: "#fde68a" }}
      >
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: C.amber500 }} />
        <div className="text-xs" style={{ color: C.amber800 }}>
          <p className="font-semibold mb-1">Why this list exists</p>
          <p>
            HIPAA requires patient consent before sending unencrypted electronic communications that
            contain protected health information. The patients below have NOT yet granted consent and
            will <strong>not</strong> receive notifications flagged "Contains PHI" (appointment
            confirmations, billing line items, etc.). They will still receive non-PHI emails like
            password resets.
          </p>
          <p className="mt-2">
            Record consent here only when the patient has consented in person, on paper, or through
            a signed waiver. Do not record consent on a patient's behalf.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm" style={{ color: "#7f1d1d" }}>
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center" style={{ borderColor: C.slate200 }}>
          <ShieldCheck className="w-8 h-8 mx-auto mb-2" style={{ color: C.teal500 }} />
          <p className="text-sm font-semibold" style={{ color: C.navy900 }}>
            All patients have granted consent
          </p>
          <p className="text-xs mt-1" style={{ color: C.slate500 }}>
            Every active patient in this practice is opted in to receive ePHI communications.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: C.slate200 }}>
          <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: C.slate200, backgroundColor: C.slate100 }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.slate500 }}>
              {rows.length} patient{rows.length === 1 ? "" : "s"} pending
            </span>
            <button
              onClick={load}
              className="text-xs font-medium"
              style={{ color: C.teal600 }}
            >
              Refresh
            </button>
          </div>
          <ul className="divide-y" style={{ borderColor: C.slate100 }}>
            {rows.map((p) => {
              const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "Patient";
              return (
                <li key={p.id} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: C.navy900 }}>
                      {fullName}
                    </p>
                    <p className="text-xs truncate" style={{ color: C.slate500 }}>
                      {p.email ?? "(no email on file)"}
                    </p>
                  </div>
                  <button
                    onClick={() => grant(p.id)}
                    disabled={grantingId === p.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: C.teal500 }}
                  >
                    {grantingId === p.id ? "Recording…" : "Record consent"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
