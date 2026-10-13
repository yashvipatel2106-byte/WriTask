const mongoose = require("mongoose");
const Project = require("../models/Project");
const Folder = require("../models/Folder");
const WorkspaceFile = require("../models/WorkspaceFile");
const Organization = require("../models/Organization");
const {
  getWorkspaceForUser,
  resolveDefaultWorkspaceId,
} = require("./workspaces");
const { hasOrgPermissionForUser } = require("./roleDefinitions");
const { resolveProjectRoleForUser } = require("./projectAccess");

const MAX_PROJECT_DEPTH = 5;

class HierarchyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function toId(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function isValidId(value) {
  return Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));
}

function memberUserId(member) {
  if (!member?.user) return null;
  const u = member.user;
  if (typeof u === "object" && u._id) return String(u._id);
  return String(u);
}

function cloneMembers(members, ownerUserId) {
  const owner = String(ownerUserId);
  const copied = (members || []).map((m) => ({
    user: m.user?._id || m.user,
    role: m.role || "member",
  }));
  const hasOwner = copied.some((m) => memberUserId(m) === owner);
  if (!hasOwner) {
    copied.push({ user: ownerUserId, role: "owner" });
  } else {
    copied.forEach((m) => {
      if (memberUserId(m) === owner) m.role = "owner";
    });
  }
  return copied;
}

async function getProjectDepth(projectId) {
  let depth = 0;
  let currentId = projectId;
  const seen = new Set();
  while (currentId) {
    const key = String(currentId);
    if (seen.has(key)) {
      throw new HierarchyError(400, "Circular project hierarchy");
    }
    seen.add(key);
    const doc = await Project.findById(currentId).select("parentProject");
    if (!doc?.parentProject) break;
    depth += 1;
    currentId = doc.parentProject;
  }
  return depth;
}

async function assertCanAccessProject(project, userId) {
  if (project.isMember(userId)) return;
  const role = await resolveProjectRoleForUser(project, userId);
  if (!role) {
    throw new HierarchyError(403, "You are not a member of this project");
  }
}

async function assertCanCreateInOrg(organizationId, userId) {
  if (!organizationId) return;
  const organization = await Organization.findById(organizationId);
  if (!organization || organization.isDeleted) {
    throw new HierarchyError(404, "Organization not found");
  }
  if (!hasOrgPermissionForUser(organization, userId, "org:createProject")) {
    throw new HierarchyError(
      403,
      "Your organization role cannot create folders or projects"
    );
  }
}

async function loadWorkspaceOrThrow(userId, workspaceId) {
  const ws = await getWorkspaceForUser(userId, workspaceId);
  if (!ws) {
    throw new HierarchyError(400, "Invalid workspace");
  }
  return ws;
}

/**
 * Resolve optional folder / file / parent placement for project create.
 * Existing callers that omit all three get null location fields.
 */
async function resolveCreateLocation(userId, body = {}) {
  const folderId = body.folderId || null;
  const parentProjectId = body.parentProjectId || null;
  const filled = [folderId, parentProjectId].filter(Boolean);
  if (filled.length > 1) {
    throw new HierarchyError(
      400,
      "Provide only one of folderId or parentProjectId"
    );
  }

  if (body.fileId) {
    throw new HierarchyError(400, "Project files are no longer supported");
  }

  if (parentProjectId) {
    if (!isValidId(parentProjectId)) {
      throw new HierarchyError(400, "Invalid parent project");
    }
    const parent = await Project.findById(parentProjectId);
    if (!parent || parent.isDeleted) {
      throw new HierarchyError(404, "Parent project not found");
    }
    await assertCanAccessProject(parent, userId);
    const depth = await getProjectDepth(parent._id);
    if (depth + 1 >= MAX_PROJECT_DEPTH) {
      throw new HierarchyError(
        400,
        `Subprojects cannot nest more than ${MAX_PROJECT_DEPTH} levels`
      );
    }
    return {
      organizationId: parent.organization || null,
      workspaceId: parent.workspace || null,
      folderId: null,
      parentProjectId: parent._id,
      members: cloneMembers(parent.members, userId),
      skipOrgCreateCheck: true,
    };
  }

  if (folderId) {
    if (!isValidId(folderId)) {
      throw new HierarchyError(400, "Invalid folder");
    }
    const folder = await Folder.findOne({
      _id: folderId,
      isDeleted: { $ne: true },
    });
    if (!folder) {
      throw new HierarchyError(404, "Folder not found");
    }
    await loadWorkspaceOrThrow(userId, folder.workspace);
    return {
      organizationId: folder.organization || null,
      workspaceId: folder.workspace,
      folderId: folder._id,
      parentProjectId: null,
      members: null,
      skipOrgCreateCheck: false,
    };
  }

  return {
    organizationId: body.organizationId || null,
    workspaceId: body.workspaceId || null,
    folderId: null,
    parentProjectId: null,
    members: null,
    skipOrgCreateCheck: false,
  };
}

