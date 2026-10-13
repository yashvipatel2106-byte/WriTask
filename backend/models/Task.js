const mongoose = require("mongoose");

// Shared by `subtasks` (active) and `deletedSubtasks` (trash) below — a
// subtask moves between the two arrays wholesale on delete/restore rather
// than being filtered in place, so every existing `task.subtasks` reader
// keeps seeing only active subtasks with zero changes required elsewhere.
const subtaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  assignees: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  completed: { type: Boolean, default: false },
  status: { type: String, default: "todo" },
  priority: {
    type: String,
    enum: ["low", "medium", "high"],
    default: "medium",
  },
  startDate: { type: Date, default: null },
  dueDate: { type: Date, default: null },
  effortHours: { type: Number, default: null },
  durationHours: { type: Number, default: null },
  workingDays: { type: [Number], default: null },
  workingDayCount: { type: Number, default: 0 },
  order: { type: Number, default: 0 },
  // Self-reference within the same array — lets a subtask have its own
  // subtasks (capped at 3 levels deep, enforced in taskController.addSubtask).
  parentSubtaskId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
  // Only meaningful for entries living in `deletedSubtasks`.
  deletedAt: { type: Date, default: null },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  // True when this subtask was auto-trashed as a side effect of its parent
  // Task being deleted (rather than deleted directly) — lets restoring the
  // Task bring back exactly the subtasks it took down with it, without
  // reviving ones a user had already trashed on their own beforehand.
  deletedWithTask: { type: Boolean, default: false },
  // Same idea one level down: set to the _id of the ancestor subtask whose
  // own deletion cascaded this one into trash (null if this subtask was
  // deleted directly). Lets restoring that ancestor subtask bring back
  // exactly the descendants it took down with it, leaving anything
  // deleted independently beforehand still in trash.
  deletedWithSubtaskId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
});

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    status: {
      type: String,
      default: "todo",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    dueDate: {
      type: Date,
      default: null,
    },
    startDate: {
      type: Date,
      default: null,
    },
    durationHours: {
      type: Number,
      default: null,
    },
    effortHours: {
      type: Number,
      default: null,
    },
    workingDays: {
  type: [Number],
  default: [1, 2, 3, 4, 5],
},

workingDayCount: {
  type: Number,
  default: 0,
},
    tags: {
      type: [String],
      default: [],
    },
    attachments: [
      {
        filename: { type: String, required: true },
        originalName: { type: String, required: true },
        mimeType: { type: String, default: "" },
        size: { type: Number, default: 0 },
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        uploadedAt: { type: Date, default: Date.now },
        inDescription: { type: Boolean, default: false },
      },
    ],
    comments: [
      {
        body: { type: String, default: "" },
        // null/unset = a comment on the task itself. Set = scoped to that
        // one subtask (at any nesting level) — kept out of the parent
        // task's own activity feed and vice versa.
        subtaskId: {
          type: mongoose.Schema.Types.ObjectId,
          default: null,
        },
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        mentions: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
        ],
        attachments: [
          {
            attachmentId: {
              type: mongoose.Schema.Types.ObjectId,
            },
            originalName: { type: String, default: "" },
            size: { type: Number, default: 0 },
          },
        ],
        createdAt: { type: Date, default: Date.now },
        editedAt: { type: Date, default: null },
      },
    ],
    activityLog: {
      type: [
      {
        kind: {
          type: String,
          enum: ["created", "change", "attachment", "deleted"],
          default: "change",
        },
        action: { type: String, required: true },
        message: { type: String, required: true },
        field: { type: String, default: null },
        oldValue: { type: String, default: null },
        newValue: { type: String, default: null },
        meta: { type: mongoose.Schema.Types.Mixed, default: null },
        actor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],
      default: [],
    },
    order: {
      type: Number,
      default: 0,
    },
    // Set when this Task was created from (or later linked to) a Team
    // Calendar "task"-type event — mirrors CalendarEvent.taskRef so either
    // side can be updated/deleted and propagate to the other.
    calendarEventRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CalendarEvent",
      default: null,
      index: true,
    },
    subtasks: {
      type: [subtaskSchema],
      default: [],
    },
    // Deleted subtasks (individually, or cascaded when this Task itself was
    // deleted) live here instead of `subtasks` so the Trash bin can list
    // and restore them, and every existing `subtasks` reader never has to
    // filter out soft-deleted entries.
    deletedSubtasks: {
      type: [subtaskSchema],
      default: [],
    },
    isActive: {
  type: Boolean,
  default: true,
},
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

taskSchema.index({ project: 1, status: 1, order: 1 });
taskSchema.index({ project: 1, isDeleted: 1, isActive: 1, status: 1 });
taskSchema.index({ organization: 1, assignee: 1, isDeleted: 1 });
taskSchema.index({ project: 1, dueDate: 1, status: 1, isDeleted: 1 });
taskSchema.index({
    title: "text",
    description: "text",
});

taskSchema.pre("save", function syncPrimaryAssignee() {
  if (Array.isArray(this.assignees) && this.assignees.length > 0) {
    this.assignee = this.assignees[0];
  } else if (!this.assignee) {
    this.assignees = [];
  } else if (!this.assignees?.length) {
    this.assignees = [this.assignee];
  }
  if (Array.isArray(this.subtasks)) {
    for (const subtask of this.subtasks) {
      if (Array.isArray(subtask.assignees) && subtask.assignees.length > 0) {
        subtask.assignee = subtask.assignees[0];
      } else if (subtask.assignee && !subtask.assignees?.length) {
        subtask.assignees = [subtask.assignee];
      } else       if (!subtask.assignee) {
        subtask.assignees = [];
      }
      if (!subtask.status) {
        subtask.status = subtask.completed ? "completed" : "todo";
      } else if (subtask.status === "completed") {
        subtask.completed = true;
      }
    }
  }
});

module.exports = mongoose.model("Task", taskSchema);
