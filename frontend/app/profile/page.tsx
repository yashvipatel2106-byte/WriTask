"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProfileRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/account");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F6F9FC] flex items-center justify-center text-slate-900 dark:bg-[#0B1120] dark:text-slate-100">
      Redirecting to account settings...
    </div>
  );
}
