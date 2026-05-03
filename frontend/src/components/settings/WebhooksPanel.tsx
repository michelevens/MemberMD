// Webhook Endpoints management — port from InsureFlow's webhook UI
// pattern, adapted to MemberMD's existing backend (WebhookEndpoint +
// WebhookDelivery + WebhookDispatcher are already shipped; this is
// just the missing frontend tab).
//
// Surfaces:
//   - List of registered endpoints with URL + status + last activity
//   - Create modal: URL + description + event-type checkboxes
//   - Per-endpoint: regenerate secret, view deliveries, retry, delete
//
// The signing_secret is the ONLY field shown only-on-create — the
// backend hides it on list/show. We surface a one-time copy banner
// when create returns it. After that, the practice has to regenerate
// to see a new one.

import { useEffect, useState } from "react";
import { Plus, RefreshCcw, Trash2, KeyRound, Activity, Copy, Check, ChevronRight, X } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useConfirm } from "../shared/ConfirmDialog";

const C = {
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate700: "#334e68",
  slate900: "#0f172a",
  green600: "#059669",
  green50: "#ecfdf5",
  red600: "#dc2626",
  amber600: "#d97706",
  amber50: "#fffbeb",
  indigo600: "#4f46e5",
  indigo700: "#4338ca",
};

interface Endpoint {
  id: string;
  url: string;
  description: string | null;
  eventTypes: string[];
  status: "enabled" | "disabled" | "failing";
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  createdAt: string;
  signingSecret?: string; // only present on create + regenerate
}

interface Delivery {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  errorMessage: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

const ALLOWED_EVENT_TYPES: { value: string; label: string }[] = [
  { value: "*", label: "All events" },
  { value: "membership.*", label: "All membership events" },
  { value: "membership.activated", label: "membership.activated" },
  { value: "membership.cancelled", label: "membership.cancelled" },
  { value: "membership.paused", label: "membership.paused" },
  { value: "membership.resumed", label: "membership.resumed" },
  { value: "membership.reactivated", label: "membership.reactivated" },
  { value: "membership.expired", label: "membership.expired" },
  { value: "membership.payment_failed", label: "membership.payment_failed" },
  { value: "membership.payment_recovered", label: "membership.payment_recovered" },
  { value: "membership.status_changed", label: "membership.status_changed" },
];

export function WebhooksPanel() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<{ url: string; secret: string } | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<Endpoint | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<Endpoint[]>("/webhooks/endpoints");
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEndpoints(res.data || []);
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="rounded-2xl border bg-white" style={{ borderColor: C.slate200 }}>
      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.slate100 }}>
        <div>
          <h3 className="text-base font-semibold" style={{ color: C.slate900 }}>Outbound webhooks</h3>
          <p className="text-xs mt-0.5" style={{ color: C.slate500 }}>
            POST membership lifecycle events to your own systems (Slack, Zapier, custom CRM).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: C.indigo600 }}
        >
          <Plus className="w-4 h-4" /> Add endpoint
        </button>
      </div>

      {createdSecret && (
        <div className="mx-5 mt-4 rounded-lg border p-4" style={{ borderColor: C.amber600, backgroundColor: C.amber50 }}>
          <div className="flex items-start gap-3">
            <KeyRound className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: C.amber600 }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: C.slate900 }}>
                Save this signing secret — it will not be shown again
              </p>
              <p className="text-xs mt-1" style={{ color: C.slate500 }}>
                For <code className="font-mono">{createdSecret.url}</code>. Use it to verify the X-Webhook-Signature header on each delivery.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded font-mono text-xs break-all" style={{ backgroundColor: C.slate100, color: C.slate900 }}>
                  {createdSecret.secret}
                </code>
                <CopyBtn value={createdSecret.secret} />
                <button
                  onClick={() => setCreatedSecret(null)}
                  className="p-2 rounded hover:bg-slate-100"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" style={{ color: C.slate500 }} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-5 py-4">
        {loading && <p className="text-sm" style={{ color: C.slate500 }}>Loading endpoints…</p>}
        {error && <p className="text-sm" style={{ color: C.red600 }}>{error}</p>}
        {!loading && !error && endpoints.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm font-medium" style={{ color: C.slate700 }}>No webhook endpoints yet</p>
            <p className="text-xs mt-1" style={{ color: C.slate500 }}>
              Click "Add endpoint" to start receiving event notifications.
            </p>
          </div>
        )}
        {!loading && !error && endpoints.length > 0 && (
          <ul className="divide-y" style={{ borderColor: C.slate100 }}>
            {endpoints.map((ep) => (
              <EndpointRow
                key={ep.id}
                endpoint={ep}
                onChange={load}
                onShowSecret={(secret) => setCreatedSecret({ url: ep.url, secret })}
                onShowDeliveries={() => setDeliveriesFor(ep)}
              />
            ))}
          </ul>
        )}
      </div>

      {showCreate && (
        <CreateEndpointModal
          onClose={() => setShowCreate(false)}
          onCreated={(ep) => {
            setShowCreate(false);
            setEndpoints((list) => [ep, ...list]);
            if (ep.signingSecret) {
              setCreatedSecret({ url: ep.url, secret: ep.signingSecret });
            }
          }}
        />
      )}

      {deliveriesFor && (
        <DeliveriesModal endpoint={deliveriesFor} onClose={() => setDeliveriesFor(null)} />
      )}
    </div>
  );
}

