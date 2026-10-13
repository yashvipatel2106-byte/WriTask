const Organization = require("../models/Organization");

const {
  hasOrgPermissionForUser,
  ensureRoleDefinitions,
} = require("../utils/roleDefinitions");

/**
 * Get organization ID from the request.
 */
const getOrganizationId = (req) => {
  return (
    req.params.orgId ||
    req.params.organizationId ||
    req.query.organizationId ||
    req.body.organizationId
  );
};

/**
 * Normalize a permission value into an array.
 */
const normalizePermissions = (permissions) => {
  if (Array.isArray(permissions)) {
    return permissions.filter(Boolean);
  }

  if (permissions) {
    return [permissions];
  }

  return [];
};

/**
 * Require an organization permission.
 *
 * If multiple permissions are provided, the user only
 * needs to have ONE of them.
 *
 * Examples:
 *
 * requireOrgRole("requestForm:manage")
 *
 * requireOrgRole([
 *   "requestForm:manage",
 *   "requestForm:review",
 * ])
 */
const requireOrgRole = (permission) => {
  return async (req, res, next) => {
    try {
      const orgId = getOrganizationId(req);

      if (!orgId) {
        return res.status(400).json({
          message: "Organization ID is required",
        });
      }

      const organization =
        await Organization.findById(orgId);

      if (!organization) {
        return res.status(404).json({
          message: "Organization not found",
        });
      }

      if (organization.isDeleted) {
        return res.status(404).json({
          message:
            "Organization not found or is in trash",
        });
      }

      /*
       * Make sure the organization has its
       * role definitions initialized.
       */
      ensureRoleDefinitions(organization);

      if (!req.user || !req.user._id) {
        return res.status(401).json({
          message: "Authentication required",
        });
      }

      const userId =
        req.user._id.toString();

      const userRole =
        organization.getMemberRole(userId);

      if (!userRole) {
        return res.status(403).json({
          message:
            "You are not a member of this organization",
        });
      }

      const permissions =
        normalizePermissions(permission);

      if (permissions.length === 0) {
        return res.status(500).json({
          message:
            "No organization permissions were specified",
        });
      }

      /*
       * User is allowed if they have ANY
       * of the supplied permissions.
       */
      const allowed =
        permissions.some(
          (requiredPermission) =>
            hasOrgPermissionForUser(
              organization,
              userId,
              requiredPermission
            )
        );

      if (!allowed) {
        return res.status(403).json({
          message:
            `Your role (${userRole}) does not have any of the required permissions: ${permissions.join(
              ", "
            )}`,
        });
      }

      /*
       * Make organization and role available
       * to downstream controllers.
       */
      req.organization = organization;
      req.orgRole = userRole;

      next();
    } catch (error) {
      console.error(
        "Org RBAC middleware error:",
        error
      );

      return res.status(500).json({
        message: "Server error",
      });
    }
  };
};

/**
 * Require ANY one of the supplied organization
 * permissions.
 *
 * Example:
 *
 * requireOrgAnyRole(
 *   "requestForm:manage",
 *   "requestForm:review"
 * )
 */
const requireOrgAnyRole = (...permissions) => {
  return async (req, res, next) => {
    try {
      const orgId = getOrganizationId(req);

      if (!orgId) {
        return res.status(400).json({
          message: "Organization ID is required",
        });
      }

      const organization =
        await Organization.findById(orgId);

      if (!organization) {
        return res.status(404).json({
          message: "Organization not found",
        });
      }

      if (organization.isDeleted) {
        return res.status(404).json({
          message:
            "Organization not found or is in trash",
        });
      }

      ensureRoleDefinitions(organization);

      if (!req.user || !req.user._id) {
        return res.status(401).json({
          message: "Authentication required",
        });
      }

      const userId =
        req.user._id.toString();

      const userRole =
        organization.getMemberRole(userId);

      if (!userRole) {
        return res.status(403).json({
          message:
            "You are not a member of this organization",
        });
      }

      const normalizedPermissions =
        normalizePermissions(
          permissions
        );

      if (
        normalizedPermissions.length === 0
      ) {
        return res.status(500).json({
          message:
            "No organization permissions were specified",
        });
      }

      const allowed =
        normalizedPermissions.some(
          (requiredPermission) =>
            hasOrgPermissionForUser(
              organization,
              userId,
              requiredPermission
            )
        );

      if (!allowed) {
        return res.status(403).json({
          message:
            `Your role (${userRole}) does not have any of the required permissions: ${normalizedPermissions.join(
              ", "
            )}`,
        });
      }

      req.organization = organization;
      req.orgRole = userRole;

      next();
    } catch (error) {
      console.error(
        "Org RBAC any-permission middleware error:",
        error
      );

      return res.status(500).json({
        message: "Server error",
      });
    }
  };
};

/**
 * Require organization owner.
 */
const requireOrgOwner = async (
  req,
  res,
  next
) => {
  try {
    const orgId =
      req.params.orgId ||
      req.params.organizationId ||
      req.body.organizationId;

    if (!orgId) {
      return res.status(400).json({
        message:
          "Organization ID is required",
      });
    }

    const organization =
      await Organization.findById(orgId);

    if (
      !organization ||
      organization.isDeleted
    ) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const userId =
      req.user._id.toString();

    const isOwner =
      organization.owner?.toString() ===
        userId ||
      organization.getMemberRole(userId) ===
        "owner";

    if (!isOwner) {
      return res.status(403).json({
        message:
          "Only the organization owner can edit organization details.",
      });
    }

    req.organization = organization;
    req.orgRole = "owner";

    next();
  } catch (error) {
    console.error(
      "Org owner middleware error:",
      error
    );

    return res.status(500).json({
      message: "Server error",
    });
  }
};

/**
 * Require the organization owner OR a member whose CURRENT
 * organization role is "admin".
 *
 * This intentionally does NOT consult permission flags/overrides
 * (unlike requireOrgRole/requireOrgAnyRole) — some actions (e.g.
 * creating or managing Request Form templates) are restricted to
 * Owner/Admin only, by role, and must not be grantable to another
 * role via a custom permission override. Because this reads the
 * member's live role on every request, a role change (e.g.
 * Developer -> Admin) takes effect immediately.
 */
const requireOrgOwnerOrAdmin = async (req, res, next) => {
  try {
    const orgId = getOrganizationId(req);

    if (!orgId) {
      return res.status(400).json({
        message: "Organization ID is required",
      });
    }

    const organization = await Organization.findById(orgId);

    if (!organization || organization.isDeleted) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const userId = req.user._id.toString();

    const isOwner = organization.owner?.toString() === userId;

    const userRole = organization.getMemberRole(userId);

    if (!isOwner && userRole !== "admin") {
      return res.status(403).json({
        message:
          "Only the organization owner or an admin can perform this action.",
      });
    }

    req.organization = organization;
    req.orgRole = isOwner ? "owner" : "admin";

    next();
  } catch (error) {
    console.error("Org owner/admin middleware error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

module.exports = {
  requireOrgRole,
  requireOrgAnyRole,
  requireOrgOwner,
  requireOrgOwnerOrAdmin,
};