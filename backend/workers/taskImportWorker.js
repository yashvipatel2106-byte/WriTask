const { parentPort, workerData } = require("worker_threads");
const XLSX = require("xlsx");
const fs = require("fs");

const {
  validateHeaders,
  validateRow,
} = require("../services/excelImportService");

try {
  const workbook = XLSX.readFile(workerData.filePath, {
    cellDates: true,
    cellNF: false,
    cellText: false,
    // Without this, plain-text CSV/text cells that "look like" dates (e.g.
    // "04-09-2026") get silently reinterpreted by SheetJS using ambiguous
    // MM-DD-YYYY parsing — corrupting the actual date — before our own
    // day-first parseDate() ever sees the original text. Genuine .xlsx date
    // cells are unaffected; they're already typed as dates in the binary
    // format, not text-sniffed.
    raw: true,
  });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Format dates as DD/MM/YYYY (keeps leading zeros like 07/08) instead of
  // ambiguous JS Date / locale strings from Excel.
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
    dateNF: "dd/mm/yyyy",
  });

  // Validate Excel headers
  const headerValidation = validateHeaders(rows);

  if (!headerValidation.valid) {
    parentPort.postMessage({
      success: false,
      message: headerValidation.message,
    });

    return;
  }

  parentPort.postMessage({
    success: true,
    rows,
  });

} catch (error) {
  parentPort.postMessage({
    success: false,
    message: error.message,
  });
} finally {
  if (fs.existsSync(workerData.filePath)) {
    fs.unlinkSync(workerData.filePath);
  }
}
