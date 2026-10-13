const fs = require("fs");
const path = require("path");
const Task = require("../models/Task");
const Project = require("../models/Project");
const CalendarEvent = require("../models/Calendarevent");
const { createTaskService } = require("../services/taskService");
const {
  startOfToday,
  openTaskFilter,
  getAccessibleProjectIds,
} = require("../utils/taskQueries");
const { uploadsRoot, resolveAttachmentFile, absoluteAttachmentPath } = require("../middleware/uploadMiddleware");
const { sanitizeDescriptionHtml } = require("../utils/sanitizeHtml");
const {
  buildTaskUpdateEntries,
  buildCreatedEntry,
  buildAttachmentAddedEntry,
  buildAttachmentRemovedEntry,
  buildDeletedEntry,
  buildSubtaskAddedEntry,
  buildSubtaskUpdatedEntry,
  buildSubtaskRemovedEntry,
} = require("../utils/taskActivity");
const {
  syncTaskToCalendarSafe,
  removeTaskFromCalendarSafe,
} = require("../utils/calendarTaskSync");
const { assertNoAssigneesOnLeave } = require("../utils/leaveValidation");
const {
  notifyAssignment,
  notifySubtaskAssignment,
  notifyMentions,
  notifyTaskComment,
  notifyStatusChange,
  notifyAssigneeTaskUpdate,
  resolveMentionIdsFromText,
  filterMentionIdsByText,
} = require("../utils/notificationService");
const { getIO } = require("../socket/socket");
const EVENTS = require("../socket/events");
function resolveAssigneeIds(body, fallbackSingle) {
  if (Array.isArray(body.assignees)) {
    return [...new Set(body.assignees.filter(Boolean).map(String))];
  }
  if (body.assignee !== undefined) {
    return body.assignee ? [String(body.assignee)] : [];
  }
  if (fallbackSingle !== undefined) {
    return fallbackSingle ? [String(fallbackSingle)] : [];
  }
  return undefined;
}

/** Only accepted project members may be assigned — pending invitees cannot. */
function assertAssigneesAreProjectMembers(project, assigneeIds = []) {
  const ids = (assigneeIds || []).filter(Boolean).map(String);
  if (!ids.length) return;
  const notMembers = ids.filter((id) => !project.isMember(id));
  if (notMembers.length) {
    const err = new Error(
      "Only accepted project members can be assigned. Pending invitees must accept the invitation first."
    );
    err.status = 400;
    throw err;
  }
}

function applyAssigneesToUpdates(updates, assigneeIds) {
  if (assigneeIds === undefined) return;
  updates.assignees = assigneeIds;
  updates.assignee = assigneeIds[0] || null;
}

function ensureTaskArrays(task) {
  if (!Array.isArray(task.subtasks)) task.subtasks = [];
  if (!Array.isArray(task.deletedSubtasks)) task.deletedSubtasks = [];
  if (!Array.isArray(task.activityLog)) task.activityLog = [];
}

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

function normalizeWorkingDaysInput(workingDays) {
  if (workingDays === undefined) return undefined;
  if (workingDays === null) return [...DEFAULT_WORKING_DAYS];
  if (!Array.isArray(workingDays)) return [...DEFAULT_WORKING_DAYS];

  const cleaned = [
    ...new Set(
      workingDays
        .map(Number)
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ),
  ].sort((a, b) => a - b);

  return cleaned.length > 0 ? cleaned : [...DEFAULT_WORKING_DAYS];
}

function calcWorkingDayCount(start, end, workingDays = DEFAULT_WORKING_DAYS) {
  if (!start || !end) return 0;
  const active =
    Array.isArray(workingDays) && workingDays.length > 0
      ? workingDays
      : DEFAULT_WORKING_DAYS;
  let count = 0;
  const startDay = new Date(start);
  const endDay = new Date(end);
  startDay.setHours(0, 0, 0, 0);
  endDay.setHours(0, 0, 0, 0);
  for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
    if (active.includes(d.getDay())) count++;
  }
  return count;
}

// Subtasks nest by referencing a sibling subtask's _id as parentSubtaskId
// (still stored flat in the same `subtasks` array). A subtask with no
// parent is level 1; nesting is capped at level 3.
const MAX_SUBTASK_LEVEL = 3;

