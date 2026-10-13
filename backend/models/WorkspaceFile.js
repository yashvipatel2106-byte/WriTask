const mongoose = require("mongoose");

/**
 * Workspace file container that can hold projects (not a task attachment).
 */
const workspaceFileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

workspaceFileSchema.index({ workspace: 1, name: 1 });

module.exports =
  mongoose.models.WorkspaceFile ||
  mongoose.model("WorkspaceFile", workspaceFileSchema);
