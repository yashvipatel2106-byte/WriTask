function parseCardDate(date?: string | null): Date | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Prefer stored working-day count; otherwise derive from the date range. */
export function resolveCardDurationDays(
  startDate?: string | null,
  dueDate?: string | null,
  workingDayCount?: number | null,
  durationHours?: number | null
): number | null {
  if (workingDayCount != null && workingDayCount > 0) return workingDayCount;

  const start = parseCardDate(startDate);
  const end = parseCardDate(dueDate);
  if (start && end) {
    const ms = end.getTime() - start.getTime();
    if (ms < 0) return null;
    return Math.max(1, Math.round(ms / 86_400_000) + 1);
  }

  if (durationHours != null && durationHours > 0) {
    return Math.max(1, Math.round(durationHours / 8));
  }

  return null;
}

/** Kanban card date range — e.g. `18 – 27 Aug`. */
export function formatCardScheduleRange(
  startDate?: string | null,
  dueDate?: string | null
): string | null {
  const start = parseCardDate(startDate);
  const end = parseCardDate(dueDate);

  if (start && end) {
    const sameMonth =
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear();
    const endMonth = end.toLocaleDateString(undefined, { month: "short" });
    if (sameMonth) {
      return `${start.getDate()} – ${end.getDate()} ${endMonth}`;
    }
    const startMonth = start.toLocaleDateString(undefined, { month: "short" });
    return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`;
  }

  if (start) {
    const month = start.toLocaleDateString(undefined, { month: "short" });
    return `${start.getDate()} ${month}`;
  }

  if (end) {
    const month = end.toLocaleDateString(undefined, { month: "short" });
    return `${end.getDate()} ${month}`;
  }

  return null;
}

/** Kanban card duration — e.g. `(8d)`. */
export function formatCardDurationBracket(
  startDate?: string | null,
  dueDate?: string | null,
  workingDayCount?: number | null,
  durationHours?: number | null
): string | null {
  const durationDays = resolveCardDurationDays(
    startDate,
    dueDate,
    workingDayCount,
    durationHours
  );
  if (durationDays != null && durationDays > 0) return `(${durationDays}d)`;
  return null;
}

/** Meta-row schedule text respecting independent schedule/duration toggles. */
export function formatCardMetaScheduleDisplay(
  startDate?: string | null,
  dueDate?: string | null,
  workingDayCount?: number | null,
  durationHours?: number | null,
  options: { showSchedule: boolean; showDuration: boolean } = {
    showSchedule: true,
    showDuration: true,
  }
): string | null {
  const schedule = options.showSchedule
    ? formatCardScheduleRange(startDate, dueDate)
    : null;
  const duration = options.showDuration
    ? formatCardDurationBracket(
        startDate,
        dueDate,
        workingDayCount,
        durationHours
      )
    : null;

  if (schedule && duration) return `${schedule} ${duration}`;
  return schedule || duration;
}

/** Kanban card schedule — e.g. `18 – 27 Aug (8d)`. */
export function formatCardScheduleWithDuration(
  startDate?: string | null,
  dueDate?: string | null,
  workingDayCount?: number | null,
  durationHours?: number | null
): string | null {
  return formatCardMetaScheduleDisplay(
    startDate,
    dueDate,
    workingDayCount,
    durationHours,
    { showSchedule: true, showDuration: true }
  );
}

export function formatCardDate(date?: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** DD/MM/YYYY — used on Kanban card preview rows. */
export function formatCardDateNumeric(date?: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

export function formatScheduleDisplayNumeric(
  startDate?: string | null,
  dueDate?: string | null
): string | null {
  const start = formatCardDateNumeric(startDate);
  const end = formatCardDateNumeric(dueDate);
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

export function formatEffortHours(hours?: number | null): string | null {
  if (hours == null || hours <= 0) return null;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

export function formatDurationDisplay(
  durationHours?: number | null,
  workingDayCount?: number | null
): string | null {
  if (workingDayCount != null && workingDayCount > 0) {
    return `${workingDayCount}d`;
  }
  if (durationHours != null && durationHours > 0) {
    return `${durationHours}h`;
  }
  return null;
}

export function formatScheduleDisplay(
  startDate?: string | null,
  dueDate?: string | null
): string | null {
  const start = formatCardDate(startDate);
  const end = formatCardDate(dueDate);
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

export function formatLastModified(date?: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
