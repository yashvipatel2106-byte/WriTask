const Task = require("../models/Task");
const User = require("../models/user");
const { createTaskService, createSubtaskService } = require("./taskService");
const { syncTasksToCalendarBatch } = require("../utils/calendarTaskSync");

const REQUIRED_COLUMNS = [
  "Task Name",
  "Description",
  "Assignee Email",
  "Status",
  "Start Date",
  "Due Date",
  "Estimated Hours",
];

const BUILTIN_STATUSES = [
  { id: "todo", label: "Todo" },
  { id: "in-progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "completed", label: "Completed" },
];

const STATUS_ALIASES = new Map([
  ["todo", "todo"],
  ["to do", "todo"],
  ["in progress", "in-progress"],
  ["in-progress", "in-progress"],
  ["review", "review"],
  ["done", "completed"],
  ["completed", "completed"],
]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

// Statuses aren't a fixed enum — each project can add its own custom Kanban
// columns (Project.customStatuses), so the accepted set has to be built
// per-project instead of hardcoded to the 4 built-in ones.
function buildStatusAliases(project) {
  const aliases = new Map(STATUS_ALIASES);
  const customStatuses = Array.isArray(project?.customStatuses) ? project.customStatuses : [];
  for (const status of customStatuses) {
    const id = normalizeText(status?.id);
    const label = normalizeText(status?.label);
    if (!id) continue;
    if (label) aliases.set(label.toLowerCase(), id);
    aliases.set(id.toLowerCase(), id);
  }
  return aliases;
}

function statusOptionsLabel(project) {
  const customLabels = (Array.isArray(project?.customStatuses) ? project.customStatuses : [])
    .map((status) => normalizeText(status?.label))
    .filter(Boolean);
  return [...BUILTIN_STATUSES.map((status) => status.label), ...customLabels].join(", ");
}

function normalizeStatus(value, statusAliases) {
  return statusAliases.get(normalizeText(value).toLowerCase()) || null;
}

function expandTwoDigitYear(year) {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function buildUtcDate(year, month, day) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
    );
  }

  // Excel serial date (ignore tiny fractions that are not real calendar dates)
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Math.floor(value) * 86400000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = normalizeText(value);
  if (!text) return null;

  // Strip optional time portion: "07/08/2025 00:00:00" or "07/08/2025T10:30"
  const datePart = text.split(/[T\s]/)[0].trim();

  // ISO: YYYY-MM-DD (also YYYY/MM/DD)
  const isoMatch = datePart.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildUtcDate(Number(year), Number(month), Number(day));
  }

  // Day-first local formats used by Excel/CSV exports:
  // 07/08/2025, 7-8-25, 07.08.2025, and yearless 07/08 or 7-8 (current year)
  const dayFirstMatch = datePart.match(
    /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/
  );
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = Number(dayFirstMatch[2]);
    const rawYear = dayFirstMatch[3]
      ? Number(dayFirstMatch[3])
      : new Date().getFullYear();
    const year = expandTwoDigitYear(rawYear);
    return buildUtcDate(year, month, day);
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split "Assignee Email" into unique addresses. Comma or semicolon separated. */
function parseAssigneeEmails(value) {
  const text = normalizeText(value);
  if (!text) return [];

  const seen = new Set();
  const emails = [];
  for (const part of text.split(/[,;]+/)) {
    const email = normalizeText(part).toLowerCase();
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Resolve every email in the cell to a project-member user id.
 * Returns { assigneeIds } on success, or { error } with a row message.
 */
async function resolveAssigneeIds(rawValue, project) {
  const emails = parseAssigneeEmails(rawValue);
  if (!emails.length) {
    return { error: "Assignee Email is required." };
  }

  const invalid = emails.filter((email) => !looksLikeEmail(email));
  if (invalid.length) {
    return {
      error: `Invalid Assignee Email format: ${invalid.join(", ")}. Separate multiple emails with commas.`,
    };
  }

  const users = await User.find({
    $or: emails.map((email) => ({
      email: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
    })),
  })
    .select("_id email")
    .lean();

  const byEmail = new Map(
    users.map((user) => [normalizeText(user.email).toLowerCase(), user])
  );

  const missing = emails.filter((email) => !byEmail.has(email));
  if (missing.length) {
    return {
      error:
        missing.length === 1
          ? `Assignee Email not found: ${missing[0]}.`
          : `Assignee Emails not found: ${missing.join(", ")}.`,
    };
  }

  const assigneeIds = [];
  const notMembers = [];
  for (const email of emails) {
    const user = byEmail.get(email);
    if (!project.isMember(user._id)) {
      notMembers.push(email);
      continue;
    }
    assigneeIds.push(user._id);
  }

  if (notMembers.length) {
    return {
      error:
        notMembers.length === 1
          ? `Assignee is not a member of this project: ${notMembers[0]}. Being a member of the organization isn't enough — add them on this project's Members page first.`
          : `These assignees are not members of this project: ${notMembers.join(", ")}. Add them on this project's Members page first.`,
    };
  }

  return { assigneeIds };
}

function validateHeaders(rows) {
  if (!rows.length) {
    return { valid: false, message: "Excel file is empty." };
  }

  const columns = new Set(Object.keys(rows[0]).map((column) => column.trim()));
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));

  return missing.length
    ? { valid: false, message: `Missing column: ${missing.join(", ")}` }
    : { valid: true };
}

