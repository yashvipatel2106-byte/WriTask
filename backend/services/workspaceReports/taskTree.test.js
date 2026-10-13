const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildTaskHierarchyRows } = require("./taskTree");

const folders = [
  { _id: "f-root", name: "Marketing", parentFolder: null, parentProject: null },
  { _id: "f-child", name: "Campaigns", parentFolder: "f-root", parentProject: null },
];
const projects = [
  { _id: "p-in-root", title: "Site", folder: "f-root", parentProject: null },
  { _id: "p-in-child", title: "Ads", folder: "f-child", parentProject: null },
  { _id: "p-solo", title: "Standalone", folder: null, parentProject: null },
];

function task(id, projectId, title, extra = {}) {
  return {
    id,
    projectId,
    kind: "task",
    title,
    cells: { title, assignee: "A" },
    ...extra,
  };
}

describe("buildTaskHierarchyRows", () => {
  it("shows source folders first and hides in-folder projects", () => {
    const rows = buildTaskHierarchyRows({
      folders,
      projects,
      sources: [{ type: "workspace", id: "ws" }],
      folderIds: ["f-root", "f-child"],
      projectIds: ["p-in-root", "p-in-child"],
      taskRows: [
        task("t1", "p-in-root", "Write copy"),
        task("t2", "p-in-child", "Design ad"),
      ],
    });
    const roots = rows.filter((r) => !r.parentId);
    assert.deepEqual(
      roots.map((r) => r.id),
      ["folder:f-root"]
    );
    assert.equal(roots[0].kind, "folder");
    assert.equal(roots[0].hasChildren, true);
    assert.equal(
      rows.some((r) => r.id === "project:p-in-root"),
      false
    );
    const underRoot = rows.filter((r) => r.parentId === "folder:f-root");
    assert.deepEqual(
      underRoot.map((r) => r.id),
      ["folder:f-child", "t1"]
    );
    const underChild = rows.filter((r) => r.parentId === "folder:f-child");
    assert.deepEqual(
      underChild.map((r) => r.id),
      ["t2"]
    );
  });

  it("keeps a selected project as the group even when it has a folder", () => {
    const rows = buildTaskHierarchyRows({
      folders,
      projects,
      sources: [{ type: "project", id: "p-in-root" }],
      folderIds: ["f-root"],
      projectIds: ["p-in-root"],
      taskRows: [task("t1", "p-in-root", "Write copy")],
    });
    assert.equal(rows[0].id, "project:p-in-root");
    assert.equal(rows[0].parentId, null);
    assert.equal(rows[1].id, "t1");
    assert.equal(rows[1].parentId, "project:p-in-root");
  });

  it("groups standalone projects when there is no folder", () => {
    const rows = buildTaskHierarchyRows({
      folders,
      projects,
      sources: [{ type: "workspace", id: "ws" }],
      folderIds: [],
      projectIds: ["p-solo"],
      taskRows: [task("t3", "p-solo", "Solo task")],
    });
    assert.equal(rows[0].id, "project:p-solo");
    assert.equal(rows[1].parentId, "project:p-solo");
  });

  it("keeps nested folders and their tasks under a parent folder", () => {
    const rows = buildTaskHierarchyRows({
      folders,
      projects,
      sources: [{ type: "folder", id: "f-root" }],
      folderIds: ["f-root", "f-child"],
      projectIds: ["p-in-root", "p-in-child"],
      taskRows: [
        task("t1", "p-in-root", "Write copy"),
        task("t2", "p-in-child", "Design ad"),
        {
          id: "st2",
          projectId: "p-in-child",
          kind: "subtask",
          parentId: "t2",
          title: "Ad variant",
          cells: { title: "Ad variant" },
        },
      ],
    });
    assert.equal(
      rows.some((r) => r.id === "folder:f-child" && r.parentId === "folder:f-root"),
      true
    );
    assert.equal(
      rows.some((r) => r.id === "t2" && r.parentId === "folder:f-child"),
      true
    );
    assert.equal(
      rows.some((r) => r.id === "st2" && r.parentId === "t2"),
      true
    );
  });

  it("keeps projects visible when reporting by project", () => {
    const rows = buildTaskHierarchyRows({
      folders,
      projects,
      sources: [{ type: "folder", id: "f-root" }],
      folderIds: ["f-root", "f-child"],
      projectIds: ["p-in-root", "p-in-child"],
      keepProjectRows: true,
      taskRows: [
        task("t1", "p-in-root", "Write copy"),
        task("t2", "p-in-child", "Design ad"),
      ],
    });
    assert.equal(
      rows.some((r) => r.id === "project:p-in-root" && r.parentId === "folder:f-root"),
      true
    );
    assert.equal(
      rows.some((r) => r.id === "t1" && r.parentId === "project:p-in-root"),
      true
    );
    assert.equal(
      rows.some((r) => r.id === "t2" && r.parentId === "project:p-in-child"),
      true
    );
  });

  it("nests subtasks under their parent task", () => {
    const rows = buildTaskHierarchyRows({
      folders,
      projects,
      sources: [{ type: "folder", id: "f-root" }],
      folderIds: ["f-root"],
      projectIds: ["p-in-root"],
      taskRows: [
        task("t1", "p-in-root", "Parent"),
        {
          id: "st1",
          projectId: "p-in-root",
          kind: "subtask",
          parentId: "t1",
          title: "Child",
          cells: { title: "Child" },
        },
      ],
    });
    const sub = rows.find((r) => r.id === "st1");
    assert.equal(sub.parentId, "t1");
    assert.equal(sub.kind, "subtask");
    const parent = rows.find((r) => r.id === "t1");
    assert.equal(parent.hasChildren, true);
    assert.equal(parent.parentId, "folder:f-root");
  });
});
