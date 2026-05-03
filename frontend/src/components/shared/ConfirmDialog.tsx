// Shared confirm dialog + useConfirm hook.
//
// Pattern ported from InsureFlow — replaces native window.confirm() across
// the app with a styled, keyboard-accessible, awaitable dialog. Mount
// ConfirmProvider near the app root once; call useConfirm() in any
// component to get an async confirmation.
//
// Why an async hook (not just a controlled component):
//   const confirm = useConfirm();
//   const ok = await confirm({ title: 'Delete plan?', message: '...' });
//   if (!ok) return;
//   // proceed
//
// That call site reads top-to-bottom and survives the user-cancels case
// without callbacks/state in the caller. With native confirm() the API
// is the same but the UI is browser-default and not theme-able; this
// gives us the same ergonomics with a real modal.

import { useEffect, useRef, useState, useCallback, createContext, useContext } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Trash2, HelpCircle } from "lucide-react";

type ConfirmVariant = "danger" | "warning" | "info";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

interface ConfirmDialogProps extends ConfirmOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const variantConfig: Record<ConfirmVariant, {
  Icon: typeof Trash2;
  iconBg: string;
  iconColor: string;
  confirmBg: string;
  confirmHover: string;
}> = {
  danger: {
    Icon: Trash2,
    iconBg: "#fee2e2",
    iconColor: "#dc2626",
    confirmBg: "#dc2626",
    confirmHover: "#b91c1c",
  },
  warning: {
    Icon: AlertTriangle,
    iconBg: "#fef3c7",
    iconColor: "#d97706",
    confirmBg: "#d97706",
    confirmHover: "#b45309",
  },
  info: {
    Icon: HelpCircle,
    iconBg: "#e0e7ff",
    iconColor: "#4f46e5",
    confirmBg: "#4f46e5",
    confirmHover: "#4338ca",
  },
};

export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading = false,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) onCancel();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    // Pull focus to confirm button so keyboard users can hit Enter.
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
      clearTimeout(t);
    };
  }, [isOpen, onCancel, isLoading]);

  if (!isOpen) return null;

  const cfg = variantConfig[variant];
  const Icon = cfg.Icon;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === overlayRef.current && !isLoading) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: cfg.iconBg }}
          >
            <Icon className="w-7 h-7" style={{ color: cfg.iconColor }} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
          <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmBtnRef}
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: cfg.confirmBg }}
            onMouseEnter={(e) => { (e.currentTarget.style.backgroundColor = cfg.confirmHover); }}
            onMouseLeave={(e) => { (e.currentTarget.style.backgroundColor = cfg.confirmBg); }}
          >
            {isLoading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hook + Provider ────────────────────────────────────────────────

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    isOpen: false,
    options: { title: "", message: "" },
    resolve: null,
  });

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setState({ isOpen: true, options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState((s) => ({ ...s, isOpen: false, resolve: null }));
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState((s) => ({ ...s, isOpen: false, resolve: null }));
  }, [state.resolve]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        isOpen={state.isOpen}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        {...state.options}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
}
