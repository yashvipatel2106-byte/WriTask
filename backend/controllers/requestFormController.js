const mongoose = require("mongoose");

const RequestForm = require("../models/RequestForm");
const RequestFormSubmission = require("../models/RequestFormSubmission");
const Organization = require("../models/Organization");
const Project = require("../models/Project");

const { createTaskService } = require("../services/taskService");

const { createNotification } = require("../utils/notificationService");

const {
  sendRequestFormThankYouEmail,
  sendRequestFormReviewEmail,
} = require("../utils/emailService");

const {
  resolveAnswerImageFile,
} = require("../middleware/requestFormUploadMiddleware");

const {
  hasOrgPermissionForUser,
} = require("../utils/roleDefinitions");

const {
  getWorkspaceForUser,
  applyWorkspaceFilter,
  resolveDefaultWorkspaceId,
  backfillLegacyRequestFormWorkspaces,
} = require("../utils/workspaces");

/*
 * Reads the workspaceId the client is scoped to (query for GET/POST
 * with query params, body otherwise) and validates the requesting
 * user actually has access to it — mirrors how Projects are scoped
 * (see utils/projectAccess.js buildProjectListFilter). Returns
 * `{ workspaceId: null }` when no workspace was specified (callers
 * then fall back to organization-only scoping), or `{ error }` when
 * an explicit workspaceId was given but is invalid/inaccessible.
 *
 * Also backfills any legacy forms/submissions (created before the
 * workspace field existed) onto the org's "Internal" workspace,
 * every time — idempotent and cheap — so a direct link to a legacy
 * form/submission never 404s just because nobody has loaded the
 * Request Forms list for this org yet.
 */
async function resolveWorkspaceParam(req, organizationId) {
  if (organizationId) {
    await backfillLegacyRequestFormWorkspaces(
      req.user._id,
      organizationId
    );
  }

  const workspaceId =
    req.query.workspaceId || req.body.workspaceId || null;

  if (!workspaceId) {
    return { workspaceId: null };
  }

  const ws = await getWorkspaceForUser(req.user._id, workspaceId);

  if (!ws) {
    return {
      error: {
        status: 400,
        message: "Invalid or inaccessible workspace.",
      },
    };
  }

  return { workspaceId: ws._id };
}

/*
 * Short, human-readable reference derived deterministically from the
 * submission's own id — no separate counter/sequence needed.
 */
function buildRequestReference(submissionId) {
  return `REQ-${submissionId.toString().slice(-6).toUpperCase()}`;
}

/*
 * Build a readable label/value list of the submitted answers, for
 * the thank-you email. Select-type answers are resolved to their
 * option label; section headers carry no value.
 */
function buildResponseSummary(form, answers) {
  const answersByQuestion = new Map(
    (Array.isArray(answers) ? answers : []).map((a) => [
      a.questionId,
      a.value,
    ])
  );

  const summary = [];

  for (const question of form.questions || []) {
    if (question.type === "section_header") continue;

    const raw = answersByQuestion.get(question.id);
    if (raw === undefined || raw === null || raw === "") continue;

    let display = raw;

    if (Array.isArray(raw)) {
      display = raw
        .map(
          (v) =>
            question.options?.find((o) => o.value === String(v))?.label ||
            String(v)
        )
        .join(", ");
    } else if (Array.isArray(question.options) && question.options.length) {
      display =
        question.options.find((o) => o.value === String(raw))?.label ||
        String(raw);
    } else {
      display = String(raw);
    }

    summary.push({ label: question.label, value: display });
  }

  return summary;
}

/*
 * Email addresses collected from any "email"-type question the
 * requester filled in — these receive the same notification emails
 * as the requester's own account email (thank-you, approval,
 * rejection).
 */
function collectAnswerEmails(questions, answers) {
  const answersByQuestion = new Map(
    (Array.isArray(answers) ? answers : []).map((a) => [
      a.questionId,
      a.value,
    ])
  );

  const emails = [];

  for (const question of questions || []) {
    if (question.type !== "email") continue;

    const raw = answersByQuestion.get(question.id);
    if (typeof raw !== "string") continue;

    const trimmed = raw.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      emails.push(trimmed.toLowerCase());
    }
  }

  return emails;
}

/*
 * Splits recipients into the requester's own account email and any
 * address they entered into an "email"-type field on the form — the
 * latter get an extra note explaining why they received the email
 * (they were mentioned, not the submitter).
 */
function resolveEmailRecipients(requesterEmail, questions, answers) {
  const normalizedRequesterEmail = requesterEmail
    ? requesterEmail.trim().toLowerCase()
    : null;

  const mentionedEmails = Array.from(
    new Set(collectAnswerEmails(questions, answers))
  ).filter((email) => email !== normalizedRequesterEmail);

  return {
    requesterEmail: normalizedRequesterEmail,
    mentionedEmails,
  };
}

/*
 * Send the form's configured thank-you email to the requester, and
 * a copy — with a note explaining why they're receiving it — to any
 * "email"-type answer they provided. Best-effort — failures are
 * logged but never fail the request.
 *
 * Whether the submitted answers are included is the REQUESTER's own
 * choice made at submit time (submission.includeResponsesInEmail),
 * not something the form creator configures.
 */
