const mongoose = require("mongoose");
const reportService = require("../services/reportService");
const pdfService = require("../services/reports/pdfService");
const { runWeeklyDigest } = require("../services/reports/weeklyDigestService");
const Organization = require("../models/Organization");
const {
  ensureRoleDefinitions,
  getRoleDefinition,
  hasOrgPermissionForUser,
} = require("../utils/roleDefinitions");
const { ORG_ROLE_LEVEL } = require("../config/orgRole");

exports.getWeeklyReport = async (req, res) => {
  try {
    const { organizationId, workspaceId, personal } = req.query;
    const report = await reportService.getWeeklyReport(req.user._id, {
      organizationId: organizationId || null,
      workspaceId: workspaceId || null,
      personal: personal === "true",
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.downloadWeeklyPdf = async (req, res) => {
  try {
    const { organizationId, workspaceId, personal } = req.query;
    const report = await reportService.getWeeklyReport(req.user._id, {
      organizationId: organizationId || null,
      workspaceId: workspaceId || null,
      personal: personal === "true",
    });
    const pdf = await pdfService.generateWeeklyPdf(report);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="WeeklyReport.pdf"',
    });

    return res.send(pdf);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

function canTriggerWeeklyDigest(organization, userId) {
  ensureRoleDefinitions(organization);

  const id = userId.toString();
  const ownerId = organization.owner?.toString?.() || String(organization.owner);
  if (ownerId === id) {
    return { allowed: true, role: "owner" };
  }

  const memberRole = organization.getMemberRole(id);
  if (!memberRole) {
    return { allowed: false, role: null };
  }

  if (["owner", "admin", "manager"].includes(memberRole)) {
    return { allowed: true, role: memberRole };
  }

  // Custom roles: allow manager-level+ or anyone with admin panel access
  const roleDef = getRoleDefinition(organization, memberRole);
  const level = roleDef?.level ?? ORG_ROLE_LEVEL[memberRole] ?? 0;
  if (level >= ORG_ROLE_LEVEL.manager) {
    return { allowed: true, role: memberRole };
  }

  if (hasOrgPermissionForUser(organization, id, "org:viewAdmin")) {
    return { allowed: true, role: memberRole };
  }

  return { allowed: false, role: memberRole };
}

/**
 * Manual trigger for weekly digest emails (owner / admin / manager).
 * Body/query: { organizationId?, force? }
 */
exports.runWeeklyDigest = async (req, res) => {
  try {
    const organizationId =
      req.body?.organizationId || req.query?.organizationId || null;
    const force =
      req.body?.force === true ||
      req.query?.force === "true" ||
      req.query?.force === "1";

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "organizationId is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid organizationId. Use the full 24-character MongoDB id.",
      });
    }

    const organization = await Organization.findById(organizationId);
    if (!organization || organization.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    const { allowed, role } = canTriggerWeeklyDigest(
      organization,
      req.user._id
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message:
          "Only owners, admins, and managers can trigger weekly reports",
        yourRole: role || "not a member of this organization",
        organizationId: organization._id,
        organizationName: organization.name,
        hint: "Use a token for the org owner/admin/manager, and the correct organizationId.",
      });
    }

    const summary = await runWeeklyDigest({
      organizationId: organization._id,
      force,
      triggeredBy: "manual",
    });

    return res.json({
      success: true,
      message: "Weekly digest run complete",
      ...summary,
    });
  } catch (error) {
    console.error("Manual weekly digest failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
