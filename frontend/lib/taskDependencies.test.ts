import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTrunkBranchDependencyPaths,
  dependencyAnchors,
  dependencyConstraint,
  dependencyTypeFromAnchors,
  findFsConflicts,
  formatPredecessorCell,
  orthogonalDependencyPath,
  orthogonalRightEntryPath,
  parsePredecessorInput,
  resolvePredecessorTokens,
  wouldCreateCycle,
  type TaskDependency,
} from "./taskDependencies.ts";

describe("parsePredecessorInput", () => {
  it("parses empty as no dependencies", () => {
    const result = parsePredecessorInput("  ");
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.tokens, []);
  });

  it("defaults type to FS", () => {
    const result = parsePredecessorInput("52");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.tokens, [
        { row: 52, type: "FS", lagDays: 0, raw: "52" },
      ]);
    }
  });

  it("parses multiple predecessors with types and lag", () => {
    const result = parsePredecessorInput("50FS, 51, 53FS+1");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.tokens.length, 3);
      assert.equal(result.tokens[0].row, 50);
      assert.equal(result.tokens[0].type, "FS");
      assert.equal(result.tokens[1].row, 51);
      assert.equal(result.tokens[2].lagDays, 1);
    }
  });

  it("rejects malformed tokens", () => {
    const result = parsePredecessorInput("12FX");
    assert.equal(result.ok, false);
  });

  it("rejects duplicate rows in input", () => {
    const result = parsePredecessorInput("12, 12FS");
    assert.equal(result.ok, false);
  });
});

describe("formatPredecessorCell", () => {
  it("formats using row map", () => {
    const deps: TaskDependency[] = [
      { taskId: "a", type: "FS", lagDays: 0 },
      { taskId: "b", type: "FS", lagDays: 2 },
    ];
    const rows = new Map([
      ["a", 3],
      ["b", 7],
    ]);
    assert.equal(formatPredecessorCell(deps, rows), "3FS, 7FS+2");
  });
});

describe("resolvePredecessorTokens", () => {
  const tasks = [
    { _id: "t1", dependencies: [] as TaskDependency[] },
    { _id: "t2", dependencies: [] as TaskDependency[] },
    { _id: "t3", dependencies: [] as TaskDependency[] },
    { _id: "t4", dependencies: [] as TaskDependency[] },
  ];

  it("creates multiple FS links from row numbers", () => {
    const parsed = parsePredecessorInput("1, 2, 3");
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const resolved = resolvePredecessorTokens({
      tokens: parsed.tokens,
      successorId: "t4",
      tasksInOrder: tasks,
    });
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.deepEqual(
        resolved.dependencies.map((d) => d.taskId),
        ["t1", "t2", "t3"]
      );
    }
  });

  it("rejects self-dependency", () => {
    const parsed = parsePredecessorInput("2");
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const resolved = resolvePredecessorTokens({
      tokens: parsed.tokens,
      successorId: "t2",
      tasksInOrder: tasks,
    });
    assert.equal(resolved.ok, false);
  });

  it("rejects invalid row", () => {
    const parsed = parsePredecessorInput("99");
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const resolved = resolvePredecessorTokens({
      tokens: parsed.tokens,
      successorId: "t1",
      tasksInOrder: tasks,
    });
    assert.equal(resolved.ok, false);
  });

  it("rejects circular dependencies", () => {
    const cyclic = [
      { _id: "t1", dependencies: [{ taskId: "t2", type: "FS" as const }] },
      { _id: "t2", dependencies: [] as TaskDependency[] },
    ];
    const parsed = parsePredecessorInput("1");
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const resolved = resolvePredecessorTokens({
      tokens: parsed.tokens,
      successorId: "t2",
      tasksInOrder: cyclic,
    });
    assert.equal(resolved.ok, false);
  });
});

describe("wouldCreateCycle", () => {
  it("detects self cycle", () => {
    assert.equal(wouldCreateCycle("a", ["a"], [{ _id: "a", dependencies: [] }]), true);
  });

  it("allows acyclic links", () => {
    assert.equal(
      wouldCreateCycle(
        "b",
        ["a"],
        [
          { _id: "a", dependencies: [] },
          { _id: "b", dependencies: [] },
        ]
      ),
      false
    );
  });
});

describe("orthogonalDependencyPath", () => {
  it("returns orthogonal segments for forward links", () => {
    const d = orthogonalDependencyPath(10, 20, 100, 60, { trunkX: 40 });
    assert.match(d, /^M /);
    assert.ok(d.includes(" L "));
    assert.equal(d.includes("C "), false);
    assert.equal(d, "M 10 20 L 40 20 L 40 60 L 100 60");
  });

  it("keeps the vertical trunk left of the successor even when pred finishes later", () => {
    const d = orthogonalDependencyPath(200, 20, 80, 100, { trunkX: 56 });
    assert.equal(d.includes("C "), false);
    // Vertical must be at the left trunk (56), not at the pred finish (~200).
    assert.equal(d, "M 200 20 L 56 20 L 56 100 L 80 100");
    assert.equal(d.includes("L 212 "), false);
  });
});

