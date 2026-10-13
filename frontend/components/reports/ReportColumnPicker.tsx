  "use client";

import { useMemo } from "react";
import type { ReportColumn } from "@/lib/reports/types";
import { DEFAULT_REPORT_COLUMNS } from "@/lib/reports/types";

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core",
  management: "Management",
  schedule: "Schedule",
  other: "Other",
  custom: "Custom fields",
  calculated: "Calculated fields",
};

const CATEGORY_ORDER = [
  "core",
  "management",
  "schedule",
  "other",
  "custom",
  "calculated",
];

const DEFAULT_COLUMN_SET = new Set<string>(DEFAULT_REPORT_COLUMNS);

type Props = {
  columns: ReportColumn[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Create: default columns are locked and hidden. Edit: only Title is locked. */
  mode?: "create" | "edit";
};

export default function ReportColumnPicker({
  columns,
  selected,
  onChange,
  mode = "create",
}: Props) {
  const isCreate = mode === "create";

  const grouped = useMemo(() => {
    const map = new Map<string, ReportColumn[]>();
    for (const col of columns) {
      if (isCreate && DEFAULT_COLUMN_SET.has(col.key)) continue;
      const cat = col.category || "other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(col);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      id: c,
      label: CATEGORY_LABELS[c] || c,
      items: map.get(c)!,
    }));
  }, [columns, isCreate]);

  const toggle = (key: string) => {
    if (key === "title") return;
    if (isCreate && DEFAULT_COLUMN_SET.has(key)) return;
    if (selected.includes(key)) {
      const next = selected.filter((k) => k !== key);
      const required = isCreate ? [...DEFAULT_REPORT_COLUMNS] : ["title"];
      const merged = [...required];
      for (const k of next) {
        if (!merged.includes(k)) merged.push(k);
      }
      onChange(merged);
    } else {
      onChange([...selected, key]);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Columns
        </h3>
        
      </div>
      {grouped.map((group) => (
        <div key={group.id}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 dark:text-slate-500">
            {group.label}
          </p>
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
            {group.items.map((col) => {
              const checked = selected.includes(col.key);
              const locked = col.key === "title";
              return (
                <label
                  key={col.key}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800 ${
                    locked ? "opacity-70" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    checked={checked}
                    disabled={locked}
                    onChange={() => toggle(col.key)}
                  />
                  {col.label}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
