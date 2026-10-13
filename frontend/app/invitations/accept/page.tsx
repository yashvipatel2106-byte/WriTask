"use client";

import { authFetch } from "@/lib/validation/authFetch";
import { useOrganization } from "@/components/context/organizationContext";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function AcceptInvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { refreshAccess, setCurrentOrgId } = useOrganization();
  const [message, setMessage] = useState("Accepting invitation...");

  useEffect(() => {
    const run = async () => {
      const authToken = localStorage.getItem("token");
      if (!authToken) {
        if (token) localStorage.setItem("pendingInviteToken", token);
        router.push("/login");
        return;
      }

      const inviteToken = token || localStorage.getItem("pendingInviteToken");
      if (!inviteToken) {
        setMessage("No invitation token found.");
        return;
      }

      const res = await authFetch("/organizations/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token: inviteToken }),
      });
      const data = await res.json();

      localStorage.removeItem("pendingInviteToken");

      if (res.ok) {
        await refreshAccess();
        if (data.organization?._id) {
          setCurrentOrgId(data.organization._id);
        }
        setMessage(data.message);
        setTimeout(() => router.push("/dashboard"), 1500);
      } else {
        setMessage(data.message || "Failed to accept invitation");
      }
    };

    run();
  }, [token, router, refreshAccess, setCurrentOrgId]);

  return (
    <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-8 max-w-md text-center dark:bg-slate-900 dark:border-slate-800">
        <h1 className="text-2xl font-bold mb-4">Organization Invitation</h1>
        <p>{message}</p>
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <AcceptInvitationContent />
    </Suspense>
  );
}
