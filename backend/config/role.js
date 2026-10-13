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
    "task:delete",
    "task:assign",

    "status:add",
    "status:delete",

    // Gantt
    "gantt:read",
    "gantt:editSchedule",
    "gantt:manageDependencies",
    "gantt:manageMilestones",
    "gantt:viewCriticalPath",
    "gantt:viewConflicts",
    "gantt:resolveConflicts",
    "gantt:viewBaseline",
    "gantt:manageBaseline",

    "requestForm:submit",
    "requestForm:manage",
    "requestForm:review",
  ],




  admin: [
    "project:read",
    "project:update",
    "member:invite",
    "member:remove",

    "task:create",
    "task:read",
    "task:update",
    "task:delete",
    "task:assign",

    "status:add",
    "status:delete",

    // Gantt
    "gantt:read",
    "gantt:editSchedule",
    "gantt:manageDependencies",
    "gantt:manageMilestones",
    "gantt:viewCriticalPath",
    "gantt:viewConflicts",
    "gantt:resolveConflicts",
    "gantt:viewBaseline",
    "gantt:manageBaseline",

     "requestForm:submit",
     
  ],

  member: [
    "project:read",
    "task:create",
    "task:read",
    "task:update",
    "task:deleteOwn",

    // Gantt - read only by default
    "gantt:read",
    "gantt:viewCriticalPath",
    "gantt:viewConflicts",
  ],

  viewer: [
    "project:read",
    "task:read",

    // Gantt - view only
    "gantt:read",
    "gantt:viewConflicts",
  ],
};
 
// Check if a role has a specific permission
const hasPermission = (role, permission) => {
  if (!role || !ROLE_PERMISSIONS[role]) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
};
 
module.exports = { ROLE_PERMISSIONS, hasPermission };
 