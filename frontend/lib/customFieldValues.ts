import type { ProjectCustomField } from "@/lib/kanbanCardPreview";

export type TaskCustomFieldValue = {
  fieldId: string;
  value?: unknown;
};

export function getTaskCustomFieldValue(
  values: TaskCustomFieldValue[] | undefined,
  fieldId: string
): unknown {
  return values?.find((row) => row.fieldId === fieldId)?.value ?? null;
}

export function formatCustomFieldValue(
  field: ProjectCustomField,
  value: unknown
): string {
  if (value === null || value === undefined || value === "") return "—";

  switch (field.type) {
    case "checkbox":
      return value === true || value === "true" || value === 1 ? "Yes" : "No";
    case "multiple_select":
      return Array.isArray(value) && value.length
        ? value.map(String).join(", ")
        : "—";
    case "percentage":
      return `${value}%`;
    case "number":
      return String(value);
    default:
      return String(value);
  }
}

export function hasCustomFieldDisplayValue(
  field: ProjectCustomField,
  value: unknown
): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (field.type === "checkbox") return true;
  if (field.type === "multiple_select") {
    return Array.isArray(value) && value.length > 0;
  }
  return true;
}

export function emptyCustomFieldValue(type: ProjectCustomField["type"]): unknown {
  if (type === "checkbox") return false;
  if (type === "multiple_select") return [];
  return null;
}

/** Text fields: letters and common punctuation only — no digits. */
export function sanitizeTextCustomFieldInput(raw: string): string {
  return raw.replace(/\d/g, "");
}

/** Strip non-numeric characters; keeps optional leading minus and one decimal point. */
export function sanitizeNumericCustomFieldInput(raw: string): string {
  let cleaned = raw.replace(/[^\d.-]/g, "");
  const negative = cleaned.startsWith("-");
  cleaned = cleaned.replace(/-/g, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) {
    cleaned = `${parts[0]}.${parts.slice(1).join("")}`;
  } else {
    cleaned = parts.join(".");
  }
  return negative ? `-${cleaned}` : cleaned;
}

export function parseNumericCustomFieldInput(
  raw: string
): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === ".") return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export function parsePercentageCustomFieldInput(
  raw: string
): number | null {
  const num = parseNumericCustomFieldInput(raw);
  if (num === null) return null;
  if (num < 0 || num > 100) return null;
  return num;
}

export function clampPercentageValue(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Block digit keys while typing in text fields. */
export function isDigitKey(key: string): boolean {
  return key.length === 1 && /\d/.test(key);
}
