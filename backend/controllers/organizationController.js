const crypto = require("crypto");
const fs = require("fs");
const { passwordPolicyError } = require("../utils/passwordPolicy");

// Invitation tokens are stored only as this hash (never the raw value); the
// raw token lives only in the emailed URL and in the API request/response
// at creation time, same shape as the OrganizationInvitation.token string
// field so no schema/migration change is needed.
function hashInviteToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

const Organization = require("../models/Organization");
const {
  ensureOrganizationHolidays,
} = require("../services/holidayService");
const { orgLogoPath, deleteOrgLogoFiles, mimeFromUpload } = require("../middleware/uploadOrgLogo");
const {
  findMembership,
  verifyOrgMembershipPassword,
  hashOrgPassword,
  stripMemberPasswords,
} = require("../utils/orgMembershipAuth");
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
const { normalizeHoursPerDay } = require("../utils/workHours");


const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const uniqueSlug = async (name, excludeId) => {
  let slug = slugify(name);
  let suffix = 0;
  while (
    await Organization.findOne({
      slug: suffix ? `${slug}-${suffix}` : slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    suffix += 1;
  }
  return suffix ? `${slug}-${suffix}` : slug;
};

function orgPublicFields(organization, userId) {
  const obj = stripMemberPasswords(organization);
  return {
    ...obj,
    myRole: organization.getMemberRole(userId),
    hasLogo: Boolean(organization.logo?.filename),
  };
}

// POST /api/organizations — personal workspace users only (no org membership yet)
const createOrganization = async (req, res) => {
  try {
    const { name, description, password } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Organization name is required" });
    }

    const userId = req.user._id;
    const slug = await uniqueSlug(name);

    // Prefer an explicit org password; otherwise reuse the account password hash
    // so existing owners keep working after org-wise auth.
    let membershipPassword = null;
    if (typeof password === "string" && password.trim().length >= 6) {
      membershipPassword = await hashOrgPassword(password.trim());
    } else if (req.user.password) {
      membershipPassword = req.user.password;
    }

    const organization = await Organization.create({
      name,
      slug,
      description: description || "",
      owner: userId,
      members: [
        {
          user: userId,
          role: "owner",
          password: membershipPassword,
        },
      ],
      roleDefinitions: getDefaultRoleDefinitions(),
    });

    await ensureOrganizationHolidays(
  organization._id
);

    await User.findByIdAndUpdate(userId, { designation: "admin" });

    try {
      const { ensureOrgBuiltinWorkspaces, ensurePersonalWorkspace } = require("../utils/workspaces");
      await ensurePersonalWorkspace(userId);
      await ensureOrgBuiltinWorkspaces(organization._id, userId);
    } catch (wsErr) {
      console.error("Workspace bootstrap failed:", wsErr.message);
    }

    res.status(201).json({
      ...stripMemberPasswords(organization),
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
      $or: [{ owner: userId }, { "members.user": userId }],
      isDeleted: { $ne: true },
    }).populate("owner", "username email avatarColor");

    const result = organizations.map((org) => orgPublicFields(org, userId));

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

    res.json(orgPublicFields(organization, userId));
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
    const members = organization.members
      .filter((member) => member.user)
      .map((member) => {
        const obj = typeof member.toObject === "function" ? member.toObject() : { ...member };
        delete obj.password;
        return obj;
      });

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
      token: hashInviteToken(token),
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
      message: `Invitation sent to ${normalizedEmail}. They'll set a password from the invite link to join.`,
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
    const freshToken = crypto.randomBytes(32).toString("hex");
    invitation.token = hashInviteToken(freshToken);
    invitation.status = "pending";
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await invitation.save();

    const frontendUrl = resolveFrontendUrl(req);
    const inviteUrl = `${frontendUrl}/invitations/accept?token=${freshToken}`;

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

// GET /api/organizations/invitations/token/:token — public, no auth.
// Lets the frontend show who/what org is being joined and detect an
// expired/revoked/already-used/invalid link before asking for a password.
const previewInvitation = async (req, res) => {
  try {
    const token = req.params.token;
    if (!token) {
      return res.status(400).json({ valid: false, message: "Invitation token is required" });
    }

    const invitation = await OrganizationInvitation.findOne({
      token: hashInviteToken(token),
    }).populate("organization", "name slug");

    if (!invitation) {
      return res.status(404).json({ valid: false, message: "Invalid invitation link" });
    }

    if (invitation.status === "accepted") {
      return res.status(409).json({ valid: false, message: "This invitation has already been used" });
    }
    if (invitation.status === "revoked") {
      return res.status(410).json({ valid: false, message: "This invitation was revoked" });
    }
    if (invitation.status !== "pending" || invitation.expiresAt < new Date()) {
      if (invitation.status === "pending") {
        invitation.status = "expired";
        await invitation.save();
      }
      return res.status(410).json({ valid: false, message: "This invitation has expired" });
    }

    const existingUser = await User.findOne({ email: invitation.email }).select("_id");

    res.json({
      valid: true,
      email: invitation.email,
      organizationName: invitation.organization?.name || "",
      role: invitation.role,
      department: invitation.department || "",
      hasExistingAccount: Boolean(existingUser),
    });
  } catch (error) {
    res.status(500).json({ valid: false, message: error.message });
  }
};

// POST /api/organizations/invitations/accept
//
// Reachable both signed in (req.user set by optionalAuthMiddleware) and
// signed out — a brand-new invitee has no account yet, so this can't sit
// behind the organization router's blanket authMiddleware. See
// routes/organizationRoutes.js for where this is mounted.
const acceptInvitation = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Invitation token is required" });
    }

    const weakPassword = passwordPolicyError(password);
    if (weakPassword) {
      return res.status(400).json({ message: weakPassword });
    }

    const invitation = await OrganizationInvitation.findOne({
      token: hashInviteToken(token),
    }).populate("organization", "name slug members");

    if (!invitation) {
      return res.status(404).json({ message: "Invalid or expired invitation" });
    }
    if (invitation.status === "accepted") {
      return res.status(409).json({ message: "This invitation has already been used" });
    }
    if (invitation.status === "revoked") {
      return res.status(410).json({ message: "This invitation was revoked" });
    }
    if (invitation.status !== "pending" || invitation.expiresAt < new Date()) {
      if (invitation.status === "pending") {
        invitation.status = "expired";
        await invitation.save();
      }
      return res.status(410).json({ message: "This invitation has expired" });
    }

    // Already signed in: must be signed in as the exact invited email —
    // never let a different logged-in account claim someone else's invite.
    if (req.user) {
      const userEmail = normalizeEmail(req.user.email);
      const invitedEmail = normalizeEmail(invitation.email);
      if (userEmail !== invitedEmail) {
        return res.status(403).json({
          message: "Sign in with the invited email, then open the link again.",
          invitedEmail,
          signedInEmail: userEmail,
        });
      }
    }

    const organization = await Organization.findById(invitation.organization._id);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    // Resolve the account this invitation is for: the signed-in user, an
    // existing account with the invited email, or (brand-new invitee) a
    // freshly created one. Role/department always come from the validated
    // invitation document below — never from the request body.
    let user = req.user || (await User.findOne({ email: invitation.email }));

    if (user && organization.isMember(user._id)) {
      const claimed = await OrganizationInvitation.findOneAndUpdate(
        { _id: invitation._id, status: "pending" },
        { $set: { status: "accepted" } }
      );
      if (!claimed) {
        return res.status(409).json({ message: "This invitation has already been used" });
      }
      return res.json({
        message: "You are already a member",
        organization: { _id: organization._id, name: organization.name, slug: organization.slug },
        requiresLogin: !req.user,
        email: invitation.email,
      });
    }

    let createdNewUser = false;
    if (!user) {
      const localPart = invitation.email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "") || "user";
      user = await User.create({
        username: localPart,
        email: invitation.email,
        verified: true,
      });
      createdNewUser = true;
    }

    // Single-use claim: only the first request to reach here for this
    // invitation flips it to accepted, so a double-click or page refresh
    // can't join the same invite twice.
    const claimed = await OrganizationInvitation.findOneAndUpdate(
      { _id: invitation._id, status: "pending" },
      { $set: { status: "accepted" } }
    );
    if (!claimed) {
      if (createdNewUser) {
        await User.deleteOne({ _id: user._id });
      }
      return res.status(409).json({ message: "This invitation has already been used" });
    }

    const membershipPassword = await hashOrgPassword(String(password).trim());
    organization.members.push({
      user: user._id,
      role: invitation.role,
      department: invitation.department || "",
      password: membershipPassword,
    });
    await organization.save();

    if (invitation.department) {
      await User.findByIdAndUpdate(user._id, { department: invitation.department });
    }

    res.json({
      message: `You joined ${organization.name} as ${invitation.role}. Log in with ${invitation.email} and the password you just created.`,
      organization: {
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        myRole: invitation.role,
      },
      requiresLogin: !req.user,
      email: invitation.email,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/organizations/:orgId/switch — password-gated org switch
const switchOrganization = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.orgId);
    if (!organization || organization.isDeleted) {
      return res.status(404).json({ message: "Organization not found" });
    }

    if (!organization.isMember(req.user._id)) {
      return res.status(403).json({
        message: "You are not a member of this organization",
      });
    }

    const { password } = req.body;
    if (!password || !String(password).trim()) {
      return res.status(400).json({ message: "Password is required" });
    }

    const valid = await verifyOrgMembershipPassword({
      organization,
      user: req.user,
      password: String(password).trim(),
      backfill: true,
    });

    if (!valid) {
      return res.status(400).json({
        message: `Invalid password for ${organization.name}`,
      });
    }

    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      {
        id: req.user._id,
        organizationId: organization._id.toString(),
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const member = findMembership(organization, req.user._id);

    return res.json({
      message: "Organization switched",
      token,
      organizationId: organization._id.toString(),
      organization: {
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        myRole: member?.role || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
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

// PATCH /api/organizations/:orgId — name, description, optional logo
const updateOrganization = async (req, res) => {
  try {
    const organization = req.organization;
    const name =
      typeof req.body.name === "string" ? req.body.name.trim() : undefined;
    const description =
      typeof req.body.description === "string" ? req.body.description : undefined;
    const removeLogo =
      req.body.removeLogo === "true" || req.body.removeLogo === true;

    if (name !== undefined) {
      if (!name) {
        return res.status(400).json({ message: "Organization name is required" });
      }
      if (name !== organization.name) {
        organization.name = name;
        organization.slug = await uniqueSlug(name, organization._id);
      }
    }

    if (description !== undefined) {
      organization.description = description.trim();
    }

    if (req.file) {
      const previous = organization.logo?.filename;
      if (previous && previous !== req.file.filename) {
        const previousPath = orgLogoPath(organization._id, previous);
        if (fs.existsSync(previousPath)) fs.unlinkSync(previousPath);
      }
      organization.logo = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: mimeFromUpload(req.file),
        updatedAt: new Date(),
      };
      organization.markModified("logo");
    } else if (removeLogo) {
      deleteOrgLogoFiles(organization._id);
      organization.logo = undefined;
      organization.markModified("logo");
    }

    await organization.save();

    res.json({
      _id: organization._id,
      name: organization.name,
      slug: organization.slug,
      description: organization.description || "",
      hoursPerDay: normalizeHoursPerDay(organization.hoursPerDay),
      hasLogo: Boolean(organization.logo?.filename),
      logoUpdatedAt: organization.logo?.updatedAt || null,
      myRole: organization.getMemberRole(req.user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/organizations/:orgId/logo
const getOrganizationLogo = async (req, res) => {
  try {
    const organization = req.organization;
    const filename = organization.logo?.filename;
    if (!filename) {
      return res.status(404).json({ message: "No organization logo set" });
    }

    const filePath = orgLogoPath(organization._id, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Logo file not found" });
    }

    const ext = require("path").extname(filename).toLowerCase();
    const mimeByExt = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };
    res.setHeader(
      "Content-Type",
      organization.logo.mimeType || mimeByExt[ext] || "image/png"
    );
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateOrganizationWorkHours = async (req, res) => {
  try {
    const organization = req.organization;
    const raw = Number(req.body.hoursPerDay);
    if (!Number.isFinite(raw) || raw < 1 || raw > 24) {
      return res.status(400).json({
        message: "Daily hours must be a number between 1 and 24",
      });
    }

    organization.hoursPerDay = normalizeHoursPerDay(raw);
    await organization.save();

    res.json({
      hoursPerDay: organization.hoursPerDay,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/organizations/me/access — current user's org access summary for frontend
const getMyAccess = async (req, res) => {
  try {
    const userId = req.user._id;
    const organizations = await Organization.find({
      $or: [{ owner: userId }, { "members.user": userId }],
      isDeleted: { $ne: true },
    });

    const orgMemberships = organizations.map((org) => {
      ensureRoleDefinitions(org);
      return {
        organizationId: org._id,
        name: org.name,
        slug: org.slug,
        description: org.description || "",
        role: org.getMemberRole(userId),
        hasLogo: Boolean(org.logo?.filename),
        logoUpdatedAt: org.logo?.updatedAt || null,
        orgPermissions: resolveMemberOrgPermissions(org, userId),
        projectPermissions: resolveMemberProjectPermissions(org, userId),
        hoursPerDay: normalizeHoursPerDay(org.hoursPerDay),
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
      // Personal Workspace is always available alongside any org memberships.
      personalWorkspace: true,
      workspaceType:
        req.activeOrganizationId &&
        orgMemberships.some(
          (o) => String(o.organizationId) === String(req.activeOrganizationId)
        )
          ? "organization"
          : "personal",
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

    try {
      const Workspace = require("../models/Workspace");
      await Workspace.updateMany(
        { organization: organization._id, isDeleted: { $ne: true } },
        { isDeleted: true }
      );
    } catch (wsErr) {
      console.error("Workspace trash cascade failed:", wsErr.message);
    }

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
  previewInvitation,
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
  updateOrganization,
  updateOrganizationWorkHours,
  getOrganizationLogo,
  switchOrganization,
  moveOrganizationToTrash,
};
