import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeCriticalPath, formatSlackLabel } from "./criticalPath.ts";

describe("analyzeCriticalPath", () => {
  it("marks a linear FS chain as critical through the project finish", () => {
    const result = analyzeCriticalPath([
      {
        _id: "a",
        title: "A",
        startDate: "2026-01-01",
        dueDate: "2026-01-03",
      },
      {
        _id: "b",
        title: "B",
        startDate: "2026-01-04",
        dueDate: "2026-01-05",
        dependencies: [{ taskId: "a", type: "FS", lagDays: 0 }],
      },
    ]);

    assert.equal(result.projectFinishDate, "2026-01-05");
    assert.deepEqual([...result.criticalTaskIds].sort(), ["a", "b"]);
    const a = result.metricsByTaskId.get("a");
    const b = result.metricsByTaskId.get("b");
    assert.equal(a?.earliestStart, "2026-01-01");
    assert.equal(a?.earliestFinish, "2026-01-03");
    assert.equal(a?.totalFloat, 0);
    assert.equal(b?.earliestStart, "2026-01-04");
    assert.equal(b?.latestFinish, "2026-01-05");
    assert.equal(b?.totalFloat, 0);
  });

  it("gives slack to the shorter parallel path", () => {
    const result = analyzeCriticalPath([
      {
        _id: "long",
        title: "Long",
        startDate: "2026-02-01",
        dueDate: "2026-02-05",
      },
      {
        _id: "short",
        title: "Short",
        startDate: "2026-02-01",
        dueDate: "2026-02-02",
      },
      {
        _id: "join",
        title: "Join",
        startDate: "2026-02-06",
        dueDate: "2026-02-06",
        dependencies: [
          { taskId: "long", type: "FS" },
          { taskId: "short", type: "FS" },
        ],
      },
    ]);

    assert.equal(result.projectFinishDate, "2026-02-06");
    assert.equal(result.criticalTaskIds.has("long"), true);
    assert.equal(result.criticalTaskIds.has("join"), true);
    assert.equal(result.criticalTaskIds.has("short"), false);
    assert.equal(result.metricsByTaskId.get("short")?.totalFloat, 3);
    assert.equal(result.metricsByTaskId.get("short")?.latestStart, "2026-02-04");
  });

  it("applies FS lag when placing the successor", () => {
    const result = analyzeCriticalPath([
      {
        _id: "pred",
        title: "Pred",
        startDate: "2026-03-01",
        dueDate: "2026-03-01",
      },
      {
        _id: "succ",
        title: "Succ",
        startDate: "2026-03-02",
        dueDate: "2026-03-02",
        dependencies: [{ taskId: "pred", type: "FS", lagDays: 2 }],
      },
    ]);

    const succ = result.metricsByTaskId.get("succ");
    assert.equal(succ?.earliestStart, "2026-03-04");
    assert.equal(succ?.earliestFinish, "2026-03-04");
    assert.equal(result.projectFinishDate, "2026-03-04");
    assert.equal(result.criticalTaskIds.has("pred"), true);
    assert.equal(result.criticalTaskIds.has("succ"), true);
  });

  it("ignores unscheduled tasks and does not mutate input", () => {
    const tasks = [
      {
        _id: "a",
        title: "Scheduled",
        startDate: "2026-04-01",
        dueDate: "2026-04-02",
        dependencies: [{ taskId: "ghost", type: "FS" as const }],
      },
      {
        _id: "ghost",
        title: "Unscheduled",
        startDate: null,
        dueDate: null,
        dependencies: [],
      },
    ];
    const snapshot = JSON.stringify(tasks);
    const result = analyzeCriticalPath(tasks);

    assert.equal(JSON.stringify(tasks), snapshot);
    assert.equal(result.metricsByTaskId.has("ghost"), false);
    assert.equal(result.criticalTaskIds.has("ghost"), false);
    assert.equal(result.metricsByTaskId.get("a")?.earliestStart, "2026-04-01");
    assert.equal(result.projectFinishDate, "2026-04-02");
  });

  it("handles SS, FF, and SF constraints", () => {
    const ss = analyzeCriticalPath([
      {
        _id: "a",
        title: "A",
        startDate: "2026-05-05",
        dueDate: "2026-05-09",
      },
      {
        _id: "b",
        title: "B",
        startDate: "2026-05-05",
        dueDate: "2026-05-07",
        dependencies: [{ taskId: "a", type: "SS", lagDays: 0 }],
      },
    ]);
    assert.equal(ss.metricsByTaskId.get("b")?.earliestStart, "2026-05-05");
    assert.ok((ss.metricsByTaskId.get("b")?.totalFloat ?? -1) > 0);
    assert.equal(ss.criticalTaskIds.has("a"), true);

    const ff = analyzeCriticalPath([
      {
        _id: "a",
        title: "A",
        startDate: "2026-05-01",
        dueDate: "2026-05-04",
      },
      {
        _id: "b",
        title: "B",
        startDate: "2026-05-02",
        dueDate: "2026-05-04",
        dependencies: [{ taskId: "a", type: "FF", lagDays: 0 }],
      },
    ]);
    assert.equal(ff.metricsByTaskId.get("b")?.earliestFinish, "2026-05-04");
    assert.equal(ff.projectFinishDate, "2026-05-04");

    const sf = analyzeCriticalPath([
      {
        _id: "a",
        title: "A",
        startDate: "2026-05-10",
        dueDate: "2026-05-12",
      },
      {
        _id: "b",
        title: "B",
        startDate: "2026-05-08",
        dueDate: "2026-05-10",
        dependencies: [{ taskId: "a", type: "SF", lagDays: 0 }],
      },
    ]);
    assert.equal(sf.metricsByTaskId.get("b")?.earliestFinish, "2026-05-10");
    assert.equal(sf.metricsByTaskId.get("b")?.earliestStart, "2026-05-08");
  });

  it("returns an empty result for cyclic input without throwing", () => {
    const result = analyzeCriticalPath([
      {
        _id: "a",
        title: "A",
        startDate: "2026-06-01",
        dueDate: "2026-06-02",
        dependencies: [{ taskId: "b", type: "FS" }],
      },
      {
        _id: "b",
        title: "B",
        startDate: "2026-06-03",
        dueDate: "2026-06-04",
        dependencies: [{ taskId: "a", type: "FS" }],
      },
    ]);

    assert.equal(result.projectFinishDate, null);
    assert.equal(result.criticalTaskIds.size, 0);
    assert.equal(result.metricsByTaskId.size, 0);
  });
});

describe("formatSlackLabel", () => {
  it("labels critical and slack tasks", () => {
    assert.equal(formatSlackLabel(0), "Critical · 0d slack");
    assert.equal(formatSlackLabel(1), "1d slack");
    assert.equal(formatSlackLabel(4), "4d slack");
  });
});
