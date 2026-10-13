const CARD_PREVIEW_DEFAULT_FIELD_IDS = [
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
];

const ALLOWED_CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "single_select",
  "percentage",
  "multiple_select",
  "checkbox",
];

function createDefaultCardPreviewConfig() {
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

function normalizeDefaultFieldOrder(order) {
  const allowed = new Set(CARD_PREVIEW_DEFAULT_FIELD_IDS);
  const seen = new Set();
  const next = [];
  if (Array.isArray(order)) {
    for (const id of order) {
      if (typeof id === "string" && allowed.has(id) && !seen.has(id)) {
        next.push(id);
        seen.add(id);
      }
    }
  }
  for (const id of CARD_PREVIEW_DEFAULT_FIELD_IDS) {
    if (!seen.has(id)) next.push(id);
  }
  return next;
}

function normalizeCardPreviewConfig(raw) {
  const defaults = createDefaultCardPreviewConfig();
  if (!raw || typeof raw !== "object") return defaults;

  const merged = { ...defaults.defaultFields };
  if (raw.defaultFields && typeof raw.defaultFields === "object") {
    for (const id of CARD_PREVIEW_DEFAULT_FIELD_IDS) {
      if (typeof raw.defaultFields[id] === "boolean") {
        merged[id] = raw.defaultFields[id];
      }
    }
  }

  const customFields = {};
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

module.exports = {
  CARD_PREVIEW_DEFAULT_FIELD_IDS,
  ALLOWED_CUSTOM_FIELD_TYPES,
  createDefaultCardPreviewConfig,
  normalizeCardPreviewConfig,
};
