export type TimerStopReason =
  | "manual"
  | "effort_reached"
  | "switched_task"
  | "status_changed"
  | "due_date_reached"
  | "system"
  | "task_deleted";

export type TimeEntryStatus =
  | "running"
  | "paused"
  | "completed"
  | "auto_stopped";

export type TimeEntryUser = {
  _id: string;
  username: string;
  email?: string;
  avatarColor?: string;
};

export type TimeEntryDto = {
  _id: string;
  task: string;
  taskTitle?: string | null;
  project: string;
  user: TimeEntryUser | null;
  startedAt: string;
  runningSince?: string | null;
  accumulatedMs?: number;
  liveElapsedMs?: number;
  endedAt?: string | null;
  durationMs?: number | null;
  status: TimeEntryStatus;
  stopReason?: TimerStopReason | null;
  createdAt?: string;
  updatedAt?: string;
};

export type TimeSummaryDto = {
  trackedMs: number;
  effortHours: number | null;
  effortMs: number | null;
  remainingMs: number | null;
  overEffortMs: number | null;
  trackedLabel: string;
  effortLabel: string | null;
  remainingLabel: string | null;
  overEffortLabel: string | null;
};

export function toDateKey(value?: string | Date | null): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function isTaskOverdue(
  dueDate?: string | Date | null,
  now = new Date()
): boolean {
  const dueKey = toDateKey(dueDate);
  const nowKey = toDateKey(now);
  if (!dueKey || !nowKey) return false;
  return nowKey > dueKey;
}

export function isInProgressStatus(status?: string | null): boolean {
  return String(status || "").toLowerCase() === "in-progress";
}

export function isCompletedStatus(status?: string | null): boolean {
  const s = String(status || "").toLowerCase();
  return s === "completed" || s === "done";
}

export function getClientTimerBlockReason(
  task: {
    status?: string;
    dueDate?: string | Date | null;
    effortHours?: number | null;
    isDeleted?: boolean;
  },
  trackedMs = 0
): string | null {
  if (task.isDeleted) return "Task is in trash.";
  if (!isInProgressStatus(task.status)) {
    if (isCompletedStatus(task.status)) {
      return "Completed task cannot be timed.";
    }
    if (String(task.status || "").toLowerCase() === "todo") {
      return "Timer available when task is In Progress.";
    }
    return "Timer available when task is In Progress.";
  }
  if (isTaskOverdue(task.dueDate)) {
    return "Task is overdue. Move the task to In Progress and extend the due date before starting the timer.";
  }
  if (
    task.effortHours != null &&
    Number(task.effortHours) > 0 &&
    trackedMs >= Number(task.effortHours) * 3600 * 1000
  ) {
    return "Effort limit reached.";
  }
  return null;
}

/** HH:MM:SS for live timer display */
export function formatElapsedClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatHoursMinutes(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

export function stopReasonLabel(reason?: TimerStopReason | null): string {
  switch (reason) {
    case "manual":
      return "Manual Stop";
    case "effort_reached":
      return "Automatic Stop - Effort Reached";
    case "switched_task":
      return "Automatic Stop - Switched Task";
    case "status_changed":
      return "Automatic Stop - Status Changed";
    case "due_date_reached":
      return "Automatic Stop - Due Date Reached";
    case "task_deleted":
      return "System Stop - Task Deleted";
    case "system":
      return "System Stop";
    default:
      return "—";
  }
}

/** Elapsed for an active (running/paused) entry from server timestamps. */
export function getEntryElapsedMs(
  entry: Pick<
    TimeEntryDto,
    "status" | "startedAt" | "runningSince" | "accumulatedMs" | "durationMs" | "liveElapsedMs"
  >,
  now = Date.now()
): number {
  if (entry.status === "completed" || entry.status === "auto_stopped") {
    return Math.max(0, Number(entry.durationMs) || 0);
  }
  const accumulated = Math.max(0, Number(entry.accumulatedMs) || 0);
  if (entry.status === "paused") return accumulated;
  if (entry.status === "running") {
    const since = entry.runningSince || entry.startedAt;
    const start = new Date(since).getTime();
    if (Number.isNaN(start)) return accumulated;
    return accumulated + Math.max(0, now - start);
  }
  return Math.max(0, Number(entry.liveElapsedMs) || accumulated);
}

export function elapsedMsFromStart(startedAt: string | Date, now = Date.now()): number {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, now - start);
}

export function sameTaskId(a?: string | null, b?: string | null): boolean {
  return String(a || "") === String(b || "");
}
