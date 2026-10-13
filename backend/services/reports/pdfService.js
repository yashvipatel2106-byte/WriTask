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

  buildTableHtml({
    title,
    generatedAt,
    columns,
    rows,
    workspaceName,
    organizationName,
    basedOnLabel,
    createdBy,
  }) {
    const escape = (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const logo = getLogoDataUri();
    const orgLabel = organizationName || workspaceName || "Workspace";
    const header = columns
      .map(
        (c) =>
          `<th>${escape(c.label)}</th>`
      )
      .join("");
    const body =
      rows.length === 0
        ? `<tr><td colspan="${columns.length}" class="empty">No data found for the selected filters.</td></tr>`
        : rows
            .map((row, index) => {
              const isGroup = row.kind === "folder" || row.kind === "project";
              const tds = columns
                .map((c) => {
                  const raw = row.cells?.[c.key] ?? "";
                  const depth = Number(row.depth) || 0;
                  const value =
                    c.key === "title" && depth
                      ? `${"  ".repeat(depth)}${raw}`
                      : raw;
                  const display = value || (isGroup && c.key !== "title" ? "" : "—");
                  return `<td class="${c.key === "title" ? "title-cell" : ""}">${escape(display)}</td>`;
                })
                .join("");
              return `<tr class="${isGroup ? "group-row" : index % 2 ? "alt" : ""}">${tds}</tr>`;
            })
            .join("");
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escape(title)}</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: "Segoe UI", Arial, sans-serif;
        color: #1e293b;
        font-size: 12px;
        line-height: 1.4;
        padding: 16px;
        background: #fff;
      }
      .page-frame {
        border: 2px solid #06b6d4;
        border-radius: 12px;
        padding: 22px 24px 16px;
        min-height: 100%;
        box-shadow: inset 0 0 0 4px #ecfeff;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 3px solid #06b6d4;
        padding-bottom: 16px;
        margin-bottom: 18px;
      }
      .header-brand { display: flex; align-items: center; gap: 12px; }
      .header-brand img { width: 44px; height: 44px; object-fit: contain; }
      .header-brand .brand { font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; }
      .header-brand .subtitle { font-size: 12px; color: #64748b; margin-top: 2px; }
      .org-badge {
        display: inline-block;
        margin-top: 6px;
        padding: 3px 10px;
        background: #ecfeff;
        color: #0e7490;
        border: 1px solid #a5f3fc;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .header-meta { text-align: right; font-size: 11px; color: #64748b; }
      .header-meta .report-title {
        font-size: 13px;
        font-weight: 600;
        color: #06b6d4;
        margin-bottom: 3px;
      }
      .meta-row {
        display: flex;
        gap: 16px;
        margin-bottom: 14px;
        color: #64748b;
        font-size: 11px;
      }
      .meta-row strong { color: #334155; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; }
      thead th {
        text-align: left;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #0e7490;
        background: #ecfeff;
        border-bottom: 1px solid #a5f3fc;
        padding: 8px 10px;
      }
      tbody td {
        padding: 8px 10px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 11px;
        color: #334155;
      }
      tbody tr.alt td { background: #f8fafc; }
      tbody tr.group-row td {
        background: #f0fdfa;
        font-weight: 700;
        color: #0f172a;
      }
      .title-cell { font-weight: 600; color: #0f172a; }
      .empty { text-align: center; color: #94a3b8; padding: 20px 10px; }
      .footer {
        margin-top: 18px;
        padding-top: 10px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: #94a3b8;
      }
    </style>
  </head>
  <body>
    <div class="page-frame">
      <div class="header">
        <div class="header-brand">
          ${logo ? `<img src="${logo}" alt="WriTask" />` : ""}
          <div>
            <div class="brand">WriTask</div>
            <div class="subtitle">${escape(basedOnLabel || "Custom Report")}</div>
            <div class="org-badge">${escape(orgLabel)}</div>
          </div>
        </div>
        <div class="header-meta">
          <div class="report-title">${escape(title)}</div>
          <div>Generated ${escape(generatedAt)}</div>
        </div>
      </div>
      <div class="meta-row">
        <div>Workspace: <strong>${escape(workspaceName || "—")}</strong></div>
        ${createdBy ? `<div>Prepared by: <strong>${escape(createdBy)}</strong></div>` : ""}
        <div>Rows: <strong>${rows.filter((r) => r.kind !== "folder" && r.kind !== "project").length || rows.length}</strong></div>
      </div>
      <table>
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
      <div class="footer">
        <span>WriTask · ${escape(orgLabel)}</span>
        <span>Confidential — for authorized members only</span>
      </div>
    </div>
  </body>
</html>`;
  }

  async generateTablePdf(
    {
      title,
      columns,
      rows,
      workspaceName,
      organizationName,
      basedOnLabel,
      createdBy,
    },
    browser = null
  ) {
    const html = this.buildTableHtml({
      title,
      generatedAt: dayjs().format("DD MMM YYYY hh:mm A"),
      columns,
      rows,
      workspaceName,
      organizationName,
      basedOnLabel,
      createdBy,
    });
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
          landscape: columns.length > 6,
          printBackground: true,
          margin: { top: "16px", bottom: "16px", left: "16px", right: "16px" },
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
