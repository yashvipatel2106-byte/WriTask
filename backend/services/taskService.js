const Task = require("../models/Task");
const Project = require("../models/Project");
const { getIO } = require("../socket/socket");
const EVENTS = require("../socket/events");
const { buildCreatedEntry, buildSubtaskAddedEntry } = require("../utils/taskActivity");
const { notifyAssignment, notifySubtaskAssignment } = require("../utils/notificationService");
const { syncTaskToCalendarSafe } = require("../utils/calendarTaskSync");

async function safeNotify(fn) {
  try {
    await fn();
  } catch (error) {
    console.error("Notification failed:", error.message);
  }
}

const populateTaskList = (query) =>
  query
    .populate("assignee", "username email")
    .populate("assignees", "username email")
    .populate("createdBy", "username email")
    .populate("subtasks.assignee", "username email")
    .populate("subtasks.assignees", "username email");

async function createTaskService({
  project: suppliedProject,
  projectId,
  user,
  title,
  description = "",
  assigneeIds = [],
  priority = "medium",
  dueDate = null,
  startDate = null,
  durationHours = null,
  effortHours = null,
  workingDays = null,
  status = "todo",
  tags = [],
}) {
  const project = suppliedProject || await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");
  if (!user?._id) throw new Error("Task creator is required.");

  const count = await Task.countDocuments({ project: project._id, status });
  const task = await Task.create({
    title: String(title).trim(),
    description,
    project: project._id,
    organization: project.organization || null,
    createdBy: user._id,
    assignee: assigneeIds[0] || null,
    assignees: assigneeIds,
    priority,
    dueDate,
    startDate,
    durationHours,
    effortHours,
    workingDays,
    tags,
    status,
    order: count,
    activityLog: [buildCreatedEntry(user._id, String(title).trim())],
  });

  const populated = await populateTaskList(Task.findById(task._id)).exec();
  if (!populated) throw new Error("Task created but could not be loaded.");

  if (assigneeIds.length > 0) {
    await safeNotify(() => notifyAssignment({
      assigneeId: assigneeIds[0], actorId: user._id, task: populated, projectId: project._id,
    }));
  }

  getIO().to(project._id.toString()).emit(EVENTS.TASK_CREATED, populated);

  // Await sync so Excel import / create always lands on the calendar before
  // the API responds. Failures are swallowed so task creation still succeeds.
  if (populated.dueDate) {
    await syncTaskToCalendarSafe(populated);
  }

  return populated;
}

async function createSubtaskService({
  parentTaskId,
  project,
  user,
  title,
  description = "",
  assigneeIds = [],
  priority = "medium",
  dueDate = null,
  startDate = null,
  effortHours = null,
  status = "todo",
}) {
  if (!user?._id) throw new Error("Task creator is required.");

  const parentTask = await Task.findOne({
    _id: parentTaskId,
    project: project._id,
    isDeleted: { $ne: true },
  });
  if (!parentTask) throw new Error("Parent Task not found.");

  const trimmedTitle = String(title).trim();
  if (!Array.isArray(parentTask.subtasks)) parentTask.subtasks = [];
  if (!Array.isArray(parentTask.activityLog)) parentTask.activityLog = [];
  parentTask.subtasks.push({
    title: trimmedTitle,
    description,
    assignee: assigneeIds[0] || null,
    assignees: assigneeIds,
    priority,
    status,
    completed: status === "completed",
    startDate,
    dueDate,
    effortHours,
    order: parentTask.subtasks.length,
    createdBy: user._id,
    createdAt: new Date(),
  });
  const newSubtaskId = parentTask.subtasks[parentTask.subtasks.length - 1]._id;
  parentTask.activityLog.push(buildSubtaskAddedEntry(user._id, trimmedTitle, newSubtaskId));
  await parentTask.save();

  const populated = await populateTaskList(Task.findById(parentTask._id)).exec();
  const subtask = populated?.subtasks?.[populated.subtasks.length - 1];
  if (!populated || !subtask) throw new Error("Subtask created but could not be loaded.");

  if (assigneeIds.length > 0) {
    await safeNotify(() => notifySubtaskAssignment({
      assigneeId: assigneeIds[0],
      assigneeIds,
      actorId: user._id,
      task: populated,
      projectId: project._id,
      project,
      subtaskTitle: trimmedTitle,
      subtaskId: subtask._id,
    }));
  }

  getIO().to(project._id.toString()).emit(EVENTS.TASK_UPDATED, populated);
  return { task: populated, subtask };
}

module.exports = { createTaskService, createSubtaskService };
