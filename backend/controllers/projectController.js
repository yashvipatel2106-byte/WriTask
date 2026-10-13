// backend/controllers/projectController.js
// WHAT CHANGED vs your original:
//
//  BUG 1 — req.user.userId does NOT exist.
//    Your authMiddleware sets req.user = full User document (from User.findById).
//    So the correct field is req.user._id, not req.user.userId.
//
//  BUG 2 — createProject was not saving owner to Project.
//    Project schema had no `owner` field, so it was silently dropped.
//    Now owner is saved + creator is pushed into members[] as role:"owner".
//
//  BUG 3 — getProjects was filtering by owner only.
//    This means if User2 is a member of User1's project they'd never see it.
//    Now it filters by: "members.user": userId — so any member can see it.
//
//  BUG 4 — projectRoutes.js file didn't exist at all.
//    See fix4_projectRoutes.js for the new routes file.

const Project = require("../models/Project");
const User = require("../models/user");
const Organization = require("../models/Organization");
const ProjectInvitation = require("../models/ProjectInvitation");
const OrganizationInvitation = require("../models/OrganizationInvitation");
const Task = require("../models/Task");
const CalendarEvent = require("../models/Calendarevent");
const crypto = require("crypto");
const { sendProjectInviteEmail } = require("../utils/emailService");
const {
  normalizeEmail,
  resolveFrontendUrl,
} = require("../utils/frontendUrl");
const { validateInviteEmail } = require("../utils/emailValidation");
const {
  buildOrgProjectMembers,
  buildProjectListFilter,
  resolveProjectRoleForUser,
  resolveEffectiveProjectPermissions,
  userHasProjectPermission,
} = require("../utils/projectAccess");
const {
  hasOrgPermissionForUser,
  ensureRoleDefinitions,
  getRoleDefinition,
  findOrgMember,
  orgRoleIdToProjectMemberRole,
  projectMemberRoleToOrgRoleId,
} = require("../utils/roleDefinitions");
const {
  createDefaultCardPreviewConfig,
  normalizeCardPreviewConfig,
} = require("../utils/kanbanCardPreview");
const {
  getWorkspaceCustomFieldDefinitions,
  getProjectCustomFieldDefinitionsGrouped,
  getTaskEditableCustomFieldDefinitions,
  createWorkspaceCustomField,
  deleteWorkspaceCustomField,
  adoptCustomFieldOnProject,
} = require("../utils/customFields");
const { backfillLegacyProjectWorkspaces } = require("../utils/workspaces");
const {
  HierarchyError,
  resolveCreateLocation,
  buildProjectTree,
  pruneProjectTreeForViewer,
  resolveProjectTreeDocuments,
  resolveContainerWorkspace,
} = require("../utils/projectHierarchy");
const {
  ProjectTrashError,
  moveProjectTreesToTrash,
} = require("../utils/projectTrash");

async function projectCustomFieldsPayload(project) {
  const grouped = await getProjectCustomFieldDefinitionsGrouped(project);
  const editableCustomFieldDefinitions =
    await getTaskEditableCustomFieldDefinitions(project);
  return {
    customFieldDefinitions: grouped.currentWorkspaceFields,
    otherWorkspaceCustomFields: grouped.otherWorkspaceFields,
    editableCustomFieldDefinitions,
    projectWorkspaceId: grouped.projectWorkspaceId,
  };
}

/** Add or update org membership using the canonical org role id. */
async function syncOrgMembership(project, userId, orgRoleId) {
  if (!project.organization || !orgRoleId) return;

  const orgId = project.organization._id || project.organization;
  const organization = await Organization.findById(orgId);
  if (!organization) return;

  ensureRoleDefinitions(organization);
  if (!getRoleDefinition(organization, orgRoleId)) return;

  const userIdStr = userId.toString();
  const existing = findOrgMember(organization, userId);

  if (existing) {
    if (organization.owner.toString() === userIdStr) return;
    if (existing.role !== orgRoleId) {
      existing.role = orgRoleId;
      await organization.save();
    }
    return;
  }

  organization.members.push({ user: userId, role: orgRoleId });
  await organization.save();
}

const BILLING_VALUES = ["billable", "non_billable"];

