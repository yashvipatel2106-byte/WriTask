"use client";
import { useOrganization } from "@/components/context/organizationContext";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "../../components/sidebar/sidebar";
import Navbar from "@/components/navbar/Navbar";
import TaskOverview from "@/components/dashboard/TaskOverview";
import ProjectProgress from "@/components/dashboard/ProjectProgress";
import { authFetch } from "@/lib/validation/authFetch";
import {
  fetchCalendarEvents,
  type CalendarEventAPI,
} from "@/lib/validation/calendarApi";
import {
  markNotificationRead,
  type NotificationItem,
} from "@/lib/notifications";
import {
  fetchUsersOnLeave,
  fetchUsersOnLeaveRange,
  type OnLeaveEntry,
} from "@/lib/validation/leaveApi";
import { appendWorkspaceScope } from "@/lib/workspaceStorage";
import {
  FolderKanban,
  ClipboardList,
  Users,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  Circle,
  Calendar,
  CalendarDays,
  Bell,
  CalendarOff,
  Gauge,
} from "lucide-react";
import UserAvatar from "@/components/ui/UserAvatar";

// ── calendar constants ────────────────────────────────────────────────────
const CAL_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CAL_DAYS = ["S","M","T","W","T","F","S"];

type CalEventType = CalendarEventAPI["type"];

const CAL_TYPE_DOT: Record<CalEventType, string> = {
  task:      "bg-blue-500",
  meeting:   "bg-green-500",
  reminder:  "bg-red-500",
  leave: "bg-orange-500",
};
// Legacy events created before "deadline" was renamed to "reminder" may
// still carry the old value straight from the DB — fall back instead of
// rendering an "undefined" class.
function calTypeDot(type: string) {
  return CAL_TYPE_DOT[type as CalEventType] || "bg-slate-400";
}

function calToKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function calMonthParam(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

// ── types ─────────────────────────────────────────────────────────────────
type DashboardStats = {
  totalProjects: number;
  totalTasks: number;
  totalMembers: number;
  completionRate: number;
};

type DashboardHoliday = {
  _id: string;
  name: string;
  date: string;
  dateKey?: string;
  year?: number;
  description?: string;
  country?: string;
  state?: string;
  source?: string;
  isEnabled?: boolean;
};

type TeamMember = {
  _id?: string;
  username?: string;
  role?: string;
  tasks?: number;
  avatarColor?: string | null;
};

type DeadlineTask = {
  _id: string;
  title: string;
  priority?: string;
  dueDate?: string;
  status?: string;
  project?: { _id?: string; title?: string; name?: string } | null;
};

// ── deep links ────────────────────────────────────────────────────────────
function taskLink(task: DeadlineTask) {
  return task.project?._id ? `/projects/${task.project._id}?task=${task._id}` : null;
}

// ── priority badge colours ────────────────────────────────────────────────
function priorityClass(p?: string) {
  if (p === "high")   return "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400";
  if (p === "medium") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400";
  return "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400";
}

import { useAppDispatch } from "@/store/hooks";
import {
  clearDashboardCharts,
  fetchProjectProgress,
  fetchTaskOverview,
} from "@/store/slices/dashboardSlice";


export default function Dashboard() {
  const dispatch = useAppDispatch();
  const { currentOrgId, orgReady } = useOrganization();
  const { currentOrg } = useOrganization();
  const router = useRouter();

  const orgId = currentOrgId ?? null;

  // Step 8 + 9: central chart fetch; clear stale cache when org changes
  useEffect(() => {
    if (!orgReady) return;

    dispatch(clearDashboardCharts());
    dispatch(fetchTaskOverview(orgId));
    dispatch(fetchProjectProgress(orgId));
    const onWorkspaceChange = () => {
      dispatch(clearDashboardCharts());
      dispatch(fetchTaskOverview(orgId));
      dispatch(fetchProjectProgress(orgId));
    };
    window.addEventListener("workspace-changed", onWorkspaceChange);
    return () => window.removeEventListener("workspace-changed", onWorkspaceChange);
  }, [dispatch, orgId, orgReady]);

  // ── stats ─────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    totalTasks: 0,
    totalMembers: 0,
    completionRate: 0,
  });

  // ── team workload ─────────────────────────────────────────────────────
  const [teamWorkload, setTeamWorkload] = useState<any[]>([]);
const [workloadSummary, setWorkloadSummary] = useState({
  averageCapacity: 0,
  overCapacity: 0,
  underCapacity: 0,
});

  // ── notifications ─────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const handleNotificationClick = async (n: NotificationItem) => {
    setNotifications((prev) => prev.filter((item) => item._id !== n._id));
    if (!n.read) {
      await markNotificationRead(n._id);
    }
    if (n.link) {
      router.push(n.link);
    } else if (n.projectId) {
      router.push(n.taskId ? `/projects/${n.projectId}?task=${n.taskId}` : `/projects/${n.projectId}`);
    } else {
      router.push("/inbox");
    }
  };

  // ── upcoming deadlines ────────────────────────────────────────────────
  const [deadlines, setDeadlines] = useState<DeadlineTask[]>([]);

  // ── organization holidays ────────────────────────────────────────────
