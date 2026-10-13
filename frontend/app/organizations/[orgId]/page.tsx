"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function OrganizationRedirectPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/organizations/${orgId}/members`);
  }, [orgId, router]);

  return null;
}
