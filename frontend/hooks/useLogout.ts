"use client";

import { useRouter } from "next/navigation";
import { clearAuthStorage } from "@/lib/validation/authStorage";
import { useAppDispatch } from "@/store/hooks";
import { clearUserState } from "@/store/slices/authSlice";
import { clearOrgState } from "@/store/slices/orgSlice";
import { clearDashboardCharts } from "@/store/slices/dashboardSlice";

export function useLogout() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  return () => {
    clearAuthStorage();
    dispatch(clearUserState());
    dispatch(clearOrgState());
    dispatch(clearDashboardCharts());
    // Lets SocketProvider (and anything else listening) know the
    // session ended without needing a full page reload — the socket
    // connection carries the now-cleared JWT otherwise.
    window.dispatchEvent(new Event("auth-changed"));
    router.push("/login");
  };
}