async function sendThankYouEmail(form, submission, requester) {
  const { requesterEmail, mentionedEmails } = resolveEmailRecipients(
    requester?.email,
    submission.formSnapshot?.questions || form.questions,
    submission.answers
  );

  if (!requesterEmail && mentionedEmails.length === 0) return;

  const requesterName =
    requester?.username || requester?.email || "the requester";

  const basePayload = {
    formName: form.name,
    requestReference: buildRequestReference(submission._id),
    senderName: form.emailConfig?.senderName,
    greeting: form.emailConfig?.greeting,
    message: form.emailConfig?.message,
    closing: form.emailConfig?.closing,
    responses: submission.includeResponsesInEmail
      ? buildResponseSummary(form, submission.answers)
      : [],
  };

  try {
    if (requesterEmail) {
      await sendRequestFormThankYouEmail({
        to: requesterEmail,
        ...basePayload,
      });
    }

    if (mentionedEmails.length > 0) {
      await sendRequestFormThankYouEmail({
        to: mentionedEmails,
        ...basePayload,
        mentionedByName: requesterName,
      });
    }
  } catch (error) {
    console.error("Request form thank-you email error:", error);
  }
}

/*
 * Send the approved/rejected email to the requester, and a copy —
 * with a note explaining why they're receiving it — to any
 * "email"-type answer they provided. Best-effort — failures are
 * logged but never fail the request.
 */
async function sendReviewEmail(
  submission,
  requester,
  { formName, projectName, senderName } = {}
) {
  const { requesterEmail, mentionedEmails } = resolveEmailRecipients(
    requester?.email,
    submission.formSnapshot?.questions || submission.form?.questions,
    submission.answers
  );

  const requesterName =
    requester?.username || requester?.email || "the requester";

  if (!requesterEmail && mentionedEmails.length === 0) return;

  const basePayload = {
    formName:
      formName ||
      submission.form?.name ||
      submission.formSnapshot?.name ||
      "Request",
    requestReference: buildRequestReference(submission._id),
    submittedAt: submission.createdAt,
    projectName: projectName || null,
    status: submission.status,
    rejectionReason: submission.rejectionReason,
    senderName: senderName || submission.form?.emailConfig?.senderName,
  };

  try {
    if (requesterEmail) {
      await sendRequestFormReviewEmail({
        to: requesterEmail,
        ...basePayload,
      });
    }

    if (mentionedEmails.length > 0) {
      await sendRequestFormReviewEmail({
        to: mentionedEmails,
        ...basePayload,
        mentionedByName: requesterName,
      });
    }
  } catch (error) {
    console.error("Request form review email error:", error);
  }
}

/*
 * Whether a form is visible/submittable to a given user, per its
 * "Assign To" setting:
 * - "me": only the form's creator.
 * - "specific": the form's creator plus the listed users.
 * - "everyone" (default): every eligible org member.
 */
function formVisibleToUser(form, userId) {
  const mode = form.assignTo?.mode || "everyone";
  const uid = userId?.toString();

  if (!uid) return false;

  if (form.createdBy?.toString() === uid) {
    return true;
  }

  if (mode === "me") {
    return false;
  }

  if (mode === "specific") {
    return (form.assignTo?.users || []).some(
      (allowedId) => allowedId?.toString() === uid
    );
  }

  return true;
}

/* =========================================================
   HELPERS
========================================================= */

function getUserId(req) {
  return req.user?._id?.toString();
}

async function getOrganizationForRequest(req) {
  /*
   * Routes gated by requireOrgRole/requireOrgAnyRole already
   * resolve and attach the organization to req.organization.
   * Reuse it instead of re-deriving it (req.user has no
   * organizationId field on this model).
   */
  if (req.organization) {
    return req.organization;
  }

  const organizationId =
    req.params.orgId ||
    req.params.organizationId ||
    req.query.organizationId ||
    req.body.organizationId;

  if (!organizationId) {
    return null;
  }

  return Organization.findById(organizationId);
}

/*
 * Build the `mapped` fields (title/description/priority/assignee/
 * dueDate) used to seed a Task on approval, plus an optional
 * `projectId` override, from the form's question->mapping
 * configuration and the submitted answers.
 */
function buildMappedFromAnswers(form, answers) {
  const mapped = {
    title: "",
    description: "",
    priority: "medium",
    assignees: [],
    dueDate: null,
  };

  let projectId = null;

  const answersByQuestion = new Map(
    (Array.isArray(answers) ? answers : []).map(
      (answer) => [answer.questionId, answer.value]
    )
  );

  for (const question of form.questions || []) {
    if (!question.mapping || question.mapping === "none") {
      continue;
    }

    const value = answersByQuestion.get(question.id);

    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (question.mapping === "title") {
      mapped.title = String(value);
    } else if (question.mapping === "description") {
      mapped.description = String(value);
    } else if (question.mapping === "priority") {
      const normalized = String(value).toLowerCase();

      if (["low", "medium", "high"].includes(normalized)) {
        mapped.priority = normalized;
      }
    } else if (question.mapping === "assignee") {
      if (mongoose.Types.ObjectId.isValid(String(value))) {
        mapped.assignees.push(value);
      }
    } else if (question.mapping === "dueDate") {
      const date = new Date(value);

      if (!Number.isNaN(date.getTime())) {
        mapped.dueDate = date;
      }
    } else if (question.mapping === "project") {
      if (mongoose.Types.ObjectId.isValid(String(value))) {
        projectId = value;
      }
    }
  }

  if (!mapped.title) {
    mapped.title = form.name;
  }

  return { mapped, projectId };
}

