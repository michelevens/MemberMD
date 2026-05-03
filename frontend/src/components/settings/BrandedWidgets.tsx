// ===== Branded Widgets =====
// Custom domain management (with TXT verification), CSS theming, embed
// snippet generator, and conversion analytics — all in one settings panel.

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Globe,
  Plus,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  RefreshCw,
  Trash2,
  Star,
  Code,
  Palette,
  BarChart3,
  Eye,
  Save,
  ExternalLink,
} from "lucide-react";
import {
  tenantDomainService,
  widgetThemeService,
  widgetAnalyticsService,
  type TenantDomain,
  type WidgetTheme,
  type WidgetThemeScope,
  type WidgetAnalyticsSummary,
} from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useConfirm } from "../shared/ConfirmDialog";

const C = {
  navy900: "#102a43",
  navy700: "#334e68",
  teal500: "#27ab83",
  teal600: "#147d64",
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  red500: "#ef4444",
  red50: "#fef2f2",
  amber500: "#f59e0b",
  amber50: "#fffbeb",
  amber800: "#92400e",
  green500: "#22c55e",
  green50: "#f0fdf4",
  green700: "#15803d",
};

function toast(msg: string, kind: "success" | "error" = "success") {
  const el = document.createElement("div");
  el.textContent = msg;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: kind === "success" ? C.navy900 : C.red500,
    color: C.white,
    padding: "10px 20px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "500",
    zIndex: "9999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    transition: "opacity 0.3s",
    opacity: "1",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ─── Component ───────────────────────────────────────────────────────────────

type SubTab = "domains" | "theme" | "embed" | "analytics";

const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType }[] = [
  { id: "domains", label: "Custom Domains", icon: Globe },
  { id: "theme", label: "Theme", icon: Palette },
  { id: "embed", label: "Embed Code", icon: Code },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

export function BrandedWidgets() {
  const [tab, setTab] = useState<SubTab>("domains");

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg border" style={{ borderColor: C.slate200, padding: "2px" }}>
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
              style={{
                backgroundColor: tab === t.id ? C.navy700 : "transparent",
                color: tab === t.id ? C.white : C.slate500,
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "domains" && <DomainsPanel />}
      {tab === "theme" && <ThemePanel />}
      {tab === "embed" && <EmbedPanel />}
      {tab === "analytics" && <AnalyticsPanel />}
    </div>
  );
}

// ─── Domains Panel ──────────────────────────────────────────────────────────

function DomainsPanel() {
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await tenantDomainService.list();
    if (res.error) setError(res.error);
    if (res.data) setDomains(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!newDomain.trim()) {
      toast("Enter a domain.", "error");
      return;
    }
    setSubmitting(true);
    const res = await tenantDomainService.add(newDomain.trim().toLowerCase());
    setSubmitting(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast("Domain added. Add the TXT record to verify.");
    setNewDomain("");
    setAdding(false);
    void load();
  };

  if (loading) return <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.slate400 }} />;
  if (error) return <ErrorPanel message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: C.slate500 }}>
          Serve your enrollment + plan widgets at your own domain (e.g.,{" "}
          <code className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: C.slate100, color: C.navy700 }}>
            enroll.yourbrand.com
          </code>
          ).
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
            style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
          >
            <Plus className="w-4 h-4" />
            Add domain
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-2xl border p-5" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
          <Field label="Domain (no protocol, no path)">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="enroll.yourbrand.com"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              style={{ borderColor: C.slate200 }}
            />
          </Field>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => { setAdding(false); setNewDomain(""); }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50"
              style={{ color: C.slate600 }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Add
            </button>
          </div>
        </div>
      )}

      {domains.length === 0 && !adding && (
        <div className="rounded-2xl border p-12 text-center" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
          <Globe className="w-10 h-10 mx-auto mb-3" style={{ color: C.slate400 }} />
          <p className="text-sm font-medium" style={{ color: C.navy900 }}>No custom domains yet</p>
          <p className="text-xs mt-1" style={{ color: C.slate500 }}>
            Your default URL is always available. Custom domains are optional.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {domains.map((d) => (
          <DomainRow key={d.id} domain={d} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

function DomainRow({ domain, onChanged }: { domain: TenantDomain; onChanged: () => void }) {
  const [verifying, setVerifying] = useState(false);
  const confirm = useConfirm();

  const verify = async () => {
    setVerifying(true);
    const res = await tenantDomainService.verify(domain.id);
    setVerifying(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    if (res.data?.isVerified) {
      toast("Domain verified.");
    } else {
      toast("TXT record not found yet — DNS can take a few minutes. Try again.", "error");
    }
    onChanged();
  };

  const makePrimary = async () => {
    const res = await tenantDomainService.makePrimary(domain.id);
    if (res.error) {
      toast(res.error, "error");
    } else {
      toast("Set as primary domain.");
      onChanged();
    }
  };

  const release = async () => {
    const ok = await confirm({
      title: `Release ${domain.domain}?`,
      message: "Members already enrolling on this domain will see an error.",
      confirmLabel: "Release",
      variant: "danger",
    });
    if (!ok) return;
    const res = await tenantDomainService.release(domain.id);
    if (res.error) {
      toast(res.error, "error");
    } else {
      toast("Domain released.");
      onChanged();
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast(`${label} copied.`);
  };

  return (
    <div className="rounded-2xl border p-5" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-base font-semibold truncate" style={{ color: C.navy900 }}>{domain.domain}</h4>
            <DomainStatusBadge domain={domain} />
            {domain.isPrimary && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: C.teal500, color: C.white }}>
                <Star className="w-3 h-3" />
                Primary
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!domain.isVerified && (
            <button
              onClick={verify}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
            >
              {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Verify
            </button>
          )}
          {domain.isVerified && !domain.isPrimary && (
            <button
              onClick={makePrimary}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-slate-50"
              style={{ color: C.navy700 }}
            >
              <Star className="w-3.5 h-3.5" />
              Make primary
            </button>
          )}
          <button
            onClick={release}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-red-50"
            style={{ color: C.red500 }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!domain.isVerified && (
        <div className="rounded-lg border p-4 space-y-3" style={{ backgroundColor: C.amber50, borderColor: C.amber500 }}>
          <p className="text-xs font-semibold" style={{ color: C.amber800 }}>
            Add this TXT record at your DNS provider, then click Verify
          </p>
          <div>
            <p className="text-xs mb-1" style={{ color: C.amber800 }}>Host / Name</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2 py-1.5 rounded text-xs font-mono break-all" style={{ backgroundColor: C.white, color: C.navy900 }}>
                {domain.txtRecordHost}
              </code>
              <button onClick={() => copy(domain.txtRecordHost, "Host")} className="p-1.5 rounded hover:bg-white" title="Copy">
                <Copy className="w-3.5 h-3.5" style={{ color: C.amber800 }} />
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: C.amber800 }}>Value</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2 py-1.5 rounded text-xs font-mono break-all" style={{ backgroundColor: C.white, color: C.navy900 }}>
                {domain.txtRecordValue}
              </code>
              <button onClick={() => copy(domain.txtRecordValue, "Value")} className="p-1.5 rounded hover:bg-white" title="Copy">
                <Copy className="w-3.5 h-3.5" style={{ color: C.amber800 }} />
              </button>
            </div>
          </div>
          <p className="text-xs" style={{ color: C.amber800 }}>
            DNS propagation typically takes 1–5 minutes. We'll re-check whenever you click Verify.
          </p>
        </div>
      )}

      {domain.isVerified && (
        <div className="text-xs" style={{ color: C.slate500 }}>
          Verified {domain.verifiedAt ? new Date(domain.verifiedAt).toLocaleDateString() : ""} · SSL: {domain.sslStatus}
        </div>
      )}
    </div>
  );
}

function DomainStatusBadge({ domain }: { domain: TenantDomain }) {
  if (domain.isVerified) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: C.green50, color: C.green700 }}>
        <CheckCircle2 className="w-3 h-3" />
        Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: C.amber50, color: C.amber800 }}>
      <AlertTriangle className="w-3 h-3" />
      Pending verification
    </span>
  );
}

