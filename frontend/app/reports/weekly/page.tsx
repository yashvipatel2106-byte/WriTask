"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import Select from "@/components/ui/Select";
import { authFetch } from "@/lib/validation/authFetch";
import {
  appendWorkspaceScope,
  buildScopeQuery,
} from "@/lib/workspaceStorage";
import { useOrganization } from "@/components/context/organizationContext";
import {
  BarChartWidget,
  DonutChart,
  PeriodToggle,
  STATUS_STYLES,
  EMPTY_WEEKLY,
  type Period,
  type WeeklyActivityItem,
  type ProjectBreakdownItem,
} from "@/components/reports/ReportCharts";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  FolderKanban,
  ListTodo,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

type PersonalStats = {
  totalProjects: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  completionRate: number;
};

type RecentTask = {
  _id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string;
  updatedAt?: string;
  projectName: string;
  projectId?: string;
};

type ProjectOption = {
  _id: string;
  title: string;
};

type WeeklyReportHistoryItem = {
  _id: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  trigger?: string;
  summarySnapshot?: {
    totalProjects?: number;
    assigned?: number;
    completed?: number;
    completionRate?: number;
  };
};

const EMPTY_STATS: PersonalStats = {
  totalProjects: 0,
  totalTasks: 0,
  completedTasks: 0,
  pendingTasks: 0,
  overdueTasks: 0,
  completionRate: 0,
};

function priorityClass(p?: string) {
  if (p === "high")
    return "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400";
  if (p === "medium")
    return "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
}

function statusLabel(status: string) {
  if (status === "completed") return "Completed";
  if (status === "in-progress") return "In Progress";
  if (status === "review") return "Review";
  if (status === "todo") return "To Do";
  return status;
}

function normalizeProjectId(id: unknown): string {
  if (!id) return "";
  if (typeof id === "string") return id;
  if (typeof id === "object" && id !== null && "_id" in id) {
    return normalizeProjectId((id as { _id: unknown })._id);
  }
  return String(id);
}

