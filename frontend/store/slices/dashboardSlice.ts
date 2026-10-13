import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { authFetch } from "@/lib/validation/authFetch";
import type { RootState } from "@/store";
import type {
  DashboardChartsState,
  ProjectProgressItem,
  TaskOverviewData,
} from "@/store/types/dashboard";
import {
  buildDashboardScopeKey,
  buildScopeQuery,
} from "@/lib/workspaceStorage";

// ── helpers ──────────────────────────────────────────────────────────────

export const EMPTY_TASK_OVERVIEW: TaskOverviewData = {
  completed: 0,
  inProgress: 0,
  review: 0,
  todo: 0,
  totalTasks: 0,
  customStatuses: [],
};

export { buildDashboardScopeKey };

function buildOrgQuery(orgId: string | null) {
  return buildScopeQuery(orgId);
}

export function createInitialDashboardState(): DashboardChartsState {
  return {
    scopeKey: null,
    taskOverview: null,
    taskOverviewStatus: "idle",
    taskOverviewError: null,
    projectProgress: [],
    projectProgressStatus: "idle",
    projectProgressError: null,
  };
}

// ── thunks ───────────────────────────────────────────────────────────────

export const fetchTaskOverview = createAsyncThunk(
  "dashboard/fetchTaskOverview",
  async (orgId: string | null, { rejectWithValue }) => {
    const res = await authFetch(
      `/dashboard/task-overview${buildOrgQuery(orgId)}`
    );
    if (!res.ok) return rejectWithValue("FETCH_FAILED");

    const data = await res.json();
    return {
      scopeKey: buildDashboardScopeKey(orgId),
      overview: {
        completed: Number(data.completed) || 0,
        inProgress: Number(data.inProgress) || 0,
        review: Number(data.review) || 0,
        todo: Number(data.todo) || 0,
        totalTasks: Number(data.totalTasks) || 0,
        customStatuses: Array.isArray(data.customStatuses)
          ? data.customStatuses
          : [],
      } satisfies TaskOverviewData,
    };
  },
  {
    // skip if already loading same request
    condition: (orgId, { getState }) => {
      const dash = (getState() as RootState).dashboard;
      return dash.taskOverviewStatus !== "pending";
    },
  }
);

export const fetchProjectProgress = createAsyncThunk(
  "dashboard/fetchProjectProgress",
  async (orgId: string | null, { rejectWithValue }) => {
    const res = await authFetch(
      `/dashboard/project-progress${buildOrgQuery(orgId)}`
    );
    if (!res.ok) return rejectWithValue("FETCH_FAILED");

    const result = await res.json();
    return {
      scopeKey: buildDashboardScopeKey(orgId),
      items: (Array.isArray(result) ? result : []) as ProjectProgressItem[],
    };
  },
  {
    condition: (orgId, { getState }) => {
      const dash = (getState() as RootState).dashboard;
      return dash.projectProgressStatus !== "pending";
    },
  }
);

// ── slice ────────────────────────────────────────────────────────────────

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState: createInitialDashboardState(),
  reducers: {
    clearDashboardCharts(state) {
      Object.assign(state, createInitialDashboardState());
    },
  },
  extraReducers: (builder) => {
    builder
      // Task overview
      .addCase(fetchTaskOverview.pending, (state) => {
        state.taskOverviewStatus = "pending";
        state.taskOverviewError = null;
      })
      .addCase(fetchTaskOverview.fulfilled, (state, action) => {
        state.scopeKey = action.payload.scopeKey;
        state.taskOverview = action.payload.overview;
        state.taskOverviewStatus = "succeeded";
      })
      .addCase(fetchTaskOverview.rejected, (state, action) => {
        state.taskOverviewStatus = "failed";
        state.taskOverviewError =
          (action.payload as string) || action.error.message || "Unknown error";
      })

      // Project progress
      .addCase(fetchProjectProgress.pending, (state) => {
        state.projectProgressStatus = "pending";
        state.projectProgressError = null;
      })
      .addCase(fetchProjectProgress.fulfilled, (state, action) => {
        state.scopeKey = action.payload.scopeKey;
        state.projectProgress = action.payload.items;
        state.projectProgressStatus = "succeeded";
      })
      .addCase(fetchProjectProgress.rejected, (state, action) => {
        state.projectProgressStatus = "failed";
        state.projectProgressError =
          (action.payload as string) || action.error.message || "Unknown error";
      });
  },
});

export const { clearDashboardCharts } = dashboardSlice.actions;
export default dashboardSlice.reducer;