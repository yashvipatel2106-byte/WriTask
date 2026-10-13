const bcrypt = require("bcryptjs");
const Organization = require("../models/Organization");

function resolveMemberUserId(member) {
  if (!member?.user) return null;
  const u = member.user;
  if (typeof u === "object" && u._id) return u._id.toString();
  return u.toString();
}

function findMembership(organization, userId) {
  const id = userId.toString();
  return (
    organization.members.find((m) => resolveMemberUserId(m) === id) || null
  );
}

async function listUserOrganizations(userId) {
  return Organization.find({
    "members.user": userId,
    isDeleted: { $ne: true },
  }).select("name slug members");
}

/**
 * Verify password for a membership. Falls back to the user's global password
 * when the membership has no org-specific hash yet (legacy migration).
 * Optionally backfills the membership hash so the next login uses it.
 */
async function verifyOrgMembershipPassword({
  organization,
  user,
  password,
  backfill = true,
}) {
  const member = findMembership(organization, user._id);
  if (!member) return false;

  if (member.password) {
    return bcrypt.compare(String(password).trim(), member.password);
  }

  if (!user.password) return false;
  const matchesGlobal = await bcrypt.compare(
    String(password).trim(),
    user.password
  );
  if (!matchesGlobal) return false;

  if (backfill) {
    member.password = user.password;
    organization.markModified("members");
    await organization.save();
  }

  return true;
}

async function verifyPersonalPassword(user, password) {
  if (!user.password) return false;
  return bcrypt.compare(String(password).trim(), user.password);
}

/**
 * Organizations whose membership password matches the given plaintext.
 * When multiple orgs share the same password, callers should pick the earliest
 * joinedAt (first org the user was added to).
 */
async function findOrganizationsMatchingPassword(user, password) {
  const orgs = await listUserOrganizations(user._id);
  const plain = String(password).trim();
  const matches = [];

  for (const org of orgs) {
    const member = findMembership(org, user._id);
    if (!member) continue;

    let matched = false;
    if (member.password) {
      matched = await bcrypt.compare(plain, member.password);
    } else if (user.password) {
      matched = await bcrypt.compare(plain, user.password);
    }

    if (matched) {
      const joinedAt = member.joinedAt
        ? new Date(member.joinedAt)
        : org.createdAt
          ? new Date(org.createdAt)
          : new Date(0);
      matches.push({ org, joinedAt, member });
    }
  }

  return matches;
}

/**
 * Pick the organization to open after login from a password match.
 * Returns null when the password does not belong to any membership.
 */
async function resolveLoginOrganization(user, password) {
  const matches = await findOrganizationsMatchingPassword(user, password);
  if (!matches.length) return null;

  matches.sort((a, b) => a.joinedAt - b.joinedAt);
  const chosen = matches[0];

  if (!chosen.member.password && user.password) {
    chosen.member.password = user.password;
    chosen.org.markModified("members");
    await chosen.org.save();
  }

  return chosen.org;
}

async function hashOrgPassword(plain) {
  return bcrypt.hash(String(plain).trim(), 10);
}

/**
 * Set (or replace) the bcrypt hash on a user's membership in an organization.
 * Returns false if the user is not a member.
 */
async function setOrgMembershipPassword(organization, userId, plainPassword) {
  const member = findMembership(organization, userId);
  if (!member) return false;
  member.password = await hashOrgPassword(plainPassword);
  organization.markModified("members");
  await organization.save();
  return true;
}

/**
 * Resolve which organization a forgot-password / reset should target.
 * A client-supplied organizationId is only accepted when the user is a member
 * (never trusted alone). Otherwise: unique membership → that org; else null
 * (personal workspace / no org binding).
 */
async function resolvePasswordResetOrganization(userId, requestedOrgId = null) {
  const orgs = await listUserOrganizations(userId);
  if (requestedOrgId) {
    const match = orgs.find((o) => o._id.toString() === String(requestedOrgId));
    if (match) return match;
  }
  if (orgs.length === 1) return orgs[0];
  return null;
}

function stripMemberPasswords(organization) {
  if (!organization) return organization;
  const obj =
    typeof organization.toObject === "function"
      ? organization.toObject()
      : { ...organization };
  if (Array.isArray(obj.members)) {
    obj.members = obj.members.map((m) => {
      const { password, ...rest } = m;
      return rest;
    });
  }
  return obj;
}

module.exports = {
  resolveMemberUserId,
  findMembership,
  listUserOrganizations,
  verifyOrgMembershipPassword,
  verifyPersonalPassword,
  findOrganizationsMatchingPassword,
  resolveLoginOrganization,
  hashOrgPassword,
  setOrgMembershipPassword,
  resolvePasswordResetOrganization,
  stripMemberPasswords,
};
