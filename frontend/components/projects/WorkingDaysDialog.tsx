"use client";

import { useEffect, useState } from "react";
import {
  DAY_OPTIONS,
  DEFAULT_WORKING_DAYS,
  formatWorkingDaysSummary,
  normalizeWorkingDays,
} from "@/lib/workingDays";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";

type Props = {
  open: boolean;
  value: number[];
  canEdit: boolean;
  onClose: () => void;
  onApply: (days: number[]) => void;
};

export default function WorkingDaysDialog({
  open,
  value,
  canEdit,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState<number[]>(normalizeWorkingDays(value));

  useEffect(() => {
    if (open) setDraft(normalizeWorkingDays(value));
  }, [open, value]);

  if (!open) return null;

  const toggleDay = (day: number) => {
    if (!canEdit) return;
    setDraft((prev) => {
      const next = prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b);
      return next.length > 0 ? next : prev;
    });
  };

  const setSaturday = (enabled: boolean) => {
    if (!canEdit) return;
    setDraft((prev) => {
      const next = enabled
        ? normalizeWorkingDays([...prev, 6])
        : prev.filter((d) => d !== 6);
      return next.length > 0 ? next : prev;
    });
  };

  const setSunday = (enabled: boolean) => {
    if (!canEdit) return;
    setDraft((prev) => {
      const next = enabled
        ? normalizeWorkingDays([...prev, 0])
        : prev.filter((d) => d !== 0);
      return next.length > 0 ? next : prev;
    });
  };

  const handleApply = () => {
    onApply(normalizeWorkingDays(draft));
    onClose();
  };

  const handleReset = () => {
    if (!canEdit) return;
    setDraft([...DEFAULT_WORKING_DAYS]);
  };

  return (
    <ModalShell
      onClose={onClose}
      maxWidth="md"
      zIndexClassName="z-[60]"
      className="p-5"
    >
        <ModalHeader
          title="Working days"
          subtitle="Choose which days count for duration and effort allocation."
          onClose={onClose}
          className="mb-4"
        />

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Quick options
          </p>
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={draft.includes(6)}
              onChange={(e) => setSaturday(e.target.checked)}
              disabled={!canEdit}
              className="rounded border-slate-300 bg-white text-cyan-600 dark:border-slate-600 dark:bg-slate-900"
            />
            Saturday working
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={draft.includes(0)}
              onChange={(e) => setSunday(e.target.checked)}
              disabled={!canEdit}
              className="rounded border-slate-300 bg-white text-cyan-600 dark:border-slate-600 dark:bg-slate-900"
            />
            Sunday working
          </label>
        </div>

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-3 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Customize
          </p>
          <div className="flex flex-wrap gap-2">
            {DAY_OPTIONS.map((day) => {
              const active = draft.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleDay(day.value)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                    active
                      ? "border-cyan-400 bg-cyan-50 text-cyan-700 dark:border-cyan-500 dark:bg-cyan-400/10 dark:text-cyan-300"
                      : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                  }`}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            At least one day must stay selected.
          </p>
        </div>

        <p className="mb-4 text-sm text-cyan-700/80 dark:text-cyan-400/80">
          Schedule uses: {formatWorkingDaysSummary(draft)}
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={handleReset}
              className="mr-auto text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Reset to Mon–Fri
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleApply}
              className="btn btn-primary"
            >
              Apply
            </button>
          )}
        </div>
    </ModalShell>
  );
}
