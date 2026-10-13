import type { OrgRole } from "@/lib/rbac";

export type OrgSummary = {
  organizationId: string;
  name: string;
  slug: string;
  role: OrgRole | string;
  orgPermissions?: string[];
  projectPermissions?: string[];
};

export type OrgAccessData = {
  hasOrgMembership: boolean;
  organizations: OrgSummary[];
  pendingInvitations: Array<{
    _id: string;
    role: string;
    token: string;
    organization: { _id: string; name: string; slug: string } | null;
    invitedBy?: { username: string; email: string };
  }>;
  personalWorkspace: boolean;
};

export type OrgState = {
  /** Hydrated synchronously from localStorage on the client */
  currentOrgId: string | null;
  access: OrgAccessData | null;
  /** True only during the first access fetch (not background refreshes) */
  loading: boolean;
  accessStatus: "idle" | "pending" | "succeeded" | "failed";
};
