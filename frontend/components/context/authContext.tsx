"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { fetchUserProfile } from "@/store/slices/authSlice";
import { isPublicAuthPath } from "@/lib/publicRoutes";

export { useAuth } from "@/hooks/useAuth";

/** Load profile from API when the app starts (token present). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const pathname = usePathname();

  useEffect(() => {
    if (isPublicAuthPath(pathname)) return;

    const token = localStorage.getItem("token");
    if (token) {
      void dispatch(fetchUserProfile());
    }
  }, [dispatch, pathname]);

  return <>{children}</>;
}
