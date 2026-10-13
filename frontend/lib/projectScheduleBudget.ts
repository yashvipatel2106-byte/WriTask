import type { ProjectScheduleBudgetValues } from "@/components/projects/ProjectScheduleBudgetFields";

/** Client-side mirror of backend/controllers/projectController.js's parseScheduleAndBudget. */
export function validateProjectScheduleBudget(
  values: ProjectScheduleBudgetValues
): string | null {
  if (
    values.startDate &&
    values.dueDate &&
    values.dueDate < values.startDate
  ) {
    return "Due date cannot be earlier than start date.";
  }

  if (values.budget.trim() !== "") {
    const parsed = Number(values.budget);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return "Budget must be a number that is 0 or greater.";
    }
  }

  return null;
}

const MONTH_ABBREV = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "DD Mon YYYY" (e.g. "01 Oct 2026") — fixed order, not locale-dependent. */
function formatProjectDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  return `${day} ${MONTH_ABBREV[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * "Project Duration" line for the project header — derived purely from
 * the stored startDate/dueDate, never a separate frontend-only value.
 */
export function formatProjectDuration(
  startDate?: string | null,
  dueDate?: string | null
): string | null {
  const start = startDate ? new Date(startDate) : null;
  const due = dueDate ? new Date(dueDate) : null;
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null;
  const validDue = due && !Number.isNaN(due.getTime()) ? due : null;

  if (validStart && validDue) {
    return `${formatProjectDate(validStart)} – ${formatProjectDate(validDue)}`;
  }
  if (validStart) {
    return `${formatProjectDate(validStart)} – Ongoing`;
  }
  if (validDue) {
    return `Until ${formatProjectDate(validDue)}`;
  }
  return null;
}

/** Builds the API payload fragment — only includes keys the form actually set. */
export function buildProjectScheduleBudgetPayload(
  values: ProjectScheduleBudgetValues
) {
  return {
    startDate: values.startDate || null,
    dueDate: values.dueDate || null,
    billing: values.billing,
    budget: values.budget.trim() === "" ? null : Number(values.budget),
  };
}