/*
 * Create the Task for an approved submission, using the existing
 * task creation service. Shared by the manual review/approve flow
 * and the "no approval required" auto-approve flow at submit time.
 */
async function createTaskFromSubmission(submission, actorUser) {
  const task = await createTaskService({
    projectId: submission.project?._id || submission.project,
    user: actorUser,
    title:
      submission.mapped?.title || submission.form?.name || "Request",
    description: submission.mapped?.description || "",
    priority: submission.mapped?.priority || "medium",
    assigneeIds: submission.mapped?.assignees || [],
    dueDate: submission.mapped?.dueDate || null,
  });

  submission.task = task._id;

  return task;
}

/*
 * Returns true when the user can access the Request Forms
 * module.
 *
 * Access:
 * - Organization owner
 * - requestForm:submit
 * - requestForm:manage
 * - requestForm:review
 * - Project owner
 */
async function canAccessRequestForms(organization, userId) {
  if (!organization || !userId) {
    return false;
  }

  const userIdString = userId.toString();

  /*
   * Organization owner always has access.
   */
  if (
    organization.owner?.toString() ===
    userIdString
  ) {
    return true;
  }

  /*
   * Permission-based access.
   */
  if (
    hasOrgPermissionForUser(
      organization,
      userId,
      "requestForm:submit"
    ) ||
    hasOrgPermissionForUser(
      organization,
      userId,
      "requestForm:manage"
    ) ||
    hasOrgPermissionForUser(
      organization,
      userId,
      "requestForm:review"
    )
  ) {
    return true;
  }

  /*
   * Project owner also has access.
   */
  const ownedProject = await Project.exists({
    organization: organization._id,
    isDeleted: { $ne: true },
    owner: userId,
  });

  return !!ownedProject;
}

/*
 * Get users who should receive notifications
 * when a request is submitted.
 *
 * Reviewers:
 * - Project owner
 * - Organization owner
 */
async function getReviewers(project, organization) {
  const reviewerIds = [];

  if (project?.owner) {
    reviewerIds.push(
      project.owner._id
        ? project.owner._id.toString()
        : project.owner.toString()
    );
  }

  if (organization?.owner) {
    const organizationOwnerId =
      organization.owner._id
        ? organization.owner._id.toString()
        : organization.owner.toString();

    reviewerIds.push(organizationOwnerId);
  }

  return [
    ...new Set(
      reviewerIds.filter(Boolean)
    ),
  ];
}

/* =========================================================
   GET ALL FORMS
========================================================= */

async function getForms(req, res) {
  try {
    const organization =
      await getOrganizationForRequest(req);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    const isOrganizationOwner =
      organization.owner?.toString() ===
      userId;

    /*
     * If organization has an isMember helper,
     * validate membership for normal users.
     */
    if (
      !isOrganizationOwner &&
      typeof organization.isMember === "function" &&
      !organization.isMember(req.user._id)
    ) {
      return res.status(403).json({
        message:
          "You are not a member of this organization.",
      });
    }

    const hasAccess =
      await canAccessRequestForms(
        organization,
        req.user._id
      );

    if (!hasAccess) {
      return res.status(403).json({
        message:
          "You do not have permission to access Request Forms.",
      });
    }

    /*
     * Forms are workspace-isolated: a form created in Workspace A
     * must never be visible from Workspace B, even within the same
     * organization.
     */
    const { workspaceId, error: workspaceError } =
      await resolveWorkspaceParam(req, organization._id);

    if (workspaceError) {
      return res.status(workspaceError.status).json({
        message: workspaceError.message,
      });
    }

    /*
     * A form stays in Available Forms even after this user has
     * submitted it — forms are reusable (e.g. filing another bug
     * report), so submitting once must not hide it from the list
     * or block a later, separate submission.
     */
    const forms =
      await RequestForm.find(
        applyWorkspaceFilter(
          {
            organization: organization._id,
            status: { $ne: "archived" },
          },
          workspaceId
        )
      )
        .populate(
          "createdBy",
          "username email avatarColor"
        )
        .sort({
          createdAt: -1,
        });

    /*
     * Owner/Admin (who manage the module) always see every form so
     * they can configure/publish/archive it, regardless of its
     * "Assign To" audience. Everyone else only sees forms they're
     * actually allowed to see/submit.
     */
    const hasManagePermission =
      hasOrgPermissionForUser(
        organization,
        req.user._id,
        "requestForm:manage"
      );

    const visibleForms =
      isOrganizationOwner || hasManagePermission
        ? forms
        : forms.filter((form) =>
            formVisibleToUser(form, req.user._id)
          );

    return res.json(visibleForms);
  } catch (error) {
    console.error(
      "Get request forms error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to fetch request forms.",
    });
  }
}

/* =========================================================
   CREATE FORM
========================================================= */

async function createForm(req, res) {
  try {
    const organization =
      await getOrganizationForRequest(req);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const resolvedWorkspaceId = await resolveDefaultWorkspaceId(
      req.user._id,
      {
        organizationId: organization._id,
        workspaceId: req.body.workspaceId || null,
      }
    );

    const form = await RequestForm.create({
      ...req.body,
      organization: organization._id,
      workspace: resolvedWorkspaceId,
      createdBy: req.user._id,
    });

    const populatedForm =
      await RequestForm.findById(form._id).populate(
        "createdBy",
        "username email avatarColor"
      );

    return res.status(201).json(
      populatedForm || form
    );
  } catch (error) {
    console.error(
      "Create request form error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to create request form.",
    });
  }
}

