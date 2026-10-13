"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, LayoutGrid, Plus, Search } from "lucide-react";
import type { ProjectCustomField } from "@/lib/kanbanCardPreview";
import type { TaskCustomFieldValue } from "@/lib/customFieldValues";
import {
  clampPercentageValue,
  isDigitKey,
  parseNumericCustomFieldInput,
  sanitizeNumericCustomFieldInput,
  sanitizeTextCustomFieldInput,
} from "@/lib/customFieldValues";
import CreateCustomFieldDialog from "./CreateCustomFieldDialog";
import Select, { fieldSelectTriggerClass } from "@/components/ui/Select";

export type TaskDetailSystemField = {
  id: string;
  label: string;
  /** Rendered value (avatar+name, dates, etc.) */
  display: ReactNode;
  empty?: boolean;
  onClick?: () => void;
};

type Props = {
  /** Card-preview-enabled custom fields — shown only when the expand control is open. */
  fields: ProjectCustomField[];
  values: TaskCustomFieldValue[];
  canEdit: boolean;
  projectId?: string;
  organizationId?: string | null;
  /** Built-in fields shown by default above custom fields */
  systemFields?: TaskDetailSystemField[];
  onChange: (values: TaskCustomFieldValue[]) => void;
  onFieldCreated?: (field: ProjectCustomField) => void;
};

function getValue(values: TaskCustomFieldValue[], fieldId: string) {
  return values.find((row) => row.fieldId === fieldId)?.value;
}

function setValue(
  values: TaskCustomFieldValue[],
  fieldId: string,
  value: unknown
) {
  const existing = values.some((row) => row.fieldId === fieldId);
  if (existing) {
    return values.map((row) =>
      row.fieldId === fieldId ? { ...row, value } : row
    );
  }
  return [...values, { fieldId, value }];
}

