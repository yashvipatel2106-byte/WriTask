const mongoose = require("mongoose");

const DEPENDENCY_TYPES = ["FS", "SS", "FF", "SF"];
const MAX_DEPENDENCIES_PER_TASK = 25;

function toIdString(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

/**
 * Normalize client dependency payload into schema-ready rows.
 * Accepts FS, SS, FF, and SF.
 */
function normalizeDependenciesInput(raw) {
  if (raw === null) return [];
  if (!Array.isArray(raw)) {
    const err = new Error("dependencies must be an array");
    err.status = 400;
    throw err;
  }

  if (raw.length > MAX_DEPENDENCIES_PER_TASK) {
    const err = new Error(
      `A task can have at most ${MAX_DEPENDENCIES_PER_TASK} dependencies`
    );
    err.status = 400;
    throw err;
  }

  const seen = new Set();
  const normalized = [];

  for (const entry of raw) {
    const taskId = toIdString(entry?.taskId ?? entry?.predecessorId);
    if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
      const err = new Error("Each dependency must reference a valid taskId");
      err.status = 400;
      throw err;
    }
    if (seen.has(taskId)) continue;
    seen.add(taskId);

    const type = String(entry?.type || "FS")
      .trim()
      .toUpperCase();
    if (!DEPENDENCY_TYPES.includes(type)) {
      const err = new Error(
        `Invalid dependency type "${entry?.type}". Use FS, SS, FF, or SF.`
      );
      err.status = 400;
      throw err;
    }

    let lagDays = Number(entry?.lagDays ?? 0);
    if (!Number.isFinite(lagDays)) lagDays = 0;
    lagDays = Math.trunc(lagDays);
    if (lagDays < -365 || lagDays > 365) {
      const err = new Error("lagDays must be between -365 and 365");
      err.status = 400;
      throw err;
    }

    normalized.push({
      taskId: new mongoose.Types.ObjectId(taskId),
      type,
      lagDays,
    });
  }

  return normalized;
}

/**
 * Detect cycles if `taskId` gains edges to `dependencyTaskIds`.
 * Graph edge: successor -> predecessor (depends-on direction).
 */
function wouldCreateCycle(taskId, dependencyTaskIds, allTasks) {
  const self = String(taskId);
  const deps = dependencyTaskIds.map(String);
  if (deps.includes(self)) return true;

  const adj = new Map();
  for (const task of allTasks) {
    const id = String(task._id);
    const list = Array.isArray(task.dependencies) ? task.dependencies : [];
    adj.set(
      id,
      list.map((d) => toIdString(d.taskId)).filter(Boolean)
    );
  }
  adj.set(self, deps);

  const visiting = new Set();
  const visited = new Set();

  function dfs(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adj.get(node) || []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  return dfs(self);
}

async function validateDependenciesForTask({
  Task,
  projectId,
  taskId,
  dependencies,
}) {
  const normalized = normalizeDependenciesInput(dependencies);
  const depIds = normalized.map((d) => String(d.taskId));

  if (depIds.includes(String(taskId))) {
    const err = new Error("A task cannot depend on itself");
    err.status = 400;
    throw err;
  }

  if (depIds.length === 0) return normalized;

  const inProject = await Task.find({
    _id: { $in: depIds },
    project: projectId,
    isDeleted: { $ne: true },
  }).select("_id");

  if (inProject.length !== depIds.length) {
    const err = new Error(
      "Dependencies must reference active tasks in the same project"
    );
    err.status = 400;
    throw err;
  }

  const projectTasks = await Task.find({
    project: projectId,
    isDeleted: { $ne: true },
  }).select("_id dependencies");

  if (wouldCreateCycle(taskId, depIds, projectTasks)) {
    const err = new Error(
      "This dependency would create a circular relationship"
    );
    err.status = 400;
    throw err;
  }

  return normalized;
}

function formatDependenciesSummary(deps = []) {
  if (!Array.isArray(deps) || deps.length === 0) return "none";
  return deps
    .map((d) => {
      const id = toIdString(d.taskId);
      const type = d.type || "FS";
      const lag = Number(d.lagDays) || 0;
      const lagPart = lag === 0 ? "" : lag > 0 ? `+${lag}d` : `${lag}d`;
      return `${type}${lagPart}:${id?.slice(-6) || "?"}`;
    })
    .join(", ");
}

module.exports = {
  DEPENDENCY_TYPES,
  normalizeDependenciesInput,
  wouldCreateCycle,
  validateDependenciesForTask,
  formatDependenciesSummary,
  toIdString,
};
