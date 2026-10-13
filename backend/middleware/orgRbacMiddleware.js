const Organization = require("../models/Organization");
const {
  hasOrgPermissionForUser,
  ensureRoleDefinitions,
} = require("../utils/roleDefinitions");

const requireOrgRole = (permission) => {
  return async (req, res, next) => {
    try {
      const orgId =
        req.params.orgId || req.params.organizationId || req.body.organizationId;

      if (!orgId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      const organization = await Organization.findById(orgId);

      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      if (organization.isDeleted) {
        return res.status(404).json({ message: "Organization not found or is in trash" });
      }

      ensureRoleDefinitions(organization);

      const userId = req.user._id.toString();
      const userRole = organization.getMemberRole(userId);

      if (!userRole) {
        return res.status(403).json({
          message: "You are not a member of this organization",
        });
      }

      if (!hasOrgPermissionForUser(organization, userId, permission)) {
        return res.status(403).json({
          message: `Your role (${userRole}) does not have permission: ${permission}`,
        });
      }

      req.organization = organization;
      req.orgRole = userRole;

      next();
    } catch (error) {
      console.error("Org RBAC middleware error:", error);
      res.status(500).json({ message: "Server error" });
    }
  };
};

module.exports = { requireOrgRole };
