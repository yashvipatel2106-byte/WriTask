export type TreeProject = {
  _id: string;
  title: string;
  folder?: string | null;
  workspaceFile?: string | null;
  parentProject?: string | null;
  children: TreeProject[];
  folders: TreeFolder[];
};

export type TreeFolder = {
  _id: string;
  name: string;
  folders: TreeFolder[];
  projects: TreeProject[];
};

export type TreeFile = {
  _id: string;
  name: string;
  projects: TreeProject[];
};

export type ProjectTree = {
  folders: TreeFolder[];
  files: TreeFile[];
  projects: TreeProject[];
};

export const EMPTY_PROJECT_TREE: ProjectTree = {
  folders: [],
  files: [],
  projects: [],
};

export function flattenTreeProjects(tree: ProjectTree): TreeProject[] {
  const out: TreeProject[] = [];
  const walk = (nodes: TreeProject[]) => {
    for (const node of nodes) {
      out.push(node);
      if (node.folders?.length) {
        for (const folder of node.folders) {
          walk(folder.projects);
        }
      }
      if (node.children?.length) walk(node.children);
    }
  };
  const walkFolders = (folders: TreeFolder[]) => {
    for (const folder of folders) {
      walk(folder.projects);
      if (folder.folders?.length) walkFolders(folder.folders);
    }
  };
  walkFolders(tree.folders);
  for (const file of tree.files) walk(file.projects);
  walk(tree.projects);
  return out;
}

export function flattenTreeFolders(folders: TreeFolder[]): TreeFolder[] {
  const out: TreeFolder[] = [];
  const walk = (nodes: TreeFolder[]) => {
    for (const node of nodes) {
      out.push(node);
      if (node.folders?.length) walk(node.folders);
    }
  };
  walk(folders);
  return out;
}
