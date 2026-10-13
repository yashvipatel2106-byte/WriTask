"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchOrgAccess,
  setCurrentOrgId as setCurrentOrgIdAction,
} from "@/store/slices/orgSlice";
import {
  selectCurrentOrg,
  selectCurrentRole,
  selectOrgAccess,
  selectOrgLoading,
  selectOrgReady,
  selectPersonalWorkspace,
} from "@/store/selectors/orgSelectors";
import { isPublicAuthPath } from "@/lib/publicRoutes";

export type { OrgSummary, OrgAccessData } from "@/store/types/org";

type OrganizationContextValue = {
  loading: boolean;
  orgReady: boolean;
  access: ReturnType<typeof selectOrgAccess>;
  currentOrg: ReturnType<typeof selectCurrentOrg>;
  currentOrgId: string | null;
  currentRole: ReturnType<typeof selectCurrentRole>;
  personalWorkspace: boolean;
  setCurrentOrgId: (orgId: string | null) => void;
  refreshAccess: () => Promise<void>;
  can: (permission: string) => boolean;
};

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const loading = useAppSelector(selectOrgLoading);
  const orgReady = useAppSelector(selectOrgReady);
  const access = useAppSelector(selectOrgAccess);
  const currentOrg = useAppSelector(selectCurrentOrg);
  const currentOrgId = useAppSelector((state) => state.org.currentOrgId);
  const currentRole = useAppSelector(selectCurrentRole);
  const personalWorkspace = useAppSelector(selectPersonalWorkspace);

  const refreshAccess = useCallback(async () => {
    await dispatch(fetchOrgAccess());
  }, [dispatch]);

  useEffect(() => {
    if (isPublicAuthPath(pathname)) return;
    void refreshAccess();
  }, [refreshAccess, pathname]);

  const setCurrentOrgId = useCallback(
    (orgId: string | null) => {
      dispatch(setCurrentOrgIdAction(orgId));
    },
    [dispatch]
  );

  const can = useCallback(
    (permission: string) => {
      // Personal Workspace (no active org): allow core personal actions.
      // Organization permissions only apply inside an Organization Workspace.
      if (!currentOrg) {
        if (!access?.hasOrgMembership) return true;
        // Personal mode while belonging to orgs: only personal project creation
        // is granted here; org-admin features require switching into an org.
        return permission === "org:createProject";
      }
      if (currentOrg.orgPermissions?.length) {
        return currentOrg.orgPermissions.includes(permission);
      }
      return false;
    },
    [access, currentOrg, currentRole]
  );

  const value = useMemo(
    () => ({
      loading,
      orgReady,
      access,
      currentOrg,
      currentOrgId,
      currentRole,
      personalWorkspace,
      setCurrentOrgId,
      refreshAccess,
      can,
    }),
    [
      loading,
      orgReady,
      access,
      currentOrg,
      currentOrgId,
      currentRole,
      personalWorkspace,
      setCurrentOrgId,
      refreshAccess,
      can,
    ]
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error("useOrganization must be used within OrganizationProvider");
  }
  return ctx;
}
