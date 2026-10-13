const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/authMiddleware");
const { requireOrgRole } = require("../middleware/orgRbacMiddleware");

const {
  applyLeave,
  getMyLeaves,
  getPendingApprovals,
  decideLeave,
  getUsersOnLeave,
} = require("../controllers/leaveController");

router.use(authMiddleware);

// GET  /api/organisations/:orgId/leaves/mine
router.get("/:orgId/leaves/mine", requireOrgRole("org:read"), getMyLeaves);

// GET  /api/organisations/:orgId/leaves/pending   ?status=pending|approved|rejected
router.get("/:orgId/leaves/pending", requireOrgRole("org:read"), getPendingApprovals);

// GET  /api/organisations/:orgId/leaves/on-leave  ?date=YYYY-MM-DD
router.get("/:orgId/leaves/on-leave", requireOrgRole("org:read"), getUsersOnLeave);

// POST /api/organisations/:orgId/leaves
router.post("/:orgId/leaves", requireOrgRole("org:read"), applyLeave);

// PUT  /api/organisations/:orgId/leaves/:leaveId/decide
router.put("/:orgId/leaves/:leaveId/decide", requireOrgRole("org:read"), decideLeave);

module.exports = router;
