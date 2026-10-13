const LeaveRequest = require("../models/LeaveRequest");

/** ISO/date-like → "start of day" Date, for inclusive range comparisons. */
function startOfDay(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Returns the subset of userIds that have an APPROVED leave covering `date`.
 * `date` may be a "YYYY-MM-DD" string or a Date.
 */
async function getApprovedLeaveUserIds(userIds, date) {
  const ids = (userIds || []).filter(Boolean).map(String);
  if (ids.length === 0 || !date) return [];

  const day = startOfDay(date);
  const leaves = await LeaveRequest.find({
    employee: { $in: ids },
    status: "approved",
    startDate: { $lte: day },
    endDate: { $gte: day },
  })
    .select("employee")
    .lean();

  return [...new Set(leaves.map((l) => l.employee.toString()))];
}

/**
 * Throws a 400 error (same shape as the rest of this codebase's ad-hoc
 * errors — `{status, message}`) if any of userIds is on approved leave
 * covering `date`. Used to hard-block task/meeting/reminder assignment.
 */
async function assertNoAssigneesOnLeave(userIds, date) {
  const onLeave = await getApprovedLeaveUserIds(userIds, date);
  if (onLeave.length > 0) {
    throw Object.assign(
      new Error("Assignee is on leave for the selected date."),
      { status: 400 }
    );
  }
}

module.exports = { getApprovedLeaveUserIds, assertNoAssigneesOnLeave };
