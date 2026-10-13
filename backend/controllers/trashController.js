const fs = require("fs");
const path = require("path");
const Project = require("../models/Project");
const Task = require("../models/Task");
const Folder = require("../models/Folder");
const Organization = require("../models/Organization");
const CalendarEvent = require("../models/Calendarevent");
const OrganizationInvitation = require("../models/OrganizationInvitation");
const ProjectInvitation = require("../models/ProjectInvitation");
const { uploadsRoot } = require("../middleware/uploadMiddleware");
const { syncTaskToCalendarSafe } = require("../utils/calendarTaskSync");
const { getIO } = require("../socket/socket");
const EVENTS = require("../socket/events");
const { buildProjectListFilter } = require("../utils/projectAccess");
const { backfillLegacyProjectWorkspaces } = require("../utils/workspaces");
const {
  resolveContainerWorkspace,
  assertCanCreateInOrg,
  isValidId,
} = require("../utils/projectHierarchy");
const { collectDescendantFolderIds } = require("../utils/projectTrash");

const notDeleted = { $ne: true };

/** Find a subtask subdocument by id, whether it's active or in trash. */
function findSubtaskAnywhere(task, subtaskId) {
  if (!subtaskId) return null;
  return task.subtasks.id(subtaskId) || task.deletedSubtasks.id(subtaskId);
}

/**
 * Full ancestor chain for a nested subtask, root-most first — e.g. for
 * Task > "Test 1" > "Test sub" > "testttt", calling this on "testttt"
 * returns ["Test 1", "Test sub"]. Excludes the task itself and the
 * subtask itself; walks through both active and trashed subtasks since
 * an ancestor at any level may also be deleted.
 */
function subtaskAncestorChain(task, subtask) {
  const chain = [];
  let currentParentId = subtask.parentSubtaskId;
  while (currentParentId) {
    const parent = findSubtaskAnywhere(task, currentParentId);
    if (!parent) break;
    chain.unshift(parent.title);
    currentParentId = parent.parentSubtaskId;
  }
  return chain;
}

