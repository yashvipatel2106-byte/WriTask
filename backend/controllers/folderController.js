const Folder = require("../models/Folder");
const Project = require("../models/Project");
const {
  HierarchyError,
  isValidId,
  resolveContainerWorkspace,
  resolveFolderCreateLocation,
  assertCanCreateInOrg,
} = require("../utils/projectHierarchy");
const {
  ProjectTrashError,
  moveProjectTreesToTrash,
  collectDescendantFolderIds,
} = require("../utils/projectTrash");

function handleError(res, error) {
  if (error instanceof HierarchyError) {
    return res.status(error.status).json({ message: error.message });
  }
  return res.status(500).json({ message: error.message });
}

exports.listFolders = async (req, res) => {
  try {
    const userId = req.user._id;
    const { organizationId, personal, workspaceId } = req.query;
    const scope = await resolveContainerWorkspace(userId, {
      organizationId,
      personal,
      workspaceId,
    });
    const folders = await Folder.find({
      workspace: scope.workspaceId,
      isDeleted: { $ne: true },
    }).sort({ order: 1, name: 1 });
    res.json({ folders });
  } catch (error) {
    handleError(res, error);
  }
};

exports.createFolder = async (req, res) => {
  try {
    const userId = req.user._id;
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "Folder name is required" });
    }

    const location = await resolveFolderCreateLocation(userId, req.body);
    if (!location.skipOrgCreateCheck) {
      await assertCanCreateInOrg(location.organizationId, userId);
    }

    const folder = await Folder.create({
      name,
      workspace: location.workspaceId,
      organization: location.organizationId || null,
      parentFolder: location.parentFolderId || null,
      parentProject: location.parentProjectId || null,
      createdBy: userId,
    });
    res.status(201).json({ folder });
  } catch (error) {
    handleError(res, error);
  }
};

exports.updateFolder = async (req, res) => {
  try {
    if (!isValidId(req.params.folderId)) {
      return res.status(400).json({ message: "Invalid folder" });
    }
    const folder = await Folder.findOne({
      _id: req.params.folderId,
      isDeleted: { $ne: true },
    });
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }
    await resolveContainerWorkspace(req.user._id, {
      workspaceId: folder.workspace,
      organizationId: folder.organization,
    });
    if (req.body.name != null) {
      const name = String(req.body.name).trim();
      if (!name) {
        return res.status(400).json({ message: "Folder name is required" });
      }
      folder.name = name;
    }
    await folder.save();
    res.json({ folder });
  } catch (error) {
    handleError(res, error);
  }
};

exports.deleteFolder = async (req, res) => {
  try {
    if (!isValidId(req.params.folderId)) {
      return res.status(400).json({ message: "Invalid folder" });
    }
    const folder = await Folder.findOne({
      _id: req.params.folderId,
      isDeleted: { $ne: true },
    });
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }
    const scope = await resolveContainerWorkspace(req.user._id, {
      workspaceId: folder.workspace,
      organizationId: folder.organization,
    });
    await assertCanCreateInOrg(scope.organizationId, req.user._id);

    const allFolderIds = await collectDescendantFolderIds([folder._id]);

    const rootProjectIds = await Project.find({
      folder: { $in: allFolderIds },
      parentProject: null,
      isDeleted: { $ne: true },
    }).distinct("_id");

    const { trashed, deletedAt, projectIds } = await moveProjectTreesToTrash(
      rootProjectIds,
      req.user._id,
      { requireOwner: true, assertOwnership: true }
    );

    const deletedAtValue = deletedAt || new Date();

    if (projectIds.length) {
      await Folder.updateMany(
        {
          parentProject: { $in: projectIds },
          isDeleted: { $ne: true },
        },
        { isDeleted: true, deletedAt: deletedAtValue }
      );
    }

    await Folder.updateMany(
      { _id: { $in: allFolderIds }, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: deletedAtValue }
    );

    res.json({
      message:
        trashed > 0
          ? `Folder moved to trash with ${trashed} project(s)`
          : "Folder moved to trash",
      trashedProjects: trashed,
    });
  } catch (error) {
    if (error instanceof ProjectTrashError) {
      return res.status(error.status).json({ message: error.message });
    }
    handleError(res, error);
  }
};