// ─── Theme Panel ────────────────────────────────────────────────────────────

const COLOR_VARIABLES: Array<{ key: string; label: string }> = [
  { key: "primary", label: "Primary brand" },
  { key: "primary_hover", label: "Primary hover" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "text", label: "Text" },
  { key: "text_muted", label: "Muted text" },
  { key: "background", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "border", label: "Border" },
];

const RADIUS_VARIABLES: Array<{ key: string; label: string }> = [
  { key: "radius_sm", label: "Small radius" },
  { key: "radius_md", label: "Medium radius" },
  { key: "radius_lg", label: "Large radius" },
];

function ThemePanel() {
  const [scope] = useState<WidgetThemeScope>("all");
  const [theme, setTheme] = useState<WidgetTheme | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const confirm = useConfirm();
  const [customCss, setCustomCss] = useState("");
  const [fontFamily, setFontFamily] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await widgetThemeService.show(scope);
    if (res.data) {
      setTheme(res.data);
      setVars({ ...res.data.cssVariables });
      setCustomCss(res.data.customCss ?? "");
      setFontFamily(res.data.fontFamily ?? "");
    }
    setLoading(false);
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const res = await widgetThemeService.upsert(scope, {
      cssVariables: vars,
      customCss: customCss || null,
      fontFamily: fontFamily || null,
    } as Partial<WidgetTheme>);
    setSaving(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast("Theme saved.");
    void load();
  };

  const reset = async () => {
    const ok = await confirm({
      title: "Reset theme?",
      message: "All custom colors and CSS will be replaced with platform defaults.",
      confirmLabel: "Reset",
      variant: "warning",
    });
    if (!ok) return;
    await widgetThemeService.reset(scope);
    toast("Theme reset.");
    void load();
  };

  if (loading) return <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.slate400 }} />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-5">
        <div className="rounded-2xl border p-5" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
          <h4 className="text-sm font-semibold mb-4" style={{ color: C.navy900 }}>Colors</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COLOR_VARIABLES.map(({ key, label }) => (
              <ColorField
                key={key}
                label={label}
                value={vars[key] || "#000000"}
                onChange={(v) => setVars({ ...vars, [key]: v })}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border p-5" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
          <h4 className="text-sm font-semibold mb-4" style={{ color: C.navy900 }}>Shape</h4>
          <div className="grid grid-cols-3 gap-3">
            {RADIUS_VARIABLES.map(({ key, label }) => (
              <Field key={key} label={label}>
                <input
                  type="text"
                  value={vars[key] || ""}
                  onChange={(e) => setVars({ ...vars, [key]: e.target.value })}
                  placeholder="e.g. 12px"
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  style={{ borderColor: C.slate200 }}
                />
              </Field>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border p-5" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
          <h4 className="text-sm font-semibold mb-4" style={{ color: C.navy900 }}>Typography</h4>
          <Field label="Font family (CSS value)">
            <input
              type="text"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              placeholder='e.g. "Inter", system-ui, sans-serif'
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              style={{ borderColor: C.slate200 }}
            />
          </Field>
        </div>

        <div className="rounded-2xl border p-5" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
          <h4 className="text-sm font-semibold mb-1" style={{ color: C.navy900 }}>Custom CSS (advanced)</h4>
          <p className="text-xs mb-3" style={{ color: C.slate500 }}>
            Sanitized for security. <code>@import</code>, <code>expression()</code>, off-host <code>url()</code>, and <code>javascript:</code> are stripped.
          </p>
          <textarea
            value={customCss}
            onChange={(e) => setCustomCss(e.target.value)}
            rows={6}
            placeholder=".widget-card { box-shadow: 0 8px 24px rgba(0,0,0,0.06); }"
            className="w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-400"
            style={{ borderColor: C.slate200 }}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={reset}
            className="px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50"
            style={{ color: C.slate600 }}
          >
            Reset
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${C.teal500}, ${C.teal600})` }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save theme
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div className="lg:col-span-1">
        <div className="sticky top-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: C.slate500 }}>
            <Eye className="w-3.5 h-3.5" />
            Live preview
          </h4>
          <ThemePreview vars={vars} customCss={customCss} fontFamily={fontFamily} />
          <p className="text-xs mt-3" style={{ color: C.slate400 }}>
            Showing the theme applied to a sample plan card.
          </p>
        </div>
      </div>
    </div>
  );

  void theme; // suppress unused
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: C.slate600 }}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border cursor-pointer"
          style={{ borderColor: C.slate200 }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-2 rounded-lg border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-400"
          style={{ borderColor: C.slate200 }}
        />
      </div>
    </div>
  );
}

function ThemePreview({ vars, customCss, fontFamily }: { vars: Record<string, string>; customCss: string; fontFamily: string }) {
  // Apply preview vars as inline CSS custom properties on a wrapper div
  const cssVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    cssVars[`--mm-${k.replace(/_/g, "-")}`] = v;
  }
  if (fontFamily) cssVars["fontFamily"] = fontFamily;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.slate200 }}>
      <style>{customCss}</style>
      <div
        style={{
          ...cssVars,
          backgroundColor: vars.background || "#fff",
          padding: "20px",
          fontFamily: fontFamily || undefined,
        }}
      >
        <div
          style={{
            backgroundColor: vars.surface || "#f8fafc",
            border: `1px solid ${vars.border || "#e2e8f0"}`,
            borderRadius: vars.radius_lg || "20px",
            padding: "16px",
          }}
        >
          <p style={{ color: vars.text_muted || "#64748b", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
            Most popular
          </p>
          <h3 style={{ color: vars.text || "#102a43", fontWeight: 700, fontSize: "20px" }}>Complete Plan</h3>
          <p style={{ color: vars.primary || "#27ab83", fontSize: "32px", fontWeight: 700, marginTop: "8px" }}>$199<span style={{ fontSize: "14px", color: vars.text_muted, fontWeight: 400 }}>/month</span></p>
          <p style={{ color: vars.text_muted || "#64748b", fontSize: "13px", marginTop: "8px" }}>
            Unlimited visits, telehealth, messaging, lab discounts.
          </p>
          <button
            style={{
              marginTop: "16px",
              width: "100%",
              padding: "10px",
              borderRadius: vars.radius_md || "12px",
              backgroundColor: vars.primary || "#27ab83",
              color: "#fff",
              fontWeight: 600,
              fontSize: "13px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Choose Complete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Embed Panel ────────────────────────────────────────────────────────────

function EmbedPanel() {
  const auth = useAuth();
  const [primaryDomain, setPrimaryDomain] = useState<string | null>(null);

  // Practice tenant_code is on user.practice (per AuthController.userPayload)
  const tenantCode = (auth.user as { practice?: { tenantCode?: string } } | null)?.practice?.tenantCode || "";

  useEffect(() => {
    void (async () => {
      const res = await tenantDomainService.list();
      const verified = res.data?.find((d) => d.isVerified && d.isPrimary)
        ?? res.data?.find((d) => d.isVerified);
      setPrimaryDomain(verified?.domain ?? null);
    })();
  }, []);

  const platformBase = window.location.origin;
  const enrollUrl = primaryDomain
    ? `https://${primaryDomain}`
    : `${platformBase}/#/enroll/${tenantCode}`;
  const plansUrl = primaryDomain
    ? `https://${primaryDomain}/plans`
    : `${platformBase}/#/plans/${tenantCode}`;

  const iframeEnroll = `<iframe src="${enrollUrl}" width="100%" height="780" frameborder="0" style="border-radius:20px;"></iframe>`;
  const iframePlans = `<iframe src="${plansUrl}" width="100%" height="640" frameborder="0" style="border-radius:20px;"></iframe>`;
  const linkEnroll = `<a href="${enrollUrl}">Enroll now</a>`;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-5" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
        <p className="text-sm" style={{ color: C.slate500 }}>
          Drop these snippets into your marketing site to embed the membership flow.
          {primaryDomain ? (
            <> URLs use your verified domain: <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: C.slate100, color: C.navy700 }}>{primaryDomain}</code></>
          ) : (
            <> Add a custom domain to use your own URL.</>
          )}
        </p>
      </div>

      <EmbedSnippet label="Enrollment widget (iframe)" code={iframeEnroll} />
      <EmbedSnippet label="Plan comparison (iframe)" code={iframePlans} />
      <EmbedSnippet label="Direct link" code={linkEnroll} />

      <div className="rounded-2xl border p-5 flex items-start gap-3" style={{ backgroundColor: C.slate50, borderColor: C.slate200 }}>
        <ExternalLink className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.slate500 }} />
        <div className="text-xs" style={{ color: C.slate600 }}>
          <p className="font-semibold mb-1">Test your embed</p>
          <p>
            Open <a href={enrollUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: C.teal600 }}>{enrollUrl}</a>{" "}
            in a new tab. Members reach your enrollment flow with your branded theme applied.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmbedSnippet({ label, code }: { label: string; code: string }) {
  const copy = () => {
    navigator.clipboard.writeText(code);
    toast("Snippet copied.");
  };
  return (
    <div className="rounded-2xl border p-4" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold" style={{ color: C.navy700 }}>{label}</p>
        <button onClick={copy} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium hover:bg-slate-50" style={{ color: C.slate600 }}>
          <Copy className="w-3.5 h-3.5" />
          Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg p-3 text-xs font-mono" style={{ backgroundColor: C.slate50, color: C.navy900 }}>{code}</pre>
    </div>
  );
}

