// NotificationBell — self-contained bell + popover used by PortalShell.
//
// Owns its own data: polls the unread count every 60s while the user
// is on the page, lazy-loads the full list when the popover opens,
// and supports per-row + mark-all-read.
//
// Uses Laravel's standard polymorphic notifications table populated
// via $user->notify(...). Each row's `data` is a JSON blob with at
// least { title, body, ... }; we render title + body and fall back
// to whatever string field is present.

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { notificationService } from "../../lib/api";

interface NotificationRow {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  read_at?: string | null;
  created_at?: string;
}

const POLL_INTERVAL_MS = 60_000;

function formatRelative(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - then) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function pickTitle(row: NotificationRow): string {
  const d = row.data || {};
  return (d.title as string) || (d.subject as string) || (row.type as string) || "Notification";
}

function pickBody(row: NotificationRow): string {
  const d = row.data || {};
  return (d.body as string) || (d.message as string) || (d.description as string) || "";
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const r = await notificationService.getUnreadCount();
      setUnreadCount(r.data?.unread_count ?? 0);
    } catch {
      // Stay quiet — auth errors / network blips shouldn't spam the console.
    }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await notificationService.list({ per_page: "25" });
      // Laravel paginates; data is { current_page, data: [...] } or just an array
      // depending on shape. Handle both.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = r.data;
      const list: NotificationRow[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
        ? payload.data
        : [];
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial unread count + polling
  useEffect(() => {
    fetchUnreadCount();
    const t = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchUnreadCount]);

  // Load list when popover opens
  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markOneRead = async (id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id && !r.read_at ? { ...r, read_at: new Date().toISOString() } : r)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await notificationService.markRead(id);
    } catch {
      // best-effort — keep optimistic state
    }
  };

  const markAll = async () => {
    const wasUnread = rows.filter((r) => !r.read_at).map((r) => r.id);
    setRows((prev) => prev.map((r) => (r.read_at ? r : { ...r, read_at: new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await notificationService.markAllRead();
    } catch {
      // restore on failure
      setRows((prev) =>
        prev.map((r) => (wasUnread.includes(r.id) ? { ...r, read_at: null } : r)),
      );
      fetchUnreadCount();
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5 text-gray-500" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-[360px] sm:w-[400px] rounded-xl bg-white shadow-2xl border border-slate-200 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
                <p className="text-xs text-slate-400">
                  {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAll}
                    className="text-xs font-medium text-teal-600 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50 inline-flex items-center gap-1"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded hover:bg-slate-100"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto">
              {loading && (
                <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
              )}
              {!loading && rows.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <Bell className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-500">No notifications yet</p>
                </div>
              )}
              {!loading &&
                rows.map((r) => {
                  const unread = !r.read_at;
                  return (
                    <button
                      key={r.id}
                      onClick={() => unread && markOneRead(r.id)}
                      className="w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors"
                      style={{
                        backgroundColor: unread ? "rgba(39, 171, 131, 0.04)" : "transparent",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                          style={{ backgroundColor: unread ? "#27ab83" : "transparent" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: unread ? "#102a43" : "#475569" }}
                          >
                            {pickTitle(r)}
                          </p>
                          {pickBody(r) && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                              {pickBody(r)}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400 mt-1">
                            {formatRelative(r.created_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
