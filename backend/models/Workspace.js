const mongoose = require("mongoose");

/**
 * Workspace under an Organization, or account-level Personal workspace.
 * Projects and custom fields can optionally belong to a workspace.
 */
const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    /** personal | internal | external | custom */
    kind: {
      type: String,
      enum: ["personal", "internal", "external", "custom"],
      default: "custom",
      index: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    /** Set for account-level Personal workspace (organization == null) */
    accountUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

workspaceSchema.index(
  { accountUserId: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: {
      kind: "personal",
      accountUserId: { $type: "objectId" },
      isDeleted: false,
    },
  }
);

workspaceSchema.index(
  { organization: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: {
      kind: { $in: ["internal", "external"] },
      organization: { $type: "objectId" },
      isDeleted: false,
    },
  }
);

module.exports =
  mongoose.models.Workspace || mongoose.model("Workspace", workspaceSchema);
