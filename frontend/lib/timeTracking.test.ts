import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatElapsedClock,
  getClientTimerBlockReason,
  getEntryElapsedMs,
  isInProgressStatus,
  isTaskOverdue,
  stopReasonLabel,
} from "./timeTracking.ts";

describe("getClientTimerBlockReason", () => {
  it("blocks todo", () => {
    assert.match(
      getClientTimerBlockReason({ status: "todo", dueDate: "2099-01-01" }) || "",
      /In Progress/
    );
  });

  it("allows in-progress", () => {
    assert.equal(
      getClientTimerBlockReason({ status: "in-progress", dueDate: "2099-01-01" }),
      null
    );
  });

  it("blocks overdue in-progress", () => {
    assert.match(
      getClientTimerBlockReason({
        status: "in-progress",
        dueDate: "2020-01-01",
      }) || "",
      /overdue/i
    );
  });
});

describe("formatElapsedClock", () => {
  it("formats H:M:S", () => {
    assert.equal(formatElapsedClock(3661000), "01:01:01");
  });
});

describe("getEntryElapsedMs", () => {
  it("adds running segment to accumulated", () => {
    const ms = getEntryElapsedMs(
      {
        status: "running",
        startedAt: "2026-01-01T10:00:00.000Z",
        runningSince: "2026-01-01T10:00:00.000Z",
        accumulatedMs: 5000,
      },
      Date.parse("2026-01-01T10:00:10.000Z")
    );
    assert.equal(ms, 15000);
  });

  it("uses accumulated only when paused", () => {
    const ms = getEntryElapsedMs(
      {
        status: "paused",
        startedAt: "2026-01-01T10:00:00.000Z",
        accumulatedMs: 12000,
      },
      Date.parse("2026-01-01T11:00:00.000Z")
    );
    assert.equal(ms, 12000);
  });
});

describe("helpers", () => {
  it("detects in progress", () => {
    assert.equal(isInProgressStatus("in-progress"), true);
    assert.equal(isInProgressStatus("todo"), false);
  });

  it("detects overdue", () => {
    assert.equal(isTaskOverdue("2020-01-01", new Date("2026-01-02")), true);
  });

  it("labels stop reasons", () => {
    assert.match(stopReasonLabel("effort_reached"), /Effort/);
    assert.match(stopReasonLabel("switched_task"), /Switched/);
  });
});
