function toId(value) {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function pushMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function buildHierarchyMaps(folders = [], projects = []) {
  const foldersByParentFolder = new Map();
  const foldersByParentProject = new Map();
  const projectsByFolder = new Map();
  const projectsByParent = new Map();
  const folderIds = new Set();
  const projectIds = new Set();
  const rootFolders = [];
  const standaloneProjects = [];

  for (const folder of folders) {
    const id = toId(folder._id);
    if (!id) continue;
    folderIds.add(id);
    const parentFolder = toId(folder.parentFolder);
    const parentProject = toId(folder.parentProject);
    if (parentFolder) pushMap(foldersByParentFolder, parentFolder, id);
    else if (parentProject) pushMap(foldersByParentProject, parentProject, id);
    else rootFolders.push(id);
  }

  for (const project of projects) {
    const id = toId(project._id);
    if (!id) continue;
    projectIds.add(id);
    const folder = toId(project.folder);
    const parentProject = toId(project.parentProject);
    if (parentProject) pushMap(projectsByParent, parentProject, id);
    else if (folder) pushMap(projectsByFolder, folder, id);
    else standaloneProjects.push(id);
  }

  return {
    foldersByParentFolder,
    foldersByParentProject,
    projectsByFolder,
    projectsByParent,
    folderIds,
    projectIds,
    rootFolders,
    standaloneProjects,
  };
}

function collectFromFolder(folderId, maps, accFolders, accProjects) {
  const id = toId(folderId);
  if (!id || !maps.folderIds.has(id) || accFolders.has(id)) return;
  accFolders.add(id);
  for (const child of maps.foldersByParentFolder.get(id) || []) {
    collectFromFolder(child, maps, accFolders, accProjects);
  }
  for (const projectId of maps.projectsByFolder.get(id) || []) {
    collectFromProject(projectId, maps, accFolders, accProjects);
  }
}

function collectFromProject(projectId, maps, accFolders, accProjects) {
  const id = toId(projectId);
  if (!id || !maps.projectIds.has(id) || accProjects.has(id)) return;
  accProjects.add(id);
  for (const child of maps.projectsByParent.get(id) || []) {
    collectFromProject(child, maps, accFolders, accProjects);
  }
  for (const folderId of maps.foldersByParentProject.get(id) || []) {
    collectFromFolder(folderId, maps, accFolders, accProjects);
  }
}

/**
 * Recursively resolve selected sources minus excluded project trees.
 * Deduplicates overlapping folder/project selections.
 */
function expandSources({
  folders = [],
  projects = [],
  sources = [],
  excludedProjectIds = [],
  workspaceId,
} = {}) {
  const maps = buildHierarchyMaps(folders, projects);
  const accFolders = new Set();
  const accProjects = new Set();
  const wsId = toId(workspaceId);

  for (const source of sources || []) {
    const type = source?.type;
    const id = toId(source?.id);
    if (!type || !id) continue;

    if (type === "workspace") {
      if (wsId && id !== wsId) continue;
      for (const folder of folders) accFolders.add(toId(folder._id));
      for (const project of projects) accProjects.add(toId(project._id));
    } else if (type === "folder") {
      collectFromFolder(id, maps, accFolders, accProjects);
    } else if (type === "project") {
      collectFromProject(id, maps, accFolders, accProjects);
    }
  }

  const excluded = new Set();
  for (const id of excludedProjectIds || []) {
    collectFromProject(id, maps, new Set(), excluded);
  }

  const projectIds = [...accProjects].filter((id) => !excluded.has(id));
  return {
    folderIds: [...accFolders],
    projectIds,
    excludedProjectIds: [...excluded],
  };
}

function flattenProjectsUnderSources(folders, projects, sources, workspaceId) {
  return expandSources({
    folders,
    projects,
    sources,
    excludedProjectIds: [],
    workspaceId,
  }).projectIds;
}

module.exports = {
  toId,
  buildHierarchyMaps,
  collectFromFolder,
  collectFromProject,
  expandSources,
  flattenProjectsUnderSources,
};
