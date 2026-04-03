// ===== User Settings Dropdown =====
// Shared dropdown component for all 3 portals (SuperAdmin, Practice, Patient)
// Inspired by ShiftPulse user dropdown pattern

import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  User,
  Shield,
  Lock,
  FileText,
  Eye,
  LogOut,
  Settings,
  Bell,
  CreditCard,
  CheckCircle2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserSettingsDropdownProps {
  variant: "superadmin" | "practice" | "patient";
  onNavigateToProfile?: () => void;
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
};

// ─── Toast Helper ────────────────────────────────────────────────────────────

function showToast(message: string) {
  const el = document.createElement("div");
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: COLORS.navy800,
    color: COLORS.white,
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
  }, 2500);
}

// ─── Role Label Map ──────────────────────────────────────────────────────────

function getRoleLabel(variant: UserSettingsDropdownProps["variant"], role?: string): string {
  if (variant === "superadmin") return "Super Admin";
  if (variant === "practice") {
    if (role === "provider") return "Provider";
    if (role === "staff") return "Staff";
    return "Practice Admin";
  }
  return "Member";
}

function getRoleBadgeColors(variant: UserSettingsDropdownProps["variant"]) {
  if (variant === "superadmin") return { bg: "rgba(39,171,131,0.12)", text: COLORS.teal600 };
  if (variant === "practice") return { bg: "rgba(51,78,104,0.12)", text: COLORS.navy700 };
  return { bg: "rgba(39,171,131,0.12)", text: COLORS.teal600 };
}

