const { ORG_ROLE_PERMISSIONS } = require("../config/orgRole");
const { ROLE_PERMISSIONS } = require("../config/role");

const BUILTIN_PROJECT_BY_ORG_ROLE = {
  owner: ROLE_PERMISSIONS.owner,
  admin: ROLE_PERMISSIONS.admin,
  manager: ROLE_PERMISSIONS.member,
  developer: ROLE_PERMISSIONS.member,
  viewer: ROLE_PERMISSIONS.viewer,
};

/** Org role id → project member role string (for project.members[].role). */
const BUILTIN_ORG_TO_PROJECT_MEMBER = {
  owner: "owner",
  admin: "admin",
  manager: "member",
  developer: "member",
  viewer: "viewer",
};

/** Project member role → org role id (for display / auto org join). */
const BUILTIN_PROJECT_TO_ORG = {
  owner: "owner",
  admin: "admin",
  member: "developer",
  viewer: "viewer",
};

const BUILTIN_LEVELS = {
  owner: 5,
  admin: 4,
  manager: 3,
  developer: 2,
  viewer: 1,
};

function getDefaultRoleDefinitions() {
  return [
    {
      id: "owner",
      name: "Owner",
      isBuiltin: true,
      level: BUILTIN_LEVELS.owner,
      orgPermissions: [...ORG_ROLE_PERMISSIONS.owner],
      projectPermissions: [...ROLE_PERMISSIONS.owner],
    },
    {
      id: "admin",
      name: "Admin",
      isBuiltin: true,
      level: BUILTIN_LEVELS.admin,
      orgPermissions: [...ORG_ROLE_PERMISSIONS.admin],
      projectPermissions: [...ROLE_PERMISSIONS.admin],
    },
    {
      id: "manager",
      name: "Manager",
      isBuiltin: true,
      level: BUILTIN_LEVELS.manager,
      orgPermissions: [...ORG_ROLE_PERMISSIONS.manager],
      projectPermissions: [...ROLE_PERMISSIONS.member],
    },
    {
      id: "developer",
      name: "Developer",
      isBuiltin: true,
      level: BUILTIN_LEVELS.developer,
      orgPermissions: [...ORG_ROLE_PERMISSIONS.developer],
      projectPermissions: [...ROLE_PERMISSIONS.member],
    },
    {
      id: "viewer",
      name: "Viewer",
      isBuiltin: true,
      level: BUILTIN_LEVELS.viewer,
      orgPermissions: [...ORG_ROLE_PERMISSIONS.viewer],
      projectPermissions: [...ROLE_PERMISSIONS.viewer],
    },
  ];
}

function ensureRoleDefinitions(organization) {
  if (!organization.roleDefinitions || organization.roleDefinitions.length === 0) {
    organization.roleDefinitions = getDefaultRoleDefinitions();
    return organization.roleDefinitions;
  }

  const defaults = getDefaultRoleDefinitions();
  const byId = new Map(defaults.map((role) => [role.id, role]));
  const existingIds = new Set(organization.roleDefinitions.map((role) => role.id));

  // Add any builtin roles missing from older org documents
  for (const fallback of defaults) {
    if (existingIds.has(fallback.id)) continue;
    organization.roleDefinitions.push({
      ...fallback,
      orgPermissions: [...fallback.orgPermissions],
      projectPermissions: [...fallback.projectPermissions],
    });
  }

  // Keep builtin name/level in sync, but never overwrite saved permission edits
  for (const role of organization.roleDefinitions) {
    if (!role.isBuiltin) continue;
    const fallback = byId.get(role.id);
    if (!fallback) continue;
    role.name = fallback.name;
    role.level = fallback.level;
    if (!Array.isArray(role.orgPermissions) || role.orgPermissions.length === 0) {
      role.orgPermissions = [...fallback.orgPermissions];
    }
    if (
      !Array.isArray(role.projectPermissions) ||
      role.projectPermissions.length === 0
    ) {
      role.projectPermissions = [...fallback.projectPermissions];
    }
  }
  return organization.roleDefinitions;
}

function findOrgMember(organization, userId) {
  const id = userId.toString();
  return organization.members.find(
    (member) => member.user.toString() === id
  );
}

function getRoleDefinition(organization, roleId) {
  const definitions = ensureRoleDefinitions(organization);
  return definitions.find((role) => role.id === roleId) || null;
}

function resolveMemberOrgPermissions(organization, userId) {
  const member = findOrgMember(organization, userId);
  if (!member) return [];

  if (
    member.permissionOverrides?.useCustom &&
    Array.isArray(member.permissionOverrides.orgPermissions)
  ) {
    return member.permissionOverrides.orgPermissions;
  }

  const roleDef = getRoleDefinition(organization, member.role);
  if (roleDef?.orgPermissions?.length) {
    return roleDef.orgPermissions;
  }

  return ORG_ROLE_PERMISSIONS[member.role] || [];
}

function resolveMemberProjectPermissions(organization, userId) {
  const member = findOrgMember(organization, userId);
  if (!member) return [];

  if (
    member.permissionOverrides?.useCustom &&
    Array.isArray(member.permissionOverrides.projectPermissions)
  ) {
    return member.permissionOverrides.projectPermissions;
  }

  const roleDef = getRoleDefinition(organization, member.role);
  if (roleDef?.projectPermissions?.length) {
    return roleDef.projectPermissions;
  }

  return BUILTIN_PROJECT_BY_ORG_ROLE[member.role] || ROLE_PERMISSIONS.viewer;
}

function hasOrgPermissionForUser(organization, userId, permission) {
  return resolveMemberOrgPermissions(organization, userId).includes(permission);
}

function orgRoleIdToProjectMemberRole(orgRoleId, roleDef = null) {
  if (BUILTIN_ORG_TO_PROJECT_MEMBER[orgRoleId]) {
    return BUILTIN_ORG_TO_PROJECT_MEMBER[orgRoleId];
  }

  const perms = roleDef?.projectPermissions || [];
  if (
    perms.includes("member:changeRole") ||
    perms.includes("project:update") ||
    perms.includes("project:delete")
  ) {
    return "admin";
  }
  if (
    perms.length > 0 &&
    perms.every((perm) => perm === "project:read" || perm === "task:read")
  ) {
    return "viewer";
  }
  return "member";
}

function projectMemberRoleToOrgRoleId(projectRole) {
  return BUILTIN_PROJECT_TO_ORG[projectRole] || projectRole;
}

function slugifyRoleId(name, reserved = []) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "") || `role-${Date.now()}`;

  if (!reserved.includes(base)) return base;

  let suffix = 2;
  while (reserved.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

module.exports = {
  BUILTIN_ORG_TO_PROJECT_MEMBER,
  BUILTIN_PROJECT_TO_ORG,
  BUILTIN_PROJECT_BY_ORG_ROLE,
  getDefaultRoleDefinitions,
  ensureRoleDefinitions,
  getRoleDefinition,
  findOrgMember,
  resolveMemberOrgPermissions,
  resolveMemberProjectPermissions,
  hasOrgPermissionForUser,
  orgRoleIdToProjectMemberRole,
  projectMemberRoleToOrgRoleId,
  slugifyRoleId,
};
