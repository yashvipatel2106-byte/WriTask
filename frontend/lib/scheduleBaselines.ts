import { differenceInCalendarDays, parseISO } from "date-fns";

export type ScheduleBaselineItem = {
  taskId: string | { _id: string };
  startDate: string;
  dueDate: string;
  durationDays: number;
};

export type ScheduleBaseline = {
  _id: string;
  project: string;
  organization?: string | null;
  name: string;
  createdBy?: {
    _id: string;
    username?: string;
    email?: string;
    avatarColor?: string;
  } | null;
  items: ScheduleBaselineItem[];
  createdAt: string;
  updatedAt: string;
};

export type TaskVariance = {
  startVarianceDays: number;
  finishVarianceDays: number;
};

export type BaselineScheduleSummary = {
  ahead: number;
  onPlan: number;
  late: number;
  noBaseline: number;
};

function idOf(value: string | { _id: string }) {
  return typeof value === "string" ? value : value._id;
}

function key(value?: string | null) {
  return value ? value.slice(0, 10) : null;
}

function calendarDayDifference(from: string, to: string) {
  return differenceInCalendarDays(
    parseISO(`${to}T12:00:00`),
    parseISO(`${from}T12:00:00`)
  );
}

export function baselineItemForTask(
  baseline: ScheduleBaseline | null | undefined,
  taskId: string
) {
  return baseline?.items.find((item) => idOf(item.taskId) === String(taskId)) ?? null;
}

export function calculateTaskVariance(
  live: { startDate?: string | null; dueDate?: string | null },
  baselineItem: ScheduleBaselineItem | null | undefined
): TaskVariance | null {
  const liveStart = key(live.startDate);
  const liveDue = key(live.dueDate);
  const baselineStart = key(baselineItem?.startDate);
  const baselineDue = key(baselineItem?.dueDate);

  if (!liveStart || !liveDue || !baselineStart || !baselineDue) return null;

  return {
    startVarianceDays: calendarDayDifference(baselineStart, liveStart),
    finishVarianceDays: calendarDayDifference(baselineDue, liveDue),
  };
}

export function summarizeBaselineSchedule(
  tasks: Array<{ _id: string; startDate?: string | null; dueDate?: string | null }>,
  baseline: ScheduleBaseline | null | undefined
): BaselineScheduleSummary {
  const summary = { ahead: 0, onPlan: 0, late: 0, noBaseline: 0 };

  for (const task of tasks) {
    const variance = calculateTaskVariance(
      task,
      baselineItemForTask(baseline, task._id)
    );

    if (!variance) summary.noBaseline += 1;
    else if (variance.finishVarianceDays > 0) summary.late += 1;
    else if (variance.finishVarianceDays < 0) summary.ahead += 1;
    else summary.onPlan += 1;
  }

  return summary;
}

export function formatVariance(days: number) {
  if (days === 0) return "On plan";
  return days > 0 ? `${days}d late` : `${Math.abs(days)}d ahead`;
}