function isEmptyValue(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function formatNumberDisplay(
  value: unknown,
  field: ProjectCustomField
): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  const decimals = field.numberConfig?.decimalPlaces ?? 0;
  const fixed = n.toFixed(decimals);
  if (!field.numberConfig?.useThousandsSeparator) return fixed;
  const [intPart, decPart] = fixed.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

function EmptyLabel() {
  return <span className="text-slate-400 dark:text-slate-500">Empty</span>;
}

function FieldGridRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 min-h-[44px] px-3.5 py-2.5 bg-white dark:bg-slate-900/80">
      <div className="min-w-0 w-[42%] shrink-0">
        <p
          className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200"
          title={label}
        >
          {label}
        </p>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function FieldValueControl({
  field,
  value,
  canEdit,
  editing,
  onStartEdit,
  onStopEdit,
  onUpdate,
}: {
  field: ProjectCustomField;
  value: unknown;
  canEdit: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdate: (next: unknown) => void;
}) {
  const empty = isEmptyValue(value);

  if (!canEdit && empty) return <EmptyLabel />;

  if (field.type === "checkbox") {
          return (
      <label className="inline-flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
        <input
          type="checkbox"
          checked={value === true}
          disabled={!canEdit}
          onChange={(event) => onUpdate(event.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
        />
        <span className={value === true ? "" : "text-slate-400"}>
          {value === true ? "Yes" : "Empty"}
        </span>
              </label>
    );
  }

  if (field.type === "single_select") {
    if (!editing && !canEdit) {
      return empty ? (
        <EmptyLabel />
      ) : (
        <span className="text-sm text-slate-800 dark:text-slate-100">
          {String(value)}
        </span>
      );
    }
    if (!editing && canEdit) {
      return (
        <button
          type="button"
          onClick={onStartEdit}
          className="text-left text-sm w-full truncate hover:text-cyan-700 dark:hover:text-cyan-400"
        >
          {empty ? (
            <EmptyLabel />
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {String(value)}
            </span>
          )}
        </button>
      );
    }
    return (
      <Select
                  value={typeof value === "string" ? value : ""}
                  disabled={!canEdit}
        autoOpen
        className="w-full"
        triggerClassName={(open) =>
          fieldSelectTriggerClass(open, "!h-9 !py-1 !text-sm")
        }
        options={[
          { value: "", label: "Empty" },
          ...(field.options || []).map((option) => ({
            value: option,
            label: option,
          })),
        ]}
        onChange={(next) => {
          onUpdate(next || null);
          onStopEdit();
        }}
        onOpenChange={(open) => {
          if (!open) onStopEdit();
        }}
      />
    );
  }

  if (field.type === "multiple_select") {
    const selected = Array.isArray(value) ? value : [];
    if (!editing) {
      return (
        <button
          type="button"
                  disabled={!canEdit}
          onClick={onStartEdit}
          className={`text-left text-sm w-full truncate disabled:cursor-default hover:text-cyan-700 dark:hover:text-cyan-400`}
        >
          {selected.length === 0 ? (
            <EmptyLabel />
          ) : (
            <span className="text-slate-800 dark:text-slate-100">
              {selected.join(", ")}
            </span>
          )}
        </button>
      );
    }
    return (
      <div className="rounded-lg border border-slate-200 p-2 space-y-1.5 bg-white dark:border-slate-700 dark:bg-slate-900">
        {(field.options || []).map((option) => {
          const checked = selected.includes(option);
          return (
            <label
              key={option}
              className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = checked
                    ? selected.filter((item) => item !== option)
                    : [...selected, option];
                  onUpdate(next);
                }}
                className="h-3.5 w-3.5 rounded"
              />
              {option}
            </label>
          );
        })}
        <button
          type="button"
          onClick={onStopEdit}
          className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400"
        >
          Done
        </button>
      </div>
    );
  }

  if (field.type === "number" || field.type === "percentage") {
    if (!editing) {
      const display =
        field.type === "number"
          ? formatNumberDisplay(value, field)
          : empty
            ? ""
            : `${value}%`;
      return (
        <button
          type="button"
          disabled={!canEdit}
          onClick={onStartEdit}
          className={`text-left text-sm w-full truncate disabled:cursor-default hover:text-cyan-700 dark:hover:text-cyan-400`}
        >
          {empty ? (
            <EmptyLabel />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
              {field.numberConfig?.showConditionalMarker &&
              field.type === "number" ? (
                <span className="inline-flex gap-0.5" aria-hidden>
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
              ) : null}
              {display}
            </span>
          )}
        </button>
      );
    }
    return (
                <div className="relative">
                  <input
          autoFocus
          type="text"
          inputMode="decimal"
                    value={
            value === null || value === undefined || value === ""
                        ? ""
                        : String(value)
                    }
                    disabled={!canEdit}
                    onChange={(event) => {
            const cleaned = sanitizeNumericCustomFieldInput(event.target.value);
            if (cleaned === "" || cleaned === "-" || cleaned === ".") {
              onUpdate(null);
              return;
            }
            onUpdate(parseNumericCustomFieldInput(cleaned));
          }}
          onBlur={() => {
            if (
              field.type === "percentage" &&
              typeof value === "number" &&
              Number.isFinite(value)
            ) {
              onUpdate(clampPercentageValue(value));
            }
            onStopEdit();
          }}
          onKeyDown={(e) => {
            if (
              e.key.length === 1 &&
              /[^\d.-]/.test(e.key) &&
              !e.ctrlKey &&
              !e.metaKey
            ) {
              e.preventDefault();
              return;
            }
            if (e.key === "Enter" || e.key === "Escape") onStopEdit();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = sanitizeNumericCustomFieldInput(
              e.clipboardData.getData("text")
            );
            if (!pasted) return;
            onUpdate(parseNumericCustomFieldInput(pasted));
          }}
          placeholder={field.type === "percentage" ? "0–100" : "0"}
          className="field-input !py-1 !text-sm w-full pr-7"
        />
        {field.type === "percentage" && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    %
                  </span>
        )}
                </div>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
                  disabled={!canEdit}
        onClick={onStartEdit}
        className={`text-left text-sm w-full truncate disabled:cursor-default hover:text-cyan-700 dark:hover:text-cyan-400`}
      >
        {empty ? (
          <EmptyLabel />
        ) : (
          <span className="text-slate-800 dark:text-slate-100">
            {String(value)}
          </span>
        )}
      </button>
    );
  }

                      return (
                          <input
      autoFocus
      type="text"
      value={typeof value === "string" ? value : ""}
                            disabled={!canEdit}
      onChange={(event) =>
        onUpdate(sanitizeTextCustomFieldInput(event.target.value))
      }
      onKeyDown={(e) => {
        if (isDigitKey(e.key)) {
          e.preventDefault();
          return;
        }
        if (e.key === "Enter" || e.key === "Escape") onStopEdit();
      }}
      onPaste={(e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text");
        const current = typeof value === "string" ? value : "";
        const next = sanitizeTextCustomFieldInput(current + pasted);
        onUpdate(next);
      }}
      onBlur={onStopEdit}
      placeholder="Empty"
      className="field-input !py-1 !text-sm w-full"
    />
  );
}

