"use client";

import { useOrganization } from "@/components/context/organizationContext";

export function useOrgPermission() {
  const { currentRole, can, personalWorkspace, currentOrg, currentOrgId, access, loading, orgReady } =
    useOrganization();

  const inOrgContext = !!currentOrg;
  const isOrgOnlyMember = access?.hasOrgMembership && !personalWorkspace;

  return {
    role: currentRole,
    currentOrg,
    currentOrgId,
    access,
    loading,
    orgReady,
    personalWorkspace,
    inOrgContext,
    can,
    canCreateProject:
      personalWorkspace && !inOrgContext ? true : can("org:createProject"),
    canInviteMembers: can("org:invite"),
    canViewMembers: can("org:viewMembers"),
    canManageMembers: can("org:manageMembers"),
    canRemoveMember: can("org:removeMember"),
    canChangeRole: can("org:changeRole"),
    // Admin panel only inside an Organization Workspace
    canViewAdmin: inOrgContext ? can("org:viewAdmin") : false,
    canCreateOrganization: !inOrgContext || can("org:create"),
    // Org workspaces never show these shortcuts (no org:viewMembers-style
    // gate exists for them), so Personal Workspace now matches that instead
    // of showing Workload/Timeline/Create Task/Assign Task on its own.
    canViewGlobalMembers: false,
    canViewOrganizations: false,
    canUpdateOrg: can("org:update"),
    canManageReports:
      personalWorkspace && !inOrgContext
        ? true
        : currentRole === "owner" || currentRole === "admin",
    // Request Form creation/management is restricted to the
    // organization's current Owner/Admin role, hardcoded (not a
    // configurable permission) to match backend enforcement in
    // requireOrgOwnerOrAdmin.
    canManageRequestForms:
      inOrgContext && (currentRole === "owner" || currentRole === "admin"),
  };
}
