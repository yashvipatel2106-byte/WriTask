const WorkspaceFile = require("../models/WorkspaceFile");
const Project = require("../models/Project");
const {
  HierarchyError,
  isValidId,
  resolveContainerWorkspace,
  assertCanCreateInOrg,
} = require("../utils/projectHierarchy");

function handleError(res, error) {
  if (error instanceof HierarchyError) {
    return res.status(error.status).json({ message: error.message });
  }
  return res.status(500).json({ message: error.message });
}

exports.listFiles = async (req, res) => {
  try {
    const userId = req.user._id;
    const { organizationId, personal, workspaceId } = req.query;
    const scope = await resolveContainerWorkspace(userId, {
      organizationId,
      personal,
      workspaceId,
    });
    const files = await WorkspaceFile.find({
      workspace: scope.workspaceId,
      isDeleted: { $ne: true },
    }).sort({ order: 1, name: 1 });
    res.json({ files });
  } catch (error) {
    handleError(res, error);
  }
};

exports.createFile = async (req, res) => {
  try {
    const userId = req.user._id;
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "File name is required" });
    }

    const scope = await resolveContainerWorkspace(userId, {
      organizationId: req.body.organizationId,
      workspaceId: req.body.workspaceId,
      personal: req.body.personal,
    });
    await assertCanCreateInOrg(scope.organizationId, userId);

    const file = await WorkspaceFile.create({
      name,
      workspace: scope.workspaceId,
      organization: scope.organizationId || null,
      createdBy: userId,
    });
    res.status(201).json({ file });
  } catch (error) {
    handleError(res, error);
  }
};

exports.updateFile = async (req, res) => {
  try {
    if (!isValidId(req.params.fileId)) {
      return res.status(400).json({ message: "Invalid file" });
    }
    const file = await WorkspaceFile.findOne({
      _id: req.params.fileId,
      isDeleted: { $ne: true },
    });
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }
    await resolveContainerWorkspace(req.user._id, {
      workspaceId: file.workspace,
      organizationId: file.organization,
    });
    if (req.body.name != null) {
      const name = String(req.body.name).trim();
      if (!name) {
        return res.status(400).json({ message: "File name is required" });
      }
      file.name = name;
    }
    await file.save();
    res.json({ file });
  } catch (error) {
    handleError(res, error);
  }
};

exports.deleteFile = async (req, res) => {
  try {
    if (!isValidId(req.params.fileId)) {
      return res.status(400).json({ message: "Invalid file" });
    }
    const file = await WorkspaceFile.findOne({
      _id: req.params.fileId,
      isDeleted: { $ne: true },
    });
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }
    await resolveContainerWorkspace(req.user._id, {
      workspaceId: file.workspace,
      organizationId: file.organization,
    });
    const childCount = await Project.countDocuments({
      workspaceFile: file._id,
      isDeleted: { $ne: true },
    });
    if (childCount > 0) {
      return res.status(400).json({
        message: "Move or delete projects in this file first",
      });
    }
    file.isDeleted = true;
    await file.save();
    res.json({ message: "File deleted" });
  } catch (error) {
    handleError(res, error);
  }
};
