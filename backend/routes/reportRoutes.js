const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const reportController = require("../controllers/reportController");
const workspaceReportController = require("../controllers/workspaceReportController");

router.use(authMiddleware);

router.get("/weekly/me", reportController.getWeeklyReport);
router.get("/weekly/pdf", reportController.downloadWeeklyPdf);
router.post("/weekly/digest/run", reportController.runWeeklyDigest);

router.get("/data-sources", workspaceReportController.listDataSources);
router.get(
  "/excludable-projects",
  workspaceReportController.listExcludableProjects
);
router.post(
  "/excludable-projects",
  workspaceReportController.listExcludableProjects
);
router.get("/meta", workspaceReportController.getMeta);

router.get("/", workspaceReportController.listReports);
router.post("/", workspaceReportController.createReport);

router.get("/saved/:id/data", workspaceReportController.getReportData);
router.get("/saved/:id/export/excel", workspaceReportController.exportExcel);
router.get("/saved/:id/export/pdf", workspaceReportController.exportPdf);
router.get("/saved/:id", workspaceReportController.getReport);
router.put("/saved/:id", workspaceReportController.updateReport);
router.delete("/saved/:id", workspaceReportController.deleteReport);

router.get("/:id/data", workspaceReportController.getReportData);
router.get("/:id/export/excel", workspaceReportController.exportExcel);
router.get("/:id/export/pdf", workspaceReportController.exportPdf);
router.get("/:id", workspaceReportController.getReport);
router.put("/:id", workspaceReportController.updateReport);
router.delete("/:id", workspaceReportController.deleteReport);

module.exports = router;
