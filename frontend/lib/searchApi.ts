import { authFetch } from "@/lib/validation/authFetch";
import { appendWorkspaceScope } from "@/lib/workspaceStorage";

export type SearchScope = {
  organizationId?: string | null;
  personal?: boolean;
};

export type SearchProject = {
  _id: string;
  title: string;
  description?: string;
  status?: string;
  organization?: { _id: string; name: string } | null;
};

export type SearchTask = {
  _id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  project?: { _id: string; title: string } | null;
};

export type SearchMember = {
  _id: string;
  username: string;
  email?: string;
  designation?: string;
  department?: string;
};

export type SearchCalendarEvent = {
  _id: string;
  title: string;
  description?: string;
  date?: string;
  time?: string;
  type?: string;
  organization?: { _id: string; name: string } | null;
};

export type SearchResults = {
  query: string;
  projects: SearchProject[];
  tasks: SearchTask[];
  members: SearchMember[];
  calendar: SearchCalendarEvent[];
};

export const EMPTY_SEARCH_RESULTS: SearchResults = {
  query: "",
  projects: [],
  tasks: [],
  members: [],
  calendar: [],
};

export function countSearchResults(results: SearchResults) {
  return (
    results.projects.length +
    results.tasks.length +
    results.members.length +
    results.calendar.length
  );
}

export async function fetchSearchResults(
  query: string,
  limit = 5,
  signal?: AbortSignal,
  scope?: SearchScope
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { ...EMPTY_SEARCH_RESULTS, query: "" };

  const params = new URLSearchParams();
  params.set("q", q);
  params.set("limit", String(limit));
  if (scope?.organizationId) {
    params.set("organizationId", scope.organizationId);
  } else if (scope?.personal) {
    params.set("personal", "true");
  }
  appendWorkspaceScope(params);

  const res = await authFetch(`/search?${params.toString()}`, { signal });

  if (!res.ok) {
    throw new Error("Search failed");
  }

  const data = await res.json();
  return {
    query: data.query || q,
    projects: Array.isArray(data.projects) ? data.projects : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    members: Array.isArray(data.members) ? data.members : [],
    calendar: Array.isArray(data.calendar) ? data.calendar : [],
  };
}

export function getSearchResultHref(
  type: "project" | "task" | "member" | "calendar",
  item: SearchProject | SearchTask | SearchMember | SearchCalendarEvent
) {
  switch (type) {
    case "project":
      return `/projects/${(item as SearchProject)._id}`;
    case "task": {
      const task = item as SearchTask;
      const projectId = task.project?._id;
      return projectId
        ? `/projects/${projectId}?task=${task._id}`
        : "/projects";
    }
    case "member":
      return `/members?q=${encodeURIComponent((item as SearchMember).username)}`;
    case "calendar": {
      const event = item as SearchCalendarEvent;
      const orgId = event.organization?._id;
      const params = new URLSearchParams({ q: event.title });
      if (orgId) params.set("org", orgId);
      return `/calendar?${params.toString()}`;
    }
    default:
      return "/search";
  }
}
