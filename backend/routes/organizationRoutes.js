const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { requireOrgRole } = require("../middleware/orgRbacMiddleware");
const {
  createOrganization,
  getMyOrganizations,
  getOrganization,
  getOrganizationMembers,
  inviteToOrganization,
  getOrganizationInvitations,
  resendOrganizationInvitation,
  acceptInvitation,
  getMyPendingInvitations,
  removeOrganizationMember,
  deleteOrganizationMemberAccount,
  changeOrganizationMemberRole,

  getOrganizationRoles,
  updateOrganizationRole,
  createOrganizationRole,
  deleteOrganizationRole,
  moveOrganizationToTrash,
  getMyAccess,
} = require("../controllers/organizationController");

router.use(authMiddleware);

router.get("/me/access", getMyAccess);
router.get("/invitations/pending", getMyPendingInvitations);
router.post("/invitations/accept", acceptInvitation);

router.post("/", createOrganization);
router.get("/", getMyOrganizations);
router.get("/:orgId", getOrganization);
router.get("/:orgId/members", requireOrgRole("org:read"), getOrganizationMembers);
router.get(
  "/:orgId/invitations",
  requireOrgRole("org:read"),
  getOrganizationInvitations
);
router.post("/:orgId/invite", requireOrgRole("org:invite"), inviteToOrganization);
router.post(
  "/:orgId/invitations/:inviteId/resend",
  requireOrgRole("org:invite"),
  resendOrganizationInvitation
);
router.delete(
  "/:orgId/members/:memberId",
  requireOrgRole("org:removeMember"),
  removeOrganizationMember
);
router.delete(
  "/:orgId/members/:memberId/account",
  requireOrgRole("org:removeMember"),
  deleteOrganizationMemberAccount
);
router.patch(
  "/:orgId/members/:memberId/role",
  requireOrgRole("org:changeRole"),
  changeOrganizationMemberRole
);

router.get(
  "/:orgId/roles",
  requireOrgRole("org:viewAdmin"),
  getOrganizationRoles
);
router.post(
  "/:orgId/roles",
  requireOrgRole("org:viewAdmin"),
  createOrganizationRole
);
router.put(
  "/:orgId/roles/:roleId",
  requireOrgRole("org:viewAdmin"),
  updateOrganizationRole
);
router.delete(
  "/:orgId/roles/:roleId",
  requireOrgRole("org:viewAdmin"),
  deleteOrganizationRole
);
router.patch(
  "/:orgId/trash",
  requireOrgRole("org:delete"),
  moveOrganizationToTrash
);

module.exports = router;
