// backend/models/Project.js
// WHAT CHANGED:
//  1. Added `owner` field (ObjectId → User) — tracks who created the project
//  2. Added `members` array — each entry has { user, role }
//  3. Added `status` field
//  4. Added getMemberRole() and isMember() helper methods

const mongoose = require("mongoose");

// Sub-schema for each member inside a project
const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // "member" is the default — owner can change it later
    role: {
      type: String,
      enum: ["owner", "admin", "member", "viewer","manager"],
      default: "member",
    },
  },
  { _id: false } // no extra _id per member entry
);

const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["active", "completed", "archived"],
      default: "active",
    },

    // ── schedule / billing (optional — legacy projects may have none) ────────
    startDate: {
      type: Date,
      default: null,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    billing: {
      type: String,
      enum: ["billable", "non_billable"],
      default: "billable",
    },

    // Plain number, never a formatted string — e.g. 50000, not "$50,000".
    budget: {
      type: Number,
      default: null,
      min: 0,
    },

    // Only USD is supported today; stored explicitly so a future
    // multi-currency feature doesn't have to guess at historical intent.
    budgetCurrency: {
      type: String,
      default: "USD",
    },

    // Optional — personal projects have no organization
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },

    // Optional workspace within org (or Personal). Null = legacy / unassigned.
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },

    // Optional folder in the workspace. Null = ungrouped (legacy projects).
    folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
      index: true,
    },

    // Optional file container in the workspace. Mutually exclusive with folder.
    workspaceFile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkspaceFile",
      default: null,
      index: true,
    },

    // Optional parent project (subproject). Mutually exclusive with folder/file.
    parentProject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },

    order: {
      type: Number,
      default: 0,
    },

    // The user who created the project — set automatically from req.user._id
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // All project members including the owner
    // Owner is always added here with role: "owner" on creation
    members: [memberSchema],

    customStatuses: {
      type: [
        {
          id: { type: String, required: true },
          label: { type: String, required: true },
        },
      ],
      default: [],
    },

    cardPreviewConfig: {
      type: {
        defaultFields: { type: mongoose.Schema.Types.Mixed, default: {} },
        defaultFieldOrder: { type: [String], default: undefined },
        customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
      default: null,
    },

    /** Custom field ids adopted by this project (values exist on tasks). */
    adoptedCustomFieldIds: {
      type: [String],
      default: [],
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
  {
    timestamps: true,
  }
);

// Resolve member user id whether populated or not
function resolveMemberUserId(member) {
  if (!member?.user) return null;
  const u = member.user;
  if (typeof u === "object" && u._id) return u._id.toString();
  return u.toString();
}

// Returns "owner" | "admin" | "member" | "viewer" | "manager" | null
projectSchema.methods.getMemberRole = function (userId) {
  const id = userId.toString();
  const ownerId = this.owner?._id || this.owner;
  if (ownerId && ownerId.toString() === id) {
    return "owner";
  }
  const member = this.members.find((m) => resolveMemberUserId(m) === id);
  return member ? member.role : null;
};

// Returns true if the userId is in the members array or is the project owner
projectSchema.methods.isMember = function (userId) {
  const id = userId.toString();
  const ownerId = this.owner?._id || this.owner;
  if (ownerId && ownerId.toString() === id) {
    return true;
  }
  return this.members.some((m) => resolveMemberUserId(m) === id);
};
// Index for text search on title and description
projectSchema.index({
    title: "text",
    description: "text",
});
module.exports = mongoose.model("Project", projectSchema);