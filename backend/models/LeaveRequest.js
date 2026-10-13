const mongoose = require("mongoose");

/**
 * LeaveRequest
 * Applicant applies and the request is visible to every current org owner/
 * manager (no single chosen approver) — any of them may decide it, and
 * whoever does is recorded in approvedBy. Approving auto-creates
 * CalendarEvent rows (type:"leave", leaveRef) for each day of the range —
 * see leaveController.decideLeave.
 */
const leaveRequestSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    leaveType: {
      type: String,
      enum: ["Casual", "Sick", "Other"],
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    dayType: {
      type: String,
      enum: ["full", "half"],
      default: "full",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvalDate: {
      type: Date,
      default: null,
    },
    remarks: {
      type: String,
      default: "",
    },
  },
  { timestamps: true } // createdAt doubles as "Applied Date"
);

leaveRequestSchema.index({ organization: 1, employee: 1, status: 1 });
leaveRequestSchema.index({ organization: 1, status: 1, startDate: 1, endDate: 1 });

module.exports =
  mongoose.models.LeaveRequest || mongoose.model("LeaveRequest", leaveRequestSchema);
