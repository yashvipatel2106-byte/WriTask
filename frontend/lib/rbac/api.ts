import { authFetch } from "@/lib/validation/authFetch";
import type { RoleDefinition } from "./types";

type CreateRolePayload = {
  name: string;
  orgPermissions: string[];
  projectPermissions: string[];
};

export async function fetchOrganizationRoles(orgId: string) {
  const res = await authFetch(`/organizations/${orgId}/roles`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? (data as RoleDefinition[]) : [];
}

export async function createOrganizationRole(
  orgId: string,
  payload: CreateRolePayload
) {
  const res = await authFetch(`/organizations/${orgId}/roles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  return (await res.json()) as RoleDefinition;
}

export function viewerDefaults(roles: RoleDefinition[]) {
  const viewer = roles.find((role) => role.id === "viewer");
  return {
    orgPermissions: viewer?.orgPermissions || ["org:read"],
    projectPermissions: viewer?.projectPermissions || [
      "project:read",
      "task:read",
    ],
  };
}
