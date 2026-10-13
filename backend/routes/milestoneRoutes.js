const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/authMiddleware");
const { requireProjectRole } = require("../middleware/rbacMiddleware");
const {
  listMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} = require("../controllers/milestoneController");

router.use(authMiddleware);
router.get("/", requireProjectRole("task:read"), listMilestones);
router.post("/", requireProjectRole("task:create"), createMilestone);
router.put(
  "/:milestoneId",
  requireProjectRole("task:update"),
  updateMilestone
);
router.delete(
  "/:milestoneId",
  requireProjectRole("task:delete"),
  deleteMilestone
);

module.exports = router;
