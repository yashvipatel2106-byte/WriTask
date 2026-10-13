export type PermissionItem = {
  key: string;
  label: string;
  description?: string;
  group: string;
};

export type OrgRole = "owner" | "admin" | "manager" | "developer" | "viewer";

export type ProjectRole = "owner" | "admin" | "member" | "viewer";

export type RoleDefinition = {
  id: string;
  name: string;
  isBuiltin: boolean;
  level: number;
  orgPermissions: string[];
  projectPermissions: string[];
};