function toTreeProject(doc) {
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return {
    _id: String(obj._id),
    title: obj.title,
    folder: obj.folder ? String(obj.folder) : null,
    workspaceFile: obj.workspaceFile ? String(obj.workspaceFile) : null,
    parentProject: obj.parentProject ? String(obj.parentProject) : null,
    order: obj.order || 0,
    children: [],
    folders: [],
  };
}

function toTreeFolder(doc) {
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return {
    _id: String(obj._id),
    name: obj.name,
    parentFolder: obj.parentFolder ? String(obj.parentFolder) : null,
    parentProject: obj.parentProject ? String(obj.parentProject) : null,
    order: obj.order || 0,
    folders: [],
    projects: [],
  };
}

function sortProjectNodes(nodes) {
  nodes.sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title)
  );
  for (const node of nodes) {
    sortProjectNodes(node.children);
    sortFolderNodes(node.folders);
  }
}

function sortFolderNodes(nodes) {
  nodes.sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name)
  );
  for (const node of nodes) {
    sortFolderNodes(node.folders);
    sortProjectNodes(node.projects);
  }
}

function indexProjectNodes(nodes, map) {
  for (const node of nodes) {
    map.set(node._id, node);
    if (node.children?.length) indexProjectNodes(node.children, map);
  }
}

function nestProjects(projects) {
  const byId = new Map();
  for (const project of projects) {
    const node = toTreeProject(project);
    byId.set(node._id, node);
  }

  const roots = [];
  for (const node of byId.values()) {
    if (node.parentProject && byId.has(node.parentProject)) {
      byId.get(node.parentProject).children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes) => {
    sortProjectNodes(nodes);
  };
  sortNodes(roots);
  return roots;
}

function nestFolderNodes(folders) {
  const byId = new Map();
  for (const folder of folders) {
    const node = toTreeFolder(folder);
    byId.set(node._id, node);
  }

  const roots = [];
  for (const node of byId.values()) {
    if (node.parentFolder && byId.has(node.parentFolder)) {
      byId.get(node.parentFolder).folders.push(node);
    } else if (!node.parentProject) {
      roots.push(node);
    }
  }

  return { byId, roots };
}

function buildProjectTree(folders, files, projects) {
  const nestedRoots = nestProjects(projects);
  const { byId: folderMap, roots: folderRoots } = nestFolderNodes(folders);
  const projectById = new Map();
  indexProjectNodes(nestedRoots, projectById);

  for (const node of folderMap.values()) {
    if (node.parentProject && projectById.has(node.parentProject)) {
      projectById.get(node.parentProject).folders.push(node);
    }
  }

  const fileNodes = files.map((file) => {
    const obj =
      typeof file.toObject === "function" ? file.toObject() : { ...file };
    return {
      _id: String(obj._id),
      name: obj.name,
      order: obj.order || 0,
      projects: [],
    };
  });
  const fileMap = new Map(fileNodes.map((f) => [f._id, f]));
  const ungrouped = [];

  for (const project of nestedRoots) {
    if (project.folder && folderMap.has(project.folder)) {
      folderMap.get(project.folder).projects.push(project);
    } else if (project.workspaceFile && fileMap.has(project.workspaceFile)) {
      fileMap.get(project.workspaceFile).projects.push(project);
    } else {
      ungrouped.push(project);
    }
  }

  sortFolderNodes(folderRoots);
  fileNodes.sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name)
  );

  return {
    folders: folderRoots,
    files: fileNodes,
    projects: ungrouped,
  };
}

function pruneProjectNode(project) {
  project.folders = pruneEmptyFolderNodes(project.folders || []);
  project.children = (project.children || []).map(pruneProjectNode);
  return project;
}

