const Organization = require("../models/Organization");
const Project = require("../models/Project");
const Task = require("../models/Task");
const LeaveRequest = require("../models/LeaveRequest");
const User = require("../models/user");
const Notification = require("../models/Notification");
const { buildProjectListFilter } = require("../utils/projectAccess");
const {
  startOfToday,
  openTaskFilter,
  getAccessibleProjectIds,
  ACTIVE_TASK_FILTER,
  buildAssignedActiveTaskFilter,
  COMPLETED_STATUS,
} = require("../utils/taskQueries");
const mongoose = require("mongoose");

function getPeriodStart(period) {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start;
}

function deriveProjectStatus(progress, overdue, totalTasks) {
  if (totalTasks === 0) return "On Track";
  if (overdue > 0 && progress < 50) return "Delayed";
  if (progress >= 80 && overdue === 0) return "On Track";
  if (progress >= 50 || overdue === 0) return "At Risk";
  return "Delayed";
}

function toLocalDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function normalizeDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWorkingDays(start, end) {
  const days = [];

  let current = normalizeDate(start);
  const last = normalizeDate(end);

  while (current <= last) {
    if (!isWeekend(current)) {
      days.push(new Date(current));
    }

    current.setDate(current.getDate() + 1);
  }

  return days;
}

async function getDashboardStatsData(userId, query) {
    const { organizationId, personal, allOrgProjects } = query;

    const result = await buildProjectListFilter(userId, {
      organizationId,
      personal,
      allOrgProjects,
    });

    if (result.error) {
      throw Object.assign(new Error(result.error.message), {
        status: result.error.status,
      });
    }

    const filter = result.filter;

    // Parallel: project count + ids, optional member count, task stats via $facet
    const orgObjectId =
      organizationId && mongoose.Types.ObjectId.isValid(organizationId)
        ? new mongoose.Types.ObjectId(organizationId)
        : null;

    const [totalProjects, projects, orgMemberAgg] = await Promise.all([
      Project.countDocuments(filter),
      Project.find(filter, "_id").lean(),
      orgObjectId
        ? Organization.aggregate([
            { $match: { _id: orgObjectId } },
            {
              $project: {
                totalMembers: { $size: { $ifNull: ["$members", []] } },
              },
            },
          ])
        : Promise.resolve([]),
    ]);

    const projectIds = projects.map((p) => p._id);
    const totalMembers = orgMemberAgg[0]?.totalMembers || 0;

    let totalTasks = 0;
    let inactiveTasks = 0;
    let completedTasks = 0;

    if (projectIds.length > 0) {
      const [stats] = await Task.aggregate([
        { $match: { project: { $in: projectIds } } },
        {
          $facet: {
            total: [
              { $match: { ...ACTIVE_TASK_FILTER } },
              { $count: "n" },
            ],
            inactive: [{ $match: { isActive: false } }, { $count: "n" }],
            completed: [
              {
                $match: {
                  status: "completed",
                  ...ACTIVE_TASK_FILTER,
                },
              },
              { $count: "n" },
            ],
          },
        },
      ]);

      totalTasks = stats?.total[0]?.n || 0;
      inactiveTasks = stats?.inactive[0]?.n || 0;
      completedTasks = stats?.completed[0]?.n || 0;
    }

    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      totalProjects,
      totalTasks,
      inactiveTasks,
      totalMembers,
      completionRate,
    };
}

