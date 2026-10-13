const {
  listWorkspacesForUser,
  createWorkspace,
  ensurePersonalWorkspace,
  ensureOrgBuiltinWorkspaces,
} = require("../utils/workspaces");

/** GET /api/workspaces?organizationId= optional */
exports.listWorkspaces = async (req, res) => {
  try {
    const organizationId = req.query.organizationId || null;
    const orgId =
      organizationId ||
      (req.activeOrganizationId ? String(req.activeOrganizationId) : null);
    const workspaces = await listWorkspacesForUser(req.user._id, {
      organizationId: orgId,
    });
    res.json({ workspaces });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/** POST /api/workspaces — { name, organizationId } */
exports.createWorkspace = async (req, res) => {
  try {
    const organizationId =
      req.body.organizationId ||
      (req.activeOrganizationId ? String(req.activeOrganizationId) : null);
    const workspace = await createWorkspace(req.user._id, {
      name: req.body.name,
      organizationId,
    });
    res.status(201).json({ workspace });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/** POST /api/workspaces/ensure — ensure Personal (+ org builtins if in org) */
exports.ensureWorkspaces = async (req, res) => {
  try {
    await ensurePersonalWorkspace(req.user._id);
    const orgId = req.activeOrganizationId
      ? String(req.activeOrganizationId)
      : req.body.organizationId || null;
    if (orgId) {
      await ensureOrgBuiltinWorkspaces(orgId, req.user._id);
    }
    const workspaces = await listWorkspacesForUser(req.user._id, {
      organizationId: orgId,
    });
    res.json({ workspaces });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
