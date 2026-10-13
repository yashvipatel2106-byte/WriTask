/** Default Kanban card-preview field ids. */
export const CARD_PREVIEW_DEFAULT_FIELD_IDS = [
  "status",
  "priority",
  "author",
  "startDate",
  "endDate",
  "schedule",
  "effort",
  "attachments",
  "itemType",
  "duration",
  "lastModified",
] as const;

export type CardPreviewDefaultFieldId =
  (typeof CARD_PREVIEW_DEFAULT_FIELD_IDS)[number];

export const ALLOWED_CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "single_select",
  "percentage",
  "multiple_select",
  "checkbox",
] as const;

export type CustomFieldType = (typeof ALLOWED_CUSTOM_FIELD_TYPES)[number];

export type CustomFieldNumberConfig = {
  defaultAggregation: "none" | "sum" | "avg" | "min" | "max";
  decimalPlaces: number;
  sample: string;
  useThousandsSeparator: boolean;
  showConditionalMarker: boolean;
};

export type CustomFieldSpaceType = "internal" | "external" | "specific";

export type ProjectCustomField = {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: string[];
  description?: string;
  numberConfig?: CustomFieldNumberConfig;
  permissions?: "everyone" | "admins";
  scope?: Array<"tasks" | "projects" | "folders">;
  /** Wrike-style location: Internal / External / Specific Space */
  spaceType?: CustomFieldSpaceType;
  /** Organization id when external/specific (null for Internal / personal) */
  spaceId?: string | null;
  /** Preferred workspace association */
  workspaceId?: string | null;
  /** Display name for the field's workspace (other-workspace section). */
  workspaceName?: string | null;
  organizationIds?: string[];
  includePersonal?: boolean;
  createdBy?: string | null;
  authorName?: string | null;
  isActive?: boolean;
  timesUsedTotal?: number;
  addedTo?: string[];
  source?: string;
};

export const CUSTOM_FIELD_SPACE_TYPE_LABELS: Record<CustomFieldSpaceType, string> =
  {
    internal: "Internal Space",
    external: "External Space",
    specific: "Other / Specific Space",
  };

export type CardPreviewConfig = {
  defaultFields: Record<CardPreviewDefaultFieldId, boolean>;
  /** Display order for default fields on cards and in settings. */
  defaultFieldOrder: CardPreviewDefaultFieldId[];
  customFields: Record<string, boolean>;
};

/** Shown in the card meta row (top corner), not as label/value rows. */
export const CARD_PREVIEW_META_ONLY_FIELD_IDS = [
  "schedule",
  "duration",
] as const satisfies readonly CardPreviewDefaultFieldId[];

export function filterCardPreviewListFields(
  fields: CardPreviewDefaultFieldId[]
): CardPreviewDefaultFieldId[] {
  const metaOnly = new Set<string>(CARD_PREVIEW_META_ONLY_FIELD_IDS);
  return fields.filter((id) => !metaOnly.has(id));
}

export function normalizeDefaultFieldOrder(
  order: unknown
): CardPreviewDefaultFieldId[] {
  const allowed = new Set<string>(CARD_PREVIEW_DEFAULT_FIELD_IDS);
  const seen = new Set<string>();
  const next: CardPreviewDefaultFieldId[] = [];
  if (Array.isArray(order)) {
    for (const id of order) {
      if (
        typeof id === "string" &&
        allowed.has(id) &&
        !seen.has(id)
      ) {
        next.push(id as CardPreviewDefaultFieldId);
        seen.add(id);
      }
    }
  }
  for (const id of CARD_PREVIEW_DEFAULT_FIELD_IDS) {
    if (!seen.has(id)) next.push(id);
  }
  return next;
}

export const CARD_PREVIEW_FIELD_LABELS: Record<
  CardPreviewDefaultFieldId,
  string
