// ===== AgreementEditor =====
// Practice-admin tab for managing consent + membership-agreement templates.
// Lists tenant-customized templates and platform templates the admin can
// fork+edit. Markdown editor with live preview. "Publish version" creates
// a new versioned row and supersedes the prior one — existing signatures
// stay locked to their version.

import { useEffect, useState } from "react";
import {
  FileText, Edit3, Eye, Plus, Save, AlertCircle, CheckCircle2,
  GitBranch, Shield, X, Loader2, Layers,
} from "lucide-react";
import { consentService } from "../../lib/api";
import { AgreementBody } from "../shared/AgreementBody";

// ─── Colors (match PracticeSettings) ──────────────────────────────────────

const C = {
  navy900: "#102a43",
  navy800: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  red500: "#ef4444",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  green500: "#22c55e",
  green50: "#dcfce7",
};

// Backend response shape (snake_case from Laravel; we don't use the
// frontend ConsentTemplate type because it's missing fields).
interface BackendTemplate {
  id: string;
  tenant_id: string | null;
  parent_template_id?: string | null;
  name: string;
  description: string | null;
  type: string;
  slug: string | null;
  content: string;
  is_required: boolean;
  display_order: number;
  version: string;
  is_active: boolean;
  effective_at?: string | null;
  superseded_at?: string | null;
}

export function AgreementEditor() {
  const [tenantTemplates, setTenantTemplates] = useState<BackendTemplate[]>([]);
  const [platformTemplates, setPlatformTemplates] = useState<BackendTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BackendTemplate | null>(null);
  const [previewing, setPreviewing] = useState<BackendTemplate | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await consentService.listTemplates();
      if (!res.data) throw new Error(res.error ?? "Could not load templates");
      const tenant = (res.data.tenant as unknown as BackendTemplate[]) ?? [];
      const platform = (res.data.platform_available_to_fork as unknown as BackendTemplate[]) ?? [];
      setTenantTemplates(tenant);
      setPlatformTemplates(platform);
    } catch (e) {
      setError((e as Error).message ?? "Could not load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // ─── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.teal500 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl border" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
        <p className="text-sm" style={{ color: C.red500 }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold" style={{ color: C.navy900 }}>
            Agreements & Consents
          </h2>
          <p className="text-sm mt-1" style={{ color: C.slate500 }}>
            Manage the agreements patients sign during enrollment and the consent forms in the chart.
            Edits save immediately. Use <strong>Publish new version</strong> for material changes
            so existing signed copies stay locked to their version.
          </p>
        </div>
      </div>

      {/* Tenant templates */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: C.navy800 }}>
          <Layers className="w-4 h-4" /> Your templates
        </h3>
        {tenantTemplates.length === 0 ? (
          <div className="rounded-xl border p-6 text-center" style={{ borderColor: C.slate200, backgroundColor: C.slate50 }}>
            <p className="text-sm" style={{ color: C.slate500 }}>
              You haven't customized any templates yet. Fork a platform template below to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tenantTemplates.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                isFork={false}
                onEdit={() => setEditing(t)}
                onPreview={() => setPreviewing(t)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Platform templates available to fork */}
      {platformTemplates.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: C.navy800 }}>
            <Shield className="w-4 h-4" /> Platform defaults (fork to customize)
          </h3>
          <div className="space-y-2">
            {platformTemplates.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                isFork={true}
                onEdit={() => setEditing({ ...t, parent_template_id: t.id, tenant_id: null })}
                onPreview={() => setPreviewing(t)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <TemplateEditModal
          template={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload, asNewVersion) => {
            try {
              if (editing.parent_template_id && !editing.tenant_id) {
                // Forking a platform template — POST creates a tenant copy
                const res = await consentService.createTemplate({
                  ...payload,
                  parent_template_id: editing.parent_template_id,
                  type: editing.type,
                });
                if (res.error) throw new Error(res.error);
                setToast({ message: `Forked "${editing.name}" to your tenant.`, type: "success" });
              } else if (asNewVersion) {
                const res = await consentService.publishVersion(editing.id, payload.content, payload.description ?? undefined);
                if (res.error) throw new Error(res.error);
                setToast({ message: `Published new version of "${editing.name}".`, type: "success" });
              } else {
                const res = await consentService.updateTemplate(editing.id, payload);
                if (res.error) throw new Error(res.error);
                setToast({ message: `Saved "${editing.name}".`, type: "success" });
              }
              setEditing(null);
              refresh();
            } catch (e) {
              setToast({ message: (e as Error).message ?? "Save failed", type: "error" });
            }
          }}
        />
      )}

      {/* Preview modal */}
      {previewing && (
        <PreviewModal template={previewing} onClose={() => setPreviewing(null)} />
      )}

      {/* Toast */}
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

// ─── Row in the template list ─────────────────────────────────────────────

function TemplateRow({
  template,
  isFork,
  onEdit,
  onPreview,
}: {
  template: BackendTemplate;
  isFork: boolean;
  onEdit: () => void;
  onPreview: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border"
      style={{
        borderColor: C.slate200,
        backgroundColor: template.is_active ? C.white : C.slate50,
        opacity: template.is_active ? 1 : 0.6,
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: C.slate100 }}
      >
        <FileText className="w-4 h-4" style={{ color: C.slate600 }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold truncate" style={{ color: C.navy800 }}>
            {template.name}
          </p>
          <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: C.slate100, color: C.slate500 }}>
            v{template.version}
          </span>
          {template.is_required ? (
            <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: C.amber50, color: "#92400e" }}>
              Required
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: C.slate100, color: C.slate500 }}>
              Optional
            </span>
          )}
          {!template.is_active && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: C.slate100, color: C.slate400 }}>
              Inactive
            </span>
          )}
        </div>
        {template.description && (
          <p className="text-xs mt-1 truncate" style={{ color: C.slate500 }}>
            {template.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onPreview}
          className="p-2 rounded-lg transition-colors hover:bg-slate-100"
          title="Preview"
        >
          <Eye className="w-4 h-4" style={{ color: C.slate500 }} />
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{
            backgroundColor: isFork ? C.teal500 : C.slate100,
            color: isFork ? C.white : C.slate600,
          }}
        >
          {isFork ? <><GitBranch className="w-3.5 h-3.5" /> Fork & customize</> : <><Edit3 className="w-3.5 h-3.5" /> Edit</>}
        </button>
      </div>
    </div>
  );
}

