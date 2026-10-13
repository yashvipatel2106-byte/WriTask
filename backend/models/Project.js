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

    // Optional — personal projects have no organization
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
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
  const member = this.members.find((m) => resolveMemberUserId(m) === id);
  return member ? member.role : null;
};

// Returns true if the userId is in the members array at all
projectSchema.methods.isMember = function (userId) {
  const id = userId.toString();
  return this.members.some((m) => resolveMemberUserId(m) === id);
};
// Index for text search on title and description
projectSchema.index({
    title: "text",
    description: "text",
});
module.exports = mongoose.model("Project", projectSchema);