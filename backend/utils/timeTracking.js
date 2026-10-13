const TimeEntry = require("../models/TimeEntry");
const { buildEntry } = require("./taskActivity");
const { createNotification } = require("./notificationService");

const MS_PER_HOUR = 60 * 60 * 1000;
const ACTIVE_STATUSES = ["running", "paused"];

function toDateKey(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function isTaskOverdue(task, now = new Date()) {
  if (!task?.dueDate) return false;
  const dueKey = toDateKey(task.dueDate);
  const nowKey = toDateKey(now);
  if (!dueKey || !nowKey) return false;
  return nowKey > dueKey;
}

function isInProgressStatus(status) {
  return String(status || "").toLowerCase() === "in-progress";
}

function isCompletedStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "completed" || s === "done";
}

function effortLimitMs(effortHours) {
  if (effortHours == null) return null;
  const hours = Number(effortHours);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return Math.round(hours * MS_PER_HOUR);
}

function getAccumulatedMs(entry) {
  return Math.max(0, Number(entry?.accumulatedMs) || 0);
}

/** Live elapsed for a running/paused entry (not yet finalized). */
function getLiveElapsedMs(entry, now = new Date()) {
  if (!entry) return 0;
  const base = getAccumulatedMs(entry);
  if (entry.status === "running") {
    const since = entry.runningSince || entry.startedAt;
    if (!since) return base;
    return base + Math.max(0, now.getTime() - new Date(since).getTime());
  }
  if (entry.status === "paused") return base;
  if (entry.durationMs != null) return Math.max(0, Number(entry.durationMs) || 0);
  return base;
}

async function sumTrackedMsForTask(taskId, { excludeEntryId } = {}) {
  const filter = {
    task: taskId,
    status: { $in: ["completed", "auto_stopped"] },
    durationMs: { $ne: null },
  };
  if (excludeEntryId) {
    filter._id = { $ne: excludeEntryId };
  }
  const rows = await TimeEntry.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: "$durationMs" } } },
  ]);
  return rows[0]?.total || 0;
}

function getTimerBlockReason(task, { trackedMs = 0, now = new Date() } = {}) {
  if (!task) return "Task not found.";
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

  if (isTaskOverdue(task, now)) {
    return "Task is overdue. Move the task to In Progress and extend the due date before starting the timer.";
  }

  const limit = effortLimitMs(task.effortHours);
  if (limit != null && trackedMs >= limit) {
    return "Effort limit reached.";
  }

  return null;
}

