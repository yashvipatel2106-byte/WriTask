const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/authMiddleware");
const { requireProjectRole, requireTaskPermission } = require("../middleware/rbacMiddleware");
const { upload } = require("../middleware/uploadMiddleware");
const {
  createTask,
  getTasksByProject,
  getTask,
  updateTask,
  deleteTask,
  uploadTaskAttachment,
  deleteTaskAttachment,
  downloadTaskAttachment,
  getTaskComments,
  addTaskComment,
  updateTaskComment,
  getTaskActivity,
  getCalendarTasks,
  addSubtask,
  updateSubtask,
  deleteSubtask,
} = require("../controllers/taskController");

router.use(authMiddleware);
router.get(
  "/calendar",
  getCalendarTasks
);
router.post("/", requireProjectRole("task:create"), createTask);
router.get("/", requireProjectRole("task:read"), getTasksByProject);
router.get("/:taskId", requireTaskPermission("task:read"), getTask);
router.put("/:taskId", requireTaskPermission("task:update"), updateTask);
router.delete("/:taskId", requireTaskPermission("task:delete"), deleteTask);
router.post(
  "/:taskId/attachments",
  requireTaskPermission("task:update"),
  upload.single("file"),
  uploadTaskAttachment
);
router.get(
  "/:taskId/attachments/:attachmentId",
  requireTaskPermission("task:read"),
  downloadTaskAttachment
);
router.delete(
  "/:taskId/attachments/:attachmentId",
  requireTaskPermission("task:update"),
  deleteTaskAttachment
);
router.get(
  "/:taskId/activity",
  requireTaskPermission("task:read"),
  getTaskActivity
);
router.get(
  "/:taskId/comments",
  requireTaskPermission("task:read"),
  getTaskComments
);
router.post(
  "/:taskId/comments",
  requireTaskPermission("task:read"),
  addTaskComment
);
router.put(
  "/:taskId/comments/:commentId",
  requireTaskPermission("task:read"),
  updateTaskComment
);
router.post(
  "/:taskId/subtasks",
  requireTaskPermission("task:update"),
  addSubtask
);
router.put(
  "/:taskId/subtasks/:subtaskId",
  requireTaskPermission("task:update"),
  updateSubtask
);
router.delete(
  "/:taskId/subtasks/:subtaskId",
  requireTaskPermission("task:update"),
  deleteSubtask
);


module.exports = router;
