// ===== AddMeasureDialog =====
// Administer an outcome measure (PHQ-9, GAD-7, PCL-5, etc.) for a patient.
// Renders the chosen template's questions with radio buttons, computes a
// running total client-side as a preview, and submits to POST /screenings.
// Backend recomputes score + severity from scoring_ranges on the template
// — frontend math is illustrative only, never authoritative.

import { useEffect, useState } from "react";
import { Activity, X, Loader2, ChevronLeft } from "lucide-react";
import { screeningService } from "../../lib/api";

// Backend ScreeningTemplate.questions is jsonb. We expect each question to
// have a prompt and an array of {label, value} options. Defensive: shape
// can drift since the column is JSON.
interface TemplateQuestion {
  prompt?: string;
  question?: string;
  text?: string;
  options?: Array<{ label?: string; value?: number | string; text?: string }>;
}

interface ScreeningTemplate {
  id: string;
  name: string;
  code?: string;
  description?: string | null;
  questions?: TemplateQuestion[];
}

interface AddMeasureDialogProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  /** Optional encounter to attach the screening to. */
  encounterId?: string | null;
  onSaved: () => void;
}

export function AddMeasureDialog({
  open,
  onClose,
  patientId,
  patientName,
  encounterId,
  onSaved,
}: AddMeasureDialogProps) {
  const [step, setStep] = useState<"pick" | "fill">("pick");
  const [templates, setTemplates] = useState<ScreeningTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selected, setSelected] = useState<ScreeningTemplate | null>(null);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load template list when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setTemplatesLoading(true);
      const res = await screeningService.listTemplates();
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = Array.isArray(res.data) ? res.data : (res.data as any)?.data || [];
      setTemplates(list);
      setTemplatesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const reset = () => {
    setStep("pick");
    setSelected(null);
    setAnswers([]);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickTemplate = (t: ScreeningTemplate) => {
    setSelected(t);
    setAnswers(new Array(t.questions?.length ?? 0).fill(null));
    setStep("fill");
    setError(null);
  };

  const setAnswer = (idx: number, value: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  // Live preview of the score — backend recomputes authoritatively.
  const previewScore = answers.reduce<number>(
    (sum, a) => (typeof a === "number" ? sum + a : sum),
    0,
  );
  const allAnswered = answers.length > 0 && answers.every((a) => typeof a === "number");

  const submit = async () => {
    if (!selected) return;
    if (!allAnswered) {
      setError("Please answer every question before submitting.");
      return;
    }
    setSaving(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      patient_id: patientId,
      template_id: selected.id,
      answers: answers.map((value) => ({ value })),
      ...(encounterId ? { encounter_id: encounterId } : {}),
    };
    const res = await screeningService.submitResponse(payload);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onSaved();
    close();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(8px)" }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200/60 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {step === "fill" && (
              <button
                onClick={() => setStep("pick")}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Back to template list"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {step === "pick" ? "Administer Screening" : selected?.name || "Screening"}
              </h3>
              <p className="text-xs text-slate-500">
                {step === "pick" ? `Choose a measure for ${patientName}` : `For ${patientName}`}
              </p>
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
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 mb-4">
              {error}
            </div>
          )}

          {step === "pick" && (
            <>
              {templatesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                </div>
              ) : templates.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-500">No screening templates available yet.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Templates are seeded per practice — contact support if this is unexpected.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => pickTemplate(t)}
                      className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                          {t.code && (
                            <p className="text-xs text-slate-400 mt-0.5 font-mono">{t.code}</p>
                          )}
                          {t.description && (
                            <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{t.description}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">
                          {t.questions?.length ?? 0} {t.questions?.length === 1 ? "item" : "items"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "fill" && selected && (
            <>
              {selected.description && (
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">{selected.description}</p>
              )}
              <div className="space-y-5">
                {(selected.questions || []).map((q, qi) => {
                  const prompt = q.prompt ?? q.question ?? q.text ?? `Question ${qi + 1}`;
                  const options = q.options ?? [];
                  const currentAnswer = answers[qi];
                  return (
                    <div key={qi} className="rounded-xl border border-slate-200 p-4">
                      <p className="text-sm font-medium text-slate-800 mb-3">
                        <span className="text-xs text-slate-400 mr-2">{qi + 1}.</span>
                        {prompt}
                      </p>
                      <div className="space-y-1.5">
                        {options.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">
                            This question has no options configured.
                          </p>
                        ) : (
                          options.map((opt, oi) => {
                            const value = typeof opt.value === "number"
                              ? opt.value
                              : Number(opt.value ?? 0);
                            const label = opt.label ?? opt.text ?? String(value);
                            const isSelected = currentAnswer === value;
                            return (
                              <label
                                key={oi}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                  isSelected
                                    ? "bg-teal-50 border border-teal-200"
                                    : "border border-transparent hover:bg-slate-50"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`q-${qi}`}
                                  checked={isSelected}
                                  onChange={() => setAnswer(qi, value)}
                                  className="accent-teal-600"
                                />
                                <span className={`text-sm ${isSelected ? "text-teal-900 font-medium" : "text-slate-700"}`}>
                                  {label}
                                </span>
                                <span className="ml-auto text-xs text-slate-400 font-mono">{value}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 flex items-center justify-between shrink-0">
          {step === "fill" && (
            <div className="text-xs text-slate-500">
              Running total: <span className="font-bold text-slate-800">{previewScore}</span>
              <span className="text-slate-400 ml-2">(backend recomputes severity on save)</span>
            </div>
          )}
          {step === "pick" && <div />}
          <div className="flex items-center gap-2">
            <button
              onClick={close}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            {step === "fill" && (
              <button
                onClick={submit}
                disabled={saving || !allAnswered}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? "Saving…" : "Submit Screening"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
