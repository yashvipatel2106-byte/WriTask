const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseMilestoneInput } = require("./milestones");

describe("parseMilestoneInput", () => {
  it("accepts a valid milestone", () => {
    const out = parseMilestoneInput({
      title: " Beta launch ",
      description: "Ship it",
      dueDate: "2026-09-20",
      status: "in-progress",
    });
    assert.equal(out.title, "Beta launch");
    assert.equal(out.description, "Ship it");
    assert.equal(out.status, "in-progress");
    assert.ok(out.dueDate instanceof Date);
  });

  it("rejects a missing title", () => {
    assert.throws(() => parseMilestoneInput({ dueDate: "2026-09-20" }), /title is required/);
  });

  it("rejects an invalid status", () => {
    assert.throws(
      () =>
        parseMilestoneInput({
          title: "M",
          dueDate: "2026-09-20",
          status: "done",
        }),
      /Invalid status/
    );
  });

  it("allows partial updates", () => {
    const out = parseMilestoneInput({ status: "completed" }, { partial: true });
    assert.deepEqual(Object.keys(out), ["status"]);
    assert.equal(out.status, "completed");
  });
});
