const User = require("../models/user");
const Organization = require("../models/Organization");
const jwt = require("jsonwebtoken");
const { passwordPolicyError } = require("../utils/passwordPolicy");
const {
  verifyOrgMembershipPassword,
  verifyPersonalPassword,
  setOrgMembershipPassword,
  hashOrgPassword,
  findMembership,
} = require("../utils/orgMembershipAuth");

function signAuthToken(userId, organizationId = null) {
  const payload = { id: userId };
  if (organizationId) payload.organizationId = organizationId.toString();
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });
}

/**
 * Resolve which org's membership password to change.
 * Prefer a membership-validated organizationId from the client (the org the
 * user is currently viewing). Fall back to the JWT active org. Never trust
 * an org id unless the user is actually a member.
 */
async function resolveChangePasswordOrganization(userId, requestedOrgId, jwtOrgId) {
  const candidates = [requestedOrgId, jwtOrgId].filter(Boolean);
  for (const candidate of candidates) {
    const organization = await Organization.findOne({
      _id: candidate,
      isDeleted: { $ne: true },
    });
    if (organization && findMembership(organization, userId)) {
      return organization;
    }
  }
  return null;
}

/**
 * Change password for the currently active organization, or for the personal
 * User.password when no organization is active.
 * Other organizations' membership passwords are left untouched.
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, organizationId: requestedOrgId } =
      req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current and new password are required",
      });
    }

    const current = String(currentPassword).trim();
    const next = String(newPassword).trim();

    const weakPassword = passwordPolicyError(next);
    if (weakPassword) {
      return res.status(400).json({ message: weakPassword });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const organization = await resolveChangePasswordOrganization(
      user._id,
      requestedOrgId || null,
      req.activeOrganizationId || null
    );

    if (organization) {
      const valid = await verifyOrgMembershipPassword({
        organization,
        user,
        password: current,
        backfill: true,
      });
      if (!valid) {
        return res.status(400).json({
          message: `Wrong password for ${organization.name}`,
        });
      }

      const updated = await setOrgMembershipPassword(
        organization,
        user._id,
        next
      );
      if (!updated) {
        return res.status(403).json({
          message: "You are not a member of this organization",
        });
      }

      const token = signAuthToken(user._id, organization._id);
      return res.json({
        message: `Password updated for ${organization.name}`,
        organizationId: organization._id.toString(),
        organizationName: organization.name,
        token,
      });
    }

    // Personal workspace (no resolvable organization)
    if (!user.password) {
      return res.status(400).json({
        message:
          "This account uses Google Sign-In and has no password to compare against. Use forgot password to set one.",
      });
    }

    const validPersonal = await verifyPersonalPassword(user, current);
    if (!validPersonal) {
      return res.status(400).json({ message: "Wrong Password" });
    }

    user.password = await hashOrgPassword(next);
    await user.save();

    const token = signAuthToken(user._id, null);
    return res.json({
      message: "Password Updated",
      token,
      organizationId: null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** First-time password for Google (or passwordless) accounts during onboarding. */
exports.setInitialPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const weakPassword = passwordPolicyError(password);
    if (weakPassword) {
      return res.status(400).json({ message: weakPassword });
    }

    const plain = String(password).trim();
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.password) {
      return res.status(400).json({
        message: "Password already set. Use change password instead.",
      });
    }

    user.password = await hashOrgPassword(plain);
    await user.save();

    const activeOrgId = req.activeOrganizationId || null;
    if (activeOrgId) {
      const organization = await Organization.findOne({
        _id: activeOrgId,
        isDeleted: { $ne: true },
      });
      if (organization && findMembership(organization, user._id)) {
        await setOrgMembershipPassword(organization, user._id, plain);
      }
    }

    res.json({ message: "Password created successfully", hasPassword: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
