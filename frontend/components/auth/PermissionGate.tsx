"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrgPermission } from "@/hooks/useOrgPermissions";

type PermissionGateProps = {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
};

export default function PermissionGate({
  permission,
  children,
  fallback,
  redirectTo = "/dashboard",
}: PermissionGateProps) {
  const router = useRouter();
  const { can, currentOrg, access, loading, orgReady } = useOrgPermission();
  const [ready, setReady] = useState(false);

  const allowed =
    !access?.hasOrgMembership && access?.personalWorkspace
      ? true
      : currentOrg
        ? can(permission)
        : access?.personalWorkspace
          ? true
          : false;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    if (!orgReady) return;
    if (!allowed && redirectTo) {
      router.push(redirectTo);
      return;
    }
    setReady(true);
  }, [allowed, redirectTo, router, orgReady]);

  if (!ready || loading) {
    return (
      fallback || (
        <div className="min-h-screen bg-[#F6F9FC] text-slate-900 flex items-center justify-center dark:bg-slate-950 dark:text-slate-100">
          Checking permissions...
        </div>
      )
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}
