import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store";

const selectAuth = (state: RootState) => state.auth;

export const selectCurrentUser = createSelector(
  [selectAuth],
  (auth) => auth.user
);

export const selectAuthLoading = (state: RootState) => state.auth.loading;

export const selectProfileReady = (state: RootState) =>
  state.auth.fetchStatus === "succeeded" ||
  state.auth.fetchStatus === "failed" ||
  !!state.auth.user;

export const selectProfileUpdating = (state: RootState) =>
  state.auth.updateStatus === "pending";

export const selectProfileError = (state: RootState) => state.auth.profileError;

export const selectUserDisplayName = createSelector(
  [selectCurrentUser],
  (user) => user?.username || "User"
);

export const selectUserInitial = createSelector(
  [selectCurrentUser],
  (user) => user?.username?.charAt(0).toUpperCase() || "U"
);

export const selectUserEmail = createSelector(
  [selectCurrentUser],
  (user) => user?.email || ""
);