function subtaskLevel(subtasksList, parentSubtaskId) {
  let level = 1;
  let currentId = parentSubtaskId;
  while (currentId) {
    const parent = subtasksList.id(currentId);
    if (!parent) break;
    level += 1;
    currentId = parent.parentSubtaskId;
  }
  return level;
}

async function safeNotify(fn) {
  try {
    await fn();
  } catch (error) {
    console.error("Notification failed (non-fatal):", error.message);
  }
}

const populateTask = (query) =>
  query
    .populate("assignee", "username email avatarColor")
    .populate("assignees", "username email avatarColor")
    .populate("createdBy", "username email avatarColor")
    .populate("subtasks.assignee", "username email avatarColor")
    .populate("subtasks.assignees", "username email avatarColor")
    .populate("subtasks.createdBy", "username email avatarColor")
    .populate("attachments.uploadedBy", "username email avatarColor")
    .populate("comments.author", "username email avatarColor")
    .populate("comments.mentions", "username email avatarColor")
    .populate("activityLog.actor", "username email avatarColor");

const populateTaskList = (query) =>
  query
    .populate("assignee", "username email avatarColor")
    .populate("assignees", "username email avatarColor")
    .populate("createdBy", "username email avatarColor")
    .populate("subtasks.assignee", "username email avatarColor")
    .populate("subtasks.assignees", "username email avatarColor");

async function fetchPopulatedTask(taskId) {
  return populateTask(Task.findById(taskId)).exec();
}

const createTask = async (req, res) => {
  try {
    const {
      title, description, assignee, assignees, priority, dueDate, startDate,
      durationHours, effortHours, workingDays, status, tags,
    } = req.body;

    if (!title) return res.status(400).json({ message: "Title is required" });

    const assigneeIds = resolveAssigneeIds({ assignee, assignees }, assignee) || [];
    assertAssigneesAreProjectMembers(req.project, assigneeIds);

    if (assigneeIds.length > 0 && dueDate) {
      await assertNoAssigneesOnLeave(assigneeIds, dueDate);
    }

    const populated = await createTaskService({
      project: req.project,
      user: req.user,
      title,
      description,
      assigneeIds,
      priority: priority || "medium",
      dueDate,
      startDate,
      durationHours,
      effortHours,
      workingDays,
      status: status || "todo",
      tags: Array.isArray(tags) ? tags : [],
    });

    res.status(201).json(populated);
  } catch (error) {
    console.error("createTask error:", error);
    res.status(error.status || 500).json({ message: error.message });
  }

};

const getTasksByProject = async (req, res) => {
  try {
    const tasks = await populateTaskList(
      Task.find({ project: req.project._id, isDeleted: { $ne: true } })
        .select("-activityLog -comments")
        .sort({
          status: 1,
          order: 1,
          createdAt: -1,
        })
    ).exec();

    res.json(tasks);
  } catch (error) {
    console.error("getTasksByProject error:", error);
    res.status(500).json({ message: error.message });
  }
};

