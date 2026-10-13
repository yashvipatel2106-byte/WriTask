export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastInput = {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

export type ToastItem = {
  id: string;
  title?: string;
  description: string;
  variant: ToastVariant;
  duration: number;
  createdAt: number;
};

export const TOAST_EVENT = "writask:toast";

export type ToastEventDetail = ToastInput & { message?: string };