/* =========================================================
   GET SINGLE FORM
========================================================= */

async function getForm(req, res) {
  try {
    const organization =
      await getOrganizationForRequest(req);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const hasAccess =
      await canAccessRequestForms(
        organization,
        req.user._id
      );

    if (!hasAccess) {
      return res.status(403).json({
        message:
          "You do not have permission to access Request Forms.",
      });
    }

    const { workspaceId, error: workspaceError } =
      await resolveWorkspaceParam(req, organization._id);

    if (workspaceError) {
      return res.status(workspaceError.status).json({
        message: workspaceError.message,
      });
    }

    const form =
      await RequestForm.findOne(
        applyWorkspaceFilter(
          {
            _id: req.params.formId,
            organization: organization._id,
          },
          workspaceId
        )
      ).populate(
        "createdBy",
        "username email avatarColor"
      );

    if (!form) {
      return res.status(404).json({
        message: "Request form not found.",
      });
    }

    const isOrganizationOwner =
      organization.owner?.toString() ===
      req.user._id.toString();

    const hasManagePermission =
      hasOrgPermissionForUser(
        organization,
        req.user._id,
        "requestForm:manage"
      );

    if (
      !isOrganizationOwner &&
      !hasManagePermission &&
      !formVisibleToUser(form, req.user._id)
    ) {
      return res.status(404).json({
        message: "Request form not found.",
      });
    }

    return res.json(form);
  } catch (error) {
    console.error(
      "Get request form error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to fetch request form.",
    });
  }
}

/* =========================================================
   UPDATE FORM
========================================================= */

async function updateForm(req, res) {
  try {
    const organization =
      await getOrganizationForRequest(req);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const { workspaceId, error: workspaceError } =
      await resolveWorkspaceParam(req, organization._id);

    if (workspaceError) {
      return res.status(workspaceError.status).json({
        message: workspaceError.message,
      });
    }

    /*
     * Never let the request body move the form to a different
     * organization/workspace or reassign who created it.
     */
    const {
      organization: _ignoredOrganization,
      workspace: _ignoredWorkspace,
      createdBy: _ignoredCreatedBy,
      _id: _ignoredId,
      ...updates
    } = req.body;

    const form =
      await RequestForm.findOneAndUpdate(
        applyWorkspaceFilter(
          {
            _id: req.params.formId,
            organization: organization._id,
          },
          workspaceId
        ),
        {
          $set: {
            ...updates,
            updatedBy: req.user._id,
          },
        },
        {
          new: true,
          runValidators: true,
        }
      ).populate(
        "createdBy",
        "username email avatarColor"
      );

    if (!form) {
      return res.status(404).json({
        message: "Request form not found.",
      });
    }

    return res.json(form);
  } catch (error) {
    console.error(
      "Update request form error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to update request form.",
    });
  }
}

/*
 * Shared status-transition handler for publish/disable/archive.
 * `allowedFrom` lists which current statuses may transition into
 * `toStatus`; anything else returns 400.
 */
function makeStatusTransitionHandler(toStatus, allowedFrom, label) {
  return async function transition(req, res) {
    try {
      const organization = await getOrganizationForRequest(req);

      if (!organization) {
        return res.status(404).json({
          message: "Organization not found.",
        });
      }

      const { workspaceId, error: workspaceError } =
        await resolveWorkspaceParam(req, organization._id);

      if (workspaceError) {
        return res.status(workspaceError.status).json({
          message: workspaceError.message,
        });
      }

      const form = await RequestForm.findOne(
        applyWorkspaceFilter(
          {
            _id: req.params.formId,
            organization: organization._id,
          },
          workspaceId
        )
      );

      if (!form) {
        return res.status(404).json({
          message: "Request form not found.",
        });
      }

      if (!allowedFrom.includes(form.status)) {
        return res.status(400).json({
          message: `Cannot ${label} a form that is currently "${form.status}".`,
        });
      }

      form.status = toStatus;
      form.updatedBy = req.user._id;
      await form.save();

      const populatedForm = await RequestForm.findById(
        form._id
      ).populate("createdBy", "username email avatarColor");

      return res.json(populatedForm || form);
    } catch (error) {
      console.error(`${label} request form error:`, error);

      return res.status(500).json({
        message: error.message || `Failed to ${label} request form.`,
      });
    }
  };
}

const publishForm = makeStatusTransitionHandler(
  "published",
  ["draft", "disabled"],
  "publish"
);

const disableForm = makeStatusTransitionHandler(
  "disabled",
  ["published"],
  "disable"
);

const archiveForm = makeStatusTransitionHandler(
  "archived",
  ["draft", "published", "disabled"],
  "archive"
);

/* =========================================================
   GET ACCESSIBLE PROJECTS
========================================================= */

