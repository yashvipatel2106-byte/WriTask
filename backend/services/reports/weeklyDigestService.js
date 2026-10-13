const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");

const Organization = require("../../models/Organization");
const User = require("../../models/user");
const WeeklyReportDelivery = require("../../models/WeeklyReportDelivery");
const reportService = require("../reportService");
const pdfService = require("./pdfService");
const { sendWeeklyReportEmail } = require("../../utils/emailService");

dayjs.extend(isoWeek);

const RECIPIENT_ROLES = new Set(["owner", "manager"]);

function getWeekKey(date = new Date()) {
  const d = dayjs(date);
  return `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, "0")}`;
}

function getWeekLabel(date = new Date()) {
  const end = dayjs(date).startOf("day");
  const start = end.subtract(6, "day");
  return `${start.format("DD MMM YYYY")} – ${end.format("DD MMM YYYY")}`;
}

function sanitizeFilename(value) {
  return String(value || "member")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "member";
}

function resolveMemberUserId(member) {
  if (!member?.user) return null;
  if (typeof member.user === "object" && member.user._id) {
    return member.user._id.toString();
  }
  return member.user.toString();
}

function collectOrgMemberIds(organization) {
  const ids = new Set();
  if (organization.owner) {
    const ownerId =
      typeof organization.owner === "object" && organization.owner._id
        ? organization.owner._id.toString()
        : organization.owner.toString();
    ids.add(ownerId);
  }
  for (const member of organization.members || []) {
    const id = resolveMemberUserId(member);
    if (id) ids.add(id);
  }
  return [...ids];
}

function collectRecipientEmails(organization, usersById) {
  const emails = new Set();

  const ownerId =
    organization.owner &&
    (typeof organization.owner === "object" && organization.owner._id
      ? organization.owner._id.toString()
      : organization.owner.toString());

  if (ownerId) {
    const owner = usersById.get(ownerId);
    if (owner?.email && owner.settings?.emailNotifications !== false) {
      emails.add(owner.email.toLowerCase());
    }
  }

  for (const member of organization.members || []) {
    if (!RECIPIENT_ROLES.has(member.role)) continue;
    const id = resolveMemberUserId(member);
    if (!id) continue;
    const user = usersById.get(id);
    if (!user?.email) continue;
    if (user.settings?.emailNotifications === false) continue;
    emails.add(user.email.toLowerCase());
  }

  return [...emails];
}

async function buildMemberPdfs(organization, memberIds, browser, usersById) {
  const attachments = [];
  const memberNames = [];
  const errors = [];

  for (const memberId of memberIds) {
    try {
      const report = await reportService.getWeeklyReport(memberId, {
        organizationId: organization._id,
      });
      const username =
        report.employee?.username ||
        usersById?.get(memberId.toString())?.username ||
        null;
      const pdf = await pdfService.generateWeeklyPdf(report, browser);
      attachments.push({
        filename: `weekly-${sanitizeFilename(username)}.pdf`,
        content: Buffer.from(pdf),
      });
      if (username) memberNames.push(username);
    } catch (error) {
      errors.push({
        memberId: memberId.toString(),
        message: error.message || "Failed to build report PDF",
      });
    }
  }

  return { attachments, memberNames, errors };
}

async function processOrganizationDigest(organization, { weekKey, weekLabel, triggeredBy, force }) {
  const existing = await WeeklyReportDelivery.findOne({
    organization: organization._id,
    weekKey,
  });

  if (existing && existing.status === "success" && !force) {
    return {
      organizationId: organization._id.toString(),
      orgName: organization.name,
      status: "skipped",
      message: "Already sent for this week",
    };
  }

  const memberIds = collectOrgMemberIds(organization);
  const users = await User.find({ _id: { $in: memberIds } }).select(
    "username email settings"
  );
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const recipients = collectRecipientEmails(organization, usersById);

  if (!recipients.length) {
    await WeeklyReportDelivery.findOneAndUpdate(
      { organization: organization._id, weekKey },
      {
        organization: organization._id,
        weekKey,
        status: "skipped",
        recipientEmails: [],
        memberCount: memberIds.length,
        pdfCount: 0,
        error: "No owner/manager recipients with email notifications enabled",
        triggeredBy,
      },
      { upsert: true, new: true }
    );

    return {
      organizationId: organization._id.toString(),
      orgName: organization.name,
      status: "skipped",
      message: "No recipients",
    };
  }

  let browser = null;
  try {
    browser = await pdfService.launchBrowser();
    const { attachments, memberNames, errors } = await buildMemberPdfs(
      organization,
      memberIds,
      browser,
      usersById
    );

    const sendErrors = [];
    for (const to of recipients) {
      try {
        await sendWeeklyReportEmail({
          to,
          orgName: organization.name,
          weekLabel,
          memberCount: memberIds.length,
          memberNames,
          attachments,
        });
      } catch (error) {
        sendErrors.push({ to, message: error.message });
      }
    }

    const status =
      sendErrors.length === 0
        ? errors.length === 0
          ? "success"
          : "partial"
        : sendErrors.length < recipients.length
          ? "partial"
          : "failed";

    const errorMessage = [...errors, ...sendErrors]
      .map((item) => item.message || item.to)
      .filter(Boolean)
      .slice(0, 5)
      .join("; ");

    await WeeklyReportDelivery.findOneAndUpdate(
      { organization: organization._id, weekKey },
      {
        organization: organization._id,
        weekKey,
        status,
        recipientEmails: recipients,
        memberCount: memberIds.length,
        pdfCount: attachments.length,
        error: errorMessage || null,
        triggeredBy,
      },
      { upsert: true, new: true }
    );

    return {
      organizationId: organization._id.toString(),
      orgName: organization.name,
      status,
      recipients,
      memberCount: memberIds.length,
      pdfCount: attachments.length,
      errors: [...errors, ...sendErrors],
    };
  } catch (error) {
    await WeeklyReportDelivery.findOneAndUpdate(
      { organization: organization._id, weekKey },
      {
        organization: organization._id,
        weekKey,
        status: "failed",
        recipientEmails: recipients,
        memberCount: memberIds.length,
        pdfCount: 0,
        error: error.message,
        triggeredBy,
      },
      { upsert: true, new: true }
    );

    return {
      organizationId: organization._id.toString(),
      orgName: organization.name,
      status: "failed",
      message: error.message,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Generate weekly member PDFs and email them to each org's owner + managers.
 */
async function runWeeklyDigest({
  organizationId = null,
  force = false,
  triggeredBy = "cron",
} = {}) {
  const weekKey = getWeekKey();
  const weekLabel = getWeekLabel();

  const filter = { isDeleted: { $ne: true } };
  if (organizationId) filter._id = organizationId;

  const organizations = await Organization.find(filter)
    .populate("owner", "username email settings")
    .populate("members.user", "username email settings");

  const results = [];
  for (const organization of organizations) {
    const result = await processOrganizationDigest(organization, {
      weekKey,
      weekLabel,
      triggeredBy,
      force,
    });
    results.push(result);
  }

  return {
    weekKey,
    weekLabel,
    orgCount: organizations.length,
    results,
  };
}

module.exports = {
  runWeeklyDigest,
  getWeekKey,
  getWeekLabel,
};
