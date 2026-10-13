const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getTrash,
  restoreProject,
  restoreTask,
  restoreOrganization,
  restoreSubtask,
  permanentlyDeleteProject,
  permanentlyDeleteTask,
  permanentlyDeleteOrganization,
  permanentlyDeleteSubtask,
} = require("../controllers/trashController");

router.use(authMiddleware);

router.get("/", getTrash);
router.patch("/projects/:projectId/restore", restoreProject);
router.patch("/tasks/:taskId/restore", restoreTask);
router.patch("/organizations/:organizationId/restore", restoreOrganization);
router.patch("/tasks/:taskId/subtasks/:subtaskId/restore", restoreSubtask);
router.delete("/projects/:projectId", permanentlyDeleteProject);
router.delete("/tasks/:taskId", permanentlyDeleteTask);
router.delete("/organizations/:organizationId", permanentlyDeleteOrganization);
router.delete("/tasks/:taskId/subtasks/:subtaskId", permanentlyDeleteSubtask);

module.exports = router;
