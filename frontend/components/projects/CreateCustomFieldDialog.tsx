"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Check,
  ChevronDown,
  Hash,
  Info,
  List,
  Pencil,
  Percent,
  Plus,
  TextCursorInput,
  Trash2,
  Type,
} from "lucide-react";
import { ModalShell } from "@/components/ui/Modal";
import Select, { fieldSelectTriggerClass } from "@/components/ui/Select";
import { authFetch } from "@/lib/validation/authFetch";
import {
  ALLOWED_CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  type CustomFieldNumberConfig,
  type CustomFieldSpaceType,
  type CustomFieldType,
  type ProjectCustomField,
} from "@/lib/kanbanCardPreview";

export type CustomFieldSpaceOption = {
  organizationId: string | null;
  name: string;
  slug?: string;
  canManage?: boolean;
  isPersonal?: boolean;
};

type Props = {
  /** When creating from a project, pre-select that project's space. */
  projectId?: string;
  initialOrganizationId?: string | null;
  initialIncludePersonal?: boolean;
  /** Pre-select workspace (e.g. project's workspace in card preview). */
  initialWorkspaceId?: string | null;
  /** Edit existing catalog field (account-level). */
  editingField?: ProjectCustomField | null;
  onClose: () => void;
  onSaved: (field: ProjectCustomField) => void;
};

function deriveInitialSpaceType(
  field: ProjectCustomField | null | undefined,
  initialOrganizationId: string | null,
  initialIncludePersonal: boolean
): CustomFieldSpaceType {
  if (field?.spaceType) return field.spaceType;
  if (field?.includePersonal && !(field.organizationIds || []).length) {
    return "internal";
  }
  if (initialIncludePersonal && !initialOrganizationId) return "internal";
  if (initialOrganizationId) return "external";
  return "internal";
}

function deriveInitialSpaceId(
  field: ProjectCustomField | null | undefined,
  initialOrganizationId: string | null,
  spaceType: CustomFieldSpaceType
): string {
  if (field?.spaceId) return field.spaceId;
  if (field?.organizationIds?.[0]) return field.organizationIds[0];
  if (spaceType === "internal") return "personal";
  if (initialOrganizationId) return initialOrganizationId;
  if (field?.includePersonal) return "personal";
  return "";
}

const TYPE_ICONS: Record<CustomFieldType, typeof Type> = {
  text: Type,
  number: Hash,
  percentage: Percent,
  single_select: List,
  multiple_select: List,
  checkbox: Check,
};

