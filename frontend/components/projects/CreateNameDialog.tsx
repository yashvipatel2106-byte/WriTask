"use client";

import { useEffect, useState } from "react";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import FormLabel from "@/components/ui/FormLabel";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
};

export default function CreateNameDialog({
  open,
  title,
  subtitle,
  label,
  placeholder,
  confirmLabel,
  saving = false,
  error = "",
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  if (!open) return null;

  return (
    <ModalShell onClose={onClose} maxWidth="sm">
      <div className="p-6">
        <ModalHeader title={title} subtitle={subtitle} onClose={onClose} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            void onSubmit(trimmed);
          }}
          className="space-y-4"
        >
          {error ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20">
              {error}
            </p>
          ) : null}
          <div>
            <FormLabel>{label}</FormLabel>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholder}
              className="w-full p-3 rounded-xl bg-slate-50 text-slate-900 border border-slate-200 outline-none focus:ring-4 focus:ring-cyan-100 focus:border-cyan-400 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:focus:ring-cyan-500/20"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-medium disabled:opacity-60 hover:bg-cyan-700"
            >
              {saving ? "Creating..." : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
