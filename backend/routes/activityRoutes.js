const express = require("express");

const router = express.Router();

const auth = require("../middleware/authMiddleware");

const {
  getActivities,
} = require("../controllers/activityController");

// GET ALL ACTIVITIES OF LOGGED-IN USER

router.get(
  "/",
  getActivities
);

module.exports = router;