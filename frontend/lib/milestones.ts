import { toDateKey } from "./taskDependencies.ts";

export type MilestoneStatus = "pending" | "in-progress" | "completed";

export type MilestoneItem = {
  _id: string;
  title: string;
  description?: string;
  project: string;
  organization?: string | null;
  dueDate: string;
  status: MilestoneStatus;
  createdBy?: string;
};

const STATUSES: MilestoneStatus[] = ["pending", "in-progress", "completed"];

export function isMilestoneStatus(value: string): value is MilestoneStatus {
  return (STATUSES as string[]).includes(value);
}

export function milestoneStatusLabel(status: string): string {
  if (status === "in-progress") return "In progress";
  if (status === "completed") return "Completed";
  return "Pending";
}

/** Incomplete milestones whose due date is before today. */
export function findOverdueMilestones(
  milestones: MilestoneItem[],
  today = new Date()
): MilestoneItem[] {
  const todayKey = toDateKey(today);
  if (!todayKey) return [];
  return milestones.filter((milestone) => {
    if (milestone.status === "completed") return false;
    const due = toDateKey(milestone.dueDate);
    return Boolean(due && due < todayKey);
  });
}