/** Remove folders that do not contain any visible projects (directly or nested). */
function pruneEmptyFolderNodes(folders) {
  const kept = [];
  for (const folder of folders || []) {
    folder.folders = pruneEmptyFolderNodes(folder.folders);
    folder.projects = (folder.projects || []).map(pruneProjectNode);
    if (folder.folders.length > 0 || folder.projects.length > 0) {
      kept.push(folder);
    }
  }
  return kept;
}

function pruneProjectTreeForViewer(tree, { keepEmptyFolders = false } = {}) {
  if (keepEmptyFolders) {
    return {
      folders: tree.folders || [],
      files: tree.files || [],
      projects: tree.projects || [],
    };
  }
  return {
    folders: pruneEmptyFolderNodes(tree.folders || []),
    files: tree.files || [],
    projects: (tree.projects || []).map(pruneProjectNode),
  };
}

const PROJECT_TREE_SELECT =
  "title folder workspaceFile parentProject order";

/** Walk parentProject chain for projects the user can access. */
async function collectAncestorProjectIds(rootIds) {
  const members = new Set((rootIds || []).map(String).filter(Boolean));
  const ancestors = new Set();
  let frontier = [...members];

  while (frontier.length) {
    const docs = await Project.find({
      _id: { $in: frontier },
      isDeleted: { $ne: true },
    }).select("parentProject");

    frontier = [];
    for (const doc of docs) {
      if (!doc?.parentProject) continue;
      const parentId = String(doc.parentProject);
      if (!members.has(parentId) && !ancestors.has(parentId)) {
        ancestors.add(parentId);
        frontier.push(parentId);
      }
    }
  }

  return [...ancestors];
}

/** Include every parent folder up to the workspace root. */
async function expandFolderIdsWithAncestors(seedIds) {
  const all = new Set((seedIds || []).map(String).filter(Boolean));
  let frontier = [...all];

  while (frontier.length) {
    const docs = await Folder.find({
      _id: { $in: frontier },
      isDeleted: { $ne: true },
    }).select("parentFolder");

    frontier = [];
    for (const doc of docs) {
      if (!doc?.parentFolder) continue;
      const parentId = String(doc.parentFolder);
      if (!all.has(parentId)) {
        all.add(parentId);
        frontier.push(parentId);
      }
    }
  }

  return [...all];
}

/**
 * Expand member-visible projects with ancestor projects/folders so the sidebar
 * shows the full path (folder → project → subproject) for assigned work.
 */
async function resolveProjectTreeDocuments(
  memberProjects,
  { workspaceId, includeAllWorkspaceFolders = false } = {}
) {
  const memberIds = memberProjects.map((p) => String(p._id));
  const ancestorIds = await collectAncestorProjectIds(memberIds);

  const ancestorProjects = ancestorIds.length
    ? await Project.find({
        _id: { $in: ancestorIds },
        isDeleted: { $ne: true },
        status: { $ne: "archived" },
      }).select(PROJECT_TREE_SELECT)
    : [];

  const projectMap = new Map();
  for (const project of memberProjects) {
    projectMap.set(String(project._id), project);
  }
  for (const project of ancestorProjects) {
    projectMap.set(String(project._id), project);
  }
  const projects = [...projectMap.values()];
  const allProjectIds = projects.map((p) => p._id);

  const folderSeedIds = new Set();
  for (const project of projects) {
    if (project.folder) folderSeedIds.add(String(project.folder));
  }

  const nestedFolders = await Folder.find({
    parentProject: { $in: allProjectIds },
    isDeleted: { $ne: true },
  }).select("_id");

  for (const folder of nestedFolders) {
    folderSeedIds.add(String(folder._id));
  }

  const expandedFolderIds = await expandFolderIdsWithAncestors([
    ...folderSeedIds,
  ]);
  const folderById = new Map();
  if (expandedFolderIds.length) {
    const linkedFolders = await Folder.find({
      _id: { $in: expandedFolderIds },
      isDeleted: { $ne: true },
    }).sort({ order: 1, name: 1 });
    for (const folder of linkedFolders) {
      folderById.set(String(folder._id), folder);
    }
  }

  if (includeAllWorkspaceFolders && workspaceId) {
    const workspaceFolders = await Folder.find({
      workspace: workspaceId,
      isDeleted: { $ne: true },
    }).sort({ order: 1, name: 1 });
    for (const folder of workspaceFolders) {
      folderById.set(String(folder._id), folder);
    }
  }

  return { projects, folders: [...folderById.values()] };
}

