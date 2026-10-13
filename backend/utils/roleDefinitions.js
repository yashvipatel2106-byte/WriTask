const { ORG_ROLE_PERMISSIONS } = require("../config/orgRole");
const { ROLE_PERMISSIONS } = require("../config/role");

/**
 * Organization role → default project permissions.
 */
const BUILTIN_PROJECT_BY_ORG_ROLE = {
  owner: ROLE_PERMISSIONS.owner,
  admin: ROLE_PERMISSIONS.admin,
  manager: ROLE_PERMISSIONS.member,
  developer: ROLE_PERMISSIONS.member,
  viewer: ROLE_PERMISSIONS.viewer,
};

/**
 * Organization role → project member role.
 */
const BUILTIN_ORG_TO_PROJECT_MEMBER = {
  owner: "owner",
  admin: "admin",
  manager: "member",
  developer: "member",
  viewer: "viewer",
};

/**
 * Project member role → organization role.
 */
const BUILTIN_PROJECT_TO_ORG = {
  owner: "owner",
  admin: "admin",
  member: "developer",
  viewer: "viewer",
};

/**
 * Gantt permissions.
 */
const NEW_GANTT_PERMISSIONS = [
  "gantt:read",
  "gantt:editSchedule",
  "gantt:manageDependencies",
  "gantt:manageMilestones",
  "gantt:viewCriticalPath",
  "gantt:viewConflicts",
  "gantt:resolveConflicts",
  "gantt:viewBaseline",
  "gantt:manageBaseline",
];

/**
 * Built-in organization role levels.
 */
const BUILTIN_LEVELS = {
  owner: 5,
  admin: 4,
  manager: 3,
  developer: 2,
  viewer: 1,
};

/**
 * Return default built-in role definitions.
 */
function getDefaultRoleDefinitions() {
  return [
    {
      id: "owner",
      name: "Owner",
      isBuiltin: true,
      level: BUILTIN_LEVELS.owner,

      orgPermissions: [
        ...ORG_ROLE_PERMISSIONS.owner,
      ],

      projectPermissions: [
        ...ROLE_PERMISSIONS.owner,
      ],
    },

    {
      id: "admin",
      name: "Admin",
      isBuiltin: true,
      level: BUILTIN_LEVELS.admin,

      orgPermissions: [
        ...ORG_ROLE_PERMISSIONS.admin,
      ],

      projectPermissions: [
        ...ROLE_PERMISSIONS.admin,
      ],
    },

    {
      id: "manager",
      name: "Manager",
      isBuiltin: true,
      level: BUILTIN_LEVELS.manager,

      orgPermissions: [
        ...ORG_ROLE_PERMISSIONS.manager,
      ],

      projectPermissions: [
        ...ROLE_PERMISSIONS.member,
      ],
    },

    {
      id: "developer",
      name: "Developer",
      isBuiltin: true,
      level: BUILTIN_LEVELS.developer,

      orgPermissions: [
        ...ORG_ROLE_PERMISSIONS.developer,
      ],

      projectPermissions: [
        ...ROLE_PERMISSIONS.member,
      ],
    },

    {
      id: "viewer",
      name: "Viewer",
      isBuiltin: true,
      level: BUILTIN_LEVELS.viewer,

      orgPermissions: [
        ...ORG_ROLE_PERMISSIONS.viewer,
      ],

      projectPermissions: [
        ...ROLE_PERMISSIONS.viewer,
      ],
    },
  ];
}

/**
 * Add missing permissions from the current default
 * role definition without removing existing permissions.
 *
 * This is important because organizations created
 * before Request Forms was implemented may already
 * have roleDefinitions saved in MongoDB without:
 *
 * requestForm:submit
 * requestForm:manage
 * requestForm:review
 */
function mergeMissingPermissions(
  existingPermissions,
  defaultPermissions
) {
  const existing = Array.isArray(
    existingPermissions
  )
    ? existingPermissions
    : [];

  const defaults = Array.isArray(
    defaultPermissions
  )
    ? defaultPermissions
    : [];

  const merged = [...existing];

  for (const permission of defaults) {
    if (!merged.includes(permission)) {
      merged.push(permission);
    }
  }

  return merged;
}

/**
 * Make sure an organization has valid role definitions.
 *
 * Important:
 * - Existing custom permissions are preserved.
 * - Missing new default permissions are added.
 * - Old organizations are automatically upgraded
 *   in memory when permissions are resolved.
 */
