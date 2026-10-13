"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Search, X, Plus } from "lucide-react";
import CreateCustomFieldDialog from "./CreateCustomFieldDialog";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import { authFetch } from "@/lib/validation/authFetch";
import {
  CARD_PREVIEW_FIELD_LABELS,
  CUSTOM_FIELD_TYPE_LABELS,
  filterFieldsBySearch,
  normalizeCardPreviewConfig,
  normalizeDefaultFieldOrder,
  reorderDefaultFields,
  toggleCustomField,
  toggleDefaultField,
  type CardPreviewConfig,
  type CardPreviewDefaultFieldId,
  type ProjectCustomField,
} from "@/lib/kanbanCardPreview";

type Props = {
  projectId: string;
  config: CardPreviewConfig;
  customFields: ProjectCustomField[];
  otherCustomFields?: ProjectCustomField[];
  projectWorkspaceId?: string | null;
  /** Organization id for this project, or null for personal workspace. */
  organizationId?: string | null;
  onClose: () => void;
  onSaved: (config: CardPreviewConfig) => void;
  onCustomFieldCreated?: (field: ProjectCustomField) => void;
};

/** 2×2 grip dots for drag-and-drop reorder. */
function GripDotsIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <circle cx="4" cy="4" r="1.35" />
      <circle cx="10" cy="4" r="1.35" />
      <circle cx="4" cy="10" r="1.35" />
      <circle cx="10" cy="10" r="1.35" />
    </svg>
  );
}

