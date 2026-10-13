const Project = require("../models/Project");
const { buildProjectListFilter } = require("./projectAccess");

const COMPLETED_STATUS = "completed";
const COMPLETED_STATUSES = new Set(["completed", "done"]);

const ACTIVE_TASK_FILTER = {
  isDeleted: { $ne: true },
  $or: [{ isActive: true }, { isActive: { $exists: false } }],
};

function isTaskCompleted(status, project = null) {
  const normalized = String(status || "").toLowerCase();
  if (COMPLETED_STATUSES.has(normalized)) return true;

  if (project?.customStatuses?.length) {
    const column = project.customStatuses.find((item) => item.id === status);
    if (column) {
      const label = column.label.toLowerCase();
      return label.includes("done") || label.includes("complete");
    }
  }

  return false;
}

/** 0–100 weight for project progress (completed = 100, review = 80, in-progress = 50). */
function getTaskProgressWeight(task, project = null) {
  const status = task?.status || (task?.completed ? COMPLETED_STATUS : "todo");
  if (task?.completed || isTaskCompleted(status, project)) {
    return 100;
  }
  const normalized = String(status || "").toLowerCase();
  if (normalized === "review") return 80;
  if (normalized === "in-progress" || normalized === "in progress") {
    return 50;
  }
  return 0;
}

function getTaskProjectId(task) {
  if (!task?.project) return null;
  if (typeof task.project === "object" && task.project._id) {
    return task.project._id.toString();
  }
  return task.project.toString();
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function openTaskFilter() {
  return {
    isDeleted: { $ne: true },
    status: { $ne: COMPLETED_STATUS },
  };
}

async function getAccessibleProjectIds(
  userId,
  { organizationId, personal, allOrgProjects, workspaceId, trashOnly } = {}
) {
  const result = await buildProjectListFilter(userId, {
    organizationId,
    personal,
    allOrgProjects,
    workspaceId,
    trashOnly,
  });

  if (result.error) {
    return { error: result.error };
  }

  const projects = await Project.find(result.filter, "_id");
  return { ids: projects.map((p) => p._id) };
}

/** Match tasks assigned to a user (legacy assignee + assignees array). */
function assigneeMatchFilter(userId) {
  return {
    $or: [{ assignee: userId }, { assignees: userId }],
  };
}

/** Active tasks assigned to a user (assignee or assignees), with optional filters. */
function buildAssignedActiveTaskFilter(userId, extra = {}) {
  return {
    isDeleted: { $ne: true },
    $and: [
      { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
      assigneeMatchFilter(userId),
    ],
    ...extra,
  };
}

module.exports = {
  COMPLETED_STATUS,
  COMPLETED_STATUSES,
  ACTIVE_TASK_FILTER,
  isTaskCompleted,
  getTaskProgressWeight,
  getTaskProjectId,
  buildAssignedActiveTaskFilter,
  startOfToday,
  openTaskFilter,
  getAccessibleProjectIds,
  assigneeMatchFilter,
};
