import type { ToastEventDetail, ToastInput, ToastVariant } from "./types";
import { TOAST_EVENT } from "./types";

function emit(detail: ToastEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}

function show(input: string | ToastInput, variant: ToastVariant = "info") {
  if (typeof input === "string") {
    emit({ description: input, variant });
    return;
  }
  emit({ ...input, variant: input.variant ?? variant });
}

/** Imperative toast API — use instead of `alert()`. Bottom-right UI. */
export const toast = {
  show,
  success: (input: string | ToastInput) => show(input, "success"),
  error: (input: string | ToastInput) => show(input, "error"),
  info: (input: string | ToastInput) => show(input, "info"),
  warning: (input: string | ToastInput) => show(input, "warning"),
};