const [holidays, setHolidays] = useState<DashboardHoliday[]>([]);
const [holidayIndex, setHolidayIndex] = useState(0);
const [holidaysLoading, setHolidaysLoading] = useState(false);

  // ── missed deadlines ──────────────────────────────────────────────────
  const [missedDeadlines, setMissedDeadlines] = useState<DeadlineTask[]>([]);
  const [missedLoading, setMissedLoading] = useState(false);

  // ── on leave (today + upcoming) ─────────────────────────────────────────
  const [todayOnLeave, setTodayOnLeave] = useState<OnLeaveEntry[]>([]);
  const [upcomingOnLeave, setUpcomingOnLeave] = useState<OnLeaveEntry[]>([]);
  const [onLeaveLoading, setOnLeaveLoading] = useState(true);

  // Calendar-specific On Leave list.
  // Uses the selected calendar date, or today when no date is selected.
  const [calendarOnLeave, setCalendarOnLeave] = useState<OnLeaveEntry[]>([]);
  const [calendarOnLeaveLoading, setCalendarOnLeaveLoading] = useState(false);

  // ── calendar state ────────────────────────────────────────────────────
  const calToday    = new Date();
  const calTodayKey = calToday.toISOString().slice(0, 10);

  const [calYear,  setCalYear]  = useState(calToday.getFullYear());
const [calMonth, setCalMonth] = useState(calToday.getMonth());
const [calEvents, setCalEvents] = useState<CalendarEventAPI[]>([]);
const [calLoading, setCalLoading] = useState(false);
const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);

// Selected date used by the lower calendar information panels.
const calInfoDate = calSelectedDate || calTodayKey;

