export const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

/** Shared chip classes for Kanban / table task priority badges. */
export const PRIORITY_CHIP: Record<string, string> = {
  high: "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10",
  medium: "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10",
  low: "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800",
};
