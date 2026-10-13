const mongoose = require("mongoose");

const MILESTONE_STATUSES = ["pending", "in-progress", "completed"];

const milestoneSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: "",
      maxlength: 2000,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: MILESTONE_STATUSES,
      default: "pending",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

milestoneSchema.index({ project: 1, dueDate: 1 });
milestoneSchema.index({ project: 1, status: 1 });
milestoneSchema.index({ organization: 1, dueDate: 1 });

module.exports = mongoose.model("Milestone", milestoneSchema);
module.exports.MILESTONE_STATUSES = MILESTONE_STATUSES;
