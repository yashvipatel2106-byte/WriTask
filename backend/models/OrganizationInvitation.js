const mongoose = require("mongoose");

const organizationInvitationSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["admin", "manager", "developer", "viewer","manager"],
      default: "developer",
    },
    department: {
      type: String,
      default: "",
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "revoked", "expired"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "OrganizationInvitation",
  organizationInvitationSchema
);
