"use client";

import ThemedDatePicker from "@/components/ui/ThemedDatePicker";
import Select from "@/components/ui/Select";

export type ProjectBilling = "billable" | "non_billable";

export type ProjectScheduleBudgetValues = {
  /** "yyyy-MM-dd", "" when unset — same convention as ThemedDatePicker. */
  startDate: string;
  dueDate: string;
  billing: ProjectBilling;
  /** Raw text input value (not yet parsed to a number) — "" when unset. */
  budget: string;
};

export const DEFAULT_PROJECT_SCHEDULE_BUDGET: ProjectScheduleBudgetValues = {
  startDate: "",
  dueDate: "",
  billing: "billable",
  budget: "",
};

const BILLING_OPTIONS = [
  { value: "billable", label: "Billable" },
  { value: "non_billable", label: "Non-billable" },
];

const fieldLabelClass =
  "mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300";

/**
 * Start date / Due date / Billing / Budget — shared by Create Project and
 * Edit Project so both stay visually and behaviorally identical. Reuses
 * the app's existing ThemedDatePicker/Select components and the shared
 * `.field-input` style, not one-off inputs.
 */
export default function ProjectScheduleBudgetFields({
  values,
  onChange,
  error,
}: {
  values: ProjectScheduleBudgetValues;
  onChange: (next: Partial<ProjectScheduleBudgetValues>) => void;
  error?: string | null;
}) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabelClass}>
            Start date{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <ThemedDatePicker
            value={values.startDate}
            onChange={(value) => onChange({ startDate: value })}
            placeholder="Select date"
          />
        </div>

        <div>
          <label className={fieldLabelClass}>
            Due date{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <ThemedDatePicker
            value={values.dueDate}
            onChange={(value) => onChange({ dueDate: value })}
            placeholder="Select date"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabelClass}>Billing</label>
          <Select
            value={values.billing}
            onChange={(value) => onChange({ billing: value as ProjectBilling })}
            options={BILLING_OPTIONS}
            ariaLabel="Billing"
          />
        </div>

        <div>
          <label className={fieldLabelClass}>
            Budget{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500">
              $
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={values.budget}
              onChange={(e) => onChange({ budget: e.target.value })}
              placeholder="50,000"
              className="field-input pl-7"
            />
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
