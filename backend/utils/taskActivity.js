const User = require("../models/user");

function toId(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return value._id.toString();
  return value.toString();
}

function toDateKey(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatDate(value) {
  if (!value) return "none";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return "none";
  return tags.join(", ");
}

function formatEffort(hours) {
  if (hours == null) return "off";
  return `${hours}h`;
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  }
  return String(a) === String(b);
}

async function resolveUsernames(userIds) {
  const unique = [...new Set(userIds.filter(Boolean).map((id) => id.toString()))];
  if (unique.length === 0) return new Map();

  const users = await User.find({ _id: { $in: unique } }).select("username");
  return new Map(users.map((u) => [u._id.toString(), u.username]));
}

function buildEntry(actorId, payload) {
  return {
    kind: payload.kind || "change",
    action: payload.action,
    message: payload.message,
    field: payload.field || null,
    oldValue: payload.oldValue ?? null,
    newValue: payload.newValue ?? null,
    meta: payload.meta || null,
    actor: actorId,
    createdAt: new Date(),
  };
}

async function buildTaskUpdateEntries(task, updates, actorId) {
  const entries = [];
  const assigneeIds = [
    task.assignee,
    updates.assignee,
    ...(Array.isArray(task.assignees) ? task.assignees : []),
    ...(Array.isArray(updates.assignees) ? updates.assignees : []),
  ].filter(Boolean);
  const nameMap = await resolveUsernames(assigneeIds);

  const assigneeName = (id) => {
    if (!id) return "Unassigned";
    return nameMap.get(toId(id)) || "someone";
  };

  const formatAssigneeList = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return "Unassigned";
    return ids.map((id) => assigneeName(id)).join(", ");
  };

  if (updates.title !== undefined && !valuesEqual(task.title, updates.title)) {
    entries.push(
      buildEntry(actorId, {
        action: "title_changed",
        message: `changed the title to "${updates.title}"`,
        field: "title",
        oldValue: task.title,
        newValue: updates.title,
      })
    );
  }

  if (
    updates.description !== undefined &&
    !valuesEqual(task.description, updates.description)
  ) {
    entries.push(
      buildEntry(actorId, {
        action: "description_changed",
        message: "updated the description",
        field: "description",
        // Kept out of oldValue/newValue (rendered inline as plain text
        // elsewhere) since these are full HTML strings; the diff popup
        // reads them from meta instead.
        meta: {
          previousDescription: task.description || "",
          newDescription: updates.description || "",
        },
      })
    );
  }

  if (updates.status !== undefined && !valuesEqual(task.status, updates.status)) {
    entries.push(
      buildEntry(actorId, {
        action: "status_changed",
        message: `changed status from "${task.status}" to "${updates.status}"`,
        field: "status",
        oldValue: task.status,
        newValue: updates.status,
      })
    );
  }

  if (
    updates.priority !== undefined &&
    !valuesEqual(task.priority, updates.priority)
  ) {
    entries.push(
      buildEntry(actorId, {
        action: "priority_changed",
        message: `changed priority from "${task.priority}" to "${updates.priority}"`,
        field: "priority",
        oldValue: task.priority,
        newValue: updates.priority,
      })
    );
  }

  if (updates.assignees !== undefined) {
    const oldIds = (task.assignees || []).map((id) => toId(id)).filter(Boolean);
    const newIds = (updates.assignees || []).map((id) => toId(id)).filter(Boolean);
    if (!valuesEqual(oldIds, newIds)) {
      entries.push(
        buildEntry(actorId, {
          action: "assigned",
          message: `assigned this task to ${formatAssigneeList(newIds)}`,
          field: "assignee",
          oldValue: formatAssigneeList(oldIds),
          newValue: formatAssigneeList(newIds),
        })
      );
    }
  } else if (updates.assignee !== undefined) {
    const oldId = toId(task.assignee);
    const newId = toId(updates.assignee);
    if (!valuesEqual(oldId, newId)) {
      entries.push(
        buildEntry(actorId, {
          action: "assigned",
          message: `assigned this task to ${assigneeName(updates.assignee)}`,
          field: "assignee",
          oldValue: assigneeName(task.assignee),
          newValue: assigneeName(updates.assignee),
        })
      );
    }
  }

  if (updates.dueDate !== undefined) {
    const oldDue = toDateKey(task.dueDate);
    const newDue = toDateKey(updates.dueDate);
    if (!valuesEqual(oldDue, newDue)) {
      entries.push(
        buildEntry(actorId, {
          action: "due_date_changed",
          message: `changed due date from ${formatDate(task.dueDate)} to ${formatDate(updates.dueDate)}`,
          field: "dueDate",
          oldValue: formatDate(task.dueDate),
          newValue: formatDate(updates.dueDate),
        })
      );
    }
  }

  if (updates.startDate !== undefined) {
    const oldStart = toDateKey(task.startDate);
    const newStart = toDateKey(updates.startDate);
    if (!valuesEqual(oldStart, newStart)) {
      entries.push(
        buildEntry(actorId, {
          action: "start_date_changed",
          message: `changed start date from ${formatDate(task.startDate)} to ${formatDate(updates.startDate)}`,
          field: "startDate",
          oldValue: formatDate(task.startDate),
          newValue: formatDate(updates.startDate),
        })
      );
    }
  }

  if (
    updates.durationHours !== undefined &&
    !valuesEqual(task.durationHours, updates.durationHours)
  ) {
    entries.push(
      buildEntry(actorId, {
        action: "duration_changed",
        message: `updated the schedule duration`,
        field: "durationHours",
        oldValue: task.durationHours != null ? String(task.durationHours) : null,
        newValue:
          updates.durationHours != null ? String(updates.durationHours) : null,
      })
    );
  }

  if (
    updates.effortHours !== undefined &&
    !valuesEqual(task.effortHours, updates.effortHours)
  ) {
    entries.push(
      buildEntry(actorId, {
        action: "effort_changed",
        message: `changed effort from ${formatEffort(task.effortHours)} to ${formatEffort(updates.effortHours)}`,
        field: "effortHours",
        oldValue: formatEffort(task.effortHours),
        newValue: formatEffort(updates.effortHours),
      })
    );
  }

  if (updates.tags !== undefined && !valuesEqual(task.tags, updates.tags)) {
    entries.push(
      buildEntry(actorId, {
        action: "tags_changed",
        message: `updated tags`,
        field: "tags",
        oldValue: formatTags(task.tags),
        newValue: formatTags(updates.tags),
      })
    );
  }

  if (
    updates.workingDays !== undefined &&
    !valuesEqual(task.workingDays, updates.workingDays)
  ) {
    entries.push(
      buildEntry(actorId, {
        action: "working_days_changed",
        message: "updated working days",
        field: "workingDays",
      })
    );
  }

  if (updates.dependencies !== undefined) {
    const summarize = (deps) => {
      if (!Array.isArray(deps) || deps.length === 0) return "none";
      return deps
        .map((d) => {
          const id =
            d?.taskId && typeof d.taskId === "object" && d.taskId._id
              ? String(d.taskId._id)
              : String(d?.taskId || "");
          const type = d?.type || "FS";
          const lag = Number(d?.lagDays) || 0;
          const lagPart = lag === 0 ? "" : lag > 0 ? `+${lag}d` : `${lag}d`;
          return `${type}${lagPart}:${id.slice(-6) || "?"}`;
        })
        .sort()
        .join(", ");
    };
    const oldSummary = summarize(task.dependencies);
    const newSummary = summarize(updates.dependencies);
    if (!valuesEqual(oldSummary, newSummary)) {
      entries.push(
        buildEntry(actorId, {
          action: "dependencies_changed",
          message: `updated dependencies from ${oldSummary} to ${newSummary}`,
          field: "dependencies",
          oldValue: oldSummary,
          newValue: newSummary,
        })
      );
    }
  }

  return entries;
}

