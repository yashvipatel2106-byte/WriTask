const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { resolveMeetingByRoomId } = require("../controllers/Calendarcontroller");

// Shareable meeting links: /api/meetings/:roomId
router.get("/:roomId", authMiddleware, resolveMeetingByRoomId);

module.exports = router;
