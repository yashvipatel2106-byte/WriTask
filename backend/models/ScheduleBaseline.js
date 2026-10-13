const mongoose = require("mongoose");

const baselineItemSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    startDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    durationDays: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const scheduleBaselineSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [baselineItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

scheduleBaselineSchema.index({ project: 1, createdAt: -1 });
scheduleBaselineSchema.index({ organization: 1, project: 1, createdAt: -1 });

module.exports = mongoose.model("ScheduleBaseline", scheduleBaselineSchema);