function getAvatarGradient(variant: UserSettingsDropdownProps["variant"]): string {
  if (variant === "superadmin") return `linear-gradient(135deg, ${COLORS.navy700}, ${COLORS.teal500})`;
  return `linear-gradient(135deg, ${COLORS.teal500}, ${COLORS.teal600})`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function UserSettingsDropdown({ variant, onNavigateToProfile }: UserSettingsDropdownProps) {
  const auth = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const firstName = auth.user?.firstName || "User";
  const lastName = auth.user?.lastName || "";
  const initials = `${firstName.charAt(0)}${lastName.charAt(0) || ""}`;
  const fullName = `${firstName} ${lastName}`.trim();
  const roleLabel = getRoleLabel(variant, auth.user?.role);
  const badgeColors = getRoleBadgeColors(variant);
  const avatarGradient = getAvatarGradient(variant);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  return (
    <div ref={ref} className="relative">
      {/* Avatar trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/10"
      >
        <div
          className="rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
          style={{ width: "36px", height: "36px", background: avatarGradient }}
        >
          {initials}
        </div>
        <span className="text-sm font-medium text-white truncate hidden sm:block" style={{ maxWidth: "120px" }}>
          {fullName}
        </span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="absolute right-0 z-50 rounded-xl shadow-lg border overflow-hidden"
          style={{
            width: "280px",
            top: "calc(100% + 8px)",
            backgroundColor: "rgba(255,255,255,0.97)",
            backdropFilter: "blur(16px)",
            borderColor: COLORS.slate200,
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* User info header */}
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${COLORS.slate200}` }}>
            <div className="flex items-center gap-3">
              <div
                className="rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ width: "40px", height: "40px", background: avatarGradient }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: COLORS.navy900 }}>
                  {fullName}
                </p>
                <span
                  className="inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-0.5"
                  style={{ backgroundColor: badgeColors.bg, color: badgeColors.text }}
                >
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Variant-specific section */}
          {variant === "superadmin" && (
            <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${COLORS.slate200}` }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Shield className="w-3.5 h-3.5" style={{ color: COLORS.slate400 }} />
                <span className="text-xs" style={{ color: COLORS.slate500 }}>MemberMD v1.0</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.green500 }} />
                <span className="text-xs font-medium" style={{ color: COLORS.green500 }}>
                  All Systems Operational
                </span>
              </div>
            </div>
          )}

          {variant === "practice" && (
            <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${COLORS.slate200}` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: COLORS.slate400 }}>Practice ID</span>
                <span className="text-xs font-mono font-medium" style={{ color: COLORS.navy700 }}>
                  {auth.user?.practiceId
                    ? String(auth.user.practiceId).slice(0, 8).toUpperCase()
                    : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: COLORS.slate400 }}>Practice</span>
                <span className="text-xs font-medium truncate ml-2" style={{ color: COLORS.navy700 }}>
                  My Practice
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: COLORS.slate400 }}>Plan</span>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "rgba(39,171,131,0.12)", color: COLORS.teal600 }}
                >
                  Professional
                </span>
              </div>
            </div>
          )}

          {variant === "patient" && (
            <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${COLORS.slate200}` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: COLORS.slate400 }}>Member ID</span>
                <span className="text-xs font-mono font-medium" style={{ color: COLORS.navy700 }}>
                  MBR-284719
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: COLORS.slate400 }}>Plan</span>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "rgba(39,171,131,0.12)", color: COLORS.teal600 }}
                >
                  Complete Plan
                </span>
              </div>
            </div>
          )}

          {/* Common menu items */}
          <div className="py-1">
            {/* Profile */}
            <button
              onClick={() => { if (onNavigateToProfile) { onNavigateToProfile(); } else { showToast("Profile editing coming soon"); } setIsOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-slate-50"
              style={{ color: COLORS.slate600 }}
            >
              <User className="w-4 h-4" style={{ color: COLORS.slate400 }} />
              Profile
            </button>

            {/* Enable 2FA */}
            <button
              onClick={() => { if (onNavigateToProfile) { onNavigateToProfile(); } else { showToast("2FA setup coming soon"); } setIsOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-slate-50"
              style={{ color: COLORS.slate600 }}
            >
              <Lock className="w-4 h-4" style={{ color: COLORS.slate400 }} />
              Enable 2FA
            </button>

            {/* Variant-specific links */}
            {variant === "practice" && (
              <button
                onClick={() => { showToast("Practice Settings"); setIsOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-slate-50"
                style={{ color: COLORS.slate600 }}
              >
                <Settings className="w-4 h-4" style={{ color: COLORS.slate400 }} />
                Practice Settings
              </button>
            )}

            {variant === "patient" && (
              <>
                <button
                  onClick={() => { showToast("My Membership"); setIsOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-slate-50"
                  style={{ color: COLORS.slate600 }}
                >
                  <CreditCard className="w-4 h-4" style={{ color: COLORS.slate400 }} />
                  My Membership
                </button>
                <button
                  onClick={() => { showToast("Notification Preferences"); setIsOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-slate-50"
                  style={{ color: COLORS.slate600 }}
                >
                  <Bell className="w-4 h-4" style={{ color: COLORS.slate400 }} />
                  Notification Preferences
                </button>
              </>
            )}

            {variant === "superadmin" && (
              <button
                onClick={() => { showToast("System health dashboard"); setIsOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-slate-50"
                style={{ color: COLORS.slate600 }}
              >
                <CheckCircle2 className="w-4 h-4" style={{ color: COLORS.slate400 }} />
                System Status
              </button>
            )}
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${COLORS.slate200}` }} />

          {/* Legal links */}
          <div className="py-1">
            <a
              href="https://membermd.io/terms"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsOpen(false)}
              className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-slate-50"
              style={{ color: COLORS.slate500, textDecoration: "none", display: "flex" }}
            >
              <FileText className="w-4 h-4" style={{ color: COLORS.slate400 }} />
              Terms of Use
            </a>
            <a
              href="https://membermd.io/privacy"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsOpen(false)}
              className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-slate-50"
              style={{ color: COLORS.slate500, textDecoration: "none", display: "flex" }}
            >
              <Eye className="w-4 h-4" style={{ color: COLORS.slate400 }} />
              Privacy Policy
            </a>
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${COLORS.slate200}` }} />

          {/* Sign Out */}
          <div className="py-1">
            <button
              onClick={() => { auth.logout(); setIsOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-red-50"
              style={{ color: COLORS.red500 }}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
