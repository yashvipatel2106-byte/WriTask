const XLSX = require("xlsx");

function sanitizeFilename(name) {
  return String(name || "report")
    .replace(/[<>:"/\\|?*]+/g, "")
    .trim()
    .slice(0, 80) || "report";
}

function buildWorkbookBuffer({ title, columns, rows }) {
  const headers = columns.map((c) => c.label);
  const aoa = [headers];
  for (const row of rows) {
    aoa.push(
      columns.map((c) => {
        const value = row.cells?.[c.key] ?? "";
        if (c.key !== "title") return value;
        const depth = Number(row.depth) || 0;
        return depth ? `${"  ".repeat(depth)}${value}` : value;
      })
    );
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = columns.map((c) => ({
    wch: Math.min(40, Math.max(12, String(c.label).length + 4)),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, sanitizeFilename(title).slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = {
  sanitizeFilename,
  buildWorkbookBuffer,
};
