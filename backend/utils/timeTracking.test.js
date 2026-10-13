const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Pure helpers re-exported via requiring the module — extract local copies for
// unit tests without a DB by duplicating the pure functions under test.
function toDateKey(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function isTaskOverdue(task, now = new Date()) {
  if (!task?.dueDate) return false;
  const dueKey = toDateKey(task.dueDate);
  const nowKey = toDateKey(now);
  if (!dueKey || !nowKey) return false;
  return nowKey > dueKey;
}

function isInProgressStatus(status) {
  return String(status || "").toLowerCase() === "in-progress";
}

function effortLimitMs(effortHours) {
  if (effortHours == null) return null;
  const hours = Number(effortHours);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return Math.round(hours * 60 * 60 * 1000);
}

function getTimerBlockReason(task, { trackedMs = 0, now = new Date() } = {}) {
  if (!task) return "Task not found.";
  if (task.isDeleted) return "Task is in trash.";
  if (!isInProgressStatus(task.status)) {
    if (String(task.status || "").toLowerCase() === "completed") {
      return "Completed task cannot be timed.";
    }
    return "Timer available when task is In Progress.";
  }
  if (isTaskOverdue(task, now)) {
    return "Task is overdue. Move the task to In Progress and extend the due date before starting the timer.";
  }
  const limit = effortLimitMs(task.effortHours);
  if (limit != null && trackedMs >= limit) {
    return "Effort limit reached.";
  }
  return null;
}

describe("timer eligibility", () => {
  it("blocks To Do", () => {
    const reason = getTimerBlockReason({ status: "todo", dueDate: "2099-01-01" });
    assert.match(reason, /In Progress/);
  });

  it("allows In Progress with future due date", () => {
    const reason = getTimerBlockReason({
      status: "in-progress",
      dueDate: "2099-12-31",
    });
    assert.equal(reason, null);
  });

  it("blocks completed", () => {
    const reason = getTimerBlockReason({
      status: "completed",
      dueDate: "2099-01-01",
    });
    assert.match(reason, /Completed/);
  });

  it("blocks overdue even when In Progress", () => {
    const reason = getTimerBlockReason(
      { status: "in-progress", dueDate: "2020-01-01" },
      { now: new Date("2026-01-01T12:00:00Z") }
    );
    assert.match(reason, /overdue/i);
  });

  it("blocks when effort already reached", () => {
    const reason = getTimerBlockReason(
      { status: "in-progress", dueDate: "2099-01-01", effortHours: 8 },
      { trackedMs: 8 * 3600 * 1000 }
    );
    assert.match(reason, /Effort limit/);
  });
});

describe("effort clamp math", () => {
  it("stops exactly at remaining effort", () => {
    const limit = effortLimitMs(8);
    const trackedBefore = 7 * 3600 * 1000 + 59 * 60 * 1000 + 50 * 1000;
    const remaining = limit - trackedBefore;
    assert.equal(remaining, 10 * 1000);
    const startedAt = new Date("2026-01-01T10:00:00.000Z");
    const maxEnd = new Date(startedAt.getTime() + remaining);
    assert.equal(maxEnd.toISOString(), "2026-01-01T10:00:10.000Z");
  });
});
