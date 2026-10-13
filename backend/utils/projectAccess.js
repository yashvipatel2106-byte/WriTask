const Organization = require("../models/Organization");
const { resolveMemberProjectPermissions, findOrgMember } = require("./roleDefinitions");

async function resolveEffectiveProjectPermissions(project, userId) {
  const directRole = project.getMemberRole(userId);
  if (!directRole) return [];

  const { ROLE_PERMISSIONS } = require("../config/role");
  const basePermissions = ROLE_PERMISSIONS[directRole] || [];

  // Project ownership is an explicit, non-overridable grant — the creator
  // always keeps full owner-level control regardless of org role config.
  if (directRole === "owner") return basePermissions;

  // The project's own member role only distinguishes admin/member/viewer, so
  // it can't reflect a custom org role's permission grants (e.g. an admin
  // ticking "status:add" for a custom role in the permissions editor) — nor,
  // just as importantly, an explicit revoke (unticking a permission the
  // built-in role would otherwise always have, like "admin"'s status:add).
  // For org members, the org's resolved permission set is authoritative and
  // REPLACES the generic static table (a plain union could grant but never
  // revoke). Project-only guests with no org membership keep the static
  // table, since there's no org-level config to defer to for them.
  if (!project.organization) return basePermissions;

  const organization = await Organization.findById(project.organization);
  if (!organization) return basePermissions;

  const member = findOrgMember(organization, userId);
  if (!member) return basePermissions;

  return resolveMemberProjectPermissions(organization, userId);
}

function userHasProjectPermission(permissions, permission) {
  if (permissions.includes(permission)) return true;
  if (
    permission === "task:delete" &&
    permissions.includes("task:deleteOwn")
  ) {
    return true;
  }
  return false;
}

function canDeleteTask(permissions, task, userId) {
  if (permissions.includes("task:delete")) return true;
  if (
    permissions.includes("task:deleteOwn") &&
    task.createdBy.toString() === userId
  ) {
    return true;
  }
  return false;
}

function resolveMemberUserId(member) {
  if (!member?.user) return null;
  const u = member.user;
  if (typeof u === "object" && u._id) return u._id.toString();
  return u.toString();
}

async function resolveProjectRoleForUser(project, userId) {
  const directRole = project.getMemberRole(userId);
  if (directRole) return directRole;
  return null;
}

async function buildProjectListFilter(
  userId,
  { organizationId, personal, allOrgProjects } = {}
) {
  const base = { isDeleted: { $ne: true } };

  if (organizationId) {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return { error: { status: 404, message: "Organization not found" } };
    }
    if (!organization.isMember(userId)) {
      return {
        error: {
          status: 403,
          message: "You are not a member of this organization",
        },
      };
    }

    // Admin org-wide reports: every project in the organization
    if (allOrgProjects === true || allOrgProjects === "true") {
      const { hasOrgPermissionForUser } = require("./roleDefinitions");
      if (!hasOrgPermissionForUser(organization, userId, "org:viewAdmin")) {
        return {
          error: {
            status: 403,
            message: "Admin access required for organization-wide reports",
          },
        };
      }
      return {
        filter: { ...base, organization: organizationId },
      };
    }

    return {
      filter: { ...base, organization: organizationId, "members.user": userId },
    };
  }

  if (personal === "true") {
    return {
      filter: { ...base, organization: null, "members.user": userId },
    };
  }

  return { filter: { ...base, "members.user": userId } };
}

function buildOrgProjectMembers(organization, creatorUserId) {
  return [{ user: creatorUserId, role: "owner" }];
}

module.exports = {
  resolveMemberUserId,
  resolveProjectRoleForUser,
  resolveEffectiveProjectPermissions,
  userHasProjectPermission,
  canDeleteTask,
  buildProjectListFilter,
  buildOrgProjectMembers,
};
