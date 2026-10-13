const CalendarEvent = require("../models/Calendarevent");
const Organization  = require("../models/Organization");
const Task          = require("../models/Task");
const Project       = require("../models/Project");
const mongoose       = require("mongoose");
const { randomUUID } = require("crypto");
const { resolveFrontendUrl } = require("../utils/frontendUrl");
const {
  resolveEffectiveProjectPermissions,
  userHasProjectPermission,
} = require("../utils/projectAccess");
const { createTaskService } = require("../services/taskService");
const { getIO } = require("../socket/socket");
const EVENTS = require("../socket/events");
const { assertNoAssigneesOnLeave } = require("../utils/leaveValidation");
const { notifyRecipients } = require("../utils/notificationService");
const { buildProjectListFilter } = require("../utils/projectAccess");
const {
  getWorkspaceForUser,
  listWorkspacesForUser,
} = require("../utils/workspaces");
// ── helpers ──────────────────────────────────────────────────────────────────

/** Verify the requesting user belongs to the org (lean — only fields needed for membership). */
async function assertOrgMember(orgId, userId) {
  const org = await Organization.findById(orgId).select("owner members.user").lean();
  if (!org) throw Object.assign(new Error("Organisation not found"), { status: 404 });
  const id = userId.toString();
  const isMember =
    (org.owner && org.owner.toString() === id) ||
    (org.members || []).some((m) => m.user && m.user.toString() === id);
  if (!isMember)
    throw Object.assign(new Error("Not a member of this organisation"), { status: 403 });
  return org;
}