async function getAccessibleProjects(req, res) {
  try {
    const organization =
      await getOrganizationForRequest(req);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const userId = getUserId(req);

    const isOrganizationOwner =
      organization.owner?.toString() ===
      userId;

    const hasSubmitPermission =
      hasOrgPermissionForUser(
        organization,
        req.user._id,
        "requestForm:submit"
      );

    const hasManagePermission =
      hasOrgPermissionForUser(
        organization,
        req.user._id,
        "requestForm:manage"
      );

    const hasReviewPermission =
      hasOrgPermissionForUser(
        organization,
        req.user._id,
        "requestForm:review"
      );

    const isProjectOwner =
      await Project.exists({
        organization: organization._id,
        isDeleted: { $ne: true },
        owner: req.user._id,
      });

    if (
      !isOrganizationOwner &&
      !hasSubmitPermission &&
      !hasManagePermission &&
      !hasReviewPermission &&
      !isProjectOwner
    ) {
      return res.status(403).json({
        message:
          "You do not have permission to access projects.",
      });
    }

    /*
     * Organization owner can see all projects.
     *
     * Other users can see projects where:
     * - they are a member
     * - they are the project owner
     */
    let query;

    if (isOrganizationOwner) {
      query = {
        organization: organization._id,
        isDeleted: { $ne: true },
        status: { $ne: "archived" },
      };
    } else {
      query = {
        organization: organization._id,
        isDeleted: { $ne: true },
        status: { $ne: "archived" },
        $or: [
          {
            "members.user": req.user._id,
          },
          {
            owner: req.user._id,
          },
        ],
      };
    }

    const projects =
      await Project.find(query)
        .select(
          "_id title name description owner members status"
        )
        .populate("owner", "username email avatarColor")
        .populate("members.user", "username email avatarColor")
        .sort({
          createdAt: -1,
        });

    return res.json(projects);
  } catch (error) {
    console.error(
      "Get accessible projects error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to fetch accessible projects.",
    });
  }
}

/* =========================================================
   SUBMIT FORM
========================================================= */

