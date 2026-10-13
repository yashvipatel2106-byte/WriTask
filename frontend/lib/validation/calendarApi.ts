/**
 * calendarApi.ts
 * All calendar + org-member API calls, centralised here.
 *
 * Uses the same API base as the rest of the app (incl. Dev Tunnel rewrite).
 */

import { authJsonFetch } from "@/lib/validation/authJsonFetch";
import { appendWorkspaceScope, readStoredWorkspaceId } from "@/lib/workspaceStorage";

function workspaceQuerySuffix() {
  const ws = readStoredWorkspaceId();
  if (!ws) return "";
  return `&workspaceId=${encodeURIComponent(ws)}`;
}

// ── shared fetch wrapper ──────────────────────────────────────────────────────
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return authJsonFetch<T>(path, options, "Calendar request");
}

// ── types (mirroring backend populate shape) ──────────────────────────────────
export type UserSnap = {
  _id: string;
  username: string;
  email: string;
  avatarColor?: string;
  designation?: string;
  department?: string;
  status?: "Active" | "Idle" | "Offline" | "Suspended";
};

export type OrgMemberWithStats = {
  user: UserSnap;
  role: "owner" | "admin" | "manager" | "developer" | "viewer";
  joinedAt: string;
  eventCount: number;
  /** Total active tasks assigned to this member across the org's projects. */
  taskCount: number;
};

export type MemberAssignedTask = {
  _id: string;
  title: string;
  description: string;
  status: string;
  priority: "low" | "medium" | "high";
  dueDate: string | null;
  startDate: string | null;
  project: { _id: string; title: string } | null;
};

