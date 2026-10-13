import type { ConfirmOptions } from "./types";
import { CONFIRM_EVENT } from "./types";

/**
 * Professional in-app confirm — returns true if the user confirms.
 * Use instead of `window.confirm()` / `confirm()` (avoids "localhost says").
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent(CONFIRM_EVENT, {
        detail: { ...options, resolve },
      })
    );
  });
}
