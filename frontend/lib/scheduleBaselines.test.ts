import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTaskVariance,
  summarizeBaselineSchedule,
  type ScheduleBaseline,
} from "./scheduleBaselines";

const baseline: ScheduleBaseline = {
  _id: "baseline-1",
  project: "project-1",
  name: "Initial plan",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  items: [
    {
      taskId: "task-1",
      startDate: "2026-09-10T00:00:00.000Z",
      dueDate: "2026-09-12T00:00:00.000Z",
      durationDays: 3,
    },
  ],
};

test("calculates calendar-day start and finish variance", () => {
  assert.deepEqual(
    calculateTaskVariance(
      { startDate: "2026-09-12", dueDate: "2026-09-15" },
      baseline.items[0]
    ),
    { startVarianceDays: 2, finishVarianceDays: 3 }
  );
});

test("summarizes ahead, on-plan, late, and no-baseline tasks", () => {
  assert.deepEqual(
    summarizeBaselineSchedule(
      [
        { _id: "task-1", startDate: "2026-09-09", dueDate: "2026-09-11" },
        { _id: "task-2", startDate: "2026-09-12", dueDate: "2026-09-13" },
      ],
      baseline
    ),
    { ahead: 1, onPlan: 0, late: 0, noBaseline: 1 }
  );
});