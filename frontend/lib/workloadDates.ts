import {
  addDays,
  subDays,
  isSameDay,
  isToday as isTodayDateFns,
  isWeekend as isWeekendDateFns,
  differenceInCalendarDays,
  format,
} from "date-fns";

export type WorkloadDay = {
  /** Stable, unique key for React lists — "yyyy-MM-dd". */
  key: string;
  day: string;
  date: number;
  month: string;
  fullDate: Date;
};

/** Builds the per-day columns shown in the Team Workload timeline, inclusive of both ends. */
export function buildWorkloadDays(start: Date, end: Date): WorkloadDay[] {
  const days: WorkloadDay[] = [];

  let current = new Date(start);
  current.setHours(0, 0, 0, 0);

  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  while (current <= last) {
    days.push({
      key: format(current, "yyyy-MM-dd"),
      day: format(current, "EEE"),
      date: current.getDate(),
      month: format(current, "MMM"),
      fullDate: new Date(current),
    });

    current = addDays(current, 1);
  }

  return days;
}

export {
  addDays,
  subDays,
  isSameDay,
  differenceInCalendarDays,
};

export function isWeekendDay(date: Date): boolean {
  return isWeekendDateFns(date);
}

export function isTodayDate(date: Date): boolean {
  return isTodayDateFns(date);
}

/** Total inclusive day count between two dates (end >= start). */
export function totalDaysBetween(start: Date, end: Date): number {
  return differenceInCalendarDays(end, start) + 1;
}