function ensureRoleDefinitions(
  organization
) {
  if (!organization) {
    return [];
  }

  /*
   * Organization has no role definitions.
   * Create the complete default set.
   */
  if (
    !Array.isArray(
      organization.roleDefinitions
    ) ||
    organization.roleDefinitions.length === 0
  ) {
    organization.roleDefinitions =
      getDefaultRoleDefinitions();

    return organization.roleDefinitions;
  }

  const defaults =
    getDefaultRoleDefinitions();

  const defaultsById = new Map(
    defaults.map((role) => [
      role.id,
      role,
    ])
  );

  const existingIds = new Set(
    organization.roleDefinitions.map(
      (role) => role.id
    )
  );

  /*
   * Add any missing built-in roles.
   */
  for (const fallback of defaults) {
    if (existingIds.has(fallback.id)) {
      continue;
    }

    organization.roleDefinitions.push({
      ...fallback,

      orgPermissions: [
        ...fallback.orgPermissions,
      ],

      projectPermissions: [
        ...fallback.projectPermissions,
      ],
    });
  }

  /*
   * Update existing built-in roles.
   *
   * We DO NOT replace their existing permissions.
   * We only add permissions that are missing from
   * the current default definition.
   */
  for (const role of organization.roleDefinitions) {
    if (!role.isBuiltin) {
      continue;
    }

    const fallback =
      defaultsById.get(role.id);

    if (!fallback) {
      continue;
    }

    /*
     * Keep built-in role metadata synchronized.
     */
    role.name = fallback.name;
    role.level = fallback.level;

    /*
     * Add newly introduced organization
     * permissions.
     *
     * This is what fixes Request Forms for
     * existing organizations.
     */
    role.orgPermissions =
      mergeMissingPermissions(
        role.orgPermissions,
        fallback.orgPermissions
      );

    /*
     * Add any missing project permissions.
     */
    role.projectPermissions =
      mergeMissingPermissions(
        role.projectPermissions,
        fallback.projectPermissions
      );
  }

  return organization.roleDefinitions;
}

/**
 * Check whether a user is the organization owner.
 */
function isOrganizationOwner(
  organization,
  userId
) {
  if (!organization || !userId) {
    return false;
  }

  const id =
    userId.toString();

  return (
    organization.owner?.toString() ===
    id
  );
}

/**
 * Find an organization member.
 */
function findOrgMember(
  organization,
  userId
) {
  if (
    !organization ||
    !Array.isArray(
      organization.members
    ) ||
    !userId
  ) {
    return null;
  }

  const id =
    userId.toString();

  return (
    organization.members.find(
      (member) => {
        if (!member?.user) {
          return false;
        }

        return (
          member.user.toString() ===
          id
        );
      }
    ) || null
  );
}

/**
 * Get a role definition by role id.
 */
function getRoleDefinition(
  organization,
  roleId
) {
  const definitions =
    ensureRoleDefinitions(
      organization
    );

  return (
    definitions.find(
      (role) => role.id === roleId
    ) || null
  );
}

/**
 * Resolve owner organization permissions.
 */
function resolveOwnerOrgPermissions(
  organization
) {
  const roleDef =
    getRoleDefinition(
      organization,
      "owner"
    );

  if (
    roleDef &&
    Array.isArray(
      roleDef.orgPermissions
    )
  ) {
    return roleDef.orgPermissions;
  }

  return (
    ORG_ROLE_PERMISSIONS.owner || []
  );
}

/**
 * Resolve owner project permissions.
 */
function resolveOwnerProjectPermissions(
  organization
) {
  const roleDef =
    getRoleDefinition(
      organization,
      "owner"
    );

  if (
    roleDef &&
    Array.isArray(
      roleDef.projectPermissions
    )
  ) {
    return roleDef.projectPermissions;
  }

  return (
    BUILTIN_PROJECT_BY_ORG_ROLE.owner ||
    []
  );
}

/**
 * Resolve organization permissions
 * for a specific member.
 */
