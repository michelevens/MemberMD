// ===== MemberMD Design System =====
// Shared UI primitives used across all portals and sections.
// Eliminates duplication and enforces visual consistency.

import { useState, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// ─── Design Tokens ───────────────────────────────────────────────────────────
// Single source of truth — replaces all per-file `const C = {...}` objects.

export const colors = {
  navy900: "#102a43",
  navy800: "#243b53",
  navy700: "#334e68",
  navy600: "#243b53",
  teal500: "#27ab83",
  teal600: "#147d64",
  teal50: "#e6fffa",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  slate700: "#334155",
  white: "#ffffff",
  red50: "#fef2f2",
  red500: "#ef4444",
  red600: "#dc2626",
  green50: "#ecfdf5",
  green500: "#22c55e",
  green600: "#16a34a",
  amber50: "#fffbeb",
  amber500: "#f59e0b",
  amber600: "#d97706",
  blue50: "#eff6ff",
  blue500: "#3b82f6",
  blue600: "#2563eb",
  purple50: "#faf5ff",
  purple500: "#a855f7",
} as const;

// ─── Badge ───────────────────────────────────────────────────────────────────

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "purple";

const badgeStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: colors.green50, text: colors.green600 },
  warning: { bg: colors.amber50, text: colors.amber600 },
  danger: { bg: colors.red50, text: colors.red600 },
  info: { bg: colors.blue50, text: colors.blue600 },
  neutral: { bg: colors.slate100, text: colors.slate600 },
  purple: { bg: colors.purple50, text: colors.purple500 },
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = "neutral", children, className = "" }: BadgeProps) {
  const s = badgeStyles[variant];
  return (
    <span
      className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${className}`}
      style={{ backgroundColor: s.bg, color: s.text }}
      role="status"
    >
      {children}
    </span>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
}

const btnBase = "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

const btnVariants: Record<ButtonVariant, string> = {
  primary: "text-white focus-visible:ring-teal-400",
  secondary: "focus-visible:ring-slate-400",
  danger: "text-white focus-visible:ring-red-400",
  ghost: "hover:bg-slate-100 focus-visible:ring-slate-400",
};

const btnSizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

export function Button({ variant = "primary", size = "md", icon, loading, children, className = "", style, ...props }: ButtonProps) {
  const variantStyle: Record<ButtonVariant, React.CSSProperties> = {
    primary: { backgroundColor: colors.teal500 },
    secondary: { backgroundColor: colors.slate100, color: colors.slate700 },
    danger: { backgroundColor: colors.red600 },
    ghost: { color: colors.slate600 },
  };

  return (
    <button
      className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
      style={{ ...variantStyle[variant], ...style }}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

// ─── StatCard ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bg: string;
  trend?: { value: string; positive: boolean };
}

export function StatCard({ label, value, icon: Icon, color, bg, trend }: StatCardProps) {
  return (
    <div
      className="rounded-xl p-5 shadow-sm border transition-all duration-200 hover:shadow-md"
      style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: colors.slate500 }}
        >
          {label}
        </span>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: bg }}
          aria-hidden="true"
        >
          <Icon size={18} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold" style={{ color: colors.navy900 }}>
        {value}
      </div>
      {trend && (
        <div className="mt-1 flex items-center gap-1">
          <span
            className="text-xs font-medium"
            style={{ color: trend.positive ? colors.green600 : colors.red500 }}
          >
            {trend.positive ? "↑" : "↓"} {trend.value}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── SubTabNav ───────────────────────────────────────────────────────────────

interface SubTab {
  id: string;
  label: string;
  icon: React.ElementType;
  count?: number;
}

interface SubTabNavProps {
  tabs: SubTab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function SubTabNav({ tabs, activeTab, onChange }: SubTabNavProps) {
  return (
    <div
      className="flex gap-1 p-1 rounded-lg"
      style={{ backgroundColor: colors.slate100 }}
      role="tablist"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={activeTab === t.id}
          aria-controls={`panel-${t.id}`}
          onClick={() => onChange(t.id)}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200"
          style={{
            backgroundColor: activeTab === t.id ? colors.white : "transparent",
            color: activeTab === t.id ? colors.navy900 : colors.slate500,
            boxShadow: activeTab === t.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
        >
          <t.icon size={16} aria-hidden="true" />
          {t.label}
          {t.count !== undefined && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: activeTab === t.id ? colors.teal50 : colors.slate200,
                color: activeTab === t.id ? colors.teal600 : colors.slate500,
              }}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerGradient?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, subtitle, headerGradient, children, footer, maxWidth = "max-w-lg" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center animate-modal-in"
      style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`rounded-2xl shadow-2xl w-full ${maxWidth} mx-4 max-h-[90vh] overflow-hidden flex flex-col animate-modal-content`}
        style={{ backgroundColor: colors.white }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-5 flex-shrink-0"
          style={{
            background: headerGradient || `linear-gradient(135deg, ${colors.navy800}, ${colors.navy900})`,
            borderBottom: headerGradient ? "none" : undefined,
          }}
        >
          <div>
            <h3 className="text-base font-semibold text-white">{title}</h3>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors"
            style={{ color: "rgba(255,255,255,0.6)" }}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div
            className="flex justify-end gap-3 p-5 flex-shrink-0 border-t"
            style={{ borderColor: colors.slate200 }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  height?: string;
  showLabel?: boolean;
}

export function ProgressBar({ value, max = 100, color, height = "h-2", showLabel }: ProgressBarProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const autoColor = pct >= 70 ? colors.green500 : pct >= 40 ? colors.amber500 : colors.red500;

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${height} rounded-full overflow-hidden`} style={{ backgroundColor: colors.slate200 }}>
        <div
          className={`${height} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${pct}%`, backgroundColor: color || autoColor }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium tabular-nums" style={{ color: colors.slate600 }}>
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}

