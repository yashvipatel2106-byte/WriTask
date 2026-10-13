"use client";

import { useOrganization } from "@/components/context/organizationContext";

export function useOrgPermission() {
  const { currentRole, can, personalWorkspace, currentOrg, access, loading, orgReady } =
    useOrganization();

  const inOrgContext = !!currentOrg;
  const isOrgOnlyMember = access?.hasOrgMembership && !personalWorkspace;

  return {
    role: currentRole,
    currentOrg,
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
    canViewAdmin:
      personalWorkspace && !inOrgContext ? true : can("org:viewAdmin"),
    canCreateOrganization: true,
    canViewGlobalMembers: !inOrgContext,
    canViewOrganizations: false,
  };
}
