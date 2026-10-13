const express = require("express");
const router = express.Router({ mergeParams: true });
const { requireProjectRole } = require("../middleware/rbacMiddleware");
const {
  listBaselines,
  createBaseline,
  deleteBaseline,
} = require("../controllers/baselineController");

router.get("/", requireProjectRole("task:read"), listBaselines);
router.post("/", requireProjectRole("task:update"), createBaseline);
router.delete("/:baselineId", requireProjectRole("task:update"), deleteBaseline);

module.exports = router;