const getTrash = async (req, res) => {
  try {
    const userId = req.user._id;
    const { organizationId, personal, workspaceId } = req.query;

    await backfillLegacyProjectWorkspaces(userId, {
      organizationId,
      personal,
    });

    const scopeResult = await buildProjectListFilter(userId, {
      organizationId,
      personal,
      workspaceId,
    });
    if (scopeResult.error) {
      return res
        .status(scopeResult.error.status)
        .json({ message: scopeResult.error.message });
    }

    const scopedProjectIds = await Project.find(scopeResult.filter).distinct(
      "_id"
    );

    const projectFilter = {
      ...scopeResult.filter,
      isDeleted: true,
    };

    const taskFilter = {
      isDeleted: true,
      project: { $in: scopedProjectIds },
    };

    const subtaskTaskFilter = {
      project: { $in: scopedProjectIds },
      "deletedSubtasks.0": { $exists: true },
    };

    if (organizationId) {
      taskFilter.organization = organizationId;
      subtaskTaskFilter.organization = organizationId;
    } else if (personal === "true") {
      taskFilter.organization = null;
      subtaskTaskFilter.organization = null;
    }

    const [projects, tasks, tasksWithDeletedSubtasks, folders] = await Promise.all([
      Project.find(projectFilter)
        .populate("organization", "name slug isDeleted")
        .populate("owner", "username email")
        .sort({ deletedAt: -1 }),
      Task.find(taskFilter)
        .populate("project", "title isDeleted")
        .populate("assignee", "username email")
        .populate("createdBy", "username email")
        .sort({ deletedAt: -1 }),
      Task.find(subtaskTaskFilter)
        .select("title isDeleted project subtasks deletedSubtasks")
        .populate("deletedSubtasks.deletedBy", "username email")
        .populate("deletedSubtasks.assignees", "username email"),
      (async () => {
        try {
          const scope = await resolveContainerWorkspace(userId, {
            organizationId,
            personal,
            workspaceId,
          });
          return Folder.find({
            workspace: scope.workspaceId,
            isDeleted: true,
          })
            .populate("parentFolder", "name isDeleted")
            .populate("parentProject", "title isDeleted")
            .sort({ deletedAt: -1 });
        } catch {
          return [];
        }
      })(),
    ]);

    const subtasks = tasksWithDeletedSubtasks
      .flatMap((task) =>
        task.deletedSubtasks.map((s) => {
          // A nested subtask's immediate parent may itself still be
          // active, or also sitting in trash — check both so the trash
          // list can show "Task > immediate parent" instead of always
          // just the top-level task title.
          const activeParent = s.parentSubtaskId
            ? task.subtasks.id(s.parentSubtaskId)
            : null;
          const deletedParent =
            s.parentSubtaskId && !activeParent
              ? task.deletedSubtasks.id(s.parentSubtaskId)
              : null;
          const parentSubtask = activeParent || deletedParent;

          return {
            _id: s._id,
            title: s.title,
            description: s.description,
            status: s.status,
            priority: s.priority,
            startDate: s.startDate,
            dueDate: s.dueDate,
            completed: s.completed,
            assignees: s.assignees,
            deletedAt: s.deletedAt,
            deletedBy: s.deletedBy,
            deletedWithTask: s.deletedWithTask,
            parentSubtaskId: s.parentSubtaskId || null,
            parentSubtaskName: parentSubtask ? parentSubtask.title : null,
            // True only when the immediate parent is a subtask that is
            // itself sitting in trash — as opposed to no parent (top-level)
            // or a parent that's still active.
            parentSubtaskDeleted: Boolean(deletedParent),
            // Every ancestor subtask between the task and this one's
            // immediate parent, root-most first — lets the trash list show
            // the full "Task > Ancestor > ... > Immediate parent" chain
            // instead of skipping straight from the task to just one level up.
            ancestorSubtaskNames: subtaskAncestorChain(task, s),
            task: {
              _id: task._id,
              title: task.title,
              isDeleted: task.isDeleted,
              project: task.project,
            },
          };
        })
      )
      .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

    res.json({ projects, tasks, subtasks, folders });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const restoreProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project || !project.isDeleted) {
      return res.status(404).json({
        message: "Deleted project not found",
      });
    }

    if (!project.isMember(req.user._id)) {
      return res.status(403).json({
        message: "Access denied",
      });
    }

    // Restore Project
    project.isDeleted = false;
    project.deletedAt = null;

    if (project.folder) {
      const folder = await Folder.findOne({
        _id: project.folder,
        isDeleted: { $ne: true },
      });
      if (!folder) {
        project.folder = null;
      }
    }

    await project.save();

    // Restore Tasks
    await Task.updateMany(
      {
        project: project._id,
        isDeleted: true,
      },
      {
        isDeleted: false,
        isActive: true,
        deletedAt: null,
      }
    );

    return res.json({
      message: "Project restored successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

const restoreTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task || !task.isDeleted) {
      return res.status(404).json({ message: "Deleted task not found" });
    }

    const project = await Project.findById(task.project);
    if (!project || !project.isMember(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (project.isDeleted) {
      return res.status(409).json({
        message:
          "The parent project is still in trash. Restore the project first, then this task.",
      });
    }

    // Bring back exactly the subtasks that were cascaded into trash when
    // this task was deleted — anything trashed independently beforehand
    // stays in trash.
    if (Array.isArray(task.deletedSubtasks) && task.deletedSubtasks.length > 0) {
      const idsToRestore = task.deletedSubtasks
        .filter((s) => s.deletedWithTask)
        .map((s) => s._id.toString());
      idsToRestore.forEach((id) => {
        const s = task.deletedSubtasks.id(id);
        if (!s) return;
        const data = s.toObject();
        delete data.deletedAt;
        delete data.deletedBy;
        delete data.deletedWithTask;
        task.subtasks.push(data);
        s.deleteOne();
      });
      if (idsToRestore.length > 0) {
        task.markModified("subtasks");
        task.markModified("deletedSubtasks");
      }
    }

    task.isDeleted = false;
    task.isActive = true;
    task.deletedAt = null;
    await task.save();

    const io = getIO();
    io.to(task.project.toString()).emit(EVENTS.TASK_MOVED, task);

    if (task.dueDate) {
      void syncTaskToCalendarSafe(task);
    }

    res.json({ message: "Task restored" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const restoreOrganization = async (req, res) => {
  try {
    const organization = await Organization.findById(
      req.params.organizationId
    );

    if (!organization || !organization.isDeleted) {
      return res.status(404).json({
        message: "Deleted organization not found",
      });
    }

    if (!organization.isMember(req.user._id)) {
      return res.status(403).json({
        message: "Access denied",
      });
    }

    const orgId = organization._id;

    organization.isDeleted = false;
    organization.deletedAt = null;
    await organization.save();

    await Project.updateMany(
      {
        organization: orgId,
        isDeleted: true,
      },
      {
        isDeleted: false,
        deletedAt: null,
      }
    );

    const orgProjectIds = await Project.find({ organization: orgId }).distinct(
      "_id"
    );

    await Task.updateMany(
      {
        project: { $in: orgProjectIds },
        isDeleted: true,
      },
      {
        isDeleted: false,
        isActive: true,
        deletedAt: null,
      }
    );

    return res.json({
      message: "Organization restored successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

const restoreSubtask = async (req, res) => {
  try {
    const { taskId, subtaskId } = req.params;
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const project = await Project.findById(task.project);
    if (!project || !project.isMember(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const subtask = task.deletedSubtasks?.id(subtaskId);
    if (!subtask) {
      return res.status(404).json({ message: "Deleted subtask not found" });
    }

    if (task.isDeleted) {
      return res.status(409).json({
        message:
          "The parent task is still in trash. Restore the task first, then this subtask.",
      });
    }

    if (subtask.parentSubtaskId && !task.subtasks.id(subtask.parentSubtaskId)) {
      return res.status(409).json({
        message:
          "The parent subtask is still in trash. Restore it first, then this subtask.",
      });
    }

    const data = subtask.toObject();
    delete data.deletedAt;
    delete data.deletedBy;
    delete data.deletedWithTask;
    delete data.deletedWithSubtaskId;
    task.subtasks.push(data);
    subtask.deleteOne();

    // Bring back exactly the descendants that were cascaded into trash when
    // THIS subtask was deleted — anything trashed independently (before or
    // after) stays in trash.
    const cascadedIds = task.deletedSubtasks
      .filter((s) => s.deletedWithSubtaskId?.toString() === subtaskId)
      .map((s) => s._id.toString());
    cascadedIds.forEach((id) => {
      const child = task.deletedSubtasks.id(id);
      if (!child) return;
      const childData = child.toObject();
      delete childData.deletedAt;
      delete childData.deletedBy;
      delete childData.deletedWithTask;
      delete childData.deletedWithSubtaskId;
      task.subtasks.push(childData);
      child.deleteOne();
    });

    task.markModified("subtasks");
    task.markModified("deletedSubtasks");
    await task.save();

    res.json({ message: "Subtask restored" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const permanentlyDeleteSubtask = async (req, res) => {
  try {
    const { taskId, subtaskId } = req.params;
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const project = await Project.findById(task.project);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const userId = req.user._id.toString();
    const role = project.getMemberRole(userId);
    if (!["owner", "admin"].includes(role)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    const subtask = task.deletedSubtasks?.id(subtaskId);
    if (!subtask) {
      return res.status(404).json({ message: "Deleted subtask not found" });
    }

    // Permanently remove anything that was cascaded into trash along with
    // this subtask too — otherwise those entries are orphaned forever,
    // referencing a deletedWithSubtaskId that no longer exists.
    const cascadedIds = task.deletedSubtasks
      .filter((s) => s.deletedWithSubtaskId?.toString() === subtaskId)
      .map((s) => s._id.toString());
    cascadedIds.forEach((id) => task.deletedSubtasks.id(id)?.deleteOne());

    subtask.deleteOne();
    task.markModified("deletedSubtasks");
    await task.save();

    res.json({ message: "Subtask permanently deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const permanentlyDeleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project || !project.isDeleted) {
      return res.status(404).json({ message: "Deleted project not found" });
    }

    const role = project.getMemberRole(req.user._id);
    if (role !== "owner") {
      return res.status(403).json({ message: "Only the project owner can permanently delete" });
    }

    const tasks = await Task.find({ project: project._id }).select("_id");
    const taskIds = tasks.map((t) => t._id);

    for (const taskId of taskIds) {
      const taskDir = path.join(uploadsRoot, taskId.toString());
      if (fs.existsSync(taskDir)) {
        fs.rmSync(taskDir, { recursive: true, force: true });
      }
    }

    await CalendarEvent.deleteMany({
      taskRef: { $in: taskIds },
    });

    await Task.deleteMany({
      project: project._id,
    });

    await ProjectInvitation.deleteMany({
      project: project._id,
    });

    await Project.findByIdAndDelete(project._id);

    res.json({ message: "Project permanently deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const permanentlyDeleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task || !task.isDeleted) {
      return res.status(404).json({ message: "Deleted task not found" });
    }

    const project = await Project.findById(task.project);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const userId = req.user._id.toString();
    const role = project.getMemberRole(userId);
    const canDeleteAny = ["owner", "admin"].includes(role);
    const canDeleteOwn =
      role === "member" && task.createdBy.toString() === userId;

    if (!canDeleteAny && !canDeleteOwn) {
      return res.status(403).json({ message: "Permission denied" });
    }

    const taskDir = path.join(uploadsRoot, task._id.toString());
    if (fs.existsSync(taskDir)) {
      fs.rmSync(taskDir, { recursive: true, force: true });
    }

    await Task.findByIdAndDelete(task._id);
    res.json({ message: "Task permanently deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const permanentlyDeleteOrganization = async (req, res) => {
  try {
    const requestedOrgId = req.params.organizationId;
    const organization = await Organization.findById(requestedOrgId);
    if (!organization || !organization.isDeleted) {
      return res.status(404).json({ message: "Deleted organization not found" });
    }

    if (organization._id.toString() !== requestedOrgId.toString()) {
      return res.status(400).json({ message: "Organization ID mismatch" });
    }

    const role = organization.getMemberRole(req.user._id);
    if (role !== "owner" && organization.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the organization owner can permanently delete" });
    }

    const orgId = organization._id;
    const projects = await Project.find({
      organization: orgId,
    });

    const projectIds = projects.map((p) => p._id);

    const tasks = await Task.find({
      project: {
        $in: projectIds,
      },
    });

    for (const task of tasks) {
      const taskDir = path.join(uploadsRoot, task._id.toString());
      if (fs.existsSync(taskDir)) {
        fs.rmSync(taskDir, { recursive: true, force: true });
      }
    }

    // Covers both task-linked events and standalone meetings/reminders/leaves,
    // which are only ever linked via `organization`, not `taskRef`.
    await CalendarEvent.deleteMany({
      organization: orgId,
    });

    await Task.deleteMany({
      project: {
        $in: projectIds,
      },
    });

    await Project.deleteMany({
      organization: orgId,
    });

    await OrganizationInvitation.deleteMany({
      organization: orgId,
    });

    await ProjectInvitation.deleteMany({
      project: {
        $in: projectIds,
      },
    });

    await Organization.findByIdAndDelete(orgId);

    res.json({
      message: "Organization permanently deleted",
      organizationId: orgId.toString(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const restoreFolder = async (req, res) => {
  try {
    if (!isValidId(req.params.folderId)) {
      return res.status(400).json({ message: "Invalid folder" });
    }

    const folder = await Folder.findOne({
      _id: req.params.folderId,
      isDeleted: true,
    });
    if (!folder) {
      return res.status(404).json({ message: "Deleted folder not found" });
    }

    const scope = await resolveContainerWorkspace(req.user._id, {
      workspaceId: folder.workspace,
      organizationId: folder.organization,
    });
    await assertCanCreateInOrg(scope.organizationId, req.user._id);

    if (folder.parentFolder) {
      const parent = await Folder.findOne({
        _id: folder.parentFolder,
        isDeleted: { $ne: true },
      });
      if (!parent) {
        return res.status(409).json({
          message:
            "The parent folder is still in trash. Restore the parent folder first.",
        });
      }
    }

    if (folder.parentProject) {
      const parentProject = await Project.findOne({
        _id: folder.parentProject,
        isDeleted: { $ne: true },
      });
      if (!parentProject) {
        return res.status(409).json({
          message:
            "The parent project is still in trash. Restore the parent project first.",
        });
      }
    }

    folder.isDeleted = false;
    folder.deletedAt = null;
    await folder.save();

    res.json({ message: "Folder restored successfully" });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

const permanentlyDeleteFolder = async (req, res) => {
  try {
    if (!isValidId(req.params.folderId)) {
      return res.status(400).json({ message: "Invalid folder" });
    }

    const folder = await Folder.findOne({
      _id: req.params.folderId,
      isDeleted: true,
    });
    if (!folder) {
      return res.status(404).json({ message: "Deleted folder not found" });
    }

    const scope = await resolveContainerWorkspace(req.user._id, {
      workspaceId: folder.workspace,
      organizationId: folder.organization,
    });
    await assertCanCreateInOrg(scope.organizationId, req.user._id);

    const folderIds = await collectDescendantFolderIds([folder._id]);
    await Folder.deleteMany({
      _id: { $in: folderIds },
      isDeleted: true,
    });

    res.json({ message: "Folder permanently deleted" });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getTrash,
  restoreProject,
  restoreTask,
  restoreOrganization,
  restoreSubtask,
  restoreFolder,
  permanentlyDeleteProject,
  permanentlyDeleteTask,
  permanentlyDeleteOrganization,
  permanentlyDeleteSubtask,
  permanentlyDeleteFolder,
  notDeleted,
};