function validateRow(row, rowNumber, statusAliases, project) {
  const errors = [];
  const status = normalizeStatus(row["Status"], statusAliases);
  const startDate = parseDate(row["Start Date"]);
  const dueDate = parseDate(row["Due Date"]);
  const estimatedHours = Number(row["Estimated Hours"]);

  const title = normalizeText(row["Task Name"]);
  const parentTitle = normalizeText(row["Parent Task"]);
  const assigneeEmails = parseAssigneeEmails(row["Assignee Email"]);

  if (!title) errors.push("Task Name is required.");
  if (parentTitle && title && taskNameKey(parentTitle) === taskNameKey(title)) {
    errors.push("Parent Task cannot be the same as this task's own Task Name.");
  }
  if (!assigneeEmails.length) {
    errors.push("Assignee Email is required.");
  } else {
    const invalid = assigneeEmails.filter((email) => !looksLikeEmail(email));
    if (invalid.length) {
      errors.push(
        `Invalid Assignee Email format: ${invalid.join(", ")}. Separate multiple emails with commas.`
      );
    }
  }
  if (!status) errors.push(`Status must be one of: ${statusOptionsLabel(project)}.`);
  if (!startDate) errors.push("Start Date is invalid or missing.");
  if (!dueDate) errors.push("Due Date is invalid or missing.");
  if (startDate && dueDate && dueDate < startDate) {
    errors.push("Due Date cannot be before Start Date.");
  }
  if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) {
    errors.push("Estimated Hours must be greater than zero.");
  }

  return { row: rowNumber, valid: errors.length === 0, errors };
}

function rowError(row, message) {
  return { row: row.rowNumber, message };
}

function taskNameKey(value) {
  return normalizeText(value).toLocaleLowerCase();
}