/**
 * Resolve optional parent folder / project for folder create.
 */
async function resolveFolderCreateLocation(userId, body = {}) {
  const parentFolderId = body.parentFolderId || null;
  const parentProjectId = body.parentProjectId || null;
  const filled = [parentFolderId, parentProjectId].filter(Boolean);
  if (filled.length > 1) {
    throw new HierarchyError(
      400,
      "Provide only one of parentFolderId or parentProjectId"
    );
  }

  if (parentProjectId) {
    if (!isValidId(parentProjectId)) {
      throw new HierarchyError(400, "Invalid parent project");
    }
    const parent = await Project.findById(parentProjectId);
    if (!parent || parent.isDeleted) {
      throw new HierarchyError(404, "Parent project not found");
    }
    await assertCanAccessProject(parent, userId);
    return {
      organizationId: parent.organization || null,
      workspaceId: parent.workspace || null,
      parentFolderId: null,
      parentProjectId: parent._id,
      skipOrgCreateCheck: true,
    };
  }

  if (parentFolderId) {
    if (!isValidId(parentFolderId)) {
      throw new HierarchyError(400, "Invalid parent folder");
    }
    const parent = await Folder.findOne({
      _id: parentFolderId,
      isDeleted: { $ne: true },
    });
    if (!parent) {
      throw new HierarchyError(404, "Parent folder not found");
    }
    await loadWorkspaceOrThrow(userId, parent.workspace);
    return {
      organizationId: parent.organization || null,
      workspaceId: parent.workspace,
      parentFolderId: parent._id,
      parentProjectId: null,
      skipOrgCreateCheck: false,
    };
  }

  const scope = await resolveContainerWorkspace(userId, {
    organizationId: body.organizationId,
    workspaceId: body.workspaceId,
    personal: body.personal,
  });

  return {
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    parentFolderId: null,
    parentProjectId: null,
    skipOrgCreateCheck: false,
  };
}

async function resolveContainerWorkspace(userId, { organizationId, workspaceId, personal }) {
  const explicitOrgId =
    personal === "true" || personal === true ? null : organizationId || null;

  let resolvedWorkspaceId = workspaceId || null;

  if (resolvedWorkspaceId) {
    const ws = await getWorkspaceForUser(userId, resolvedWorkspaceId);
    if (!ws) {
      throw new HierarchyError(400, "Invalid workspace");
    }
    const wsOrgId = ws.organization ? String(ws.organization) : null;
    if (explicitOrgId && wsOrgId !== String(explicitOrgId)) {
      // Stale personal/other-org workspace id while creating in an org — use org default.
      resolvedWorkspaceId = null;
    }
  }

  if (!resolvedWorkspaceId) {
    resolvedWorkspaceId = await resolveDefaultWorkspaceId(userId, {
      organizationId: explicitOrgId,
      workspaceId: null,
    });
  }

  if (!resolvedWorkspaceId) {
    throw new HierarchyError(400, "Invalid workspace");
  }

  const ws = await getWorkspaceForUser(userId, resolvedWorkspaceId);
  if (!ws) {
    throw new HierarchyError(400, "Invalid workspace");
  }

  let resolvedOrgId = explicitOrgId;
  if (!resolvedOrgId && ws.organization) {
    resolvedOrgId = ws.organization;
  }
  if (personal === "true" || personal === true) {
    resolvedOrgId = null;
  }

  return {
    workspaceId: resolvedWorkspaceId,
    organizationId: resolvedOrgId,
  };
}

module.exports = {
  MAX_PROJECT_DEPTH,
  HierarchyError,
  toId,
  isValidId,
  resolveCreateLocation,
  resolveFolderCreateLocation,
  assertCanCreateInOrg,
  assertCanAccessProject,
  getProjectDepth,
  buildProjectTree,
  pruneProjectTreeForViewer,
  resolveProjectTreeDocuments,
  nestProjects,
  resolveContainerWorkspace,
  loadWorkspaceOrThrow,
};
