const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");

const {
  getMembers,
  createMember,
  updateMember,
  deleteMember,
  getMemberStats,
} = require("../controllers/memberController");

// All routes are protected
 router.use(auth);

// GET    /api/members         — list all members (supports ?search=&role=&status=&department=)
router.get("/",          getMembers);

// GET    /api/members/stats   — workspace member stats
router.get("/stats",     getMemberStats);

// POST   /api/members         — add a new member
router.post("/",         createMember);

// PUT    /api/members/:id     — update a member
router.put("/:id",       updateMember);

// DELETE /api/members/:id     — remove a member
router.delete("/:id",    deleteMember);

module.exports = router;
