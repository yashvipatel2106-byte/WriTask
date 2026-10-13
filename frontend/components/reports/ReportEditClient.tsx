"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import ReportEditor, {
  type EditorValue,
} from "@/components/reports/ReportEditor";
import { toast } from "@/components/ui/toast";
import { readStoredWorkspaceId } from "@/lib/workspaceStorage";
import { fetchReport, updateReport } from "@/lib/reports/api";
import type { SavedReport } from "@/lib/reports/types";

export default function ReportEditClient({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readStoredWorkspaceId()
  );
  const [report, setReport] = useState<SavedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    const onChange = () => setWorkspaceId(readStoredWorkspaceId());
    window.addEventListener("workspace-changed", onChange);
    return () => window.removeEventListener("workspace-changed", onChange);
  }, [router]);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    fetchReport(reportId)
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        if (data.workspaceId) setWorkspaceId(data.workspaceId);
        if (data.canEdit === false) {
          toast.error("You don't have permission to edit this report.");
          router.push(`/reports/${reportId}`);
          return;
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Failed to load report.");
        setError(e instanceof Error ? e.message : "Failed to load report.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const handleSave = async (value: EditorValue) => {
    const ws = workspaceId || report?.workspaceId;
    if (!ws) {
      setError("Workspace is required.");
      return;
    }
    if (!value.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!value.dataSources.length) {
      setError("No data source selected.");
      return;
    }
    if (!value.columns.length) {
      setError("Please select at least one column.");
      return;
    }
    if (value.sharing === "custom" && !value.sharedWith.length) {
      setError("Select at least one member for custom access.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await updateReport(reportId, value, ws);
      toast.success("Report saved");
      router.push(`/reports/${reportId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save report.");
    } finally {
      setSubmitting(false);
    }
  };

  const editorWorkspaceId = workspaceId || report?.workspaceId || "";

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto bg-[#F6F9FC] text-slate-900 p-6 sm:p-10 dark:bg-[#0B1120] dark:text-slate-100">
          <Link href={`/reports/${reportId}`} className="text-sm text-cyan-700 dark:text-cyan-400">
            ← Back to report
          </Link>
          <h1 className="mt-3 mb-6 text-3xl font-bold">Edit report</h1>
          {!reportId ? (
            <p className="text-red-600 dark:text-red-400">Invalid report.</p>
          ) : loading ? (
            <p className="text-slate-400">Loading report…</p>
          ) : error && !report ? (
            <p className="text-red-600 dark:text-red-400">{error}</p>
          ) : !report || !editorWorkspaceId ? (
            <p className="text-slate-400">Loading report…</p>
          ) : (
            <div className="dashboard-widget">
              <ReportEditor
                key={report.id}
                workspaceId={editorWorkspaceId}
                workspaceName={report.workspaceName || "Workspace"}
                initial={report}
                submitting={submitting}
                error={error}
                submitLabel="Save"
                onCancel={() => router.push(`/reports/${reportId}`)}
                onSubmit={handleSave}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