function buildCreatedEntry(actorId, title) {
  return buildEntry(actorId, {
    kind: "created",
    action: "created",
    message: `created this task "${title}"`,
  });
}

function buildAttachmentAddedEntry(actorId, fileName) {
  return buildEntry(actorId, {
    kind: "attachment",
    action: "attachment_added",
    message: `attached ${fileName}`,
    meta: { fileName },
  });
}

function buildAttachmentRemovedEntry(actorId, fileName) {
  return buildEntry(actorId, {
    kind: "attachment",
    action: "attachment_removed",
    message: `removed attachment ${fileName}`,
    meta: { fileName },
  });
}

function buildDeletedEntry(actorId) {
  return buildEntry(actorId, {
    kind: "deleted",
    action: "deleted",
    message: "moved this task to trash",
  });
}

function buildSubtaskAddedEntry(actorId, title, subtaskId) {
  return buildEntry(actorId, {
    kind: "change",
    action: "subtask_added",
    message: `added subtask "${title}"`,
    field: "subtask",
    meta: { title, subtaskId: toId(subtaskId) },
  });
}

function buildSubtaskUpdatedEntry(actorId, title, detail, subtaskId) {
  return buildEntry(actorId, {
    kind: "change",
    action: "subtask_updated",
    message: detail || `updated subtask "${title}"`,
    field: "subtask",
    meta: { title, subtaskId: toId(subtaskId) },
  });
}

function buildSubtaskRemovedEntry(actorId, title, subtaskId) {
  return buildEntry(actorId, {
    kind: "change",
    action: "subtask_removed",
    message: `removed subtask "${title}"`,
    field: "subtask",
    meta: { title, subtaskId: toId(subtaskId) },
  });
}

module.exports = {
  buildTaskUpdateEntries,
  buildCreatedEntry,
  buildAttachmentAddedEntry,
  buildAttachmentRemovedEntry,
  buildDeletedEntry,
  buildSubtaskAddedEntry,
  buildSubtaskUpdatedEntry,
  buildSubtaskRemovedEntry,
};
