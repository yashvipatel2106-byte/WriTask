import { configureStore } from "@reduxjs/toolkit";
import orgReducer, { createInitialOrgState } from "@/store/slices/orgSlice";
import dashboardReducer, {
  createInitialDashboardState,
} from "@/store/slices/dashboardSlice";
import authReducer, { createInitialAuthState } from "@/store/slices/authSlice";
import uiReducer, { createInitialUiState } from "@/store/slices/uiSlice";

export function makeStore() {
  return configureStore({
    reducer: {
      org: orgReducer,
      dashboard: dashboardReducer,
      auth: authReducer,
      ui: uiReducer,
    },
    preloadedState: {
      org: createInitialOrgState(),
      dashboard: createInitialDashboardState(),
      auth: createInitialAuthState(),
      ui: createInitialUiState(),
    },
    devTools: process.env.NODE_ENV !== "production"
        ? {
            name: "WriTask",
            trace: true,
            maxAge: 200,
            shouldHotReload: true,
            shouldCatchErrors: true,
          }
        : false,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: [
            "org/fetchAccess/fulfilled",
            "org/fetchAccess/rejected",
            "dashboard/fetchTaskOverview/fulfilled",
            "dashboard/fetchTaskOverview/rejected",
            "dashboard/fetchProjectProgress/fulfilled",
            "dashboard/fetchProjectProgress/rejected",
            "auth/fetchProfile/fulfilled",
            "auth/fetchProfile/rejected",
            "auth/updateProfile/fulfilled",
            "auth/updateProfile/rejected",
          ],
        },
      }),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
