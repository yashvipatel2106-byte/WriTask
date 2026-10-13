import type { RoleDefinition } from "./types";

/** Matches backend `BUILTIN_ORG_TO_PROJECT_MEMBER` in roleDefinitions.js */
const BUILTIN_ORG_TO_PROJECT: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  manager: "member",
  developer: "member",
  viewer: "viewer",
};

/** Matches backend `BUILTIN_PROJECT_TO_ORG` in roleDefinitions.js */
const BUILTIN_PROJECT_TO_ORG: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  member: "developer",
  viewer: "viewer",
};

/** Map org role id → project member role for project invite API. */
export function orgRoleToProjectRole(
  orgRoleId: string,
  roles: RoleDefinition[]
): string {
  if (BUILTIN_ORG_TO_PROJECT[orgRoleId]) {
    return BUILTIN_ORG_TO_PROJECT[orgRoleId];
  }

  const role = roles.find((item) => item.id === orgRoleId);
  if (!role) return "member";

  const perms = role.projectPermissions || [];
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

/** Map stored project member role → org role id for display. */
export function projectRoleToOrgRole(projectRole: string): string {
  return BUILTIN_PROJECT_TO_ORG[projectRole] || projectRole;
}