function resolveMemberOrgPermissions(
  organization,
  userId
) {
  /*
   * Organization owner.
   */
  if (
    isOrganizationOwner(
      organization,
      userId
    )
  ) {
    return resolveOwnerOrgPermissions(
      organization
    );
  }

  const member =
    findOrgMember(
      organization,
      userId
    );

  if (!member) {
    return [];
  }

  /*
   * Explicit custom permissions override
   * the role permissions.
   */
  if (
    member.permissionOverrides
      ?.useCustom &&
    Array.isArray(
      member.permissionOverrides
        .orgPermissions
    )
  ) {
    return (
      member.permissionOverrides
        .orgPermissions
    );
  }

  /*
   * Normal role-based permissions.
   */
  const roleDef =
    getRoleDefinition(
      organization,
      member.role
    );

  if (
    roleDef &&
    Array.isArray(
      roleDef.orgPermissions
    )
  ) {
    return roleDef.orgPermissions;
  }

  /*
   * Fallback to config defaults.
   */
  return (
    ORG_ROLE_PERMISSIONS[
      member.role
    ] || []
  );
}

/**
 * Resolve project permissions
 * for a specific member.
 */
function resolveMemberProjectPermissions(
  organization,
  userId
) {
  /*
   * Organization owner.
   */
  if (
    isOrganizationOwner(
      organization,
      userId
    )
  ) {
    return resolveOwnerProjectPermissions(
      organization
    );
  }

  const member =
    findOrgMember(
      organization,
      userId
    );

  if (!member) {
    return [];
  }

  /*
   * Explicit custom permissions.
   */
  if (
    member.permissionOverrides
      ?.useCustom &&
    Array.isArray(
      member.permissionOverrides
        .projectPermissions
    )
  ) {
    return (
      member.permissionOverrides
        .projectPermissions
    );
  }

  /*
   * Role definition.
   */
  const roleDef =
    getRoleDefinition(
      organization,
      member.role
    );

  if (
    roleDef &&
    Array.isArray(
      roleDef.projectPermissions
    )
  ) {
    return roleDef.projectPermissions;
  }

  /*
   * Fallback.
   */
  return (
    BUILTIN_PROJECT_BY_ORG_ROLE[
      member.role
    ] ||
    ROLE_PERMISSIONS.viewer ||
    []
  );
}

/**
 * Check whether a user has an
 * organization permission.
 */
function hasOrgPermissionForUser(
  organization,
  userId,
  permission
) {
  const permissions =
    resolveMemberOrgPermissions(
      organization,
      userId
    );

  return permissions.includes(
    permission
  );
}

/**
 * Convert organization role to
 * project member role.
 */
function orgRoleIdToProjectMemberRole(
  orgRoleId,
  roleDef = null
) {
  if (
    BUILTIN_ORG_TO_PROJECT_MEMBER[
      orgRoleId
    ]
  ) {
    return (
      BUILTIN_ORG_TO_PROJECT_MEMBER[
        orgRoleId
      ]
    );
  }

  const perms =
    roleDef?.projectPermissions || [];

  if (
    perms.includes(
      "member:changeRole"
    ) ||
    perms.includes(
      "project:update"
    ) ||
    perms.includes(
      "project:delete"
    )
  ) {
    return "admin";
  }

  if (
    perms.length > 0 &&
    perms.every(
      (permission) =>
        permission ===
          "project:read" ||
        permission ===
          "task:read"
    )
  ) {
    return "viewer";
  }

  return "member";
}

/**
 * Convert project member role
 * back to organization role.
 */
function projectMemberRoleToOrgRoleId(
  projectRole
) {
  return (
    BUILTIN_PROJECT_TO_ORG[
      projectRole
    ] || projectRole
  );
}

/**
 * Create a safe role id.
 */
function slugifyRoleId(
  name,
  reserved = []
) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(
        /[^a-z0-9-]/g,
        ""
      ) ||
    `role-${Date.now()}`;

  if (
    !reserved.includes(base)
  ) {
    return base;
  }

  let suffix = 2;

  while (
    reserved.includes(
      `${base}-${suffix}`
    )
  ) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

module.exports = {
  BUILTIN_ORG_TO_PROJECT_MEMBER,
  BUILTIN_PROJECT_TO_ORG,
  BUILTIN_PROJECT_BY_ORG_ROLE,

  getDefaultRoleDefinitions,
  ensureRoleDefinitions,
  getRoleDefinition,

  isOrganizationOwner,
  findOrgMember,

  resolveMemberOrgPermissions,
  resolveMemberProjectPermissions,

  hasOrgPermissionForUser,

  orgRoleIdToProjectMemberRole,
  projectMemberRoleToOrgRoleId,

  slugifyRoleId,

  NEW_GANTT_PERMISSIONS,
};