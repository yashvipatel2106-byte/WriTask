const { toId } = require("./resolveSources");

function containerKey(type, id) {
  return `${type}:${toId(id)}`;
}

function folderParentKey(folder) {
  const parentFolder = toId(folder.parentFolder);
  if (parentFolder) return containerKey("folder", parentFolder);
  const parentProject = toId(folder.parentProject);
  if (parentProject) return containerKey("project", parentProject);
  return null;
}

function projectParentKey(project) {
  const folder = toId(project.folder);
  if (folder) return containerKey("folder", folder);
  const parentProject = toId(project.parentProject);
  if (parentProject) return containerKey("project", parentProject);
  return null;
}

function ancestorFolderId(project, projectById) {
  let current = project;
  const seen = new Set();
  while (current) {
    const id = toId(current._id);
    if (!id || seen.has(id)) break;
    seen.add(id);
    const folderId = toId(current.folder);
    if (folderId) return folderId;
    current = projectById.get(toId(current.parentProject));
  }
  return null;
}

function resolveParent(key, structuralParent, omitKeys) {
  let current = key;
  const seen = new Set();
  while (current && omitKeys.has(current)) {
    if (seen.has(current)) return null;
    seen.add(current);
    current = structuralParent.get(current) || null;
  }
  return current || null;
}

function collectDescendants(rootIds, childrenByParent) {
  const allowed = new Set(rootIds);
  const stack = [...rootIds];
  while (stack.length) {
    const id = stack.pop();
    for (const child of childrenByParent.get(id) || []) {
      if (allowed.has(child.id)) continue;
      allowed.add(child.id);
      stack.push(child.id);
    }
  }
  return allowed;
}

function kindRank(kind) {
  if (kind === "folder") return 0;
  if (kind === "project") return 1;
  if (kind === "task") return 2;
  return 3;
}

function compareRows(a, b) {
  const rank = kindRank(a.kind) - kindRank(b.kind);
  if (rank !== 0) return rank;
  return String(a.title || "").localeCompare(String(b.title || ""), undefined, {
    sensitivity: "base",
  });
}

function addDepth(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows.map((row) => {
    let depth = 0;
    let current = row;
    const seen = new Set();
    while (current?.parentId) {
      if (seen.has(current.id)) break;
      seen.add(current.id);
      current = byId.get(current.parentId);
      if (!current) break;
      depth += 1;
    }
    return { ...row, depth };
  });
}

/**
 * Group task/subtask rows under folders from the selected data sources.
 * Projects that live inside a folder are omitted so expanding a folder
 * reveals its nested folders and tasks directly.
 */
