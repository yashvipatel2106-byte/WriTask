import { authFetch } from "@/lib/validation/authFetch";

export type NotificationType =
  | "assignment"
  | "mention"
  | "comment"
  | "status"
  | "due_date"
  | "invite"
  | "system"
  | "reply"
  | "leave_requested"
  | "leave_approved"
  | "leave_rejected"
  | "reminder";

export type NotificationItem = {
  _id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  archived?: boolean;
  priority?: "Low" | "Medium" | "High";
  link?: string;
  taskId?: string;
  projectId?: string;
  createdAt: string;
  actor?: { _id: string; username?: string; email?: string } | null;
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  assignment: "Assignment",
  mention: "Mention",
  comment: "Comment",
  status: "Status",
  due_date: "Due date",
  invite: "Invite",
  system: "System",
  reply: "Reply",
  leave_requested: "Leave requested",
  leave_approved: "Leave approved",
  leave_rejected: "Leave rejected",
  reminder: "Reminder",
};

export type FeatureRow = {
  feature: string;
  notifications: boolean | "partial";
  inbox: boolean | "partial";
};

/** Feature comparison sheet — what lives in bell vs full inbox */
export const NOTIFICATION_INBOX_FEATURE_SHEET: FeatureRow[] = [
  { feature: "Unread badge count", notifications: true, inbox: true },
  { feature: "Last 10 alerts preview", notifications: true, inbox: false },
  { feature: "Full notification history", notifications: false, inbox: true },
  { feature: "Mark single as read", notifications: true, inbox: true },
  { feature: "Mark all as read", notifications: true, inbox: true },
  { feature: "Archive / remove from list", notifications: false, inbox: true },
  { feature: "Search notifications", notifications: false, inbox: true },
  { feature: "Filter by type (mention, assignment…)", notifications: false, inbox: true },
  { feature: "Filter unread / read", notifications: "partial", inbox: true },
  { feature: "Priority filter (High)", notifications: "partial", inbox: true },
  { feature: "Open task / project (deep link)", notifications: true, inbox: true },
  { feature: "Reply to thread", notifications: false, inbox: true },
  { feature: "View full message body", notifications: "partial", inbox: true },
  { feature: "Auto: task assigned (create / reassign)", notifications: true, inbox: true },
  { feature: "Auto: @mention in task", notifications: true, inbox: true },
  { feature: "Auto: comment on your task", notifications: true, inbox: true },
  { feature: "Auto: status change (all project members)", notifications: true, inbox: true },
  { feature: "Auto: other task updates (assignee only)", notifications: true, inbox: true },
  { feature: "Per-user read state (your open ≠ others' count)", notifications: true, inbox: true },
  { feature: "Activity timeline on item", notifications: false, inbox: true },
  { feature: "Bulk actions", notifications: false, inbox: false },
  { feature: "Email / push (future)", notifications: false, inbox: false },
];

export async function fetchNotificationSummary(params?: {
  organizationId?: string | null;
  personal?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.organizationId) {
    query.set("organizationId", params.organizationId);
  } else if (params?.personal) {
    query.set("personal", "true");
  }

  const qs = query.toString();
  const res = await authFetch(`/notifications/summary${qs ? `?${qs}` : ""}`);
  if (!res.ok) return { unreadCount: 0 };
  return res.json();
}

export async function fetchNotifications(params?: {
  limit?: number;
  unread?: boolean;
  type?: string;
  search?: string;
  archived?: boolean;
  organizationId?: string | null;
  personal?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.unread) query.set("unread", "true");
  if (params?.type && params.type !== "all") query.set("type", params.type);
  if (params?.search) query.set("search", params.search);
  if (params?.archived) query.set("archived", "true");
  if (params?.organizationId) {
    query.set("organizationId", params.organizationId);
  } else if (params?.personal) {
    query.set("personal", "true");
  }

  const qs = query.toString();
  const res = await authFetch(`/notifications${qs ? `?${qs}` : ""}`);
  if (!res.ok) return [] as NotificationItem[];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Broadcast so navbar badge stays in sync after inbox actions */
export function dispatchNotificationsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("notifications-updated"));
  }
}

export async function markNotificationRead(id: string) {
  const res = await authFetch(`/notifications/${id}/read`, { method: "PUT" });
  if (res.ok) dispatchNotificationsUpdated();
  return res;
}

export async function markAllNotificationsRead() {
  const res = await authFetch("/notifications/read-all", { method: "PUT" });
  if (res.ok) dispatchNotificationsUpdated();
  return res;
}

export async function archiveNotification(id: string) {
  const res = await authFetch(`/notifications/${id}/archive`, { method: "PUT" });
  if (res.ok) dispatchNotificationsUpdated();
  return res;
}

export function formatNotificationTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)} hr ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function actorName(item: NotificationItem) {
  return item.actor?.username || "System";
}

export function priorityClass(priority?: string) {
  if (priority === "High") return "text-red-400";
  if (priority === "Low") return "text-green-400";
  return "text-yellow-400";
}

export function typeBadgeClass(type: NotificationType) {
  const map: Record<NotificationType, string> = {
    assignment: "bg-violet-500/15 text-violet-300",
    mention: "bg-purple-500/15 text-purple-300",
    comment: "bg-cyan-500/15 text-cyan-300",
    status: "bg-blue-500/15 text-blue-300",
    due_date: "bg-amber-500/15 text-amber-300",
    invite: "bg-emerald-500/15 text-emerald-300",
    system: "bg-slate-500/15 text-slate-300",
    reply: "bg-pink-500/15 text-pink-300",
    leave_requested: "bg-orange-500/15 text-orange-300",
    leave_approved: "bg-green-500/15 text-green-300",
    leave_rejected: "bg-red-500/15 text-red-300",
    reminder: "bg-red-500/15 text-red-300",
  };
  return map[type] || map.system;
}
