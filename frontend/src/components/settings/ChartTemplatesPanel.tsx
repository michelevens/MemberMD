// ===== ChartTemplatesPanel =====
//
// Practice Settings → Chart Templates tab. The admin surface for the
// templates that drive encounter authoring.
//
//   System row (locked):  "Use as starting point" — POST /clone
//                         (creates a tenant-owned editable copy)
//   Tenant row (custom):   "Edit" — inline structure editor
//   Tenant row (custom):   "Deactivate" — soft delete
//
// We deliberately stop short of a full-blown form designer for now —
// the editor exposes name / description / visit_type and a basic
// section + field grid. Power users can clone an existing template
// and tweak; bespoke designs ship in a follow-up.

import { useEffect, useMemo, useState } from "react";
import {
  FileText, Copy, Pencil, Trash2, Loader2, Lock, X, Save, AlertCircle, Plus,
} from "lucide-react";
import { chartTemplateService } from "../../lib/api";
import type { ChartTemplate, ChartTemplateField } from "../../lib/api";

const C = {
  navy900: "#102a43",
  navy700: "#334e68",
  teal500: "#27ab83",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate700: "#334155",
  red500: "#ef4444",
  amber700: "#92400e",
};

const FIELD_TYPES: Array<{ value: ChartTemplateField["type"]; label: string }> = [
  { value: "text", label: "Single-line text" },
  { value: "textarea", label: "Long-form text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown (one of)" },
  { value: "checkbox", label: "Single checkbox" },
  { value: "checkbox_group", label: "Checkbox group (any of)" },
  { value: "radio", label: "Radio (one of)" },
  { value: "date", label: "Date" },
  { value: "vitals", label: "Vitals (uses dedicated widget)" },
];

const VISIT_TYPES = [
  { value: "wellness", label: "Wellness / preventive" },
  { value: "acute", label: "Acute" },
  { value: "chronic", label: "Chronic" },
  { value: "procedure", label: "Procedure" },
  { value: "followup", label: "Follow-up" },
];

export function ChartTemplatesPanel() {
  const [templates, setTemplates] = useState<ChartTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChartTemplate | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    const res = await chartTemplateService.list();
    if (res.error) setError(res.error);
    else if (res.data) setTemplates(res.data);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const grouped = useMemo(() => {
    // Two groups: system templates (read-only starters) and the
    // practice's own forks/customs.
    const sys = templates.filter((t) => t.isSystem);
    const own = templates.filter((t) => !t.isSystem);
    return { sys, own };
  }, [templates]);

  const handleClone = async (id: string) => {
    setBusyId(id);
    const res = await chartTemplateService.clone(id);
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reload();
    if (res.data) setEditing(res.data);
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm("Deactivate this template? Existing encounters keep their data.")) return;
    setBusyId(id);
    const res = await chartTemplateService.deactivate(id);
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reload();
  };

  const handleSaved = async () => {
    setEditing(null);
    await reload();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading chart templates…
      </div>
    );
  }

  if (editing) {
    return (
      <ChartTemplateEditor
        template={editing}
        onCancel={() => setEditing(null)}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Chart Templates</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Templates control the editor layout when authoring an encounter. System starters
              are read-only — clone one to customize for your practice.
            </p>
          </div>
          <button
            onClick={() => setEditing({
              id: "", tenantId: null, name: "", description: "", visitType: "followup",
              fields: [], isActive: true, isSystem: false, sortOrder: 100,
            })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: "#635bff" }}
          >
            <Plus className="w-3.5 h-3.5" /> New blank template
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      <Section title="Your custom templates" emptyHint="Clone a system template below to start customizing." rows={grouped.own}>
        {(t) => (
          <TemplateRow
            key={t.id}
            template={t}
            busy={busyId === t.id}
            onEdit={() => setEditing(t)}
            onDeactivate={() => handleDeactivate(t.id)}
          />
        )}
      </Section>

      <Section title="System starters" rows={grouped.sys}>
        {(t) => (
          <TemplateRow
            key={t.id}
            template={t}
            busy={busyId === t.id}
            onClone={() => handleClone(t.id)}
          />
        )}
      </Section>
    </div>
  );
}

function Section({
  title, emptyHint, rows, children,
}: {
  title: string;
  emptyHint?: string;
  rows: ChartTemplate[];
  children: (t: ChartTemplate) => React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{title}</h4>
      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-400 text-center">
            {emptyHint ?? "None yet."}
          </div>
        ) : (
          rows.map((t) => children(t))
        )}
      </div>
    </div>
  );
}

