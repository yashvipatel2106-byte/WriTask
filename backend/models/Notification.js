const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  type: {
    type: String,
    enum: [
      "assignment",
      "mention",
      "comment",
      "status",
      "due_date",
      "invite",
      "system",
      "reply",
      "leave_requested",
      "leave_approved",
      "leave_rejected",
      "reminder",
    ],
    default: "system",
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Task",
    default: null,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    default: null,
  },
  priority: {
    type: String,
    enum: ["Low", "Medium", "High"],
    default: "Medium",
  },
  link: {
    type: String,
    default: "",
  },
  read: {
    type: Boolean,
    default: false,
  },
  archived: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

notificationSchema.index({ user: 1, archived: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
