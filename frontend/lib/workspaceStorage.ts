/** Active workspace id (Personal / Internal / External / custom) */
export const WORKSPACE_STORAGE_KEY = "currentWorkspaceId";

export function readStoredWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(WORKSPACE_STORAGE_KEY);
}

export function writeStoredWorkspaceId(workspaceId: string | null) {
  if (typeof window === "undefined") return;
  if (workspaceId) localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
  else localStorage.removeItem(WORKSPACE_STORAGE_KEY);
}

export function clearStoredWorkspaceId() {
  writeStoredWorkspaceId(null);
}

/** Build org/personal + workspace query string for scoped API calls. */
export function buildScopeQuery(orgId: string | null): string {
  const params = new URLSearchParams();
  if (orgId) params.set("organizationId", orgId);
  else params.set("personal", "true");
  const ws = readStoredWorkspaceId();
  if (ws) params.set("workspaceId", ws);
  return `?${params.toString()}`;
}

/** Append workspaceId to an existing URLSearchParams (dashboard overview, etc.). */
export function appendWorkspaceScope(params: URLSearchParams): URLSearchParams {
  const ws = readStoredWorkspaceId();
  if (ws) params.set("workspaceId", ws);
  return params;
}

/** Cache key for dashboard charts — org + workspace. */
export function buildDashboardScopeKey(orgId: string | null): string {
  const ws = readStoredWorkspaceId();
  return `${orgId ?? "personal"}:${ws ?? "default"}`;
}

export function resolveProjectWorkspaceRef(
  workspace: string | { _id?: string } | null | undefined
): string | null {
  if (!workspace) return null;
  if (typeof workspace === "object") {
    const id = workspace._id;
    return id ? String(id) : null;
  }
  return String(workspace);
}

/** True when a project belongs to the workspace selected in the sidebar. */
export function projectMatchesActiveWorkspace(
  projectWorkspace: string | { _id?: string } | null | undefined
): boolean {
  const active = readStoredWorkspaceId();
  if (!active) return true;
  const projectWs = resolveProjectWorkspaceRef(projectWorkspace);
  if (!projectWs) return false;
  return projectWs === active;
}

/** Leave project detail routes when the active workspace changes. */
export function redirectFromProjectRoutesIfNeeded() {
  if (typeof window === "undefined") return;
  if (/^\/projects\/[^/]+/.test(window.location.pathname)) {
    window.location.href = "/projects";
  }
}

/**
 * Leave Request Form detail routes (edit / submit / a single request)
 * when the active workspace changes — those forms/submissions are
 * workspace-scoped, so staying on one from the previous workspace
 * would just start failing (404) on the next action.
 */
export function redirectFromRequestFormRoutesIfNeeded() {
  if (typeof window === "undefined") return;
  const { pathname } = window.location;
  if (
    /^\/request-forms\/[^/]+\/edit/.test(pathname) ||
    /^\/request-forms\/submit\/[^/]+/.test(pathname) ||
    /^\/request-forms\/requests\/[^/]+/.test(pathname)
  ) {
    window.location.href = "/request-forms";
  }
}
