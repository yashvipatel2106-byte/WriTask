import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store";
import type { OrgSummary } from "@/store/types/org";

export const selectOrgState = (state: RootState) => state.org;
export const selectCurrentOrgId = (state: RootState) => state.org.currentOrgId;
export const selectOrgAccess = (state: RootState) => state.org.access;
export const selectOrgLoading = (state: RootState) => state.org.loading;
export const selectOrgAccessStatus = (state: RootState) => state.org.accessStatus;

/** Access fetch finished (success or failure) — safe to load org-scoped data */
export const selectOrgReady = (state: RootState) =>
  state.org.accessStatus === "succeeded" || state.org.accessStatus === "failed";

export const selectCurrentOrg = createSelector(
  [selectOrgAccess, selectCurrentOrgId],
  (access, currentOrgId): OrgSummary | null => {
    if (!access || !currentOrgId) return null;
    return (
      access.organizations.find((org) => org.organizationId === currentOrgId) ||
      null
    );
  }
);

export const selectCurrentRole = createSelector(
  [selectCurrentOrg],
  (currentOrg) => currentOrg?.role ?? null
);

export const selectPersonalWorkspace = createSelector(
  [selectOrgAccess],
  (access) => access?.personalWorkspace ?? true
);