> = {
  status: "Status",
  priority: "Priority",
  author: "Author",
  startDate: "Start date",
  endDate: "End date",
  schedule: "Schedule",
  effort: "Effort",
  attachments: "Attachments",
  itemType: "Item type",
  duration: "Duration",
  lastModified: "Last modified date",
};

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  single_select: "Single select",
  percentage: "Percentage",
  multiple_select: "Multiple select",
  checkbox: "Checkbox",
};

/** All card-preview toggles off — cards use assignee + subtask fallback only. */
export function createDefaultCardPreviewConfig(): CardPreviewConfig {
  return {
    defaultFields: {
      status: false,
      priority: false,
      author: false,
      startDate: false,
      endDate: false,
      schedule: false,
      effort: false,
      attachments: false,
      itemType: false,
      duration: false,
      lastModified: false,
    },
    defaultFieldOrder: [...CARD_PREVIEW_DEFAULT_FIELD_IDS],
    customFields: {},
  };
}

export function normalizeCardPreviewConfig(
  raw: Partial<CardPreviewConfig> & { customFieldIds?: string[] } | null | undefined
): CardPreviewConfig {
  const defaults = createDefaultCardPreviewConfig();
  if (!raw || typeof raw !== "object") return defaults;

  const merged = { ...defaults.defaultFields };
  if (raw.defaultFields && typeof raw.defaultFields === "object") {
    for (const id of CARD_PREVIEW_DEFAULT_FIELD_IDS) {
      if (typeof raw.defaultFields[id] === "boolean") {
        merged[id] = raw.defaultFields[id]!;
      }
    }
  }

  const customFields: Record<string, boolean> = {};
  if (raw.customFields && typeof raw.customFields === "object") {
    for (const [key, value] of Object.entries(raw.customFields)) {
      if (typeof value === "boolean") customFields[key] = value;
    }
  } else if (Array.isArray(raw.customFieldIds)) {
    for (const id of raw.customFieldIds) {
      if (typeof id === "string" && id.trim()) customFields[id] = true;
    }
  }

  return {
    defaultFields: merged,
    defaultFieldOrder: normalizeDefaultFieldOrder(raw.defaultFieldOrder),
    customFields,
  };
}

export function isAnyCardPreviewFieldEnabled(
  config: CardPreviewConfig,
  workspaceFields: ProjectCustomField[] = []
): boolean {
  const anyDefault = CARD_PREVIEW_DEFAULT_FIELD_IDS.some(
    (id) => config.defaultFields[id]
  );
  const anyCustom = workspaceFields.some(
    (field) => config.customFields[field.id]
  );
  return anyDefault || anyCustom;
}

/** Resolves which default + custom fields to render on a Kanban card. */
export function resolveVisibleCardFields(
  config: CardPreviewConfig,
  workspaceFields: ProjectCustomField[] = []
): {
  defaultFields: CardPreviewDefaultFieldId[];
  customFields: ProjectCustomField[];
  allFieldsOff: boolean;
} {
  const allFieldsOff = !isAnyCardPreviewFieldEnabled(config, workspaceFields);

  if (allFieldsOff) {
    return {
      defaultFields: [],
      customFields: [],
      allFieldsOff: true,
    };
  }

  const defaultFields = normalizeDefaultFieldOrder(
    config.defaultFieldOrder
  ).filter((id) => config.defaultFields[id]);

  const customFields = workspaceFields.filter(
    (field) => config.customFields[field.id]
  );

  return {
    defaultFields,
    customFields,
    allFieldsOff: false,
  };
}

export function filterFieldsBySearch<
  T extends { label: string; id: string }
>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q)
  );
}

export function toggleDefaultField(
  config: CardPreviewConfig,
  fieldId: CardPreviewDefaultFieldId,
  enabled: boolean
): CardPreviewConfig {
  return {
    ...config,
    defaultFields: { ...config.defaultFields, [fieldId]: enabled },
  };
}

