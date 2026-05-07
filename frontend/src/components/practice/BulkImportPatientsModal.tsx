// ===== BulkImportPatientsModal =====
//
// CSV upload UI for bulk patient import. Backend endpoint:
//   POST /api/patients/bulk-import
// Accepts either { csv: string } or { rows: Array<...> }; we send
// the raw CSV string and let the server parse — keeps frontend
// payload tiny and the CSV parsing logic in one place.
//
// Used by:
//   - Operators onboarding a new clinic with N existing patients
//   - Practices migrating off another platform
//
// What we expose:
//   - Drag-and-drop or file-picker for the CSV
//   - Preview of first 5 rows before import
//   - "Download template" link with required columns
//   - Result summary: created / updated / skipped + per-row errors

import { useState } from "react";
import { Upload, X, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { apiFetch } from "../../lib/api";

const REQUIRED_COLUMNS = ["first_name", "last_name", "email", "date_of_birth"];
const TEMPLATE_CSV =
  "first_name,last_name,email,date_of_birth,phone,gender,preferred_name,preferred_language\n" +
  "Jane,Doe,jane@example.com,1990-04-15,555-0100,female,Janie,English\n" +
  "John,Smith,john@example.com,1985-11-22,555-0101,male,,English\n";

interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; email: string | null; reason: string }>;
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export function BulkImportPatientsModal({ onClose, onImported }: Props) {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a .csv file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large (5MB max).");
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFilename(file.name);
    // Preview first 5 data rows + header for visual sanity check.
    const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim());
    const rows = lines.slice(0, 6).map((l) => l.split(",").map((c) => c.trim()));
    setPreview(rows);

    // Surface header check up front so the user fixes the file
    // before submitting instead of waiting for backend errors.
    if (rows.length > 0) {
      const header = rows[0].map((h) => h.toLowerCase());
      const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
      if (missing.length > 0) {
        setError(`Missing required columns: ${missing.join(", ")}. Download the template for the expected format.`);
      }
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "patient_import_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<ImportSummary>("/patients/bulk-import", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setSummary(res.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (summary && summary.created + summary.updated > 0) {
      onImported();
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(16,42,67,0.55)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Bulk import patients</h3>
            <p className="text-xs mt-1 text-slate-500">
              Upload a CSV with patient demographics. Required columns:{" "}
              <span className="font-mono text-slate-700">{REQUIRED_COLUMNS.join(", ")}</span>.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Result panel — shown after successful import call */}
        {summary && (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-900">Import complete</p>
                <p className="text-xs text-green-700 mt-0.5">
                  {summary.created} created · {summary.updated} updated · {summary.skipped} skipped
                </p>
              </div>
            </div>

            {summary.errors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-900">
                    {summary.errors.length} row{summary.errors.length === 1 ? "" : "s"} skipped
                  </p>
                </div>
                <ul className="space-y-1.5 text-xs text-amber-800 max-h-40 overflow-y-auto">
                  {summary.errors.map((err, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-mono text-amber-700 flex-shrink-0">Row {err.row}</span>
                      <span className="text-amber-700">·</span>
                      <span className="font-mono text-amber-700 flex-shrink-0 truncate max-w-[180px]">
                        {err.email ?? "—"}
                      </span>
                      <span className="text-amber-700">·</span>
                      <span className="flex-1">{err.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: "#27ab83" }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Upload UI — hidden once we have a result */}
        {!summary && (
          <div className="px-6 py-5 space-y-4">
            <button
              onClick={downloadTemplate}
              className="text-xs font-semibold text-teal-600 hover:text-teal-700 underline"
            >
              Download CSV template
            </button>

            {!csv && (
              <label
                className="flex flex-col items-center gap-3 p-10 border-2 border-dashed border-slate-300 rounded-xl text-center hover:border-teal-400 hover:bg-teal-50/30 transition-colors cursor-pointer"
              >
                <Upload className="w-8 h-8 text-slate-400" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">Click to upload CSV</p>
                  <p className="text-xs text-slate-500 mt-1">Up to 1000 rows · 5MB max</p>
                </div>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </label>
            )}

            {csv && filename && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
                <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{filename}</p>
                  <p className="text-xs text-slate-500">
                    {preview ? `${preview.length - 1} preview rows` : ""}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCsv("");
                    setFilename(null);
                    setPreview(null);
                    setError(null);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded"
                >
                  Replace
                </button>
              </div>
            )}

            {preview && preview.length > 0 && !error && (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  Preview
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white">
                        {preview[0].map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-100">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(1).map((row, i) => (
                        <tr key={i} className="border-b border-slate-50">
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-1.5 text-slate-600 truncate max-w-[140px]">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-800">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!csv || submitting || Boolean(error)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#27ab83" }}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Import patients
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
