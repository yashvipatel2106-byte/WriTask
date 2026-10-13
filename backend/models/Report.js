const mongoose = require("mongoose");

const dataSourceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["workspace", "folder", "project"],
      required: true,
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    title: {
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
    type: {
      type: String,
      enum: ["custom"],
      default: "custom",
    },
    basedOn: {
      type: String,
      enum: ["projects", "tasks", "time_entries"],
      default: "tasks",
    },
    layout: {
      type: String,
      enum: ["table", "column"],
      default: "table",
    },
    dataSources: {
      type: [dataSourceSchema],
      default: [],
    },
    excludedProjects: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Project",
      default: [],
    },
    filters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    columns: {
      type: [String],
      default: ["title", "assignee", "author", "startDate", "dueDate", "status"],
    },
    sharing: {
      type: String,
      enum: ["private", "workspace", "organization", "custom"],
      default: "private",
    },
    sharedWith: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

reportSchema.index({ workspace: 1, createdAt: -1 });

module.exports =
  mongoose.models.Report || mongoose.model("Report", reportSchema);