export function toggleCustomField(
  config: CardPreviewConfig,
  fieldId: string,
  enabled: boolean
): CardPreviewConfig {
  const next = { ...config.customFields };
  if (enabled) next[fieldId] = true;
  else delete next[fieldId];
  return { ...config, customFields: next };
}

export function reorderDefaultFields(
  config: CardPreviewConfig,
  fromId: CardPreviewDefaultFieldId,
  toId: CardPreviewDefaultFieldId
): CardPreviewConfig {
  if (fromId === toId) return config;
  const order = normalizeDefaultFieldOrder(config.defaultFieldOrder);
  const fromIndex = order.indexOf(fromId);
  const toIndex = order.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0) return config;
  const next = [...order];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, fromId);
  return { ...config, defaultFieldOrder: next };
}

/** Card-preview-enabled custom fields (current + other workspaces) for default task detail display. */
export function resolveTaskDetailCustomFields(
  currentWorkspaceFields: ProjectCustomField[],
  otherWorkspaceFields: ProjectCustomField[],
  cardPreviewConfig?: CardPreviewConfig | null
): ProjectCustomField[] {
  const config = normalizeCardPreviewConfig(cardPreviewConfig);
  const enabledCurrent = currentWorkspaceFields.filter(
    (field) => config.customFields[field.id]
  );
  const enabledOther = otherWorkspaceFields.filter(
    (field) => config.customFields[field.id]
  );
  const seen = new Set(enabledCurrent.map((field) => field.id));
  const merged = [...enabledCurrent];
  for (const field of enabledOther) {
    if (!seen.has(field.id)) {
      merged.push(field);
      seen.add(field.id);
    }
  }
  return merged;
}

/** Whether a field belongs to the project's active workspace bucket. */
export function fieldBelongsToProjectWorkspace(
  field: ProjectCustomField,
  projectWorkspaceId: string | null | undefined,
  isPersonalProject = false
): boolean {
  const wsId = field.workspaceId ? String(field.workspaceId) : null;
  const isPersonalField =
    Boolean(field.includePersonal) && !(field.organizationIds?.length);

  if (isPersonalField && isPersonalProject) return true;
  if (!projectWorkspaceId) return !wsId;
  if (!wsId) return true;
  return wsId === String(projectWorkspaceId);
}

/**
 * Fields editable/visible on tasks — matches backend getTaskEditableCustomFieldDefinitions:
 * all active fields in the project's workspace + adopted or card-preview-enabled fields
 * from other workspaces (e.g. personal-workspace fields on an org project).
 */
export function resolveTaskEditableCustomFields(
  currentWorkspaceFields: ProjectCustomField[],
  otherWorkspaceFields: ProjectCustomField[],
  cardPreviewConfig?: CardPreviewConfig | null,
  adoptedCustomFieldIds: string[] = []
): ProjectCustomField[] {
  const config = normalizeCardPreviewConfig(cardPreviewConfig);
  const adopted = new Set(adoptedCustomFieldIds.map(String));
  const enabledOther = otherWorkspaceFields.filter(
    (field) => config.customFields[field.id] || adopted.has(field.id)
  );
  const seen = new Set(currentWorkspaceFields.map((field) => field.id));
  const merged = [...currentWorkspaceFields];
  for (const field of enabledOther) {
    if (!seen.has(field.id)) {
      merged.push(field);
      seen.add(field.id);
    }
  }
  return merged;
}

/** Every custom field available on the project (all workspaces). */
export function resolveAllProjectCustomFields(
  currentWorkspaceFields: ProjectCustomField[],
  otherWorkspaceFields: ProjectCustomField[]
): ProjectCustomField[] {
  const seen = new Set<string>();
  const merged: ProjectCustomField[] = [];
  for (const field of [...currentWorkspaceFields, ...otherWorkspaceFields]) {
    if (seen.has(field.id)) continue;
    seen.add(field.id);
    merged.push(field);
  }
  return merged;
}
