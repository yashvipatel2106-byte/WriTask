const mongoose = require("mongoose");

// sub Schema for organization members
const orgMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      default: "developer",
    },
    department: {
      type: String,
      default: "",
    },
    permissionOverrides: {
      useCustom: { type: Boolean, default: false },
      orgPermissions: { type: [String], default: [] },
      projectPermissions: { type: [String], default: [] },
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// 
const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [orgMemberSchema],
    roleDefinitions: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        isBuiltin: { type: Boolean, default: false },
        level: { type: Number, default: 1 },
        orgPermissions: { type: [String], default: [] },
        projectPermissions: { type: [String], default: [] },
      },
    ],

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

function resolveOrgMemberUserId(member) {
  if (!member?.user) return null;
  const u = member.user;
  if (typeof u === "object" && u._id) return u._id.toString();
  return u.toString();
}

organizationSchema.methods.getMemberRole = function (userId) {
  const id = userId.toString();
  const member = this.members.find((m) => resolveOrgMemberUserId(m) === id);
  return member ? member.role : null;
};

organizationSchema.methods.isMember = function (userId) {
  const id = userId.toString();
  if (this.owner && this.owner.toString() === id) return true;
  return this.members.some((m) => resolveOrgMemberUserId(m) === id);
};

module.exports = mongoose.model("Organization", organizationSchema);