function TemplateRow({
  template, busy, onEdit, onDeactivate, onClone,
}: {
  template: ChartTemplate;
  busy: boolean;
  onEdit?: () => void;
  onDeactivate?: () => void;
  onClone?: () => void;
}) {
  return (
    <div className="px-4 py-3 border-b border-slate-100 last:border-0 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <FileText className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-800 text-sm">{template.name}</span>
            {template.isSystem && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600">
                <Lock className="w-2.5 h-2.5" /> System
              </span>
            )}
            {template.visitType && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700">
                {template.visitType}
              </span>
            )}
            <span className="text-[10px] text-slate-400">
              {template.fields.length} field{template.fields.length === 1 ? "" : "s"}
            </span>
          </div>
          {template.description && (
            <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{template.description}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        {onClone && !busy && (
          <button
            onClick={onClone}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <Copy className="w-3 h-3" /> Use as starting point
          </button>
        )}
        {onEdit && !busy && (
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
        {onDeactivate && !busy && (
          <button
            onClick={onDeactivate}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-3 h-3" /> Deactivate
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Editor ─────────────────────────────────────────────────────────────────

function ChartTemplateEditor({
  template, onCancel, onSaved,
}: {
  template: ChartTemplate;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isNew = !template.id;
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [visitType, setVisitType] = useState(template.visitType ?? "followup");
  const [fields, setFields] = useState<ChartTemplateField[]>([...template.fields]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (idx: number, patch: Partial<ChartTemplateField>) => {
    setFields((arr) => arr.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };
  const removeField = (idx: number) => {
    setFields((arr) => arr.filter((_, i) => i !== idx));
  };
  const addField = () => {
    const id = `field_${Date.now().toString(36)}`;
    setFields((arr) => [
      ...arr,
      { id, label: "Untitled field", type: "text", options: null, required: false, section: "General", unit: null, referenceRange: null },
    ]);
  };
  const move = (idx: number, dir: -1 | 1) => {
    setFields((arr) => {
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) { setError("Template name is required."); return; }
    if (fields.length === 0) { setError("Add at least one field."); return; }
    setSaving(true);
    const payload: Partial<ChartTemplate> = {
      name: name.trim(),
      description: description.trim() || null,
      visitType,
      fields: fields.map((f) => ({
        ...f,
        // Ensure options is a clean array or null (the validator accepts both).
        options: Array.isArray(f.options) && f.options.length > 0 ? f.options : null,
      })),
    };
    const res = isNew
      ? await chartTemplateService.create(payload)
      : await chartTemplateService.update(template.id, payload);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onSaved();
  };

  // Group fields by section for the lite preview / nicer layout.
  const sectionsInOrder = useMemo(() => {
    const seen: string[] = [];
    for (const f of fields) {
      if (!seen.includes(f.section || "General")) seen.push(f.section || "General");
    }
    return seen;
  }, [fields]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-700 mb-1 inline-flex items-center gap-1">
            <X className="w-3 h-3" /> Back to templates
          </button>
          <h3 className="text-base font-semibold text-slate-900">
            {isNew ? "New Chart Template" : `Edit: ${template.name}`}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#635bff" }}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white border border-slate-200 rounded-lg p-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Name *</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Description</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short note shown in the picker — when to use this template."
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Visit Type</label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={visitType}
            onChange={(e) => setVisitType(e.target.value)}
          >
            {VISIT_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          <div className="text-[10px] text-slate-400 mt-1">
            Determines which encounter types auto-pick this template.
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Fields ({fields.length})
          </h4>
          <button
            onClick={addField}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Plus className="w-3 h-3" /> Add field
          </button>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {fields.length === 0 && (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">No fields yet — add one to get started.</div>
          )}
          {fields.map((f, idx) => (
            <FieldRow
              key={`${f.id}-${idx}`}
              field={f}
              index={idx}
              total={fields.length}
              onPatch={(p) => updateField(idx, p)}
              onRemove={() => removeField(idx)}
              onMove={(dir) => move(idx, dir)}
            />
          ))}
        </div>
        {sectionsInOrder.length > 1 && (
          <div className="text-[10px] text-slate-400 mt-2">
            Sections (in order): {sectionsInOrder.join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  field, index, total, onPatch, onRemove, onMove,
}: {
  field: ChartTemplateField;
  index: number;
  total: number;
  onPatch: (p: Partial<ChartTemplateField>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const needsOptions = field.type === "select" || field.type === "radio" || field.type === "checkbox_group";
  const optionsText = (field.options ?? []).join("\n");

  return (
    <div className="px-3 py-3 grid grid-cols-12 gap-2 items-start">
      <div className="col-span-12 md:col-span-3">
        <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-0.5">Label *</label>
        <input
          className="w-full border rounded px-2 py-1.5 text-sm"
          value={field.label}
          onChange={(e) => onPatch({ label: e.target.value })}
        />
      </div>
      <div className="col-span-6 md:col-span-2">
        <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-0.5">Section</label>
        <input
          className="w-full border rounded px-2 py-1.5 text-sm"
          value={field.section}
          onChange={(e) => onPatch({ section: e.target.value })}
        />
      </div>
      <div className="col-span-6 md:col-span-2">
        <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-0.5">Type</label>
        <select
          className="w-full border rounded px-2 py-1.5 text-sm"
          value={field.type}
          onChange={(e) => onPatch({ type: e.target.value as ChartTemplateField["type"] })}
        >
          {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
        </select>
      </div>
      <div className="col-span-12 md:col-span-3">
        {needsOptions ? (
          <>
            <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-0.5">Options (one per line)</label>
            <textarea
              rows={2}
              className="w-full border rounded px-2 py-1.5 text-sm font-mono"
              value={optionsText}
              onChange={(e) => onPatch({ options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
            />
          </>
        ) : field.type === "number" ? (
          <>
            <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-0.5">Unit (optional)</label>
            <input
              className="w-full border rounded px-2 py-1.5 text-sm"
              placeholder="e.g. mmHg, lbs"
              value={field.unit ?? ""}
              onChange={(e) => onPatch({ unit: e.target.value || null })}
            />
          </>
        ) : (
          <div className="text-[10px] text-slate-400 mt-5">No type-specific options.</div>
        )}
      </div>
      <div className="col-span-12 md:col-span-2 flex items-end gap-1 justify-end">
        <label className="inline-flex items-center gap-1 text-xs text-slate-600 mr-2">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onPatch({ required: e.target.checked })}
            className="rounded border-slate-300"
          />
          Required
        </label>
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className="px-1.5 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          title="Move up"
        >↑</button>
        <button
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          className="px-1.5 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          title="Move down"
        >↓</button>
        <button
          onClick={onRemove}
          className="px-1.5 py-1 rounded text-xs text-red-600 hover:bg-red-50"
          title="Remove field"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// `C` colour map kept for parity with sibling panels even though the
// inline classNames cover most shades — tree-shaking drops it.
void C;