function EndpointRow({ endpoint, onChange, onShowSecret, onShowDeliveries }: {
  endpoint: Endpoint;
  onChange: () => void;
  onShowSecret: (secret: string) => void;
  onShowDeliveries: () => void;
}) {
  const confirm = useConfirm();
  const [acting, setActing] = useState<string | null>(null);

  const statusColor = endpoint.status === "enabled" ? C.green600 : endpoint.status === "failing" ? C.red600 : C.slate500;
  const statusBg = endpoint.status === "enabled" ? C.green50 : endpoint.status === "failing" ? "#fee2e2" : C.slate100;

  const regenerate = async () => {
    const ok = await confirm({
      title: "Regenerate signing secret?",
      message: "The existing secret will stop working immediately. Make sure you can update the receiving system.",
      confirmLabel: "Regenerate",
      variant: "warning",
    });
    if (!ok) return;
    setActing("regenerate");
    const res = await apiFetch<{ signingSecret: string }>(`/webhooks/endpoints/${endpoint.id}/regenerate`, { method: "POST" });
    setActing(null);
    if (res.error) return;
    if (res.data?.signingSecret) onShowSecret(res.data.signingSecret);
    onChange();
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this endpoint?",
      message: `${endpoint.url} will stop receiving events. Delivery history is preserved.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setActing("delete");
    await apiFetch(`/webhooks/endpoints/${endpoint.id}`, { method: "DELETE" });
    setActing(null);
    onChange();
  };

  const toggle = async () => {
    setActing("toggle");
    await apiFetch(`/webhooks/endpoints/${endpoint.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: endpoint.status === "enabled" ? "disabled" : "enabled" }),
    });
    setActing(null);
    onChange();
  };

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm break-all" style={{ color: C.slate900 }}>{endpoint.url}</span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: statusColor, backgroundColor: statusBg }}
            >
              {endpoint.status}
            </span>
          </div>
          {endpoint.description && (
            <p className="text-xs mt-1" style={{ color: C.slate500 }}>{endpoint.description}</p>
          )}
          <p className="text-[11px] mt-1" style={{ color: C.slate400 }}>
            {endpoint.eventTypes.join(", ")}
          </p>
          {endpoint.consecutiveFailures > 0 && (
            <p className="text-[11px] mt-1" style={{ color: C.red600 }}>
              {endpoint.consecutiveFailures} consecutive failure{endpoint.consecutiveFailures === 1 ? "" : "s"}
              {endpoint.lastFailureReason ? ` — ${endpoint.lastFailureReason.slice(0, 80)}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <IconBtn title="View deliveries" onClick={onShowDeliveries}>
            <Activity className="w-4 h-4" />
          </IconBtn>
          <IconBtn title="Regenerate secret" onClick={regenerate} disabled={!!acting}>
            <KeyRound className="w-4 h-4" />
          </IconBtn>
          <IconBtn title={endpoint.status === "enabled" ? "Disable" : "Enable"} onClick={toggle} disabled={!!acting}>
            <RefreshCcw className="w-4 h-4" />
          </IconBtn>
          <IconBtn title="Delete" onClick={remove} disabled={!!acting} danger>
            <Trash2 className="w-4 h-4" />
          </IconBtn>
        </div>
      </div>
    </li>
  );
}

function IconBtn({ children, onClick, title, danger, disabled }: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-2 rounded hover:bg-slate-100 disabled:opacity-50"
      style={{ color: danger ? C.red600 : C.slate500 }}
    >
      {children}
    </button>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium hover:bg-slate-200"
      style={{ color: C.slate700 }}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CreateEndpointModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (ep: Endpoint) => void;
}) {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>(["membership.*"]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (val: string) => {
    setSelected((s) => s.includes(val) ? s.filter((v) => v !== val) : [...s, val]);
  };

  const submit = async () => {
    setErr(null);
    if (!url) return setErr("URL is required.");
    if (selected.length === 0) return setErr("Choose at least one event type.");
    setSubmitting(true);
    const res = await apiFetch<Endpoint>("/webhooks/endpoints", {
      method: "POST",
      body: JSON.stringify({
        url,
        description: description || null,
        event_types: selected,
      }),
    });
    setSubmitting(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    if (res.data) onCreated(res.data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b" style={{ borderColor: C.slate100 }}>
          <h3 className="text-base font-semibold" style={{ color: C.slate900 }}>Add webhook endpoint</h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "#fef2f2", color: C.red600 }}>{err}</div>}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: C.slate700 }}>Endpoint URL *</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/membermd"
              className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
              style={{ borderColor: C.slate200 }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: C.slate700 }}>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this endpoint is for"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: C.slate200 }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: C.slate700 }}>Event types *</label>
            <div className="space-y-1.5">
              {ALLOWED_EVENT_TYPES.map((et) => (
                <label key={et.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(et.value)}
                    onChange={() => toggle(et.value)}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: C.slate700 }}>{et.label}</span>
                  <code className="text-[11px] font-mono" style={{ color: C.slate400 }}>{et.value}</code>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: C.slate100 }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-100"
            style={{ color: C.slate700 }}
          >Cancel</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: C.indigo600 }}
          >
            {submitting ? "Creating…" : "Create endpoint"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeliveriesModal({ endpoint, onClose }: { endpoint: Endpoint; onClose: () => void }) {
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<{ data: Delivery[] }>(`/webhooks/endpoints/${endpoint.id}/deliveries`);
    setLoading(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (res.data as any) ?? [];
    setItems(Array.isArray(list) ? list : ((list as { data?: Delivery[] }).data ?? []));
  };
  useEffect(() => { void load(); }, [endpoint.id]);

  const retry = async (id: string) => {
    setRetrying(id);
    await apiFetch(`/webhooks/endpoints/${endpoint.id}/deliveries/${id}/retry`, { method: "POST" });
    setRetrying(null);
    await load();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.slate100 }}>
          <div className="min-w-0">
            <h3 className="text-base font-semibold truncate" style={{ color: C.slate900 }}>Deliveries</h3>
            <p className="text-xs font-mono mt-0.5 truncate" style={{ color: C.slate500 }}>{endpoint.url}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-100">
            <X className="w-4 h-4" style={{ color: C.slate500 }} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading && <p className="px-6 py-4 text-sm" style={{ color: C.slate500 }}>Loading…</p>}
          {!loading && items.length === 0 && <p className="px-6 py-8 text-center text-sm" style={{ color: C.slate500 }}>No deliveries yet.</p>}
          {!loading && items.length > 0 && (
            <ul className="divide-y" style={{ borderColor: C.slate100 }}>
              {items.map((d) => (
                <li key={d.id} className="px-6 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium font-mono" style={{ color: C.slate900 }}>{d.eventType}</span>
                        <span
                          className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded"
                          style={{
                            color: d.status === "delivered" ? C.green600 : d.status === "failed" ? C.red600 : C.amber600,
                            backgroundColor: d.status === "delivered" ? C.green50 : d.status === "failed" ? "#fee2e2" : C.amber50,
                          }}
                        >
                          {d.status}
                        </span>
                        {d.responseStatus !== null && (
                          <span className="text-[11px]" style={{ color: C.slate500 }}>HTTP {d.responseStatus}</span>
                        )}
                        <span className="text-[11px]" style={{ color: C.slate400 }}>
                          attempt {d.attempts}
                        </span>
                      </div>
                      {d.errorMessage && (
                        <p className="text-[11px] mt-1 break-all" style={{ color: C.red600 }}>{d.errorMessage}</p>
                      )}
                      <p className="text-[11px] mt-1" style={{ color: C.slate400 }}>
                        {new Date(d.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {d.status === "failed" && (
                      <button
                        onClick={() => retry(d.id)}
                        disabled={retrying === d.id}
                        className="text-xs font-medium px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-50"
                        style={{ color: C.indigo700 }}
                      >
                        {retrying === d.id ? "Retrying…" : <span className="inline-flex items-center gap-1">Retry <ChevronRight className="w-3 h-3" /></span>}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
