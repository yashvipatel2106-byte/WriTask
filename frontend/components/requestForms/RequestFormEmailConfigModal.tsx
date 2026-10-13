"use client";

import { useState } from "react";

import { ModalShell, ModalHeader } from "@/components/ui/Modal";

export type RequestFormEmailConfig = {
  senderName: string;
  greeting: string;
  message: string;
  closing: string;
};

type Props = {
  initial: RequestFormEmailConfig;
  saving?: boolean;
  onClose: () => void;
  onSave: (config: RequestFormEmailConfig) => void | Promise<void>;
};

export default function RequestFormEmailConfigModal({
  initial,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const [config, setConfig] = useState<RequestFormEmailConfig>(initial);

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  return (
    <ModalShell onClose={onClose} maxWidth="3xl">
      <div className="max-h-[85vh] overflow-y-auto p-6">
      <ModalHeader
        title="Customize your thank-you email"
        subtitle="People who submit this form receive this email with a copy of their responses."
        onClose={onClose}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold">
              Sender&apos;s name
            </label>
            <input
              value={config.senderName}
              onChange={(e) =>
                setConfig((c) => ({ ...c, senderName: e.target.value }))
              }
              placeholder="WriTask"
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Greeting
            </label>
            <input
              value={config.greeting}
              onChange={(e) =>
                setConfig((c) => ({ ...c, greeting: e.target.value }))
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Message
            </label>
            <textarea
              rows={3}
              value={config.message}
              onChange={(e) =>
                setConfig((c) => ({ ...c, message: e.target.value }))
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Closing
            </label>
            <input
              value={config.closing}
              onChange={(e) =>
                setConfig((c) => ({ ...c, closing: e.target.value }))
              }
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            Example email
          </p>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm dark:border-slate-800 dark:bg-slate-950/50">
            <p className="text-slate-700 dark:text-slate-200">
              {config.greeting || "Hello,"}
            </p>
            <p className="mt-2 text-slate-700 dark:text-slate-200">
              {config.message}
            </p>
            <p className="mt-4 text-xs text-slate-400">
              (Form name, reference number and responses appear here)
            </p>
            <p className="mt-4 text-slate-700 dark:text-slate-200">
              {config.closing || "Thank you,"}
              <br />
              {config.senderName || "WriTask"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(config)}
          className="rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      </div>
    </ModalShell>
  );
}
