const User = require("../models/user");
const Activity = require("../models/activity");
const Project = require("../models/Project");
const Organization = require("../models/Organization");
const { isValidCountry } = require("../config/countries");

const PROFILE_FIELDS = [
  "username",
  "phone",
  "designation",
  "department",
  "location",
  "bio",
  "avatarColor",
];

function normalizePhone(value) {
  if (value === undefined || value === null || value === "") return "";
  const trimmed = String(value).trim();

  // With a country code, e.g. "+15738327281" (+<1-4 digit dial code><10 digit number>).
  if (/^\+\d{1,4}\d{10}$/.test(trimmed)) {
    return trimmed;
  }

  // No country code selected — plain 10-digit number.
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return digits;
  }

  return null;
}

function resolveMemberUserId(member) {
  if (!member?.user) return null;
  const u = member.user;
  if (typeof u === "object" && u._id) return u._id.toString();
  return u.toString();
}

async function getOrgProfileContext(userId) {
  const organizations = await Organization.find({
    "members.user": userId,
    isDeleted: { $ne: true },
  });

  let isOrgOwner = false;
  let isOrgMember = organizations.length > 0;
  let assignedDepartment = "";
  let designationLocked = false;
  let departmentLocked = false;

  for (const org of organizations) {
    const role = org.getMemberRole(userId);
    if (role === "owner") {
      isOrgOwner = true;
      designationLocked = true;
    }

    const member = org.members.find(
      (m) => resolveMemberUserId(m) === userId.toString()
    );

    if (member?.department && role !== "owner") {
      assignedDepartment = member.department;
      departmentLocked = true;
    }
  }

  return {
    isOrgOwner,
    isOrgMember,
    assignedDepartment,
    designationLocked,
    departmentLocked,
    designation: isOrgOwner ? "admin" : null,
  };
}

function applyOrgProfileFields(user, orgContext) {
  const profile = user.toObject ? user.toObject() : { ...user };

  if (orgContext.isOrgOwner) {
    profile.designation = "admin";
  }

  if (orgContext.assignedDepartment) {
    profile.department = orgContext.assignedDepartment;
  }

  profile.profileMeta = {
    isOrgOwner: orgContext.isOrgOwner,
    isOrgMember: orgContext.isOrgMember,
    designationLocked: orgContext.designationLocked,
    departmentLocked: orgContext.departmentLocked,
  };

  return profile;
}

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const orgContext = await getOrgProfileContext(req.user._id);

    if (orgContext.isOrgOwner && user.designation !== "admin") {
      await User.findByIdAndUpdate(req.user._id, { designation: "admin" });
      user.designation = "admin";
    }

    if (
      orgContext.assignedDepartment &&
      user.department !== orgContext.assignedDepartment
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        department: orgContext.assignedDepartment,
      });
      user.department = orgContext.assignedDepartment;
    }

    res.json(applyOrgProfileFields(user, orgContext));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const orgContext = await getOrgProfileContext(req.user._id);
    const updates = {};

    for (const field of PROFILE_FIELDS) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (orgContext.designationLocked) {
      delete updates.designation;
    }

    if (orgContext.departmentLocked) {
      delete updates.department;
    }

    if (updates.phone !== undefined) {
      const phone = normalizePhone(updates.phone);
      if (phone === null) {
        return res.status(400).json({
          message: "Phone must be a 10-digit number",
        });
      }
      updates.phone = phone;
    }

    if (updates.avatarColor !== undefined && updates.avatarColor !== "") {
      const value = String(updates.avatarColor);
      const isHex = /^#[0-9a-fA-F]{6}$/.test(value);
      const isGradient = /^linear-gradient\([^;{}]*\)$/.test(value);
      if (!isHex && !isGradient) {
        return res.status(400).json({ message: "Invalid avatar color" });
      }
    }
    
    if (updates.location !== undefined && updates.location !== "") {
      if (!isValidCountry(updates.location)) {
        return res.status(400).json({ message: "Please select a valid country" });
      }
    }

    if (updates.username !== undefined && !String(updates.username).trim()) {
      return res.status(400).json({ message: "Username is required" });
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    await Activity.create({
      user: req.user._id,
      action: "Updated Profile",
      type: "Profile",
    });

    res.json(applyOrgProfileFields(user, orgContext));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const COLOR_THEMES = new Set([
  "white", "black", "blue", "purple", "emerald", "teal",
  "orange", "red", "pink", "amber",
]);

const COLOR_THEME_ALIASES = {
  coral: "red",
  softRed: "red",
  lavender: "purple",
  mint: "emerald",
  yellow: "amber",
  navy: "blue",
  azure: "teal",
};

function resolveColorTheme(value) {
  if (COLOR_THEME_ALIASES[value]) return COLOR_THEME_ALIASES[value];
  return COLOR_THEMES.has(value) ? value : null;
}

exports.updateAppearance = async (req, res) => {
  try {
    const colorTheme = resolveColorTheme(req.body.colorTheme);
    if (!colorTheme) {
      return res.status(400).json({ message: "Invalid colour theme" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { "settings.colorTheme": colorTheme } },
      { new: true, runValidators: true }
    ).select("settings.colorTheme");

    return res.json({ colorTheme: user.settings.colorTheme });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    await Project.updateMany({}, { $pull: { members: { user: userId } } });
    await Organization.updateMany(
      {},
      { $pull: { members: { user: userId } } }
    );

    await User.findByIdAndDelete(userId);

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
