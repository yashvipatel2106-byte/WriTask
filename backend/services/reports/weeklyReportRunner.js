const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");
const puppeteer = require("puppeteer");
const Project = require("../../models/Project");
const WeeklyReportArchive = require("../../models/WeeklyReportArchive");
const reportService = require("../reportService");
const pdfService = require("./pdfService");
const reportRecipientService = require("./reportRecipientService");
const emailService = require("../../utils/emailService");
const { buildWeeklyReportFilename } = require("../../utils/reportFilename");

const REPORTS_DIR = path.join(__dirname, "../../uploads/reports");

function archiveFilePath(userId, weekStart) {
  const weekKey = dayjs(weekStart).format("YYYY-MM-DD");
  return path.join(REPORTS_DIR, userId.toString(), `${weekKey}.pdf`);
}

class WeeklyReportRunner {
  /** Every user who is a member of at least one active, non-deleted project. */
  async enumerateEmployees() {
    return Project.distinct("members.user", {
      isDeleted: false,
      status: { $ne: "archived" },
    });
  }

  /**
   * Generate, archive, and (if `sendEmail`) email one employee's weekly report.
   * `sendEmail` defaults to false for on-demand downloads so clicking "Download PDF"
   * repeatedly never re-spams managers; cron/manual-admin runs pass sendEmail: true.
   */
  async runForEmployee(
    userId,
    { referenceDate = new Date(), trigger = "manual", browser, sendEmail = false } = {}
  ) {
    const report = await reportService.getWeeklyReport(userId, { referenceDate });
    const pdfBuffer = await pdfService.generateWeeklyPdf(report, browser);

    const filePath = archiveFilePath(userId, report.weekStart);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, pdfBuffer);

    const existing = await WeeklyReportArchive.findOne({
      employee: userId,
      weekStart: report.weekStart,
    });

    let sentTo = existing?.sentTo || [];
    let recipientCount = 0;

    if (sendEmail) {
      const orgLookup = reportService.toOrgLookup(report.organizations);
      const recipients = reportRecipientService.resolve(
        report.employee,
        report.projects,
        orgLookup
      );
      recipientCount = recipients.length;

      if (recipients.length) {
        try {
          const orgName =
            report.organizations?.map((org) => org.name).filter(Boolean).join(", ") ||
            "WriTask";

          await emailService.sendWeeklyReportEmail({
            to: recipients.map((r) => r.email),
            orgName,
            weekLabel: report.weekLabel,
            memberCount: 1,
            employeeName: report.employee?.username,
            memberNames: report.employee?.username
              ? [report.employee.username]
              : [],
            attachments: [
              {
                filename: buildWeeklyReportFilename(report.employee?.username),
                content: Buffer.from(pdfBuffer),
              },
            ],
          });
          sentTo = recipients.map((r) => ({ user: r.user, email: r.email, role: r.role }));
        } catch (error) {
          console.error(`Failed to email weekly report for ${userId}:`, error.message);
        }
      }
    }

    const archive = await WeeklyReportArchive.findOneAndUpdate(
      { employee: userId, weekStart: report.weekStart },
      {
        employee: userId,
        employeeName: report.employee.username,
        weekStart: report.weekStart,
        weekEnd: report.weekEnd,
        generatedAt: new Date(),
        filePath,
        sentTo,
        summarySnapshot: report.summary,
        trigger,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return { archive, recipientCount, pdfBuffer, employeeName: report.employee.username };
  }

  /** Run for every employee, sequentially, sharing one browser instance. */
  async runForAllEmployees({ referenceDate = new Date(), trigger = "cron" } = {}) {
    const employeeIds = await this.enumerateEmployees();
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const result = { processed: 0, emailed: 0, failed: [] };

    try {
      for (const employeeId of employeeIds) {
        try {
          const { recipientCount } = await this.runForEmployee(employeeId, {
            referenceDate,
            trigger,
            browser,
            sendEmail: true,
          });
          result.processed++;
          if (recipientCount > 0) result.emailed++;
        } catch (error) {
          console.error(`Weekly report failed for ${employeeId}:`, error.message);
          result.failed.push({ employeeId: employeeId.toString(), message: error.message });
        }
      }
    } finally {
      await browser.close();
    }

    return result;
  }
}

module.exports = new WeeklyReportRunner();