function buildTaskHierarchyRows({
  folders = [],
  projects = [],
  sources = [],
  folderIds = [],
  projectIds = [],
  taskRows = [],
  keepProjectRows = false,
} = {}) {
  const folderById = new Map(folders.map((f) => [toId(f._id), f]));
  const projectById = new Map(projects.map((p) => [toId(p._id), p]));
  const folderIdSet = new Set((folderIds || []).map(toId).filter(Boolean));
  const projectIdSet = new Set((projectIds || []).map(toId).filter(Boolean));

  const structuralParent = new Map();
  for (const folder of folders) {
    const id = toId(folder._id);
    if (!id || !folderIdSet.has(id)) continue;
    structuralParent.set(containerKey("folder", id), folderParentKey(folder));
  }
  for (const project of projects) {
    const id = toId(project._id);
    if (!id || !projectIdSet.has(id)) continue;
    structuralParent.set(containerKey("project", id), projectParentKey(project));
  }

  const workspaceSelected = (sources || []).some((s) => s.type === "workspace");
  const selectedProjectIds = new Set(
    (sources || [])
      .filter((s) => s.type === "project")
      .map((s) => toId(s.id))
      .filter(Boolean)
  );

  const omitKeys = new Set();
  if (!keepProjectRows) {
    for (const id of projectIdSet) {
      if (selectedProjectIds.has(id)) continue;
      const project = projectById.get(id);
      if (project && ancestorFolderId(project, projectById)) {
        omitKeys.add(containerKey("project", id));
      }
    }
  }

  const explicitRoots = new Set();
  if (!workspaceSelected) {
    for (const source of sources || []) {
      if (source.type === "folder") {
        explicitRoots.add(containerKey("folder", source.id));
      } else if (source.type === "project") {
        explicitRoots.add(containerKey("project", source.id));
      }
    }
  }

  const nodes = [];
  const pushNode = (row) => {
    nodes.push({
      ...row,
      parentId: explicitRoots.has(row.id) ? null : row.parentId || null,
    });
  };

  for (const id of folderIdSet) {
    const folder = folderById.get(id);
    if (!folder) continue;
    const key = containerKey("folder", id);
    const parent = resolveParent(structuralParent.get(key), structuralParent, omitKeys);
    pushNode({
      id: key,
      kind: "folder",
      title: folder.name || "Folder",
      parentId: explicitRoots.has(key) ? null : parent,
      cells: {},
    });
  }

  for (const id of projectIdSet) {
    const key = containerKey("project", id);
    if (omitKeys.has(key)) continue;
    const project = projectById.get(id);
    if (!project) continue;
    const parent = resolveParent(structuralParent.get(key), structuralParent, omitKeys);
    pushNode({
      id: key,
      kind: "project",
      title: project.title || "Project",
      parentId: explicitRoots.has(key) ? null : parent,
      cells: {},
    });
  }

  for (const row of taskRows) {
    const isSubtask = row.kind === "subtask" && row.parentId;
    const projectKey = containerKey("project", row.projectId);
    const containerParent = resolveParent(
      omitKeys.has(projectKey) ? structuralParent.get(projectKey) : projectKey,
      structuralParent,
      omitKeys
    );
    pushNode({
      ...row,
      kind: row.kind || "task",
      title: row.title || row.cells?.title || "",
      parentId: isSubtask ? row.parentId : containerParent,
      _containerParent: containerParent,
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    if (node.parentId && !nodeIds.has(node.parentId)) {
      node.parentId = node._containerParent || null;
    }
    delete node._containerParent;
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const used = new Set();
  for (const row of nodes) {
    if (row.kind !== "task" && row.kind !== "subtask") continue;
    let current = row;
    const seen = new Set();
    while (current) {
      if (seen.has(current.id)) break;
      seen.add(current.id);
      used.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
  }

  let kept = nodes.filter((n) => used.has(n.id));
  const keptIds = new Set(kept.map((n) => n.id));
  kept = kept.map((n) => ({
    ...n,
    parentId: n.parentId && keptIds.has(n.parentId) ? n.parentId : null,
  }));
  const childrenByParent = new Map();
  for (const node of kept) {
    const parent = node.parentId || "";
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(node);
  }

  if (explicitRoots.size) {
    const allowed = collectDescendants([...explicitRoots], childrenByParent);
    kept = kept.filter((n) => allowed.has(n.id));
    const allowedIds = new Set(kept.map((n) => n.id));
    kept = kept.map((n) => ({
      ...n,
      parentId: n.parentId && allowedIds.has(n.parentId) ? n.parentId : null,
    }));
  }

  const children = new Map();
  for (const node of kept) {
    const parent = node.parentId || "";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(node);
  }
  for (const list of children.values()) list.sort(compareRows);

  const ordered = [];
  const walk = (parentId) => {
    for (const child of children.get(parentId || "") || []) {
      ordered.push(child);
      walk(child.id);
    }
  };
  walk("");

  const childCount = new Map();
  for (const node of ordered) {
    const parent = node.parentId || "";
    childCount.set(parent, (childCount.get(parent) || 0) + 1);
  }

  return addDepth(
    ordered.map((node) => ({
      id: node.id,
      parentId: node.parentId || null,
      kind: node.kind,
      hasChildren: (childCount.get(node.id) || 0) > 0,
      depth: 0,
      cells: {
        ...(node.cells || {}),
        title: node.title || node.cells?.title || "",
      },
    }))
  );
}

module.exports = {
  containerKey,
  buildTaskHierarchyRows,
};
