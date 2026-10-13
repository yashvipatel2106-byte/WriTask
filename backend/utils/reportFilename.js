function buildWeeklyReportFilename(username) {
  const safeName = String(username || "User")
    .replace(/[\\/:*?"<>|]+/g, "")
    .trim();
  return `${safeName} Weekly Task Report.pdf`;
}

module.exports = { buildWeeklyReportFilename };