async function submitForm(req, res) {
  try {
    const organization =
      await getOrganizationForRequest(req);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const userId =
      req.user._id.toString();

    const isOrganizationOwner =
      organization.owner?.toString() ===
      userId;

    const { workspaceId, error: workspaceError } =
      await resolveWorkspaceParam(req, organization._id);

    if (workspaceError) {
      return res.status(workspaceError.status).json({
        message: workspaceError.message,
      });
    }

    /*
     * Load form. Only a published form accepts new
     * submissions (draft/disabled/archived do not). Also
     * workspace-scoped — a form from another workspace must not be
     * submittable just because the caller knows its id.
     */
    const form =
      await RequestForm.findOne(
        applyWorkspaceFilter(
          {
            _id: req.params.formId,
            organization: organization._id,
            status: "published",
          },
          workspaceId
        )
      );

    if (!form) {
      return res.status(404).json({
        message:
          "Request form not found or is not currently accepting submissions.",
      });
    }

    /*
     * Check submission permission.
     */
    const hasSubmitPermission =
      hasOrgPermissionForUser(
        organization,
        req.user._id,
        "requestForm:submit"
      );

    const hasManagePermission =
      hasOrgPermissionForUser(
        organization,
        req.user._id,
        "requestForm:manage"
      );

    /*
     * "Assign To" also controls who may see/submit this form (see
     * formVisibleToUser). Owner/Admin can still submit any form
     * they manage, same as viewing it.
     */
    if (
      !isOrganizationOwner &&
      !hasManagePermission &&
      !formVisibleToUser(form, req.user._id)
    ) {
      return res.status(404).json({
        message:
          "Request form not found or is not currently accepting submissions.",
      });
    }

    /*
     * Compute field-to-task mapping (title/description/priority/
     * assignee/dueDate) and a possible project override from a
     * "project"-mapped field, from the submitted answers.
     */
    const { mapped, projectId: mappedProjectId } =
      buildMappedFromAnswers(form, req.body.answers);

    /*
     * Determine which project this submission targets.
     *
     * Priority:
     * 1. The form's configured "Save To" project (fixed by the
     *    form creator — the requester does not choose one).
     * 2. A field mapped to "project" in the submitted answers.
     *
     * "Save To: None" (and no project-mapped field) means the
     * request is simply not associated with any project — approving
     * it later just marks it Approved, no task is created.
     */
    const saveToProjectId = form.saveTo?.project
      ? form.saveTo.project.toString()
      : null;

    const effectiveProjectId = saveToProjectId || mappedProjectId || null;

    let project = null;

    if (effectiveProjectId) {
      /*
       * Project lookup.
       *
       * Organization owner does not need to be a project
       * member. A form-configured "Save To" project is trusted
       * as-is (still validated for existence/organization/not
       * deleted below) since the requester did not choose it.
       *
       * Otherwise, other users can access:
       * - project member
       * - project owner
       */
      let projectQuery = {
        _id: effectiveProjectId,
        organization: organization._id,
        isDeleted: { $ne: true },
      };

      if (!saveToProjectId && !isOrganizationOwner) {
        projectQuery.$or = [
          {
            "members.user": req.user._id,
          },
          {
            owner: req.user._id,
          },
        ];
      }

      project = await Project.findOne(projectQuery);

      if (!project) {
        return res.status(404).json({
          message: saveToProjectId
            ? "This form's configured destination project no longer exists or is not accessible."
            : "Project not found or you do not have access to it.",
        });
      }
    }

    /*
     * Fall back to the form's configured default assignee(s) when
     * no field in the submission was mapped to "assignee".
     */
    if (mapped.assignees.length === 0 && form.assignTo?.mode) {
      if (form.assignTo.mode === "me" && form.createdBy) {
        mapped.assignees = [form.createdBy];
      } else if (
        form.assignTo.mode === "specific" &&
        Array.isArray(form.assignTo.users)
      ) {
        mapped.assignees = form.assignTo.users;
      } else if (form.assignTo.mode === "everyone" && project) {
        const memberIds = (project.members || [])
          .map((m) => m.user)
          .filter(Boolean);

        mapped.assignees = project.owner
          ? [project.owner, ...memberIds]
          : memberIds;
      }
    }

    const isProjectOwner =
      !!project &&
      (project.owner?._id?.toString() ===
        userId ||
      project.owner?.toString() ===
        userId);

    /*
     * Organization owner, project owner,
     * submit permission, or manage permission
     * can submit.
     */
    if (
      !isOrganizationOwner &&
      !isProjectOwner &&
      !hasSubmitPermission &&
      !hasManagePermission
    ) {
      return res.status(403).json({
        message:
          "You do not have permission to submit this request form.",
      });
    }

    /*
     * A user may submit the same form more than once (e.g. filing
     * another, separate request/query) — no duplicate check here.
     */

    /*
     * Create submission.
     *
     * Keep the request body intact so existing
     * dynamic form fields continue to work.
     */
    const submissionData = {
      ...req.body,

      organization:
        organization._id,

      // Inherited from the form itself, not the request's own
      // workspaceId — the submission always belongs to whichever
      // workspace the form belongs to.
      workspace:
        form.workspace,

      form:
        form._id,

      submittedBy:
        req.user._id,

      project:
        project?._id || null,

      status:
        "pending",

      mapped,

      // The requester's own choice, made on the submit page — not
      // configurable by the form creator.
      includeResponsesInEmail: Boolean(req.body.includeResponsesInEmail),

      /*
       * Snapshot the form's name/questions as they exist right
       * now, so a later edit to the form never changes how this
       * submission is displayed or understood.
       */
      formSnapshot: {
        name: form.name,
        questions: (form.questions || []).map((question) =>
          question.toObject ? question.toObject() : question
        ),
      },
    };

    const submission =
      await RequestFormSubmission.create(
        submissionData
      );

    const submitterName =
      req.user.username ||
      req.user.email ||
      "A member";

    const notificationPriority =
      {
        high: "High",
        medium: "Medium",
        low: "Low",
      }[mapped.priority] || "Medium";

    /*
     * -----------------------------------------------------
     * NO APPROVAL REQUIRED
     * -----------------------------------------------------
     *
     * The form is configured to create the task immediately
     * instead of waiting for a reviewer.
     */
    if (form.approvalRequired === false) {
      try {
        // No project associated (Save To: None) — approve without
        // ever creating a task.
        if (project) {
          await createTaskFromSubmission(submission, req.user);
        }

        submission.status = "approved";
        submission.reviewedAt = new Date();
        await submission.save();

        await createNotification({
          userId: req.user._id,
          actorId: req.user._id,
          type: "system",
          title: project ? "Task created" : "Request approved",
          message: project
            ? `Your request "${form.name}" has been submitted and a task was created.`
            : `Your request "${form.name}" was automatically approved.`,
          projectId: project?._id,
          priority: notificationPriority,
          link: `/request-forms/requests/${submission._id}`,
        });
      } catch (taskError) {
        console.error(
          "Auto-approve task creation error:",
          taskError
        );

        return res.status(500).json({
          message:
            taskError.message ||
            "Request submitted but the task could not be created.",
        });
      }

      await sendThankYouEmail(form, submission, req.user);

      await sendReviewEmail(submission, req.user, {
        formName: form.name,
        projectName: project?.title || null,
        senderName: form.emailConfig?.senderName,
      });

      return res.status(201).json({
        ...submission.toObject(),
        reference: buildRequestReference(submission._id),
      });
    }

    /*
     * -----------------------------------------------------
     * NOTIFY REVIEWERS
     * -----------------------------------------------------
     *
     * Project owner and organization owner
     * receive a notification.
     */
    const reviewers =
      await getReviewers(
        project,
        organization
      );

    await Promise.all(
      reviewers
        .filter(
          (reviewerId) =>
            reviewerId.toString() !==
            req.user._id.toString()
        )
        .map(
          (reviewerId) =>
            createNotification({
              userId:
                reviewerId,

              actorId:
                req.user._id,

              type:
                "system",

              title:
                "New request submitted",

              message: project
                ? `${submitterName} submitted "${form.name}" for project "${project.title}".`
                : `${submitterName} submitted "${form.name}".`,

              projectId:
                project?._id,

              priority:
                notificationPriority,

              link:
                `/request-forms/requests/${submission._id}`,
            })
        )
    );

    await sendThankYouEmail(form, submission, req.user);

    return res.status(201).json({
      ...submission.toObject(),
      reference: buildRequestReference(submission._id),
    });
  } catch (error) {
    console.error(
      "Submit request form error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to submit request form.",
    });
  }
}

/* =========================================================
   GET SUBMISSIONS
========================================================= */

