"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  FileSpreadsheet,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import CreateReportDialog from "@/components/reports/CreateReportDialog";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { authFetch } from "@/lib/validation/authFetch";
import { readStoredWorkspaceId } from "@/lib/workspaceStorage";
import {
  createReport,
  deleteReport,
  fetchReports,
} from "@/lib/reports/api";
import type { EditorValue } from "@/components/reports/ReportEditor";
import type { SavedReport } from "@/lib/reports/types";
import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function ReportsPage() {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const { canManageReports } = useOrgPermission();
  const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readStoredWorkspaceId()
  );
  const [workspaceName, setWorkspaceName] = useState("Workspace");
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);

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
    if (!workspaceId) {
      return;
    }
    let cancelled = false;
    fetchReports(workspaceId)
      .then((result) => {
        if (cancelled) return;
        setReports(result.reports);
        if (result.reports[0]?.workspaceName) {
          setWorkspaceName(result.reports[0].workspaceName);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Failed to load reports.");
        setReports([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    const orgId = currentOrg?.organizationId;
    const q = orgId ? `?organizationId=${orgId}` : "";
    authFetch(`/workspaces${q}`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data.workspaces) ? data.workspaces : [];
        const id = readStoredWorkspaceId();
        const match = list.find((w: { id: string }) => w.id === id) || list[0];
        if (match?.name) setWorkspaceName(match.name);
        if (!id && match?.id) setWorkspaceId(match.id);
      })
      .catch(() => {});
  }, [currentOrg?.organizationId]);

  const handleCreate = async (value: EditorValue) => {
    if (!workspaceId) return;
    setFormError("");
    if (!value.title.trim()) {
      setFormError("Title is required.");
      return;
    }
    if (!value.dataSources.length) {
      setFormError("No data source selected.");
      return;
    }
    if (!value.columns.length) {
      setFormError("Please select at least one column.");
      return;
    }
    if (value.sharing === "custom" && !value.sharedWith.length) {
      setFormError("Select at least one member for custom access.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createReport(workspaceId, value);
      setCreateOpen(false);
      toast.success("Report created");
      router.push(`/reports/${created.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unable to create report.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (report: SavedReport) => {
    if (!workspaceId) return;
    const ok = await confirmDialog({
      title: "Delete report?",
      description: `Delete “${report.title}”? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteReport(workspaceId, report.id);
      toast.success("Report deleted");
      const list = await fetchReports(workspaceId);
      setReports(list.reports);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to delete report.");
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto bg-[#F6F9FC] text-slate-900 p-6 sm:p-10 dark:bg-[#0B1120] dark:text-slate-100">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl font-bold">Reports</h1>
              <p className="text-slate-500 mt-1 dark:text-slate-400">
                Workspace-scoped reports from folders, projects, and tasks.
              </p>
            </div>
            {canManageReports && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setFormError("");
                  setCreateOpen(true);
                }}
              >
                <Plus size={16} /> Create report
              </button>
            )}
          </div>

          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Create a report
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {canManageReports && (
                <button
                  type="button"
                  onClick={() => {
                    setFormError("");
                    setCreateOpen(true);
                  }}
                  className="dashboard-card flex items-center gap-3 text-left p-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
                    <Plus size={18} />
                  </div>
                  <div>
                    <p className="font-medium">Custom report</p>
                    <p className="text-xs text-slate-500">Folders, projects, filters, columns</p>
                  </div>
                </button>
              )}
              
            </div>
          </section>

          <section className="dashboard-widget">
            <h2 className="text-xl font-bold mb-4">Your reports</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    {["Name", "Created by", "Workspace", "Sharing", "Created date", "Last updated", ""].map(
                      (h) => (
                        <th
                          key={h || "actions"}
                          className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        Loading reports…
                      </td>
                    </tr>
                  ) : reports.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        No reports in this workspace yet. {canManageReports ? "Create a custom report to get started." : "Reports shared with you will appear here."}
                      </td>
                    </tr>
                  ) : (
                    reports.map((report) => (
                      <tr key={report.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <td className="py-3.5">
                          <Link
                            href={`/reports/${report.id}`}
                            className="font-medium text-cyan-700 hover:underline dark:text-cyan-400"
                          >
                            {report.title}
                          </Link>
                          <p className="text-xs text-slate-400">Report on {report.basedOn === "projects" ? "projects" : report.basedOn === "time_entries" ? "time entries" : "tasks"}</p>
                        </td>
                        <td className="py-3.5 text-slate-500">{report.createdBy?.name || "—"}</td>
                        <td className="py-3.5 text-slate-500">
                          {report.workspaceName || workspaceName}
                        </td>
                        <td className="py-3.5 text-slate-500">{report.sharing}</td>
                        <td className="py-3.5 text-slate-500">{formatDate(report.createdAt)}</td>
                        <td className="py-3.5 text-slate-500">{formatDate(report.updatedAt)}</td>
                        <td className="py-3.5 relative">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setMenuId(menuId === report.id ? null : report.id)}
                            aria-label="Report actions"
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          {menuId === report.id && (
                            <div className="absolute right-0 z-20 w-36 rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                              <Link
                                href={`/reports/${report.id}`}
                                className="block px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                                onClick={() => setMenuId(null)}
                              >
                                Open
                              </Link>
                              {canManageReports && (
                                <>
                                  <Link
                                    href={`/reports/${report.id}/edit`}
                                    className="block px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                                    onClick={() => setMenuId(null)}
                                  >
                                    Edit
                                  </Link>
                                  <button
                                    type="button"
                                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                                    onClick={() => {
                                      setMenuId(null);
                                      void handleDelete(report);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {reports.length > 0 && (
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <FileSpreadsheet size={12} />
                Open a report to export Excel or PDF of the selected columns only.
              </p>
            )}
          </section>
        </main>
      </div>

      {workspaceId && (
        <CreateReportDialog
          open={createOpen}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          submitting={submitting}
          error={formError}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}