export default function PersonalReportsPage() {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.organizationId ?? null;
  const [period, setPeriod] = useState<Period>("30d");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [stats, setStats] = useState<PersonalStats>(EMPTY_STATS);
  const [projectBreakdown, setProjectBreakdown] = useState<
    ProjectBreakdownItem[]
  >([]);
  const [weeklyActivity, setWeeklyActivity] =
    useState<WeeklyActivityItem[]>(EMPTY_WEEKLY);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingHistoryId, setDownloadingHistoryId] = useState<string | null>(
    null
  );
  const [history, setHistory] = useState<WeeklyReportHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadProjects = useCallback(async () => {
    try {
      const res = await authFetch(`/projects${buildScopeQuery(orgId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.projects || [];
      const normalized = list
        .filter(
          (p: { isDeleted?: boolean; status?: string }) =>
            !p.isDeleted && (p.status === undefined || p.status === "active")
        )
        .map((p: { _id: unknown; title?: string; name?: string }) => ({
          _id: normalizeProjectId(p._id),
          title: p.title || p.name || "Untitled project",
        }))
        .filter((p: ProjectOption) => p._id);

      setProjects(normalized);
    } catch {
      setProjects([]);
    }
  }, [orgId]);

  const loadReport = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const params = new URLSearchParams({ period });
    if (orgId) params.set("organizationId", orgId);
    else params.set("personal", "true");
    appendWorkspaceScope(params);
    if (projectFilter !== "all") {
      params.set("projectId", projectFilter);
    }

    setLoadingReports(true);
    setStats(EMPTY_STATS);
    setProjectBreakdown([]);
    setRecentTasks([]);
    setWeeklyActivity(EMPTY_WEEKLY);

    try {
      const res = await authFetch(`/dashboard/reports/personal?${params.toString()}`);
      if (!res.ok) {
        console.error("Personal report failed:", res.status);
        return;
      }
      const data = await res.json();
      if (data.stats) setStats(data.stats);
      setProjectBreakdown(
        Array.isArray(data.projectBreakdown) ? data.projectBreakdown : []
      );
      setWeeklyActivity(
        Array.isArray(data.weeklyActivity) && data.weeklyActivity.length > 0
          ? data.weeklyActivity
          : EMPTY_WEEKLY
      );
      setRecentTasks(Array.isArray(data.recentTasks) ? data.recentTasks : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReports(false);
    }
  }, [period, projectFilter, orgId]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    void loadProjects();
    const onWorkspaceChange = () => {
      void loadProjects();
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener("workspace-changed", onWorkspaceChange);
    return () => window.removeEventListener("workspace-changed", onWorkspaceChange);
  }, [router, loadProjects]);

  useEffect(() => {
    void loadReport();
  }, [loadReport, refreshKey]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await authFetch("/reports/weekly/history");
      if (!res.ok) return;
      const data = await res.json();
      setHistory(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, refreshKey]);

  const filenameFromResponse = (res: Response, fallback: string) => {
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    return match ? match[1] : fallback;
  };

  const downloadBlobResponse = async (res: Response, fallbackFilename: string) => {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filenameFromResponse(res, fallbackFilename);
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const params = new URLSearchParams();
      if (orgId) params.set("organizationId", orgId);
      else params.set("personal", "true");
      appendWorkspaceScope(params);
      const qs = params.toString();
      const res = await authFetch(`/reports/weekly/pdf${qs ? `?${qs}` : ""}`);
      if (!res.ok) {
        console.error("PDF download failed:", res.status);
        return;
      }
      await downloadBlobResponse(res, "WriTask-Weekly-Report.pdf");
      void loadHistory();
    } catch (err) {
      console.error(err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadHistoryItem = async (item: WeeklyReportHistoryItem) => {
    setDownloadingHistoryId(item._id);
    try {
      const res = await authFetch(`/reports/weekly/history/${item._id}/download`);
      if (!res.ok) {
        console.error("Archived PDF download failed:", res.status);
        return;
      }
      const weekKey = new Date(item.weekStart).toISOString().slice(0, 10);
      await downloadBlobResponse(res, `WriTask-Weekly-Report-${weekKey}.pdf`);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloadingHistoryId(null);
    }
  };

  useEffect(() => {
    const onFocus = () => setRefreshKey((k) => k + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const filterLabel = useMemo(() => {
    if (projectFilter === "all") return "All my projects";
    return projects.find((p) => p._id === projectFilter)?.title || "Project";
  }, [projectFilter, projects]);

  const isSingleProject = projectFilter !== "all";

  const handleExport = () => {
    const rows = [
      ["Metric", "Value"],
      ["Report", "Personal"],
      ["Scope", filterLabel],
      ["Period", period],
      ["Projects", String(stats.totalProjects)],
      ["Total Tasks", String(stats.totalTasks)],
      ["Completed", String(stats.completedTasks)],
      ["Pending", String(stats.pendingTasks)],
      ["Overdue", String(stats.overdueTasks)],
      ["Completion Rate", `${stats.completionRate}%`],
      [],
      ["Day", "Date", "Completed", "Pending"],
      ...weeklyActivity.map((d) => [
        d.day,
        d.date,
        String(d.completed),
        String(d.pending),
      ]),
      [],
      ["Project", "Workspace", "Progress", "Tasks", "Done", "Status"],
      ...projectBreakdown.map((p) => [
        p.name,
        p.organizationName || "",
        `${p.progress}%`,
        String(p.tasks),
        String(p.done),
        p.status,
      ]),
      [],
      ["Task", "Project", "Status", "Priority", "Due Date"],
      ...recentTasks.map((t) => [
        t.title,
        t.projectName,
        t.status,
        t.priority || "",
        t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "",
      ]),
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `writask-personal-report-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto bg-[#F6F9FC] text-slate-900 p-10 dark:bg-[#0B1120] dark:text-slate-100">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">My Reports</h1>
              <p className="text-slate-500 mt-1 dark:text-slate-400">
                {isSingleProject
                  ? `Your assigned tasks in ${filterLabel}`
                  : "Your personal performance across every project you belong to"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Select
                value={projectFilter}
                onChange={setProjectFilter}
                options={[
                  { value: "all", label: "All my projects" },
                  ...projects.map((p) => ({ value: p._id, label: p.title })),
                ]}
                menuClassName="min-w-[200px]"
                triggerClassName={(open) =>
                  `flex items-center justify-between gap-2 min-w-[200px] bg-white border shadow-sm text-slate-700 text-sm rounded-xl px-3 py-2.5 outline-none transition-all cursor-pointer dark:bg-slate-800 dark:text-slate-200 ${
                    open
                      ? "border-cyan-400 ring-4 ring-cyan-100 dark:border-cyan-500 dark:ring-cyan-500/20"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                  }`
                }
              />
              <PeriodToggle period={period} onChange={setPeriod} />
              <button
                type="button"
                onClick={() => {
                  void loadProjects();
                  setRefreshKey((k) => k + 1);
                }}
                disabled={loadingReports}
                className="btn btn-secondary"
              >
                <RefreshCw
                  size={16}
                  className={loadingReports ? "animate-spin" : ""}
                />{" "}
                Refresh
              </button>
              <button type="button" onClick={handleExport} className="btn btn-secondary">
                <Download size={16} /> Export CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="btn btn-primary"
              >
                <FileText size={16} />{" "}
                {downloadingPdf ? "Generating..." : "Download PDF"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
            {[
              {
                icon: FolderKanban,
                label: isSingleProject ? "Selected Project" : "My Projects",
                value: stats.totalProjects,
                color: "text-slate-900 dark:text-slate-100",
                iconColor: "text-cyan-600 dark:text-cyan-400",
                bg: "bg-cyan-50 dark:bg-cyan-500/10",
              },
              {
                icon: ListTodo,
                label: "Assigned Tasks",
                value: stats.totalTasks,
                color: "text-slate-900 dark:text-slate-100",
                iconColor: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-50 dark:bg-blue-500/10",
              },
              {
                icon: CheckCircle2,
                label: "Completed",
                value: stats.completedTasks,
                color: "text-emerald-600 dark:text-emerald-400",
                iconColor: "text-emerald-600 dark:text-emerald-400",
                bg: "bg-emerald-50 dark:bg-emerald-500/10",
              },
              {
                icon: Clock,
                label: "Pending",
                value: stats.pendingTasks,
                color: "text-violet-600 dark:text-violet-400",
                iconColor: "text-violet-600 dark:text-violet-400",
                bg: "bg-violet-50 dark:bg-violet-500/10",
              },
              {
                icon: TrendingUp,
                label: "Completion Rate",
                value: `${stats.completionRate}%`,
                color: "text-green-600 dark:text-green-400",
                iconColor: "text-green-600 dark:text-green-400",
                bg: "bg-green-50 dark:bg-green-500/10",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="dashboard-card flex items-center gap-4"
              >
                <div
                  className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}
                >
                  <s.icon size={22} className={s.iconColor} />
                </div>
                <div>
                  <p className="text-slate-500 text-sm dark:text-slate-400">{s.label}</p>
                  <h2 className={`text-3xl font-bold ${s.color}`}>{s.value}</h2>
                </div>
              </div>
            ))}
          </div>

          {stats.overdueTasks > 0 && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle size={18} className="shrink-0" />
              You have {stats.overdueTasks} overdue assigned task
              {stats.overdueTasks === 1 ? "" : "s"}
              {isSingleProject ? ` in ${filterLabel}` : ""}.
            </div>
          )}

          <div className="grid xl:grid-cols-2 gap-6 mb-6">
            <div className="dashboard-widget">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  My Weekly Activity
                </h2>
                <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-cyan-500/70" />{" "}
                    Completed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-violet-500/50" />{" "}
                    Pending
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4 dark:text-slate-500">
                Task updates in the last {period}
                {isSingleProject ? ` · ${filterLabel}` : ""}
              </p>
              {loadingReports ? (
                <p className="text-sm text-slate-400 text-center py-12 dark:text-slate-500">
                  Loading activity...
                </p>
              ) : (
                <BarChartWidget data={weeklyActivity} />
              )}
            </div>

            <div className="dashboard-widget">
              <h2 className="text-xl font-bold text-slate-900 mb-6 dark:text-slate-100">
                My Task Distribution
              </h2>
              <DonutChart
                completed={stats.completedTasks}
                pending={stats.pendingTasks}
                overdue={stats.overdueTasks}
              />
              <div className="mt-6 pt-4 border-t border-slate-200 grid grid-cols-3 text-center dark:border-slate-800">
                <div>
                  <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
                    {stats.completionRate}%
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">Completion</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {stats.totalTasks}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">Assigned</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {stats.overdueTasks}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">Overdue</p>
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-widget mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-1 dark:text-slate-100">
              {isSingleProject ? `${filterLabel} Performance` : "Performance by Project"}
            </h2>
            <p className="text-sm text-slate-500 mb-5 dark:text-slate-400">
              {isSingleProject
                ? "Current assigned tasks in this project"
                : "Your assigned work broken down across projects you joined"}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    {[
                      "Project",
                      "Workspace",
                      "Progress",
                      "Tasks",
                      "Done",
                      "Status",
                    ].map((h) => (
                      <th
                        key={h}
                        className="pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center dark:text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loadingReports ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-slate-400 dark:text-slate-500"
                      >
                        Loading project data...
                      </td>
                    </tr>
                  ) : projectBreakdown.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-slate-400 dark:text-slate-500"
                      >
                        {isSingleProject
                          ? `No assigned tasks in ${filterLabel} yet.`
                          : "No assigned tasks found across your projects."}
                      </td>
                    </tr>
                  ) : (
                    projectBreakdown.map((p) => (
                      <tr
                        key={normalizeProjectId(p._id)}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                          isSingleProject ? "bg-cyan-50/30 dark:bg-cyan-500/10" : ""
                        }`}
                      >
                        <td className="py-3.5 text-center font-medium text-slate-900 dark:text-slate-100">
                          {p.name}
                        </td>
                        <td className="py-3.5 text-slate-500 text-center dark:text-slate-400">
                          {p.organizationName || "Personal"}
                        </td>
                        <td className="py-3.5 w-40">
                          <div className="flex items-center justify-center gap-3">
                            <div className="flex-1 max-w-24 bg-slate-100 rounded-full h-1.5 dark:bg-slate-700">
                              <div
                                className={`h-1.5 rounded-full ${
                                  p.progress >= 80
                                    ? "bg-emerald-400"
                                    : p.progress >= 50
                                      ? "bg-cyan-400"
                                      : "bg-amber-400"
                                }`}
                                style={{ width: `${p.progress}%` }}
                              />
                            </div>
                            <span className="text-slate-500 text-xs w-8 text-right dark:text-slate-400">
                              {p.progress}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 text-slate-500 text-center dark:text-slate-400">{p.tasks}</td>
                        <td className="py-3.5 text-slate-500 text-center dark:text-slate-400">{p.done}</td>
                        <td className="py-3.5 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                              STATUS_STYLES[p.status] ||
                              "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dashboard-widget">
            <h2 className="text-xl font-bold text-slate-900 mb-5 dark:text-slate-100">
              Recent Assigned Tasks
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    {["Task", "Project", "Status", "Priority", "Due"].map(
                      (h, i) => (
                        <th
                          key={h}
                          className={`pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider dark:text-slate-500 ${
                            i === 0 ? "text-left" : "text-center"
                          }`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loadingReports ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-slate-400 dark:text-slate-500"
                      >
                        Loading tasks...
                      </td>
                    </tr>
                  ) : recentTasks.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-slate-400 dark:text-slate-500"
                      >
                        {isSingleProject
                          ? `No assigned tasks in ${filterLabel}.`
                          : "No recent assigned tasks."}
                      </td>
                    </tr>
                  ) : (
                    recentTasks.map((t) => (
                      <tr
                        key={t._id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <td className="py-3.5 font-medium text-slate-900 dark:text-slate-100">
                          {t.title}
                        </td>
                        <td className="py-3.5 text-slate-500 text-center dark:text-slate-400">
                          {t.projectName}
                        </td>
                        <td className="py-3.5 text-slate-600 text-center dark:text-slate-300">
                          {statusLabel(t.status)}
                        </td>
                        <td className="py-3.5 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${priorityClass(
                              t.priority
                            )}`}
                          >
                            {t.priority || "low"}
                          </span>
                        </td>
                        <td className="py-3.5 text-slate-500 text-center dark:text-slate-400">
                          {t.dueDate
                            ? new Date(t.dueDate).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dashboard-widget mt-6">
            <h2 className="text-xl font-bold text-slate-900 mb-1 dark:text-slate-100">
              Past Weekly Reports
            </h2>
            <p className="text-sm text-slate-500 mb-5 dark:text-slate-400">
              Download or review PDFs generated from previous weeks
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    {["Week", "Generated", "Completion", "Assigned", ""].map(
                      (h, i) => (
                        <th
                          key={h}
                          className={`pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider dark:text-slate-500 ${
                            i === 0 ? "text-left" : "text-center"
                          }`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 dark:text-slate-500">
                        Loading past reports...
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 dark:text-slate-500">
                        No past weekly reports yet. Click &quot;Download PDF&quot; to
                        generate this week&apos;s report.
                      </td>
                    </tr>
                  ) : (
                    history.map((item) => (
                      <tr
                        key={item._id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <td className="py-3.5 font-medium text-slate-900 dark:text-slate-100">
                          {new Date(item.weekStart).toLocaleDateString()} –{" "}
                          {new Date(item.weekEnd).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 text-slate-500 text-center dark:text-slate-400">
                          {new Date(item.generatedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 text-slate-500 text-center dark:text-slate-400">
                          {item.summarySnapshot?.completionRate ?? 0}%
                        </td>
                        <td className="py-3.5 text-slate-500 text-center dark:text-slate-400">
                          {item.summarySnapshot?.assigned ?? 0}
                        </td>
                        <td className="py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDownloadHistoryItem(item)}
                            disabled={downloadingHistoryId === item._id}
                            className="btn btn-secondary btn-sm"
                          >
                            <Download size={14} />{" "}
                            {downloadingHistoryId === item._id
                              ? "Downloading..."
                              : "Download"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
