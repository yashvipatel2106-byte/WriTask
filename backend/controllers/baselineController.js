const mongoose = require("mongoose");
const ScheduleBaseline = require("../models/ScheduleBaseline");
const Task = require("../models/Task");
const {
  parseBaselineName,
  buildScheduleBaselineItems,
  httpError,
} = require("../utils/scheduleBaselines");

function assertObjectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ""))) {
    throw httpError(`${label} is invalid`);
  }
  return String(value);
}

function sendError(res, error) {
  const status = error.status || 500;
  if (status >= 500) console.error("schedule baseline error:", error);
  return res.status(status).json({ message: error.message || "Unable to manage baseline" });
}

async function listBaselines(req, res) {
  try {
    const projectId = assertObjectId(req.params.projectId, "Project ID");
    const baselines = await ScheduleBaseline.find({ project: projectId })
      .sort({ createdAt: -1 })
      .populate("createdBy", "username email avatarColor")
      .lean();
    return res.json(baselines);
  } catch (error) {
    return sendError(res, error);
  }
}

async function createBaseline(req, res) {
  try {
    const projectId = assertObjectId(req.params.projectId, "Project ID");
    // Only the name is accepted from the browser. Dates always come from the DB.
    const name = parseBaselineName(req.body?.name);
    const tasks = await Task.find({
      project: projectId,
      isDeleted: { $ne: true },
      startDate: { $ne: null },
      dueDate: { $ne: null },
    })
      .select("_id startDate dueDate")
      .lean();
    const items = buildScheduleBaselineItems(tasks);
    const baseline = await ScheduleBaseline.create({
      project: projectId,
      organization: req.project?.organization || null,
      name,
      createdBy: req.user._id,
      items,
    });
    return res.status(201).json(baseline);
  } catch (error) {
    return sendError(res, error);
  }
}

async function deleteBaseline(req, res) {
  try {
    const projectId = assertObjectId(req.params.projectId, "Project ID");
    const baselineId = assertObjectId(req.params.baselineId, "Baseline ID");
    const baseline = await ScheduleBaseline.findOneAndDelete({
      _id: baselineId,
      project: projectId,
    });
    if (!baseline) throw httpError("Baseline not found in this project", 404);
    return res.json({ message: "Baseline deleted", id: baseline._id });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = { listBaselines, createBaseline, deleteBaseline };
