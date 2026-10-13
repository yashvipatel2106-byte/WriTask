const mongoose = require("mongoose");

/**
 * CalendarEvent
 * Linked to your existing Task, User, and Organization models.
 * A CalendarEvent is either:
 *   - linked to an existing Task          (taskRef is set, type = "task")
 *   - linked to an approved LeaveRequest  (leaveRef is set, type = "leave" — one row
 *     per day of the leave range, created only when a leave is approved)
 *   - a standalone event                  (type = "meeting" | "reminder")
 */
const calendarEventSchema = new mongoose.Schema(
  {
    // ── core fields ──────────────────────────────────────────────────────────
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    date: {
      type: String,   // stored as "YYYY-MM-DD" for easy calendar keying
      required: true,
    },
    time: {
      type: String,   // "HH:mm"  24-hour
      default: "09:00",
    },
    type: {
      type: String,
      enum: ["task", "meeting", "reminder", "leave"],
      default: "task",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    // ── relations ────────────────────────────────────────────────────────────
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /**
     * assignees — multiple org members can be assigned to one calendar event.
     * Mirrors the Task.assignee pattern but supports many-to-many for meetings etc.
     */
    assignees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    /**
     * taskRef — when a Task's dueDate is set, we auto-create / sync a CalendarEvent
     * that references the source task. Null for standalone events.
     */
    taskRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    /**
     * leaveRef — set on the auto-generated rows created when a LeaveRequest
     * is approved (see leaveController.decideLeave). Null for every other
     * event type.
     */
    leaveRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveRequest",
      default: null,
    },

    projectName: {
  type: String,
  default: "",
},

    space: {
      type: String,
      default: "Internal",
    },
    /**
     * reminderNotified — set once the scheduled reminder notification (creator
     * + assignees, fired at `date`/`time` by the reminderNotifier cron job)
     * has gone out, so the cron's per-minute sweep doesn't re-notify on every
     * tick. Only meaningful for type="reminder"; reset to false if the
     * reminder's date/time is edited after it already fired.
     */
    reminderNotified: {
      type: Boolean,
      default: false,
    },
    meeting: {
    enabled: {
        type: Boolean,
        default: false,
    },

    roomId: {
        type: String,
        default: null,
    },

    meetingLink: {
        type: String,
        default: null,
    },

    status: {
        type: String,
        enum: ["scheduled", "live", "ended"],
        default: "scheduled",
    },

    startedAt: Date,

    endedAt: Date,
},
  },
  { timestamps: true }
);

// Indexes for fast org + date range + visibility queries
calendarEventSchema.index({ organization: 1, date: 1 });
calendarEventSchema.index({ organization: 1, date: 1, createdBy: 1 });
calendarEventSchema.index({ organization: 1, date: 1, assignees: 1 });
calendarEventSchema.index({ organization: 1, assignees: 1 });
calendarEventSchema.index({ type: 1, reminderNotified: 1, date: 1 });
calendarEventSchema.index({ taskRef: 1, type: 1 }, { sparse: true });
calendarEventSchema.index({ leaveRef: 1 }, { sparse: true });
calendarEventSchema.index({ "meeting.roomId": 1 }, { sparse: true });
calendarEventSchema.index({ title: 1 });
calendarEventSchema.index({
  title: "text",
  description: "text",
});

module.exports =
  mongoose.models.CalendarEvent ||
  mongoose.model("CalendarEvent", calendarEventSchema);