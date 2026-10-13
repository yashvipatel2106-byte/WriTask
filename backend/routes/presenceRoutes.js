const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getMyStatus,
  updateMyStatus,
  resetMyStatus,
  updateVisibility,
  getBulkPresence,
} = require("../controllers/presenceController");

router.use(authMiddleware);

// Bulk lookup for painting badges across a list of users (e.g. Members page).
router.get("/", getBulkPresence);

router.get("/me", getMyStatus);
router.patch("/me", updateMyStatus);
router.post("/me/reset", resetMyStatus);
router.patch("/me/visibility", updateVisibility);

module.exports = router;