const AGGREGATION_OPTIONS = [
  { value: "none", label: "None" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
] as const;

const DEFAULT_NUMBER_CONFIG: CustomFieldNumberConfig = {
  defaultAggregation: "none",
  decimalPlaces: 0,
  sample: "5000",
  useThousandsSeparator: false,
  showConditionalMarker: false,
};

function formatSample(
  sample: string,
  decimalPlaces: number,
  useThousandsSeparator: boolean
) {
  const n = Number(String(sample).replace(/,/g, ""));
  if (!Number.isFinite(n)) return sample || "0";
  const fixed = n.toFixed(Math.max(0, Math.min(6, decimalPlaces)));
  if (!useThousandsSeparator) return fixed;
  const [intPart, decPart] = fixed.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

export default function CreateCustomFieldDialog({
  projectId,
  initialOrganizationId = null,
  initialIncludePersonal = false,
  initialWorkspaceId = null,
  editingField = null,
  onClose,
  onSaved,
}: Props) {
  const isEdit = Boolean(editingField);
  const [name, setName] = useState(editingField?.name || "");
  const [description, setDescription] = useState(editingField?.description || "");
  const [type, setType] = useState<CustomFieldType>(
    editingField?.type || "text"
  );
  const [options, setOptions] = useState<string[]>(
    editingField?.options?.length ? [...editingField.options] : [""]
  );
  const [numberConfig, setNumberConfig] = useState<CustomFieldNumberConfig>(
    editingField?.numberConfig
      ? { ...DEFAULT_NUMBER_CONFIG, ...editingField.numberConfig }
      : { ...DEFAULT_NUMBER_CONFIG }
  );
  const [permissions, setPermissions] = useState<"everyone" | "admins">(
    editingField?.permissions || "everyone"
  );
  const [scope, setScope] = useState<Array<"tasks" | "projects" | "folders">>(
    editingField?.scope?.length ? [...editingField.scope] : ["tasks"]
  );
  const [workspaceOptions, setWorkspaceOptions] = useState<
    Array<{ id: string; name: string; kind: string }>
  >([]);
  const [workspaceId, setWorkspaceId] = useState(
    editingField?.workspaceId || initialWorkspaceId || ""
  );
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [error, setError] = useState("");

  const isSelect = type === "single_select" || type === "multiple_select";
  const TypeIcon = TYPE_ICONS[type] || TextCursorInput;

  const spaceLabel = useMemo(() => {
    const match = workspaceOptions.find((w) => w.id === workspaceId);
    return match?.name || "Select a workspace";
  }, [workspaceId, workspaceOptions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSpaces(true);
      try {
        const wsRes = await authFetch(
          initialOrganizationId
            ? `/workspaces?organizationId=${initialOrganizationId}`
            : "/workspaces"
        );
        const wsData = await wsRes.json().catch(() => ({}));
        if (!wsRes.ok) {
          throw new Error(wsData.message || "Failed to load workspaces");
        }
        if (cancelled) return;
        const wsList = Array.isArray(wsData.workspaces) ? wsData.workspaces : [];
        setWorkspaceOptions(wsList);
        if (!editingField && !workspaceId) {
          if (initialWorkspaceId) {
            setWorkspaceId(initialWorkspaceId);
          } else if (initialIncludePersonal) {
            const personal = wsList.find(
              (w: { kind: string }) => w.kind === "personal"
            );
            setWorkspaceId(personal?.id || wsList[0]?.id || "");
          } else if (initialOrganizationId) {
            const internal = wsList.find(
              (w: { kind: string }) => w.kind === "internal"
            );
            setWorkspaceId(internal?.id || wsList[0]?.id || "");
          } else {
            const personal = wsList.find(
              (w: { kind: string }) => w.kind === "personal"
            );
            setWorkspaceId(personal?.id || wsList[0]?.id || "");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load workspaces");
        }
      } finally {
        if (!cancelled) setLoadingSpaces(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingField, initialOrganizationId, initialIncludePersonal, initialWorkspaceId]);

  const addOption = () => setOptions((current) => [...current, ""]);
  const updateOption = (index: number, value: string) => {
    setOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? value : option
      )
    );
  };
  const removeOption = (index: number) => {
    setOptions((current) => {
      const next = current.filter((_, optionIndex) => optionIndex !== index);
      return next.length > 0 ? next : [""];
    });
  };

  const handleTypeChange = (nextType: CustomFieldType) => {
    if (isEdit) return;
    setType(nextType);
    if (nextType === "single_select" || nextType === "multiple_select") {
      setOptions((current) =>
        current.length > 0 && current.some((value) => value.trim())
          ? current
          : [""]
      );
    } else {
      setOptions([]);
    }
    setError("");
  };

  const toggleScope = (value: "tasks" | "projects" | "folders") => {
    setScope((current) => {
      if (current.includes(value)) {
        const next = current.filter((item) => item !== value);
        return next.length ? next : ["tasks"];
      }
      return [...current, value];
    });
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Field name is required.");
      return;
    }
    if (!workspaceId) {
      setError("Select where this field should exist.");
      return;
    }

    let cleanedOptions: string[] = [];
    if (isSelect) {
      cleanedOptions = [
        ...new Set(options.map((option) => option.trim()).filter(Boolean)),
      ];
      if (cleanedOptions.length === 0) {
        setError("Add at least one option.");
        return;
      }
    }

    setSaving(true);
    setError("");

    const body = {
      name: trimmedName,
      type,
      description: description.trim(),
      options: cleanedOptions,
      workspaceId,
      permissions,
      scope,
      ...(type === "number" ? { numberConfig } : {}),
    };

    try {
      let response: Response;
      if (isEdit && editingField) {
        response = await authFetch(`/custom-fields/${editingField.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else if (projectId) {
        response = await authFetch(`/projects/${projectId}/custom-fields`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      } else {
        response = await authFetch("/custom-fields", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to save custom field.");
      }
      if (!data.field) {
        throw new Error("Custom field was saved but no field was returned.");
      }
      onSaved(data.field);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save custom field."
      );
    } finally {
      setSaving(false);
    }
  };

  const metaRowClass =
    "flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 last:border-b-0 dark:border-slate-800";

  return (
    <ModalShell
      onClose={onClose}
      maxWidth="md"
      zIndexClassName="z-[120]"
      className="overflow-hidden"
    >
      <div className="px-5 pt-5 pb-3 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {isEdit ? "Edit custom field" : "Create custom field"}
        </h2>
      </div>

      <div className="px-5 py-4 space-y-4 max-h-[min(78vh,640px)] overflow-y-auto">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="block mb-1.5 text-sm text-slate-600 dark:text-slate-300">
            Field name
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New field"
            className="field-input w-full"
            autoFocus
          />
        </div>

        <div>
          <label className="block mb-1.5 text-sm text-slate-600 dark:text-slate-300">
            Field description{" "}
            <span className="text-slate-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder=""
            className="field-input w-full resize-y min-h-[56px]"
          />
        </div>

        <div>
          <label className="block mb-1.5 text-sm text-slate-600 dark:text-slate-300">
            Type
          </label>
          <div className="relative">
            <TypeIcon
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400"
            />
            <Select
              value={type}
              disabled={isEdit}
              onChange={(next) =>
                handleTypeChange(next as CustomFieldType)
              }
              className="w-full"
              triggerClassName={(open) => fieldSelectTriggerClass(open, "pl-9")}
              options={ALLOWED_CUSTOM_FIELD_TYPES.map((fieldType) => ({
                value: fieldType,
                label: CUSTOM_FIELD_TYPE_LABELS[fieldType],
              }))}
            />
          </div>
          {isEdit && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Field type cannot be changed after creation.
            </p>
          )}
        </div>

        {type === "number" && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div>
              <label className="block mb-1.5 text-sm text-slate-600 dark:text-slate-300">
                Default aggregation
              </label>
              <Select
                value={numberConfig.defaultAggregation}
                onChange={(next) =>
                  setNumberConfig((c) => ({
                    ...c,
                    defaultAggregation:
                      next as CustomFieldNumberConfig["defaultAggregation"],
                  }))
                }
                className="w-full"
                triggerClassName={fieldSelectTriggerClass}
                options={AGGREGATION_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1.5 text-sm text-slate-600 dark:text-slate-300">
                  Decimal places
                </label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={numberConfig.decimalPlaces}
                  onChange={(e) =>
                    setNumberConfig((c) => ({
                      ...c,
                      decimalPlaces: Math.max(
                        0,
                        Math.min(6, Number(e.target.value) || 0)
                      ),
                    }))
                  }
                  className="field-input w-full"
                />
              </div>
              <div>
                <label className="block mb-1.5 text-sm text-slate-600 dark:text-slate-300">
                  Sample
                </label>
                <input
                  value={formatSample(
                    numberConfig.sample,
                    numberConfig.decimalPlaces,
                    numberConfig.useThousandsSeparator
                  )}
                  onChange={(e) =>
                    setNumberConfig((c) => ({
                      ...c,
                      sample: e.target.value.replace(/,/g, ""),
                    }))
                  }
                  className="field-input w-full"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={numberConfig.useThousandsSeparator}
                onChange={(e) =>
                  setNumberConfig((c) => ({
                    ...c,
                    useThousandsSeparator: e.target.checked,
                  }))
                }
                className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              Use thousands separator
            </label>

            <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={numberConfig.showConditionalMarker}
                onChange={(e) =>
                  setNumberConfig((c) => ({
                    ...c,
                    showConditionalMarker: e.target.checked,
                  }))
                }
                className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span className="flex items-center gap-2">
                Show conditional marker
                <span className="inline-flex items-center gap-1" aria-hidden>
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              </span>
            </label>
          </div>
        )}

        {isSelect && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-slate-600 dark:text-slate-300">
                Options
              </label>
              <button
                type="button"
                onClick={addOption}
                className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-400"
              >
                <Plus size={13} />
                Add option
              </button>
            </div>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    value={option}
                    onChange={(event) => updateOption(index, event.target.value)}
                    placeholder={`Option ${index + 1}`}
                    className="field-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                    aria-label="Remove option"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 px-3 dark:border-slate-700">
          <div className={metaRowClass}>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Belongs to
              </p>
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Box size={14} className="text-slate-400" />
                Account
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1 text-slate-400"
              title="Account-level fields can be shared across spaces."
            >
              <Info size={14} />
            </span>
          </div>

          <div className={metaRowClass}>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Where should this field exist?
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                {spaceLabel}
              </p>

              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Workspace
                </label>
                <Select
                  value={workspaceId}
                  onChange={setWorkspaceId}
                  disabled={loadingSpaces}
                  placeholder="Select workspace…"
                  className="w-full"
                  triggerClassName={fieldSelectTriggerClass}
                  options={[
                    { value: "", label: "Select workspace…" },
                    ...workspaceOptions.map((w) => ({
                      value: w.id,
                      label: w.name,
                    })),
                  ]}
                />
                {workspaceOptions.length === 0 && !loadingSpaces ? (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    No workspaces available yet. Open the sidebar Workspace menu
                    or create an organization first.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className={metaRowClass}>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Permissions
              </p>
              <button
                type="button"
                onClick={() => setPermissionsOpen((v) => !v)}
                className="mt-0.5 text-left text-sm text-slate-800 dark:text-slate-100"
              >
                <span className="font-semibold">
                  {permissions === "everyone" ? "Everyone" : "Admins"}
                </span>{" "}
                {permissions === "everyone"
                  ? "can see and edit"
                  : "can edit; everyone can see"}
              </button>
              {permissionsOpen && (
                <div className="mt-2 rounded-lg border border-slate-200 overflow-hidden dark:border-slate-700">
                  {(
                    [
                      {
                        value: "everyone" as const,
                        label: "Everyone can see and edit",
                      },
                      {
                        value: "admins" as const,
                        label: "Admins can edit; everyone can see",
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setPermissions(opt.value);
                        setPermissionsOpen(false);
                      }}
                      className={`block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        permissions === opt.value
                          ? "text-cyan-700 dark:text-cyan-400"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPermissionsOpen((v) => !v)}
              className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Edit permissions"
            >
              <Pencil size={14} />
            </button>
          </div>

          <div className={`${metaRowClass} !border-b-0`}>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">Scope</p>
              <button
                type="button"
                onClick={() => setScopeOpen((v) => !v)}
                className="mt-0.5 inline-flex items-center gap-1 text-sm text-slate-800 dark:text-slate-100"
              >
                Applies to{" "}
                {scope
                  .map((s) =>
                    s === "tasks"
                      ? "tasks"
                      : s === "projects"
                        ? "projects"
                        : "folders"
                  )
                  .join(", ")}
                <ChevronDown size={14} className="text-slate-400" />
              </button>
              {scopeOpen && (
                <div className="mt-2 rounded-lg border border-slate-200 divide-y divide-slate-100 dark:border-slate-700 dark:divide-slate-800">
                  {(
                    [
                      { value: "tasks" as const, label: "Tasks" },
                      { value: "projects" as const, label: "Projects" },
                      { value: "folders" as const, label: "Folders" },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <input
                        type="checkbox"
                        checked={scope.includes(opt.value)}
                        onChange={() => toggleScope(opt.value)}
                        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-slate-200 flex items-center gap-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loadingSpaces}
          className="btn btn-primary min-w-[96px]"
        >
          {saving ? "Saving…" : isEdit ? "Save" : "Create"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  );
}