// ── calendar organization holidays ──────────────────────────────────
const [calendarHolidays, setCalendarHolidays] = useState<DashboardHoliday[]>([]);
const [calendarHolidaysLoading, setCalendarHolidaysLoading] = useState(false);

  const loadCalendarEvents = useCallback(async (y: number, m: number) => {
    if (!orgId) return;
    setCalLoading(true);
    try {
      const evts = await fetchCalendarEvents(orgId, calMonthParam(y, m));
      setCalEvents(evts);
    } catch {
      setCalEvents([]);
    } finally {
      setCalLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadCalendarEvents(calYear, calMonth);
    const onWorkspaceChange = () => loadCalendarEvents(calYear, calMonth);
    window.addEventListener("workspace-changed", onWorkspaceChange);
    return () => window.removeEventListener("workspace-changed", onWorkspaceChange);
  }, [calYear, calMonth, loadCalendarEvents]);


  // ── organization holidays for selected calendar year ────────────────
useEffect(() => {
  if (!orgId || !orgReady) {
    setCalendarHolidays([]);
    setCalendarHolidaysLoading(false);
    return;
  }

  let cancelled = false;

  const loadCalendarHolidays = async () => {
    setCalendarHolidaysLoading(true);

    try {
      const res = await authFetch(
        `/organizations/${orgId}/holidays?year=${calYear}`
      );

      const data = await res.json().catch(() => ({}));

      if (cancelled) return;

      if (!res.ok) {
        throw new Error(
          data.message || "Failed to load organization holidays"
        );
      }
const holidayList: DashboardHoliday[] =
  Array.isArray(data.holidays)
    ? data.holidays
        .filter(
          (holiday: DashboardHoliday) =>
            holiday.isEnabled !== false
        )
        .sort(
          (
            a: DashboardHoliday,
            b: DashboardHoliday,
          ) => {
            const dateA =
              a.dateKey ||
              new Date(a.date)
                .toISOString()
                .slice(0, 10);

            const dateB =
              b.dateKey ||
              new Date(b.date)
                .toISOString()
                .slice(0, 10);

            return dateA.localeCompare(dateB);
          }
        )
    : [];

      setCalendarHolidays(holidayList);
    } catch (error) {
      if (!cancelled) {
        console.error(
          "Calendar holidays load error:",
          error
        );

        setCalendarHolidays([]);
      }
    } finally {
      if (!cancelled) {
        setCalendarHolidaysLoading(false);
      }
    }
  };

  void loadCalendarHolidays();

  const onWorkspaceChange = () => {
    void loadCalendarHolidays();
  };

  window.addEventListener(
    "workspace-changed",
    onWorkspaceChange
  );

  return () => {
    cancelled = true;

    window.removeEventListener(
      "workspace-changed",
      onWorkspaceChange
    );
  };
}, [orgId, orgReady, calYear]);

  // ── calendar On Leave for selected date ───────────────────────────────
  useEffect(() => {
    if (!orgId || !orgReady || !calInfoDate) {
      setCalendarOnLeave([]);
      setCalendarOnLeaveLoading(false);
      return;
    }

    let cancelled = false;

    const loadCalendarOnLeave = async () => {
      setCalendarOnLeaveLoading(true);

      try {
        const entries = await fetchUsersOnLeave(orgId, calInfoDate);

        if (cancelled) return;

        setCalendarOnLeave(Array.isArray(entries) ? entries : []);
      } catch (error) {
        if (!cancelled) {
          console.error("Calendar On Leave load error:", error);
          setCalendarOnLeave([]);
        }
      } finally {
        if (!cancelled) {
          setCalendarOnLeaveLoading(false);
        }
      }
    };

    void loadCalendarOnLeave();

    return () => {
      cancelled = true;
    };
  }, [orgId, orgReady, calInfoDate]);


  const calPrevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const calNextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  // grid
  const calFirstDay  = new Date(calYear, calMonth, 1).getDay();
  const calDaysCount = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells: (number | null)[] = [
    ...Array(calFirstDay).fill(null),
    ...Array.from({ length: calDaysCount }, (_, i) => i + 1),
  ];
  while (calCells.length % 7 !== 0) calCells.push(null);

  // event map
  const calEventMap: Record<string, CalendarEventAPI[]> = {};
  calEvents.forEach(e => {
    if (!calEventMap[e.date]) calEventMap[e.date] = [];
    calEventMap[e.date].push(e);
  });


  // ── organization holiday map ────────────────────────────────────────
const calHolidayMap: Record<string, DashboardHoliday[]> = {};

calendarHolidays.forEach((holiday) => {
  const key =
    holiday.dateKey ||
    new Date(holiday.date).toISOString().slice(0, 10);

  if (!calHolidayMap[key]) {
    calHolidayMap[key] = [];
  }

  calHolidayMap[key].push(holiday);
});

  const calTodayEvents   = calEventMap[calTodayKey] || [];
  const calTodayTasks    = calTodayEvents.filter(e => e.type === "task");
  const calSelectedEvents = calSelectedDate
    ? (calEventMap[calSelectedDate] || [])
    : [];
  const calSelectedHolidays = calSelectedDate
    ? calHolidayMap[calSelectedDate] || []
    : [];

  // Holiday shown below Today's Events follows the selected date.
  const calInfoHolidays = calHolidayMap[calInfoDate] || [];


  // ── main data fetch ───────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    if (!orgReady) return;

    setStats({
      totalProjects: 0,
      totalTasks: 0,
      totalMembers: 0,
      completionRate: 0,
    });
    setTeamWorkload([]);
    setNotifications([]);
    setDeadlines([]);
    setMissedDeadlines([]);

    let cancelled = false;

    const load = async () => {
      try {
        const overviewParams = new URLSearchParams({
          startDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          include: "stats,workload,upcomingDeadlines,missedDeadlines,notifications",
        });
        if (orgId) {
          overviewParams.set("organizationId", orgId);
        } else {
          overviewParams.set("personal", "true");
        }
        appendWorkspaceScope(overviewParams);

        setMissedLoading(true);
        const overviewRes = await authFetch(
          `/dashboard/overview?${overviewParams.toString()}`
        );

        if (cancelled) return;

        if (!overviewRes.ok) {
          throw new Error("Failed to load dashboard overview");
        }

        const data = await overviewRes.json();
        const workload = data.workload || {};
        setStats(
          data.stats || {
            totalProjects: 0,
            totalTasks: 0,
            totalMembers: 0,
            completionRate: 0,
          }
        );
        setTeamWorkload(workload.members || []);
        setWorkloadSummary({
          averageCapacity: workload.averageCapacity || 0,
          overCapacity: workload.overCapacity || 0,
          underCapacity: workload.underCapacity || 0,
        });
        setDeadlines(
          Array.isArray(data.upcomingDeadlines) ? data.upcomingDeadlines : []
        );
        setMissedDeadlines(
          Array.isArray(data.missedDeadlines) ? data.missedDeadlines : []
        );
        setNotifications(
          Array.isArray(data.notifications) ? data.notifications : []
        );
      } catch (err) {
        if (!cancelled) {
          console.error("Dashboard load error:", err);
          setStats({
            totalProjects: 0,
            totalTasks: 0,
            totalMembers: 0,
            completionRate: 0,
          });
          setTeamWorkload([]);
          setWorkloadSummary({
            averageCapacity: 0,
            overCapacity: 0,
            underCapacity: 0,
          });
          setDeadlines([]);
          setMissedDeadlines([]);
          setNotifications([]);
        }
      } finally {
        if (!cancelled) setMissedLoading(false);
      }
    };

    void load();
    const onWorkspaceChange = () => void load();

    window.addEventListener("workspace-changed", onWorkspaceChange);
    return () => {
      cancelled = true;
      window.removeEventListener("workspace-changed", onWorkspaceChange);
    };
  }, [router, orgId, orgReady]);

  // ── on leave (today + upcoming 7 days) ──────────────────────────────────
  useEffect(() => {
    if (!orgId || !orgReady) {
      setTodayOnLeave([]);
      setUpcomingOnLeave([]);
      setOnLeaveLoading(false);
      return;
    }
    let cancelled = false;
    setOnLeaveLoading(true);
    const todayKey = new Date().toISOString().slice(0, 10);
    const weekAheadKey = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    fetchUsersOnLeaveRange(orgId, todayKey, weekAheadKey)
      .then((entries) => {
        if (cancelled) return;
        setTodayOnLeave(entries.filter((e) => e.startDate.slice(0, 10) <= todayKey && e.endDate.slice(0, 10) >= todayKey));
        setUpcomingOnLeave(entries.filter((e) => e.startDate.slice(0, 10) > todayKey));
      })
      .catch(() => {
        if (!cancelled) {
          setTodayOnLeave([]);
          setUpcomingOnLeave([]);
        }
      })
      .finally(() => {
        if (!cancelled) setOnLeaveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, orgReady]);

  // ── organization holidays ────────────────────────────────────────────
useEffect(() => {
  if (!orgId || !orgReady) {
    setHolidays([]);
    setHolidayIndex(0);
    setHolidaysLoading(false);
    return;
  }

  let cancelled = false;

  const loadHolidays = async () => {
    setHolidaysLoading(true);

    try {
      const year = new Date().getFullYear();

      const res = await authFetch(
        `/organizations/${orgId}/holidays?year=${year}`
      );

      const data = await res.json().catch(() => ({}));

      if (cancelled) return;

      if (!res.ok) {
        throw new Error(data.message || "Failed to load holidays");
      }

      const holidayList: DashboardHoliday[] = Array.isArray(data.holidays)
        ? data.holidays
            .filter(
              (holiday: DashboardHoliday) =>
                holiday.isEnabled !== false
            )
            .sort((a: DashboardHoliday, b: DashboardHoliday) => {
              const dateA = new Date(a.date).getTime();
              const dateB = new Date(b.date).getTime();

              return dateA - dateB;
            })
        : [];

      setHolidays(holidayList);
      setHolidayIndex(0);
    } catch (error) {
      if (!cancelled) {
        console.error("Dashboard holidays load error:", error);
        setHolidays([]);
        setHolidayIndex(0);
      }
    } finally {
      if (!cancelled) {
        setHolidaysLoading(false);
      }
    }
  };

  void loadHolidays();

  const onWorkspaceChange = () => {
    void loadHolidays();
  };

  window.addEventListener(
    "workspace-changed",
    onWorkspaceChange
  );

  return () => {
    cancelled = true;

    window.removeEventListener(
      "workspace-changed",
      onWorkspaceChange
    );
  };
}, [orgId, orgReady]);


// ── holiday navigation ───────────────────────────────────────────────
const previousHoliday = () => {
  if (holidays.length === 0) return;

  setHolidayIndex((current) =>
    current === 0 ? holidays.length - 1 : current - 1
  );
};

const nextHoliday = () => {
  if (holidays.length === 0) return;

  setHolidayIndex((current) =>
    current === holidays.length - 1 ? 0 : current + 1
  );
};

  // ── render ────────────────────────────────────────────────────────────
  return (
   <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">

      {/* TOP NAVBAR */}
      <Navbar />

      {/* BODY */}
      <div className="flex h-full">

        {/* SIDEBAR */}
        <Sidebar />

        {/* MAIN CONTENT */}
        <div className="flex-1 min-h-0">
          <main className="flex-1 ml-0 lg:ml-72 mt-18 h-[calc(100vh-72px)] min-h-0 overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 px-4 py-5 sm:px-8 sm:py-8 dark:bg-slate-950 dark:text-slate-100">

            {/* ── ROW 1: STATS ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">

              <div className="dashboard-card min-h-[110px]">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Projects</p>
                    <h2 className="text-4xl font-bold text-slate-900 mt-1 dark:text-slate-100">{stats.totalProjects}</h2>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center dark:bg-blue-500/10">
    <FolderKanban className="text-blue-600 dark:text-blue-400" size={28} />
</div>

                </div>
              </div>

              <div className="dashboard-card min-h-[110px]">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Tasks</p>
                    <h2 className="text-4xl font-bold text-slate-900 mt-1 dark:text-slate-100">{stats.totalTasks}</h2>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center dark:bg-violet-500/10">
    <ClipboardList className="text-violet-600 dark:text-violet-400" size={28} />
</div>
                </div>
              </div>

              <div className="dashboard-card min-h-[110px]">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Team Members</p>
                    <h2 className="text-4xl font-bold text-slate-900 mt-1 dark:text-slate-100">{stats.totalMembers}</h2>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-cyan-100 flex items-center justify-center dark:bg-cyan-500/10">
    <Users className="text-cyan-600 dark:text-cyan-400" size={28} />
</div>
                </div>
              </div>

              <div className="dashboard-card min-h-[110px]">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Completion Rate</p>
                    <h2 className="text-4xl font-bold text-slate-900 mt-1 dark:text-slate-100">{stats.completionRate}%</h2>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center dark:bg-green-500/10">
    <CheckCircle2 className="text-green-600 dark:text-green-400" size={28} />
</div>
                </div>
              </div>

              {/* Holidays */}
              <div className="dashboard-card min-h-[110px]">
                <div className="flex h-full flex-col justify-between">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      Holidays
                    </p>

                    {holidays.length > 1 && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={previousHoliday}
                          aria-label="Previous holiday"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                        >
                          <span className="text-lg leading-none">‹</span>
                        </button>

                        <button
                          type="button"
                          onClick={nextHoliday}
                          aria-label="Next holiday"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                        >
                          <span className="text-lg leading-none">›</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Holiday Content */}
                  {holidaysLoading ? (
                    <div className="mt-2">
                      <p className="text-sm text-slate-400 dark:text-slate-500">
                        Loading...
                      </p>
                    </div>
                  ) : holidays.length === 0 ? (
                    <div className="mt-2">
                      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                        No Holidays
                      </h2>
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        No holidays added for this year
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 min-w-0">
                      <h2
                        className="truncate text-xl font-bold text-slate-900 dark:text-slate-100"
                        title={holidays[holidayIndex]?.name}
                      >
                        {holidays[holidayIndex]?.name}
                      </h2>

                      <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                        {new Date(
                          holidays[holidayIndex].date
                        ).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>

                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        {holidayIndex + 1} of {holidays.length}
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* ── ROW 2: TASK OVERVIEW + PROJECT PROGRESS + UPCOMING DEADLINES ── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">

              <div className="xl:col-span-1">
                <TaskOverview />
              </div>

              <div className="xl:col-span-1">
                <ProjectProgress />
              </div>

              <div className="xl:col-span-1 dashboard-widget">
                <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-800 dark:text-slate-100">
                  <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-500/10">
                    <Calendar size={18} className="text-blue-600 dark:text-blue-400" />
                  </span>
                  Upcoming Deadlines
                </h2>
                <div className="space-y-3 mt-5">
                  {deadlines.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 dark:text-slate-500">No upcoming deadlines</div>
                  ) : (
                    deadlines.map((task) => {
                      const dueDate  = new Date(task.dueDate!);
                      const daysLeft = Math.ceil(
                        (dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                      );
                      const href = taskLink(task);
                      return (
                        <div
                          key={task._id}
                          onClick={() => href && router.push(href)}
                          role={href ? "button" : undefined}
                          tabIndex={href ? 0 : undefined}
                          className={`flex items-center justify-between bg-slate-50 hover:bg-white transition-all p-5 rounded-2xl border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-800 ${
                            href ? "cursor-pointer hover:border-cyan-200 dark:hover:border-cyan-500/30" : ""
                          }`}
                        >
                          <div>
                            <h3 className="font-semibold text-slate-800 dark:text-slate-100">{task.title}</h3>
                            <p className="text-slate-500 text-sm dark:text-slate-400">
                              {task.project?.title || task.project?.name || "No Project"}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`px-3 py-1 rounded-full text-xs capitalize ${priorityClass(task.priority)}`}>
                              {task.priority || "medium"}
                            </span>
                            <p className={`text-xs mt-2 font-medium ${
                              daysLeft <= 2 ? "text-red-600 dark:text-red-400" : daysLeft <= 7 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400"
                            }`}>
                              {daysLeft <= 0 ? "Due today" : `${daysLeft}d left`}
                            </p>
                            <p className="text-slate-400 text-[10px] mt-0.5 dark:text-slate-500">
                              {dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

            {/* ── ROW 3: TEAM WORKLOAD + CALENDAR ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">


              {/* Team Workload */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-lg hover:shadow-xl transition-all duration-300 p-4 sm:p-6 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex flex-wrap justify-between items-center gap-2 mb-6">
                  <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-800 dark:text-slate-100">
                    <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-100 dark:bg-cyan-500/10">
                      <Gauge size={18} className="text-cyan-600 dark:text-cyan-400" />
                    </span>
                    Team Workload
                  </h2>
                  <button
                    onClick={() => router.push("/workload")}
                    className="text-blue-600 text-sm hover:text-blue-700 dark:text-cyan-400 dark:hover:text-cyan-300"
                  >
                    View All →
                  </button>
                </div>

                {/* Summary Cards */}

<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">

  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-center border border-slate-200 dark:border-slate-700 transition-all hover:shadow-md hover:-translate-y-1">
    <p className="text-xs text-slate-500">Avg Capacity</p>
    <h3 className="text-2xl font-bold text-cyan-600">
      {workloadSummary.averageCapacity}%
    </h3>
  </div>

  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-center border border-slate-200 dark:border-slate-700 transition-all hover:shadow-md hover:-translate-y-1">
    <p className="text-xs text-red-500">Overloaded</p>
    <h3 className="text-2xl font-bold text-red-600">
      {workloadSummary.overCapacity}
    </h3>
  </div>

  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-center border border-slate-200 dark:border-slate-700 transition-all hover:shadow-md hover:-translate-y-1">
    <p className="text-xs text-green-600">Available</p>
    <h3 className="text-2xl font-bold text-green-600">
      {workloadSummary.underCapacity}
    </h3>
  </div>

  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-center border border-slate-200 dark:border-slate-700 transition-all hover:shadow-md hover:-translate-y-1">
    <p className="text-xs text-blue-600">Members</p>
    <h3 className="text-2xl font-bold text-blue-600">
      {teamWorkload.length}
    </h3>
  </div>

</div>
                <div className="space-y-5">


<div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">

<div className="overflow-x-auto">
<div className="min-w-[560px]">

  {/* Header */}
  <div className="grid grid-cols-12 bg-slate-100 dark:bg-slate-800 px-5 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-700">

    <div className="col-span-5">Member</div>

    <div className="col-span-3 text-center">Allocated</div>

    <div className="col-span-2 text-center">Utilization</div>

    <div className="col-span-2 text-center">Status</div>

  </div>

  {/* 👇 Rows yahan aayengi */}

  {teamWorkload.slice(0, 4).map((member: any, index: number) => {

    const badgeColor =
      member.workloadStatus === "Available"
        ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400"
        : member.workloadStatus === "Healthy"
        ? "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400"
        : member.workloadStatus === "High Load"
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400"
        : "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400";

    return (
      <div
        key={member._id || index}
        className="grid grid-cols-12 items-center px-4 py-5 border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-cyan-300 dark:hover:border-cyan-600 hover:shadow-sm transition-all duration-200"
      >
        {/* Member */}
        <div className="col-span-5 flex items-center gap-3">
          <div className="relative">

  <UserAvatar
    name={member.username}
    color={member.avatarColor}
    seed={member._id}
    size={40}
  />

  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white dark:border-slate-900"></span>

</div>

        <div className="leading-tight">
            <p className="font-semibold text-[15px] text-slate-900 dark:text-white">
              {member.username}
            </p>

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {member.role}
            </p>
          </div>
        </div>

        {/* Allocated */}
        <div className="col-span-3 text-center">

  <p className="font-semibold text-slate-900 dark:text-white">
    {member.allocatedHours ?? member.totalHours}h
  </p>

  <p className="text-xs text-slate-500 dark:text-slate-400">
    Capacity {member.availableHours}h
  </p>

</div>

        {/* Utilization */}
        <div className="col-span-2 text-center">

  <span
    className={
      member.utilization > 150
        ? "font-bold text-red-600"
        : member.utilization > 100
        ? "font-bold text-yellow-600"
        : "font-bold text-green-600"
    }
  >
    {member.utilization}%
  </span>

</div>
        {/* Status */}
        <div className="col-span-2 flex justify-center">
         <span
  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold shadow-sm ${badgeColor}`}
>

  {member.workloadStatus === "Overloaded" ? (

    <AlertTriangle size={12} />

  ) : member.workloadStatus === "High Load" ? (

    <AlertTriangle size={12} />

  ) : (

    <Circle size={8} fill="currentColor" />

  )}

  {member.workloadStatus}

</span>
        </div>
      </div>
       );

})}

</div>
</div>

<div className="flex flex-wrap justify-center gap-4 sm:gap-6 py-4 border-t border-slate-200 dark:border-slate-700 text-xs">

  <div className="flex items-center gap-2">
    <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
    Available
  </div>

  <div className="flex items-center gap-2">
    <div className="w-3 h-3 rounded-full bg-green-500"></div>
    Healthy
  </div>

  <div className="flex items-center gap-2">
    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
    High Load
  </div>

  <div className="flex items-center gap-2">
    <div className="w-3 h-3 rounded-full bg-red-500"></div>
    Overloaded
  </div>

</div>

</div>

</div>
              </div>

              {/* CALENDAR */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 dark:bg-slate-900 dark:border-slate-800">

                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                  <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-800 dark:text-slate-100">
                    <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-500/10">
                      <CalendarDays size={18} className="text-violet-600 dark:text-violet-400" />
                    </span>
                    {CAL_MONTHS[calMonth]} {calYear}
                  </h2>
                  <div className="flex gap-4">
                    <button onClick={calPrevMonth} className="text-slate-400 hover:text-slate-700 transition-colors text-lg dark:text-slate-500 dark:hover:text-slate-300">‹</button>
                    <button onClick={calNextMonth} className="text-slate-400 hover:text-slate-700 transition-colors text-lg dark:text-slate-500 dark:hover:text-slate-300">›</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                  {/* LEFT: calendar grid */}
                  <div className="relative">
                    {calLoading && (
                      <div className="absolute inset-0 bg-white/70 rounded-2xl flex items-center justify-center z-10 dark:bg-slate-900/70">
                        <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}

                    {/* Day headers */}
                    <div className="grid grid-cols-7 gap-1 text-center text-sm mb-1">
                      {CAL_DAYS.map((d, i) => (
                        <div key={i} className="text-slate-400 text-xs py-1 dark:text-slate-500">{d}</div>
                      ))}
                    </div>

                    {/* Day cells */}
                    <div className="grid grid-cols-7 gap-1 text-center text-sm">
                      {calCells.map((day, i) => {
                        if (!day) return <div key={i} />;
                        const key        = calToKey(calYear, calMonth, day);
                        const isToday    = key === calTodayKey;
                        const isSelected = key === calSelectedDate;
                        const dayEvents = calEventMap[key] || [];
                        const dayHolidays = calHolidayMap[key] || [];
                        const hasEvents = dayEvents.length > 0;
                        const hasHoliday = dayHolidays.length > 0;
                        return (
                          <div
                            key={i}
                            onClick={() => setCalSelectedDate(isSelected ? null : key)}
                            className="relative flex flex-col items-center justify-center cursor-pointer group"
                          >
                            <div
  className={`w-8 h-8 flex items-center justify-center rounded-full font-semibold text-xs transition-all ${
    isSelected
      ? "bg-cyan-500 text-white"
      : isToday
      ? "bg-purple-600 text-white"
      : hasHoliday
      ? "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400"
      : "text-slate-600 group-hover:bg-slate-100 dark:text-slate-300 dark:group-hover:bg-slate-800"
  }`}
>
  {day}
</div>

{(hasEvents || hasHoliday) && (
  <div className="flex items-center gap-0.5 mt-0.5">
    {hasHoliday && (
      <span
        className="w-1.5 h-1.5 rounded-full bg-orange-500"
        title={dayHolidays.map((h) => h.name).join(", ")}
      />
    )}

    {dayEvents.slice(0, 2).map((e, idx) => (
      <span
        key={idx}
        className={`w-1 h-1 rounded-full ${calTypeDot(e.type)}`}
      />
    ))}
  </div>
)}


                            {hasEvents && (
                              <div className="flex gap-0.5 mt-0.5">
                                {dayEvents.slice(0, 3).map((e, idx) => (
                                  <span key={idx} className={`w-1 h-1 rounded-full ${calTypeDot(e.type)}`} />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* RIGHT: Today's Tasks + Selected Date Dialog */}
                  <div className="flex flex-col gap-4">

                    <div>
                      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Today's Tasks</h3>
                      {calTodayTasks.length === 0 ? (
                        <p className="text-slate-400 dark:text-slate-500">No Tasks Found</p>
                      ) : (
                        <div className="space-y-3">
                          {calTodayTasks.map((task) => (
                            <div key={task._id} className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-slate-800 dark:text-slate-100">{task.title}</p>
                                {task.assignees.length > 0 && (
                                  <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {task.assignees.map((a: { username: string }) => a.username).join(", ")}
                                  </p>
                                )}
                              </div>
                              <span className="text-blue-600 text-sm dark:text-cyan-400">{task.time}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Selected date dialog */}
                    {calSelectedDate && (
                      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {new Date(calSelectedDate + "T12:00:00").toLocaleDateString("en-US", {
                              weekday: "short", month: "short", day: "numeric",
                            })}
                          </h3>
                          <button
                            onClick={() => setCalSelectedDate(null)}
                            className="text-xl font-bold text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
                          >
                            ✕
                          </button>
                        </div>
                        {calSelectedHolidays.length === 0 &&
calSelectedEvents.length === 0 ? (
  <p className="text-slate-400 text-xs dark:text-slate-500">
    No events or holidays on this day.
  </p>
) : (
  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">

    {/* Organization Holidays */}
    {calSelectedHolidays.map((holiday) => (
      <div
        key={`holiday-${holiday._id}`}
        className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-2 dark:border-orange-500/20 dark:bg-orange-500/10"
      >
        <span className="w-2 h-2 rounded-full bg-orange-500 mt-1 shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-orange-700 dark:text-orange-400">
            {holiday.name}
          </p>

          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-orange-600 dark:text-orange-400">
              Organization Holiday
            </span>

            {holiday.source && (
              <span className="text-[10px] capitalize px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400">
                {holiday.source === "calendarific"
                  ? "Public Holiday"
                  : "Custom"}
              </span>
            )}
          </div>

          {holiday.description && (
            <p className="text-[10px] text-slate-500 mt-1 dark:text-slate-400">
              {holiday.description}
            </p>
          )}
        </div>
      </div>
    ))}

    {/* Normal Calendar Events */}
    {calSelectedEvents.map((e) => (
      <div
        key={e._id}
        className={`flex items-start gap-2 p-2 rounded-lg ${
          e.type === "task"
            ? "bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20"
            : e.type === "meeting"
            ? "bg-green-50 border border-green-200 dark:bg-green-500/10 dark:border-green-500/20"
            : e.type === "reminder"
            ? "bg-red-50 border border-red-200 dark:bg-red-500/10 dark:border-red-500/20"
            : "bg-orange-50 border border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/20"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full mt-1 shrink-0 ${calTypeDot(e.type)}`}
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 truncate dark:text-slate-100">
            {e.title}
          </p>

          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-slate-500 text-[10px] dark:text-slate-400">
              {e.time}
            </span>

            <span
              className={`text-[10px] capitalize px-1.5 py-0.5 rounded-full ${
                e.type === "task"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                  : e.type === "meeting"
                  ? "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                  : e.type === "reminder"
                  ? "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                  : "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400"
              }`}
            >
              {e.type}
            </span>
          </div>

          {e.assignees.length > 0 && (
            <p className="text-[10px] text-slate-400 mt-0.5 truncate dark:text-slate-500">
              {e.assignees
                .map(
                  (a: { username: string }) =>
                    a.username
                )
                .join(", ")}
            </p>
          )}
        </div>
      </div>
    ))}
  </div>
)}

                                                </div>
                    )}

                  </div>
                </div>

                {/* ── LOWER CALENDAR INFORMATION ──────────────────────────── */}
                <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* LEFT COLUMN: Today's Events + Today's Holidays */}
                    <div className="min-w-0">

                      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-3">
                        Today's Events
                      </h3>

                      {calTodayEvents.length === 0 ? (
                        <p className="text-slate-400 text-sm dark:text-slate-500">
                          No events today.
                        </p>
                      ) : (
                        <div className="max-h-56 overflow-y-auto pr-2 space-y-4">
                          {calTodayEvents.map((e) => (
                            <div key={e._id} className="flex items-center gap-3">
                              <div
                                className={`w-3 h-3 rounded-full shrink-0 ${calTypeDot(e.type)}`}
                              />
                              <span className="text-slate-700 dark:text-slate-200">
                                {e.time} - {e.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Today's Holidays — hidden when there is no holiday */}
                      {calInfoHolidays.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">

                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-orange-700 dark:text-orange-400">
                              Today's Holidays
                            </h4>

                            <span className="text-[10px] px-2 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400">
                              {calInfoHolidays.length}
                            </span>
                          </div>

                          <div className="max-h-40 overflow-y-auto pr-2 space-y-2">
                            {calInfoHolidays.map((holiday) => (
                              <div
                                key={`calendar-holiday-${holiday._id}`}
                                className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/20 dark:bg-orange-500/10"
                              >
                                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 mt-1 shrink-0" />

                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                                    {holiday.name}
                                  </p>

                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className="text-[10px] text-orange-600 dark:text-orange-400">
                                      Organization Holiday
                                    </span>

                                    {holiday.source && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400">
                                        {holiday.source === "calendarific"
                                          ? "Public Holiday"
                                          : "Custom"}
                                      </span>
                                    )}
                                  </div>

                                  {holiday.description && (
                                    <p className="text-[10px] text-slate-500 mt-1 dark:text-slate-400">
                                      {holiday.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                        </div>
                      )}

                    </div>

                    {/* RIGHT COLUMN: On Leave */}
                    <div className="min-w-0">

                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                          On Leave
                        </h3>

                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {calSelectedDate
                            ? new Date(
                                calSelectedDate + "T12:00:00"
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : "Today"}
                        </span>
                      </div>

                      {calendarOnLeaveLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : calendarOnLeave.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center dark:border-slate-800 dark:bg-slate-900/50">
                          <CalendarOff
                            size={22}
                            className="mx-auto mb-2 text-slate-400 dark:text-slate-500"
                          />
                          <p className="text-sm text-slate-400 dark:text-slate-500">
                            No one is on leave
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 dark:text-slate-500">
                            for this date
                          </p>
                        </div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto pr-2 space-y-2.5">
                          {calendarOnLeave.map((entry) => (
                            <div
                              key={`${entry.userId}-${entry.startDate}`}
                              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-900"
                            >
                              <UserAvatar
                                name={entry.username}
                                color={entry.avatarColor}
                                seed={entry.userId}
                                size={34}
                              />

                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-slate-800 truncate dark:text-slate-100">
                                  {entry.username || "Unknown User"}
                                </p>

                                <p className="text-[10px] text-orange-600 dark:text-orange-400">
                                  {entry.leaveType}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                    </div>

                  </div>

                </div>


              </div>
            </div>

            {/* ── ROW 4: NOTIFICATIONS + MISSED DEADLINES ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

              {/* NOTIFICATIONS */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-800 dark:text-slate-100">
                    <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/10">
                      <Bell size={18} className="text-amber-600 dark:text-amber-400" />
                    </span>
                    Unread Notifications
                  </h2>
                  <Link href="/inbox" className="text-blue-600 hover:text-blue-700 dark:text-cyan-400 dark:hover:text-cyan-300">View All →</Link>
                </div>
                <div className="space-y-3 ">
                  {notifications.length === 0 ? (
                    <div className="text-slate-400 dark:text-slate-500">No Notifications</div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n._id}
                        onClick={() => handleNotificationClick(n)}
                        role="button"
                        tabIndex={0}
                        className="bg-slate-50 p-5 rounded-2xl border border-slate-200 hover:bg-white hover:border-cyan-200 transition-all cursor-pointer dark:bg-slate-800 dark:border-slate-800 dark:hover:bg-slate-700 dark:hover:border-cyan-500/30"
                      >
                        <h3 className="text-blue-600 font-semibold dark:text-cyan-400">{n.title}</h3>
                        <p className="text-sm text-slate-500 mt-2 dark:text-slate-400">{n.message}</p>
                        <p className="text-xs text-slate-400 mt-2 dark:text-slate-500">
                          {new Date(n.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* MISSED DEADLINES — new module, calls /dashboard/missed-deadlines */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-800 dark:text-slate-100">
                    <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-100 dark:bg-red-500/10">
                      <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
                    </span>
                    Missed Deadlines
                  </h2>
                  {missedDeadlines.length > 0 && (
                    <span className="bg-red-100 text-red-700 text-xs px-3 py-1 rounded-full font-semibold dark:bg-red-500/10 dark:text-red-400">
                      {missedDeadlines.length} overdue
                    </span>
                  )}
                </div>

                {missedLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : missedDeadlines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <span className="text-3xl">🎉</span>
                    <p className="text-slate-400 text-sm dark:text-slate-500">No missed deadlines!</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {missedDeadlines.map((task) => {
                      const dueDate  = new Date(task.dueDate!);
                      const daysAgo  = Math.ceil(
                        (Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
                      );
                      const href = taskLink(task);
                      return (
                        <div
                          key={task._id}
                          onClick={() => href && router.push(href)}
                          role={href ? "button" : undefined}
                          tabIndex={href ? 0 : undefined}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-6 rounded-2xl border border-red-200 hover:border-red-300 transition-colors dark:bg-slate-900 dark:border-red-500/30 dark:hover:border-red-500/50 ${
                            href ? "cursor-pointer" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1 sm:mr-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                              <h3 className="text-xl font-bold text-slate-800 truncate dark:text-slate-100">{task.title}</h3>
                            </div>
                            <p className="text-slate-500 text-sm mt-0.5 ml-4 truncate dark:text-slate-400">
                              {task.project?.title || task.project?.name || "No Project"}
                            </p>
                          </div>
                          <div className="sm:text-right shrink-0">
                            <span className={`px-2 py-1 rounded-full text-xs capitalize ${priorityClass(task.priority)}`}>
                              {task.priority || "medium"}
                            </span>
                            <p className="text-red-600 text-xs mt-1 font-medium dark:text-red-400">
                              {daysAgo === 0 ? "Due today" : `${daysAgo}d overdue`}
                            </p>
                            <p className="text-slate-400 text-[10px] mt-0.5 dark:text-slate-500">
                              {dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* ── ROW 5: ON LEAVE ── */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 mb-6 dark:bg-slate-900 dark:border-slate-800">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-800 mb-5 dark:text-slate-100">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-500/10">
                  <CalendarOff size={18} className="text-orange-600 dark:text-orange-400" />
                </span>
                On Leave
              </h2>
              {onLeaveLoading ? (
                <p className="text-slate-400 text-sm dark:text-slate-500">Loading…</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-500 mb-3 dark:text-slate-400">Today</h3>
                    {todayOnLeave.length === 0 ? (
                      <p className="text-slate-400 text-sm dark:text-slate-500">No one is on leave today.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {todayOnLeave.map((entry) => (
                          <div key={entry.userId} className="flex items-center gap-2.5">
                            <UserAvatar name={entry.username} color={entry.avatarColor} seed={entry.userId} size={32} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate dark:text-slate-100">{entry.username}</p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">{entry.leaveType}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-500 mb-3 dark:text-slate-400">Upcoming (next 7 days)</h3>
                    {upcomingOnLeave.length === 0 ? (
                      <p className="text-slate-400 text-sm dark:text-slate-500">No upcoming leaves.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {upcomingOnLeave.map((entry) => (
                          <div key={entry.userId} className="flex items-center gap-2.5">
                            <UserAvatar name={entry.username} color={entry.avatarColor} seed={entry.userId} size={32} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate dark:text-slate-100">{entry.username}</p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                {entry.leaveType} · from {new Date(entry.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </main>
        </div>
        </div>
      </div>
  );
}
