import type { RoleDefinition } from "./types";

/** Built-in role display names — used when API roles are not loaded yet. */
export const BUILTIN_ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  developer: "Developer",
  viewer: "Viewer",
};

export function formatRoleLabel(
  roleId: string,
  roles?: RoleDefinition[]
): string {
  const fromApi = roles?.find((role) => role.id === roleId)?.name;
  if (fromApi) return fromApi;
  return BUILTIN_ROLE_LABELS[roleId] || roleId;
}
