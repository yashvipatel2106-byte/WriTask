import type { PermissionItem } from "./types";

export const ORG_PERMISSION_ITEMS: PermissionItem[] = [
  { key: "org:create", label: "Create", group: "Organization" },
  { key: "org:read", label: "View", group: "Organization" },
  { key: "org:update", label: "Edit", group: "Organization" },
  { key: "org:delete", label: "Delete", group: "Organization" },
  { key: "org:invite", label: "Invite", group: "Members" },
  { key: "org:removeMember", label: "Remove", group: "Members" },
  { key: "org:changeRole", label: "Change roles", group: "Members" },
  { key: "org:manageMembers", label: "Manage members", group: "Members" },
  { key: "org:createProject", label: "Create", group: "Projects" },
  { key: "org:viewAdmin", label: "Access administration", group: "Administration" },
  { key: "requestForm:submit", label: "Submit requests", group: "Request Forms" },
  { key: "requestForm:manage", label: "Manage forms", group: "Request Forms" },
  { key: "requestForm:review", label: "Review requests", group: "Request Forms" },
];

export const PROJECT_PERMISSION_ITEMS: PermissionItem[] = [
  { key: "project:read", label: "View", group: "Project" },
  { key: "project:update", label: "Edit", group: "Project" },
  { key: "project:delete", label: "Delete", group: "Project" },
  { key: "project:archive", label: "Archive", group: "Project" },
  { key: "member:invite", label: "Invite", group: "Members" },
  { key: "member:remove", label: "Remove", group: "Members" },
  { key: "member:changeRole", label: "Change roles", group: "Members" },
  { key: "task:read", label: "View ", group: "Tasks" },
  { key: "task:create", label: "Create", group: "Tasks" },
  { key: "task:update", label: "Edit", group: "Tasks" },
  { key: "task:delete", label: "Delete", group: "Tasks" },
  { key: "task:deleteOwn", label: "Delete own tasks only", group: "Tasks" },
  { key: "task:assign", label: "Assign", group: "Tasks" },
  { key: "status:add", label: "Add", group: "Statuses" },
  { key: "status:delete", label: "Delete", group: "Statuses" },
    // Gantt
  { key: "gantt:read", label: "View Gantt", group: "Gantt"},
  { key: "gantt:editSchedule", label: "Edit schedule", group: "Gantt" },
  { key: "gantt:manageDependencies", label: "Manage dependencies", group: "Gantt" },
  { key: "gantt:manageMilestones", label: "Manage milestones", group: "Gantt" },
  { key: "gantt:viewCriticalPath", label: "View critical path", group: "Gantt" },
  { key: "gantt:viewConflicts", label: "View conflicts", group: "Gantt" },
  { key: "gantt:resolveConflicts", label: "Resolve conflicts", group: "Gantt" },
  { key: "gantt:viewBaseline", label: "View baseline", group: "Gantt"},
  { key: "gantt:manageBaseline", label: "Manage baseline", group: "Gantt" },
];

export function togglePermission(list: string[], key: string, enabled: boolean) {
  if (enabled) return list.includes(key) ? list : [...list, key];
  return list.filter((item) => item !== key);
}

export function hasPermission(permissions: string[], permission: string) {
  if (permissions.includes(permission)) return true;
  if (permission === "task:delete" && permissions.includes("task:deleteOwn")) {
    return true;
  }
  return false;
}
