// Organization role hierarchy: owner > admin > manager > developer > viewer

const ORG_ROLE_PERMISSIONS = {
  owner: [
    "org:create",
    "org:read",
    "org:update",
    "org:delete",
    "org:invite",
    "org:removeMember",
    "org:changeRole",
    "org:createProject",
    "org:manageMembers",
    "org:viewAdmin",
    "org:viewMembers",
  ],
  admin: [
    "org:read",
    "org:update",
    "org:invite",
    "org:removeMember",
    "org:changeRole",
    "org:createProject",
    "org:manageMembers",
    "org:viewAdmin",
    "org:viewMembers",
  ],
  manager: ["org:read", "org:createProject"],
  developer: ["org:read"],
  viewer: ["org:read"],
};

const ORG_ROLE_LEVEL = {
  owner: 5,
  admin: 4,
  manager: 3,
  developer: 2,
  viewer: 1,
};

const hasOrgPermission = (role, permission) => {
  if (!role || !ORG_ROLE_PERMISSIONS[role]) return false;
  return ORG_ROLE_PERMISSIONS[role].includes(permission);
};

const isOrgRoleAtLeast = (role, minRole) => {
  if (!role || !minRole) return false;
  return (ORG_ROLE_LEVEL[role] || 0) >= (ORG_ROLE_LEVEL[minRole] || 0);
};

module.exports = {
  ORG_ROLE_PERMISSIONS,
  ORG_ROLE_LEVEL,
  hasOrgPermission,
  isOrgRoleAtLeast,
};
