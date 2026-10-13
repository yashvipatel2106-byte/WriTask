const authMiddleware = require("../middleware/authMiddleware");
const express = require("express");
const router = express.Router();

const {
  getDashboardStats,
  getDashboardOverview,
  getTaskOverview,
  getProjectProgress,
  getTeamWorkload,
  getUpcomingDeadlines,
  getMissedDeadlines,
  getProjectBreakdown,
  getTeamPerformance,
  getWeeklyTaskActivity,
  getPersonalReport,
  getMemberReport,
} = require("../controllers/dashboardController");

router.get("/stats", authMiddleware, getDashboardStats);
router.get("/overview", authMiddleware, getDashboardOverview);


router.get(
  "/project-progress",
  authMiddleware,
  getProjectProgress
);
router.get(
  "/task-overview",
  authMiddleware,
  getTaskOverview
);

router.get(
  "/upcoming-deadlines",
  authMiddleware,
  getUpcomingDeadlines
);

router.get(
  "/missed-deadlines",
  authMiddleware,
  getMissedDeadlines
);

router.get(
  "/team-workload",
  authMiddleware,
  getTeamWorkload
);

router.get(
  "/reports/project-breakdown",
  authMiddleware,
  getProjectBreakdown
);

router.get(
  "/reports/team-performance",
  authMiddleware,
  getTeamPerformance
);

router.get(
  "/reports/weekly-activity",
  authMiddleware,
  getWeeklyTaskActivity
);

router.get(
  "/reports/personal",
  authMiddleware,
  getPersonalReport
);

router.get(
  "/reports/member/:userId",
  authMiddleware,
  getMemberReport
);


module.exports = router;
