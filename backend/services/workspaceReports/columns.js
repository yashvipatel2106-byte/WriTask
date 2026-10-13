const BUILTIN_COLUMNS = [
  { key: "title", label: "Title", category: "core", defaultSelected: true },
  { key: "itemType", label: "Item type", category: "other" },
  { key: "assignee", label: "Assignee", category: "management", defaultSelected: true },
  { key: "importance", label: "Importance", category: "management" },
  { key: "statusGroup", label: "Status group", category: "management" },
  { key: "status", label: "Status", category: "management" },
  { key: "projectOrFolder", label: "Project or folder", category: "management" },
  { key: "createdDate", label: "Created date", category: "schedule" },
  { key: "startDate", label: "Start date", category: "schedule", defaultSelected: true },
  { key: "dueDate", label: "Due date", category: "schedule", defaultSelected: true },
  { key: "completedDate", label: "Completed date", category: "schedule" },
  { key: "duration", label: "Duration", category: "schedule" },
  { key: "durationHours", label: "Duration (Hours)", category: "schedule" },
  { key: "effort", label: "Effort", category: "schedule" },
  { key: "timeSpent", label: "Time spent", category: "schedule" },
  { key: "author", label: "Author", category: "other", defaultSelected: true },
  { key: "id", label: "ID", category: "other" },
  { key: "workflow", label: "Workflow", category: "other" },
  { key: "lastModifiedDate", label: "Last modified date", category: "schedule" },
];

const EXCEL_ORDER = [
  "title",
  "itemType",
  "assignee",
  "statusGroup",
  "status",
  "startDate",
  "dueDate",
  "duration",
  "durationHours",
  "effort",
  "projectOrFolder",
  "createdDate",
];

const CALCULATED_COLUMNS = [
  { key: "daysSinceOpen", label: "Days since open", category: "calculated" },
  { key: "overdueSince", label: "Overdue Since", category: "calculated" },
];

function customColumnKey(fieldId) {
  return `custom:${fieldId}`;
}

function calculatedColumnKey(key) {
  return `calculated:${key}`;
}

function isCustomColumn(key) {
  return String(key || "").startsWith("custom:");
}

function isCalculatedColumn(key) {
  return String(key || "").startsWith("calculated:");
}

function parseCustomFieldId(key) {
  if (!isCustomColumn(key)) return null;
  return String(key).slice("custom:".length);
}

const DEFAULT_REPORT_COLUMNS = [
  "title",
  "assignee",
  "author",
  "startDate",
  "dueDate",
  "status",
];

function normalizeColumnKeys(columns, allowedKeys) {
  const allowed = new Set(allowedKeys);
  const seen = new Set();
  const out = [];
  for (const raw of columns || []) {
    const key = String(raw || "").trim();
    if (!key || seen.has(key) || !allowed.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  if (!out.length) {
    for (const key of DEFAULT_REPORT_COLUMNS) {
      if (allowed.has(key) || allowed.size === 0) out.push(key);
    }
  }
  if (!out.includes("title") && (allowed.has("title") || allowed.size === 0)) {
    out.unshift("title");
  }
  return out;
}

function orderSelectedColumns(selected, catalog) {
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const preferred = [];
  const rest = [];
  const selectedSet = new Set(selected);
  for (const key of EXCEL_ORDER) {
    if (selectedSet.has(key) && byKey.has(key)) preferred.push(key);
  }
  for (const key of selected) {
    if (!preferred.includes(key) && byKey.has(key)) rest.push(key);
  }
  return [...preferred, ...rest].map((key) => byKey.get(key));
}

module.exports = {
  BUILTIN_COLUMNS,
  CALCULATED_COLUMNS,
  EXCEL_ORDER,
  DEFAULT_REPORT_COLUMNS,
  customColumnKey,
  calculatedColumnKey,
  isCustomColumn,
  isCalculatedColumn,
  parseCustomFieldId,
  normalizeColumnKeys,
  orderSelectedColumns,
};
