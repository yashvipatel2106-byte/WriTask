const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/authMiddleware");
const { requireTaskPermission } = require("../middleware/rbacMiddleware");
const {
  startTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  getActiveTimer,
  listTaskTimeEntries,
  getTaskTimeSummary,
} = require("../controllers/timeEntryController");

router.use(authMiddleware);

// Nested under /api/projects/:projectId/tasks/:taskId/time-entries
router.get(
  "/active",
  requireTaskPermission("task:read"),
  getActiveTimer
);
router.get(
  "/",
  requireTaskPermission("task:read"),
  listTaskTimeEntries
);
router.get(
  "/summary",
  requireTaskPermission("task:read"),
  getTaskTimeSummary
);
router.post(
  "/start",
  requireTaskPermission("task:update"),
  startTimer
);
router.post(
  "/:entryId/pause",
  requireTaskPermission("task:update"),
  pauseTimer
);
router.post(
  "/:entryId/resume",
  requireTaskPermission("task:update"),
  resumeTimer
);
router.post(
  "/:entryId/stop",
  requireTaskPermission("task:update"),
  stopTimer
);

module.exports = router;
