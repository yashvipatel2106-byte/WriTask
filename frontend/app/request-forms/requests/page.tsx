"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Inbox,
  XCircle,
} from "lucide-react";

import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";

import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";

import {
  fetchRequestSubmissions,
  type RequestSubmission,
} from "@/lib/requestForms";

export default function RequestSubmissionsPage() {
  const router = useRouter();
  const { currentOrg, orgReady } = useOrganization();
  const { can } = useOrgPermission();

  const canSubmit = can("requestForm:submit");
  const canReview = can("requestForm:review");

  const [requests, setRequests] = useState<
    RequestSubmission[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!orgReady || !currentOrg?.organizationId) {
      return;
    }

    let cancelled = false;

    const load = () => {
      setLoading(true);
      setError(null);

      fetchRequestSubmissions(currentOrg.organizationId)
        .then((data) => {
          if (cancelled) return;
          setRequests(data);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error(
            "Failed to load request submissions:",
            err
          );
          setError(
            "Failed to load requests. Please try again."
          );
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
        });
    };

    load();

    /*
     * The Request Inbox is workspace-scoped — reload whenever the
     * active workspace changes.
     */
    window.addEventListener("workspace-changed", load);

    return () => {
      cancelled = true;
      window.removeEventListener("workspace-changed", load);
    };
  }, [
    orgReady,
    currentOrg?.organizationId,
  ]);

  const statusIcon = (
    status: RequestSubmission["status"]
  ) => {
    if (status === "approved") {
      return (
        <CheckCircle2
          size={17}
          className="text-emerald-500"
        />
      );
    }

    if (status === "rejected") {
      return (
        <XCircle
          size={17}
          className="text-red-500"
        />
      );
    }

    return (
      <Clock3
        size={17}
        className="text-amber-500"
      />
    );
  };

  if (orgReady && !canSubmit && !canReview) {
    return (
      <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />

        <div className="flex h-full">
          <Sidebar />

          <main className="ml-0 mt-18 flex min-h-0 flex-1 overflow-y-auto bg-[#F6F9FC] dark:bg-slate-950 lg:ml-70 h-[calc(100vh-72px)]">
            <div className="w-full p-4 sm:p-6 lg:p-8">
              <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/30">
                <Inbox
                  size={32}
                  className="mx-auto mb-3 text-red-500"
                />

                <h1 className="text-lg font-semibold text-red-700 dark:text-red-300">
                  Access Denied
                </h1>

                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  You do not have permission to view the request inbox.
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
      <Navbar />

      <div className="flex h-full">
        <Sidebar />

        <main className="ml-0 mt-18 flex min-h-0 flex-1 overflow-y-auto bg-[#F6F9FC] dark:bg-slate-950 lg:ml-70 h-[calc(100vh-72px)]">
          <div className="flex min-h-full w-full flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:p-8">
            <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() =>
              router.push("/settings/organization/request-form")
            }
            className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400"
          >
            <ArrowLeft size={16} />
            Back to Request Form
          </button>

          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400">
                <Inbox size={22} />
              </div>

              <div>
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                  Request Inbox
                </h1>

                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  Track requests you submitted and
                  requests you can review.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/30">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                Unable to load requests
              </p>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="h-5 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="mt-3 h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              ))}
            </div>
          ) : (
          <div className="space-y-4">
            {!error && requests.length === 0 ? (
              <div className="dashboard-widget py-14 text-center text-sm text-slate-500">
                No requests found.
              </div>
            ) : (
              requests.map((request) => (
                <Link
                  key={request._id}
                  href={`/request-forms/requests/${request._id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        {statusIcon(
                          request.status
                        )}

                        <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                          {request.mapped?.title ||
                            "Request"}
                        </h2>
                      </div>

                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Form:{" "}
                        {request.form?.name ||
                          "Request Form"}
                      </p>

                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Project:{" "}
                        {request.project?.title || "None"}
                      </p>

                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Submitted by:{" "}
                        {request.submittedBy?.username ||
                          request.submittedBy?.email ||
                          "Unknown"}
                      </p>

                      {request.status === "approved" &&
                        !request.reviewedBy && (
                          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                            Automatically approved — this form does not
                            require approval.
                          </p>
                        )}
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        request.status ===
                        "approved"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : request.status ===
                              "rejected"
                            ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}
                    >
                      {request.status
                        .charAt(0)
                        .toUpperCase() +
                        request.status.slice(
                          1
                        )}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
          )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}