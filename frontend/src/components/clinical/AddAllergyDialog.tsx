// ===== AddAllergyDialog =====
// Structured allergy capture for a patient. Updates the existing
// patients.allergies (encrypted:array) column via PUT /patients/:id —
// no new backend tables. Adapted from EnnHealth's AddAllergyDialog
// shape so the data model matches if/when EnnHealth ports MemberMD's
// encrypted-at-rest pattern.

import { useState } from "react";
import { AlertCircle, X, Loader2 } from "lucide-react";
import { patientService } from "../../lib/api";

export interface AllergyEntry {
  allergen: string;
  reaction: string;
  severity: "mild" | "moderate" | "severe";
  date_identified?: string;
  notes?: string;
}

interface AddAllergyDialogProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  /** Current allergies array on the patient (decrypted). */
  existingAllergies: AllergyEntry[];
  /** Called with the merged list after a successful save. */
  onSaved: (allergies: AllergyEntry[]) => void;
}

export function AddAllergyDialog({
  open,
  onClose,
  patientId,
  patientName,
  existingAllergies,
  onSaved,
}: AddAllergyDialogProps) {
  const [allergen, setAllergen] = useState("");
  const [reaction, setReaction] = useState("");
  const [severity, setSeverity] = useState<AllergyEntry["severity"]>("moderate");
  const [dateIdentified, setDateIdentified] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setAllergen("");
    setReaction("");
    setSeverity("moderate");
    setDateIdentified("");
    setNotes("");
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (!allergen.trim()) { setError("Allergen is required"); return; }
    if (!reaction.trim()) { setError("Describe the reaction"); return; }

    setSaving(true);
    setError(null);

    const newEntry: AllergyEntry = {
      allergen: allergen.trim(),
      reaction: reaction.trim(),
      severity,
      ...(dateIdentified ? { date_identified: dateIdentified } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    // Append to the existing list — patients.allergies is an array
    // and we don't have a single-allergy endpoint. The backend
    // encrypted:array cast handles serialization.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged = [...(existingAllergies || []), newEntry];

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await patientService.update(patientId, { allergies: merged } as any);
      if (res.error) {
        setError(res.error);
        return;
      }
      onSaved(merged);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save allergy");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(8px)" }} onClick={close}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200/60 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Add Allergy</h3>
              <p className="text-xs text-slate-500">For {patientName}</p>
            </div>
          </div>
          <button
            onClick={close}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Allergen *</label>
            <input
              autoFocus
              value={allergen}
              onChange={(e) => setAllergen(e.target.value)}
              placeholder="e.g. Penicillin, Peanuts, Latex"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Reaction *</label>
            <input
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
              placeholder="e.g. Hives, Anaphylaxis, Difficulty breathing"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as AllergyEntry["severity"])}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Date identified</label>
              <input
                type="date"
                value={dateIdentified}
                onChange={(e) => setDateIdentified(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional context — onset, prior treatments, related conditions"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={close}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving…" : "Add Allergy"}
          </button>
        </div>
      </div>
    </div>
  );
}