function formatDurationHuman(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function formatHoursMinutes(ms) {
  const totalMin = Math.max(0, Math.round(Number(ms) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

async function appendTaskActivity(taskId, actorId, payload) {
  try {
    const Task = require("../models/Task");
    const entry = buildEntry(actorId, {
      kind: "change",
      ...payload,
    });
    await Task.findByIdAndUpdate(taskId, { $push: { activityLog: entry } });
    return entry;
  } catch (error) {
    // Never fail start/pause/resume/stop because activity logging failed —
    // the TimeEntry mutation is already the source of truth.
    console.error("appendTaskActivity failed:", error?.message || error);
    return null;
  }
}

async function finalizeRunningEntry(entry, {
  endedAt,
  stopReason,
  actorId,
  task,
  notifyEffort = false,
} = {}) {
  if (!entry || !ACTIVE_STATUSES.includes(entry.status)) return entry;

  const end = endedAt instanceof Date ? endedAt : new Date(endedAt || Date.now());
  const durationMs = getLiveElapsedMs(entry, end);
  const auto =
    stopReason && stopReason !== "manual" ? "auto_stopped" : "completed";

  entry.endedAt = end < new Date(entry.startedAt) ? new Date(entry.startedAt) : end;
  entry.durationMs = durationMs;
  entry.accumulatedMs = durationMs;
  entry.runningSince = null;
  entry.status = auto;
  entry.activeSession = false;
  entry.stopReason = stopReason || "manual";
  await entry.save();

  const taskDoc = task || (await require("../models/Task").findById(entry.task));
  const title = taskDoc?.title || "task";
  const actor = actorId || entry.user;

  const reasonMessages = {
    manual: `stopped the timer after ${formatDurationHuman(durationMs)}.`,
    effort_reached: `had the timer automatically stopped because the task reached its estimated effort of ${taskDoc?.effortHours ?? "?"}h.`,
    switched_task: `had the timer automatically stopped because work started on another task.`,
    status_changed: `had the timer automatically stopped because the task status changed${taskDoc?.status ? ` to ${taskDoc.status}` : ""}.`,
    due_date_reached: `had the timer automatically stopped because the task reached its due date.`,
    system: `had the timer stopped by the system after ${formatDurationHuman(durationMs)}.`,
    task_deleted: `had the timer automatically stopped because the task was deleted.`,
  };

  const message = reasonMessages[stopReason] || reasonMessages.system;

  await appendTaskActivity(entry.task, actor, {
    action:
      stopReason === "manual" ? "timer_stopped" : `timer_auto_stopped_${stopReason}`,
    message,
    field: "timer",
    newValue: formatDurationHuman(durationMs),
    meta: {
      timeEntryId: String(entry._id),
      stopReason: entry.stopReason,
      durationMs,
    },
  });

  if (notifyEffort && stopReason === "effort_reached") {
    try {
      await createNotification({
        userId: entry.user,
        actorId: null,
        type: "system",
        title: "Effort limit reached",
        message: `Timer for "${title}" was automatically stopped after reaching ${taskDoc?.effortHours ?? "?"}h.`,
        taskId: entry.task,
        projectId: entry.project,
        priority: "High",
        link: `/projects/${entry.project}?task=${entry.task}&tab=time-log`,
      });
    } catch (error) {
      console.error("effort notification failed:", error?.message || error);
    }
  }

  return entry;
}

async function pauseEntry(entry, { actorId, now = new Date() } = {}) {
  if (!entry || entry.status !== "running") return entry;
  const accumulated = getLiveElapsedMs(entry, now);
  entry.accumulatedMs = accumulated;
  entry.runningSince = null;
  entry.status = "paused";
  entry.activeSession = true;
  await entry.save();

  await appendTaskActivity(entry.task, actorId || entry.user, {
    action: "timer_paused",
    message: `paused the timer at ${formatDurationHuman(accumulated)}.`,
    field: "timer",
    newValue: formatDurationHuman(accumulated),
    meta: { timeEntryId: String(entry._id), accumulatedMs: accumulated },
  });

  return entry;
}

async function resumeEntry(entry, { actorId, now = new Date() } = {}) {
  if (!entry || entry.status !== "paused") return entry;
  entry.runningSince = now;
  entry.status = "running";
  entry.activeSession = true;
  await entry.save();

  await appendTaskActivity(entry.task, actorId || entry.user, {
    action: "timer_resumed",
    message: "resumed the timer.",
    field: "timer",
    meta: { timeEntryId: String(entry._id) },
  });

  return entry;
}

async function reconcileRunningEntry(entry, task, now = new Date()) {
  if (!entry || entry.status !== "running") return entry;

  const live = getLiveElapsedMs(entry, now);
  const trackedBefore = await sumTrackedMsForTask(task._id, {
    excludeEntryId: entry._id,
  });
  const limit = effortLimitMs(task.effortHours);

  let stopAt = null;
  let reason = null;

  if (isTaskOverdue(task, now) || (task.dueDate && toDateKey(now) > toDateKey(task.dueDate))) {
    const dueKey = toDateKey(task.dueDate);
    if (dueKey) {
      const dueEnd = new Date(`${dueKey}T23:59:59.999Z`);
      const since = new Date(entry.runningSince || entry.startedAt);
      stopAt = dueEnd < since ? since : dueEnd;
      if (now >= stopAt) reason = "due_date_reached";
    }
  }

  if (limit != null) {
    const remaining = limit - trackedBefore;
    if (remaining <= 0) {
      stopAt = new Date(entry.runningSince || entry.startedAt);
      reason = "effort_reached";
    } else {
      const since = new Date(entry.runningSince || entry.startedAt);
      const already = getAccumulatedMs(entry);
      const needFromSegment = Math.max(0, remaining - already);
      const effortStop = new Date(since.getTime() + needFromSegment);
      if (now >= effortStop) {
        if (!stopAt || effortStop <= stopAt) {
          stopAt = effortStop;
          reason = "effort_reached";
        }
      }
    }
  }

  if (reason && stopAt) {
    return finalizeRunningEntry(entry, {
      endedAt: stopAt,
      stopReason: reason,
      actorId: entry.user,
      task,
      notifyEffort: reason === "effort_reached",
    });
  }

  // silence unused in some paths
  void live;
  return entry;
}

async function stopAllRunningForTask(taskId, { stopReason, actorId, task } = {}) {
  const active = await TimeEntry.find({
    task: taskId,
    status: { $in: ACTIVE_STATUSES },
  });
  const results = [];
  for (const entry of active) {
    results.push(
      await finalizeRunningEntry(entry, {
        endedAt: new Date(),
        stopReason: stopReason || "system",
        actorId,
        task,
        notifyEffort: false,
      })
    );
  }
  return results;
}

async function findActiveForUser(userId) {
  return TimeEntry.findOne({
    user: userId,
    status: { $in: ACTIVE_STATUSES },
  })
    .populate("user", "username email avatarColor")
    .populate("task", "title status dueDate effortHours project")
    .populate("project", "name");
}

function serializeEntry(entry) {
  if (!entry) return null;
  const obj = entry.toObject ? entry.toObject() : entry;
  const now = new Date();
  const liveElapsedMs =
    obj.status === "running" || obj.status === "paused"
      ? getLiveElapsedMs(obj, now)
      : obj.durationMs;
  return {
    _id: String(obj._id),
    task: obj.task?._id ? String(obj.task._id) : String(obj.task),
    taskTitle: obj.task?.title || null,
    project: obj.project?._id ? String(obj.project._id) : String(obj.project),
    user: obj.user
      ? {
          _id: String(obj.user._id || obj.user),
          username: obj.user.username,
          email: obj.user.email,
          avatarColor: obj.user.avatarColor,
        }
      : null,
    startedAt: obj.startedAt,
    runningSince: obj.runningSince || null,
    accumulatedMs: getAccumulatedMs(obj),
    liveElapsedMs,
    endedAt: obj.endedAt,
    durationMs: obj.durationMs,
    status: obj.status,
    stopReason: obj.stopReason,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

async function buildTimeSummary(taskId, task) {
  const trackedMs = await sumTrackedMsForTask(taskId);
  const effortMs = effortLimitMs(task?.effortHours);
  let remainingMs = null;
  let overEffortMs = null;
  if (effortMs != null) {
    if (trackedMs <= effortMs) remainingMs = effortMs - trackedMs;
    else overEffortMs = trackedMs - effortMs;
  }
  return {
    trackedMs,
    effortHours: task?.effortHours ?? null,
    effortMs,
    remainingMs,
    overEffortMs,
    trackedLabel: formatHoursMinutes(trackedMs),
    effortLabel: effortMs != null ? formatHoursMinutes(effortMs) : null,
    remainingLabel: remainingMs != null ? formatHoursMinutes(remainingMs) : null,
    overEffortLabel:
      overEffortMs != null ? formatHoursMinutes(overEffortMs) : null,
  };
}

module.exports = {
  MS_PER_HOUR,
  ACTIVE_STATUSES,
  toDateKey,
  isTaskOverdue,
  isInProgressStatus,
  isCompletedStatus,
  effortLimitMs,
  getAccumulatedMs,
  getLiveElapsedMs,
  sumTrackedMsForTask,
  getTimerBlockReason,
  formatDurationHuman,
  formatHoursMinutes,
  appendTaskActivity,
  finalizeRunningEntry,
  pauseEntry,
  resumeEntry,
  reconcileRunningEntry,
  stopAllRunningForTask,
  findActiveForUser,
  serializeEntry,
  buildTimeSummary,
};
