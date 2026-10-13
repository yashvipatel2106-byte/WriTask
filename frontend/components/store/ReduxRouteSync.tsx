"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchUserProfile } from "@/store/slices/authSlice";
import {
  clearDashboardCharts,
  fetchProjectProgress,
  fetchTaskOverview,
} from "@/store/slices/dashboardSlice";
import { fetchOrgAccess } from "@/store/slices/orgSlice";
import { setCurrentRoute } from "@/store/slices/uiSlice";

/**
 * Keeps Redux in sync with the active route:
 * - Dispatches ui/setCurrentRoute so DevTools shows navigation (click latest action)
 * - Refetches slice data when entering relevant pages
 */
export default function ReduxRouteSync() {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const orgId = useAppSelector((state) => state.org.currentOrgId);
  const orgReady = useAppSelector(
    (state) =>
      state.org.accessStatus === "succeeded" ||
      state.org.accessStatus === "failed"
  );
  const isFirstRun = useRef(true);

  useEffect(() => {
    dispatch(setCurrentRoute(pathname));

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    if (
      pathname.startsWith("/settings/account") ||
      pathname === "/profile/edit"
    ) {
      void dispatch(fetchUserProfile({ force: true }));
      return;
    }

    if (pathname === "/dashboard") {
      if (!orgReady) {
        void dispatch(fetchOrgAccess());
        return;
      }
      dispatch(clearDashboardCharts());
      void dispatch(fetchTaskOverview(orgId));
      void dispatch(fetchProjectProgress(orgId));
    }
  }, [pathname, dispatch, orgId, orgReady]);

  return null;
}
