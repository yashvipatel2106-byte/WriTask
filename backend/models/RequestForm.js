const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const conditionSchema = new mongoose.Schema(
  {
    questionId: {
      type: String,
      required: true,
    },
    operator: {
      type: String,
      enum: ["equals", "not_equals", "contains", "not_contains"],
      default: "equals",
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      default: "",
    },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },

    label: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: [
        // Text
        "text",
        "textarea",
        "email",
        "phone",

        // Selection
        "single_select",
        "multiple_select",
        "radio",
        "checkbox",

        // Date/time
        "date",
        "datetime",

        // Numeric
        "number",
        "percentage",

        // WriTask-related
        "wri_project",
        "wri_assignee",
        "wri_priority",
        "wri_status",
        "wri_due_date",
        "wri_start_date",
        "wri_custom_field",

        // Files
        "attachment",

        // Structure (not answerable — no value is stored for these)
        "section_header",
      ],
      required: true,
    },

    // Which page this field belongs to (see requestFormSchema.pages
    // below). Null/absent means the form has no explicit pages yet —
    // treated as a single implicit page for backward compatibility
    // with forms created before multi-page support.
    pageId: {
      type: String,
      default: null,
    },

    // For "wri_custom_field" — references an existing WriTask
    // project custom field definition rather than duplicating one.
    customFieldId: {
      type: String,
      default: null,
    },

    required: {
      type: Boolean,
      default: false,
    },

    // Only meaningful for "textarea" — lets the requester attach an
    // image alongside their written answer.
    allowImageAttachment: {
      type: Boolean,
      default: false,
    },

    placeholder: {
      type: String,
      default: "",
    },

    options: {
      type: [optionSchema],
      default: [],
    },

    conditions: {
      type: [conditionSchema],
      default: [],
    },

    mapping: {
      type: String,
      enum: [
        "none",
        "title",
        "description",
        "priority",
        "assignee",
        "dueDate",
        "project",
      ],
      default: "none",
    },

    order: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const requestFormSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    // Which of the organization's workspaces (Internal/External/custom)
    // this form belongs to. Null on legacy forms created before this
    // field existed — backfilled to the org's "Internal" workspace the
    // next time the form list is loaded (see backfillLegacyRequestFormWorkspaces).
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: ["draft", "published", "disabled", "archived"],
      default: "draft",
      index: true,
    },

    questions: {
      type: [questionSchema],
      default: [],
    },

    // Optional page grouping for multi-page forms. Fields reference
    // a page via question.pageId. An empty array means the form has
    // no explicit pages (rendered as a single page).
    pages: {
      type: [
        {
          id: { type: String, required: true },
          title: { type: String, trim: true, default: "" },
          order: { type: Number, default: 0 },
        },
      ],
      default: [],
    },

    // Whether an approved-by-default workflow applies: when true
    // (the existing/default behavior), every submission starts as
    // "pending" and a reviewer must approve it before a Task is
    // created. When false, a Task is created immediately on submit.
    approvalRequired: {
      type: Boolean,
      default: true,
    },

    // Fixed destination project for tasks created from this form's
    // approved requests. When set, the requester does not choose a
    // project at submission time. When absent (default), behavior
    // is unchanged from before this field existed: the requester
    // picks from their accessible projects.
    saveTo: {
      project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project",
        default: null,
      },
    },

    // Default assignee(s) applied to the task created from an
    // approved request, when no field in the submission is mapped
    // to "assignee".
    //
    // - "me": the form's creator (createdBy).
    // - "specific": the listed users (see `users`).
    // - "everyone": every member of the destination project.
    assignTo: {
      mode: {
        type: String,
        enum: ["me", "specific", "everyone"],
        default: "me",
      },
      users: {
        type: [
          { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        ],
        default: [],
      },
    },

    // Who can see/submit this form.
    sharing: {
      visibility: {
        type: String,
        enum: ["organization", "specific_projects"],
        default: "organization",
      },
      projects: {
        type: [
          { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
        ],
        default: [],
      },
      // Public, unauthenticated submission is not implemented yet
      // (would require a new anonymous-submission flow); this flag
      // is stored for forward compatibility but is not yet acted on.
      publicEnabled: {
        type: Boolean,
        default: false,
      },
      publicToken: {
        type: String,
        default: null,
      },
    },

    // Form design (logo/background/branding) shown on the
    // requester-facing submission page.
    design: {
      logoUrl: { type: String, default: "" },
      logoAltText: { type: String, default: "" },
      logoSize: {
        type: String,
        enum: ["s", "m", "l"],
        default: "s",
      },
      logoAlign: {
        type: String,
        enum: ["left", "center", "right"],
        default: "left",
      },
      backgroundColor: { type: String, default: "" },
      hideBranding: { type: Boolean, default: false },
    },

    // Customizable thank-you email sent to the requester on
    // submission (subject/body copy only — delivery reuses the
    // existing notification/email infrastructure).
    emailConfig: {
      senderName: { type: String, default: "" },
      greeting: { type: String, default: "Hello," },
      message: {
        type: String,
        default:
          "We received your request and it is currently being processed.",
      },
      closing: { type: String, default: "Thank you," },
      useAccountLogo: { type: Boolean, default: true },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

requestFormSchema.index({
  organization: 1,
  status: 1,
});

module.exports = mongoose.model("RequestForm", requestFormSchema);