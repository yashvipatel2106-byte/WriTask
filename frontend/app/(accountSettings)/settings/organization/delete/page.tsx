"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Delete is combined into Edit organization — keep this route as a redirect. */
export default function DeleteOrganizationRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/organization/edit");
  }, [router]);

  return (
    <p className="text-sm text-slate-500 dark:text-slate-400">
      Redirecting to Edit organization…
    </p>
  );
}
