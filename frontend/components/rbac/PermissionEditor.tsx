"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import type { PermissionItem } from "@/lib/rbac";

export function TickCheckbox({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={`relative inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
        checked
          ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-700 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-400"
          : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-cyan-400/25 dark:hover:border-cyan-400/20"}`}
    >
      <span
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          checked
            ? "border-cyan-400 bg-cyan-500 text-white"
            : "border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-800"
        }`}
      >
        <Check size={11} strokeWidth={3} />
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span>{label}</span>
    </label>
  );
}

export function PermissionGroup({
  title,
  items,
  selected,
  disabled,
  onToggle,
  onSelectAll,
}: {
  title: string;
  items: PermissionItem[];
  selected: string[];
  disabled?: boolean;
  onToggle: (key: string, enabled: boolean) => void;
  /** Grants every permission in this group at once — omit to hide the button. */
  onSelectAll?: () => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const item of items) {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [items]);

  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.key));

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h4>
        {onSelectAll && !disabled && (
          <button
            type="button"
            onClick={onSelectAll}
            disabled={allSelected}
            className="text-xs font-medium text-cyan-700 hover:text-cyan-600 disabled:text-slate-400 disabled:cursor-not-allowed dark:text-cyan-400 dark:hover:text-cyan-300 dark:disabled:text-slate-500"
          >
            Select all
          </button>
        )}
      </div>
      <div className="space-y-4">
        {groups.map(([group, groupItems]) => (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-2 dark:text-slate-400">
              {group}
            </p>
            <div className="flex flex-wrap gap-2">
              {groupItems.map((item) => (
                <TickCheckbox
                  key={item.key}
                  label={item.label}
                  checked={selected.includes(item.key)}
                  disabled={disabled}
                  onChange={(enabled) => onToggle(item.key, enabled)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
