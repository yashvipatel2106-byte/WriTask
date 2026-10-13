const crypto = require("crypto");
const Organization = require("../models/Organization");
const OrganizationInvitation = require("../models/OrganizationInvitation");
const User = require("../models/user");
const {
  getDefaultRoleDefinitions,
  ensureRoleDefinitions,
  getRoleDefinition,
  resolveMemberOrgPermissions,
  resolveMemberProjectPermissions,
  hasOrgPermissionForUser,
  slugifyRoleId,
} = require("../utils/roleDefinitions");
const workerManager = require("../workers/workerManager");
const { isValidDepartment } = require("../config/departments");
const Project = require("../models/Project");
const Task = require("../models/Task");
const CalendarEvent = require("../models/Calendarevent");
const {
  normalizeEmail,
  resolveFrontendUrl,
} = require("../utils/frontendUrl");
const { validateInviteEmail } = require("../utils/emailValidation");

const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const uniqueSlug = async (name) => {
  let slug = slugify(name);
  let suffix = 0;
  while (await Organization.findOne({ slug: suffix ? `${slug}-${suffix}` : slug })) {
    suffix += 1;
  }
  return suffix ? `${slug}-${suffix}` : slug;
};

// POST /api/organizations — personal workspace users only (no org membership yet)
const createOrganization = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Organization name is required" });
    }

    const userId = req.user._id;

    
    const slug = await uniqueSlug(name);

    const organization = await Organization.create({
      name,
      slug,
      description: description || "",
      owner: userId,
      members: [{ user: userId, role: "owner" }],
      roleDefinitions: getDefaultRoleDefinitions(),
    });

    await User.findByIdAndUpdate(userId, { designation: "admin" });

    res.status(201).json({
      ...organization.toObject(),
      myRole: "owner",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/organizations — orgs the current user belongs to
const getMyOrganizations = async (req, res) => {
  try {
    const userId = req.user._id;
    const organizations = await Organization.find({
      "members.user": userId,
      isDeleted: { $ne: true },
    }).populate("owner", "username email avatarColor");

    const result = organizations.map((org) => ({
      ...org.toObject(),
      myRole: org.getMemberRole(userId),
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/organizations/:orgId
const getOrganization = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.orgId)
      .populate("owner", "username email avatarColor")
      .populate("members.user", "username email designation avatarColor");

    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    if (organization.isDeleted) {
      return res.status(404).json({ message: "Organization is in trash" });
    }

    const userId = req.user._id;
    if (!organization.isMember(userId)) {
      return res.status(403).json({ message: "You are not a member of this organization" });
    }

    res.json({
      ...organization.toObject(),
      myRole: organization.getMemberRole(userId),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/organizations/:orgId/members
const getOrganizationMembers = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.orgId).populate(
      "members.user",
      "username email designation department avatarColor"
    );

    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    if (!organization.isMember(req.user._id)) {
      return res.status(403).json({ message: "You are not a member of this organization" });
    }

    // A membership entry whose user was deleted elsewhere (without going
    // through the cleanup in deleteAccount) populates as null — drop it
    // rather than serving an unrenderable ghost member.
    const members = organization.members.filter((member) => member.user);

    res.json(members);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/organizations/:orgId/invite — invite by email with role
const inviteToOrganization = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.orgId);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const actorId = req.user._id.toString();
    if (!hasOrgPermissionForUser(organization, actorId, "org:invite")) {
      return res.status(403).json({ message: "You cannot invite members to this organization" });
    }

    const { email, role = "developer", department } = req.body;
    const emailCheck = validateInviteEmail(email);
    if (!emailCheck.ok) {
      return res.status(400).json({ message: emailCheck.message });
    }

    if (!department || !isValidDepartment(department)) {
      return res.status(400).json({
        message: "Valid department is required",
      });
    }

    ensureRoleDefinitions(organization);
    if (!getRoleDefinition(organization, role) || role === "owner") {
      return res.status(400).json({ message: "Invalid role" });
    }

    const normalizedEmail = emailCheck.email;
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser && organization.isMember(existingUser._id)) {
      return res.status(409).json({ message: "This user is already a member" });
    }

    const pendingInvite = await OrganizationInvitation.findOne({
      organization: organization._id,
      email: normalizedEmail,
      status: "pending",
      expiresAt: { $gt: new Date() },
    });

    if (pendingInvite) {
      return res.status(409).json({ message: "An invitation is already pending for this email" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const invitation = await OrganizationInvitation.create({
      organization: organization._id,
      email: normalizedEmail,
      role,
      department,
      token,
      invitedBy: req.user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const frontendUrl = resolveFrontendUrl(req);
    const inviteUrl = `${frontendUrl}/invitations/accept?token=${token}`;

    workerManager
  .run("emailWorker.js", {
    type: "ORG_INVITE",
    data: {
      to: normalizedEmail,
      orgName: organization.name,
      role,
      inviteUrl,
      inviterName: req.user.username,
    },
  })
  .then((result) => {
    console.log(" Organization Invite Worker:", result);
  })
  .catch((err) => {
    console.error(" Organization Invite Worker:", err);
  });

    if (existingUser) {
      return res.status(201).json({
        message: `Invitation sent to ${normalizedEmail}`,
        invitation: {
          _id: invitation._id,
          email: normalizedEmail,
          role,
          department,
          status: "pending",
        },
      });
    }

    res.status(201).json({
      message: `Invitation sent to ${normalizedEmail}. They must register with this email to join.`,
      invitation: {
        _id: invitation._id,
        email: normalizedEmail,
        role,
        department,
        status: "pending",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function queueOrgInviteEmail({ to, orgName, role, inviteUrl, inviterName }) {
  return workerManager
    .run("emailWorker.js", {
      type: "ORG_INVITE",
      data: { to, orgName, role, inviteUrl, inviterName },
    })
    .then((result) => {
      console.log(" Organization Invite Worker:", result);
    })
    .catch((err) => {
      console.error(" Organization Invite Worker:", err);
    });
}

// GET /api/organizations/:orgId/invitations — pending invites for this org
const getOrganizationInvitations = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.orgId);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    if (!organization.isMember(req.user._id)) {
      return res.status(403).json({ message: "You are not a member of this organization" });
    }

    const invitations = await OrganizationInvitation.find({
      organization: organization._id,
      status: "pending",
      expiresAt: { $gt: new Date() },
    })
      .populate("invitedBy", "username email")
      .sort({ createdAt: -1 });

    const emails = invitations.map((inv) => inv.email);
    const users = await User.find({ email: { $in: emails } }).select(
      "username email avatarColor designation department"
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
          department: inv.department || "",
          status: "pending",
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
          invitedBy: inv.invitedBy
            ? { _id: inv.invitedBy._id, username: inv.invitedBy.username, email: inv.invitedBy.email }
            : null,
          user: user
            ? {
                _id: user._id,
                username: user.username,
                email: user.email,
                avatarColor: user.avatarColor,
                designation: user.designation,
                department: user.department,
              }
            : null,
        };
      })
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/organizations/:orgId/invitations/:inviteId/resend
const resendOrganizationInvitation = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.orgId);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const actorId = req.user._id.toString();
    if (!hasOrgPermissionForUser(organization, actorId, "org:invite")) {
      return res.status(403).json({ message: "You cannot resend invitations for this organization" });
    }

    const invitation = await OrganizationInvitation.findOne({
      _id: req.params.inviteId,
      organization: organization._id,
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

    // Refresh token + expiry so the new email link always works
    invitation.token = crypto.randomBytes(32).toString("hex");
    invitation.status = "pending";
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await invitation.save();

    const frontendUrl = resolveFrontendUrl(req);
    const inviteUrl = `${frontendUrl}/invitations/accept?token=${invitation.token}`;

    queueOrgInviteEmail({
      to: invitation.email,
      orgName: organization.name,
      role: invitation.role,
      inviteUrl,
      inviterName: req.user.username,
    });

    res.json({
      message: `Invitation resent to ${invitation.email}`,
      invitation: {
        _id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        status: "pending",
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/organizations/invitations/accept
const acceptInvitation = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Invitation token is required" });
    }

    const invitation = await OrganizationInvitation.findOne({ token }).populate(
      "organization",
      "name slug members"
    );

    if (!invitation || invitation.status !== "pending") {
      return res.status(404).json({ message: "Invalid or expired invitation" });
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = "expired";
      await invitation.save();
      return res.status(410).json({ message: "This invitation has expired" });
    }

    const userEmail = normalizeEmail(req.user.email);
    const invitedEmail = normalizeEmail(invitation.email);
    if (userEmail !== invitedEmail) {
      return res.status(403).json({
        message: ` Sign in with the invited email, then open the link again.`,
        invitedEmail,
        signedInEmail: userEmail,
      });
    }

    const organization = await Organization.findById(invitation.organization._id);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    if (organization.isMember(req.user._id)) {
      invitation.status = "accepted";
      await invitation.save();
      return res.json({
        message: "You are already a member",
        organization: {
          _id: organization._id,
          name: organization.name,
          slug: organization.slug,
        },
      });
    }

    organization.members.push({
      user: req.user._id,
      role: invitation.role,
      department: invitation.department || "",
    });
    await organization.save();

    if (invitation.department) {
      await User.findByIdAndUpdate(req.user._id, {
        department: invitation.department,
      });
    }

    invitation.status = "accepted";
    await invitation.save();

    res.json({
      message: `You joined ${organization.name} as ${invitation.role}`,
      organization: {
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        myRole: invitation.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/organizations/invitations/pending — my pending invites
const getMyPendingInvitations = async (req, res) => {
  try {
    const invitations = await OrganizationInvitation.find({
      email: req.user.email.toLowerCase(),
      status: "pending",
      expiresAt: { $gt: new Date() },
    }).populate("organization", "name slug").populate("invitedBy", "username email");

    res.json(invitations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/organizations/:orgId/members/:memberId
const removeOrganizationMember = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.orgId);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const actorId = req.user._id.toString();
    if (!hasOrgPermissionForUser(organization, actorId, "org:removeMember")) {
      return res.status(403).json({ message: "You cannot remove members" });
    }

    const { memberId } = req.params;
    if (organization.owner.toString() === memberId) {
      return res.status(403).json({ message: "Cannot remove the organization owner" });
    }

    organization.members = organization.members.filter(
      (m) => m.user.toString() !== memberId
    );
    await organization.save();

    res.json({ message: "Member removed from organization" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/organizations/:orgId/members/:memberId/account
// Permanently deletes the target member's User account entirely — not just
// their membership in this org. Restricted to the organization owner; mirrors
// the cleanup profileController.deleteAccount does for self-service deletion.
const deleteOrganizationMemberAccount = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.orgId);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const actorId = req.user._id.toString();
    if (organization.owner.toString() !== actorId) {
      return res.status(403).json({
        message: "Only the organization owner can delete a member's account",
      });
    }

    const { memberId } = req.params;

    if (memberId === actorId) {
      return res.status(400).json({
        message: "Use account settings to delete your own account",
      });
    }

    if (organization.owner.toString() === memberId) {
      return res.status(403).json({ message: "Cannot delete the organization owner's account" });
    }

    if (!organization.isMember(memberId)) {
      return res.status(404).json({ message: "This user is not a member of this organization" });
    }

    const targetUser = await User.findById(memberId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    await Project.updateMany({}, { $pull: { members: { user: memberId } } });
    await Organization.updateMany({}, { $pull: { members: { user: memberId } } });
    await User.findByIdAndDelete(memberId);

    res.json({ message: `${targetUser.username}'s account was permanently deleted` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/organizations/:orgId/members/:memberId/role
const changeOrganizationMemberRole = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.orgId);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    ensureRoleDefinitions(organization);

    const actorId = req.user._id.toString();
    if (!hasOrgPermissionForUser(organization, actorId, "org:changeRole")) {
      return res.status(403).json({ message: "You cannot change member roles" });
    }

    const { memberId } = req.params;
    const {
      role,
      useCustomPermissions,
      orgPermissions,
      projectPermissions,
    } = req.body;

    if (!role) {
      return res.status(400).json({ message: "Role is required" });
    }

    if (!getRoleDefinition(organization, role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (organization.owner.toString() === memberId) {
      return res.status(403).json({ message: "Cannot change the owner's role" });
    }

    const member = organization.members.find(
      (m) => m.user.toString() === memberId
    );
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    if (role === "owner") {
      return res.status(403).json({ message: "Cannot assign owner role" });
    }

    member.role = role;

    if (useCustomPermissions === true) {
      member.permissionOverrides = {
        useCustom: true,
        orgPermissions: Array.isArray(orgPermissions) ? orgPermissions : [],
        projectPermissions: Array.isArray(projectPermissions)
          ? projectPermissions
          : [],
      };
    } else if (useCustomPermissions === false) {
      member.permissionOverrides = {
        useCustom: false,
        orgPermissions: [],
        projectPermissions: [],
      };
    }

    await organization.save();

    res.json({
      message: `Role updated to ${role}`,
      member: {
        user: member.user,
        role: member.role,
        permissionOverrides: member.permissionOverrides,
        orgPermissions: resolveMemberOrgPermissions(organization, memberId),
        projectPermissions: resolveMemberProjectPermissions(
          organization,
          memberId
        ),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getOrganizationRoles = async (req, res) => {
  try {
    const organization = req.organization;
    ensureRoleDefinitions(organization);
    if (organization.isModified("roleDefinitions")) {
      await organization.save();
    }
    res.json(organization.roleDefinitions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateOrganizationRole = async (req, res) => {
  try {
    const organization = req.organization;
    ensureRoleDefinitions(organization);

    const { roleId } = req.params;
    const { name, orgPermissions, projectPermissions } = req.body;
    const roleDef = getRoleDefinition(organization, roleId);

    if (!roleDef) {
      return res.status(404).json({ message: "Role not found" });
    }

    if (name?.trim()) roleDef.name = name.trim();
    if (Array.isArray(orgPermissions)) roleDef.orgPermissions = orgPermissions;
    if (Array.isArray(projectPermissions)) {
      roleDef.projectPermissions = projectPermissions;
    }

    organization.markModified("roleDefinitions");
    await organization.save();

    res.json(roleDef);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createOrganizationRole = async (req, res) => {
  try {
    const organization = req.organization;
    ensureRoleDefinitions(organization);

    const { name, orgPermissions = [], projectPermissions = [] } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: "Role name is required" });
    }

    const reserved = organization.roleDefinitions.map((role) => role.id);
    const id = slugifyRoleId(name, reserved);
    const maxLevel = Math.max(
      ...organization.roleDefinitions.map((role) => role.level || 1),
      1
    );

    const roleDef = {
      id,
      name: name.trim(),
      isBuiltin: false,
      level: maxLevel,
      orgPermissions: Array.isArray(orgPermissions) ? orgPermissions : [],
      projectPermissions: Array.isArray(projectPermissions)
        ? projectPermissions
        : [],
    };

    organization.roleDefinitions.push(roleDef);
    await organization.save();

    res.status(201).json(roleDef);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteOrganizationRole = async (req, res) => {
  try {
    const organization = req.organization;
    ensureRoleDefinitions(organization);

    const { roleId } = req.params;
    const roleDef = getRoleDefinition(organization, roleId);

    if (!roleDef) {
      return res.status(404).json({ message: "Role not found" });
    }

    if (roleDef.isBuiltin) {
      return res.status(400).json({ message: "Built-in roles cannot be deleted" });
    }

    const membersUsingRole = organization.members.filter(
      (member) => member.role === roleId
    );

    if (membersUsingRole.length > 0) {
      return res.status(400).json({
        message: `Cannot delete role while ${membersUsingRole.length} member(s) still use it`,
      });
    }

    organization.roleDefinitions = organization.roleDefinitions.filter(
      (role) => role.id !== roleId
    );
    await organization.save();

    res.json({ message: "Role deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/organizations/me/access — current user's org access summary for frontend
const getMyAccess = async (req, res) => {
  try {
    const userId = req.user._id;
    const organizations = await Organization.find({
      "members.user": userId,
      isDeleted: { $ne: true },
    });

    const orgMemberships = organizations.map((org) => {
      ensureRoleDefinitions(org);
      return {
        organizationId: org._id,
        name: org.name,
        slug: org.slug,
        role: org.getMemberRole(userId),
        orgPermissions: resolveMemberOrgPermissions(org, userId),
        projectPermissions: resolveMemberProjectPermissions(org, userId),
      };
    });

    const pendingInvitations = (
      await OrganizationInvitation.find({
        email: req.user.email.toLowerCase(),
        status: "pending",
        expiresAt: { $gt: new Date() },
      }).populate("organization", "name slug")
    ).filter((invite) => invite.organization);

    res.json({
      hasOrgMembership: orgMemberships.length > 0,
      organizations: orgMemberships,
      pendingInvitations,
      // Users with no org memberships keep full personal workspace permissions
      personalWorkspace: orgMemberships.length === 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Trash an organization
const moveOrganizationToTrash = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.orgId);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    if (organization.isDeleted) {
      return res.status(400).json({
        message: "Organization is already in trash",
      });
    }

    const userId = req.user._id;
    const role = organization.getMemberRole(userId);

    if (
      role !== "owner" &&
      organization.owner.toString() !== userId.toString()
    ) {
      return res.status(403).json({
        message: "Only the organization owner can move it to trash",
      });
    }

    const deletedAt = new Date();

    // Move organization to trash
    organization.isDeleted = true;
    organization.deletedAt = deletedAt;
    await organization.save();

    // Move all projects to trash
    await Project.updateMany(
      {
        organization: organization._id,
        isDeleted: { $ne: true },
      },
      {
        isDeleted: true,
        deletedAt,
      }
    );

    // Move all tasks to trash + inactive
    await Task.updateMany(
      {
        organization: organization._id,
        isDeleted: { $ne: true },
      },
      {
        isDeleted: true,
        isActive: false,
        deletedAt,
      }
    );

    // Remove related calendar events
    const taskIds = (
      await Task.find({
        organization: organization._id,
      }).select("_id")
    ).map((task) => task._id);

    await CalendarEvent.deleteMany({
      taskRef: {
        $in: taskIds,
      },
    });

    return res.json({
      message: "Organization moved to trash successfully",
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

    
  module.exports = {
  createOrganization,
  getMyOrganizations,
  getOrganization,
  getOrganizationMembers,
  inviteToOrganization,
  getOrganizationInvitations,
  resendOrganizationInvitation,
  acceptInvitation,
  getMyPendingInvitations,
  removeOrganizationMember,
  deleteOrganizationMemberAccount,
  changeOrganizationMemberRole,
  getOrganizationRoles,
  updateOrganizationRole,
  createOrganizationRole,
  deleteOrganizationRole,
  getMyAccess,
  moveOrganizationToTrash,
};