/*
 * Shared by createProject/updateProject — normalizes and validates
 * startDate/dueDate/billing/budget from req.body. Every field is
 * optional; only present keys are validated/returned, so a partial
 * update (e.g. just changing budget) doesn't require the others.
 * Returns { error } on the first invalid field, otherwise the
 * normalized values ready to assign onto a Project document.
 */
function parseScheduleAndBudget(body) {
  const result = {};

  if (body.startDate !== undefined) {
    if (body.startDate === null || body.startDate === "") {
      result.startDate = null;
    } else {
      const parsed = new Date(body.startDate);
      if (Number.isNaN(parsed.getTime())) {
        return { error: "Start date is invalid." };
      }
      result.startDate = parsed;
    }
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === "") {
      result.dueDate = null;
    } else {
      const parsed = new Date(body.dueDate);
      if (Number.isNaN(parsed.getTime())) {
        return { error: "Due date is invalid." };
      }
      result.dueDate = parsed;
    }
  }

  if (result.startDate && result.dueDate && result.dueDate < result.startDate) {
    return { error: "Due date cannot be earlier than start date." };
  }

  if (body.billing !== undefined) {
    if (!BILLING_VALUES.includes(body.billing)) {
      return {
        error: `Billing must be one of: ${BILLING_VALUES.join(", ")}.`,
      };
    }
    result.billing = body.billing;
  }

  if (body.budget !== undefined) {
    if (body.budget === null || body.budget === "") {
      result.budget = null;
    } else {
      const parsed = Number(body.budget);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return { error: "Budget must be a number that is 0 or greater." };
      }
      result.budget = parsed;
    }
  }

  return { result };
}

