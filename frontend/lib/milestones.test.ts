import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findOverdueMilestones,
  milestoneStatusLabel,
  type MilestoneItem,
} from "./milestones.ts";

function milestone(partial: Partial<MilestoneItem>): MilestoneItem {
  return {
    _id: "m1",
    title: "Launch",
    project: "p1",
    dueDate: "2026-09-01",
    status: "pending",
    ...partial,
  };
}

describe("findOverdueMilestones", () => {
  const today = new Date("2026-09-08T12:00:00");

  it("flags incomplete milestones before today", () => {
    const overdue = findOverdueMilestones(
      [
        milestone({ _id: "old", dueDate: "2026-09-01", status: "pending" }),
        milestone({ _id: "done", dueDate: "2026-09-01", status: "completed" }),
        milestone({ _id: "future", dueDate: "2026-09-20", status: "in-progress" }),
      ],
      today
    );
    assert.deepEqual(
      overdue.map((item) => item._id),
      ["old"]
    );
  });
});

describe("milestoneStatusLabel", () => {
  it("labels known statuses", () => {
    assert.equal(milestoneStatusLabel("pending"), "Pending");
    assert.equal(milestoneStatusLabel("in-progress"), "In progress");
    assert.equal(milestoneStatusLabel("completed"), "Completed");
  });
});
