"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const MAX_WIDTH_CLASS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
} as const;

type ModalShellProps = {
  onClose: () => void;
  children: ReactNode;
  maxWidth?: keyof typeof MAX_WIDTH_CLASS;
  closeOnBackdropClick?: boolean;
  /** Override for dialogs that must stack above another open dialog (e.g. z-[60]). */
  zIndexClassName?: string;
  className?: string;
};

/**
 * Shared backdrop + card shell every dialog in the app should render through,
 * so backdrop color, corner radius, shadow, and stacking stay consistent
 * instead of drifting per-dialog. Callers own everything inside the card.
 *
 * Always portaled to document.body so `position:fixed` is not trapped by a
 * transformed ancestor (e.g. the sliding sidebar).
 */
export function ModalShell({
  onClose,
  children,
  maxWidth = "lg",
  closeOnBackdropClick = true,
  zIndexClassName = "z-[100]",
  className = "",
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleBackdropClick = (e: MouseEvent) => {
    if (!closeOnBackdropClick) return;
    // Only the dimmed backdrop itself — not bubbled child clicks.
    if (e.target !== e.currentTarget) return;
    // Jodit link/image popups are portaled to document.body; never treat them
    // as an outside click that should dismiss this shell.
    const target = e.target as HTMLElement | null;
    if (
      target?.closest?.(
        ".jodit-popup, .jodit-dialog, .jodit-context-menu, .jodit-ui-list, .jodit-toolbar-popup"
      )
    ) {
      return;
    }
    onClose();
  };
  const stopPropagation = (e: MouseEvent) => e.stopPropagation();

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center bg-black/60 p-0 sm:p-4`}
      onClick={handleBackdropClick}
    >
      <div
        className={`w-full ${MAX_WIDTH_CLASS[maxWidth]} isolate overflow-hidden bg-white border border-slate-200 rounded-none sm:rounded-2xl shadow-xl text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 ${className}`}
        onClick={stopPropagation}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

type ModalHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  className?: string;
};

/** Shared "Title / subtitle / X" header row for dialogs that use a plain static title. */
export function ModalHeader({ title, subtitle, onClose, className = "mb-5" }: ModalHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="btn btn-ghost btn-sm !px-2 shrink-0"
      >
        <X size={18} />
      </button>
    </div>
  );
}
