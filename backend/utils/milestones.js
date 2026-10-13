const mongoose = require("mongoose");

const MILESTONE_STATUSES = ["pending", "in-progress", "completed"];

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseDueDate(value) {
  if (value == null || value === "") {
    throw httpError("dueDate is required");
  }
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = match ? new Date(`${match[1]}T12:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw httpError("dueDate must be a valid date");
  }
  return date;
}

function parseStatus(value, fallback = "pending") {
  const status = String(value == null || value === "" ? fallback : value)
    .trim()
    .toLowerCase();
  if (!MILESTONE_STATUSES.includes(status)) {
    throw httpError(
      `Invalid status "${value}". Use pending, in-progress, or completed.`
    );
  }
  return status;
}

/**
 * Validate a milestone create/update payload. Does not touch the database.
 * partial=true only validates fields that are present.
 */
function parseMilestoneInput(body, { partial = false } = {}) {
  const source = body && typeof body === "object" ? body : {};
  const out = {};

  if (!partial || Object.prototype.hasOwnProperty.call(source, "title")) {
    const title = String(source.title || "").trim();
    if (!title) throw httpError("title is required");
    if (title.length > 200) throw httpError("title must be 200 characters or fewer");
    out.title = title;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(source, "description")) {
    const description = String(source.description || "").trim();
    if (description.length > 2000) {
      throw httpError("description must be 2000 characters or fewer");
    }
    out.description = description;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(source, "dueDate")) {
    out.dueDate = parseDueDate(source.dueDate);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(source, "status")) {
    out.status = parseStatus(source.status, partial ? undefined : "pending");
  }

  return out;
}

function assertObjectId(value, label) {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
    throw httpError(`${label} is invalid`);
  }
  return String(value);
}

module.exports = {
  MILESTONE_STATUSES,
  parseMilestoneInput,
  assertObjectId,
};
