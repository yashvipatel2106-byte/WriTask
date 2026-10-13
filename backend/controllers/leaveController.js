const LeaveRequest = require("../models/LeaveRequest");
const Organization = require("../models/Organization");
const CalendarEvent = require("../models/Calendarevent");
const User = require("../models/user");
const { findOrgMember } = require("../utils/roleDefinitions");
const { notifyRecipients } = require("../utils/notificationService");

const LEAVE_APPROVER_ROLES = new Set(["owner", "manager"]);
const POPULATE_USER_FIELDS = "username email avatarColor designation";

async function assertOrgMember(orgId, userId) {
  const org = await Organization.findById(orgId);
  if (!org) throw Object.assign(new Error("Organisation not found"), { status: 404 });
  if (!org.isMember(userId)) {
    throw Object.assign(new Error("Not a member of this organisation"), { status: 403 });
  }
  return org;
}

function isOrgOwner(org, userId) {
  return Boolean(org.owner && org.owner.toString() === userId.toString());
}

/** owner or "manager" role — the only valid leave approvers. Checks
 * org.owner directly (not just org.members) since legacy/edge-case orgs
 * can have an owner that was never duplicated into the members array —
 * same defensive pattern as Organization.isMember(). */
function isApproverEligible(org, userId) {
  if (isOrgOwner(org, userId)) return true;
  const member = findOrgMember(org, userId);
  return Boolean(member && LEAVE_APPROVER_ROLES.has(member.role));
}

/** Every current owner/manager in the org — the leave-request audience, for
 * both notifications and decide-permission. Generalised (no single chosen
 * approver) so that promoting someone to manager automatically puts them in
 * the loop for future requests, and demoting them removes them, without any
 * extra wiring. */
function getEligibleApproverIds(org) {
  const ids = new Set();
  if (org.owner) ids.add(org.owner.toString());
  for (const member of org.members || []) {
    if (LEAVE_APPROVER_ROLES.has(member.role)) {
      ids.add((member.user?._id || member.user).toString());
    }
  }
  return Array.from(ids);
}

function toDateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/** Inclusive list of "YYYY-MM-DD" keys between startDate and endDate. */
function dateKeysInRange(startDate, endDate) {
  const keys = [];
  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  for (; cur <= end; cur.setDate(cur.getDate() + 1)) {
    keys.push(toDateKey(cur));
  }
  return keys;
}

// ── POST /api/organisations/:orgId/leaves ─────────────────────────────────────
async function applyLeave(req, res) {
  try {
    const { orgId } = req.params;
    const userId = req.user._id;
    const org = await assertOrgMember(orgId, userId);

    const { leaveType, reason, startDate, endDate, dayType } = req.body;

    if (!leaveType || !reason || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Leave type, reason, start date and end date are required.",
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ success: false, message: "Start date must be before end date." });
    }

    const leave = await LeaveRequest.create({
      employee: userId,
      organization: orgId,
      leaveType,
      reason,
      startDate,
      endDate,
      dayType: dayType === "half" ? "half" : "full",
      status: "pending",
    });

    // Notify every current owner/manager — any of them can act on it, and
    // this way a newly-promoted manager starts receiving leave-request
    // notifications immediately, while a demoted one stops.
    await notifyRecipients({
      userIds: getEligibleApproverIds(org),
      actorId: userId,
      type: "leave_requested",
      title: "New leave request",
      message: `${req.user.username} requested ${leaveType} leave from ${toDateKey(startDate)} to ${toDateKey(endDate)}.`,
      priority: "Medium",
      link: "/settings/leave",
    });

    const populated = await leave.populate({ path: "employee", select: POPULATE_USER_FIELDS });

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

