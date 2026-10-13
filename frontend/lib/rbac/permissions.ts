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
