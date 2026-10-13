const express = require("express");

const router = express.Router();

const auth =
require("../middleware/authMiddleware");

const {
  getSettings,
  updateSettings,
} = require(
  "../controllers/settingController"
);

router.get(
  "/",
  auth,
  getSettings
);

router.put(
  "/",
  auth,
  updateSettings
);

module.exports = router;