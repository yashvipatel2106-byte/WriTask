const cron = require("node-cron");
const weeklyReportRunner = require("../services/reports/weeklyReportRunner");
const { getPreviousWeekReference } = require("../utils/reportWeek");

const DEFAULT_CRON = "0 8 * * 1"; // Monday 08:00

function start() {
  if (process.env.WEEKLY_REPORT_ENABLED === "false") {
    console.log("Weekly report scheduler disabled (WEEKLY_REPORT_ENABLED=false)");
    return;
  }

  const expression = process.env.WEEKLY_REPORT_CRON || DEFAULT_CRON;

  if (!cron.validate(expression)) {
    console.error(`Invalid WEEKLY_REPORT_CRON expression "${expression}" — scheduler not started`);
    return;
  }

  cron.schedule(expression, async () => {
    try {
      const referenceDate = getPreviousWeekReference(new Date());
      const result = await weeklyReportRunner.runForAllEmployees({
        referenceDate,
        trigger: "cron",
      });
    } catch (error) {
      console.error("Weekly report job failed:", error);
    }
  });

  console.log(`Weekly report scheduler started (cron: "${expression}")`);
}

module.exports = { start };
