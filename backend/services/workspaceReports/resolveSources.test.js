const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { expandSources } = require("./resolveSources");

function folder(id, extra = {}) {
  return { _id: id, ...extra };
}
function project(id, extra = {}) {
  return { _id: id, title: id, ...extra };
}

describe("expandSources", () => {
  const workspaceId = "ws1";
  const folders = [
    folder("test"),
    folder("folder1", { parentFolder: "test" }),
    folder("folder2", { parentFolder: "test" }),
    folder("folder3", { parentFolder: "folder2" }),
    folder("folderX", { parentFolder: "test" }),
    folder("folderY", { parentFolder: "test" }),
  ];
  const projects = [
    project("A", { folder: "folder1" }),
    project("B", { folder: "folder1" }),
    project("C", { folder: "folder3" }),
    project("D", { folder: "folder3" }),
    project("E", { folder: "test" }),
    project("nestedB", { parentProject: "B" }),
    project("Z"),
  ];

  it("selecting a root folder includes all nested projects", () => {
    const result = expandSources({
      folders,
      projects,
      sources: [{ type: "folder", id: "test" }],
      excludedProjectIds: [],
      workspaceId,
    });
    assert.deepEqual(result.projectIds.sort(), ["A", "B", "C", "D", "E", "nestedB"]);
  });

  it("selecting a nested folder only includes that subtree", () => {
    const result = expandSources({
      folders,
      projects,
      sources: [{ type: "folder", id: "folder2" }],
      excludedProjectIds: [],
      workspaceId,
    });
    assert.deepEqual(result.projectIds.sort(), ["C", "D"]);
  });

  it("selecting a project includes only that project and subprojects", () => {
    const result = expandSources({
      folders,
      projects,
      sources: [{ type: "project", id: "A" }],
      excludedProjectIds: [],
      workspaceId,
    });
    assert.deepEqual(result.projectIds, ["A"]);
  });

  it("merges folders and standalone projects without duplicates", () => {
    const result = expandSources({
      folders,
      projects,
      sources: [
        { type: "folder", id: "folder1" },
        { type: "folder", id: "test" },
        { type: "project", id: "Z" },
      ],
      excludedProjectIds: [],
      workspaceId,
    });
    assert.deepEqual(result.projectIds.sort(), [
      "A",
      "B",
      "C",
      "D",
      "E",
      "Z",
      "nestedB",
    ]);
  });

  it("excludes a project and its nested subprojects", () => {
    const result = expandSources({
      folders,
      projects,
      sources: [{ type: "folder", id: "test" }],
      excludedProjectIds: ["B", "C"],
      workspaceId,
    });
    assert.deepEqual(result.projectIds.sort(), ["A", "D", "E"]);
  });

  it("workspace source includes everything then exclusions apply", () => {
    const result = expandSources({
      folders,
      projects,
      sources: [{ type: "workspace", id: "ws1" }],
      excludedProjectIds: ["C", "E"],
      workspaceId,
    });
    assert.ok(!result.projectIds.includes("C"));
    assert.ok(!result.projectIds.includes("E"));
    assert.ok(result.projectIds.includes("Z"));
    assert.ok(result.projectIds.includes("A"));
  });

  it("ignores workspace sources from another workspace", () => {
    const result = expandSources({
      folders,
      projects,
      sources: [{ type: "workspace", id: "other" }],
      excludedProjectIds: [],
      workspaceId,
    });
    assert.deepEqual(result.projectIds, []);
  });
});