async function getSubmissions(req, res) {
  try {
    const organization =
      await getOrganizationForRequest(req);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const userId =
      req.user._id.toString();

    const isOrganizationOwner =
      organization.owner?.toString() ===
      userId;

    /*
     * Get projects owned by current user.
     */
    const ownedProjectIds = (
      await Project.find({
        organization: organization._id,
        isDeleted: { $ne: true },
        owner: req.user._id,
      }).select("_id")
    ).map(
      (project) => project._id
    );

    const hasReviewPermission =
      hasOrgPermissionForUser(
        organization,
        req.user._id,
        "requestForm:review"
      );

    const hasSubmitPermission =
      hasOrgPermissionForUser(
        organization,
        req.user._id,
        "requestForm:submit"
      );

    let filter;

    /*
     * Organization owner and reviewers
     * can see all submissions.
     */
    if (
      isOrganizationOwner ||
      hasReviewPermission
    ) {
      filter = {
        organization: organization._id,
      };
    } else {
      /*
       * Normal users see:
       * - their own submissions
       * - submissions for projects they own
       */
      filter = {
        organization:
          organization._id,

        $or: [
          {
            submittedBy:
              req.user._id,
          },
          {
            project: {
              $in:
                ownedProjectIds,
            },
          },
        ],
      };
    }

    const { workspaceId, error: workspaceError } =
      await resolveWorkspaceParam(req, organization._id);

    if (workspaceError) {
      return res.status(workspaceError.status).json({
        message: workspaceError.message,
      });
    }

    const submissions =
      await RequestFormSubmission.find(
        applyWorkspaceFilter(filter, workspaceId)
      )
        .populate(
          "form",
          "name description"
        )
        .populate(
          "submittedBy",
          "username email avatarColor"
        )
        .populate(
          "project",
          "title name owner"
        )
        .sort({
          createdAt: -1,
        });

    return res.json(
      submissions
    );
  } catch (error) {
    console.error(
      "Get request submissions error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to fetch submissions.",
    });
  }
}

/* =========================================================
   GET SINGLE SUBMISSION
========================================================= */

async function getSubmission(req, res) {
  try {
    const organization =
      await getOrganizationForRequest(req);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const { workspaceId, error: workspaceError } =
      await resolveWorkspaceParam(req, organization._id);

    if (workspaceError) {
      return res.status(workspaceError.status).json({
        message: workspaceError.message,
      });
    }

    const submission =
      await RequestFormSubmission.findOne(
        applyWorkspaceFilter(
          {
            _id: req.params.submissionId,
            organization: organization._id,
          },
          workspaceId
        )
      )
        .populate(
          "form"
        )
        .populate(
          "submittedBy",
          "username email avatarColor"
        )
        .populate(
          "project",
          "title name owner"
        );

    if (!submission) {
      return res.status(404).json({
        message:
          "Request submission not found.",
      });
    }

    const userId =
      req.user._id.toString();

    const isSubmitter =
      submission.submittedBy?._id?.toString() ===
      userId;

    const isOrganizationOwner =
      organization.owner?.toString() ===
      userId;

    const isProjectOwner =
      submission.project?.owner?._id?.toString() ===
        userId ||
      submission.project?.owner?.toString() ===
        userId;

    const hasReviewPermission =
      hasOrgPermissionForUser(
        organization,
        req.user._id,
        "requestForm:review"
      );

    if (
      !isSubmitter &&
      !isOrganizationOwner &&
      !isProjectOwner &&
      !hasReviewPermission
    ) {
      return res.status(403).json({
        message:
          "You do not have permission to view this submission.",
      });
    }

    return res.json(
      submission
    );
  } catch (error) {
    console.error(
      "Get request submission error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to fetch submission.",
    });
  }
}

/* =========================================================
   REVIEW SUBMISSION
========================================================= */

