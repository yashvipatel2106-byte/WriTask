const mongoose = require("mongoose");
const { ALLOWED_CUSTOM_FIELD_TYPES } = require("../utils/kanbanCardPreview");

/**
 * Account-level Custom Field definition.
 * One record can apply to multiple Organizations (spaces) and/or Personal workspace.
 * Projects receive fields based on their organization (or personal owner).
 */
const customFieldSchema = new mongoose.Schema(
  {
    accountUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ALLOWED_CUSTOM_FIELD_TYPES,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    options: {
      type: [String],
      default: [],
    },
    // Number-type display / rollup options (ignored for other types)
    numberConfig: {
      defaultAggregation: {
        type: String,
        enum: ["none", "sum", "avg", "min", "max"],
        default: "none",
      },
      decimalPlaces: { type: Number, default: 0, min: 0, max: 6 },
      sample: { type: String, default: "5000" },
      useThousandsSeparator: { type: Boolean, default: false },
      showConditionalMarker: { type: Boolean, default: false },
    },
    // Who can see/edit values on tasks
    permissions: {
      type: String,
      enum: ["everyone", "admins"],
      default: "everyone",
    },
    // Where the field applies (UI scope; values are stored on tasks today)
    scope: {
      type: [String],
      default: ["tasks"],
    },
    /**
     * Location category (Wrike-style space scope):
     * - internal  → Personal Workspace
     * - external  → a selected Organization workspace
     * - specific  → any selected space (org or personal)
     */
    spaceType: {
      type: String,
      enum: ["internal", "external", "specific"],
      // No default — legacy rows derive location from organizationIds/includePersonal
      index: true,
    },
    // Organization id when spaceType is external/specific (null for personal/internal)
    spaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    // Preferred workspace association (Personal / Internal / External / custom)
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },
    // Organizations (spaces) where this field is available
    organizationIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Organization",
        },
      ],
      default: [],
    },
    // When true, available on personal-workspace projects (organization == null)
    includePersonal: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** When false, field is deactivated and hidden from new task UIs. */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

customFieldSchema.index({ organizationIds: 1 });
customFieldSchema.index({ accountUserId: 1, includePersonal: 1 });
customFieldSchema.index({ accountUserId: 1, spaceType: 1 });

module.exports =
  mongoose.models.CustomField ||
  mongoose.model("CustomField", customFieldSchema);
