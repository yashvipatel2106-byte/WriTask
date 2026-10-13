const mongoose = require("mongoose");

const weeklyReportDeliverySchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    weekKey: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["success", "partial", "failed", "skipped"],
      default: "success",
    },
    recipientEmails: {
      type: [String],
      default: [],
    },
    memberCount: {
      type: Number,
      default: 0,
    },
    pdfCount: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: null,
    },
    triggeredBy: {
      type: String,
      enum: ["cron", "manual"],
      default: "cron",
    },
  },
  { timestamps: true }
);

weeklyReportDeliverySchema.index(
  { organization: 1, weekKey: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.WeeklyReportDelivery ||
  mongoose.model("WeeklyReportDelivery", weeklyReportDeliverySchema);