// ─── Edit modal — Markdown editor + live preview ──────────────────────────

function TemplateEditModal({
  template,
  onClose,
  onSave,
}: {
  template: BackendTemplate;
  onClose: () => void;
  onSave: (payload: { name: string; description: string | null; content: string; is_required: boolean; display_order: number }, asNewVersion: boolean) => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [content, setContent] = useState(template.content);
  const [isRequired, setIsRequired] = useState(template.is_required);
  const [displayOrder, setDisplayOrder] = useState(template.display_order ?? 0);
  const [view, setView] = useState<"edit" | "preview" | "split">("edit");

  const isForking = !!template.parent_template_id && !template.tenant_id;
  const canPublishVersion = !isForking && !!template.tenant_id;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: C.white,
          borderRadius: "12px",
          maxWidth: "1000px",
          width: "100%",
          maxHeight: "92vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid " + C.slate200,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3 className="text-base font-semibold truncate" style={{ color: C.navy900 }}>
              {isForking ? `Fork: ${template.name}` : template.name}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
              {isForking
                ? "Editing creates a tenant-customized copy."
                : `Currently v${template.version}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            <ViewToggle current={view} value="edit" label="Edit" onClick={() => setView("edit")} />
            <ViewToggle current={view} value="split" label="Split" onClick={() => setView("split")} />
            <ViewToggle current={view} value="preview" label="Preview" onClick={() => setView("preview")} />
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
              <X className="w-4 h-4" style={{ color: C.slate500 }} />
            </button>
          </div>
        </div>

        {/* Meta fields */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid " + C.slate100 }}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1" style={{ color: C.slate600 }}>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: C.slate200, color: C.navy900 }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.slate600 }}>Display order</label>
              <input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: C.slate200, color: C.navy900 }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1" style={{ color: C.slate600 }}>Description (admin-facing)</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short tagline shown in the consent list"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: C.slate200, color: C.navy900 }}
              />
            </div>
            <div className="flex items-center mt-5">
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: C.slate600 }}>
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  style={{ accentColor: C.teal500, width: 16, height: 16 }}
                />
                Required at enrollment
              </label>
            </div>
          </div>
        </div>

        {/* Body — edit / split / preview */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          {(view === "edit" || view === "split") && (
            <div style={{ flex: 1, padding: "12px 18px", display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium" style={{ color: C.slate600 }}>
                  Content (Markdown — # ## ### headings, **bold**, *italic*)
                </label>
                <span className="text-xs" style={{ color: C.slate400 }}>
                  {content.length.toLocaleString()} chars
                </span>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{
                  flex: 1,
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid " + C.slate200,
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  fontSize: "12px",
                  lineHeight: 1.6,
                  outline: "none",
                  resize: "none",
                  color: C.navy900,
                  minHeight: "300px",
                }}
              />
            </div>
          )}
          {(view === "preview" || view === "split") && (
            <div
              style={{
                flex: 1,
                padding: "12px 18px",
                overflowY: "auto",
                borderLeft: view === "split" ? "1px solid " + C.slate100 : "none",
                backgroundColor: C.slate50,
              }}
            >
              <p className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: C.slate400 }}>
                Live preview
              </p>
              <AgreementBody content={content} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid " + C.slate200,
            backgroundColor: C.slate50,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <p className="text-xs" style={{ color: C.slate500 }}>
            <strong>Save</strong> applies edits without bumping the version.{" "}
            <strong>Publish version</strong> creates v{(parseInt(template.version, 10) || 1) + 1} and locks the prior one.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: C.slate600 }}>
              Cancel
            </button>
            <button
              onClick={() => onSave({ name, description: description || null, content, is_required: isRequired, display_order: displayOrder }, false)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
              style={{ borderColor: C.teal500, color: C.teal600 }}
            >
              <Save className="w-3.5 h-3.5" /> Save
            </button>
            {canPublishVersion && (
              <button
                onClick={() => onSave({ name, description: description || null, content, is_required: isRequired, display_order: displayOrder }, true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: C.teal500 }}
              >
                <GitBranch className="w-3.5 h-3.5" /> Publish new version
              </button>
            )}
            {isForking && (
              <button
                onClick={() => onSave({ name, description: description || null, content, is_required: isRequired, display_order: displayOrder }, false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: C.teal500 }}
              >
                <Plus className="w-3.5 h-3.5" /> Fork & save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewToggle({
  current, value, label, onClick,
}: { current: string; value: string; label: string; onClick: () => void }) {
  const active = current === value;
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
      style={{
        backgroundColor: active ? C.teal500 : "transparent",
        color: active ? C.white : C.slate500,
      }}
    >
      {label}
    </button>
  );
}

function PreviewModal({ template, onClose }: { template: BackendTemplate; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)", backdropFilter: "blur(4px)",
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
            <h3 className="text-base font-semibold" style={{ color: C.navy900 }}>{template.name}</h3>
            <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>v{template.version}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="w-4 h-4" style={{ color: C.slate500 }} />
          </button>
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          <AgreementBody content={template.content} />
        </div>
      </div>
    </div>
  );
}