/** ISO date string → "YYYY-MM-DD" */
function toDateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/** Parse YYYY-MM → inclusive date string bounds for calendar queries */
function monthRange(monthParam) {
  const [y, m] = monthParam.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${lastDay}`;
  return { from, to, y, m };
}

function toObjectId(id) {
  return id instanceof mongoose.Types.ObjectId
    ? id
    : new mongoose.Types.ObjectId(id);
}

/** User fields returned on calendar event populate / $lookup */
const USER_PUBLIC_FIELDS = {
  username: 1,
  email: 1,
  designation: 1,
  department: 1,
  status: 1,
  avatarColor: 1,
};

/** Ensure a meeting event has roomId + meetingLink (create if missing). */
function ensureMeetingRoom(event, req) {
  const roomId = event.meeting?.roomId || randomUUID();
  const frontendUrl = resolveFrontendUrl(req);
  event.meeting = {
    enabled: true,
    roomId,
    meetingLink:
      event.meeting?.meetingLink || `${frontendUrl}/meeting/${roomId}`,
    status: event.meeting?.status || "scheduled",
    startedAt: event.meeting?.startedAt,
    endedAt: event.meeting?.endedAt,
  };
  event.markModified("meeting");
  return event.meeting;
}

const CALENDAR_TYPE_LABEL = { task: "task", meeting: "meeting", reminder: "reminder" };

async function getWorkspaceProjectIdSet(userId, orgId, workspaceId) {
  if (!workspaceId) return null;
  const result = await buildProjectListFilter(userId, {
    organizationId: orgId,
    workspaceId,
  });
  if (result.error) {
    throw Object.assign(new Error(result.error.message), {
      status: result.error.status,
    });
  }
  const rows = await Project.find(result.filter).select("_id").lean();
  return new Set(rows.map((p) => p._id.toString()));
}

function eventWorkspaceId(event) {
  if (!event?.workspace) return null;
  if (event.workspace._id) return String(event.workspace._id);
  return String(event.workspace);
}

function eventProjectId(event) {
  const rawProject = event?.taskRef?.project;
  if (!rawProject) return null;
  return rawProject._id != null ? String(rawProject._id) : String(rawProject);
}

function spaceMatchesWorkspace(space, scope) {
  const name = String(space || "").trim().toLowerCase();
  if (!name) return false;
  return (
    name === String(scope.name || "").toLowerCase() ||
    name === String(scope.kind || "").toLowerCase()
  );
}

/**
 * Resolve the workspace an event should belong to.
 * Prefers explicit workspaceId, then space name, then the linked project.
 */
async function resolveCalendarWorkspace(
  userId,
  orgId,
  { workspaceId, space, project } = {}
) {
  let workspaces = [];
  try {
    workspaces = await listWorkspacesForUser(userId, { organizationId: orgId });
  } catch {
    workspaces = [];
  }

  const byId = (id) =>
    id ? workspaces.find((w) => String(w.id) === String(id)) : null;
  const byName = (value) => {
    if (!value) return null;
    const n = String(value).trim().toLowerCase();
    return (
      workspaces.find((w) => String(w.name).toLowerCase() === n) ||
      workspaces.find((w) => String(w.kind).toLowerCase() === n) ||
      null
    );
  };

  let match = byId(workspaceId);
  if (!match && workspaceId) {
    const ws = await getWorkspaceForUser(userId, workspaceId);
    if (ws) {
      return { workspaceId: String(ws._id), space: ws.name };
    }
  }
  if (!match) match = byName(space);

  const projectWs = project?.workspace?._id || project?.workspace;
  if (!match && projectWs) match = byId(projectWs);

  if (!match) {
    match =
      byName("Internal") ||
      workspaces.find((w) => w.kind === "internal") ||
      workspaces[0] ||
      null;
  }

  if (match) {
    return { workspaceId: match.id, space: match.name };
  }
  return { workspaceId: null, space: space || "Internal" };
}

async function getCalendarWorkspaceScope(userId, orgId, workspaceId) {
  if (!workspaceId) return null;
  const ws = await getWorkspaceForUser(userId, workspaceId);
  if (!ws) {
    throw Object.assign(new Error("Invalid or inaccessible workspace"), {
      status: 400,
    });
  }
  const projectIdSet = await getWorkspaceProjectIdSet(
    userId,
    orgId,
    workspaceId
  );
  return {
    workspaceId: String(ws._id),
    name: ws.name,
    kind: ws.kind,
    projectIdSet: projectIdSet || new Set(),
  };
}

function filterCalendarEventsByWorkspace(events, scope) {
  if (!scope) return events;
  return events.filter((event) => {
    if (event.type === "leave") return false;

    const eventWs = eventWorkspaceId(event);
    if (eventWs) return eventWs === scope.workspaceId;

    if (spaceMatchesWorkspace(event.space, scope)) return true;

    const projectId = eventProjectId(event);
    if (projectId && scope.projectIdSet.has(projectId)) return true;

    const spaceName = String(event.space || "").trim();
    const isLegacyInternal =
      !eventWs && !projectId && (!spaceName || spaceName.toLowerCase() === "internal");
    if (
      isLegacyInternal &&
      (scope.kind === "internal" ||
        String(scope.name || "").toLowerCase() === "internal")
    ) {
      return true;
    }
    return false;
  });
}

async function getOrgProjectsForScope(userId, orgId, workspaceId) {
  if (!workspaceId) {
    return Project.find({
      organization: orgId,
      isDeleted: { $ne: true },
    })
      .select("_id title")
      .lean();
  }
  const result = await buildProjectListFilter(userId, {
    organizationId: orgId,
    workspaceId,
  });
  if (result.error) {
    throw Object.assign(new Error(result.error.message), {
      status: result.error.status,
    });
  }
  return Project.find(result.filter).select("_id title").lean();
}

/** Notify newly-assigned users a task/meeting/reminder was put on their calendar. */
async function notifyCalendarAssignment({ event, assigneeIds, actorId, isNew }) {
  if (!Array.isArray(assigneeIds) || assigneeIds.length === 0) return;
  const label = CALENDAR_TYPE_LABEL[event.type] || "event";
  const when = event.time ? `${event.date} at ${event.time}` : event.date;
  await notifyRecipients({
    userIds: assigneeIds,
    actorId,
    type: "assignment",
    title: isNew ? `New ${label} assigned` : `Added to a ${label}`,
    message: `You were assigned to the ${label} "${event.title}" on ${when}.`,
    priority: event.priority === "high" ? "High" : "Medium",
    link: "/calendar",
  });
}

// ── GET /api/organisations/:orgId/calendar ────────────────────────────────────
/**
 * Query params:
 *   month  YYYY-MM          (default: current month)
 *   userId ObjectId         (optional — narrow to one member's calendar,
 *                            i.e. events they created or are assigned to)
 *   all    "true"           (optional — return every event in the org for
 *                            the month, instead of just the caller's own.
 *                            Used by the shared Team Calendar page, whose
 *                            "Mine only" toggle then narrows this
 *                            client-side. Without it, defaults to the
 *                            caller's own events — e.g. the dashboard's
 *                            personal mini-calendar.)
 */
async function getCalendarEvents(req, res) {
  try {
    const { orgId } = req.params;
    const userId = req.user._id;

    await assertOrgMember(orgId, userId);

    const monthParam = req.query.month || toDateKey(new Date()).slice(0, 7);
    const { from, to } = monthRange(monthParam);

    const orgObjectId = toObjectId(orgId);
    const scopeMatch = req.query.userId
      ? { $or: [{ createdBy: toObjectId(req.query.userId) }, { assignees: toObjectId(req.query.userId) }] }
      : req.query.all === "true"
        ? {}
        : { $or: [{ createdBy: userId }, { assignees: userId }] };

    // Optional: Space filter (Internal/Personal/Client/External) — "all" or
    // omitted means every space, matching the frontend's "All Spaces" option.
    const spaceMatch = {};
    if (req.query.space && req.query.space !== "all") {
      spaceMatch.space = req.query.space;
    }

    // Single aggregation: match month + visibility, then $lookup relations
    // (replaces find + 3 populate round-trips).
    const events = await CalendarEvent.aggregate([
      {
        $match: {
          organization: orgObjectId,
          date: { $gte: from, $lte: to },
          ...scopeMatch,
          ...spaceMatch,
        },
      },
      { $sort: { date: 1, time: 1 } },
      {
        $lookup: {
          from: "users",
          let: { assigneeIds: { $ifNull: ["$assignees", []] } },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$assigneeIds"] } } },
            { $project: USER_PUBLIC_FIELDS },
          ],
          as: "assignees",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          pipeline: [
            { $project: { username: 1, email: 1, avatarColor: 1 } },
          ],
          as: "_createdBy",
        },
      },
      {
        $lookup: {
          from: "tasks",
          localField: "taskRef",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                title: 1,
                status: 1,
                priority: 1,
                dueDate: 1,
                project: 1,
              },
            },
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
            { $project: { _project: 0 } },
          ],
          as: "_taskRef",
        },
      },
      {
        $lookup: {
          from: "leaverequests",
          localField: "leaveRef",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                leaveType: 1,
                reason: 1,
                startDate: 1,
                endDate: 1,
                status: 1,
              },
            },
          ],
          as: "_leaveRef",
        },
      },
      {
        $addFields: {
          createdBy: { $arrayElemAt: ["$_createdBy", 0] },
          taskRef: {
            $cond: [
              { $gt: [{ $size: "$_taskRef" }, 0] },
              { $arrayElemAt: ["$_taskRef", 0] },
              null,
            ],
          },
          leaveRef: {
            $cond: [
              { $gt: [{ $size: "$_leaveRef" }, 0] },
              { $arrayElemAt: ["$_leaveRef", 0] },
              null,
            ],
          },
        },
      },
      {
        $project: {
          _createdBy: 0,
          _taskRef: 0,
          _leaveRef: 0,
          __v: 0,
        },
      },
    ]);

    const workspaceScope = await getCalendarWorkspaceScope(
      userId,
      orgId,
      req.query.workspaceId
    );
    const data = filterCalendarEventsByWorkspace(events, workspaceScope);

    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}
// 


// ── POST /api/organisations/:orgId/calendar ───────────────────────────────────
async function createCalendarEvent(req, res) {
  try {
    const { orgId } = req.params;
    const userId    = req.user._id;

    await assertOrgMember(orgId, userId);

    const { title, description, date, time, type, priority, assignees, space, workspaceId, taskRef, projectId, status } = req.body;
    const assigneeIds = Array.isArray(assignees) ? assignees.filter(Boolean) : [];

    if (assigneeIds.length > 0 && date) {
      await assertNoAssigneesOnLeave(assigneeIds, date);
    }

    let meeting = undefined;

    if (type === "meeting") {
      const roomId = randomUUID();
      const frontendUrl = resolveFrontendUrl(req);
      meeting = {
        enabled: true,
        roomId,
        meetingLink: `${frontendUrl}/meeting/${roomId}`,
        status: "scheduled",
      };
    }

    // Type="task" events optionally create a real Task inside a Project,
    // placed directly on the chosen Kanban column, so it shows up on the
    // board/task list immediately — not just as a calendar entry.
    let linkedTaskId = taskRef || null;
    let createdTask = null;
    let resolvedProjectName = "";
    let linkedProject = null;

    if (type === "task" && (projectId || status)) {
      if (!projectId || !status) {
        return res.status(400).json({
          success: false,
          message: "Project and Status are required for a Task event.",
        });
      }

      const project = await Project.findById(projectId);
      if (!project || project.isDeleted) {
        return res.status(404).json({ success: false, message: "Project not found" });
      }
      linkedProject = project;

      const permissions = await resolveEffectiveProjectPermissions(project, userId);
      if (!userHasProjectPermission(permissions, "task:create")) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to create tasks in this project",
        });
      }

      resolvedProjectName = project.title || "";

      createdTask = await createTaskService({
        project,
        user: req.user,
        title,
        description: description || "",
        assigneeIds,
        priority: priority || "medium",
        dueDate: date,
        status,
      });
      linkedTaskId = createdTask._id;
    }

    const workspaceScope = await resolveCalendarWorkspace(userId, orgId, {
      workspaceId,
      space,
      project: linkedProject,
    });

    // createTaskService already upserts a linked calendar row when dueDate is
    // set. Reuse that event so we don't create duplicates for Type=Task.
    let event = linkedTaskId
      ? await CalendarEvent.findOne({ taskRef: linkedTaskId, type: "task" })
      : null;

    if (event) {
      event.title = title;
      event.description = description || "";
      event.date = date;
      if (time !== undefined) event.time = time;
      event.type = type || event.type;
      event.priority = priority || event.priority;
      event.assignees = assigneeIds;
      event.space = workspaceScope.space;
      event.workspace = workspaceScope.workspaceId || event.workspace || null;
      if (resolvedProjectName) event.projectName = resolvedProjectName;
      if (meeting) event.meeting = meeting;
      await event.save();
    } else {
      event = await CalendarEvent.create({
        title,
        description,
        date,
        time,
        type,
        priority,
        assignees: assigneeIds,
        space: workspaceScope.space,
        workspace: workspaceScope.workspaceId || null,
        taskRef:   linkedTaskId,
        organization: orgId,
        createdBy: userId,
        meeting,
        ...(resolvedProjectName ? { projectName: resolvedProjectName } : {}),
      });
    }

    if (createdTask) {
      await Task.findByIdAndUpdate(createdTask._id, { calendarEventRef: event._id });
    }

    // Reminder-fired notifications are separate — they go out at the
    // reminder's own scheduled date/time via the per-minute sweep in
    // jobs/reminderNotifier.js. This is the immediate "you were assigned"
    // notice, sent for every event type (task/meeting/reminder) as soon as
    // it's created with assignees.
    if (assigneeIds.length > 0) {
      await notifyCalendarAssignment({ event, assigneeIds, actorId: userId, isNew: true });
    }

    const populated = await event.populate([
      { path: "assignees", select: "username email designation department status avatarColor" },
      { path: "createdBy", select: "username email avatarColor" },
      {
        path: "taskRef",
        select: "title status priority dueDate project",
        populate: { path: "project", select: "title" },
      },
    ]);

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

// ── PUT /api/organisations/:orgId/calendar/:eventId ───────────────────────────
async function updateCalendarEvent(req, res) {
  try {
    const { orgId, eventId } = req.params;
    const userId             = req.user._id;

    await assertOrgMember(orgId, userId);

    const event = await CalendarEvent.findOne({ _id: eventId, organization: orgId });
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    if (event.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the event owner can edit this",
      });
    }

    const previousAssigneeIds = (event.assignees || []).map((id) => id.toString());

    const allowed = ["title", "description", "date", "time", "type", "priority", "assignees", "space"];
    allowed.forEach(k => {
      if (req.body[k] === undefined) return;
      event[k] = k === "assignees" && Array.isArray(req.body[k])
        ? req.body[k].filter(Boolean)
        : req.body[k];
    });

    if (req.body.workspaceId !== undefined || req.body.space !== undefined) {
      const workspaceScope = await resolveCalendarWorkspace(userId, orgId, {
        workspaceId: req.body.workspaceId,
        space: req.body.space !== undefined ? req.body.space : event.space,
      });
      event.space = workspaceScope.space;
      event.workspace = workspaceScope.workspaceId || event.workspace || null;
    }

    // Only notify whoever is newly added this call — re-saving with the same
    // assignee list on every edit shouldn't re-notify them each time.
    const newlyAddedAssigneeIds = req.body.assignees !== undefined
      ? (event.assignees || [])
          .map((id) => id.toString())
          .filter((id) => !previousAssigneeIds.includes(id))
      : [];

    // If a reminder that already fired gets pushed to a new date/time,
    // it needs to be eligible to notify again at the new time.
    if (
      event.type === "reminder" &&
      event.reminderNotified &&
      (req.body.date !== undefined || req.body.time !== undefined)
    ) {
      event.reminderNotified = false;
    }

    // Only re-check when assignees or date were actually touched this call.
    if (req.body.assignees !== undefined || req.body.date !== undefined) {
      if ((event.assignees || []).length > 0 && event.date) {
        await assertNoAssigneesOnLeave(event.assignees, event.date);
      }
    }

    // If event becomes a meeting (or already is) without a room, create one
    if (event.type === "meeting") {
      ensureMeetingRoom(event, req);
    }

    await event.save();

    if (newlyAddedAssigneeIds.length > 0) {
      await notifyCalendarAssignment({
        event,
        assigneeIds: newlyAddedAssigneeIds,
        actorId: userId,
        isNew: false,
      });
    }

    // Keep a linked Task in sync. Only fires for events that already carry
    // a taskRef (i.e. created through the Type=Task flow) — pre-existing
    // task-type events with no linked Task are left exactly as before.
    if (event.taskRef) {
      const taskUpdates = {};
      if (req.body.title !== undefined) taskUpdates.title = event.title;
      if (req.body.description !== undefined) taskUpdates.description = event.description;
      if (req.body.priority !== undefined) taskUpdates.priority = event.priority;
      if (req.body.date !== undefined) taskUpdates.dueDate = event.date;
      if (req.body.status !== undefined) taskUpdates.status = req.body.status;
      if (Array.isArray(req.body.assignees)) {
        const assigneeIds = req.body.assignees.filter(Boolean);
        taskUpdates.assignees = assigneeIds;
        taskUpdates.assignee = assigneeIds[0] || null;
      }

      if (Object.keys(taskUpdates).length > 0) {
        const updatedTask = await Task.findByIdAndUpdate(event.taskRef, taskUpdates, { new: true })
          .populate("assignee", "username email")
          .populate("assignees", "username email")
          .populate("createdBy", "username email");
        if (updatedTask) {
          getIO().to(updatedTask.project.toString()).emit(EVENTS.TASK_UPDATED, updatedTask);
        }
      }
    }

    const populated = await event.populate([
      { path: "assignees", select: "username email designation department status avatarColor" },
      { path: "createdBy", select: "username email avatarColor" },
      {
        path: "taskRef",
        select: "title status priority dueDate project",
        populate: { path: "project", select: "title" },
      },
    ]);

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

// ── DELETE /api/organisations/:orgId/calendar/:eventId ───────────────────────
async function deleteCalendarEvent(req, res) {
  try {
    const { orgId, eventId } = req.params;
    const userId             = req.user._id;

    await assertOrgMember(orgId, userId);

    const event = await CalendarEvent.findOne({ _id: eventId, organization: orgId });
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    if (event.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the event owner can delete this",
      });
    }

    if (event.taskRef) {
      const linkedTask = await Task.findByIdAndUpdate(event.taskRef, {
        isDeleted: true,
        deletedAt: new Date(),
      });
      if (linkedTask) {
        getIO().to(linkedTask.project.toString()).emit(EVENTS.TASK_DELETED, linkedTask._id);
      }
    }

    await event.deleteOne();

    res.json({ success: true, message: "Event deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}
// Start Meeting
async function startMeeting(req, res) {
  try {
    const { orgId, eventId } = req.params;
    const userId = req.user._id;

    await assertOrgMember(orgId, userId);

    const event = await CalendarEvent.findOne({
      _id: eventId,
      organization: orgId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (event.type !== "meeting") {
      return res.status(400).json({
        success: false,
        message: "This event is not a meeting",
      });
    }

    // Only creator can start
    if (event.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only meeting owner can start the meeting",
      });
    }

    // Always ensure room exists before going live (fixes older events / missing roomId)
    const meeting = ensureMeetingRoom(event, req);
    meeting.status = "live";
    meeting.startedAt = new Date();
    meeting.endedAt = undefined;
    event.markModified("meeting");

    await event.save();

    const populated = await event.populate([
      { path: "assignees", select: "username email designation department status" },
      { path: "createdBy", select: "username email" },
    ]);

    res.json({
      success: true,
      message: "Meeting started successfully",
      data: populated,
      roomId: meeting.roomId,
      meetingLink: meeting.meetingLink,
    });

  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
}
// End Meeting
async function endMeeting(req, res) {
  try {
    const { orgId, eventId } = req.params;
    const userId = req.user._id;

    await assertOrgMember(orgId, userId);

    const event = await CalendarEvent.findOne({
      _id: eventId,
      organization: orgId,
    });

    if (!event)
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });

    if (event.type !== "meeting")
      return res.status(400).json({
        success: false,
        message: "This event is not a meeting",
      });

    if (event.createdBy.toString() !== userId.toString())
      return res.status(403).json({
        success: false,
        message: "Only the meeting owner can end the meeting",
      });

    if (!event.meeting) {
      return res.status(400).json({
        success: false,
        message: "Meeting information is missing",
      });
    }

    event.meeting.status = "ended";
    event.meeting.endedAt = new Date();
    event.markModified("meeting");

    await event.save();

    const populated = await event.populate([
      { path: "assignees", select: "username email designation department status" },
      { path: "createdBy", select: "username email" },
    ]);

    // Notify anyone still in the socket room
    try {
      const { getIO } = require("../socket/socket");
      const roomId = event.meeting?.roomId;
      if (roomId) {
        getIO().to(`meeting:${roomId}`).emit("meeting:ended", { roomId });
      }
    } catch {
      // socket may not be ready in some test contexts
    }

    res.json({
      success: true,
      message: "Meeting ended successfully",
      data: populated,
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
}

// join Meeting
async function joinMeeting(req, res) {
  try {
    const { orgId, eventId } = req.params;
    const userId = req.user._id;

    await assertOrgMember(orgId, userId);

    const event = await CalendarEvent.findOne({
      _id: eventId,
      organization: orgId,
    });

    if (!event)
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });

    if (event.type !== "meeting") {
      return res.status(400).json({
        success: false,
        message: "This event is not a meeting",
      });
    }

    if (!event.meeting?.enabled && !event.meeting?.roomId) {
      return res.status(400).json({
        success: false,
        message: "Meeting room has not been set up yet.",
      });
    }

    if (event.meeting.status !== "live") {
      return res.status(400).json({
        success: false,
        message: "Meeting has not started yet. Wait for the owner to start it.",
      });
    }

    // Anyone in the org with the link / event can join when live
    const roomId =
      event.meeting.roomId ||
      (event.meeting.meetingLink || "").split("/meeting/")[1] ||
      null;

    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: "Meeting room is not ready yet",
      });
    }

    const frontendUrl = resolveFrontendUrl(req);

    res.json({
      success: true,
      roomId,
      meetingLink: event.meeting.meetingLink || `${frontendUrl}/meeting/${roomId}`,
      status: event.meeting.status,
    });

  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
}

// ── GET /api/organisations/:orgId/calendar/members ───────────────────────────
/**
 * Returns all org members with their user profile, role, calendar-event
 * count for the month, and total assigned-task count across org projects.
 * The Team panel badge uses taskCount (assigned tasks), not eventCount.
 */
async function getOrgMembersWithStats(req, res) {
  try {
    const { orgId } = req.params;
    const userId = req.user._id;

    await assertOrgMember(orgId, userId);

    const monthParam = req.query.month || toDateKey(new Date()).slice(0, 7);
    const { from, to } = monthRange(monthParam);
    const orgObjectId = toObjectId(orgId);
    const workspaceScope = await getCalendarWorkspaceScope(
      userId,
      orgId,
      req.query.workspaceId
    );
    const workspaceName = String(workspaceScope?.name || "").toLowerCase();
    const workspaceKind = String(workspaceScope?.kind || "").toLowerCase();

    // One pipeline: org → owner/member users → per-assignee event counts for the month
    const [result] = await Organization.aggregate([
      { $match: { _id: orgObjectId } },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          pipeline: [{ $project: USER_PUBLIC_FIELDS }],
          as: "_owner",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "members.user",
          foreignField: "_id",
          pipeline: [{ $project: USER_PUBLIC_FIELDS }],
          as: "_memberUsers",
        },
      },
      {
        $lookup: {
          from: "calendarevents",
          let: { oid: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$organization", "$$oid"] },
                    { $gte: ["$date", from] },
                    { $lte: ["$date", to] },
                    { $ne: ["$type", "leave"] },
                    ...(workspaceScope
                      ? [
                          {
                            $or: [
                              {
                                $eq: [
                                  "$workspace",
                                  toObjectId(workspaceScope.workspaceId),
                                ],
                              },
                              {
                                $eq: [
                                  { $toLower: { $ifNull: ["$space", ""] } },
                                  workspaceName,
                                ],
                              },
                              ...(workspaceKind
                                ? [
                                    {
                                      $eq: [
                                        {
                                          $toLower: { $ifNull: ["$space", ""] },
                                        },
                                        workspaceKind,
                                      ],
                                    },
                                  ]
                                : []),
                            ],
                          },
                        ]
                      : []),
                  ],
                },
              },
            },
            { $unwind: { path: "$assignees", preserveNullAndEmptyArrays: false } },
            { $match: { assignees: { $ne: null } } },
            { $group: { _id: "$assignees", count: { $sum: 1 } } },
          ],
          as: "_eventCounts",
        },
      },
      {
        $project: {
          createdAt: 1,
          owner: { $arrayElemAt: ["$_owner", 0] },
          members: 1,
          memberUsers: "$_memberUsers",
          eventCounts: "$_eventCounts",
        },
      },
    ]);

    if (!result) {
      return res.status(404).json({ success: false, message: "Organisation not found" });
    }

    // Count real Task documents assigned to each member across scoped org projects.
    const orgProjects = await getOrgProjectsForScope(
      userId,
      orgId,
      req.query.workspaceId
    );
    const projectIds = orgProjects.map((p) => p._id);

    const taskCountRows =
      projectIds.length === 0
        ? []
        : await Task.aggregate([
            {
              $match: {
                project: { $in: projectIds },
                isDeleted: { $ne: true },
                $or: [{ isActive: true }, { isActive: { $exists: false } }],
              },
            },
            {
              $project: {
                assigneeIds: {
                  $setUnion: [
                    { $ifNull: ["$assignees", []] },
                    {
                      $cond: [
                        { $ifNull: ["$assignee", false] },
                        ["$assignee"],
                        [],
                      ],
                    },
                  ],
                },
              },
            },
            { $unwind: "$assigneeIds" },
            { $match: { assigneeIds: { $ne: null } } },
            { $group: { _id: "$assigneeIds", count: { $sum: 1 } } },
          ]);

    const countMap = Object.fromEntries(
      (result.eventCounts || []).map((c) => [c._id.toString(), c.count])
    );
    const taskCountMap = Object.fromEntries(
      (taskCountRows || []).map((c) => [c._id.toString(), c.count])
    );
    const userById = Object.fromEntries(
      (result.memberUsers || []).map((u) => [u._id.toString(), u])
    );

    const allMembers = [];

    if (result.owner) {
      const ownerId = result.owner._id.toString();
      allMembers.push({
        user: result.owner,
        role: "owner",
        joinedAt: result.createdAt,
        eventCount: countMap[ownerId] || 0,
        taskCount: taskCountMap[ownerId] || 0,
      });
    }

    for (const m of result.members || []) {
      const uid = m.user?.toString?.() || m.user;
      const user = userById[uid];
      if (!user) continue;
      allMembers.push({
        user,
        role: m.role,
        joinedAt: m.joinedAt,
        eventCount: countMap[uid] || 0,
        taskCount: taskCountMap[uid] || 0,
      });
    }

    res.json({ success: true, data: allMembers });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/**
 * GET /organisations/:orgId/calendar/members/:memberId/tasks
 * All active tasks in this org assigned to the given member (any project).
 */
async function getMemberAssignedTasks(req, res) {
  try {
    const { orgId, memberId } = req.params;
    const userId = req.user._id;

    await assertOrgMember(orgId, userId);

    const orgObjectId = toObjectId(orgId);
    const memberObjectId = toObjectId(memberId);
    if (!memberObjectId) {
      return res.status(400).json({ success: false, message: "Invalid member id" });
    }

    const orgProjects = await getOrgProjectsForScope(
      userId,
      orgId,
      req.query.workspaceId
    );
    const projectIds = orgProjects.map((p) => p._id);
    const projectTitleById = Object.fromEntries(
      orgProjects.map((p) => [p._id.toString(), p.title || ""])
    );

    if (projectIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const tasks = await Task.find({
      project: { $in: projectIds },
      isDeleted: { $ne: true },
      $and: [
        { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
        {
          $or: [
            { assignees: memberObjectId },
            { assignee: memberObjectId },
          ],
        },
      ],
    })
      .select("title description status priority dueDate startDate project assignees assignee")
      .sort({ dueDate: 1, title: 1 })
      .lean();

    const data = tasks.map((task) => {
      const projectId = task.project?.toString?.() || task.project;
      const due = task.dueDate ? toDateKey(task.dueDate) : null;
      return {
        _id: task._id,
        title: task.title,
        description: task.description || "",
        status: task.status,
        priority: task.priority || "medium",
        dueDate: due,
        startDate: task.startDate ? toDateKey(task.startDate) : null,
        project: projectId
          ? { _id: projectId, title: projectTitleById[projectId] || "" }
          : null,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

// ── POST /api/organisations/:orgId/calendar/sync-tasks ───────────────────────
/**
 * Syncs all Tasks (with a dueDate) belonging to this org into CalendarEvents.
 * Safe to call multiple times — uses taskRef to avoid duplicates.
 * Used by the calendar "Sync tasks" button (not on every page load).
 */
async function syncTasksToCalendar(req, res) {
  try {
    const { orgId } = req.params;
    const userId = req.user._id;

    await assertOrgMember(orgId, userId);

    const orgObjectId = toObjectId(orgId);
    const actorId = toObjectId(userId);

    let workspaceProjectMatch = {};
    if (req.query.workspaceId) {
      const scoped = await getOrgProjectsForScope(
        userId,
        orgId,
        req.query.workspaceId
      );
      const scopedIds = scoped.map((p) => p._id);
      if (!scopedIds.length) {
        return res.json({
          success: true,
          message: "No tasks to sync in this workspace",
        });
      }
      workspaceProjectMatch = { "projectDoc._id": { $in: scopedIds } };
    }

    // One aggregation: org projects → tasks with due dates (no N+1 project lookups)
    const tasks = await Task.aggregate([
      {
        $lookup: {
          from: "projects",
          localField: "project",
          foreignField: "_id",
          as: "projectDoc",
        },
      },
      { $unwind: "$projectDoc" },
      {
        $lookup: {
          from: "workspaces",
          localField: "projectDoc.workspace",
          foreignField: "_id",
          as: "_workspace",
        },
      },
      {
        $match: {
          "projectDoc.organization": orgObjectId,
          "projectDoc.isDeleted": { $ne: true },
          dueDate: { $ne: null },
          isDeleted: { $ne: true },
          $or: [{ isActive: true }, { isActive: { $exists: false } }],
          ...workspaceProjectMatch,
        },
      },
      {
        $project: {
          title: 1,
          description: 1,
          dueDate: 1,
          priority: 1,
          assignee: 1,
          assignees: 1,
          createdBy: 1,
          projectTitle: "$projectDoc.title",
          projectWorkspace: "$projectDoc.workspace",
          workspaceName: { $arrayElemAt: ["$_workspace.name", 0] },
        },
      },
    ]);

    const taskIds = tasks.map((t) => t._id);

    // Drop calendar rows for tasks that no longer qualify. When scoped to a
    // workspace, only touch events in that workspace so other spaces stay intact.
    const staleFilter = {
      organization: orgObjectId,
      type: "task",
      taskRef: { $exists: true, $ne: null, $nin: taskIds },
    };
    if (req.query.workspaceId) {
      staleFilter.workspace = toObjectId(req.query.workspaceId);
    }
    await CalendarEvent.deleteMany(staleFilter);

    if (tasks.length === 0) {
      return res.json({ success: true, message: "Synced: 0 created, 0 updated" });
    }

    const ops = tasks.map((task) => {
      const dateKey = toDateKey(task.dueDate);
      const assigneeIds = [];
      const seen = new Set();
      const push = (value) => {
        if (!value) return;
        const key = value.toString();
        if (seen.has(key)) return;
        seen.add(key);
        assigneeIds.push(value);
      };
      if (Array.isArray(task.assignees)) {
        for (const id of task.assignees) push(id);
      }
      push(task.assignee);

      return {
        updateOne: {
          filter: { taskRef: task._id, type: "task" },
          update: {
            $set: {
              title: task.title,
              description: task.description || "",
              date: dateKey,
              priority: task.priority || "medium",
              assignees: assigneeIds,
              space: task.workspaceName || "Internal",
              workspace: task.projectWorkspace || null,
              organization: orgObjectId,
              projectName: task.projectTitle || "",
              type: "task",
              taskRef: task._id,
            },
            $setOnInsert: {
              time: "09:00",
              createdBy: task.createdBy || actorId,
            },
          },
          upsert: true,
        },
      };
    });

    const result = await CalendarEvent.bulkWrite(ops, { ordered: false });
    const created = result.upsertedCount || 0;
    const updated = result.modifiedCount || 0;

    res.json({
      success: true,
      message: `Synced: ${created} created, ${updated} updated`,
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/** GET meeting details by roomId (for the meeting page) */
async function getMeetingByRoomId(req, res) {
  try {
    const { orgId, roomId } = req.params;
    const userId = req.user._id;

    await assertOrgMember(orgId, userId);

    const event = await CalendarEvent.findOne({
      organization: orgId,
      "meeting.roomId": roomId,
      type: "meeting",
    })
      .populate("assignees", "username email designation department status")
      .populate("createdBy", "username email");

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    const isCreator = event.createdBy._id.toString() === userId.toString();

    if (event.meeting?.status === "ended") {
      return res.status(400).json({
        success: false,
        message: "This meeting has ended",
      });
    }

    // Link join: any org member can enter a live room; host can enter anytime
    if (event.meeting?.status !== "live" && !isCreator) {
      return res.status(400).json({
        success: false,
        message: "Meeting has not started yet. Wait for the host.",
      });
    }

    const frontendUrl = resolveFrontendUrl(req);
    const meetingLink =
      event.meeting?.meetingLink || `${frontendUrl}/meeting/${roomId}`;

    res.json({
      success: true,
      data: {
        eventId: event._id,
        orgId,
        title: event.title,
        description: event.description,
        date: event.date,
        time: event.time,
        status: event.meeting?.status || "scheduled",
        roomId: event.meeting?.roomId,
        meetingLink,
        isHost: isCreator,
        createdBy: event.createdBy,
        assignees: event.assignees || [],
        joinViaLink: true,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
}

/**
 * Resolve a shareable meeting link: GET /api/meetings/:roomId
 * Any logged-in member of the meeting's organisation can join when live.
 */
async function resolveMeetingByRoomId(req, res) {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const event = await CalendarEvent.findOne({
      "meeting.roomId": roomId,
      type: "meeting",
    })
      .populate("assignees", "username email designation department status")
      .populate("createdBy", "username email");

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found. Check the link and try again.",
      });
    }

    const orgId = event.organization.toString();
    await assertOrgMember(orgId, userId);

    const isCreator = event.createdBy._id.toString() === userId.toString();

    if (event.meeting?.status === "ended") {
      return res.status(400).json({
        success: false,
        message: "This meeting has ended",
      });
    }

    if (event.meeting?.status !== "live" && !isCreator) {
      return res.status(400).json({
        success: false,
        message: "Meeting has not started yet. Wait for the host to start it.",
      });
    }

    const frontendUrl = resolveFrontendUrl(req);
    const meetingLink = `${frontendUrl}/meeting/${roomId}`;

    // Keep link fresh on the event
    if (event.meeting && event.meeting.meetingLink !== meetingLink) {
      event.meeting.meetingLink = meetingLink;
      event.markModified("meeting");
      await event.save();
    }

    res.json({
      success: true,
      data: {
        eventId: event._id,
        orgId,
        title: event.title,
        description: event.description,
        date: event.date,
        time: event.time,
        status: event.meeting?.status || "scheduled",
        roomId: event.meeting?.roomId,
        meetingLink,
        isHost: isCreator,
        createdBy: event.createdBy,
        assignees: event.assignees || [],
        joinViaLink: true,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getOrgMembersWithStats,
  getMemberAssignedTasks,
  syncTasksToCalendar,

  startMeeting,
  endMeeting,
  joinMeeting,
  getMeetingByRoomId,
  resolveMeetingByRoomId,
};