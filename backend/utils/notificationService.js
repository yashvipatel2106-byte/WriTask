const Project = require("../models/Project");
const Organization = require("../models/Organization");
const Notification = require("../models/Notification");
const { resolveMemberUserId } = require("./projectAccess");

const DEFAULT_STATUS_LABELS = {
  todo: "To Do",
  "in-progress": "In Progress",
  review: "Review",
  completed: "Completed",
};

function resolveUserId(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return value._id.toString();
  return value.toString();
}

function isUserMentionedInText(text, username) {
  if (!text?.trim() || !username) return false;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@${escaped}(?![\\w])`, "i").test(text);
}

function resolveStatusLabel(statusId, project) {
  const custom = (project?.customStatuses || []).find((s) => s.id === statusId);
  if (custom) return custom.label;
  return DEFAULT_STATUS_LABELS[statusId] || statusId;
}

async function ensureProjectWithMembers(project) {
  if (!project) return null;

  let proj = project;
  if (!project.members || typeof project.members[0]?.user === "string") {
    proj = await Project.findById(project._id || project).populate(
      "members.user",
      "username email"
    );
  }

  if (!proj) return null;

  if (
    proj.organization &&
    proj.members.some((m) => m.user && !m.user.username)
  ) {
    await proj.populate("members.user", "username email");
  }

  if (proj.members.length === 0 && proj.owner) {
    const ownerId = resolveUserId(proj.owner);
    if (ownerId) {
      proj.members.push({ user: ownerId, role: "owner" });
    }
  }

  return proj;
}

async function getProjectTeamUserIds(project) {
  const proj = await ensureProjectWithMembers(project);
  if (!proj) return [];

  const ids = new Set();
  for (const member of proj.members || []) {
    const id = resolveMemberUserId(member);
    if (id) ids.add(id);
  }

  const ownerId = resolveUserId(proj.owner);
  if (ownerId) ids.add(ownerId);

  return [...ids];
}

async function getOwnerUserIds(project) {
  const proj = await ensureProjectWithMembers(project);
  if (!proj) return [];

  const ids = new Set();
  const projectOwnerId = resolveUserId(proj.owner);
  if (projectOwnerId) ids.add(projectOwnerId);

  if (proj.organization) {
    const orgId = resolveUserId(proj.organization);
    const organization = await Organization.findById(orgId).select("owner");
    const orgOwnerId = resolveUserId(organization?.owner);
    if (orgOwnerId) ids.add(orgOwnerId);
  }

  return [...ids];
}

async function getTaskWatcherUserIds({
  project,
  task,
  includeAssignee = true,
  includeCreator = true,
  includeOwners = true,
}) {
  const ids = new Set();

  if (includeAssignee) {
    const assigneeList = Array.isArray(task?.assignees) ? task.assignees : [];
    if (assigneeList.length > 0) {
      assigneeList.forEach((entry) => {
        const id = resolveUserId(entry);
        if (id) ids.add(id);
      });
    } else {
      const assigneeId = resolveUserId(task?.assignee);
      if (assigneeId) ids.add(assigneeId);
    }
  }

  if (includeCreator) {
    const creatorId = resolveUserId(task?.createdBy);
    if (creatorId) ids.add(creatorId);
  }

  if (includeOwners) {
    const ownerIds = await getOwnerUserIds(project);
    ownerIds.forEach((id) => ids.add(id));
  }

  return [...ids];
}

async function resolveMentionIdsFromText(text, project) {
  if (!text?.trim() || !project) return [];

  const proj = await ensureProjectWithMembers(project);
  if (!proj) return [];

  const ids = new Set();
  for (const member of proj.members || []) {
    const username = member.user?.username;
    if (!username) continue;
    if (isUserMentionedInText(text, username)) {
      const id = resolveUserId(member.user);
      if (id) ids.add(id);
    }
  }

  return [...ids];
}

async function filterMentionIdsByText(mentionIds, text, project) {
  if (!Array.isArray(mentionIds) || mentionIds.length === 0) return [];

  const proj = await ensureProjectWithMembers(project);
  if (!proj) return [];

  const byId = new Map();
  for (const member of proj.members || []) {
    const id = resolveUserId(member.user);
    if (id) byId.set(id, member.user?.username || "");
  }

  return [
    ...new Set(
      mentionIds
        .map((id) => resolveUserId(id))
        .filter((id) => {
          if (!id) return false;
          const username = byId.get(id);
          return username && isUserMentionedInText(text, username);
        })
    ),
  ];
}

async function createNotification({
  userId,
  actorId = null,
  type = "system",
  title,
  message,
  taskId = null,
  projectId = null,
  priority = "Medium",
  link = "",
}) {
  if (!userId || !title || !message) return null;

  const recipient = resolveUserId(userId);
  if (actorId && resolveUserId(actorId) === recipient) {
    return null;
  }

  return Notification.create({
    user: userId,
    actor: actorId,
    type,
    title,
    message,
    taskId,
    projectId,
    priority,
    link,
  });
}

async function notifyRecipients({
  userIds,
  actorId,
  type,
  title,
  message,
  taskId = null,
  projectId = null,
  priority = "Medium",
  link = "",
}) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const actor = resolveUserId(actorId);
  const unique = [
    ...new Set(userIds.map((id) => resolveUserId(id)).filter(Boolean)),
  ].filter((id) => id !== actor);

  await Promise.all(
    unique.map((userId) =>
      createNotification({
        userId,
        actorId,
        type,
        title,
        message,
        taskId,
        projectId,
        priority,
        link,
      })
    )
  );
}

async function notifyAssignment({ assigneeId, actorId, task, projectId }) {
  if (!assigneeId || !task) return null;

  const pid = resolveUserId(projectId) || resolveUserId(task.project);

  const project = await ensureProjectWithMembers(pid);
  const recipients = await getTaskWatcherUserIds({
    project,
    task,
    includeAssignee: true,
    includeCreator: false,
    includeOwners: true,
  });

  await notifyRecipients({
    userIds: recipients,
    actorId,
    type: "assignment",
    title: "Task assigned",
    message: `Task "${task.title}" was assigned`,
    taskId: task._id,
    projectId: pid,
    priority: task.priority === "high" ? "High" : "Medium",
    link: `/projects/${pid}?task=${task._id}&tab=activity`,
  });
}

async function notifySubtaskAssignment({
  assigneeId,
  assigneeIds = [],
  actorId,
  task,
  projectId,
  project = null,
  subtaskTitle,
  subtaskId = null,
}) {
  if (!task || !subtaskTitle) return null;

  const pid = resolveUserId(projectId) || resolveUserId(task.project);
  const primaryAssignee = assigneeId || assigneeIds[0];
  const recipients = await getTaskWatcherUserIds({
    project: project || (await ensureProjectWithMembers(pid)),
    task: { ...task, assignee: primaryAssignee, assignees: assigneeIds },
    includeAssignee: true,
    includeCreator: true,
    includeOwners: true,
  });

  const link = subtaskId
    ? `/projects/${pid}?task=${task._id}&subtask=${subtaskId}&tab=activity`
    : `/projects/${pid}?task=${task._id}&tab=activity`;

  await notifyRecipients({
    userIds: recipients,
    actorId,
    type: "assignment",
    title: "Subtask assigned",
    message: `Subtask "${subtaskTitle}" on "${task.title}" was assigned`,
    taskId: task._id,
    projectId: pid,
    priority: "Medium",
    link,
  });
}

async function notifyMentions({
  mentionIds,
  actorId,
  task,
  projectId,
  preview,
}) {
  if (!Array.isArray(mentionIds) || mentionIds.length === 0 || !task) return;

  const snippet = (preview || "").slice(0, 160);
  const pid = resolveUserId(projectId) || resolveUserId(task.project);
  const recipients = [
    ...new Set(mentionIds.map((id) => resolveUserId(id)).filter(Boolean)),
  ];

  await notifyRecipients({
    userIds: recipients,
    actorId,
    type: "mention",
    title: "You were mentioned",
    message: snippet || `Mentioned on "${task.title}"`,
    taskId: task._id,
    projectId: pid,
    priority: "High",
    link: `/projects/${pid}?task=${task._id}&tab=activity`,
  });
}

async function notifyTaskComment({
  assigneeId,
  actorId,
  task,
  projectId,
  project = null,
  mentionIds = [],
  preview,
}) {
  if (!task) return null;

  const pid = resolveUserId(projectId) || resolveUserId(task.project);
  const recipients = await getTaskWatcherUserIds({
    project: project || (await ensureProjectWithMembers(pid)),
    task: { ...task, assignee: assigneeId || task.assignee },
    includeAssignee: true,
    includeCreator: true,
    includeOwners: true,
  });
  const excluded = new Set((mentionIds || []).map((id) => resolveUserId(id)));
  const actor = resolveUserId(actorId);
  const filtered = recipients.filter(
    (id) => !excluded.has(id) && id !== actor
  );

  return notifyRecipients({
    userIds: filtered,
    actorId,
    type: "comment",
    title: "New comment on your task",
    message: (preview || "").slice(0, 160) || `Comment on "${task.title}"`,
    taskId: task._id,
    projectId: pid,
    priority: "Medium",
    link: `/projects/${pid}?task=${task._id}&tab=activity`,
  });
}

async function notifyStatusChange({
  project,
  actorId,
  task,
  projectId,
  newStatus,
}) {
  if (!task || !newStatus) return;

  const proj = await ensureProjectWithMembers(project);
  const pid = resolveUserId(projectId) || resolveUserId(task.project);
  const statusLabel = resolveStatusLabel(newStatus, proj);
  let memberIds = await getTaskWatcherUserIds({
    project: proj,
    task,
    includeAssignee: true,
    includeCreator: true,
    includeOwners: true,
  });

  await notifyRecipients({
    userIds: memberIds,
    actorId,
    type: "status",
    title: "Task status updated",
    message: `"${task.title}" is now ${statusLabel}`,
    taskId: task._id,
    projectId: pid,
    priority: "Low",
    link: `/projects/${pid}?task=${task._id}&tab=activity`,
  });
}

async function notifyAssigneeTaskUpdate({
  assigneeId,
  actorId,
  task,
  projectId,
  project = null,
  field,
  message,
}) {
  if (!task || !message) return null;

  const pid = resolveUserId(projectId) || resolveUserId(task.project);
  const type = field === "dueDate" ? "due_date" : "system";
  const recipients = await getTaskWatcherUserIds({
    project: project || (await ensureProjectWithMembers(pid)),
    task: { ...task, assignee: assigneeId || task.assignee },
    includeAssignee: true,
    includeCreator: true,
    includeOwners: true,
  });

  return notifyRecipients({
    userIds: recipients,
    actorId,
    type,
    title: "Task updated",
    message: `"${task.title}": ${message}`,
    taskId: task._id,
    projectId: pid,
    priority: "Medium",
    link: `/projects/${pid}?task=${task._id}&tab=activity`,
  });
}

module.exports = {
  createNotification,
  notifyRecipients,
  getProjectTeamUserIds,
  getTaskWatcherUserIds,
  resolveMentionIdsFromText,
  filterMentionIdsByText,
  isUserMentionedInText,
  resolveStatusLabel,
  notifyAssignment,
  notifySubtaskAssignment,
  notifyMentions,
  notifyTaskComment,
  notifyStatusChange,
  notifyAssigneeTaskUpdate,
};
