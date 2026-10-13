import { addDays, addHours, format, parseISO } from "date-fns";

export const DAY_OPTIONS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
] as const;

export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

function parseDateKey(value: string) {
  return parseISO(`${value}T12:00:00`);
}

export function normalizeWorkingDays(days?: unknown): number[] {
  if (!Array.isArray(days) || days.length === 0) {
    return [...DEFAULT_WORKING_DAYS];
  }

  const cleaned = [
    ...new Set(
      days
        .map(Number)
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ),
  ].sort((a, b) => a - b);

  return cleaned.length > 0 ? cleaned : [...DEFAULT_WORKING_DAYS];
}

export function isDefaultWorkingDays(days: number[]): boolean {
  const norm = normalizeWorkingDays(days);
  return (
    norm.length === DEFAULT_WORKING_DAYS.length &&
    DEFAULT_WORKING_DAYS.every((d) => norm.includes(d))
  );
}

export function isWorkingDay(date: Date, workingDays: number[]): boolean {
  return workingDays.includes(date.getDay());
}

/** Inclusive count of configured working days between start and due. */
export function workingDaysBetween(
  start: string,
  due: string,
  workingDays: number[]
): number | null {
  if (!start || !due) return null;
  let current = parseDateKey(start);
  const end = parseDateKey(due);
  if (end < current) return 0;

  const active = normalizeWorkingDays(workingDays);
  let count = 0;
  while (current <= end) {
    if (isWorkingDay(current, active)) count += 1;
    current = addDays(current, 1);
  }
  return count;
}

/** Add N working days from start (inclusive) using the configured week. */
export function addWorkingDays(
  start: string,
  workingDayCount: number,
  workingDays: number[]
): string {
  if (workingDayCount <= 0) return start;
  const active = normalizeWorkingDays(workingDays);
  let current = parseDateKey(start);
  let count = isWorkingDay(current, active) ? 1 : 0;

  while (count < workingDayCount) {
    current = addDays(current, 1);
    if (isWorkingDay(current, active)) count += 1;
  }
  return format(current, "yyyy-MM-dd");
}

export function dueDateFromDuration(
  start: string,
  days: number,
  hours: number,
  workingDays: number[]
): string | null {
  if (days > 0) {
    let dueKey = addWorkingDays(start, days, workingDays);
    if (hours > 0) {
      dueKey = format(addHours(parseDateKey(dueKey), hours), "yyyy-MM-dd");
    }
    return dueKey;
  }
  if (hours > 0) {
    return format(addHours(parseDateKey(start), hours), "yyyy-MM-dd");
  }
  return null;
}

export function formatWorkingDaysSummary(days: number[]): string {
  const sorted = normalizeWorkingDays(days);
  if (isDefaultWorkingDays(sorted)) return "Mon–Fri";

  const weekdayBlock = [1, 2, 3, 4, 5];
  const hasAllWeekdays = weekdayBlock.every((d) => sorted.includes(d));
  const extras = sorted.filter((d) => !weekdayBlock.includes(d));

  if (hasAllWeekdays && extras.length > 0) {
    const extraLabels = extras
      .map((d) => DAY_OPTIONS.find((o) => o.value === d)?.short ?? "")
      .filter(Boolean);
    return `Mon–Fri, ${extraLabels.join(", ")}`;
  }

  return sorted
    .map((d) => DAY_OPTIONS.find((o) => o.value === d)?.short ?? "")
    .filter(Boolean)
    .join(", ");
}
