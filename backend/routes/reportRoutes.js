const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const reportController = require("../controllers/reportController");



router.get("/weekly/me", authMiddleware, reportController.getWeeklyReport);
router.get("/weekly/pdf", authMiddleware, reportController.downloadWeeklyPdf);
router.post(
  "/weekly/digest/run",
  authMiddleware,
  reportController.runWeeklyDigest
);

module.exports = router;
