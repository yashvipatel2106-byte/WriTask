const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeDependenciesInput,
  wouldCreateCycle,
} = require("./taskDependencies");

describe("normalizeDependenciesInput", () => {
  it("dedupes predecessors and defaults to FS", () => {
    const id = "507f1f77bcf86cd799439011";
    const out = normalizeDependenciesInput([
      { taskId: id },
      { taskId: id, type: "FS" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].type, "FS");
  });

  it("rejects invalid type", () => {
    assert.throws(
      () =>
        normalizeDependenciesInput([
          { taskId: "507f1f77bcf86cd799439011", type: "XX" },
        ]),
      /Invalid dependency type/
    );
  });
});

describe("wouldCreateCycle", () => {
  it("detects circular relationships", () => {
    const tasks = [
      { _id: "a", dependencies: [{ taskId: "b" }] },
      { _id: "b", dependencies: [{ taskId: "c" }] },
      { _id: "c", dependencies: [] },
    ];
    assert.equal(wouldCreateCycle("c", ["a"], tasks), true);
  });

  it("allows acyclic additions", () => {
    const tasks = [
      { _id: "a", dependencies: [] },
      { _id: "b", dependencies: [] },
    ];
    assert.equal(wouldCreateCycle("b", ["a"], tasks), false);
  });
});
