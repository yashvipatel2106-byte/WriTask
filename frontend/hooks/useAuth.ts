"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchUserProfile,
  updateUserProfile,
} from "@/store/slices/authSlice";
import {
  selectAuthLoading,
  selectCurrentUser,
  selectProfileError,
  selectProfileReady,
  selectProfileUpdating,
} from "@/store/selectors/authSelectors";

/** Subscribe directly to Redux — updates propagate in real time */
export function useAuth() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const loading = useAppSelector(selectAuthLoading);
  const profileReady = useAppSelector(selectProfileReady);
  const profileUpdating = useAppSelector(selectProfileUpdating);
  const profileError = useAppSelector(selectProfileError);

  const refreshProfile = useCallback(async () => {
    await dispatch(fetchUserProfile({ force: true }));
  }, [dispatch]);

  const saveProfile = useCallback(
    async (payload: Record<string, string>) => {
      const result = await dispatch(updateUserProfile(payload));
      if (updateUserProfile.fulfilled.match(result)) {
        return { ok: true as const };
      }
      const message =
        (result.payload as string) || result.error?.message || "Update failed";
      return { ok: false as const, error: message };
    },
    [dispatch]
  );

  return {
    user,
    loading,
    profileReady,
    profileUpdating,
    profileError,
    refreshProfile,
    saveProfile,
  };
}
