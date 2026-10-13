const mongoose = require("mongoose");

const requestFormSubmissionSchema = new mongoose.Schema(
  {
    // The request form that was submitted
    form: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RequestForm",
      required: true,
      index: true,
    },

    // Organization in which the request was submitted
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    // Inherited from the form's own workspace at submission time —
    // keeps the Request Inbox isolated per workspace without needing
    // to join through the form on every query.
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },

    // Project the request is associated with. Null when the form's
    // "Save To" is set to "None" — the request is then approved
    // without ever creating a task.
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },

    // User who submitted the request
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Snapshot of the form's name/questions at the moment this
    // submission was made, so a later edit to the form (label
    // changes, removed/reordered questions, etc.) can never change
    // how an existing submission is displayed.
    formSnapshot: {
      name: { type: String, default: "" },
      questions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },

    // Answers given in the request form
    answers: [
      {
        questionId: {
          type: String,
          required: true,
        },

        value: {
          type: mongoose.Schema.Types.Mixed,
          default: null,
        },
      },
    ],

    // Values extracted from form answers and used to create the Task
    mapped: {
      title: {
        type: String,
        trim: true,
        default: "",
      },

      description: {
        type: String,
        trim: true,
        default: "",
      },

      priority: {
  type: String,

  enum: [
    "low",
    "medium",
    "high",
  ],

  default: "medium",
},

      assignees: {
        type: [
          { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        ],
        default: [],
      },

      dueDate: {
        type: Date,
        default: null,
      },
    },

    // Current request status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    // User who approved/rejected the request
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Date/time when request was reviewed
    reviewedAt: {
      type: Date,
      default: null,
    },

    // Required when the request is rejected
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },

    // The requester's own choice, made at submit time — whether the
    // thank-you email includes their submitted answers. Controlled
    // per-submission by the requester, not configurable by the form
    // creator.
    includeResponsesInEmail: {
      type: Boolean,
      default: false,
    },

    // Task created after approval
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * Useful indexes
 */

// Requests made by a particular user
requestFormSubmissionSchema.index({
  submittedBy: 1,
  status: 1,
  createdAt: -1,
});

// Organization requests
requestFormSubmissionSchema.index({
  organization: 1,
  status: 1,
  createdAt: -1,
});

// Project requests
requestFormSubmissionSchema.index({
  project: 1,
  status: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  "RequestFormSubmission",
  requestFormSubmissionSchema
);