function ToggleRow({
  label,
  sublabel,
  checked,
  onChange,
  dragHandle,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  dragHandle?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      draggable={Boolean(dragHandle)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center justify-between gap-3 px-3 py-2.5 transition-colors ${
        isDragging ? "opacity-40" : ""
      } ${
        isDropTarget
          ? "bg-cyan-50 dark:bg-cyan-500/10"
          : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {dragHandle && (
          <span
            className="shrink-0 cursor-grab touch-none text-slate-400 dark:text-slate-500"
            aria-hidden="true"
            title="Drag to reorder"
          >
            <GripDotsIcon />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {label}
          </p>
          {sublabel && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {sublabel}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-cyan-600" : "bg-slate-300 dark:bg-slate-600"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export default function KanbanCardPreviewSettings({
  projectId,
  config,
  customFields,
  otherCustomFields = [],
  projectWorkspaceId = null,
  organizationId = null,
  onClose,
  onSaved,
  onCustomFieldCreated,
}: Props) {
  const [draft, setDraft] = useState<CardPreviewConfig>(() =>
    normalizeCardPreviewConfig(config)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showCreateField, setShowCreateField] = useState(false);
  const [localCustomFields, setLocalCustomFields] =
    useState<ProjectCustomField[]>(customFields);
  const [localOtherCustomFields, setLocalOtherCustomFields] =
    useState<ProjectCustomField[]>(otherCustomFields);
  const [draggingId, setDraggingId] = useState<CardPreviewDefaultFieldId | null>(
    null
  );
  const [dropTargetId, setDropTargetId] =
    useState<CardPreviewDefaultFieldId | null>(null);
  const dragIdRef = useRef<CardPreviewDefaultFieldId | null>(null);

  useEffect(() => {
    setLocalCustomFields(customFields);
  }, [customFields]);

  useEffect(() => {
    setLocalOtherCustomFields(otherCustomFields);
  }, [otherCustomFields]);

  const persist = async (next: CardPreviewConfig) => {
    setDraft(next);
    onSaved(next);
    setSaving(true);
    setError("");
    try {
      const res = await authFetch(`/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardPreviewConfig: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not save card preview settings");
      }
      const data = await res.json();
      onSaved(normalizeCardPreviewConfig(data.cardPreviewConfig));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save card preview settings"
      );
    } finally {
      setSaving(false);
    }
  };

  const defaultRows = useMemo(
    () =>
      normalizeDefaultFieldOrder(draft.defaultFieldOrder).map((id) => ({
        id,
        label: CARD_PREVIEW_FIELD_LABELS[id],
      })),
    [draft.defaultFieldOrder]
  );

  const customRows = useMemo(
    () =>
      localCustomFields.map((field) => ({
        id: field.id,
        label: field.name,
        sublabel: CUSTOM_FIELD_TYPE_LABELS[field.type],
      })),
    [localCustomFields]
  );

  const otherCustomRows = useMemo(
    () =>
      localOtherCustomFields.map((field) => ({
        id: field.id,
        label: field.name,
        sublabel: field.workspaceName
          ? `${CUSTOM_FIELD_TYPE_LABELS[field.type]} · ${field.workspaceName}`
          : CUSTOM_FIELD_TYPE_LABELS[field.type],
      })),
    [localOtherCustomFields]
  );

  const filteredDefaults = filterFieldsBySearch(defaultRows, searchQuery);
  const filteredCustom = filterFieldsBySearch(customRows, searchQuery);
  const filteredOtherCustom = filterFieldsBySearch(otherCustomRows, searchQuery);
  const canReorderDefaults = searchQuery.trim() === "";
  const showEmptySearch =
    searchQuery.trim() !== "" &&
    filteredDefaults.length === 0 &&
    filteredCustom.length === 0 &&
    filteredOtherCustom.length === 0;

  const handleDefaultToggle = (
    fieldId: CardPreviewDefaultFieldId,
    enabled: boolean
  ) => {
    void persist(toggleDefaultField(draft, fieldId, enabled));
  };

  const handleCustomToggle = (fieldId: string, enabled: boolean) => {
    void persist(toggleCustomField(draft, fieldId, enabled));
  };

  const handleDefaultDragStart = (
    e: React.DragEvent,
    fieldId: CardPreviewDefaultFieldId
  ) => {
    if (!canReorderDefaults) {
      e.preventDefault();
      return;
    }
    dragIdRef.current = fieldId;
    setDraggingId(fieldId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", fieldId);
  };

  const handleDefaultDragOver = (
    e: React.DragEvent,
    fieldId: CardPreviewDefaultFieldId
  ) => {
    if (!canReorderDefaults || !dragIdRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTargetId !== fieldId) setDropTargetId(fieldId);
  };

  const handleDefaultDrop = (
    e: React.DragEvent,
    toId: CardPreviewDefaultFieldId
  ) => {
    e.preventDefault();
    const fromId = dragIdRef.current;
    dragIdRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
    if (!fromId || fromId === toId) return;
    void persist(reorderDefaultFields(draft, fromId, toId));
  };

  const handleDefaultDragEnd = () => {
    dragIdRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
  };

  return (
    <>
    <ModalShell onClose={onClose} maxWidth="lg" className="overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center shrink-0 dark:bg-cyan-400/10 dark:border-cyan-400/20">
            <LayoutGrid size={18} className="text-cyan-600 dark:text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <ModalHeader
              title="Card preview fields"
              subtitle="Choose what appears on Kanban cards for this project."
              onClose={onClose}
              className="mb-0"
            />
          </div>
        </div>
      </div>

      <div className="px-6 pt-4 pb-2">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search fields..."
            className="field-input pl-10 pr-9"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-4 max-h-[min(56vh,480px)] overflow-y-auto space-y-4">
        {showEmptySearch ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No fields match &ldquo;{searchQuery.trim()}&rdquo;.
          </div>
        ) : (
          <>
            {filteredDefaults.length > 0 && (
              <section>
                <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Default fields
                </p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:divide-slate-700">
                  {filteredDefaults.map((row) => {
                    const fieldId = row.id as CardPreviewDefaultFieldId;
                    return (
                      <ToggleRow
                        key={row.id}
                        label={row.label}
                        checked={draft.defaultFields[fieldId]}
                        onChange={(enabled) =>
                          handleDefaultToggle(fieldId, enabled)
                        }
                        dragHandle={canReorderDefaults}
                        isDragging={draggingId === fieldId}
                        isDropTarget={
                          dropTargetId === fieldId && draggingId !== fieldId
                        }
                        onDragStart={(e) => handleDefaultDragStart(e, fieldId)}
                        onDragOver={(e) => handleDefaultDragOver(e, fieldId)}
                        onDragLeave={() => {
                          if (dropTargetId === fieldId) setDropTargetId(null);
                        }}
                        onDrop={(e) => handleDefaultDrop(e, fieldId)}
                        onDragEnd={handleDefaultDragEnd}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            <section>
  <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
    Custom fields
  </p>

  {filteredCustom.length === 0 ? (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {localCustomFields.length === 0
        ? "No custom fields are available in this workspace yet."
        : "No custom fields match your search."}
    </div>
  ) : (
    <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:divide-slate-700">
      {filteredCustom.map((row) => (
        <ToggleRow
          key={row.id}
          label={row.label}
          sublabel={row.sublabel}
          checked={Boolean(draft.customFields[row.id])}
          onChange={(enabled) => handleCustomToggle(row.id, enabled)}
        />
      ))}
    </div>
  )}

  <button
    type="button"
    onClick={() => setShowCreateField(true)}
    className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-700 hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-400 dark:hover:bg-cyan-500/20"
  >
    <Plus size={15} />
    Create custom field
  </button>
</section>

            {localOtherCustomFields.length > 0 && (
              <section>
                <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Fields from other workspaces
                </p>
                {filteredOtherCustom.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    No fields from other workspaces match your search.
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:divide-slate-700">
                    {filteredOtherCustom.map((row) => (
                      <ToggleRow
                        key={row.id}
                        label={row.label}
                        sublabel={row.sublabel}
                        checked={Boolean(draft.customFields[row.id])}
                        onChange={(enabled) => handleCustomToggle(row.id, enabled)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="px-6 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
        {saving && (
          <span className="mr-auto text-xs text-slate-500 dark:text-slate-400">
            Saving…
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="btn btn-secondary"
        >
          Close
        </button>
      </div>
    </ModalShell>

    {showCreateField && (
      <CreateCustomFieldDialog
        projectId={projectId}
        initialOrganizationId={organizationId}
        initialIncludePersonal={!organizationId}
        initialWorkspaceId={projectWorkspaceId}
        onClose={() => setShowCreateField(false)}
        onSaved={(field) => {
          const belongsToCurrent =
            !projectWorkspaceId ||
            !field.workspaceId ||
            field.workspaceId === projectWorkspaceId;
          if (belongsToCurrent) {
            setLocalCustomFields((current) => {
              if (current.some((existing) => existing.id === field.id)) {
                return current;
              }
              return [...current, field];
            });
          } else {
            setLocalOtherCustomFields((current) => {
              if (current.some((existing) => existing.id === field.id)) {
                return current;
              }
              return [...current, field];
            });
          }
          onCustomFieldCreated?.(field);
          void persist(toggleCustomField(draft, field.id, true));
          setShowCreateField(false);
        }}
      />
    )}
    </>
  );
}


