const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { getActiveTimer } = require("../controllers/timeEntryController");

router.use(authMiddleware);

/** User-scoped active timer (any project). */
router.get("/active", getActiveTimer);

module.exports = router;
