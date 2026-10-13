const Project = require("../models/Project");
const Task = require("../models/Task");
const CalendarEvent = require("../models/Calendarevent");
const Folder = require("../models/Folder");

class ProjectTrashError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function collectDescendantFolderIds(rootIds) {
  const seeds = (rootIds || [])
    .map((id) => String(id))
    .filter((id) => id && id !== "undefined");
  const all = new Set(seeds);
  let frontier = [...seeds];

  while (frontier.length) {
    const children = await Folder.find({
      parentFolder: { $in: frontier },
      isDeleted: { $ne: true },
    }).select("_id");

    frontier = [];
    for (const child of children) {
      const id = child._id.toString();
      if (!all.has(id)) {
        all.add(id);
        frontier.push(id);
      }
    }
  }

  return [...all];
}

async function trashFoldersForProjects(projectIds, deletedAt) {
  if (!projectIds?.length) return;
  const linkedFolderIds = await Folder.find({
    parentProject: { $in: projectIds },
    isDeleted: { $ne: true },
  }).distinct("_id");
  if (!linkedFolderIds.length) return;

  const allFolderIds = await collectDescendantFolderIds(linkedFolderIds);
  await Folder.updateMany(
    { _id: { $in: allFolderIds }, isDeleted: { $ne: true } },
    { isDeleted: true, deletedAt }
  );
}

/** All project ids in a tree: roots plus every nested subproject. */
async function collectDescendantProjectIds(rootIds) {
  const seeds = (rootIds || [])
    .map((id) => String(id))
    .filter((id) => id && id !== "undefined");
  const all = new Set(seeds);
  let frontier = [...seeds];

  while (frontier.length) {
    const children = await Project.find({
      parentProject: { $in: frontier },
      isDeleted: { $ne: true },
    }).select("_id");

    frontier = [];
    for (const child of children) {
      const id = child._id.toString();
      if (!all.has(id)) {
        all.add(id);
        frontier.push(id);
      }
    }
  }

  return [...all];
}

async function trashProjectTasks(projectId, deletedAt) {
  await Task.updateMany(
    {
      project: projectId,
      isDeleted: { $ne: true },
    },
    {
      isDeleted: true,
      isActive: false,
      deletedAt,
    }
  );

  const taskIds = await Task.find({ project: projectId }).distinct("_id");
  if (taskIds.length) {
    await CalendarEvent.deleteMany({ taskRef: { $in: taskIds } });
  }
}

/**
 * Move one project and its tasks to trash.
 * Returns false when the project was already deleted.
 */
async function trashProjectWithTasks(project, userId, deletedAt, { requireOwner = true } = {}) {
  if (!project || project.isDeleted) return false;

  if (requireOwner) {
    const role = project.getMemberRole(userId);
    if (role !== "owner") {
      throw new ProjectTrashError(
        403,
        `Only the project owner can move "${project.title}" to trash`
      );
    }
  }

  project.isDeleted = true;
  project.deletedAt = deletedAt;
  await project.save();
  await trashProjectTasks(project._id, deletedAt);
  return true;
}

async function assertUserOwnsAllProjects(projectIds, userId) {
  for (const id of projectIds) {
    const project = await Project.findById(id);
    if (!project || project.isDeleted) continue;
    if (project.getMemberRole(userId) !== "owner") {
      throw new ProjectTrashError(
        403,
        `Only the owner of "${project.title}" can delete this folder`
      );
    }
  }
}

/**
 * Trash project trees (each root and all nested subprojects + tasks).
 */
async function moveProjectTreesToTrash(rootProjectIds, userId, options = {}) {
  const allIds = await collectDescendantProjectIds(rootProjectIds);
  if (options.assertOwnership) {
    await assertUserOwnsAllProjects(allIds, userId);
  }

  const deletedAt = new Date();
  let trashed = 0;
  for (const id of allIds) {
    const project = await Project.findById(id);
    if (!project) continue;
    const moved = await trashProjectWithTasks(project, userId, deletedAt, options);
    if (moved) trashed += 1;
  }

  await trashFoldersForProjects(allIds, deletedAt);

  return { trashed, deletedAt, projectIds: allIds };
}

module.exports = {
  ProjectTrashError,
  collectDescendantProjectIds,
  collectDescendantFolderIds,
  trashProjectWithTasks,
  trashProjectTasks,
  moveProjectTreesToTrash,
};
