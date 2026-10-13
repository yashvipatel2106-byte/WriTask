const mongoose = require("mongoose");

const sentToSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    email: { type: String, required: true },
    role: { type: String, enum: ["manager", "orgOwner"], required: true },
  },
  { _id: false }
);

const weeklyReportArchiveSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    employeeName: { type: String, default: "" },
    weekStart: { type: Date, required: true },
    weekEnd: { type: Date, required: true },
    generatedAt: { type: Date, default: Date.now },
    filePath: { type: String, required: true },
    sentTo: { type: [sentToSchema], default: [] },
    summarySnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    trigger: {
      type: String,
      enum: ["cron", "manual", "live-download"],
      default: "live-download",
    },
  },
  { timestamps: true }
);

weeklyReportArchiveSchema.index({ employee: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model("WeeklyReportArchive", weeklyReportArchiveSchema);
