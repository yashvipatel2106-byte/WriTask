import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store";
import { EMPTY_TASK_OVERVIEW } from "@/store/slices/dashboardSlice";
import { buildDashboardScopeKey } from "@/store/slices/dashboardSlice";

const selectDashboard = (state: RootState) => state.dashboard;

export const selectTaskOverview = createSelector(
  [selectDashboard],
  (dash) => dash.taskOverview ?? EMPTY_TASK_OVERVIEW
);

export const selectTaskOverviewLoading = (state: RootState) =>
  state.dashboard.taskOverviewStatus === "pending";

export const selectProjectProgress = createSelector(
  [selectDashboard],
  (dash) => dash.projectProgress
);

export const selectProjectProgressLoading = (state: RootState) =>
  state.dashboard.projectProgressStatus === "pending";

/** True when cached data matches current org scope */
export const selectDashboardCacheValid = (orgId: string | null) =>
  createSelector(
    [selectDashboard],
    (dash) => dash.scopeKey === buildDashboardScopeKey(orgId)
  );