// ── GET /api/organisations/:orgId/leaves/mine ─────────────────────────────────
async function getMyLeaves(req, res) {
  try {
    const { orgId } = req.params;
    const userId = req.user._id;
    await assertOrgMember(orgId, userId);

    const leaves = await LeaveRequest.find({ organization: orgId, employee: userId })
      .sort({ createdAt: -1 })
      .populate("employee", POPULATE_USER_FIELDS)
      .populate("approvedBy", POPULATE_USER_FIELDS);

    res.json({ success: true, data: leaves });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

// ── GET /api/organisations/:orgId/leaves/pending ──────────────────────────────
/** Leave requests routed to the current user for a decision. */
async function getPendingApprovals(req, res) {
  try {
    const { orgId } = req.params;
    const userId = req.user._id;
    const org = await assertOrgMember(orgId, userId);

    // Any owner/manager can view every request, not just ones routed to
    // them specifically — matches the org-wide "View Leave Requests"
    // permission managers have (spec section 9).
    if (!isApproverEligible(org, userId)) {
      return res.json({ success: true, data: [] });
    }

    const status = ["pending", "approved", "rejected"].includes(req.query.status)
      ? req.query.status
      : req.query.status === "all"
        ? null
        : "pending";

    const leaves = await LeaveRequest.find({
      organization: orgId,
      ...(status ? { status } : {}),
    })
      .sort({ createdAt: -1 })
      .populate("employee", POPULATE_USER_FIELDS)
      .populate("approvedBy", POPULATE_USER_FIELDS);

    res.json({ success: true, data: leaves });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

// ── PUT /api/organisations/:orgId/leaves/:leaveId/decide ─────────────────────
async function decideLeave(req, res) {
  try {
    const { orgId, leaveId } = req.params;
    const userId = req.user._id;
    const org = await assertOrgMember(orgId, userId);

    const { status, remarks } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'approved' or 'rejected'." });
    }

    const leave = await LeaveRequest.findOne({ _id: leaveId, organization: orgId });
    if (!leave) return res.status(404).json({ success: false, message: "Leave request not found" });

    if (!isApproverEligible(org, userId)) {
      return res.status(403).json({
        success: false,
        message: "Only the organisation owner or a manager can decide this request.",
      });
    }

    if (leave.status !== "pending") {
      return res.status(400).json({ success: false, message: "This request has already been decided." });
    }

    leave.status = status;
    leave.approvedBy = userId;
    leave.approvalDate = new Date();
    leave.remarks = remarks || "";
    await leave.save();

    if (status === "approved") {
      const employeeUser = await User.findById(leave.employee).select("username");
      const employeeName = employeeUser?.username || "Employee";
      const dateKeys = dateKeysInRange(leave.startDate, leave.endDate);
      await CalendarEvent.insertMany(
        dateKeys.map((dateKey) => ({
          title: `${employeeName} — On Leave (${leave.leaveType})`,
          description: leave.reason,
          date: dateKey,
          time: "09:00",
          type: "leave",
          priority: "low",
          assignees: [leave.employee],
          space: "Internal",
          leaveRef: leave._id,
          organization: orgId,
          createdBy: userId,
        }))
      );
    }

    await notifyRecipients({
      userIds: [leave.employee],
      actorId: userId,
      type: status === "approved" ? "leave_approved" : "leave_rejected",
      title: status === "approved" ? "Leave approved" : "Leave rejected",
      message:
        status === "approved"
          ? `Your ${leave.leaveType} leave from ${toDateKey(leave.startDate)} to ${toDateKey(leave.endDate)} was approved.`
          : `Your ${leave.leaveType} leave from ${toDateKey(leave.startDate)} to ${toDateKey(leave.endDate)} was rejected.`,
      priority: "Medium",
      link: "/settings/leave",
    });

    const populated = await leave.populate([
      { path: "employee", select: POPULATE_USER_FIELDS },
      { path: "approvedBy", select: POPULATE_USER_FIELDS },
    ]);

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

// ── GET /api/organisations/:orgId/leaves/on-leave ─────────────────────────────
// ?date=YYYY-MM-DD              → leaves covering that single day (default: today)
// ?from=YYYY-MM-DD&to=YYYY-MM-DD → leaves overlapping any day in the range
// (used by the dashboard's "On Leave" widget for today + upcoming in one call)
async function getUsersOnLeave(req, res) {
  try {
    const { orgId } = req.params;
    const userId = req.user._id;
    await assertOrgMember(orgId, userId);

    let rangeFilter;
    if (req.query.from || req.query.to) {
      const from = req.query.from ? new Date(req.query.from) : new Date();
      const to = req.query.to ? new Date(req.query.to) : from;
      from.setHours(0, 0, 0, 0);
      to.setHours(0, 0, 0, 0);
      rangeFilter = { startDate: { $lte: to }, endDate: { $gte: from } };
    } else {
      const date = req.query.date ? new Date(req.query.date) : new Date();
      date.setHours(0, 0, 0, 0);
      rangeFilter = { startDate: { $lte: date }, endDate: { $gte: date } };
    }

    const leaves = await LeaveRequest.find({
      organization: orgId,
      status: "approved",
      ...rangeFilter,
    })
      .select("employee leaveType startDate endDate")
      .populate("employee", "username avatarColor");

    res.json({
      success: true,
      data: leaves.map((l) => ({
        userId: l.employee._id.toString(),
        username: l.employee.username,
        avatarColor: l.employee.avatarColor,
        leaveType: l.leaveType,
        startDate: l.startDate,
        endDate: l.endDate,
      })),
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

module.exports = {
  applyLeave,
  getMyLeaves,
  getPendingApprovals,
  decideLeave,
  getUsersOnLeave,
};
