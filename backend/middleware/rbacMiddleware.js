const Project = require("../models/Project");
const Task = require("../models/Task");
const {
  resolveProjectRoleForUser,
  resolveEffectiveProjectPermissions,
  userHasProjectPermission,
  canDeleteTask,
} = require("../utils/projectAccess");

/**
 * requireProjectRole(permission)
 * 
 * Usage on any project route:
 *   router.delete("/:projectId", authMiddleware, requireProjectRole("project:delete"), ...)
 * 
 * Expects: req.user (set by authMiddleware), req.params.projectId
 * Sets: req.project, req.userRole for use in controllers
 */
const requireProjectRole = (permission) => {
  return async (req, res, next) => {
    try {
      const projectId =
        req.params.projectId || req.params.id || req.body.projectId;

      if (!projectId) {
        return res.status(400).json({ message: "Project ID is required" });
      }

      const project = await Project.findById(projectId);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (project.isDeleted) {
        return res.status(404).json({ message: "Project not found or is in trash" });
      }

      const userId = req.user._id.toString();
      const userRole = await resolveProjectRoleForUser(project, userId);
      const permissions = await resolveEffectiveProjectPermissions(project, userId);

      if (!userRole && permissions.length === 0) {
        return res.status(403).json({
          message: "You are not a member of this project",
        });
      }

      if (!userHasProjectPermission(permissions, permission)) {
        return res.status(403).json({
          message: `Your role (${userRole || "member"}) does not have permission: ${permission}`,
        });
      }

      // Attach to request for use in controllers
      req.project = project;
      req.userRole = userRole;

      next();
    } catch (error) {
      console.error("RBAC middleware error:", error);
      res.status(500).json({ message: "Server error" });
    }
  };
};

/**
 * requireTaskPermission(permission)
 * 
 * For task routes — checks both project membership AND ownership for "deleteOwn"
 * Expects: req.params.taskId
 */
const requireTaskPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const taskId = req.params.taskId || req.params.id;

      if (!taskId) {
        return res.status(400).json({ message: "Task ID is required" });
      }

      const task = await Task.findById(taskId);

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (task.isDeleted && permission !== "task:read") {
        return res.status(404).json({ message: "Task not found or is in trash" });
      }

      if (
        req.params.projectId &&
        task.project.toString() !== req.params.projectId
      ) {
        return res.status(404).json({ message: "Task not found in this project" });
      }

      const project = await Project.findById(task.project);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const userId = req.user._id.toString();
      const userRole = await resolveProjectRoleForUser(project, userId);
      const permissions = await resolveEffectiveProjectPermissions(project, userId);

      if (!userRole && permissions.length === 0) {
        return res.status(403).json({
          message: "You are not a member of this project",
        });
      }

      if (permission === "task:delete") {
        if (!canDeleteTask(permissions, task, userId)) {
          return res.status(403).json({
            message: "You can only delete tasks you created",
          });
        }
      } else {

  if (!userHasProjectPermission(permissions, permission)) {
    return res.status(403).json({
      message: `Your role (${userRole || "member"}) does not have permission: ${permission}`,
    });
  }

}

      req.task = task;
      req.project = project;
      req.userRole = userRole;

      next();
    } catch (error) {
      console.error("RBAC task middleware error:", error);
      res.status(500).json({ message: "Server error" });
    }
  };
};

module.exports = { requireProjectRole, requireTaskPermission };