const getDashboardStats = async (req, res) => {
  try {
    res.status(200).json(await getDashboardStatsData(req.user._id, req.query));
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Failed to fetch dashboard stats",
      error: error.message,
    });
  }
};
const getTaskOverview = async (req, res) => {
  try {
    const { organizationId, personal } = req.query;

    const projectFilter = {
      "members.user": new mongoose.Types.ObjectId(req.user._id),
      isDeleted: { $ne: true },
    };

    if (organizationId) {
      projectFilter.organization = new mongoose.Types.ObjectId(organizationId);
    } else if (personal === "true") {
      projectFilter.organization = null;
    }

    // Projects + one $group by status (was 1 + 4 + N countDocuments)
    const projects = await Project.find(projectFilter, "_id customStatuses").lean();
    const projectIds = projects.map((p) => p._id);

    const customStatusMap = {};
    for (const project of projects) {
      for (const cs of project.customStatuses || []) {
        if (!customStatusMap[cs.id]) {
          customStatusMap[cs.id] = cs.label;
        }
      }
    }

    if (projectIds.length === 0) {
      return res.json({
        completed: 0,
        inProgress: 0,
        review: 0,
        todo: 0,
        totalTasks: 0,
        customStatuses: Object.entries(customStatusMap).map(([id, label]) => ({
          id,
          label,
          count: 0,
        })),
      });
    }

    const statusCounts = await Task.aggregate([
      {
        $match: {
          project: { $in: projectIds },
          ...ACTIVE_TASK_FILTER,
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const countByStatus = Object.fromEntries(
      statusCounts.map((row) => [row._id, row.count])
    );

    const completed = countByStatus.completed || 0;
    const inProgress = countByStatus["in-progress"] || 0;
    const todo = countByStatus.todo || 0;
    const review = countByStatus.review || 0;

    const customStatuses = Object.entries(customStatusMap).map(([id, label]) => ({
      id,
      label,
      count: countByStatus[id] || 0,
    }));

    const totalTasks =
      completed +
      inProgress +
      todo +
      review +
      customStatuses.reduce((sum, cs) => sum + cs.count, 0);

    res.json({
      completed,
      inProgress,
      review,
      todo,
      totalTasks,
      customStatuses,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getProjectProgress = async (req, res) => {
  try {
    const { organizationId, personal } = req.query;

    const projectFilter = {
      "members.user": new mongoose.Types.ObjectId(req.user._id),
      isDeleted: { $ne: true },
    };

    if (organizationId) {
      projectFilter.organization = new mongoose.Types.ObjectId(organizationId);
    } else if (personal === "true") {
      projectFilter.organization = null;
    }

    // One aggregation: projects → task progress (was N+1 queries)
    const progressData = await Project.aggregate([
      { $match: projectFilter },
      {
        $lookup: {
          from: "tasks",
          let: { pid: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$project", "$$pid"] },
                ...ACTIVE_TASK_FILTER,
              },
            },
            {
              $project: {
                weight: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $in: [
                            { $toLower: { $ifNull: ["$status", ""] } },
                            ["completed", "done"],
                          ],
                        },
                        then: 100,
                      },
                      {
                        case: {
                          $eq: [
                            { $toLower: { $ifNull: ["$status", ""] } },
                            "review",
                          ],
                        },
                        then: 80,
                      },
                      {
                        case: {
                          $eq: [
                            { $toLower: { $ifNull: ["$status", ""] } },
                            "in-progress",
                          ],
                        },
                        then: 50,
                      },
                    ],
                    default: 0,
                  },
                },
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                sum: { $sum: "$weight" },
              },
            },
          ],
          as: "stats",
        },
      },
      {
        $addFields: {
          total: { $ifNull: [{ $arrayElemAt: ["$stats.total", 0] }, 0] },
          sum: { $ifNull: [{ $arrayElemAt: ["$stats.sum", 0] }, 0] },
        },
      },
      { $match: { total: { $gt: 0 } } },
      {
        $project: {
          _id: 0,
          projectId: { $toString: "$_id" },
          projectName: "$title",
          progress: {
            $round: [{ $divide: ["$sum", "$total"] }, 0],
          },
        },
      },
    ]);

    res.json(progressData);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

async function getTeamWorkloadData(query) {
  const { projectId, organizationId, role, status } = query;

  const rangeStart = query.startDate
    ? new Date(query.startDate)
    : new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  const rangeEnd = query.endDate
    ? new Date(query.endDate)
    : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  if (
    Number.isNaN(rangeStart.getTime()) ||
    Number.isNaN(rangeEnd.getTime()) ||
    rangeEnd < rangeStart
  ) {
    throw Object.assign(
      new Error("Valid startDate and endDate are required"),
      { status: 400 }
    );
  }

  let users = [];
  let effectiveOrganizationId = null;
  let project = null;
  let useProjectScope = false;

  if (projectId) {
    project = await Project.findById(projectId).populate(
      "members.user",
      "username email designation role avatarColor"
    );

    if (project) {
      const projectOrgId = project.organization?.toString() || null;
      const requestedOrgId = organizationId?.toString() || null;

      if (!requestedOrgId || projectOrgId === requestedOrgId) {
        useProjectScope = true;
        users = project.members
          .filter((m) => m.user)
          .map((m) => ({
            ...m.user.toObject(),
            organizationRole: m.role,
          }));
        effectiveOrganizationId = project.organization || null;
      }
    }
  }

  if (!useProjectScope && organizationId) {
    const organization = await Organization.findById(organizationId).populate(
      "members.user",
      "username email designation role avatarColor"
    );

    if (!organization) {
      throw Object.assign(new Error("Organization not found"), { status: 404 });
    }

    users = organization.members
      .filter((m) => m.user)
      .map((m) => ({
        ...m.user.toObject(),
        organizationRole: m.role,
      }));
    effectiveOrganizationId = organization._id;
  } else if (!useProjectScope) {
    throw Object.assign(new Error("projectId or organizationId is required"), {
      status: 400,
    });
  }

  const availableRoles = [
    ...new Set(users.map((u) => u.organizationRole).filter(Boolean)),
  ];

  if (role && role !== "All") {
    users = users.filter((u) => {
      const userRole = (u.organizationRole || "developer").toLowerCase().trim();
      return userRole === role.toLowerCase().trim();
    });
  }

  if (users.length === 0) {
    return {
      members: [],
      totalMembers: 0,
      averageCapacity: 0,
      overCapacity: 0,
      underCapacity: 0,
      availableRoles,
    };
  }

  const workload = await Promise.all(
    users.map(async (user) => {
      const taskFilter = {
        organization: effectiveOrganizationId,
        isDeleted: { $ne: true },
        $or: [{ assignee: user._id }, { assignees: user._id }],
      };

      if (project?._id) {
        taskFilter.project = project._id;
      }

      if (status && status !== "All") {
        taskFilter.status = status;
      }

      const tasks = await Task.find(taskFilter)
        .select(
          "title status priority effortHours startDate dueDate project assignees assignee"
        )
        .lean();

      const leaves = await LeaveRequest.find({
        employee: user._id,
        organization: effectiveOrganizationId,
        status: "approved",
        startDate: { $lte: rangeEnd },
        endDate: { $gte: rangeStart },
      })
        .select("startDate endDate leaveType reason status")
        .lean();

      const assignedTasks = tasks.length;

      const completedTasks = tasks.filter(
        (task) => task.status === "completed" || task.status === "done"
      ).length;

      const totalHours = tasks.reduce((sum, task) => {
        const effort = task.effortHours != null ? Number(task.effortHours) : 0;
        return sum + effort;
      }, 0);

      const totalDays =
        Math.floor((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)) + 1;
      const dailyWorkload = new Array(Math.max(totalDays, 0)).fill(0);
      const taskTimeline = [];

      tasks.sort((a, b) => {
        const aStart = a.startDate
          ? new Date(a.startDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bStart = b.startDate
          ? new Date(b.startDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        return aStart - bStart;
      });

      tasks.forEach((task) => {
        if (!task.startDate || !task.dueDate) return;

        const start = new Date(task.startDate);
        const end = new Date(task.dueDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        const effort = Number(task.effortHours || 0);
        const workingDays = getWorkingDays(start, end);
        const hoursPerDay =
          workingDays.length > 0 ? effort / workingDays.length : 0;

        const startIndex = Math.max(
          0,
          Math.floor(
            (start.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
          )
        );

        const endIndex = Math.min(
          totalDays - 1,
          Math.floor(
            (end.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
          )
        );

        taskTimeline.push({
          _id: task._id,
          project: task.project,
          title: task.title,
          startDate: task.startDate,
          dueDate: task.dueDate,
          startIndex,
          endIndex,
          effortHours: effort,
          hoursPerDay: Number(hoursPerDay.toFixed(1)),
          priority: task.priority,
          status: task.status,
        });

        for (
          let currentDay = new Date(start);
          currentDay <= end;
          currentDay.setDate(currentDay.getDate() + 1)
        ) {
          const index = Math.floor(
            (currentDay.getTime() - rangeStart.getTime()) /
              (1000 * 60 * 60 * 24)
          );
          if (currentDay.getDay() === 0 || currentDay.getDay() === 6) continue;
          if (index < 0 || index >= dailyWorkload.length) continue;

          const normalizedCurrentDay = normalizeDate(currentDay);
          const isOnLeave = leaves.some((leave) => {
            const leaveStart = normalizeDate(leave.startDate);
            const leaveEnd = normalizeDate(leave.endDate);
            return (
              normalizedCurrentDay >= leaveStart &&
              normalizedCurrentDay <= leaveEnd
            );
          });

          if (isOnLeave) continue;
          dailyWorkload[index] += hoursPerDay;
        }
      });

      const completion =
        assignedTasks === 0
          ? 0
          : Math.round((completedTasks / assignedTasks) * 100);

      const workingDays = getWorkingDays(rangeStart, rangeEnd);

      let leaveDays = 0;
      workingDays.forEach((day) => {
        const onLeave = leaves.some((leave) => {
          const start = normalizeDate(leave.startDate);
          const end = normalizeDate(leave.endDate);
          return day >= start && day <= end;
        });
        if (onLeave) leaveDays++;
      });

      const availableHours = (workingDays.length - leaveDays) * 8;
      const availableWorkingDays = workingDays.length - leaveDays;
      const allocatedHours = dailyWorkload.reduce((sum, h) => sum + h, 0);

      const utilization =
        availableHours === 0
          ? 0
          : Math.round((allocatedHours / availableHours) * 100);

      const remainingCapacity = availableHours - allocatedHours;

      let workloadStatus = "Available";
      if (utilization > 150) workloadStatus = "Overloaded";
      else if (utilization > 100) workloadStatus = "High Load";
      else if (utilization >= 70) workloadStatus = "Healthy";

      const capacityPercentage =
        availableHours === 0
          ? 0
          : Math.min(Math.round((totalHours / availableHours) * 100), 999);

      return {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatarColor: user.avatarColor || null,
        role: user.organizationRole || "developer",
        assignedTasks,
        completedTasks,
        totalHours,
        allocatedHours,
        availableHours,
        availableWorkingDays,
        utilization,
        remainingCapacity,
        workloadStatus,
        capacityPercentage,
        completion,
        workload: dailyWorkload.map((h) => Math.round(h)),
        tasks: taskTimeline,
        leaves,
      };
    })
  );

  const totalMembers = workload.length;

  const memberCapacities = workload.map((member) => {
    const maxDailyHours = Math.max(...member.workload, 0);
    return Math.min(Math.round((maxDailyHours / 8) * 100), 100);
  });

  const averageCapacity =
    totalMembers === 0
      ? 0
      : Math.round(
          memberCapacities.reduce((a, b) => a + b, 0) / totalMembers
        );

  const overCapacity = workload.filter((member) =>
    member.workload.some((h) => h > 8)
  ).length;

  const underCapacity = workload.filter((member) => {
    const maxDailyHours = Math.max(...member.workload, 0);
    return maxDailyHours < 8;
  }).length;

  return {
    members: workload,
    availableRoles,
    totalMembers,
    averageCapacity,
    overCapacity,
    underCapacity,
  };
}


const getTeamWorkload = async (req, res) => {
  try {
    res.json(await getTeamWorkloadData(req.query));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      message: error.message,
    });
  }
};

async function fetchDeadlineTasks({
  userId,
  organizationId,
  personal,
  dueDateFilter,
  limit,
}) {
  const projectResult = await getAccessibleProjectIds(userId, {
    organizationId,
    personal,
  });

  if (projectResult.error) {
    return { error: projectResult.error };
  }

  if (!projectResult.ids.length) {
    return { data: [] };
  }

  const data = await Task.aggregate([
    {
      $match: {
        project: { $in: projectResult.ids },
        dueDate: dueDateFilter,
        ...openTaskFilter(),
      },
    },
    { $sort: { dueDate: 1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "projects",
        localField: "project",
        foreignField: "_id",
        pipeline: [{ $project: { title: 1 } }],
        as: "_project",
      },
    },
    {
      $addFields: {
        project: { $arrayElemAt: ["$_project", 0] },
      },
    },
    { $project: { _project: 0, __v: 0 } },
  ]);

  return { data };
}

const getUpcomingDeadlines = async (req, res) => {
  try {
    const { organizationId, personal } = req.query;
    const today = startOfToday();

    const result = await fetchDeadlineTasks({
      userId: req.user._id,
      organizationId,
      personal,
      dueDateFilter: { $ne: null, $gte: today },
      limit: 5,
    });

    if (result.error) {
      return res
        .status(result.error.status)
        .json({ message: result.error.message });
    }

    res.json(result.data);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getMissedDeadlines = async (req, res) => {
  try {
    const { organizationId, personal } = req.query;
    const today = startOfToday();

    const result = await fetchDeadlineTasks({
      userId: req.user._id,
      organizationId,
      personal,
      dueDateFilter: { $ne: null, $lt: today },
      limit: 10,
    });

    if (result.error) {
      return res
        .status(result.error.status)
        .json({ message: result.error.message });
    }

    res.json(result.data);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getProjectBreakdown = async (req, res) => {
  try {
    const {
      organizationId,
      personal,
      period = "30d",
      projectId,
      allOrgProjects,
    } = req.query;

    const result = await buildProjectListFilter(req.user._id, {
      organizationId,
      personal,
      allOrgProjects,
    });

    if (result.error) {
      return res
        .status(result.error.status)
        .json({ message: result.error.message });
    }

    const projectFilter = { ...result.filter };
    if (projectId) {
      projectFilter._id = projectId;
    }

    const projects = await Project.find(projectFilter).select("_id title").lean();
    const periodStart = getPeriodStart(period);
    const today = startOfToday();

    const breakdown = await Promise.all(
      projects.map(async (project) => {
        const baseQuery = {
          project: project._id,
          ...ACTIVE_TASK_FILTER,
          updatedAt: { $gte: periodStart },
        };

        const [tasks, done, overdue] = await Promise.all([
          Task.countDocuments(baseQuery),
          Task.countDocuments({ ...baseQuery, status: COMPLETED_STATUS }),
          Task.countDocuments({
            ...baseQuery,
            status: { $ne: COMPLETED_STATUS },
            dueDate: { $ne: null, $lt: today },
          }),
        ]);

        const progress = tasks > 0 ? Math.round((done / tasks) * 100) : 0;

        return {
          _id: project._id,
          name: project.title,
          progress,
          tasks,
          done,
          pending: Math.max(0, tasks - done - overdue),
          overdue,
          status: deriveProjectStatus(progress, overdue, tasks),
        };
      })
    );

    breakdown.sort((a, b) => b.progress - a.progress);
    res.json(breakdown);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTeamPerformance = async (req, res) => {
  try {
    const {
      organizationId,
      personal,
      period = "30d",
      projectId,
      allOrgProjects,
    } = req.query;

    const projectResult = await getAccessibleProjectIds(req.user._id, {
      organizationId,
      personal,
      allOrgProjects,
    });

    if (projectResult.error) {
      return res
        .status(projectResult.error.status)
        .json({ message: projectResult.error.message });
    }

    let projectIds = projectResult.ids;

    if (projectId) {
      const id = projectId.toString();
      projectIds = projectIds.filter(
        (pid) => pid.toString() === id
      );
    }

    if (!projectIds.length) {
      return res.json([]);
    }

    const periodStart = getPeriodStart(period);
    const today = startOfToday();

    const stats = await Task.aggregate([
      {
        $match: {
          project: { $in: projectIds },
          ...ACTIVE_TASK_FILTER,
          assignee: { $ne: null },
          updatedAt: { $gte: periodStart },
        },
      },
      {
        $group: {
          _id: "$assignee",
          completed: {
            $sum: {
              $cond: [
                { $eq: ["$status", COMPLETED_STATUS] },
                1,
                0,
              ],
            },
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", COMPLETED_STATUS] },
                    { $ne: ["$dueDate", null] },
                    { $lt: ["$dueDate", today] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          total: {
            $sum: 1,
          },
        },
      },
    ]);

    const users = await User.find({
      _id: { $in: stats.map((entry) => entry._id) },
    })
      .select("username")
      .lean();

    const userMap = new Map(
      users.map((user) => [
        user._id.toString(),
        user.username,
      ])
    );

    const team = stats.map((entry) => {
      const completed = entry.completed;
      const overdue = entry.overdue;

      const pending = Math.max(
        0,
        entry.total - completed - overdue
      );

      const total =
        completed +
        pending +
        overdue || 1;

      return {
        _id: entry._id,
        name:
          userMap.get(entry._id.toString()) ||
          "Unknown",
        completed,
        pending,
        overdue,
        efficiency: Math.round(
          (completed / total) * 100
        ),
      };
    });

    team.sort((a, b) => b.completed - a.completed);

    res.json(team);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getWeeklyTaskActivity = async (req, res) => {
  try {
    const {
      organizationId,
      personal,
      period = "7d",
      projectId,
      allOrgProjects,
    } = req.query;

    const projectResult = await getAccessibleProjectIds(req.user._id, {
      organizationId,
      personal,
      allOrgProjects,
    });

    if (projectResult.error) {
      return res
        .status(projectResult.error.status)
        .json({ message: projectResult.error.message });
    }

    let projectIds = projectResult.ids;
    if (projectId) {
      const id = projectId.toString();
      projectIds = projectIds.filter((pid) => pid.toString() === id);
    }

    const periodStart = getPeriodStart(period);
    const today = startOfToday();

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      days.push(day);
    }

    if (!projectIds.length) {
      return res.json(
        days.map((day) => ({
          day: DAY_LABELS[day.getDay()],
          date: toLocalDateKey(day),
          completed: 0,
          pending: 0,
        }))
      );
    }

    const activity = await Promise.all(
      days.map(async (day) => {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);

        if (dayStart < periodStart) {
          return {
            day: DAY_LABELS[day.getDay()],
            date: toLocalDateKey(day),
            completed: 0,
            pending: 0,
          };
        }

        const baseQuery = {
          project: { $in: projectIds },
          ...ACTIVE_TASK_FILTER,
          updatedAt: { $gte: dayStart, $lte: dayEnd },
        };

        const [completed, pending] = await Promise.all([
          Task.countDocuments({ ...baseQuery, status: COMPLETED_STATUS }),
          Task.countDocuments({
            ...baseQuery,
            status: { $ne: COMPLETED_STATUS },
          }),
        ]);

        return {
          day: DAY_LABELS[day.getDay()],
          date: toLocalDateKey(day),
          completed,
          pending,
        };
      })
    );

    res.json(activity);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function EMPTY_WEEKLY_RESPONSE(today) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    days.push({
      day: DAY_LABELS[day.getDay()],
      date: toLocalDateKey(day),
      completed: 0,
      pending: 0,
    });
  }
  return days;
}

/**
 * Shared assigned-task report for one subject user.
 * Used by personal report (self) and member report (org owner viewing a member).
 */
async function buildAssignedUserReport({
  subjectUserId,
  period = "30d",
  projectId = null,
  organizationId = null,
  recentTasksLimit = 12,
  includeTaskDistribution = false,
  projectAccessDeniedMessage = "You do not have access to this project",
}) {
  const periodStart = getPeriodStart(period);
  const today = startOfToday();

  const projectResult = await getAccessibleProjectIds(subjectUserId, {
    ...(organizationId ? { organizationId } : {}),
  });
  if (projectResult.error) {
    throw Object.assign(new Error(projectResult.error.message), {
      status: projectResult.error.status,
    });
  }

  let projectIds = projectResult.ids;
  if (projectId) {
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      throw Object.assign(new Error("Invalid projectId"), { status: 400 });
    }
    const selectedId = new mongoose.Types.ObjectId(projectId);
    projectIds = projectIds.filter((pid) => pid.equals(selectedId));
    if (!projectIds.length) {
      throw Object.assign(new Error(projectAccessDeniedMessage), {
        status: 403,
      });
    }
  }

  const emptyPayload = {
    stats: {
      totalProjects: 0,
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      overdueTasks: 0,
      completionRate: 0,
    },
    projectBreakdown: [],
    weeklyActivity: EMPTY_WEEKLY_RESPONSE(today),
    recentTasks: [],
    selectedProjectId: projectId || null,
  };
  if (includeTaskDistribution) {
    emptyPayload.taskDistribution = {
      todo: 0,
      inProgress: 0,
      review: 0,
      completed: 0,
      overdue: 0,
    };
  }
  if (!projectIds.length) return emptyPayload;

  const projects = await Project.find({
    _id: { $in: projectIds },
    isDeleted: { $ne: true },
    status: { $ne: "archived" },
  })
    .select("_id title organization")
    .populate("organization", "name")
    .lean();

  const assignedFilter = buildAssignedActiveTaskFilter(subjectUserId, {
    project: { $in: projectIds },
  });

  const countJobs = [
    Task.countDocuments(assignedFilter),
    Task.countDocuments({ ...assignedFilter, status: COMPLETED_STATUS }),
    Task.countDocuments({
      ...assignedFilter,
      status: { $ne: COMPLETED_STATUS },
      dueDate: { $ne: null, $lt: today },
    }),
  ];
  if (includeTaskDistribution) {
    countJobs.push(
      Task.countDocuments({ ...assignedFilter, status: "todo" }),
      Task.countDocuments({ ...assignedFilter, status: "in-progress" }),
      Task.countDocuments({ ...assignedFilter, status: "review" })
    );
  }

  const [
    totalTasks,
    completedTasks,
    overdueTasks,
    todoCount = 0,
    inProgressCount = 0,
    reviewCount = 0,
  ] = await Promise.all(countJobs);

  const pendingTasks = Math.max(0, totalTasks - completedTasks - overdueTasks);
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const projectBreakdown = await Promise.all(
    projects.map(async (project) => {
      const pBase = buildAssignedActiveTaskFilter(subjectUserId, {
        project: project._id,
      });
      const [tasks, done, overdue] = await Promise.all([
        Task.countDocuments(pBase),
        Task.countDocuments({ ...pBase, status: COMPLETED_STATUS }),
        Task.countDocuments({
          ...pBase,
          status: { $ne: COMPLETED_STATUS },
          dueDate: { $ne: null, $lt: today },
        }),
      ]);
      const progress = tasks > 0 ? Math.round((done / tasks) * 100) : 0;
      return {
        _id: project._id,
        name: project.title,
        organizationName: project.organization?.name || "Personal",
        progress,
        tasks,
        done,
        pending: Math.max(0, tasks - done - overdue),
        overdue,
        status: deriveProjectStatus(progress, overdue, tasks),
      };
    })
  );

  const sortedBreakdown = projectBreakdown.sort((a, b) => b.tasks - a.tasks);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    days.push(day);
  }

  const weeklyActivity = await Promise.all(
    days.map(async (day) => {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      if (dayStart < periodStart) {
        return {
          day: DAY_LABELS[day.getDay()],
          date: toLocalDateKey(day),
          completed: 0,
          pending: 0,
        };
      }

      const dayBase = buildAssignedActiveTaskFilter(subjectUserId, {
        project: { $in: projectIds },
        updatedAt: { $gte: dayStart, $lte: dayEnd },
      });

      const [completed, pending] = await Promise.all([
        Task.countDocuments({ ...dayBase, status: COMPLETED_STATUS }),
        Task.countDocuments({
          ...dayBase,
          status: { $ne: COMPLETED_STATUS },
        }),
      ]);

      return {
        day: DAY_LABELS[day.getDay()],
        date: toLocalDateKey(day),
        completed,
        pending,
      };
    })
  );

  const recentTasks = await Task.find(
    buildAssignedActiveTaskFilter(subjectUserId, {
      project: { $in: projectIds },
    })
  )
    .select("title status priority dueDate updatedAt project")
    .populate("project", "title")
    .sort({ updatedAt: -1 })
    .limit(recentTasksLimit)
    .lean();

  const projectsWithTasks = sortedBreakdown.filter((p) => p.tasks > 0).length;

  const payload = {
    stats: {
      totalProjects: projectId ? 1 : projectsWithTasks || projects.length,
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      completionRate,
    },
    projectBreakdown: sortedBreakdown,
    weeklyActivity,
    recentTasks: recentTasks.map((t) => ({
      _id: t._id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      updatedAt: t.updatedAt,
      projectName: t.project?.title || "Unknown",
      projectId: t.project?._id,
    })),
    selectedProjectId: projectId || null,
  };

  if (includeTaskDistribution) {
    payload.taskDistribution = {
      todo: todoCount,
      inProgress: inProgressCount,
      review: reviewCount,
      completed: completedTasks,
      overdue: overdueTasks,
    };
  }

  return payload;
}

/**
 * Personal report: tasks assigned to the current user across all projects
 * they belong to (org + personal). Optionally scoped to one project.
 */
const getPersonalReport = async (req, res) => {
  try {
    const { period = "30d", projectId } = req.query;
    const report = await buildAssignedUserReport({
      subjectUserId: req.user._id,
      period,
      projectId: projectId || null,
      recentTasksLimit: 12,
      includeTaskDistribution: false,
      projectAccessDeniedMessage: "You do not have access to this project",
    });
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.message });
  }
};

/**
 * Member report: same metrics as personal report, for an org member.
 * Owner-only — mirrors organizationController.deleteOrganizationMemberAccount.
 */
const getMemberReport = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const { organizationId, period = "30d", projectId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: "Invalid member id" });
    }
    if (!organizationId || !mongoose.Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({ message: "organizationId is required" });
    }

    const organization = await Organization.findById(organizationId);
    if (!organization || organization.isDeleted) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const actorId = req.user._id.toString();
    if (organization.owner.toString() !== actorId) {
      return res
        .status(403)
        .json({ message: "Only the organization owner can view member reports" });
    }
    if (!organization.isMember(targetUserId)) {
      return res.status(404).json({ message: "Member not found in this organization" });
    }

    const targetUser = await User.findById(targetUserId).select(
      "username email phone location designation department avatarColor"
    );
    if (!targetUser) {
      return res.status(404).json({ message: "Member not found" });
    }

    const member = {
      _id: targetUser._id,
      username: targetUser.username,
      email: targetUser.email,
      phone: targetUser.phone || "",
      location: targetUser.location || "",
      avatarColor: targetUser.avatarColor || "",
      designation: targetUser.designation || "",
      department: targetUser.department || "",
      role:
        organization.owner.toString() === targetUserId
          ? "owner"
          : organization.getMemberRole(targetUserId),
    };

    const report = await buildAssignedUserReport({
      subjectUserId: targetUserId,
      period,
      projectId: projectId || null,
      organizationId,
      recentTasksLimit: 200,
      includeTaskDistribution: true,
      projectAccessDeniedMessage:
        "This member does not have access to this project",
    });

    res.json({ member, ...report });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.message });
  }
};

const OVERVIEW_SECTIONS = new Set([
  "stats",
  "workload",
  "upcomingDeadlines",
  "missedDeadlines",
  "notifications",
]);

function parseOverviewSections(raw) {
  if (!raw) return [...OVERVIEW_SECTIONS];

  const sections = String(raw)
    .split(",")
    .map((section) => section.trim())
    .filter(Boolean);
  const invalid = sections.filter((section) => !OVERVIEW_SECTIONS.has(section));

  if (invalid.length) {
    throw Object.assign(
      new Error(`Unsupported dashboard section: ${invalid.join(", ")}`),
      { status: 400 }
    );
  }

  return [...new Set(sections)];
}

async function assertDashboardScope(userId, query) {
  const result = await buildProjectListFilter(userId, query);
  if (result.error) {
    throw Object.assign(new Error(result.error.message), {
      status: result.error.status,
    });
  }
}

async function getNotificationPreviewData(userId, query) {
  const filter = {
    user: userId,
    archived: { $ne: true },
    read: false,
  };

  if (query.organizationId || query.personal === "true") {
    const projects = await getAccessibleProjectIds(userId, {
      organizationId: query.organizationId,
      personal: query.personal,
    });
    if (projects.error) {
      throw Object.assign(new Error(projects.error.message), {
        status: projects.error.status,
      });
    }
    filter.projectId = { $in: [...projects.ids, null] };
  }

  const rows = await Notification.find(filter)
    .populate("actor", "username email")
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();

  return rows.map((row) => ({
    ...row,
    _id: row._id?.toString?.() ?? row._id,
    taskId: row.taskId?.toString?.() ?? row.taskId ?? null,
    projectId: row.projectId?.toString?.() ?? row.projectId ?? null,
    actor: row.actor
      ? {
          _id: row.actor._id?.toString?.() ?? row.actor._id,
          username: row.actor.username,
          email: row.actor.email,
        }
      : null,
  }));
}

const getDashboardOverview = async (req, res) => {
  try {
    const sections = parseOverviewSections(req.query.include);
    const query = req.query;
    const userId = req.user._id;

    // Validate organization membership once before any potentially expensive work.
    await assertDashboardScope(userId, query);

    const response = {};
    const jobs = [];

    if (sections.includes("stats")) {
      jobs.push(
        getDashboardStatsData(userId, query).then((data) => {
          response.stats = data;
        })
      );
    }
    if (sections.includes("workload")) {
      jobs.push(
        (query.organizationId
          ? getTeamWorkloadData(query)
          : Promise.resolve({
              members: [],
              totalMembers: 0,
              averageCapacity: 0,
              overCapacity: 0,
              underCapacity: 0,
              availableRoles: [],
            })
        ).then((data) => {
          response.workload = data;
        })
      );
    }
    if (sections.includes("upcomingDeadlines")) {
      jobs.push(
        fetchDeadlineTasks({
          userId,
          organizationId: query.organizationId,
          personal: query.personal,
          dueDateFilter: { $ne: null, $gte: startOfToday() },
          limit: 5,
        }).then((result) => {
          if (result.error) throw Object.assign(new Error(result.error.message), result.error);
          response.upcomingDeadlines = result.data;
        })
      );
    }
    if (sections.includes("missedDeadlines")) {
      jobs.push(
        fetchDeadlineTasks({
          userId,
          organizationId: query.organizationId,
          personal: query.personal,
          dueDateFilter: { $ne: null, $lt: startOfToday() },
          limit: 10,
        }).then((result) => {
          if (result.error) throw Object.assign(new Error(result.error.message), result.error);
          response.missedDeadlines = result.data;
        })
      );
    }
    if (sections.includes("notifications")) {
      jobs.push(
        getNotificationPreviewData(userId, query).then((data) => {
          response.notifications = data;
        })
      );
    }

    await Promise.all(jobs);
    res.json(response);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  getDashboardStats,
  getDashboardOverview,
  getTaskOverview,
  getProjectProgress,
  getTeamWorkload,
  getUpcomingDeadlines,
  getMissedDeadlines,
  getProjectBreakdown,
  getTeamPerformance,
  getWeeklyTaskActivity,
  getPersonalReport,
  getMemberReport,
};
