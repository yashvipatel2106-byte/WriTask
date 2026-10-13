const cron = require("node-cron");
const { runWeeklyDigest } = require("../services/reports/weeklyDigestService");

let scheduledTask = null;
let running = false;

function isEnabled() {
  const flag = String(process.env.WEEKLY_REPORT_ENABLED ?? "true").toLowerCase();
  return flag !== "false" && flag !== "0";
}

function getCronExpression() {
  // Default: every Monday at 09:00
  return process.env.WEEKLY_REPORT_CRON || "0 9 * * 1";
}

function getTimezone() {
  return process.env.WEEKLY_REPORT_TZ || "Asia/Kolkata";
}

async function executeDigest(triggeredBy = "cron") {
  if (running) {
    console.log("[weekly-digest] Already running, skipping overlapping trigger");
    return null;
  }

  running = true;
  console.log(`[weekly-digest] Starting (${triggeredBy})…`);

  try {
    const summary = await runWeeklyDigest({ triggeredBy, force: false });
    console.log(
      `[weekly-digest] Done week=${summary.weekKey} orgs=${summary.orgCount}`
    );
    return summary;
  } catch (error) {
    console.error("[weekly-digest] Failed:", error);
    throw error;
  } finally {
    running = false;
  }
}

function startWeeklyReportScheduler() {
  if (!isEnabled()) {
    console.log("[weekly-digest] Scheduler disabled (WEEKLY_REPORT_ENABLED=false)");
    return null;
  }

  const expression = getCronExpression();
  if (!cron.validate(expression)) {
    console.error(`[weekly-digest] Invalid cron expression: ${expression}`);
    return null;
  }

  if (scheduledTask) {
    return scheduledTask;
  }

  const timezone = getTimezone();
  scheduledTask = cron.schedule(
    expression,
    () => {
      void executeDigest("cron");
    },
    { timezone }
  );

  console.log(
    `[weekly-digest] Scheduled "${expression}" (${timezone}) → owners & managers`
  );

  return scheduledTask;
}

function stopWeeklyReportScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  startWeeklyReportScheduler,
  stopWeeklyReportScheduler,
  executeDigest,
};
