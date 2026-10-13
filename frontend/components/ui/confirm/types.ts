export type ConfirmVariant = "danger" | "default";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
};

export type ConfirmRequest = ConfirmOptions & {
  id: string;
  resolve: (value: boolean) => void;
};

export const CONFIRM_EVENT = "writask:confirm";
