// ===== Header Toolbar =====
// Shared horizontal icon toolbar for the top-right of all portal headers
// Messages, Notifications, Settings, Dark Mode, UserSettingsDropdown

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, Bell, Settings, Moon, Sun, X } from "lucide-react";
import { UserSettingsDropdown } from "./UserSettingsDropdown";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HeaderToolbarProps {
  variant: "superadmin" | "practice" | "patient";
  onNavigate?: (tab: string) => void;
}

interface MockMessage {
  id: string;
  sender: string;
  preview: string;
  time: string;
  avatar: string;
  unread: boolean;
}

interface MockNotification {
  id: string;
  text: string;
  time: string;
  dotColor: string;
  read: boolean;
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  navy900: "#102a43",
  navy800: "#243b53",
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
  green500: "#22c55e",
  blue500: "#3b82f6",
  gray400: "#9ca3af",
};

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_MESSAGES: MockMessage[] = [
  {
    id: "m1",
    sender: "Dr. Nageley Michel",
    preview: "Question about medication formulary...",
    time: "30 min ago",
    avatar: "NM",
    unread: true,
  },
  {
    id: "m2",
    sender: "Support",
    preview: "Your Stripe integration is ready",
    time: "2 hours ago",
    avatar: "SP",
    unread: false,
  },
  {
    id: "m3",
    sender: "Care Team",
    preview: "Patient referral for review",
    time: "5 hours ago",
    avatar: "CT",
    unread: false,
  },
];

const MOCK_NOTIFICATIONS: MockNotification[] = [
  {
    id: "n1",
    text: "New practice registered: Clearstone Group",
    time: "2 min ago",
    dotColor: COLORS.teal500,
    read: false,
  },
  {
    id: "n2",
    text: "Payment received: $199.00 from James Wilson",
    time: "15 min ago",
    dotColor: COLORS.green500,
    read: false,
  },
  {
    id: "n3",
    text: "Membership cancelled: Sarah B.",
    time: "1 hour ago",
    dotColor: COLORS.red500,
    read: false,
  },
  {
    id: "n4",
    text: "Intake form submitted — INK-A3B2C1",
    time: "3 hours ago",
    dotColor: COLORS.blue500,
    read: true,
  },
  {
    id: "n5",
    text: "System update deployed v1.2.0",
    time: "1 day ago",
    dotColor: COLORS.gray400,
    read: true,
  },
];

// ─── Mini Panel Wrapper ──────────────────────────────────────────────────────

