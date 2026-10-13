const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseBaselineName, buildScheduleBaselineItems } = require("./scheduleBaselines");

describe("schedule baseline snapshots", () => {
  it("trims the only client-controlled field", () => {
    assert.equal(parseBaselineName("  Before launch  "), "Before launch");
    assert.throws(() => parseBaselineName(""), /name is required/);
  });

  it("derives inclusive durations and skips unscheduled tasks", () => {
    const items = buildScheduleBaselineItems([
      { _id: "task-a", startDate: "2026-09-01", dueDate: "2026-09-03" },
      { _id: "task-b", startDate: null, dueDate: "2026-09-04" },
    ]);
    assert.equal(items.length, 1);
    assert.equal(String(items[0].taskId), "task-a");
    assert.equal(items[0].durationDays, 3);
    assert.equal(items[0].startDate.toISOString().slice(0, 10), "2026-09-01");
  });
});
