const Milestone = require("../models/Milestone");
const { parseMilestoneInput, assertObjectId } = require("../utils/milestones");

function sendError(res, error) {
  const status = error.status || 500;
  if (status >= 500) console.error("milestone error:", error);
  return res.status(status).json({
    message: error.message || "Unable to update milestone",
  });
}

async function listMilestones(req, res) {
  try {
    const projectId = assertObjectId(req.params.projectId, "Project ID");
    const milestones = await Milestone.find({ project: projectId })
      .sort({ dueDate: 1, createdAt: 1 })
      .lean();
    return res.json(milestones);
  } catch (error) {
    return sendError(res, error);
  }
}

async function createMilestone(req, res) {
  try {
    const projectId = assertObjectId(req.params.projectId, "Project ID");
    const input = parseMilestoneInput(req.body);
    const milestone = await Milestone.create({
      ...input,
      project: projectId,
      organization: req.project?.organization || null,
      createdBy: req.user._id,
    });
    return res.status(201).json(milestone);
  } catch (error) {
    return sendError(res, error);
  }
}

async function updateMilestone(req, res) {
  try {
    const projectId = assertObjectId(req.params.projectId, "Project ID");
    const milestoneId = assertObjectId(req.params.milestoneId, "Milestone ID");
    const input = parseMilestoneInput(req.body, { partial: true });
    if (Object.keys(input).length === 0) {
      return res.status(400).json({ message: "No milestone fields to update" });
    }

    const milestone = await Milestone.findOneAndUpdate(
      { _id: milestoneId, project: projectId },
      { $set: input },
      { new: true, runValidators: true }
    );
    if (!milestone) {
      return res.status(404).json({
        message: "Milestone not found in this project",
      });
    }
    return res.json(milestone);
  } catch (error) {
    return sendError(res, error);
  }
}

async function deleteMilestone(req, res) {
  try {
    const projectId = assertObjectId(req.params.projectId, "Project ID");
    const milestoneId = assertObjectId(req.params.milestoneId, "Milestone ID");
    const deleted = await Milestone.findOneAndDelete({
      _id: milestoneId,
      project: projectId,
    });
    if (!deleted) {
      return res.status(404).json({
        message: "Milestone not found in this project",
      });
    }
    return res.json({ message: "Milestone deleted", id: deleted._id });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  listMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
};
