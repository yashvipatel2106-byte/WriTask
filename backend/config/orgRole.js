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

    // Request Forms
    "requestForm:submit",
    "requestForm:manage",
    "requestForm:review",
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

    // Request Forms — Admin has the same Request Forms
    // rights as Owner (create/manage/review); this is
    // enforced independently of these permission flags
    // by a hardcoded Owner/Admin role check on the
    // backend for create/manage endpoints.
    "requestForm:submit",
    "requestForm:manage",
    "requestForm:review",
  ],

  manager: [
    "org:read",
    "org:createProject",

    // Request Forms
    "requestForm:submit",
    
  ],

  developer: [
    "org:read",

    // Request Forms
    "requestForm:submit",
  ],

  viewer: [
    "org:read",

    // Viewers can submit requests.
    "requestForm:submit",
  ],
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
