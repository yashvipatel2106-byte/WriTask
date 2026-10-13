const mongoose = require("mongoose");
const User = require("../models/user");
const Organization = require("../models/Organization");
const Project = require("../models/Project");
const Task = require("../models/Task");
const Activity = require("../models/activity");
const { buildProjectListFilter } = require("../utils/projectAccess");
const summaryService = require("../services/reports/summaryService");
const projectPerformanceService = require("../services/reports/projectPerformanceService");
const taskDistributionService = require("./reports/taskDistributionService");
const recentTaskService = require("../services/reports/recentTaskService");
const activityService = require("../services/reports/activityService");
const {
  ACTIVE_TASK_FILTER,
  buildAssignedActiveTaskFilter,
} = require("../utils/taskQueries");
const { getWeekRange, getWeekLabel } = require("../utils/reportWeek");

class ReportService {
  async getWeeklyReport(
    userId,
    {
      organizationId = null,
      workspaceId = null,
      personal = false,
      referenceDate = new Date(),
    } = {}
  ) {
    const user = await User.findById(userId).select(
      "username email designation department location phone bio status settings"
    );

    if (!user) {
      throw new Error("User not found");
    }

    const orgQuery = organizationId
      ? {
          _id: organizationId,
          $or: [{ owner: userId }, { "members.user": userId }],
          isDeleted: { $ne: true },
        }
      : {
          $or: [{ owner: userId }, { "members.user": userId }],
          isDeleted: { $ne: true },
        };

    const organization = await Organization.findOne(orgQuery)
      .populate("owner", "username email")
      .populate("members.user", "username email designation");

    if (organizationId && !organization) {
      throw new Error("User is not a member of this organization");
    }

    const projectFilter = {
      isDeleted: false,
    };

    const scoped = await buildProjectListFilter(userId, {
      organizationId: organization?._id?.toString() || organizationId || undefined,
      personal: personal ? "true" : undefined,
      workspaceId: workspaceId || undefined,
    });
    if (scoped.error) {
      throw new Error(scoped.error.message);
    }
    Object.assign(projectFilter, scoped.filter);

    const projects = await Project.find(projectFilter)
      .populate("owner", "username email designation")
      .populate("members.user", "username email designation");

    const projectIds = projects.map((project) => project._id);

    const orgIds = [
      ...new Set(
        projects
          .map((project) => project.organization?.toString())
          .filter(Boolean)
      ),
    ];

    const [userTasks, projectTasks, activities, organizations] = await Promise.all([
      projectIds.length
        ? Task.find(
            buildAssignedActiveTaskFilter(userId, {
              project: { $in: projectIds },
            })
          ).populate("project", "title")
        : [],
      projectIds.length
        ? Task.find({
            ...ACTIVE_TASK_FILTER,
            project: { $in: projectIds },
          }).populate("project", "title")
        : [],
      Activity.find({ user: userId }).sort({ createdAt: -1 }),
      orgIds.length
        ? Organization.find({ _id: { $in: orgIds } })
            .populate("owner", "username email")
            .populate("members.user", "username email designation")
        : [],
    ]);

    const orgLookup = toOrgLookup(organizations);

    const { start: weekStart, end: weekEnd } = getWeekRange(referenceDate);
    const weekLabel = getWeekLabel(referenceDate);

    const summary = summaryService.build(userTasks, projects, referenceDate);

    const projectPerformance = projectPerformanceService.build(
      projects,
      projectTasks,
      orgLookup
    );
    const weeklyActivity = activityService.build(userTasks);
    const taskDistribution = taskDistributionService.build(userTasks);
    const recentTasks = recentTaskService.build(userTasks);
    return {
      employee: user,
      organizations,
      weekStart,
      weekEnd,
      weekLabel,
      summary,
      projectPerformance,
      weeklyActivity,
      taskDistribution,
      recentTasks,
      projects,
      tasks: userTasks,
      activities,
    };
  }
}

function toOrgLookup(organizations = []) {
  return new Map(organizations.map((org) => [org._id.toString(), org]));
}

module.exports = new ReportService();
module.exports.toOrgLookup = toOrgLookup;
