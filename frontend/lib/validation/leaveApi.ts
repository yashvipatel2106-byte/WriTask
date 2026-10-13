/**
 * leaveApi.ts
 * Leave Management API calls — same apiFetch pattern as calendarApi.ts.
 */

import { authJsonFetch } from "@/lib/validation/authJsonFetch";

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return authJsonFetch<T>(path, options, "Leave request");
}

export type LeaveType = "Casual" | "Sick" | "Other";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type DayType = "full" | "half";

type UserSnap = {
  _id: string;
  username: string;
  email?: string;
  avatarColor?: string;
  designation?: string;
};

export type LeaveRequestAPI = {
  _id: string;
  employee: UserSnap;
  organization: string;
  leaveType: LeaveType;
  reason: string;
  startDate: string;
  endDate: string;
  dayType: DayType;
  status: LeaveStatus;
  approvedBy: UserSnap | null;
  approvalDate: string | null;
  remarks: string;
  createdAt: string;
};

export type ApplyLeavePayload = {
  leaveType: LeaveType;
  reason: string;
  startDate: string;
  endDate: string;
  dayType?: DayType;
};

export type OnLeaveEntry = {
  userId: string;
  username?: string;
  avatarColor?: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
};

export async function applyLeave(orgId: string, payload: ApplyLeavePayload) {
  const r = await apiFetch<{ success: boolean; data: LeaveRequestAPI }>(
    `/organisations/${orgId}/leaves`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  return r.data;
}

export async function fetchMyLeaves(orgId: string) {
  const r = await apiFetch<{ success: boolean; data: LeaveRequestAPI[] }>(
    `/organisations/${orgId}/leaves/mine`
  );
  return r.data;
}

export async function fetchPendingApprovals(orgId: string, status: LeaveStatus | "all" = "pending") {
  const r = await apiFetch<{ success: boolean; data: LeaveRequestAPI[] }>(
    `/organisations/${orgId}/leaves/pending?status=${status}`
  );
  return r.data;
}

export async function decideLeave(
  orgId: string,
  leaveId: string,
  payload: { status: "approved" | "rejected"; remarks?: string }
) {
  const r = await apiFetch<{ success: boolean; data: LeaveRequestAPI }>(
    `/organisations/${orgId}/leaves/${leaveId}/decide`,
    { method: "PUT", body: JSON.stringify(payload) }
  );
  return r.data;
}

export async function fetchUsersOnLeave(orgId: string, date: string) {
  const r = await apiFetch<{ success: boolean; data: OnLeaveEntry[] }>(
    `/organisations/${orgId}/leaves/on-leave?date=${date}`
  );
  return r.data;
}

/** Leaves overlapping any day between `from` and `to` (inclusive) — used by
 * the dashboard's "On Leave" widget to get today + upcoming in one call. */
export async function fetchUsersOnLeaveRange(orgId: string, from: string, to: string) {
  const r = await apiFetch<{ success: boolean; data: OnLeaveEntry[] }>(
    `/organisations/${orgId}/leaves/on-leave?from=${from}&to=${to}`
  );
  return r.data;
}