async function processImportRows({ rows, project, user }) {
  const errors = [];
  const candidates = [];
  const importedNames = new Set();
  const statusAliases = buildStatusAliases(project);
  // Every Task Name that appears anywhere in the file, whether or not its own
  // row passed validation — used to tell "this parent name is a typo / not in
  // the file" apart from "this parent's own row failed, so it never got
  // created" when reporting Parent Task errors below.
  const allFileTaskNames = new Set();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const title = normalizeText(row["Task Name"]);
    if (title) allFileTaskNames.add(taskNameKey(title));

    const validation = validateRow(row, rowNumber, statusAliases, project);
    if (!validation.valid) {
      errors.push(...validation.errors.map((message) => ({ row: rowNumber, message })));
      continue;
    }

    const key = taskNameKey(title);
    if (importedNames.has(key)) {
      errors.push({ row: rowNumber, message: "Duplicate Task Name in import file." });
      continue;
    }
    importedNames.add(key);
    candidates.push({ row, rowNumber, title, key });
  }

  const createdByName = new Map();
  const createdTasksForCalendar = [];
  let createdCount = 0;
  const pending = [...candidates];

  while (pending.length) {
    let createdThisPass = 0;

    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const candidate = pending[index];
      const { row, rowNumber, title } = candidate;
      const parentTitle = normalizeText(row["Parent Task"]);

      let parentTask = null;
      if (parentTitle) {
        parentTask = createdByName.get(taskNameKey(parentTitle)) ||
          await Task.findOne({ project: project._id, title: parentTitle }).select("_id").lean();

        const parentIsStillPending = pending.some(
          (item) => item !== candidate && taskNameKey(item.title) === taskNameKey(parentTitle)
        );
        if (!parentTask && parentIsStillPending) continue;
        if (!parentTask) {
          const message = allFileTaskNames.has(taskNameKey(parentTitle))
            ? `Parent Task "${parentTitle}" failed to import (see its own row's error) — this task was skipped as a result.`
            : "Parent Task not found.";
          errors.push(rowError(candidate, message));
          pending.splice(index, 1);
          continue;
        }
      }

      const duplicate = await Task.exists({ project: project._id, title });
      if (duplicate) {
        errors.push(rowError(candidate, "Duplicate Task Name."));
        pending.splice(index, 1);
        continue;
      }

      const resolved = await resolveAssigneeIds(row["Assignee Email"], project);
      if (resolved.error) {
        errors.push(rowError(candidate, resolved.error));
        pending.splice(index, 1);
        continue;
      }
      const { assigneeIds } = resolved;

      try {
        const estimatedHours = Number(row["Estimated Hours"]);
        if (parentTask) {
          await createSubtaskService({
            parentTaskId: parentTask._id,
            project,
            user,
            title,
            description: normalizeText(row["Description"]),
            assigneeIds,
            status: normalizeStatus(row["Status"], statusAliases),
            startDate: parseDate(row["Start Date"]),
            dueDate: parseDate(row["Due Date"]),
            effortHours: estimatedHours,
          });
        } else {
          const task = await createTaskService({
            project,
            user,
            title,
            description: normalizeText(row["Description"]),
            assigneeIds,
            status: normalizeStatus(row["Status"], statusAliases),
            startDate: parseDate(row["Start Date"]),
            dueDate: parseDate(row["Due Date"]),
            durationHours: estimatedHours,
            effortHours: estimatedHours,
          });
          createdByName.set(candidate.key, task);
          if (task?.dueDate) createdTasksForCalendar.push(task);
        }
        createdCount += 1;
      } catch (error) {
        errors.push(rowError(candidate, error.message || "Unable to create task."));
      }

      pending.splice(index, 1);
      createdThisPass += 1;
    }

    if (!createdThisPass) {
      for (const candidate of pending) {
        errors.push(rowError(candidate, "Parent Task could not be resolved."));
      }
      break;
    }
  }

  // Final calendar pass — guarantees every imported parent task with a due
  // date is visible on the org calendar with assignees linked for filtering,
  // editing, and task deep-links.
  if (createdTasksForCalendar.length > 0) {
    await syncTasksToCalendarBatch(createdTasksForCalendar);
  }

  return {
    totalRows: rows.length,
    created: createdCount,
    failed: new Set(errors.map((error) => error.row)).size,
    errors,
  };
}

module.exports = {
  validateHeaders,
  validateRow,
  processImportRows,
  parseDate,
  parseAssigneeEmails,
};
