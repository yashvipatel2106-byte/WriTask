const mongoose = require("mongoose");

/**
 * Workspace folder that can hold multiple root projects.
 * Existing projects without a folder stay at the workspace root.
 */
const folderSchema = new mongoose.Schema(
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
    // Nested inside another folder (workspace tree).
    parentFolder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
      index: true,
    },
    // Nested inside a project (alongside subprojects).
    parentProject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

folderSchema.index({ workspace: 1, name: 1 });

module.exports =
  mongoose.models.Folder || mongoose.model("Folder", folderSchema);
