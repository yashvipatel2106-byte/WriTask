const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { requireProjectRole } = require("../middleware/rbacMiddleware");
const Project =
require("../models/Project");

  

const {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  moveProjectToTrash,
  inviteMember,
  removeMember,
  changeMemberRole,
  getProjectMembers,
  acceptProjectInvitation,
  getMyPendingProjectInvitations,
  getProjectInvitations,
  resendProjectInvitation,
} = require("../controllers/projectController");
const taskRoutes = require("./taskRoutes");

// All routes below require login
router.use(authMiddleware);

// ── Project invitations (before /:projectId) ─────────────────────
router.get("/invitations", getMyPendingProjectInvitations);
router.post("/invitations/accept", acceptProjectInvitation);

// ── Project CRUD ──────────────────────────────────────────────────
router.post("/", createProject);                                          // Create project (any logged-in user)
router.get("/", getProjects);                                             // Get my projects
router.get("/:projectId", requireProjectRole("project:read"), getProject);         // Get one project
router.put("/:projectId", requireProjectRole("project:update"), updateProject);    // Edit project
router.patch("/:projectId/trash", moveProjectToTrash);                             // Move to trash
router.delete("/:projectId", requireProjectRole("project:delete"), deleteProject); // Permanent delete (must be in trash)

// ── Tasks (scoped to project) ─────────────────────────────────────
router.use("/:projectId/tasks", taskRoutes);

// ── Member Management ─────────────────────────────────────────────
router.get("/:projectId/members", requireProjectRole("project:read"), getProjectMembers);
router.post("/:projectId/members", requireProjectRole("member:invite"), inviteMember);
router.get("/:projectId/invitations", requireProjectRole("project:read"), getProjectInvitations);
router.post(
  "/:projectId/invitations/:inviteId/resend",
  requireProjectRole("member:invite"),
  resendProjectInvitation
);
router.delete("/:projectId/members/:memberId", requireProjectRole("member:remove"), removeMember);
router.patch("/:projectId/members/:memberId/role", requireProjectRole("member:changeRole"), changeMemberRole);

module.exports = router;