function MiniPanel({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-12 rounded-xl shadow-2xl border overflow-hidden z-50"
      style={{
        width: "360px",
        backgroundColor: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderColor: COLORS.slate200,
        maxHeight: "400px",
      }}
    >
      {children}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function HeaderToolbar({ variant, onNavigate }: HeaderToolbarProps) {
  const [showMessages, setShowMessages] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [isDark, setIsDark] = useState(() => {
    return (
      localStorage.getItem("membermd_theme") === "dark" ||
      document.documentElement.classList.contains("dark")
    );
  });

  const unreadMessages = MOCK_MESSAGES.filter((m) => m.unread).length;
  const unreadNotifications = notifications.filter((n) => !n.read).length;

  const closeAll = useCallback(() => {
    setShowMessages(false);
    setShowNotifications(false);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("membermd_theme", next ? "dark" : "light");
  };

  const handleSettingsClick = () => {
    closeAll();
    if (onNavigate) {
      if (variant === "superadmin") onNavigate("settings");
      else if (variant === "practice") onNavigate("practice-settings");
      else onNavigate("account");
    }
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  // ─── Icon Button ─────────────────────────────────────────────────────────

  const iconBtnClass =
    "relative p-2 rounded-lg transition-colors hover:bg-slate-100";

  return (
    <div className="flex items-center gap-1">
      {/* Messages */}
      <div className="relative">
        <button
          className={iconBtnClass}
          onClick={() => {
            setShowMessages(!showMessages);
            setShowNotifications(false);
          }}
          title="Messages"
        >
          <MessageSquare className="w-5 h-5" style={{ color: COLORS.slate500 }} />
          {unreadMessages > 0 && (
            <span
              className="absolute top-1 right-1 w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold"
              style={{ backgroundColor: COLORS.teal500, fontSize: "10px" }}
            >
              {unreadMessages}
            </span>
          )}
        </button>

        {showMessages && (
          <MiniPanel onClose={() => setShowMessages(false)}>
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: COLORS.slate200 }}
            >
              <span
                className="text-sm font-semibold"
                style={{ color: COLORS.navy900 }}
              >
                Messages
              </span>
              <button
                onClick={() => setShowMessages(false)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X className="w-4 h-4" style={{ color: COLORS.slate400 }} />
              </button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: "320px" }}>
              {MOCK_MESSAGES.map((msg) => (
                <button
                  key={msg.id}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  style={{
                    backgroundColor: msg.unread ? "#f0fdf9" : "transparent",
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${COLORS.navy700}, ${COLORS.teal500})`,
                    }}
                  >
                    {msg.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: COLORS.navy900 }}
                      >
                        {msg.sender}
                      </span>
                      <span
                        className="text-xs shrink-0 ml-2"
                        style={{ color: COLORS.slate400 }}
                      >
                        {msg.time}
                      </span>
                    </div>
                    <p
                      className="text-xs truncate mt-0.5"
                      style={{ color: COLORS.slate500 }}
                    >
                      {msg.preview}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <div
              className="px-4 py-2.5 border-t text-center"
              style={{ borderColor: COLORS.slate200 }}
            >
              <button
                className="text-xs font-medium"
                style={{ color: COLORS.teal600 }}
              >
                View All Messages
              </button>
            </div>
          </MiniPanel>
        )}
      </div>

      {/* Notifications */}
      <div className="relative">
        <button
          className={iconBtnClass}
          onClick={() => {
            setShowNotifications(!showNotifications);
            setShowMessages(false);
          }}
          title="Notifications"
        >
          <Bell className="w-5 h-5" style={{ color: COLORS.slate500 }} />
          {unreadNotifications > 0 && (
            <span
              className="absolute top-1 right-1 w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold"
              style={{ backgroundColor: COLORS.red500, fontSize: "10px" }}
            >
              {unreadNotifications}
            </span>
          )}
        </button>

        {showNotifications && (
          <MiniPanel onClose={() => setShowNotifications(false)}>
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: COLORS.slate200 }}
            >
              <span
                className="text-sm font-semibold"
                style={{ color: COLORS.navy900 }}
              >
                Notifications
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs font-medium"
                  style={{ color: COLORS.teal600 }}
                >
                  Mark All Read
                </button>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="p-1 rounded hover:bg-slate-100"
                >
                  <X className="w-4 h-4" style={{ color: COLORS.slate400 }} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: "320px" }}>
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                  style={{
                    backgroundColor: notif.read ? "transparent" : "#fefce8",
                  }}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: notif.dotColor }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm"
                      style={{
                        color: COLORS.navy900,
                        fontWeight: notif.read ? 400 : 500,
                      }}
                    >
                      {notif.text}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: COLORS.slate400 }}
                    >
                      {notif.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div
              className="px-4 py-2.5 border-t text-center"
              style={{ borderColor: COLORS.slate200 }}
            >
              <button
                className="text-xs font-medium"
                style={{ color: COLORS.teal600 }}
              >
                View All Notifications
              </button>
            </div>
          </MiniPanel>
        )}
      </div>

      {/* Settings */}
      <button
        className={iconBtnClass}
        onClick={handleSettingsClick}
        title="Settings"
      >
        <Settings className="w-5 h-5" style={{ color: COLORS.slate500 }} />
      </button>

      {/* Dark Mode Toggle */}
      <button
        className={iconBtnClass}
        onClick={toggleTheme}
        title={isDark ? "Light Mode" : "Dark Mode"}
      >
        {isDark ? (
          <Sun className="w-5 h-5" style={{ color: "#f59e0b" }} />
        ) : (
          <Moon className="w-5 h-5" style={{ color: COLORS.slate500 }} />
        )}
      </button>

      {/* User Dropdown */}
      <UserSettingsDropdown variant={variant} />
    </div>
  );
}
