// ===== AIDocumentationAssistant =====
// Template-based SOAP note scaffold. Adapted from EnnHealth's
// AIDocumentationAssistant — pure local logic, no LLM API key
// required for v1.
//
// The provider answers a few quick prompts (presenting concern,
// interventions, patient response, risk factors) and the component
// generates draft SOAP fields the provider can review, edit, and
// insert into the encounter editor. Backend recomputes nothing —
// this is a pure UX helper that fills the textareas.
//
// Naming + tone is "Documentation Assistant" deliberately: it is
// NOT real AI, and we shouldn't market it as one. Future v2 may
// swap the local generator for an LLM call gated by a per-practice
// opt-in.

import { useState } from "react";
import { Sparkles, X, Copy, Check, Wand2, Loader2, AlertCircle } from "lucide-react";

interface SoapDraft {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

interface SessionContext {
  sessionType: string;
  presentingConcern: string;
  interventionsUsed: string;
  patientResponse: string;
  riskFactors: string;
}

const SESSION_TYPES = [
  "Office Visit",
  "Follow-Up",
  "Telehealth",
  "Annual Wellness",
  "Urgent",
  "Initial Evaluation",
  "Med Management",
];

/**
 * Pure-template SOAP draft generator. No network calls, no LLM. The
 * output is intentionally generic clinical scaffolding — the provider
 * still has to edit it. EnnHealth ships the same pattern; we mirror
 * it so the data shape matches if a customer migrates between products.
 */
function generateSoapDraft(ctx: SessionContext): SoapDraft {
  const sessionLower = ctx.sessionType.toLowerCase();
  const concern = ctx.presentingConcern.trim();
  const interventions = ctx.interventionsUsed.trim();
  const response = ctx.patientResponse.trim();
  const risks = ctx.riskFactors.trim();

  return {
    subjective: concern
      ? `Patient presents for ${sessionLower}. ${concern}${risks ? ` Risk factors noted: ${risks}.` : ""}`
      : `Patient presents for scheduled ${sessionLower} appointment. Reports stable status without new complaints.`,

    objective: response
      ? `During the visit, the following was observed: ${response}`
      : "Patient appears in no acute distress. Vital signs within normal limits. Affect appropriate. Cooperative with examination. Speech normal in rate and rhythm.",

    assessment: concern
      ? `Patient is engaged in care${response && /progress|improv/i.test(response) ? " and demonstrating progress" : ""}. ${concern.length > 0 ? `Primary focus: ${concern.split(".")[0].toLowerCase()}.` : ""}`.trim()
      : "Patient continues to make progress toward identified treatment goals. No acute findings.",

    plan: [
      `Continue ${sessionLower}.`,
      interventions ? `Reinforce ${interventions.split(",")[0].trim().toLowerCase()}.` : "Continue current treatment approach.",
      risks ? "Continue to monitor risk factors and maintain safety planning." : "Schedule routine follow-up.",
    ].filter(Boolean).join(" "),
  };
}

interface AIDocumentationAssistantProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called when the provider clicks "Insert into note." Receives the
   * full SOAP draft. Caller wires this to the encounter editor's
   * setSoapForm or equivalent.
   */
  onInsert: (draft: SoapDraft) => void;
  /** Optional default — defaults to "Office Visit" if omitted. */
  defaultSessionType?: string;
}

export function AIDocumentationAssistant({
  open,
  onClose,
  onInsert,
  defaultSessionType = "Office Visit",
}: AIDocumentationAssistantProps) {
  const [context, setContext] = useState<SessionContext>({
    sessionType: defaultSessionType,
    presentingConcern: "",
    interventionsUsed: "",
    patientResponse: "",
    riskFactors: "",
  });
  const [draft, setDraft] = useState<SoapDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copiedField, setCopiedField] = useState<keyof SoapDraft | null>(null);

  const reset = () => {
    setContext({
      sessionType: defaultSessionType,
      presentingConcern: "",
      interventionsUsed: "",
      patientResponse: "",
      riskFactors: "",
    });
    setDraft(null);
    setGenerating(false);
    setCopiedField(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const generate = async () => {
    setGenerating(true);
    // Simulate a brief delay so the "generating" state is visible —
    // entirely cosmetic, the function is synchronous.
    await new Promise((r) => setTimeout(r, 600));
    setDraft(generateSoapDraft(context));
    setGenerating(false);
  };

  const updateField = (field: keyof SoapDraft, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const copyField = async (field: keyof SoapDraft) => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft[field]);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
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
        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-200/60 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center shrink-0 text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Documentation Assistant</h3>
              <p className="text-xs text-slate-500">Generate a draft SOAP note from quick session notes</p>
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
          {/* Honest disclaimer — this is a template, not real AI. */}
          <div className="mb-5 p-3 rounded-lg flex items-start gap-2.5 bg-amber-50 border border-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Template-based draft, not AI-generated.</strong> Output is
              boilerplate scaffolding from your quick notes. Always review and
              edit before signing — clinical judgment is the provider's, not the
              tool's.
            </p>
          </div>

          {!draft ? (
            // ─── Step 1: Quick session notes ─────────────────────────────
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Session type</label>
                  <select
                    value={context.sessionType}
                    onChange={(e) => setContext({ ...context, sessionType: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {SESSION_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Presenting concern</label>
                <textarea
                  rows={2}
                  value={context.presentingConcern}
                  onChange={(e) => setContext({ ...context, presentingConcern: e.target.value })}
                  placeholder="e.g. Patient reports increased anxiety this week, sleep disrupted"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Interventions used</label>
                <textarea
                  rows={2}
                  value={context.interventionsUsed}
                  onChange={(e) => setContext({ ...context, interventionsUsed: e.target.value })}
                  placeholder="e.g. CBT for anxiety, breathing exercises, medication review"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Patient response</label>
                <textarea
                  rows={2}
                  value={context.patientResponse}
                  onChange={(e) => setContext({ ...context, patientResponse: e.target.value })}
                  placeholder="e.g. Receptive to feedback, demonstrated progress with breathing exercises"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Risk factors (optional)</label>
                <textarea
                  rows={2}
                  value={context.riskFactors}
                  onChange={(e) => setContext({ ...context, riskFactors: e.target.value })}
                  placeholder="e.g. None reported. OR: passive SI without plan, denied homicidal ideation"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
                />
              </div>
            </div>
          ) : (
            // ─── Step 2: Edit the draft ──────────────────────────────────
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Edit any section, copy individual fields, or insert the whole draft into your encounter.
              </p>
              {(
                [
                  ["subjective", "S — Subjective", "#27ab83"],
                  ["objective", "O — Objective", "#334e68"],
                  ["assessment", "A — Assessment", "#d97706"],
                  ["plan", "P — Plan", "#147d64"],
                ] as Array<[keyof SoapDraft, string, string]>
              ).map(([key, label, color]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color }}
                    >
                      {label}
                    </label>
                    <button
                      onClick={() => copyField(key)}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      {copiedField === key ? (
                        <><Check className="w-3 h-3" /> Copied</>
                      ) : (
                        <><Copy className="w-3 h-3" /> Copy</>
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={draft[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
          {!draft ? (
            <>
              <button
                onClick={close}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={generating}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-teal-700 hover:opacity-90 disabled:opacity-60"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {generating ? "Generating…" : "Generate draft"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setDraft(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Back to notes
              </button>
              <button
                onClick={() => { onInsert(draft); close(); }}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700"
              >
                <Check className="w-4 h-4" />
                Insert into note
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
