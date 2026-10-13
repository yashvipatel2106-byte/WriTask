"use client";

import { useOrganization } from "@/components/context/organizationContext";
import { authFetch } from "@/lib/validation/authFetch";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function AcceptProjectInvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshAccess } = useOrganization();
  const token = searchParams.get("token");
  const [message, setMessage] = useState("Accepting project invitation...");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const authToken = localStorage.getItem("token");
      if (!authToken) {
        if (token) localStorage.setItem("pendingProjectInviteToken", token);
        router.push(`/login?redirect=${encodeURIComponent(`/invitations/project?token=${token}`)}`);
        return;
      }

      const inviteToken =
        token || localStorage.getItem("pendingProjectInviteToken");
      if (!inviteToken) {
        setStatus("error");
        setMessage("No invitation token found.");
        return;
      }

      const res = await authFetch("/projects/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token: inviteToken }),
      });
      const data = await res.json();

      if (res.ok && data.project?._id) {
        localStorage.removeItem("pendingProjectInviteToken");
        await refreshAccess();
        setStatus("success");
        setProjectId(data.project._id);
        setMessage(data.message || "Invitation accepted!");
        setTimeout(() => router.push(`/projects/${data.project._id}`), 1500);
      } else {
        setStatus("error");
        setMessage(data.message || "Failed to accept invitation");
      }
    };

    run();
  }, [token, router, refreshAccess]);

  return (
    <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-8 max-w-md w-full text-center dark:bg-slate-900 dark:border-slate-800">
        <h1 className="text-2xl font-bold mb-2">Project Invitation</h1>
        <p
          className={`mb-6 ${
            status === "success"
              ? "text-green-600 dark:text-green-400"
              : status === "error"
                ? "text-red-600 dark:text-red-400"
                : "text-slate-600 dark:text-slate-300"
          }`}
        >
          {message}
        </p>

        {status === "loading" && (
          <div className="w-8 h-8 border-2 border-cyan-200 border-t-cyan-500 rounded-full animate-spin mx-auto dark:border-cyan-500/20 dark:border-t-cyan-400" />
        )}

        {status === "success" && projectId && (
          <Link
            href={`/projects/${projectId}`}
            className="inline-block px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-medium"
          >
            Open project board
          </Link>
        )}

        {status === "error" && (
          <div className="flex flex-col gap-3">
            {token && (
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl bg-cyan-50 border border-cyan-300 text-cyan-700 text-sm dark:bg-cyan-400/10 dark:border-cyan-500/30 dark:text-cyan-400"
              >
                Try again
              </button>
            )}
            <Link
              href="/projects"
              className="text-sm text-slate-500 hover:text-cyan-700 dark:text-slate-400 dark:hover:text-cyan-400"
            >
              Go to projects
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AcceptProjectInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <AcceptProjectInvitationContent />
    </Suspense>
  );
}