const getTask = async (req, res) => {
  try {
    // requireTaskPermission already allows task:read through for a
    // soft-deleted task (see rbacMiddleware) — e.g. the Trash bin's "Open"
    // action needs the full task record to show a read-only detail view.
    const task = await fetchPopulatedTask(req.task._id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    res.json(task);
  } catch (error) {
    console.error("getTask error:", error);
    res.status(500).json({ message: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const {
      title,
      description,
      status,
      priority,
      assignee,
      assignees,
      dueDate,
      startDate,
      order,
      tags,
      durationHours,
      effortHours,
      workingDays,
    } = req.body;
    
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = sanitizeDescriptionHtml(description);
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (assignee !== undefined || assignees !== undefined) {
      const assigneeIds = resolveAssigneeIds({ assignee, assignees });
      if (assigneeIds !== undefined) {
        assertAssigneesAreProjectMembers(req.project, assigneeIds);
        applyAssigneesToUpdates(updates, assigneeIds);
      }
    }
    if (dueDate !== undefined) updates.dueDate = dueDate || null;
    if (startDate !== undefined) updates.startDate = startDate || null;
    if (effortHours !== undefined) {
      updates.effortHours = effortHours ?? null;
    }
    if (durationHours !== undefined) {
      updates.durationHours = durationHours ?? null;
    }
    if (workingDays !== undefined) {
      updates.workingDays = normalizeWorkingDaysInput(workingDays);
    }

    const s = startDate !== undefined ? startDate || null : req.task.startDate;
    const e = dueDate !== undefined ? dueDate || null : req.task.dueDate;
    const effectiveWorkingDays =
      workingDays !== undefined
        ? normalizeWorkingDaysInput(workingDays)
        : Array.isArray(req.task.workingDays) && req.task.workingDays.length > 0
          ? req.task.workingDays
          : DEFAULT_WORKING_DAYS;

    if (s && e) {
      updates.workingDayCount = calcWorkingDayCount(s, e, effectiveWorkingDays);
    }

    if (order !== undefined) updates.order = order;
    if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];

    const normalizeUserId = (value) => {
      if (!value) return null;
      if (typeof value === "object" && value._id) return value._id.toString();
      return value.toString();
    };
    const sameIdSet = (a = [], b = []) => {
      const sa = new Set(a.map(normalizeUserId).filter(Boolean));
      const sb = new Set(b.map(normalizeUserId).filter(Boolean));
      if (sa.size !== sb.size) return false;
      for (const id of sa) if (!sb.has(id)) return false;
      return true;
    };

    const oldAssignee = normalizeUserId(req.task.assignee);
    const oldAssignees = (req.task.assignees || [])
      .map(normalizeUserId)
      .filter(Boolean);
    const oldStatus = req.task.status;

    // Hard-block leave conflicts only when the assignee set actually changes.
    // Rescheduling an existing assignment onto a leave day must still be
    // allowed (the UI can warn); otherwise "Save date" fails whenever someone
    // already on the task is on leave for the new due date.
    if (updates.assignees !== undefined) {
      const effectiveAssignees = (updates.assignees || [])
        .map(normalizeUserId)
        .filter(Boolean);
      const assigneesChanged = !sameIdSet(effectiveAssignees, oldAssignees);
      const effectiveDueDate =
        updates.dueDate !== undefined ? updates.dueDate : req.task.dueDate;
      if (assigneesChanged && effectiveAssignees.length > 0 && effectiveDueDate) {
        await assertNoAssigneesOnLeave(effectiveAssignees, effectiveDueDate);
      }
    }

    const activityEntries = await buildTaskUpdateEntries(
      req.task,
      updates,
      req.user._id
    );

    if (activityEntries.length > 0) {
      await Task.findByIdAndUpdate(req.task._id, {
        $set: updates,
        $push: { activityLog: { $each: activityEntries } },
      });
    } else if (Object.keys(updates).length > 0) {
      await Task.findByIdAndUpdate(req.task._id, updates);
    }

    const task = await fetchPopulatedTask(req.task._id);
    const io = getIO();
    io.to(task.project.toString()).emit(EVENTS.TASK_UPDATED, task);

    // Sync calendar when due date or fields shown on calendar events change
    const calendarFieldsTouched =
      dueDate !== undefined ||
      title !== undefined ||
      priority !== undefined ||
      assignee !== undefined ||
      assignees !== undefined ||
      description !== undefined;
    if (calendarFieldsTouched) {
      void syncTaskToCalendarSafe(task);
    }

    const projectId = req.params.projectId || req.task.project;

    if (updates.assignees !== undefined) {
      const newAssignees = updates.assignees.map(String);
      const added = newAssignees.filter((id) => !oldAssignees.includes(id));
      if (added.length > 0) {
        await safeNotify(() =>
          notifyAssignment({
            assigneeId: added[0],
            actorId: req.user._id,
            task,
            projectId,
          })
        );
      }
    } else if (updates.assignee !== undefined) {
      const newAssignee = updates.assignee?.toString() || null;
      if (newAssignee && newAssignee !== oldAssignee) {
        await safeNotify(() =>
          notifyAssignment({
            assigneeId: newAssignee,
            actorId: req.user._id,
            task,
            projectId,
          })
        );
      }
    }

    if (updates.status !== undefined && updates.status !== oldStatus) {
      await safeNotify(() =>
        notifyStatusChange({
          project: req.project,
          actorId: req.user._id,
          task,
          projectId: req.project?._id || projectId,
          newStatus: updates.status,
        })
      );
    }

    const assigneeId = task.assignee?._id || task.assignee;
    if (assigneeId && activityEntries.length > 0) {
      for (const entry of activityEntries) {
        if (entry.field === "status" || entry.field === "assignee") continue;
        await safeNotify(() =>
          notifyAssigneeTaskUpdate({
            assigneeId,
            actorId: req.user._id,
            task,
            projectId,
            project: req.project,
            field: entry.field,
            message: entry.message,
          })
        );
      }
    }

    res.json(task);
  } catch (error) {
    console.error("updateTask error:", error);
    res.status(error.status || 500).json({ message: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    if (req.task.isDeleted) {
      return res.status(400).json({ message: "Task is already in trash" });
    }

    ensureTaskArrays(req.task);

    // Cascade: every still-active subtask (any nesting depth) goes to trash
    // with the task, tagged deletedWithTask so restoring the task brings
    // them right back without reviving anything trashed independently
    // beforehand.
    const now = new Date();
    const subtaskIds = req.task.subtasks.map((s) => s._id.toString());
    subtaskIds.forEach((id) => {
      const s = req.task.subtasks.id(id);
      if (!s) return;
      req.task.deletedSubtasks.push({
        ...s.toObject(),
        deletedAt: now,
        deletedBy: req.user._id,
        deletedWithTask: true,
      });
      s.deleteOne();
    });
    if (subtaskIds.length > 0) {
      req.task.markModified("subtasks");
      req.task.markModified("deletedSubtasks");
    }

    req.task.isDeleted = true;
    req.task.deletedAt = now;
    req.task.activityLog.push(buildDeletedEntry(req.user._id));
    req.task.markModified("activityLog");
    await req.task.save();

    const task = await populateTask(Task.findById(req.task._id));

    getIO().to(task.project.toString()).emit(EVENTS.TASK_DELETED, task._id);

    void removeTaskFromCalendarSafe(req.task._id);

    res.json({ message: "Task moved to trash", task });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const uploadTaskAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Multer should have written the file already — verify before saving metadata
    const diskPath =
      req.file.path ||
      absoluteAttachmentPath(req.task._id.toString(), req.file.filename);

    if (!fs.existsSync(diskPath)) {
      console.error("Upload missing on disk after multer:", diskPath);
      return res.status(500).json({
        message: "Upload failed: file was not saved on the server",
      });
    }

    const attachment = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
      inDescription: req.body.inDescription === "true",
    };

    const task = await populateTask(
      Task.findByIdAndUpdate(
        req.task._id,
        {
          $push: {
            attachments: attachment,
            activityLog: buildAttachmentAddedEntry(
              req.user._id,
              req.file.originalname
            ),
          },
        },
        { new: true }
      )
    );

    const projectId = task.project?._id || task.project;
    if (projectId) {
      getIO().to(projectId.toString()).emit(EVENTS.TASK_UPDATED, task);
    }

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteTaskAttachment = async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const attachment = req.task.attachments.id(attachmentId);

    if (!attachment) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    const filePath = path.join(
      uploadsRoot,
      req.task._id.toString(),
      attachment.filename
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const fileName = attachment.originalName;
    attachment.deleteOne();
    ensureTaskArrays(req.task);
    req.task.activityLog.push(buildAttachmentRemovedEntry(req.user._id, fileName));
    await req.task.save();

    const task = await populateTask(Task.findById(req.task._id));
    const projectId = task.project?._id || task.project;
    // Attachment changes update the task — they must NOT emit TASK_DELETED
    // or every open board removes the card until a full refresh.
    if (projectId) {
      getIO().to(projectId.toString()).emit(EVENTS.TASK_UPDATED, task);
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const downloadTaskAttachment = async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const attachment = req.task.attachments.id(attachmentId);

    if (!attachment) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    const taskId = req.task._id.toString();
    const filePath = resolveAttachmentFile(taskId, attachment);

    if (!filePath) {
      const expected = absoluteAttachmentPath(taskId, attachment.filename || "");
      console.error("Attachment file missing on disk:", {
        taskId,
        attachmentId,
        filename: attachment.filename,
        originalName: attachment.originalName,
        expected,
      });
      return res.status(404).json({
        message:
          "File not found on server. The file may have been deleted from disk — please re-upload it.",
        expectedPath: expected,
      });
    }

    // Heal DB if we found the file under a slightly different name
    const actualName = path.basename(filePath);
    if (attachment.filename !== actualName) {
      attachment.filename = actualName;
      await req.task.save();
    }

    const inline =
      req.query.inline === "1" ||
      req.query.inline === "true" ||
      req.query.disposition === "inline";

    const contentType =
      attachment.mimeType || "application/octet-stream";
    const safeName = String(attachment.originalName || "file").replace(
      /["\r\n]/g,
      "_"
    );

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${safeName}"`
    );
    res.setHeader("Cache-Control", "private, max-age=60");

    return res.sendFile(path.resolve(filePath));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUpcomingTasks = async (req, res) => {
  try {
    const { organizationId, personal } = req.query;
    const today = startOfToday();

    const projectResult = await getAccessibleProjectIds(req.user._id, {
      organizationId,
      personal,
    });

    if (projectResult.error) {
      return res
        .status(projectResult.error.status)
        .json({ message: projectResult.error.message });
    }

    const tasks = await Task.find({
      project: { $in: projectResult.ids },
      dueDate: { $ne: null, $gte: today },
      ...openTaskFilter(),
    })
      .populate("project", "title")
      .sort({ dueDate: 1 })
      .limit(10);

    res.json(tasks);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getTaskComments = async (req, res) => {
  try {
    const task = await populateTask(Task.findById(req.task._id));
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    res.json(task.comments || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addTaskComment = async (req, res) => {
  try {
    const { body, mentions, attachmentIds, subtaskId } = req.body;
    const text = body?.trim() || "";
    const ids = Array.isArray(attachmentIds) ? attachmentIds : [];

    if (!text && ids.length === 0) {
      return res.status(400).json({ message: "Comment cannot be empty" });
    }

    if (subtaskId && !req.task.subtasks.id(subtaskId)) {
      return res.status(404).json({ message: "Subtask not found" });
    }

    const commentAttachments = ids
      .map((id) => {
        const att = req.task.attachments.id(id);
        if (!att) return null;
        return {
          attachmentId: att._id,
          originalName: att.originalName,
          size: att.size,
        };
      })
      .filter(Boolean);

    req.task.comments.push({
      body: text,
      subtaskId: subtaskId || null,
      author: req.user._id,
      mentions: Array.isArray(mentions) ? mentions : [],
      attachments: commentAttachments,
      createdAt: new Date(),
    });

    await req.task.save();

    const task = await populateTask(Task.findById(req.task._id));
    const projectId = req.params.projectId || req.task.project;
    let mentionIds = Array.isArray(mentions) ? mentions.map(String) : [];

    if (mentionIds.length === 0 && text) {
      const parsed = await resolveMentionIdsFromText(text, req.project);
      mentionIds = parsed.map(String);
    }

    mentionIds = await filterMentionIdsByText(mentionIds, text, req.project);

    if (mentionIds.length > 0) {
      await notifyMentions({
        mentionIds,
        actorId: req.user._id,
        task,
        projectId,
        preview: text,
      });
    }

    const assigneeId = task.assignee?._id || task.assignee;
    await notifyTaskComment({
      assigneeId,
      actorId: req.user._id,
      task,
      projectId,
      project: req.project,
      mentionIds,
      preview: text,
    });

    res.status(201).json(task.comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const COMMENT_EDIT_WINDOW_MS = 2 * 60 * 1000;

const updateTaskComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const text = req.body.body?.trim() || "";

    if (!text) {
      return res.status(400).json({ message: "Comment cannot be empty" });
    }

    const comment = req.task.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You can only edit your own comments" });
    }

    const ageMs = Date.now() - new Date(comment.createdAt).getTime();
    if (ageMs > COMMENT_EDIT_WINDOW_MS) {
      return res.status(403).json({
        message: "Comments can only be edited within 2 minutes of posting",
      });
    }

    comment.body = text;
    comment.editedAt = new Date();

    await req.task.save();

    const task = await populateTask(Task.findById(req.task._id));
    res.json(task.comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTaskActivity = async (req, res) => {
  try {
    const task = await populateTask(Task.findById(req.task._id));
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Subtask entries (subtask_updated etc.) are tagged with meta.subtaskId
    // when created — filtering by it here keeps a subtask's own activity
    // view scoped to just that subtask, and keeps the parent task's own
    // activity view scoped to just the task's own changes (excluding any
    // entry tagged to a subtask, at any nesting level).
    const { subtaskId } = req.query;

    const events = (task.activityLog || [])
      .filter((entry) =>
        subtaskId
          ? entry.meta?.subtaskId?.toString() === subtaskId
          : !entry.meta?.subtaskId
      )
      .map((entry) => ({
        id: entry._id.toString(),
        source: "event",
        kind: entry.kind,
        action: entry.action,
        message: entry.message,
        field: entry.field,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        meta: entry.meta,
        actor: entry.actor
          ? {
              _id: entry.actor._id?.toString?.() || entry.actor,
              username: entry.actor.username,
              email: entry.actor.email,
            }
          : null,
        createdAt: entry.createdAt,
      }));

    // Comments are tagged with subtaskId the same way — a subtask's
    // activity view only shows comments posted while that subtask was
    // open, and the parent task's view only shows its own (untagged)
    // comments, never a subtask's discussion thread.
    const comments = (task.comments || [])
      .filter((comment) =>
        subtaskId
          ? comment.subtaskId?.toString() === subtaskId
          : !comment.subtaskId
      )
      .map((comment) => ({
      id: comment._id.toString(),
      source: "comment",
      body: comment.body,
      author: comment.author
        ? {
            _id: comment.author._id?.toString?.() || comment.author,
            username: comment.author.username,
            email: comment.author.email,
          }
        : null,
      mentions: (comment.mentions || []).map((m) => ({
        _id: m._id?.toString?.() || m,
        username: m.username,
      })),
      attachments: comment.attachments || [],
      createdAt: comment.createdAt,
      editedAt: comment.editedAt || null,
    }));

    const feed = [...events, ...comments].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    res.json(feed);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCalendarTasks = async (req, res) => {
  try {
    const { organizationId, personal } = req.query;

    const projectFilter = {
      "members.user": req.user._id,
    };

    if (organizationId) {
      projectFilter.organization = organizationId;
    } else if (personal === "true") {
      projectFilter.organization = null;
    }

    const projects = await Project.find(
  {
    ...projectFilter,
    isDeleted: { $ne: true },
  },
  "_id title"
).lean();

const projectMap = Object.fromEntries(
  projects.map((p) => [p._id.toString(), p.title])
);


   const tasks = await Task.find({
  project: {
    $in: projects.map((p) => p._id),
  },
  isDeleted: { $ne: true },
  $or: [
    { isActive: true },
    { isActive: { $exists: false } },
  ],
})
.populate("project", "title")
.sort({ dueDate: 1 })
.lean();

const result = tasks.map((task) => ({
  ...task,
  project: {
    _id: task.project?._id,
    title:
      task.project?.title ||
      projectMap[task.project?._id?.toString()],
  },
}));
      

    res.json(result);
  } catch (error) {
    console.error("CALENDAR ERROR:", error);

    res.status(500).json({
      message: error.message,
    });
  }
};

const addSubtask = async (req, res) => {
  try {
    const { title, assignee, assignees, dueDate, startDate, description, priority, status, parentSubtaskId } =
      req.body;
    const trimmed = title?.trim();
    if (!trimmed) {
      return res.status(400).json({ message: "Subtask title is required" });
    }

    const subAssignees =
      resolveAssigneeIds({ assignee, assignees }, assignee) || [];
    assertAssigneesAreProjectMembers(req.project, subAssignees);

    ensureTaskArrays(req.task);

    let parentId = null;
    if (parentSubtaskId) {
      const parent = req.task.subtasks.id(parentSubtaskId);
      if (!parent) {
        return res.status(404).json({ message: "Parent subtask not found" });
      }
      if (subtaskLevel(req.task.subtasks, parentSubtaskId) > MAX_SUBTASK_LEVEL) {
        return res.status(400).json({
          message: `Subtasks can only be nested ${MAX_SUBTASK_LEVEL} levels deep`,
        });
      }
      parentId = parent._id;
    }

    const order = req.task.subtasks.filter(
      (s) => String(s.parentSubtaskId || "") === String(parentId || "")
    ).length;
    req.task.subtasks.push({
      title: trimmed,
      description: sanitizeDescriptionHtml(description?.trim() || ""),
      assignee: subAssignees[0] || null,
      assignees: subAssignees,
      priority: priority || "medium",
      status: status || "todo",
      startDate: startDate || null,
      dueDate: dueDate || null,
      parentSubtaskId: parentId,
      order,
      createdBy: req.user._id,
      createdAt: new Date(),
    });

    const newSubtaskId = req.task.subtasks[req.task.subtasks.length - 1]._id;
    req.task.activityLog.push(
      buildSubtaskAddedEntry(req.user._id, trimmed, newSubtaskId)
    );
    req.task.markModified("subtasks");
    req.task.markModified("activityLog");
    await req.task.save();

    const task = await fetchPopulatedTask(req.task._id);
    const projectId = req.params.projectId || req.task.project;

    if (subAssignees.length > 0) {
      await safeNotify(() =>
        notifySubtaskAssignment({
          assigneeId: subAssignees[0],
          assigneeIds: subAssignees,
          actorId: req.user._id,
          task,
          projectId,
          project: req.project,
          subtaskTitle: trimmed,
          subtaskId: task.subtasks[task.subtasks.length - 1]._id,
        })
      );
    }

    res.status(201).json(task);
  } catch (error) {
    console.error("addSubtask error:", error);
    res.status(500).json({ message: error.message });
  }
};

const updateSubtask = async (req, res) => {
  try {
    const { subtaskId } = req.params;
    const subtask = req.task.subtasks.id(subtaskId);
    if (!subtask) {
      return res.status(404).json({ message: "Subtask not found" });
    }

    const oldAssignee = subtask.assignee?.toString() || null;
    const oldAssignees = (subtask.assignees || []).map((id) => id.toString());
    const {
      title,
      assignee,
      assignees,
      completed,
      dueDate,
      startDate,
      description,
      priority,
      status,
      effortHours,
      durationHours,
      workingDays,
    } = req.body;

    if (title !== undefined) {
      const trimmed = title?.trim();
      if (!trimmed) {
        return res.status(400).json({ message: "Subtask title cannot be empty" });
      }
      subtask.title = trimmed;
    }
    if (description !== undefined) {
      subtask.description = sanitizeDescriptionHtml(description?.trim() || "");
    }
    if (priority !== undefined) {
      subtask.priority = priority || "medium";
    }
    if (status !== undefined) {
      subtask.status = status || "todo";
      subtask.completed = subtask.status === "completed";
    }
    if (assignee !== undefined || assignees !== undefined) {
      const subAssignees = resolveAssigneeIds({ assignee, assignees });
      if (subAssignees !== undefined) {
        assertAssigneesAreProjectMembers(req.project, subAssignees);
        subtask.assignees = subAssignees;
        subtask.assignee = subAssignees[0] || null;
      }
    }
    if (completed !== undefined) {
      subtask.completed = Boolean(completed);
      if (completed) {
        subtask.status = "completed";
      } else if (subtask.status === "completed") {
        subtask.status = "todo";
      }
    }
    if (startDate !== undefined) subtask.startDate = startDate || null;
    if (dueDate !== undefined) subtask.dueDate = dueDate || null;
    if (effortHours !== undefined) subtask.effortHours = effortHours;
    if (durationHours !== undefined) subtask.durationHours = durationHours;
    if (workingDays !== undefined) {
      subtask.workingDays =
        workingDays === null
          ? null
          : normalizeWorkingDaysInput(workingDays);
    }
    if (
      startDate !== undefined ||
      dueDate !== undefined ||
      workingDays !== undefined
    ) {
      const subWorkingDays =
        Array.isArray(subtask.workingDays) && subtask.workingDays.length > 0
          ? subtask.workingDays
          : DEFAULT_WORKING_DAYS;
      subtask.workingDayCount = calcWorkingDayCount(
        subtask.startDate,
        subtask.dueDate,
        subWorkingDays
      );
    }

    const detail =
      completed === true
        ? `completed subtask "${subtask.title}"`
        : assignee !== undefined || assignees !== undefined
          ? `updated assignees on subtask "${subtask.title}"`
          : `updated subtask "${subtask.title}"`;

    ensureTaskArrays(req.task);
    req.task.activityLog.push(
      buildSubtaskUpdatedEntry(req.user._id, subtask.title, detail, subtask._id)
    );
    req.task.markModified("subtasks");
    req.task.markModified("activityLog");
    await req.task.save();

    const task = await fetchPopulatedTask(req.task._id);
    const projectId = req.params.projectId || req.task.project;

    if (assignee !== undefined || assignees !== undefined) {
      const newAssignees = (subtask.assignees || []).map((id) => id.toString());
      const added = newAssignees.filter((id) => !oldAssignees.includes(id));
      if (added.length > 0) {
        await safeNotify(() =>
          notifySubtaskAssignment({
            assigneeId: added[0],
            assigneeIds: newAssignees,
            actorId: req.user._id,
            task,
            projectId,
            project: req.project,
            subtaskTitle: subtask.title,
            subtaskId: subtask._id,
          })
        );
      }
    }

    res.json(task);
  } catch (error) {
    console.error("updateSubtask error:", error);
    res.status(500).json({ message: error.message });
  }
};

const deleteSubtask = async (req, res) => {
  try {
    const { subtaskId } = req.params;
    const subtask = req.task.subtasks.id(subtaskId);
    if (!subtask) {
      return res.status(404).json({ message: "Subtask not found" });
    }

    const title = subtask.title;

    // Cascade: a deleted subtask's own nested subtasks (any depth) move to
    // trash along with it — otherwise they'd be left as orphans referencing
    // a parentSubtaskId that no longer exists in the active `subtasks` list.
    const idsToDelete = new Set([subtaskId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const s of req.task.subtasks) {
        const pid = s.parentSubtaskId?.toString();
        if (pid && idsToDelete.has(pid) && !idsToDelete.has(s._id.toString())) {
          idsToDelete.add(s._id.toString());
          grew = true;
        }
      }
    }

    ensureTaskArrays(req.task);

    const now = new Date();
    idsToDelete.forEach((id) => {
      const s = req.task.subtasks.id(id);
      if (!s) return;
      req.task.deletedSubtasks.push({
        ...s.toObject(),
        deletedAt: now,
        deletedBy: req.user._id,
        deletedWithTask: false,
        // The subtask the user directly deleted has no trigger of its own;
        // everything pulled down with it in the cascade is tagged with its
        // id, so restoring it later brings back exactly this batch.
        deletedWithSubtaskId: id === subtaskId ? null : subtaskId,
      });
      s.deleteOne();
    });

    req.task.activityLog.push(
      buildSubtaskRemovedEntry(req.user._id, title, subtaskId)
    );
    req.task.markModified("subtasks");
    req.task.markModified("deletedSubtasks");
    req.task.markModified("activityLog");
    await req.task.save();

    const task = await fetchPopulatedTask(req.task._id);
    res.json(task);
  } catch (error) {
    console.error("deleteSubtask error:", error);
    res.status(500).json({ message: error.message });
  }
};


module.exports = {
  createTask,
  getTasksByProject,
  getTask,
  updateTask,
  deleteTask,
  uploadTaskAttachment,
  deleteTaskAttachment,
  downloadTaskAttachment,
  getTaskComments,
  addTaskComment,
  updateTaskComment,
  getTaskActivity,
  getCalendarTasks,
  getUpcomingTasks,
  addSubtask,
  updateSubtask,
  deleteSubtask,
};