export default function TaskCustomFields({
  fields,
  values,
  canEdit,
  projectId,
  organizationId = null,
  systemFields = [],
  onChange,
  onFieldCreated,
}: Props) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCustomFields, setShowCustomFields] = useState(
    () => fields.length > 0
  );

  useEffect(() => {
    if (fields.length > 0) {
      setShowCustomFields(true);
    }
  }, [fields.length]);

  const filteredCustom = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const pool = showCustomFields || needle ? fields : [];
    if (!needle) return pool;
    return pool.filter((field) =>
      field.name.toLowerCase().includes(needle)
    );
  }, [fields, showCustomFields, search]);

  const hasEnabledCustomFields = fields.length > 0;
  const isSearching = search.trim().length > 0;

  const filteredSystem = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return systemFields;
    return systemFields.filter((field) =>
      field.label.toLowerCase().includes(needle)
    );
  }, [systemFields, search]);

  const hasAnyRows = filteredSystem.length > 0 || filteredCustom.length > 0;

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shadow-sm dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 bg-white/80 dark:border-slate-700 dark:bg-slate-900/50">
        <div className="relative flex-1 min-w-0 max-w-sm">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Fields"
            className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-cyan-500/50 dark:focus:ring-cyan-500/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowCustomFields((open) => !open)}
          disabled={!hasEnabledCustomFields}
          className={`inline-flex items-center justify-center rounded-lg border p-1.5 transition-colors disabled:cursor-default disabled:opacity-40 ${
            showCustomFields
              ? "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300"
              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          }`}
          title={
            !hasEnabledCustomFields
              ? "No custom fields enabled for this task"
              : showCustomFields
                ? "Hide custom fields"
                : "Show custom fields"
          }
          aria-label={
            showCustomFields ? "Hide custom fields" : "Show custom fields"
          }
          aria-expanded={showCustomFields}
        >
          <ChevronDown
            size={15}
            className={`transition-transform duration-200 ${
              showCustomFields ? "rotate-180" : ""
            }`}
          />
        </button>
        <div className="ml-auto flex items-center gap-1">
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              title="Create custom field"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Field</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title="Manage custom fields"
            aria-label="Manage custom fields"
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {!hasAnyRows ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {fields.length === 0 && systemFields.length === 0
              ? "No fields yet."
              : isSearching
                ? "No fields match your search."
                : showCustomFields
                  ? "No custom fields to show."
                  : "No fields match your search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200 dark:bg-slate-700">
          {filteredSystem.map((field) => (
            <FieldGridRow key={field.id} label={field.label}>
              {field.onClick ? (
                <button
                  type="button"
                  onClick={field.onClick}
                  className="text-left text-sm w-full truncate hover:text-cyan-700 dark:hover:text-cyan-400"
                >
                  {field.empty ? <EmptyLabel /> : field.display}
                </button>
              ) : field.empty ? (
                <EmptyLabel />
              ) : (
                <div className="text-sm text-slate-800 dark:text-slate-100">
                  {field.display}
                </div>
              )}
            </FieldGridRow>
          ))}

          {filteredCustom.map((field) => {
            const value = getValue(values, field.id);
            return (
              <FieldGridRow key={field.id} label={field.name}>
                <FieldValueControl
                  field={field}
                  value={value}
                  canEdit={canEdit}
                  editing={editingId === field.id}
                  onStartEdit={() => setEditingId(field.id)}
                  onStopEdit={() => setEditingId(null)}
                  onUpdate={(nextValue) =>
                    onChange(setValue(values, field.id, nextValue))
                  }
                />
              </FieldGridRow>
          );
        })}
      </div>
      )}

      {showCreate && (
        <CreateCustomFieldDialog
          projectId={projectId}
          initialOrganizationId={organizationId}
          initialIncludePersonal={!organizationId}
          onClose={() => setShowCreate(false)}
          onSaved={(field) => {
            onFieldCreated?.(field);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}
