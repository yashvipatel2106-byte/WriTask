import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type UiState = {
  /** Current Next.js pathname — updates on every client navigation */
  currentRoute: string;
  previousRoute: string | null;
  lastRouteChangeAt: string | null;
};

export function createInitialUiState(): UiState {
  return {
    currentRoute: "",
    previousRoute: null,
    lastRouteChangeAt: null,
  };
}

const uiSlice = createSlice({
  name: "ui",
  initialState: createInitialUiState(),
  reducers: {
    setCurrentRoute(state, action: PayloadAction<string>) {
      if (state.currentRoute === action.payload) return;
      state.previousRoute = state.currentRoute || null;
      state.currentRoute = action.payload;
      state.lastRouteChangeAt = new Date().toISOString();
    },
  },
});

export const { setCurrentRoute } = uiSlice.actions;
export default uiSlice.reducer;
