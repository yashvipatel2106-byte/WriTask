const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const dayjs = require("dayjs");
const { getLogoDataUri } = require("../../utils/reportAssets");

const DISTRIBUTION_LABELS = [
    { key: "todo", label: "To Do", color: "#94a3b8" },
    { key: "inProgress", label: "In Progress", color: "#3b82f6" },
    { key: "review", label: "Review", color: "#f59e0b" },
    { key: "completed", label: "Completed", color: "#10b981" },
    { key: "overdue", label: "Overdue", color: "#ef4444" },
];

function buildDistributionChart(taskDistribution = {}) {
    const maxCount = Math.max(1, ...DISTRIBUTION_LABELS.map((d) => taskDistribution[d.key] || 0));
    return DISTRIBUTION_LABELS.map((d) => {
        const count = taskDistribution[d.key] || 0;
        return {
            ...d,
            count,
            pct: Math.round((count / maxCount) * 100),
        };
    });
}

function buildActivityChart(weeklyActivity = []) {
    const maxCount = Math.max(
        1,
        ...weeklyActivity.map((d) => Math.max(d.completed || 0, d.created || 0))
    );
    return weeklyActivity.map((d) => ({
        ...d,
        completedPct: Math.round(((d.completed || 0) / maxCount) * 100),
        createdPct: Math.round(((d.created || 0) / maxCount) * 100),
    }));
}

function buildOrganizationSummary(organizations = []) {
    if (!organizations.length) return "Personal Workspace";
    return organizations.map((org) => org.name).join(", ");
}

/** Progress bar fill color for PDF — low → mid → high (brand-aligned). */
function progressColorForPct(pct) {
    const n = Math.max(0, Math.min(100, Number(pct) || 0));
    if (n <= 0) return "#cbd5e1";
    if (n < 25) return "#ef4444";
    if (n < 50) return "#f59e0b";
    if (n < 75) return "#06b6d4";
    return "#10b981";
}

/**
 * Handlebars refuses to read properties that aren't the object's own (a security
 * default), and Mongoose defines schema fields as prototype getters — so a raw
 * Mongoose document silently renders as blank in the template. Convert to a plain object.
 */
function toPlain(doc) {
    if (doc && typeof doc.toObject === "function") return doc.toObject();
    return doc;
}

class PdfService {
  constructor() {
    this._template = null;
  }

  getTemplate() {
    if (this._template) return this._template;

    const templatePath = path.join(
      __dirname,
      "../../templates/reports/weekly-report.hbs"
    );
    const source = fs.readFileSync(templatePath, "utf8");
    this._template = handlebars.compile(source);
    return this._template;
  }

  buildHtml(report) {
    const template = this.getTemplate();

    const projectPerformance = (report.projectPerformance || []).map((project) => {
      const progress = Math.max(0, Math.min(100, Number(project.progress) || 0));
      return {
        ...project,
        progress,
        progressColor: progressColorForPct(progress),
        manager: project.manager ? toPlain(project.manager) : null,
      };
    });

    const recentTasksFormatted = (report.recentTasks || []).map((task) => ({
      ...task,
      dueDateFormatted: task.dueDate
        ? dayjs(task.dueDate).format("DD MMM YYYY")
        : "—",
    }));

    return template({
      ...report,
      employee: toPlain(report.employee),
      projectPerformance,
      weekRangeLabel: report.weekLabel,
      generatedAt: dayjs().format("DD MMM YYYY hh:mm A"),
      organizationSummary: buildOrganizationSummary(report.organizations),
      distributionChart: buildDistributionChart(report.taskDistribution),
      activityChart: buildActivityChart(report.weeklyActivity),
      hasProjects: projectPerformance.length > 0,
      hasRecentTasks: recentTasksFormatted.length > 0,
      recentTasksFormatted,
      logoDataUri: getLogoDataUri(),
    });
  }

  async launchBrowser() {
    // Required lazily, not at module load — puppeteer bundles a full
    // Chromium download that was crashing the *entire* server on every
    // cold start (every request, not just PDF ones) when required
    // unconditionally at the top of this file on Vercel's serverless runtime.
    const puppeteer = require("puppeteer");
    return puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  async generateWeeklyPdf(report, browser = null) {
    const html = this.buildHtml(report);
    const ownsBrowser = !browser;
    const activeBrowser = browser || (await this.launchBrowser());

    try {
      const page = await activeBrowser.newPage();
      try {
        await page.setContent(html, {
          waitUntil: "networkidle0",
          timeout: 60000,
        });

        return await page.pdf({
          format: "A4",
          printBackground: true,
          margin: {
            top: "20px",
            bottom: "20px",
            left: "20px",
            right: "20px",
          },
        });
      } finally {
        await page.close().catch(() => {});
      }
    } finally {
      if (ownsBrowser) {
        await activeBrowser.close().catch(() => {});
      }
    }
  }
}

module.exports = new PdfService();