// ─── Skeleton Loader ─────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
  lines?: number;
  type?: "text" | "card" | "stat" | "table-row";
}

export function Skeleton({ className = "", lines = 1, type = "text" }: SkeletonProps) {
  if (type === "stat") {
    return (
      <div className="rounded-xl p-5 border animate-pulse" style={{ borderColor: colors.slate200 }}>
        <div className="flex items-center justify-between mb-3">
          <div className="h-3 w-20 rounded" style={{ backgroundColor: colors.slate200 }} />
          <div className="w-9 h-9 rounded-lg" style={{ backgroundColor: colors.slate100 }} />
        </div>
        <div className="h-7 w-16 rounded" style={{ backgroundColor: colors.slate200 }} />
      </div>
    );
  }

  if (type === "card") {
    return (
      <div className="rounded-xl p-5 border animate-pulse" style={{ borderColor: colors.slate200 }}>
        <div className="h-4 w-1/3 rounded mb-3" style={{ backgroundColor: colors.slate200 }} />
        <div className="h-3 w-2/3 rounded mb-2" style={{ backgroundColor: colors.slate100 }} />
        <div className="h-3 w-1/2 rounded" style={{ backgroundColor: colors.slate100 }} />
      </div>
    );
  }

  if (type === "table-row") {
    return (
      <tr className="animate-pulse border-t" style={{ borderColor: colors.slate100 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <td key={i} className="px-5 py-3">
            <div className="h-3 rounded" style={{ backgroundColor: colors.slate200, width: `${60 + Math.random() * 30}%` }} />
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div className={`space-y-2 animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded"
          style={{
            backgroundColor: colors.slate200,
            width: i === lines - 1 ? "60%" : "100%",
          }}
        />
      ))}
    </div>
  );
}

// ─── EmptyStateIllustration ──────────────────────────────────────────────────

interface EmptyIllustrationProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyIllustration({ icon: Icon, title, description, action }: EmptyIllustrationProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-page-in">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ backgroundColor: colors.slate100 }}
      >
        <Icon size={28} style={{ color: colors.slate400 }} aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: colors.navy900 }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm max-w-xs mb-4" style={{ color: colors.slate500 }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  type: "success" | "error" | "info";
  onDismiss?: () => void;
}

export function Toast({ message, type, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss?.(), 300);
    }, 3700);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const bgColor = type === "success" ? colors.green600 : type === "error" ? colors.red600 : colors.blue600;

  return (
    <div
      className="fixed top-4 right-4 z-[60] px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium flex items-center gap-3 transition-all duration-300"
      style={{
        backgroundColor: bgColor,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-12px)",
      }}
      role="alert"
    >
      <span>{message}</span>
      {onDismiss && (
        <button onClick={() => { setVisible(false); setTimeout(() => onDismiss(), 300); }} className="p-0.5 rounded hover:bg-white/20" aria-label="Dismiss">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─── SectionHeader ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: colors.navy900 }}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: colors.slate500 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
