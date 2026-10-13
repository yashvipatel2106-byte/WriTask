"use client";

import { useAppSelector } from "@/store/hooks";
import {
  selectCurrentUser,
  selectUserDisplayName,
  selectUserEmail,
  selectUserInitial,
} from "@/store/selectors/authSelectors";

/** Direct Redux subscription for current user — always live */
export function useCurrentUser() {
  const user = useAppSelector(selectCurrentUser);
  const displayName = useAppSelector(selectUserDisplayName);
  const email = useAppSelector(selectUserEmail);
  const initial = useAppSelector(selectUserInitial);

  return { user, displayName, email, initial };
}