describe("buildTrunkBranchDependencyPaths", () => {
  it("shares one trunk X across successors of the same predecessor", () => {
    const paths = buildTrunkBranchDependencyPaths([
      {
        key: "a->b",
        predecessorId: "a",
        successorId: "b",
        x1: 40,
        y1: 20,
        x2: 120,
        y2: 60,
      },
      {
        key: "a->c",
        predecessorId: "a",
        successorId: "c",
        x1: 40,
        y1: 20,
        x2: 140,
        y2: 100,
      },
    ]);
    assert.equal(paths.length, 2);
    const trunkMatch = paths[0].d.match(/ L ([\d.]+) 20 L \1 60 /);
    assert.ok(trunkMatch);
    const trunkX = trunkMatch![1];
    assert.ok(paths[1].d.includes(` L ${trunkX} 20 L ${trunkX} 100 `));
  });

  it("pushes the trunk left of intermediate bar obstacles", () => {
    const paths = buildTrunkBranchDependencyPaths(
      [
        {
          key: "a->c",
          predecessorId: "a",
          successorId: "c",
          x1: 200,
          y1: 20,
          x2: 180,
          y2: 100,
          clearOfLeftXs: [90, 180],
        },
      ],
      { trunkGap: 20 }
    );
    assert.equal(paths.length, 1);
    // Trunk should clear left edge 90 by trunkGap → <= 70
    const m = paths[0].d.match(/ L ([\d.]+) 20 L \1 100 /);
    assert.ok(m);
    assert.ok(Number(m![1]) <= 70);
  });

  it("routes FF/SF on a right-side trunk into the successor finish", () => {
    const paths = buildTrunkBranchDependencyPaths(
      [
        {
          key: "a->b:FF",
          predecessorId: "a",
          successorId: "b",
          type: "FF",
          entry: "right",
          x1: 80,
          y1: 20,
          x2: 120,
          y2: 60,
        },
      ],
      { trunkGap: 20 }
    );
    assert.equal(paths.length, 1);
    assert.ok(paths[0].d.endsWith("L 120 60"));
    const trunk = paths[0].d.match(/ L ([\d.]+) 20 L \1 60 /);
    assert.ok(trunk);
    assert.ok(Number(trunk![1]) >= 140);
  });
});

describe("dependency type anchors", () => {
  it("maps FS/SS/FF/SF to the correct bar ends", () => {
    assert.deepEqual(dependencyAnchors("FS"), {
      from: "finish",
      to: "start",
      entry: "left",
    });
    assert.deepEqual(dependencyAnchors("SS"), {
      from: "start",
      to: "start",
      entry: "left",
    });
    assert.deepEqual(dependencyAnchors("FF"), {
      from: "finish",
      to: "finish",
      entry: "right",
    });
    assert.deepEqual(dependencyAnchors("SF"), {
      from: "start",
      to: "finish",
      entry: "right",
    });
  });

  it("infers type from drag handles", () => {
    assert.equal(dependencyTypeFromAnchors("finish", "start"), "FS");
    assert.equal(dependencyTypeFromAnchors("start", "start"), "SS");
    assert.equal(dependencyTypeFromAnchors("finish", "finish"), "FF");
    assert.equal(dependencyTypeFromAnchors("start", "finish"), "SF");
  });

  it("constrains successor dates by type", () => {
    assert.equal(
      dependencyConstraint("FS", "2026-01-01", "2026-01-05", 0)?.required,
      "2026-01-06"
    );
    assert.equal(
      dependencyConstraint("SS", "2026-01-01", "2026-01-05", 0)?.required,
      "2026-01-01"
    );
    assert.equal(
      dependencyConstraint("FF", "2026-01-01", "2026-01-05", 1)?.required,
      "2026-01-06"
    );
    assert.equal(
      dependencyConstraint("SF", "2026-01-03", "2026-01-10", 0)?.required,
      "2026-01-03"
    );
  });

  it("flags SS and FF schedule conflicts", () => {
    const conflicts = findFsConflicts([
      {
        _id: "p",
        title: "Pred",
        startDate: "2026-01-10",
        dueDate: "2026-01-12",
      },
      {
        _id: "s",
        title: "Succ",
        startDate: "2026-01-08",
        dueDate: "2026-01-09",
        dependencies: [
          { taskId: "p", type: "SS" },
          { taskId: "p", type: "FF" },
        ],
      },
    ]);
    assert.equal(conflicts.length, 2);
    assert.ok(conflicts.some((c) => c.type === "SS"));
    assert.ok(conflicts.some((c) => c.type === "FF"));
  });
});

describe("orthogonalRightEntryPath", () => {
  it("enters the finish from the right", () => {
    const d = orthogonalRightEntryPath(40, 20, 90, 60, { trunkX: 120 });
    assert.equal(d, "M 40 20 L 120 20 L 120 60 L 90 60");
  });
});
