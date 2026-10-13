const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");
const { requireOrgRole, requireOrgOwner } = require("../middleware/orgRbacMiddleware");
const { uploadOrgLogo } = require("../middleware/uploadOrgLogo");
const {
  createOrganization,
  getMyOrganizations,
  getOrganization,
  getOrganizationMembers,
  inviteToOrganization,
  getOrganizationInvitations,
  resendOrganizationInvitation,
  previewInvitation,
  acceptInvitation,
  getMyPendingInvitations,
  removeOrganizationMember,
  deleteOrganizationMemberAccount,
  changeOrganizationMemberRole,
  getOrganizationRoles,
  updateOrganizationRole,
  createOrganizationRole,
  deleteOrganizationRole,
  getMyAccess,
  updateOrganization,
  updateOrganizationWorkHours,
  getOrganizationLogo,
  switchOrganization,
  moveOrganizationToTrash,
} = require("../controllers/organizationController");
const {
  getMemberResourceSettings,
  updateMemberResourceSettings,
  getMemberWorkingSchedule,
  updateMemberWorkingSchedule,
  getOrganizationHolidays,
  createOrganizationHoliday,
  updateOrganizationHoliday,
  getResourceAvailability,
  getResourceUtilization,
  getResourceWorkload,
} = require("../controllers/resourcePlanningController");

// Public: a brand-new invitee has no account yet, so these two must sit
// before the blanket authMiddleware below. acceptInvitation still uses
// req.user (via optionalAuthMiddleware) when the caller happens to be
// signed in, to preserve the existing already-authenticated accept path.
router.get("/invitations/token/:token", previewInvitation);
router.post("/invitations/accept", optionalAuthMiddleware, acceptInvitation);

router.use(authMiddleware);

router.get("/me/access", getMyAccess);
router.get("/invitations/pending", getMyPendingInvitations);

router.post("/", createOrganization);
router.get("/", getMyOrganizations);
router.get("/:orgId", getOrganization);
router.post("/:orgId/switch", switchOrganization);
router.patch(
  "/:orgId",
  requireOrgOwner,
  (req, res, next) => {
    uploadOrgLogo.single("logo")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || "Invalid logo file." });
      }
      next();
    });
  },
  updateOrganization
);
router.patch(
  "/:orgId/work-hours",
  requireOrgRole("org:update"),
  updateOrganizationWorkHours
);
router.get("/:orgId/logo", requireOrgRole("org:read"), getOrganizationLogo);
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
  "/:orgId/members/:memberId/resource-settings",
  requireOrgRole("org:read"),
  getMemberResourceSettings
);
router.put(
  "/:orgId/members/:memberId/resource-settings",
  requireOrgRole("org:update"),
  updateMemberResourceSettings
);
router.get(
  "/:orgId/members/:memberId/working-schedule",
  requireOrgRole("org:read"),
  getMemberWorkingSchedule
);
router.put(
  "/:orgId/members/:memberId/working-schedule",
  requireOrgRole("org:update"),
  updateMemberWorkingSchedule
);

router.get(
  "/:orgId/holidays",
  requireOrgRole("org:read"),
  getOrganizationHolidays
);
router.post(
  "/:orgId/holidays",
  requireOrgOwner,
  createOrganizationHoliday
);

router.put(
  "/:orgId/holidays/:holidayId",
  requireOrgOwner,
  updateOrganizationHoliday
);



router.get(
  "/:orgId/resources/availability",
  requireOrgRole("org:read"),
  getResourceAvailability
);
router.get(
  "/:orgId/resources/utilization",
  requireOrgRole("org:read"),
  getResourceUtilization
);
router.get(
  "/:orgId/resources/workload",
  requireOrgRole("org:read"),
  getResourceWorkload
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