// ─── Analytics Panel ────────────────────────────────────────────────────────

function AnalyticsPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<WidgetAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await widgetAnalyticsService.summary(days);
    if (res.data) setData(res.data);
    setLoading(false);
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const types = useMemo(() => Object.entries(data?.byWidgetType ?? {}), [data]);

  if (loading) return <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.slate400 }} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: C.slate500 }}>
          Conversion funnel for embedded widgets, last {days} days.
        </p>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-1.5 rounded-lg border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
          style={{ borderColor: C.slate200 }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {types.length === 0 ? (
        <div className="rounded-2xl border p-12 text-center" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
          <BarChart3 className="w-10 h-10 mx-auto mb-3" style={{ color: C.slate400 }} />
          <p className="text-sm font-medium" style={{ color: C.navy900 }}>No widget activity yet</p>
          <p className="text-xs mt-1" style={{ color: C.slate500 }}>
            Once members start visiting your embedded widgets, you'll see impressions, starts, and completions here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {types.map(([type, stats]) => (
            <div key={type} className="rounded-2xl border p-5" style={{ backgroundColor: C.white, borderColor: C.slate200 }}>
              <h4 className="text-sm font-semibold capitalize mb-4" style={{ color: C.navy900 }}>{type} widget</h4>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <FunnelStat label="Impressions" value={stats.impressions} />
                <FunnelStat label="Starts" value={stats.starts} />
                <FunnelStat label="Completed" value={stats.completes} accent />
              </div>
              <div className="space-y-1 text-xs" style={{ color: C.slate500 }}>
                <Row label="Start rate" value={`${(stats.startRate * 100).toFixed(1)}%`} />
                <Row label="Conversion (start→complete)" value={`${(stats.conversionRate * 100).toFixed(1)}%`} />
                <Row label="Overall (impression→complete)" value={`${(stats.overallRate * 100).toFixed(1)}%`} bold />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FunnelStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg p-3 border" style={{ borderColor: C.slate200, backgroundColor: accent ? C.green50 : C.slate50 }}>
      <p className="text-xs" style={{ color: C.slate500 }}>{label}</p>
      <p className="text-lg font-bold mt-1" style={{ color: accent ? C.green700 : C.navy900 }}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span style={{ color: C.navy700, fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: C.slate600 }}>{label}</label>
      {children}
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: C.red50, borderColor: C.red500, color: C.red500 }}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}
