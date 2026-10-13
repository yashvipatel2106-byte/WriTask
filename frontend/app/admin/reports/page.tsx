"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import { authFetch } from "@/lib/validation/authFetch";
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
  CheckCircle2,
  Clock,
  Download,
  FolderKanban,
  TrendingUp,
  Users,
} from "lucide-react";

type ReportStats = {
  totalProjects: number;
  totalTasks?: number;
  inactiveTasks?: number;
  totalMembers?: number;
  completionRate?: number;
};

type OrgMemberPerformanceItem = {
  _id: string;
  name: string;
  completed: number;
  pending: number;
  overdue: number;
  efficiency: number;
};

export default function AdminOrgReportsPage() {
  const router = useRouter();
  const { canViewAdmin } = useOrgPermission();
  const { currentOrg, personalWorkspace } = useOrganization();

  const [period, setPeriod] = useState<Period>("7d");
  const [stats, setStats] = useState<ReportStats>({ totalProjects: 0 });
  const [projectBreakdown, setProjectBreakdown] = useState<ProjectBreakdownItem[]>(
    []
  );
  const [memberPerformance, setMemberPerformance] = useState<
    OrgMemberPerformanceItem[]
  >([]);
  const [weeklyActivity, setWeeklyActivity] = useState<WeeklyActivityItem[]>(
    EMPTY_WEEKLY
  );
  const [loadingReports, setLoadingReports] = useState(true);

  const orgId = currentOrg?.organizationId;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    if (!canViewAdmin) {
      router.push("/dashboard");
      return;
    }
  }, [router, canViewAdmin]);

  useEffect(() => {
    if (!orgId) {
      setLoadingReports(false);
      return;
    }

    const query = `?period=${period}&organizationId=${orgId}&allOrgProjects=true`;
    const statsQuery = `?organizationId=${orgId}&allOrgProjects=true`;

    setLoadingReports(true);

    Promise.all([
      authFetch(`/dashboard/stats${statsQuery}`).then((res) =>
        res.ok ? res.json() : null
      ),
      authFetch(`/dashboard/reports/project-breakdown${query}`).then((res) =>
        res.ok ? res.json() : []
      ),
      authFetch(`/dashboard/reports/team-performance${query}`).then((res) =>
        res.ok ? res.json() : []
      ),
      authFetch(`/dashboard/reports/weekly-activity${query}`).then((res) =>
        res.ok ? res.json() : []
      ),
    ])
      .then(([statsData, projects, members, weekly]) => {
        if (statsData) setStats(statsData);
        setProjectBreakdown(Array.isArray(projects) ? projects : []);
        setMemberPerformance(Array.isArray(members) ? members : []);
        setWeeklyActivity(
          Array.isArray(weekly) && weekly.length > 0 ? weekly : EMPTY_WEEKLY
        );
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingReports(false));
  }, [orgId, period]);

  const completedTasks =
    stats.totalTasks && stats.completionRate
      ? Math.round((stats.totalTasks * stats.completionRate) / 100)
      : 0;
  const pendingTasks = Math.max(
    0,
    (stats.totalTasks ?? 0) - completedTasks - (stats.inactiveTasks ?? 0)
  );

  const overdueCount = useMemo(() => {
    if (projectBreakdown.length > 0) {
      return projectBreakdown.reduce((sum, p) => sum + p.overdue, 0);
    }
    return stats.inactiveTasks ?? 0;
  }, [projectBreakdown, stats.inactiveTasks]);

  const handleExport = () => {
    const rows = [
      ["Metric", "Value"],
      ["Report", "Organization"],
      ["Organization", currentOrg?.name || orgId || ""],
      ["Period", period],
      ["Total Projects", String(stats.totalProjects)],
      ["Total Tasks", String(stats.totalTasks ?? 0)],
      ["Completed Tasks", String(completedTasks)],
      ["Pending Tasks", String(pendingTasks)],
      ["Completion Rate", `${stats.completionRate ?? 0}%`],
      ["Overdue Tasks", String(overdueCount)],
      ["Total Members", String(stats.totalMembers ?? 0)],
      [],
      ["Day", "Date", "Completed", "Pending"],
      ...weeklyActivity.map((d) => [
        d.day,
        d.date,
        String(d.completed),
        String(d.pending),
      ]),
      [],
      ["Project", "Progress", "Tasks", "Done", "Status"],
      ...projectBreakdown.map((p) => [
        p.name,
        `${p.progress}%`,
        String(p.tasks),
        String(p.done),
        p.status,
      ]),
      [],
      ["Org Member", "Completed", "Pending", "Overdue", "Efficiency"],
      ...memberPerformance.map((m) => [
        m.name,
        String(m.completed),
        String(m.pending),
        String(m.overdue),
        `${m.efficiency}%`,
      ]),
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `writask-org-report-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto bg-[#F6F9FC] text-slate-900 p-10 dark:bg-[#0B1120] dark:text-slate-100">
          <div className="flex flex-col md:flex-row items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
                Organization Reports
              </h1>
              <p className="text-slate-500 mt-1 dark:text-slate-400">
                Overall analytics across all projects and org members
              </p>
            </div>
            {orgId && (
              <div className="flex gap-3 items-center">
                <PeriodToggle period={period} onChange={setPeriod} />
                <button type="button" onClick={handleExport} className="btn btn-primary">
                  <Download size={16} /> Export CSV
                </button>
              </div>
            )}
          </div>

          {(personalWorkspace && !orgId) || !orgId ? (
            <div className="dashboard-widget text-slate-600 dark:text-slate-300">
              <p className="font-medium text-slate-900 mb-2 dark:text-slate-100">
                Organization required
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Switch to an organization workspace to view organization-wide
                reports for all projects and members.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
                {[
                  {
                    icon: FolderKanban,
                    label: "Total Projects",
                    value: stats.totalProjects,
                    color: "text-slate-900 dark:text-slate-100",
                    iconColor: "text-cyan-600 dark:text-cyan-400",
                    bg: "bg-cyan-50 dark:bg-cyan-500/10",
                  },
                  {
                    icon: Users,
                    label: "Org Members",
                    value: stats.totalMembers ?? 0,
                    color: "text-slate-900 dark:text-slate-100",
                    iconColor: "text-blue-600 dark:text-blue-400",
                    bg: "bg-blue-50 dark:bg-blue-500/10",
                  },
                  {
                    icon: CheckCircle2,
                    label: "Tasks Completed",
                    value: completedTasks,
                    color: "text-emerald-600 dark:text-emerald-400",
                    iconColor: "text-emerald-600 dark:text-emerald-400",
                    bg: "bg-emerald-50 dark:bg-emerald-500/10",
                  },
                  {
                    icon: Clock,
                    label: "Tasks Pending",
                    value: pendingTasks,
                    color: "text-violet-600 dark:text-violet-400",
                    iconColor: "text-violet-600 dark:text-violet-400",
                    bg: "bg-violet-50 dark:bg-violet-500/10",
                  },
                  {
                    icon: TrendingUp,
                    label: "Completion Rate",
                    value: `${stats.completionRate ?? 0}%`,
                    color: "text-green-600 dark:text-green-400",
                    iconColor: "text-green-600 dark:text-green-400",
                    bg: "bg-green-50 dark:bg-green-500/10",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="dashboard-card flex flex-wrap items-center gap-4"
                  >
                    <div
                      className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}
                    >
                      <s.icon size={22} className={s.iconColor} />
                    </div>
                    <div>
                      <p className="text-slate-500 text-sm dark:text-slate-400">{s.label}</p>
                      <h2 className={`text-3xl font-bold ${s.color}`}>
                        {s.value}
                      </h2>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid xl:grid-cols-2 gap-6 mb-6">
                <div className="dashboard-widget">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      Weekly Task Activity
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
                    Task Distribution
                  </h2>
                  <DonutChart
                    completed={completedTasks}
                    pending={pendingTasks}
                    overdue={overdueCount}
                  />
                  <div className="mt-6 pt-4 border-t border-slate-200 grid grid-cols-3 text-center dark:border-slate-800">
                    <div>
                      <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
                        {stats.completionRate ?? 0}%
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">Completion</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {stats.totalTasks ?? 0}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">Total Tasks</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {overdueCount}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">Overdue</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="dashboard-widget mb-6">
                <h2 className="text-xl font-bold text-slate-900 mb-5 dark:text-slate-100">
                  Project Breakdown
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        {["Project", "Progress", "Tasks", "Done", "Status"].map(
                          (h) => (
                            <th
                              key={h}
                              className="pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center dark:text-slate-500"
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
                            Loading project data...
                          </td>
                        </tr>
                      ) : projectBreakdown.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-8 text-center text-slate-400 dark:text-slate-500"
                          >
                            No projects found for this period.
                          </td>
                        </tr>
                      ) : (
                        projectBreakdown.map((p) => (
                          <tr
                            key={p._id}
                            className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
                          >
                            <td className="py-3.5 text-center font-medium text-slate-900 dark:text-slate-100">
                              {p.name}
                            </td>
                            <td className="py-3.5 w-40">
                              <div className="flex items-center justify-center gap-3">
                                <div className="flex-1 max-w-24 bg-slate-100 rounded-full h-1.5 dark:bg-slate-800">
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
                                  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
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
                  Org Member Performance
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        {[
                          "Member",
                          "Completed",
                          "Pending",
                          "Overdue",
                          "Efficiency",
                        ].map((h, i) => (
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
                      {loadingReports ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-8 text-center text-slate-400 dark:text-slate-500"
                          >
                            Loading member data...
                          </td>
                        </tr>
                      ) : memberPerformance.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-8 text-center text-slate-400 dark:text-slate-500"
                          >
                            No assigned tasks found for this period.
                          </td>
                        </tr>
                      ) : (
                        memberPerformance.map((m) => (
                          <tr
                            key={m._id}
                            className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
                          >
                            <td className="py-3.5 font-medium text-slate-900 dark:text-slate-100">
                              {m.name}
                            </td>
                            <td className="py-3.5 text-emerald-600 font-semibold text-center dark:text-emerald-400">
                              {m.completed}
                            </td>
                            <td className="py-3.5 text-violet-600 text-center dark:text-violet-400">
                              {m.pending}
                            </td>
                            <td className="py-3.5 text-red-600 text-center dark:text-red-400">{m.overdue}</td>
                            <td className="py-3.5">
                              <div className="flex items-center justify-center gap-3">
                                <div className="w-20 bg-slate-100 rounded-full h-1.5 dark:bg-slate-800">
                                  <div
                                    className="h-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                                    style={{ width: `${m.efficiency}%` }}
                                  />
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {m.efficiency}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
