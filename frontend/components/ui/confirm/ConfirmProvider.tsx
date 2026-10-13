"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ModalShell } from "@/components/ui/Modal";
import {
  CONFIRM_EVENT,
  type ConfirmOptions,
  type ConfirmRequest,
  type ConfirmVariant,
} from "./types";

type Pending = ConfirmRequest | null;

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending>(null);

  const close = useCallback((result: boolean) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<
        ConfirmOptions & { resolve: (value: boolean) => void }
      >;
      const detail = custom.detail;
      if (!detail?.resolve) return;

      setPending((current) => {
        // If a dialog is already open, reject the previous waiter
        current?.resolve(false);
        return {
          id: `confirm-${Date.now()}`,
          title: detail.title,
          description: detail.description,
          confirmLabel: detail.confirmLabel ?? "Confirm",
          cancelLabel: detail.cancelLabel ?? "Cancel",
          variant: detail.variant ?? "danger",
          resolve: detail.resolve,
        };
      });
    };

    window.addEventListener(CONFIRM_EVENT, handler);
    return () => window.removeEventListener(CONFIRM_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  return (
    <>
      {children}
      {pending && (
        <ConfirmDialogView
          title={pending.title}
          description={pending.description}
          confirmLabel={pending.confirmLabel}
          cancelLabel={pending.cancelLabel}
          variant={pending.variant ?? "danger"}
          onCancel={() => close(false)}
          onConfirm={() => close(true)}
        />
      )}
    </>
  );
}

function ConfirmDialogView({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onCancel,
  onConfirm,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDanger = variant === "danger";

  return (
    <ModalShell
      onClose={onCancel}
      maxWidth="sm"
      zIndexClassName="z-[110]"
      closeOnBackdropClick
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              isDanger
                ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                : "bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-400"
            }`}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {title}
            </h2>
            {description && (
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-ghost"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              isDanger
                ? "btn bg-red-600 text-white hover:bg-red-700 border-transparent dark:bg-red-600 dark:hover:bg-red-500"
                : "btn btn-primary"
            }
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
