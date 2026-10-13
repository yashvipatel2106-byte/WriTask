"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import Select, { fieldSelectTriggerClass } from "@/components/ui/Select";
import ThemedDatePicker from "@/components/ui/ThemedDatePicker";
import type { DateFilter, ReportFilters, ReportMeta } from "@/lib/reports/types";

const DATE_OPS = [
  { value: "", label: "Any" },
  { value: "is", label: "Is" },
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
  { value: "between", label: "Between" },
];

type Props = {
  meta: ReportMeta | null;
  filters: ReportFilters;
  onChange: (next: ReportFilters) => void;
};

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-b border-slate-200 last:border-b-0 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 py-3 text-left"
      >
        <ChevronRight
          size={14}
          className={`shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </h4>
      </button>
      {open ? <div className="pb-3 pl-5">{children}</div> : null}
    </section>
  );
}

function toggleList(list: string[] | undefined, id: string) {
  const current = list || [];
  return current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
}

function DateFilterFields({
  value,
  onChange,
}: {
  value?: DateFilter;
  onChange: (next: DateFilter) => void;
}) {
  const op = value?.operator || "";
  return (
    <div className="space-y-2">
      <Select
        value={op}
        onChange={(next) => onChange({ ...value, operator: next as DateFilter["operator"] })}
        options={DATE_OPS}
        className="w-full"
        triggerClassName={fieldSelectTriggerClass}
        menuZIndexClassName="z-[200]"
      />
      {op && op !== "between" && (
        <ThemedDatePicker
          value={value?.value || ""}
          onChange={(v) => onChange({ ...value, operator: op as DateFilter["operator"], value: v })}
        />
      )}
      {op === "between" && (
        <div className="grid grid-cols-2 gap-2">
          <ThemedDatePicker
            value={value?.value || ""}
            onChange={(v) => onChange({ ...value, operator: "between", value: v })}
            placeholder="From"
          />
          <ThemedDatePicker
            value={value?.value2 || ""}
            onChange={(v) => onChange({ ...value, operator: "between", value2: v })}
            placeholder="To"
          />
        </div>
      )}
    </div>
  );
}

export default function ReportFilterPanel({ meta, filters, onChange }: Props) {
  const statuses = meta?.statuses || [];
  const grouped = {
    active: statuses.filter((s) => s.group === "active"),
    completed: statuses.filter((s) => s.group === "completed"),
    deferred: statuses.filter((s) => s.group === "deferred"),
    canceled: statuses.filter((s) => s.group === "canceled"),
  };

  const toggleGroup = (group: keyof typeof grouped) => {
    const ids = grouped[group].map((s) => s.id);
    const selected = new Set(filters.status || []);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    if (allOn) ids.forEach((id) => selected.delete(id));
    else ids.forEach((id) => selected.add(id));
    onChange({ ...filters, status: [...selected] });
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1 dark:text-slate-100">
        Filters
      </h3>
      <p className="text-xs text-slate-500 mb-3 dark:text-slate-400">
        Click the arrow next to a filter to open it and set a value.
      </p>

      <FilterSection title="Custom item type">
        <div className="space-y-1">
          {(meta?.customItemTypes || []).map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-cyan-600"
                checked={(filters.customItemType || []).includes(item.id)}
                onChange={() =>
                  onChange({
                    ...filters,
                    customItemType: toggleList(filters.customItemType, item.id),
                  })
                }
              />
              {item.label}
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Status">
        <div className="space-y-1 mb-3">
          {(meta?.statusGroups || []).map((g) => {
            const ids = statuses.filter((s) => s.group === g.group).map((s) => s.id);
            const selected = filters.status || [];
            const checked = ids.length > 0 && ids.every((id) => selected.includes(id));
            return (
              <label key={g.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-cyan-600"
                  checked={checked}
                  onChange={() => toggleGroup(g.group as keyof typeof grouped)}
                />
                {g.label}
              </label>
            );
          })}
        </div>
        <p className="text-xs font-medium text-slate-500 mb-1 dark:text-slate-400">
          Default Workflow
        </p>
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {statuses.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-cyan-600"
                checked={(filters.status || []).includes(s.id)}
                onChange={() =>
                  onChange({
                    ...filters,
                    status: toggleList(filters.status, s.id),
                  })
                }
              />
              {s.label}
            </label>
          ))}
          {statuses.length === 0 && (
            <p className="text-xs text-slate-400">Loading statuses…</p>
          )}
        </div>
      </FilterSection>

      <FilterSection title="Assignee">
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {(meta?.assignees || []).map((u) => (
            <label key={u._id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-cyan-600"
                checked={(filters.assignee || []).includes(u._id)}
                onChange={() =>
                  onChange({
                    ...filters,
                    assignee: toggleList(filters.assignee, u._id),
                  })
                }
              />
              {u.name}
            </label>
          ))}
          {(meta?.assignees || []).length === 0 && (
            <p className="text-xs text-slate-400">No workspace members yet.</p>
          )}
        </div>
      </FilterSection>

      <FilterSection title="Tasks to do">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-cyan-600"
            checked={Boolean(filters.tasksToDo)}
            onChange={(e) =>
              onChange({ ...filters, tasksToDo: e.target.checked })
            }
          />
          Incomplete tasks only
        </label>
      </FilterSection>

      {(meta?.taskTypes || []).length > 0 && (
        <FilterSection title="Task type">
          <div className="space-y-1">
            {meta!.taskTypes.map((tag) => (
              <label key={tag} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-cyan-600"
                  checked={(filters.taskType || []).includes(tag)}
                  onChange={() =>
                    onChange({
                      ...filters,
                      taskType: toggleList(filters.taskType, tag),
                    })
                  }
                />
                {tag}
              </label>
            ))}
          </div>
        </FilterSection>
      )}

      <FilterSection title="Importance">
        <div className="space-y-1">
          {(meta?.importance || []).map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm capitalize">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-cyan-600"
                checked={(filters.importance || []).includes(item.id)}
                onChange={() =>
                  onChange({
                    ...filters,
                    importance: toggleList(filters.importance, item.id),
                  })
                }
              />
              {item.label}
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Effort">
        <Select
          value={filters.effort?.operator || ""}
          onChange={(next) =>
            onChange({
              ...filters,
              effort: { ...filters.effort, operator: next as DateFilter["operator"] },
            })
          }
          options={DATE_OPS}
          className="w-full"
          triggerClassName={fieldSelectTriggerClass}
          menuZIndexClassName="z-[200]"
        />
        {filters.effort?.operator && filters.effort.operator !== "between" && (
          <input
            type="number"
            min={0}
            step="0.5"
            className="field-input mt-2"
            placeholder="Hours"
            value={filters.effort.value || ""}
            onChange={(e) =>
              onChange({
                ...filters,
                effort: { ...filters.effort, value: e.target.value },
              })
            }
          />
        )}
        {filters.effort?.operator === "between" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              className="field-input"
              placeholder="From"
              value={filters.effort.value || ""}
              onChange={(e) =>
                onChange({
                  ...filters,
                  effort: { ...filters.effort, value: e.target.value },
                })
              }
            />
            <input
              type="number"
              min={0}
              className="field-input"
              placeholder="To"
              value={filters.effort.value2 || ""}
              onChange={(e) =>
                onChange({
                  ...filters,
                  effort: { ...filters.effort, value2: e.target.value },
                })
              }
            />
          </div>
        )}
      </FilterSection>

      {(
        [
          ["createdDate", "Created date"],
          ["startDate", "Start date"],
          ["dueDate", "Due date"],
          ["completedDate", "Completed date"],
          ["lastModifiedDate", "Last modified date"],
        ] as const
      ).map(([key, label]) => (
        <FilterSection key={key} title={label}>
          <DateFilterFields
            value={filters[key]}
            onChange={(next) => onChange({ ...filters, [key]: next })}
          />
        </FilterSection>
      ))}

      <FilterSection title="Author">
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {(meta?.authors || []).map((u) => (
            <label key={u._id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-cyan-600"
                checked={(filters.author || []).includes(u._id)}
                onChange={() =>
                  onChange({
                    ...filters,
                    author: toggleList(filters.author, u._id),
                  })
                }
              />
              {u.name}
            </label>
          ))}
        </div>
      </FilterSection>
    </div>
  );
}