async function reviewSubmission(req, res) {
  try {
    const organization =
      await getOrganizationForRequest(req);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const { workspaceId, error: workspaceError } =
      await resolveWorkspaceParam(req, organization._id);

    if (workspaceError) {
      return res.status(workspaceError.status).json({
        message: workspaceError.message,
      });
    }

    const submission =
      await RequestFormSubmission.findOne(
        applyWorkspaceFilter(
          {
            _id: req.params.submissionId,
            organization: organization._id,
          },
          workspaceId
        )
      )
        .populate(
          "form"
        )
        .populate(
          "submittedBy",
          "username email"
        )
        .populate(
          "project",
          "title name owner"
        );

    if (!submission) {
      return res.status(404).json({
        message:
          "Request submission not found.",
      });
    }

    const userId =
      req.user._id.toString();

    const isOrgOwner =
      organization.owner?.toString() ===
      userId;

    const isProjectOwner =
      submission.project?.owner?._id?.toString() ===
        userId ||
      submission.project?.owner?.toString() ===
        userId;

    const hasReviewPermission =
      hasOrgPermissionForUser(
        organization,
        req.user._id,
        "requestForm:review"
      );

    /*
     * Organization owner,
     * project owner,
     * or review permission
     * can approve/reject.
     */
    if (
      !isOrgOwner &&
      !isProjectOwner &&
      !hasReviewPermission
    ) {
      return res.status(403).json({
        message:
          "You do not have permission to review request forms.",
      });
    }

    const {
      status,
      action,
      reviewComment,
      comment,
      notes,
      reason,
    } = req.body;

    /*
     * Accept either the frontend's { action: "approve"/"reject" }
     * payload or a raw { status: "approved"/"rejected" } payload.
     */
    const normalizedAction =
      String(action || "")
        .trim()
        .toLowerCase();

    const actionToStatus = {
      approve: "approved",
      reject: "rejected",
    };

    const normalizedStatus =
      actionToStatus[normalizedAction] ||
      String(status || "")
        .trim()
        .toLowerCase();

    if (
      ![
        "approved",
        "rejected",
      ].includes(
        normalizedStatus
      )
    ) {
      return res.status(400).json({
        message:
          "Status must be approved or rejected.",
      });
    }

    const rejectionReason = String(
      reason ||
        reviewComment ||
        comment ||
        notes ||
        ""
    ).trim();

    if (
      normalizedStatus === "rejected" &&
      !rejectionReason
    ) {
      return res.status(400).json({
        message:
          "A reason is required to reject a request.",
      });
    }

    /*
     * Update review information.
     */
    submission.status =
      normalizedStatus;

    submission.reviewedBy =
      req.user._id;

    submission.reviewedAt =
      new Date();

    submission.rejectionReason =
      normalizedStatus === "rejected"
        ? rejectionReason
        : "";

    /*
     * -----------------------------------------------------
     * APPROVAL
     * -----------------------------------------------------
     *
     * Create a Task from the submission's mapped
     * title/description/priority, using the existing
     * task creation service, and link it back onto
     * the submission.
     */
    if (
      normalizedStatus ===
      "approved" &&
      submission.project
    ) {
      // No project associated (Save To: None) — approve without
      // ever creating a task.
      try {
        await createTaskFromSubmission(submission, req.user);
      } catch (taskError) {
        console.error(
          "Request approval task creation error:",
          taskError
        );

        return res.status(500).json({
          message:
            taskError.message ||
            "Request approved but the task could not be created.",
        });
      }
    }

    await submission.save();

    /*
     * -----------------------------------------------------
     * NOTIFY REQUESTER
     * -----------------------------------------------------
     *
     * Requester gets an in-app notification and an email when:
     * - approved
     * - rejected
     */
    if (
      submission.submittedBy
    ) {
      const requesterId =
        submission.submittedBy._id
          ? submission.submittedBy._id
          : submission.submittedBy;

      await createNotification({
        userId:
          requesterId,

        actorId:
          req.user._id,

        type:
          "system",

        title:
          normalizedStatus ===
          "approved"
            ? "Request approved"
            : "Request rejected",

        message:
          normalizedStatus ===
          "approved"
            ? `Your request "${submission.form?.name || "Request"}" has been approved.`
            : `Your request "${submission.form?.name || "Request"}" has been rejected.`,

        projectId:
          submission.project?._id ||
          submission.project ||
          undefined,

        priority:
          "Medium",

        link:
          `/request-forms/requests/${submission._id}`,
      });

      await sendReviewEmail(submission, submission.submittedBy, {
        formName: submission.form?.name,
        projectName: submission.project?.title || null,
        senderName: submission.form?.emailConfig?.senderName,
      });
    }

    return res.json(
      submission
    );
  } catch (error) {
    console.error(
      "Review request submission error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to review request submission.",
    });
  }
}

/* =========================================================
   ANSWER IMAGE ATTACHMENT
   (for "textarea" questions with allowImageAttachment)
========================================================= */

async function uploadAnswerImage(req, res) {
  try {
    const organization = await getOrganizationForRequest(req);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const { workspaceId, error: workspaceError } =
      await resolveWorkspaceParam(req, organization._id);

    if (workspaceError) {
      return res.status(workspaceError.status).json({
        message: workspaceError.message,
      });
    }

    const form = await RequestForm.findOne(
      applyWorkspaceFilter(
        {
          _id: req.params.formId,
          organization: organization._id,
          status: "published",
        },
        workspaceId
      )
    );

    if (!form) {
      return res.status(404).json({
        message: "Request form not found.",
      });
    }

    const isOrganizationOwner =
      organization.owner?.toString() === req.user._id.toString();

    const hasManagePermission = hasOrgPermissionForUser(
      organization,
      req.user._id,
      "requestForm:manage"
    );

    if (
      !isOrganizationOwner &&
      !hasManagePermission &&
      !formVisibleToUser(form, req.user._id)
    ) {
      return res.status(404).json({
        message: "Request form not found.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "No image file was uploaded.",
      });
    }

    return res.status(201).json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: `/request-forms/${form._id}/attachments/${req.file.filename}`,
    });
  } catch (error) {
    console.error("Upload answer image error:", error);

    return res.status(500).json({
      message: error.message || "Failed to upload image.",
    });
  }
}

async function downloadAnswerImage(req, res) {
  try {
    const organization = await getOrganizationForRequest(req);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const form = await RequestForm.findOne({
      _id: req.params.formId,
      organization: organization._id,
    });

    if (!form) {
      return res.status(404).json({
        message: "Request form not found.",
      });
    }

    const hasAccess = await canAccessRequestForms(
      organization,
      req.user._id
    );

    if (!hasAccess) {
      return res.status(403).json({
        message: "You do not have permission to view this file.",
      });
    }

    const filePath = resolveAnswerImageFile(
      form._id,
      req.params.filename
    );

    if (!filePath) {
      return res.status(404).json({
        message: "File not found.",
      });
    }

    return res.sendFile(filePath);
  } catch (error) {
    console.error("Download answer image error:", error);

    return res.status(500).json({
      message: error.message || "Failed to load image.",
    });
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getForms,
  createForm,
  getForm,
  updateForm,
  publishForm,
  disableForm,
  archiveForm,
  getAccessibleProjects,
  submitForm,
  getSubmissions,
  getSubmission,
  reviewSubmission,
  uploadAnswerImage,
  downloadAnswerImage,
};