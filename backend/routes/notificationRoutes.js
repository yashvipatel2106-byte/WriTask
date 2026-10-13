const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const {
  getNotifications,
  getNotificationSummary,
  createNotification,
  markAsRead,
  markAllAsRead,
  archiveNotification,
} = require("../controllers/notificationController");

router.use(auth);

router.get("/summary", getNotificationSummary);
router.get("/", getNotifications);
router.post("/", createNotification);
router.put("/read-all", markAllAsRead);
router.put("/:id/read", markAsRead);
router.put("/:id/archive", archiveNotification);

module.exports = router;
