"use client";

import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react";
import type { ToastItem, ToastVariant } from "./types";

const VARIANT_STYLES: Record<
  ToastVariant,
  { icon: typeof CheckCircle2; accent: string; iconClass: string }
> = {
  success: {
    icon: CheckCircle2,
    accent: "border-l-emerald-500",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    icon: XCircle,
    accent: "border-l-red-500",
    iconClass: "text-red-600 dark:text-red-400",
  },
  warning: {
    icon: AlertTriangle,
    accent: "border-l-amber-500",
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  info: {
    icon: Info,
    accent: "border-l-cyan-500",
    iconClass: "text-cyan-600 dark:text-cyan-400",
  },
};

type Props = {
  item: ToastItem;
  onDismiss: (id: string) => void;
};

export function ToastCard({ item, onDismiss }: Props) {
  const style = VARIANT_STYLES[item.variant];
  const Icon = style.icon;

  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-[min(100vw-2rem,22rem)] items-start gap-3 rounded-xl border border-slate-200/90 bg-white/95 p-3.5 shadow-lg shadow-slate-900/10 backdrop-blur-md border-l-4 ${style.accent} animate-toast-in dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-black/40`}
    >
      <Icon
        size={18}
        className={`mt-0.5 shrink-0 ${style.iconClass}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {item.title && (
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            {item.title}
          </p>
        )}
        <p
          className={`text-sm text-slate-600 dark:text-slate-300 ${
            item.title ? "mt-0.5" : ""
          }`}
        >
          {item.description}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