export type CalendarEventAPI = {
  _id: string;
  title: string;
  description: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm"
  type: "task" | "meeting" | "reminder" | "leave";
  priority: "low" | "medium" | "high";
  space: string;
  workspace?: string | null;
  /** Denormalized project title for task-linked events (from calendar sync). */
  projectName?: string;
  assignees: UserSnap[];
  createdBy: UserSnap;
  meeting?: {
    enabled?: boolean;
    status: "scheduled" | "live" | "ended";
    roomId?: string | null;
    meetingLink?: string | null;
  } | null;
  taskRef?: {
    _id: string;
    title: string;
    status: string;
    priority: string;
    project?: { _id: string; title: string } | null;
  } | null;
  leaveRef?: {
    _id: string;
    leaveType: string;
    reason: string;
    startDate: string;
    endDate: string;
    status: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateEventPayload = {
  title: string;
  description?: string;
  date: string;
  time?: string;
  type: "task" | "meeting" | "reminder" | "leave";
  priority?: "low" | "medium" | "high";
  space?: string;
  workspaceId?: string | null;
  assignees?: string[]; // User _id strings
  taskRef?: string | null;
  /** Only used when type === "task" — creates/updates a linked Task. */
  projectId?: string;
  status?: string;
};

// ── projects (for the Type=Task Project picker) ────────────────────────────────
export type CalendarProjectOption = {
  _id: string;
  title: string;
  customStatuses: { id: string; label: string }[];
  myRole: string;
  // Raw member list (user id + role, not populated) — used to filter the
  // Project dropdown down to projects the selected assignee(s) belong to.
  members: { user: string; role: string }[];
};

export type CalendarWorkspaceOption = {
  id: string;
  name: string;
  kind: string;
  organizationId?: string | null;
};

export async function fetchCalendarWorkspaces(orgId: string) {
  const r = await apiFetch<{ workspaces: CalendarWorkspaceOption[] }>(
    `/workspaces?organizationId=${encodeURIComponent(orgId)}`
  );
  return Array.isArray(r.workspaces) ? r.workspaces : [];
}
export async function fetchCalendarEvents(orgId: string, month: string, space?: string, all?: boolean) {
  const spaceQs = space && space !== "all" ? `&space=${encodeURIComponent(space)}` : "";
  const allQs = all ? "&all=true" : "";
  const r = await apiFetch<{ success: boolean; data: CalendarEventAPI[] }>(
    `/organisations/${orgId}/calendar?month=${month}${spaceQs}${allQs}${workspaceQuerySuffix()}`,
    { method: "GET" }
  );
  return r.data;
}

/** One member's events (created by or assigned to them) for an arbitrary
 * month — used by the Team panel's "member's items" breakdown to page
 * through previous/upcoming months without touching the main grid's
 * currently-loaded month. */
export async function fetchMemberCalendarEvents(orgId: string, userId: string, month: string) {
  const r = await apiFetch<{ success: boolean; data: CalendarEventAPI[] }>(
    `/organisations/${orgId}/calendar?month=${month}&userId=${encodeURIComponent(userId)}${workspaceQuerySuffix()}`,
    { method: "GET" }
  );
  return r.data;
}

// ── projects (reuses the existing /projects list endpoint the sidebar uses) ────
export async function fetchOrgProjects(orgId: string) {
  const params = new URLSearchParams({ organizationId: orgId });
  appendWorkspaceScope(params);
  return apiFetch<CalendarProjectOption[]>(
    `/projects?${params.toString()}`,
    { method: "GET" }
  );
}

export async function createCalendarEvent(
  orgId: string,
  payload: CreateEventPayload
) {
  const r = await apiFetch<{ success: boolean; data: CalendarEventAPI }>(
    `/organisations/${orgId}/calendar`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  return r.data;
}

export async function updateCalendarEvent(
  orgId: string,
  eventId: string,
  payload: Partial<CreateEventPayload>
) {
  const r = await apiFetch<{ success: boolean; data: CalendarEventAPI }>(
    `/organisations/${orgId}/calendar/${eventId}`,
    { method: "PUT", body: JSON.stringify(payload) }
  );
  return r.data;
}

export async function deleteCalendarEvent(orgId: string, eventId: string) {
  await apiFetch(`/organisations/${orgId}/calendar/${eventId}`, {
    method: "DELETE",
  });
}

// ── org members ───────────────────────────────────────────────────────────────
export async function fetchOrgMembers(orgId: string, month?: string) {
  const qs = new URLSearchParams();
  if (month) qs.set("month", month);
  appendWorkspaceScope(qs);
  const query = qs.toString();
  const r = await apiFetch<{ success: boolean; data: OrgMemberWithStats[] }>(
    `/organisations/${orgId}/calendar/members${query ? `?${query}` : ""}`
  );
  return r.data.map((m) => ({
    ...m,
    taskCount: typeof m.taskCount === "number" ? m.taskCount : 0,
    eventCount: typeof m.eventCount === "number" ? m.eventCount : 0,
  }));
}

/** All active tasks in the org assigned to a specific team member. */
export async function fetchMemberAssignedTasks(orgId: string, memberId: string) {
  const params = appendWorkspaceScope(new URLSearchParams());
  const qs = params.toString();
  const r = await apiFetch<{ success: boolean; data: MemberAssignedTask[] }>(
    `/organisations/${orgId}/calendar/members/${encodeURIComponent(memberId)}/tasks${qs ? `?${qs}` : ""}`,
    { method: "GET" }
  );
  return r.data;
}

// ── task sync ─────────────────────────────────────────────────────────────────
export async function syncTasksToCalendar(orgId: string) {
  const params = appendWorkspaceScope(new URLSearchParams());
  const qs = params.toString();
  const r = await apiFetch<{ success: boolean; message: string }>(
    `/organisations/${orgId}/calendar/sync-tasks${qs ? `?${qs}` : ""}`,
    { method: "POST" }
  );
  return r.message;
}
// Start meeting
export async function startMeeting(orgId: string, eventId: string) {
  return apiFetch<{
    success: boolean;
    message: string;
    data: CalendarEventAPI;
    roomId?: string;
    meetingLink?: string;
  }>(`/organisations/${orgId}/calendar/${eventId}/start`, {
    method: "POST",
  });
}

// Join meeting
export async function joinMeeting(orgId: string, eventId: string) {
  return apiFetch<{
    success: boolean;
    roomId: string;
    meetingLink?: string;
    status: string;
  }>(`/organisations/${orgId}/calendar/${eventId}/join`, {
    method: "POST",
  });
}

// End meeting
export async function endMeeting(orgId: string, eventId: string) {
  return apiFetch<{ success: boolean; message: string; data: CalendarEventAPI }>(
    `/organisations/${orgId}/calendar/${eventId}/end`,
    {
      method: "POST",
    }
  );
}

export type MeetingRoomInfo = {
  eventId: string;
  orgId: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  status: "scheduled" | "live" | "ended";
  roomId: string;
  meetingLink?: string;
  isHost: boolean;
  createdBy: UserSnap;
  assignees: UserSnap[];
};

export async function fetchMeetingByRoomId(orgId: string, roomId: string) {
  const r = await apiFetch<{ success: boolean; data: MeetingRoomInfo }>(
    `/organisations/${orgId}/calendar/meeting/${roomId}`,
    { method: "GET" }
  );
  return r.data;
}

/** Resolve a shareable /meeting/:roomId link (no org required in the URL). */
export async function resolveMeetingByRoomId(roomId: string) {
  const r = await apiFetch<{ success: boolean; data: MeetingRoomInfo }>(
    `/meetings/${roomId}`,
    { method: "GET" }
  );
  return r.data;
}

