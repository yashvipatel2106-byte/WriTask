const path = require("path");
const { Worker } = require("worker_threads");
const { processImportRows } = require("../services/excelImportService");

exports.importTasks = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Excel file is required." });
    }

    const workerResult = await runImportWorker(req.file.path);
    if (!workerResult.success) {
      return res.status(400).json({ success: false, message: workerResult.message });
    }

    const result = await processImportRows({
      rows: workerResult.rows,
      project: req.project,
      user: req.user,
    });

    return res.json({
      success: true,
      message: `Import complete: ${result.created} created, ${result.failed} skipped.`,
      ...result,
    });
  } catch (error) {
    console.error("Task import failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

function runImportWorker(filePath) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "../workers/taskImportWorker.js"), {
      workerData: { filePath },
    });

    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Import worker exited with code ${code}.`));
    });
  });
}
