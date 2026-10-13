export type ProjectViewMode = "kanban" | "table" | "gantt";

const KEY_PREFIX = "projectView:";

export function parseProjectViewParam(
  value: string | null | undefined
): ProjectViewMode | null {
  return value === "kanban" || value === "table" || value === "gantt"
    ? value
    : null;
}

export function readStoredProjectView(
  projectId: string
): ProjectViewMode | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(`${KEY_PREFIX}${projectId}`);
  return parseProjectViewParam(stored);
}

export function writeStoredProjectView(
  projectId: string,
  view: ProjectViewMode
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${KEY_PREFIX}${projectId}`, view);
}
