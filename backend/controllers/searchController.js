const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const Project = require("../models/Project");
const Task = require("../models/Task");
const User = require("../models/user");
const CalendarEvent = require("../models/Calendarevent");
const { getAccessibleProjectIds } = require("../utils/taskQueries");
const { resolveMemberUserId } = require("../utils/projectAccess");

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLimit(raw) {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

async function getUserOrganizationIds(userId) {
  const orgs = await Organization.find({
    isDeleted: { $ne: true },
    $or: [{ owner: userId }, { "members.user": userId }],
  }).select("_id");

  return orgs.map((org) => org._id);
}

async function getAccessibleMemberIds(userId) {
  const ids = new Set([userId.toString()]);
  const orgIds = await getUserOrganizationIds(userId);

  if (orgIds.length > 0) {
    const orgs = await Organization.find({ _id: { $in: orgIds } }).select(
      "owner members"
    );

    for (const org of orgs) {
      if (org.owner) ids.add(org.owner.toString());
      for (const member of org.members) {
        const memberId = resolveMemberUserId(member);
        if (memberId) ids.add(memberId);
      }
    }
  }

  const access = await getAccessibleProjectIds(userId);
  if (access.ids?.length) {
    const projects = await Project.find({ _id: { $in: access.ids } }).select(
      "members"
    );

    for (const project of projects) {
      for (const member of project.members) {
        const memberId = resolveMemberUserId(member);
        if (memberId) ids.add(memberId);
      }
    }
  }

  return Array.from(ids).map((id) => new mongoose.Types.ObjectId(id));
}

async function searchProjects(userId, regex, limit, projectIds = null) {
  const filter = {
    isDeleted: { $ne: true },
    "members.user": userId,
    $or: [{ title: regex }, { description: regex }],
  };
  if (Array.isArray(projectIds) && projectIds.length) {
    filter._id = { $in: projectIds };
  }
  return Project.find(filter)
    .populate("organization", "name")
    .select("_id title description status organization")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
}

async function searchTasks(projectIds, regex, limit) {
  if (!projectIds.length) return [];

  return Task.find({
    isDeleted: { $ne: true },
    project: { $in: projectIds },
    $or: [{ title: regex }, { description: regex }],
  })
    .populate("project", "title")
    .select("_id title description status priority dueDate project")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
}

async function searchMembers(memberIds, userId, regex, limit) {
  if (!memberIds.length) return [];

  const filteredIds = memberIds.filter(
    (id) => id.toString() !== userId.toString()
  );
  if (!filteredIds.length) return [];

  return User.find({
    _id: { $in: filteredIds },
    $or: [
      { username: regex },
      { email: regex },
      { designation: regex },
      { department: regex },
    ],
  })
    .select("_id username email designation department")
    .sort({ username: 1 })
    .limit(limit)
    .lean();
}

async function searchCalendarEvents(orgIds, regex, limit, projectIds = null) {
  if (!orgIds.length) return [];

  const events = await CalendarEvent.find({
    organization: { $in: orgIds },
    $or: [{ title: regex }, { description: regex }],
  })
    .populate("organization", "name")
    .populate({
      path: "taskRef",
      select: "project",
      populate: { path: "project", select: "_id" },
    })
    .select("_id title description date time type organization taskRef")
    .sort({ date: -1 })
    .limit(limit * 3)
    .lean();

  if (Array.isArray(projectIds)) {
    if (!projectIds.length) return [];
    const allowed = new Set(projectIds.map((id) => id.toString()));
    return events
      .filter((event) => {
        const pid = event.taskRef?.project?._id?.toString?.();
        return pid && allowed.has(pid);
      })
      .slice(0, limit);
  }

  return events.slice(0, limit);
}

const globalSearch = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const limit = parseLimit(req.query.limit);

    if (!q) {
      return res.json({
        query: "",
        projects: [],
        tasks: [],
        members: [],
        calendar: [],
      });
    }

    const regex = new RegExp(escapeRegex(q), "i");
    const userId = req.user._id;
    const scope = {
      organizationId: req.query.organizationId,
      personal: req.query.personal,
      workspaceId: req.query.workspaceId,
    };

    const access = await getAccessibleProjectIds(userId, scope);
    if (access.error) {
      return res
        .status(access.error.status)
        .json({ message: access.error.message });
    }

    const [orgIds, memberIds] = await Promise.all([
      getUserOrganizationIds(userId),
      getAccessibleMemberIds(userId),
    ]);

    const [projects, tasks, members, calendar] = await Promise.all([
      searchProjects(userId, regex, limit, access.ids),
      searchTasks(access.ids, regex, limit),
      searchMembers(memberIds, userId, regex, limit),
      searchCalendarEvents(orgIds, regex, limit, access.ids),
    ]);

    res.json({
      query: q,
      projects,
      tasks,
      members,
      calendar,
    });
  } catch (err) {
    console.error("[globalSearch]", err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  globalSearch,
};
