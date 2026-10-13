const mongoose = require("mongoose");

const STOP_REASONS = [
  "manual",
  "effort_reached",
  "switched_task",
  "status_changed",
  "due_date_reached",
  "system",
  "task_deleted",
];

const ENTRY_STATUSES = ["running", "paused", "completed", "auto_stopped"];

const timeEntrySchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** First start of this session (for display / audit). */
    startedAt: {
      type: Date,
      required: true,
      index: true,
    },
    /**
     * Start of the current running segment. While paused this is null.
     * Elapsed = accumulatedMs + (runningSince ? now - runningSince : 0).
     */
    runningSince: {
      type: Date,
      default: null,
    },
    /** Milliseconds already counted from earlier running segments (after pauses). */
    accumulatedMs: {
      type: Number,
      default: 0,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    /** Final duration in ms for completed/auto-stopped entries. */
    durationMs: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ENTRY_STATUSES,
      default: "running",
      index: true,
    },
    stopReason: {
      type: String,
      enum: STOP_REASONS,
      default: null,
    },
    /** True while status is running or paused — used for one-active-session uniqueness. */
    activeSession: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

timeEntrySchema.index(
  { user: 1, activeSession: 1 },
  {
    unique: true,
    partialFilterExpression: { activeSession: true },
    name: "unique_active_timer_session_per_user",
  }
);

timeEntrySchema.index({ task: 1, startedAt: -1 });
timeEntrySchema.index({ project: 1, startedAt: -1 });
timeEntrySchema.index({ user: 1, status: 1 });

module.exports = mongoose.model("TimeEntry", timeEntrySchema);
module.exports.STOP_REASONS = STOP_REASONS;
module.exports.ENTRY_STATUSES = ENTRY_STATUSES;
