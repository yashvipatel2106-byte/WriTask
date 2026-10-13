/**
 * Keep CalendarEvent rows in sync when a Task's due date (or related fields) change.
 * Used instead of running a full org sync on every calendar page load.
 */

const CalendarEvent = require("../models/Calendarevent");
const Project = require("../models/Project");
const Task = require("../models/Task");

function toDateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function resolveId(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return value._id;
  return value;
}

/** Collect unique assignee ObjectIds from Task.assignees + legacy Task.assignee. */
function resolveAssigneeIdsFromTask(task) {
  const ids = [];
  const seen = new Set();

  const push = (value) => {
    const id = resolveId(value);
    if (!id) return;
    const key = id.toString();
    if (seen.has(key)) return;
    seen.add(key);
    ids.push(id);
  };

  if (Array.isArray(task.assignees)) {
    for (const assignee of task.assignees) push(assignee);
  }
  push(task.assignee);
  return ids;
}

/**
 * Upsert a calendar event for a task that has a dueDate.
 * Removes the calendar event if dueDate is cleared or task is deleted/inactive.
 */
async function syncTaskToCalendar(task) {
  if (!task?._id) return { action: "skipped" };

  const taskId = task._id;
  const isGone =
    task.isDeleted === true ||
    task.isActive === false ||
    !task.dueDate;

  if (isGone) {
    const removed = await CalendarEvent.deleteMany({
      taskRef: taskId,
      type: "task",
    });
    if (removed.deletedCount) {
      await Task.updateOne(
        { _id: taskId },
        { $unset: { calendarEventRef: 1 } }
      ).catch(() => {});
    }
    return { action: "removed", count: removed.deletedCount || 0 };
  }

  let organization =
    task.organization?._id || task.organization || null;

  let projectName = "";
  if (task.project?.title) {
    projectName = task.project.title;
  }

  if (!organization || !projectName) {
    const projectId = task.project?._id || task.project;
    if (projectId) {
      const project = await Project.findById(projectId)
        .select("organization title")
        .lean();
      if (project) {
        organization = organization || project.organization;
        projectName = projectName || project.title || "";
      }
    }
  }

  if (!organization) {
    return { action: "skipped", reason: "no organization" };
  }

  const dateKey = toDateKey(task.dueDate);
  const assigneeIds = resolveAssigneeIdsFromTask(task);
  const createdBy = resolveId(task.createdBy);

  const payload = {
    title: task.title,
    description: task.description || "",
    date: dateKey,
    time: "09:00",
    type: "task",
    priority: task.priority || "medium",
    assignees: assigneeIds,
    space: "Internal",
    taskRef: taskId,
    organization,
    projectName,
  };

  // Prefer a single linked event. If duplicates exist from older creates,
  // keep the oldest and remove the rest.
  const existingList = await CalendarEvent.find({ taskRef: taskId, type: "task" })
    .sort({ createdAt: 1 })
    .exec();
  const existing = existingList[0] || null;
  if (existingList.length > 1) {
    const extraIds = existingList.slice(1).map((row) => row._id);
    await CalendarEvent.deleteMany({ _id: { $in: extraIds } });
  }

  if (existing) {
    existing.title = payload.title;
    existing.description = payload.description;
    existing.date = payload.date;
    existing.priority = payload.priority;
    existing.assignees = payload.assignees;
    existing.projectName = payload.projectName;
    existing.organization = payload.organization;
    existing.space = existing.space || payload.space;
    existing.time = existing.time || payload.time;
    if (createdBy && !existing.createdBy) existing.createdBy = createdBy;
    await existing.save();
    await Task.updateOne(
      { _id: taskId },
      { $set: { calendarEventRef: existing._id } }
    ).catch(() => {});
    return { action: "updated", eventId: existing._id };
  }

  const created = await CalendarEvent.create({
    ...payload,
    createdBy: createdBy || organization,
  });
  await Task.updateOne(
    { _id: taskId },
    { $set: { calendarEventRef: created._id } }
  ).catch(() => {});
  return { action: "created", eventId: created._id };
}

async function removeTaskFromCalendar(taskId) {
  if (!taskId) return { action: "skipped" };
  const removed = await CalendarEvent.deleteMany({
    taskRef: taskId,
    type: "task",
  });
  await Task.updateOne(
    { _id: taskId },
    { $unset: { calendarEventRef: 1 } }
  ).catch(() => {});
  return { action: "removed", count: removed.deletedCount || 0 };
}

/** Fire-and-forget wrapper so task APIs are not blocked by sync failures */
function syncTaskToCalendarSafe(task) {
  return syncTaskToCalendar(task).catch((err) => {
    console.error("calendarTaskSync failed:", err.message);
    return { action: "error", message: err.message };
  });
}

function removeTaskFromCalendarSafe(taskId) {
  return removeTaskFromCalendar(taskId).catch((err) => {
    console.error("calendarTaskSync remove failed:", err.message);
    return { action: "error", message: err.message };
  });
}

/**
 * Awaited batch sync for imports / bulk creates. Returns counts.
 */
async function syncTasksToCalendarBatch(tasks) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const task of tasks) {
    try {
      const result = await syncTaskToCalendar(task);
      if (result.action === "created") created += 1;
      else if (result.action === "updated") updated += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      console.error("calendarTaskSync batch item failed:", err.message);
    }
  }

  return { created, updated, skipped, failed };
}

module.exports = {
  syncTaskToCalendar,
  removeTaskFromCalendar,
  syncTaskToCalendarSafe,
  removeTaskFromCalendarSafe,
  syncTasksToCalendarBatch,
  resolveAssigneeIdsFromTask,
  toDateKey,
};
