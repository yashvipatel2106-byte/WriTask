"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ToastCard } from "./ToastCard";
import { TOAST_EVENT, type ToastEventDetail, type ToastItem } from "./types";

const DEFAULT_DURATION = 4200;
const MAX_TOASTS = 4;

function createId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (detail: ToastEventDetail) => {
      const description =
        detail.description?.trim() ||
        detail.message?.trim() ||
        "";
      if (!description && !detail.title) return;

      const item: ToastItem = {
        id: createId(),
        title: detail.title,
        description: description || detail.title || "",
        variant: detail.variant ?? "info",
        duration: detail.duration ?? DEFAULT_DURATION,
        createdAt: Date.now(),
      };

      setItems((prev) => [item, ...prev].slice(0, MAX_TOASTS));
      window.setTimeout(() => dismiss(item.id), item.duration);
    },
    [dismiss]
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<ToastEventDetail>;
      push(custom.detail || {});
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, [push]);

  return (
    <>
      {children}
      <div
        className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col-reverse gap-2 sm:top-6 sm:right-6"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}
