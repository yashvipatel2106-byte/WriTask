// Role hierarchy: owner > admin > member > viewer
// Each role lists what it CAN do
 
const ROLE_PERMISSIONS = {
  owner: [
    "project:read",
    "project:update",
    "project:delete",
    "project:archive",
    "member:invite",
    "member:remove",
    "member:changeRole",
    "task:create",
    "task:read",
    "task:update",
    "task:delete",       // can delete any task
    "task:assign",
    "status:add",
    "status:delete",
  ],
 
  admin: [
    "project:read",
    "project:update",    // can edit project title/description
    "member:invite",
    "member:remove",     // can remove members (not owner)
    "task:create",
    "task:read",
    "task:update",
    "task:delete",       // can delete any task in project
    "task:assign",
    "status:add",
    "status:delete",
  ],
 
  member: [
    "project:read",
    "task:create",
    "task:read",
    "task:update",       // can update any task
    "task:deleteOwn",    // can only delete tasks they created
  ],
 
  viewer: [
    "project:read",
    "task:read",
  ],
};
 
// Check if a role has a specific permission
const hasPermission = (role, permission) => {
  if (!role || !ROLE_PERMISSIONS[role]) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
};
 
module.exports = { ROLE_PERMISSIONS, hasPermission };
 