// ─────────────────────────────────────────────────────────────
// CREATE PROJECT
// POST /api/projects
// Any logged-in user can create a project.
// The creator automatically becomes the OWNER.
// ─────────────────────────────────────────────────────────────
const createProject = async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const { result: scheduleAndBudget, error: scheduleError } =
      parseScheduleAndBudget(req.body);
    if (scheduleError) {
      return res.status(400).json({ message: scheduleError });
    }

    const userId = req.user._id;
    let location;
    try {
      location = await resolveCreateLocation(userId, req.body);
    } catch (err) {
      if (err instanceof HierarchyError) {
        return res.status(err.status).json({ message: err.message });
      }
      throw err;
    }

    const organizationId = location.organizationId || null;
    let members = location.members || [{ user: userId, role: "owner" }];
    let resolvedWorkspaceId = location.workspaceId || null;

    const {
      getWorkspaceForUser,
      resolveDefaultWorkspaceId,
    } = require("../utils/workspaces");

    if (resolvedWorkspaceId) {
      const ws = await getWorkspaceForUser(userId, resolvedWorkspaceId);
      if (!ws) {
        return res.status(400).json({ message: "Invalid workspace" });
      }
      resolvedWorkspaceId = ws._id;
    }

    if (organizationId && !location.skipOrgCreateCheck) {
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      if (organization.isDeleted) {
        return res.status(404).json({ message: "Organization is in trash" });
      }

      if (!hasOrgPermissionForUser(organization, userId, "org:createProject")) {
        return res.status(403).json({
          message: "Your organization role cannot create projects",
        });
      }

      if (!location.members) {
        members = buildOrgProjectMembers(organization, userId);
      }
    }

    if (!resolvedWorkspaceId) {
      resolvedWorkspaceId = await resolveDefaultWorkspaceId(userId, {
        organizationId: organizationId || null,
        workspaceId: req.body.workspaceId || null,
      });
    }

    const project = await Project.create({
      title,
      description,
      organization: organizationId || null,
      workspace: resolvedWorkspaceId,
      folder: location.folderId || null,
      workspaceFile: location.fileId || null,
      parentProject: location.parentProjectId || null,
      owner: userId,
      members,
      ...scheduleAndBudget,
    });

    const populated = await Project.findById(project._id)
      .populate("owner", "username email avatarColor")
      .populate("members.user", "username email designation avatarColor")
      .populate("organization", "name slug");

    res.status(201).json({
      ...populated.toObject(),
      myRole: "owner",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET ALL PROJECTS FOR CURRENT USER
// GET /api/projects
//
// Only returns projects where THIS user is a member.
// User1's projects will NOT appear for User2 unless User2 is added as a member.
// ─────────────────────────────────────────────────────────────
const getProjects = async (req, res) => {
  try {
    const userId = req.user._id;
    const { organizationId, personal, workspaceId } = req.query;

    await backfillLegacyProjectWorkspaces(userId, {
      organizationId,
      personal,
    });

    const result = await buildProjectListFilter(userId, {
      organizationId,
      personal,
      workspaceId,
    });

    if (result.error) {
      return res
        .status(result.error.status)
        .json({ message: result.error.message });
    }

    const filter = {
      ...result.filter,
      isDeleted: { $ne: true },
      status: { $ne: "archived" },
    };

    const projects = await Project.find(filter)
  .populate("owner", "username email avatarColor")
  .populate("organization", "name slug");


    const projectsWithRole = await Promise.all(
      projects.map(async (p) => {
        const obj = p.toObject();
        return {
          ...obj,
          createdBy: obj.owner, // expose the creator under the name the UI expects
          myRole: await resolveProjectRoleForUser(p, userId),
        };
      })
    );

    res.json(projectsWithRole);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET PROJECT TREE
// GET /api/projects/tree
// Nested folders → projects → subprojects, files → projects.
// Does not change GET /api/projects (still a flat list).
// ─────────────────────────────────────────────────────────────
const getProjectTree = async (req, res) => {
  try {
    const userId = req.user._id;
    const { organizationId, personal, workspaceId } = req.query;

    await backfillLegacyProjectWorkspaces(userId, {
      organizationId,
      personal,
    });

    const result = await buildProjectListFilter(userId, {
      organizationId,
      personal,
      workspaceId,
    });

    if (result.error) {
      return res
        .status(result.error.status)
        .json({ message: result.error.message });
    }

    const filter = {
      ...result.filter,
      isDeleted: { $ne: true },
      status: { $ne: "archived" },
    };

    const memberProjects = await Project.find(filter).select(
      "title folder workspaceFile parentProject order owner members organization"
    );

    const memberProjectIds = memberProjects.map((p) => String(p._id));

    // Per-project "can Edit this project" — reuses the same project:update
    // permission the PUT /:projectId route itself enforces, so the 3-dot
    // menu's Edit option only ever appears where the backend would also
    // accept the edit.
    const editableProjectIds = (
      await Promise.all(
        memberProjects.map(async (p) => {
          const permissions = await resolveEffectiveProjectPermissions(
            p,
            userId
          );
          return userHasProjectPermission(permissions, "project:update")
            ? String(p._id)
            : null;
        })
      )
    ).filter(Boolean);

    let canManageTree =
      personal === "true" || personal === true || !organizationId;
    if (!canManageTree && organizationId) {
      const organization = await Organization.findById(organizationId);
      if (organization) {
        ensureRoleDefinitions(organization);
        canManageTree = hasOrgPermissionForUser(
          organization,
          userId,
          "org:createProject"
        );
      }
    }

    let resolvedWorkspaceId = workspaceId || null;
    if (canManageTree) {
      try {
        const scope = await resolveContainerWorkspace(userId, {
          organizationId,
          workspaceId,
          personal,
        });
        resolvedWorkspaceId = scope.workspaceId;
      } catch {
        resolvedWorkspaceId = workspaceId || null;
      }
    }

    const { projects, folders } = await resolveProjectTreeDocuments(
      memberProjects,
      {
        workspaceId: resolvedWorkspaceId,
        includeAllWorkspaceFolders: canManageTree,
      }
    );

    const tree = buildProjectTree(folders, [], projects);
    res.json({
      ...pruneProjectTreeForViewer(tree, { keepEmptyFolders: canManageTree }),
      memberProjectIds,
      editableProjectIds,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET SINGLE PROJECT
// GET /api/projects/:projectId
// ─────────────────────────────────────────────────────────────
const getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .populate("owner", "username email avatarColor")
      .populate("members.user", "username email designation avatarColor")
      .populate("organization", "name");

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (project.isDeleted) {
      return res.status(404).json({ message: "Project is in trash" });
    }

    const userId = req.user._id;

    // Repair legacy projects that have owner but empty members array
    if (project.members.length === 0 && project.owner) {
      const ownerId = project.owner._id || project.owner;
      project.members.push({ user: ownerId, role: "owner" });
      await project.save();
    }

    if (!project.isMember(userId)) {
      const orgRole = await resolveProjectRoleForUser(project, userId);
      if (!orgRole) {
        return res.status(403).json({ message: "You are not a member of this project" });
      }
    }

    res.json({
      ...project.toObject(),
      createdBy: project.owner,
      myRole: await resolveProjectRoleForUser(project, userId),
      myPermissions: await resolveEffectiveProjectPermissions(project, userId),
      cardPreviewConfig: normalizeCardPreviewConfig(project.cardPreviewConfig),
      ...(await projectCustomFieldsPayload(project)),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const DEFAULT_TASK_STATUSES = ["todo", "in-progress", "review", "completed"];

function normalizeCustomStatuses(raw) {
  if (!Array.isArray(raw)) return null;

  const seen = new Set(DEFAULT_TASK_STATUSES);
  const normalized = [];

  for (const entry of raw) {
    const id = String(entry?.id || "").trim();
    const label = String(entry?.label || "").trim();
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    normalized.push({ id, label });
  }

  return normalized;
}

// PUT /api/projects/:projectId
// Requires project:update; custom status changes need status:add / status:delete
// ─────────────────────────────────────────────────────────────
const updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) return res.status(404).json({ message: "Project not found" });

    const userId = req.user._id;
    const permissions = await resolveEffectiveProjectPermissions(project, userId);

    const { title, description, status, customStatuses, cardPreviewConfig } = req.body;
    const updates = {};
    let newlyEnabledCustomFieldIds = [];

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;

    const { result: scheduleAndBudget, error: scheduleError } =
      parseScheduleAndBudget(req.body);
    if (scheduleError) {
      return res.status(400).json({ message: scheduleError });
    }

    if (scheduleAndBudget) {
      // Partial updates (e.g. only dueDate changes) must still be checked
      // against whichever date ISN'T being changed in this request.
      const effectiveStart =
        "startDate" in scheduleAndBudget
          ? scheduleAndBudget.startDate
          : project.startDate;
      const effectiveDue =
        "dueDate" in scheduleAndBudget ? scheduleAndBudget.dueDate : project.dueDate;

      if (effectiveStart && effectiveDue && effectiveDue < effectiveStart) {
        return res.status(400).json({
          message: "Due date cannot be earlier than start date.",
        });
      }

      Object.assign(updates, scheduleAndBudget);
    }

    if (cardPreviewConfig !== undefined) {
      const normalized = normalizeCardPreviewConfig(cardPreviewConfig);
      updates.cardPreviewConfig = normalized;
      const oldCustom = project.cardPreviewConfig?.customFields || {};
      newlyEnabledCustomFieldIds = Object.keys(normalized.customFields).filter(
        (fieldId) => normalized.customFields[fieldId] && !oldCustom[fieldId]
      );
    }

    if (customStatuses !== undefined) {
      const normalized = normalizeCustomStatuses(customStatuses);
      if (normalized === null) {
        return res.status(400).json({ message: "customStatuses must be an array" });
      }

      const previous = project.customStatuses || [];
      const added = normalized.filter(
        (entry) => !previous.some((row) => row.id === entry.id)
      );
      const removed = previous.filter(
        (entry) => !normalized.some((row) => row.id === entry.id)
      );

      if (
        added.length > 0 &&
        !userHasProjectPermission(permissions, "status:add")
      ) {
        return res.status(403).json({
          message: "Your role does not have permission: status:add",
        });
      }

      if (
        removed.length > 0 &&
        !userHasProjectPermission(permissions, "status:delete")
      ) {
        return res.status(403).json({
          message: "Your role does not have permission: status:delete",
        });
      }

      updates.customStatuses = normalized;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const updated = await Project.findByIdAndUpdate(
      req.params.projectId,
      updates,
      { new: true }
    );

    if (newlyEnabledCustomFieldIds.length > 0) {
      const grouped = await getProjectCustomFieldDefinitionsGrouped(updated);
      const allFields = [
        ...grouped.currentWorkspaceFields,
        ...grouped.otherWorkspaceFields,
      ];
      const byId = new Map(allFields.map((field) => [field.id, field]));
      for (const fieldId of newlyEnabledCustomFieldIds) {
        const definition = byId.get(fieldId);
        if (definition) {
          await adoptCustomFieldOnProject(updated, definition);
        }
      }
    }

    res.json({
      ...updated.toObject(),
      cardPreviewConfig: normalizeCardPreviewConfig(updated.cardPreviewConfig),
      ...(await projectCustomFieldsPayload(updated)),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// MOVE PROJECT TO TRASH
// PATCH /api/projects/:projectId/trash
// ─────────────────────────────────────────────────────────────
const moveProjectToTrash = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.isDeleted) {
      return res.status(400).json({ message: "Project is already in trash" });
    }

    const userId = req.user._id;
    const { trashed } = await moveProjectTreesToTrash([project._id], userId, {
      requireOwner: true,
      assertOwnership: true,
    });

    if (!trashed) {
      return res.status(400).json({ message: "Project is already in trash" });
    }

    res.json({ message: "Project moved to trash" });
  } catch (error) {
    if (error instanceof ProjectTrashError) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE PROJECT (permanent — use trash API for deleted items)
// DELETE /api/projects/:projectId
// ─────────────────────────────────────────────────────────────
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) return res.status(404).json({ message: "Project not found" });

    const userId = req.user._id;
    const role = project.getMemberRole(userId);

    if (role !== "owner") {
      return res.status(403).json({ message: "Only the project owner can delete it" });
    }

    if (!project.isDeleted) {
      return res.status(400).json({
        message: "Move the project to trash before permanent deletion",
      });
    }

    const tasks = await Task.find({ project: project._id });
    const fs = require("fs");
    const path = require("path");
    const { uploadsRoot } = require("../middleware/uploadMiddleware");

    for (const task of tasks) {
      const taskDir = path.join(uploadsRoot, task._id.toString());
      if (fs.existsSync(taskDir)) {
        fs.rmSync(taskDir, { recursive: true, force: true });
      }
    }

const taskIds = (
  await Task.find({ project: project._id }).select("_id")
).map((t) => t._id);

await CalendarEvent.deleteMany({
  taskRef: { $in: taskIds },
});

await Task.deleteMany({
  project: project._id,
});    

await Project.findByIdAndDelete(req.params.projectId);
    res.json({ message: "Project permanently deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// INVITE MEMBER
// POST /api/projects/:projectId/members
// Body: { email, role }  — role defaults to "member"
// Only owner or admin can invite
// ─────────────────────────────────────────────────────────────
const inviteMember = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId).populate(
      "organization",
      "name"
    );
    if (!project) return res.status(404).json({ message: "Project not found" });

    const inviterRole = project.getMemberRole(req.user._id);
    if (!["owner", "admin"].includes(inviterRole)) {
      return res.status(403).json({ message: "Only owner or admin can invite members" });
    }

    const { email, role: bodyRole = "member", orgRole } = req.body;
    const emailCheck = validateInviteEmail(email);
    if (!emailCheck.ok) {
      return res.status(400).json({ message: emailCheck.message });
    }

    let projectRole = bodyRole;
    let resolvedOrgRole = orgRole || null;

    if (orgRole && project.organization) {
      const orgId = project.organization._id || project.organization;
      const organization = await Organization.findById(orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      ensureRoleDefinitions(organization);
      const roleDef = getRoleDefinition(organization, orgRole);
      if (!roleDef) {
        return res.status(400).json({ message: "Invalid organization role" });
      }
      projectRole = orgRoleIdToProjectMemberRole(orgRole, roleDef);
    } else {
      if (!["admin", "member", "viewer"].includes(projectRole)) {
        return res.status(400).json({
          message: "Invalid role. Use: admin, member, or viewer",
        });
      }
      resolvedOrgRole = projectMemberRoleToOrgRoleId(projectRole);
    }

    const normalizedEmail = emailCheck.email;
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser && project.isMember(existingUser._id)) {
      return res.status(409).json({ message: "This user is already a project member" });
    }

    // Org-linked projects: only accepted organisation members may be invited.
    // Pending org invitees (and non-members) must join the organisation first.
    if (project.organization) {
      const orgId = project.organization._id || project.organization;
      const organization = await Organization.findById(orgId).populate(
        "members.user",
        "email username"
      );
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const isAcceptedOrgMember = organization.members.some((entry) => {
        const memberUser = entry.user;
        if (!memberUser) return false;
        if (existingUser && memberUser._id?.toString() === existingUser._id.toString()) {
          return true;
        }
        const memberEmail = normalizeEmail(memberUser.email || "");
        return memberEmail && memberEmail === normalizedEmail;
      });

      if (!isAcceptedOrgMember) {
        const pendingOrgInvite = await OrganizationInvitation.findOne({
          organization: orgId,
          email: normalizedEmail,
          status: "pending",
          expiresAt: { $gt: new Date() },
        }).lean();

        if (pendingOrgInvite) {
          return res.status(400).json({
            message:
              "This person has a pending organisation invitation. They must accept it before they can be invited to a project.",
          });
        }

        return res.status(400).json({
          message:
            "Only accepted organisation members can be invited to this project. Invite them to the organisation first.",
        });
      }
    }

    const pending = await ProjectInvitation.findOne({
      project: project._id,
      email: normalizedEmail,
      status: "pending",
      expiresAt: { $gt: new Date() },
    });

    if (pending) {
      return res.status(409).json({ message: "An invitation is already pending for this email" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const invitation = await ProjectInvitation.create({
      project: project._id,
      organization: project.organization?._id || project.organization || null,
      email: normalizedEmail,
      role: projectRole,
      orgRole: resolvedOrgRole,
      token,
      invitedBy: req.user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Always stay pending until the invitee accepts — they must not appear in
    // project members / assignee pickers until then.
    const frontendUrl = resolveFrontendUrl(req);
    const inviteUrl = `${frontendUrl}/invitations/project?token=${token}`;

    try {
      await sendProjectInviteEmail({
        to: normalizedEmail,
        projectName: project.title,
        orgName: project.organization?.name || null,
        role: projectRole,
        orgRole: resolvedOrgRole,
        inviteUrl,
        inviterName: req.user.username,
        alreadyAdded: false,
      });
    } catch (emailErr) {
      console.error("Project invite email failed:", emailErr.message);
    }

    res.status(201).json({
      message: `Invitation sent to ${normalizedEmail}. They must accept it before they can be assigned tasks.`,
      invitation: {
        _id: invitation._id,
        email: normalizedEmail,
        role: projectRole,
        orgRole: resolvedOrgRole,
        status: "pending",
        expiresAt: invitation.expiresAt,
        user: existingUser
          ? {
              _id: existingUser._id,
              username: existingUser.username,
              email: existingUser.email,
              avatarColor: existingUser.avatarColor,
            }
          : null,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const acceptProjectInvitation = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Invitation token is required" });
    }

    const invitation = await ProjectInvitation.findOne({ token }).populate(
      "project",
      "title organization members"
    );

    if (!invitation) {
      return res.status(404).json({ message: "Invalid or expired invitation" });
    }

    if (normalizeEmail(req.user.email) !== normalizeEmail(invitation.email)) {
      return res.status(403).json({
        message: `This invitation was sent to ${normalizeEmail(invitation.email)}. You are signed in as ${normalizeEmail(req.user.email)}. Sign in with the invited email, then open the link again.`,
        invitedEmail: normalizeEmail(invitation.email),
        signedInEmail: normalizeEmail(req.user.email),
      });
    }

    const project = await Project.findById(
      invitation.project._id || invitation.project
    );
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (invitation.status === "accepted") {
      if (project.isMember(req.user._id)) {
        return res.json({
          message: `You're already a member of "${project.title}"`,
          project: {
            _id: project._id,
            title: project.title,
            myRole: project.getMemberRole(req.user._id),
          },
        });
      }

      if (project.organization) {
        const orgId = project.organization._id || project.organization;
        const organization = await Organization.findById(orgId);
        if (!organization || !organization.isMember(req.user._id)) {
          return res.status(403).json({
            message:
              "You must be an accepted organisation member before joining this project. Accept your organisation invitation first.",
          });
        }
        const orgRole =
          invitation.orgRole ||
          projectMemberRoleToOrgRoleId(invitation.role);
        await syncOrgMembership(project, req.user._id, orgRole);
      }
      project.members.push({ user: req.user._id, role: invitation.role });
      await project.save();

      return res.json({
        message: `You joined project "${project.title}"`,
        project: {
          _id: project._id,
          title: project.title,
          myRole: project.getMemberRole(req.user._id),
        },
      });
    }

    if (invitation.status !== "pending") {
      return res.status(404).json({ message: "Invalid or expired invitation" });
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = "expired";
      await invitation.save();
      return res.status(410).json({ message: "This invitation has expired" });
    }

    if (project.organization) {
      const orgId = project.organization._id || project.organization;
      const organization = await Organization.findById(orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      if (!organization.isMember(req.user._id)) {
        return res.status(403).json({
          message:
            "You must be an accepted organisation member before joining this project. Accept your organisation invitation first.",
        });
      }
      const orgRole =
        invitation.orgRole ||
        projectMemberRoleToOrgRoleId(invitation.role);
      await syncOrgMembership(project, req.user._id, orgRole);
    }

    if (!project.isMember(req.user._id)) {
      project.members.push({ user: req.user._id, role: invitation.role });
      await project.save();
    }

    invitation.status = "accepted";
    await invitation.save();

    res.json({
      message: `You joined project "${project.title}"`,
      project: {
        _id: project._id,
        title: project.title,
        myRole: project.getMemberRole(req.user._id),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMyPendingProjectInvitations = async (req, res) => {
  try {
    const invitations = await ProjectInvitation.find({
      email: req.user.email.toLowerCase(),
      status: "pending",
      expiresAt: { $gt: new Date() },
    })
      .populate("project", "title")
      .populate("invitedBy", "username email");

    res.json(invitations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// REMOVE MEMBER
// DELETE /api/projects/:projectId/members/:memberId
// Only owner or admin can remove (cannot remove the owner)
// ─────────────────────────────────────────────────────────────
const removeMember = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const actorRole = project.getMemberRole(req.user._id);
    if (!["owner", "admin"].includes(actorRole)) {
      return res.status(403).json({ message: "Only owner or admin can remove members" });
    }

    const { memberId } = req.params;

    // Cannot remove the owner
    if (project.owner.toString() === memberId) {
      return res.status(403).json({ message: "Cannot remove the project owner" });
    }

    project.members = project.members.filter(
      (m) => {
        const uid = m.user?._id ? m.user._id.toString() : m.user?.toString();
        return uid !== memberId;
      }
    );
    await project.save();

    res.json({ message: "Member removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// CHANGE MEMBER ROLE
// PATCH /api/projects/:projectId/members/:memberId/role
// Body: { role }
// Only owner can change roles
// ─────────────────────────────────────────────────────────────
const changeMemberRole = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const actorRole = project.getMemberRole(req.user._id);
    if (actorRole !== "owner") {
      return res.status(403).json({ message: "Only the owner can change roles" });
    }

    const { memberId } = req.params;
    const { role } = req.body;

    if (!["admin", "member", "viewer"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (project.owner.toString() === memberId) {
      return res.status(403).json({ message: "Cannot change the owner's role" });
    }

    const member = project.members.find((m) => {
      const uid = m.user?._id ? m.user._id.toString() : m.user?.toString();
      return uid === memberId;
    });

    if (!member) return res.status(404).json({ message: "Member not found" });

    member.role = role;
    await project.save();

    res.json({ message: `Role updated to ${role}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET PROJECT MEMBERS
// GET /api/projects/:projectId/members
// ─────────────────────────────────────────────────────────────
const getProjectMembers = async (req, res) => {
  try {
    let project = await Project.findById(req.params.projectId)
      .populate("members.user", "username email designation department avatarColor")
      .populate("organization");

    if (!project) return res.status(404).json({ message: "Project not found" });

    if (project.members.length === 0 && project.owner) {
      const ownerId = project.owner._id || project.owner;
      project.members.push({ user: ownerId, role: "owner" });
      await project.save();
      await project.populate("members.user", "username email designation department avatarColor");
    }

    if (project.members.some((m) => !m.user?.username)) {
      await project.populate("members.user", "username email designation department avatarColor");
    }

    const accessRole = await resolveProjectRoleForUser(project, req.user._id);
    if (!accessRole) {
      return res.status(403).json({ message: "You are not a member of this project" });
    }

    const orgRoleByUserId = new Map();
    if (project.organization) {
      const orgId = project.organization._id || project.organization;
      const organization = await Organization.findById(orgId);
      if (organization) {
        for (const member of organization.members) {
          orgRoleByUserId.set(member.user.toString(), member.role);
        }
      }
    }

    const members = project.members
      .filter((member) => member.user)
      .map((member) => {
        const userId =
          member.user?._id?.toString() || member.user?.toString();
        return {
          user: member.user,
          role: member.role,
          orgRole:
            orgRoleByUserId.get(userId) ||
            projectMemberRoleToOrgRoleId(member.role),
        };
      });

    res.json(members);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/projects/:projectId/invitations — pending invites for this project
const getProjectInvitations = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const invitations = await ProjectInvitation.find({
      project: project._id,
      status: "pending",
      expiresAt: { $gt: new Date() },
    })
      .populate("invitedBy", "username email")
      .sort({ createdAt: -1 });

    const emails = invitations.map((inv) => inv.email);
    const users = await User.find({ email: { $in: emails } }).select(
      "username email avatarColor"
    );
    const userByEmail = new Map(
      users.map((user) => [normalizeEmail(user.email), user])
    );

    res.json(
      invitations.map((inv) => {
        const user = userByEmail.get(normalizeEmail(inv.email));
        return {
          _id: inv._id,
          email: inv.email,
          role: inv.role,
          orgRole: inv.orgRole || null,
          status: "pending",
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
          invitedBy: inv.invitedBy
            ? {
                _id: inv.invitedBy._id,
                username: inv.invitedBy.username,
                email: inv.invitedBy.email,
              }
            : null,
          user: user
            ? {
                _id: user._id,
                username: user.username,
                email: user.email,
                avatarColor: user.avatarColor,
              }
            : null,
        };
      })
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/projects/:projectId/invitations/:inviteId/resend
const resendProjectInvitation = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId).populate(
      "organization",
      "name"
    );
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const invitation = await ProjectInvitation.findOne({
      _id: req.params.inviteId,
      project: project._id,
    });

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (invitation.status === "accepted") {
      return res.status(400).json({ message: "This invitation has already been accepted" });
    }

    if (invitation.status === "revoked") {
      return res.status(400).json({ message: "This invitation was revoked" });
    }

    invitation.token = crypto.randomBytes(32).toString("hex");
    invitation.status = "pending";
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await invitation.save();

    const frontendUrl = resolveFrontendUrl(req);
    const inviteUrl = `${frontendUrl}/invitations/project?token=${invitation.token}`;

    try {
      await sendProjectInviteEmail({
        to: invitation.email,
        projectName: project.title,
        orgName: project.organization?.name || null,
        role: invitation.role,
        orgRole: invitation.orgRole || null,
        inviteUrl,
        inviterName: req.user.username,
        alreadyAdded: false,
      });
    } catch (emailErr) {
      console.error("Project invite resend email failed:", emailErr.message);
      return res.status(500).json({ message: "Failed to send invitation email" });
    }

    res.json({
      message: `Invitation resent to ${invitation.email}`,
      invitation: {
        _id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        orgRole: invitation.orgRole || null,
        status: "pending",
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createCustomField = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const {
      name,
      type,
      options,
      description,
      organizationIds,
      includePersonal,
      spaceType,
      spaceId,
      workspaceId,
      numberConfig,
      permissions,
      scope,
    } = req.body || {};
    const definition = await createWorkspaceCustomField(project, {
      name,
      type,
      options,
      description,
      organizationIds,
      includePersonal,
      spaceType,
      spaceId,
      workspaceId,
      numberConfig,
      permissions,
      scope,
      actorUserId: req.user._id,
    });
    await adoptCustomFieldOnProject(project, definition);

    res.status(201).json({
      field: definition,
      ...(await projectCustomFieldsPayload(project)),
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteCustomField = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const fieldId = req.params.fieldId;
    await deleteWorkspaceCustomField(project, fieldId, req.user._id);

    project.adoptedCustomFieldIds = (project.adoptedCustomFieldIds || []).filter(
      (id) => id !== fieldId
    );
    if (project.cardPreviewConfig?.customFields?.[fieldId] !== undefined) {
      const nextCustomFields = { ...(project.cardPreviewConfig.customFields || {}) };
      delete nextCustomFields[fieldId];
      project.cardPreviewConfig.customFields = nextCustomFields;
    }
    await project.save();

    await Task.updateMany(
      { project: project._id },
      { $pull: { customFieldValues: { fieldId } } }
    );

    res.json({
      message: "Custom field deleted",
      ...(await projectCustomFieldsPayload(project)),
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectTree,
  getProject,
  updateProject,
  deleteProject,
  moveProjectToTrash,
  inviteMember,
  acceptProjectInvitation,
  getMyPendingProjectInvitations,
  getProjectInvitations,
  resendProjectInvitation,
  removeMember,
  changeMemberRole,
  getProjectMembers,
  createCustomField,
  deleteCustomField,
};