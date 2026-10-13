"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import { authFetch } from "@/lib/validation/authFetch";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import { useOrgRoles } from "@/hooks/useOrgRoles";
import { PeriodToggle, STATUS_STYLES, type Period, type ProjectBreakdownItem } from "@/components/reports/ReportCharts";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FolderKanban,
  ListTodo,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react";

type ReportMember = {
  _id: string;
  username: string;
  email: string;
  phone?: string;
  location?: string;
  avatarColor?: string;
  designation?: string;
  department?: string;
  role: string | null;
};

type MemberStats = {
  totalProjects: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  completionRate: number;
};

type TaskDistribution = {
  todo: number;
  inProgress: number;
  review: number;
  completed: number;
  overdue: number;
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

type ActiveView = "projects" | "assigned" | "completed" | "pending" | "overdue" | null;

const EMPTY_STATS: MemberStats = {
  totalProjects: 0,
  totalTasks: 0,
  completedTasks: 0,
  pendingTasks: 0,
  overdueTasks: 0,
  completionRate: 0,
};

const EMPTY_DISTRIBUTION: TaskDistribution = {
  todo: 0,
  inProgress: 0,
  review: 0,
  completed: 0,
  overdue: 0,
};

function avatarInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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

function categorizeTask(t: RecentTask): "completed" | "overdue" | "pending" {
  if (t.status === "completed") return "completed";
  if (t.dueDate) {
    const due = new Date(t.dueDate);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (due < todayStart) return "overdue";
  }
  return "pending";
}

export default function MemberReportPage() {
  const { orgId, memberId } = useParams<{ orgId: string; memberId: string }>();
  const router = useRouter();
  const { role, loading: roleLoading } = useOrgPermission();
  const { getLabel } = useOrgRoles(orgId);
  const isOwner = role === "owner";

  const [orgName, setOrgName] = useState("");
  const [period, setPeriod] = useState<Period>("30d");
  const [member, setMember] = useState<ReportMember | null>(null);
  const [stats, setStats] = useState<MemberStats>(EMPTY_STATS);
  const [distribution, setDistribution] = useState<TaskDistribution>(EMPTY_DISTRIBUTION);
  const [projectBreakdown, setProjectBreakdown] = useState<ProjectBreakdownItem[]>([]);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [notAllowed, setNotAllowed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeView, setActiveView] = useState<ActiveView>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    if (roleLoading) return;
    if (!isOwner) {
      router.push(`/organizations/${orgId}/members`);
    }
  }, [roleLoading, isOwner, router, orgId]);

  useEffect(() => {
    const loadOrg = async () => {
      const res = await authFetch(`/organizations/${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setOrgName(data.name || "");
      }
    };
    if (orgId) void loadOrg();
  }, [orgId]);

  const loadReport = useCallback(async () => {
    if (!orgId || !memberId || !isOwner) return;
    setLoadingReport(true);
    try {
      const params = new URLSearchParams({ organizationId: orgId, period });
      const res = await authFetch(`/dashboard/reports/member/${memberId}?${params.toString()}`);
      if (res.status === 403) {
        setNotAllowed(true);
        return;
      }
      if (!res.ok) {
        console.error("Member report failed:", res.status);
        return;
      }
      const data = await res.json();
      if (data.member) setMember(data.member);
      if (data.stats) setStats(data.stats);
      setDistribution(data.taskDistribution || EMPTY_DISTRIBUTION);
      setProjectBreakdown(Array.isArray(data.projectBreakdown) ? data.projectBreakdown : []);
      setRecentTasks(Array.isArray(data.recentTasks) ? data.recentTasks : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReport(false);
    }
  }, [orgId, memberId, period, isOwner]);

  useEffect(() => {
    void loadReport();
  }, [loadReport, refreshKey]);

  const filteredTasks = useMemo(() => {
    if (activeView === "assigned" || activeView === null) return recentTasks;
    if (activeView === "projects") return [];
    return recentTasks.filter((t) => categorizeTask(t) === activeView);
  }, [recentTasks, activeView]);

  const toggleView = (view: ActiveView) => {
    setActiveView((prev) => (prev === view ? null : view));
  };

  const viewTitle: Record<Exclude<ActiveView, null>, string> = {
    projects: "Projects",
    assigned: "All Assigned Tasks",
    completed: "Completed Tasks",
    pending: "Pending Tasks",
    overdue: "Overdue Tasks",
  };

  const distributionRows = [
    { key: "todo", label: "To Do", value: distribution.todo, bar: "bg-slate-400 dark:bg-slate-500" },
    { key: "inProgress", label: "In Progress", value: distribution.inProgress, bar: "bg-cyan-400" },
    { key: "review", label: "Review", value: distribution.review, bar: "bg-amber-400" },
    { key: "completed", label: "Completed", value: distribution.completed, bar: "bg-emerald-400" },
    { key: "overdue", label: "Overdue", value: distribution.overdue, bar: "bg-red-400" },
  ];
  const distributionMax = Math.max(...distributionRows.map((r) => r.value), 1);

  if (notAllowed) {
    return (
      <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
        <Navbar />
        <div className="flex h-full">
          <Sidebar />
          <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto bg-[#F6F9FC] text-slate-900 p-10 dark:bg-[#0B1120] dark:text-slate-100">
            <p className="text-slate-500 dark:text-slate-400">
              Only the organization owner can view member reports.
            </p>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-10 dark:bg-[#0B1120] dark:text-slate-100">
          <button
            type="button"
            onClick={() => router.push(`/organizations/${orgId}/members`)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors dark:text-slate-400 dark:hover:text-slate-100"
          >
            <ArrowLeft size={15} /> Back to {orgName || "organization"} members
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0 ${
                  member?.avatarColor ? "" : "bg-gradient-to-br from-cyan-400 to-purple-500"
                }`}
                style={member?.avatarColor ? { background: member.avatarColor } : undefined}
              >
                {avatarInitials(member?.username || "?")}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {member ? `${member.username}'s Report` : "Member Report"}
                </h1>
                <p className="text-slate-500 mt-1 dark:text-slate-400">
                  {member?.email}
                  {member?.role ? ` · ${getLabel(member.role)}` : ""}
                  {member?.designation ? ` · ${member.designation}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <PeriodToggle period={period} onChange={setPeriod} />
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={loadingReport}
                className="btn btn-secondary"
              >
                <RefreshCw size={16} className={loadingReport ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-6 gap-6 mb-8">
            {[
              {
                key: "projects" as const,
                icon: FolderKanban,
                label: "Projects",
                value: stats.totalProjects,
                color: "text-slate-900 dark:text-slate-100",
                iconColor: "text-cyan-600 dark:text-cyan-400",
                bg: "bg-cyan-50 dark:bg-cyan-500/10",
                clickable: true,
              },
              {
                key: "assigned" as const,
                icon: ListTodo,
                label: "Assigned",
                value: stats.totalTasks,
                color: "text-slate-900 dark:text-slate-100",
                iconColor: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-50 dark:bg-blue-500/10",
                clickable: true,
              },
              {
                key: "completed" as const,
                icon: CheckCircle2,
                label: "Completed",
                value: stats.completedTasks,
                color: "text-emerald-600 dark:text-emerald-400",
                iconColor: "text-emerald-600 dark:text-emerald-400",
                bg: "bg-emerald-50 dark:bg-emerald-500/10",
                clickable: true,
              },
              {
                key: "pending" as const,
                icon: Clock,
                label: "Pending",
                value: stats.pendingTasks,
                color: "text-violet-600 dark:text-violet-400",
                iconColor: "text-violet-600 dark:text-violet-400",
                bg: "bg-violet-50 dark:bg-violet-500/10",
                clickable: true,
              },
              {
                key: "overdue" as const,
                icon: AlertTriangle,
                label: "Overdue",
                value: stats.overdueTasks,
                color: "text-red-600 dark:text-red-400",
                iconColor: "text-red-600 dark:text-red-400",
                bg: "bg-red-50 dark:bg-red-500/10",
                clickable: true,
              },
              {
                key: "completion" as const,
                icon: TrendingUp,
                label: "Completion",
                value: `${stats.completionRate}%`,
                color: "text-green-600 dark:text-green-400",
                iconColor: "text-green-600 dark:text-green-400",
                bg: "bg-green-50 dark:bg-green-500/10",
                clickable: false,
              },
            ].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={s.clickable ? () => toggleView(s.key as ActiveView) : undefined}
                disabled={!s.clickable}
                className={`dashboard-card flex items-center gap-4 text-left transition-all ${
                  s.clickable
                    ? "hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                    : "cursor-default"
                } ${activeView === s.key ? "ring-2 ring-cyan-300 dark:ring-cyan-500/40" : ""}`}
              >
                <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                  <s.icon size={22} className={s.iconColor} />
                </div>
                <div>
                  <p className="text-slate-500 text-sm dark:text-slate-400">{s.label}</p>
                  <h2 className={`text-3xl font-bold ${s.color}`}>{s.value}</h2>
                </div>
              </button>
            ))}
          </div>

          {activeView === null ? (
            <>
              <div className="dashboard-widget mb-6">
                <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">
                  Account
                </h2>
                <dl className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Name</dt>
                    <dd className="text-slate-900 mt-1 dark:text-slate-100">
                      {member?.username || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                    <dd className="text-slate-900 mt-1 dark:text-slate-100">
                      {member?.email || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
                    <dd className="text-slate-900 mt-1 dark:text-slate-100">
                      {member?.phone || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Country</dt>
                    <dd className="text-slate-900 mt-1 dark:text-slate-100">
                      {member?.location || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Designation</dt>
                    <dd className="text-slate-900 mt-1 capitalize dark:text-slate-100">
                      {member?.designation || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Department</dt>
                    <dd className="text-slate-900 mt-1 dark:text-slate-100">
                      {member?.department || "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="dashboard-widget">
                <h2 className="text-lg font-semibold mb-5 text-slate-900 dark:text-slate-100">
                  Task Distribution
                </h2>
                <div className="space-y-3.5">
                  {distributionRows.map((row) => (
                    <div key={row.key} className="flex items-center gap-4">
                      <span className="w-28 shrink-0 text-sm text-slate-500 dark:text-slate-400">
                        {row.label}
                      </span>
                      <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.bar}`}
                          style={{ width: `${(row.value / distributionMax) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="dashboard-widget">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {viewTitle[activeView]} (
                  {activeView === "projects" ? projectBreakdown.length : filteredTasks.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveView(null)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  <X size={13} /> Close
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-5 dark:text-slate-400">
                {activeView === "projects"
                  ? `Every project ${member?.username || "this member"} belongs to in ${orgName || "this organization"}`
                  : `Tasks assigned to ${member?.username || "this member"}`}
              </p>

              {activeView === "projects" ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        {["Project", "Workspace", "Progress", "Tasks", "Done", "Status"].map((h, i) => (
                          <th
                            key={h}
                            className={`pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider dark:text-slate-500 ${
                              i === 0 ? "text-left" : "text-center"
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {loadingReport ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-slate-500">
                            Loading project data...
                          </td>
                        </tr>
                      ) : projectBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-slate-500">
                            No assigned tasks found across this member&apos;s projects.
                          </td>
                        </tr>
                      ) : (
                        projectBreakdown.map((p) => (
                          <tr key={p._id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <td className="py-3.5 font-medium text-slate-900 dark:text-slate-100">{p.name}</td>
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
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        {["Task", "Project", "Status", "Priority", "Due"].map((h, i) => (
                          <th
                            key={h}
                            className={`pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider dark:text-slate-500 ${
                              i === 0 ? "text-left" : "text-center"
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {loadingReport ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 dark:text-slate-500">
                            Loading tasks...
                          </td>
                        </tr>
                      ) : filteredTasks.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 dark:text-slate-500">
                            No tasks in this category.
                          </td>
                        </tr>
                      ) : (
                        filteredTasks.map((t) => (
                          <tr key={t._id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <td className="py-3.5 font-medium text-slate-900 dark:text-slate-100">{t.title}</td>
                            <td className="py-3.5 text-slate-500 text-center dark:text-slate-400">
                              {t.projectName}
                            </td>
                            <td className="py-3.5 text-slate-600 text-center dark:text-slate-300">
                              {statusLabel(t.status)}
                            </td>
                            <td className="py-3.5 text-center">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${priorityClass(t.priority)}`}
                              >
                                {t.priority || "low"}
                              </span>
                            </td>
                            <td className="py-3.5 text-slate-500 text-center dark:text-slate-400">
                              {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
