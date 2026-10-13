const Workspace = require("../models/Workspace");
const Organization = require("../models/Organization");
const Project = require("../models/Project");
const RequestForm = require("../models/RequestForm");
const RequestFormSubmission = require("../models/RequestFormSubmission");

function toPlainWorkspace(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return {
    id: String(obj._id),
    name: obj.name,
    kind: obj.kind,
    organizationId: obj.organization ? String(obj.organization) : null,
    accountUserId: obj.accountUserId ? String(obj.accountUserId) : null,
    createdAt: obj.createdAt || null,
    updatedAt: obj.updatedAt || null,
  };
}

/** Ensure the account-level Personal workspace exists (idempotent). */
async function ensurePersonalWorkspace(userId) {
  let ws = await Workspace.findOne({
    accountUserId: userId,
    kind: "personal",
    isDeleted: { $ne: true },
  });
  if (ws) return ws;
  try {
    ws = await Workspace.create({
      name: "Personal",
      kind: "personal",
      organization: null,
      accountUserId: userId,
      createdBy: userId,
    });
  } catch (err) {
    // Race: unique index — re-fetch
    ws = await Workspace.findOne({
      accountUserId: userId,
      kind: "personal",
      isDeleted: { $ne: true },
    });
    if (!ws) throw err;
  }
  return ws;
}

/** Ensure Internal + External builtins for an organization (idempotent). */
async function ensureOrgBuiltinWorkspaces(organizationId, actorUserId) {
  const builtins = [
    { kind: "internal", name: "Internal" },
    { kind: "external", name: "External" },
  ];
  const results = [];
  for (const item of builtins) {
    let ws = await Workspace.findOne({
      organization: organizationId,
      kind: item.kind,
      isDeleted: { $ne: true },
    });
    if (!ws) {
      try {
        ws = await Workspace.create({
          name: item.name,
          kind: item.kind,
          organization: organizationId,
          accountUserId: null,
          createdBy: actorUserId,
        });
      } catch (err) {
        ws = await Workspace.findOne({
          organization: organizationId,
          kind: item.kind,
          isDeleted: { $ne: true },
        });
        if (!ws) throw err;
      }
    }
    results.push(ws);
  }
  return results;
}

async function listWorkspacesForUser(userId, { organizationId = null } = {}) {
  await ensurePersonalWorkspace(userId);

  const personal = await Workspace.find({
    accountUserId: userId,
    organization: null,
    isDeleted: { $ne: true },
  }).sort({ kind: 1, name: 1 });

  // No org filter → Personal + builtins/customs for every org the user belongs to
  if (!organizationId) {
    const orgs = await Organization.find({
      $or: [{ owner: userId }, { "members.user": userId }],
      isDeleted: { $ne: true },
    }).select("_id");
    const list = personal.map(toPlainWorkspace);
    for (const org of orgs) {
      await ensureOrgBuiltinWorkspaces(org._id, userId);
      const orgSpaces = await Workspace.find({
        organization: org._id,
        isDeleted: { $ne: true },
      }).sort({ kind: 1, name: 1 });
      for (const ws of orgSpaces) list.push(toPlainWorkspace(ws));
    }
    return list;
  }

  const org = await Organization.findOne({
    _id: organizationId,
    isDeleted: { $ne: true },
  });
  if (!org || !org.isMember(userId)) {
    throw new Error("Organization not found or access denied");
  }

  await ensureOrgBuiltinWorkspaces(organizationId, userId);

  const list = [];
  for (const ws of personal) list.push(toPlainWorkspace(ws));
  const orgSpaces = await Workspace.find({
    organization: organizationId,
    isDeleted: { $ne: true },
  }).sort({ kind: 1, name: 1 });
  for (const ws of orgSpaces) list.push(toPlainWorkspace(ws));
  return list;
}

async function createWorkspace(userId, { name, organizationId }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Workspace name is required");

  if (!organizationId) {
    throw new Error("Custom workspaces must belong to an organization");
  }

  const org = await Organization.findOne({
    _id: organizationId,
    isDeleted: { $ne: true },
  });
  if (!org || !org.isMember(userId)) {
    throw new Error("Organization not found or access denied");
  }

  await ensureOrgBuiltinWorkspaces(organizationId, userId);

  const duplicate = await Workspace.findOne({
    organization: organizationId,
    name: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    isDeleted: { $ne: true },
  });
  if (duplicate) {
    throw new Error(`A workspace named "${trimmed}" already exists`);
  }

  const ws = await Workspace.create({
    name: trimmed,
    kind: "custom",
    organization: organizationId,
    accountUserId: null,
    createdBy: userId,
  });
  return toPlainWorkspace(ws);
}

async function getWorkspaceForUser(userId, workspaceId) {
  const ws = await Workspace.findOne({
    _id: workspaceId,
    isDeleted: { $ne: true },
  });
  if (!ws) return null;

  if (ws.kind === "personal" || !ws.organization) {
    if (ws.accountUserId?.toString() !== userId.toString()) return null;
    return ws;
  }

  const org = await Organization.findOne({
    _id: ws.organization,
    isDeleted: { $ne: true },
  });
  if (!org || !org.isMember(userId)) return null;
  return ws;
}

/** Strict workspace filter — only projects assigned to this workspace. */
function applyWorkspaceFilter(filter, workspaceId) {
  if (!workspaceId) return filter;
  return { ...filter, workspace: workspaceId };
}

/** Assign legacy projects (workspace null) to default workspace for the scope. */
async function backfillLegacyProjectWorkspaces(userId, { organizationId, personal } = {}) {
  if (personal === "true" || (!organizationId && personal !== "false")) {
    const personalWs = await ensurePersonalWorkspace(userId);
    await Project.updateMany(
      {
        organization: null,
        owner: userId,
        $or: [{ workspace: null }, { workspace: { $exists: false } }],
        isDeleted: { $ne: true },
      },
      { $set: { workspace: personalWs._id } }
    );
    return;
  }

  if (organizationId) {
    const builtins = await ensureOrgBuiltinWorkspaces(organizationId, userId);
    const internal =
      builtins.find((ws) => ws.kind === "internal") || builtins[0];
    if (!internal) return;
    await Project.updateMany(
      {
        organization: organizationId,
        $or: [{ workspace: null }, { workspace: { $exists: false } }],
        isDeleted: { $ne: true },
      },
      { $set: { workspace: internal._id } }
    );
  }
}

/**
 * Assign legacy Request Forms/Submissions (workspace null) to the
 * organization's default "Internal" workspace. Request Forms are
 * always organization-scoped (there is no personal-workspace variant
 * of this feature), so unlike backfillLegacyProjectWorkspaces there
 * is only the org branch.
 */
async function backfillLegacyRequestFormWorkspaces(userId, organizationId) {
  if (!organizationId) return;

  const builtins = await ensureOrgBuiltinWorkspaces(organizationId, userId);
  const internal = builtins.find((ws) => ws.kind === "internal") || builtins[0];
  if (!internal) return;

  await RequestForm.updateMany(
    {
      organization: organizationId,
      $or: [{ workspace: null }, { workspace: { $exists: false } }],
    },
    { $set: { workspace: internal._id } }
  );

  await RequestFormSubmission.updateMany(
    {
      organization: organizationId,
      $or: [{ workspace: null }, { workspace: { $exists: false } }],
    },
    { $set: { workspace: internal._id } }
  );
}

/** Default workspace when creating a project without an explicit workspaceId. */
async function resolveDefaultWorkspaceId(userId, { organizationId, workspaceId } = {}) {
  if (workspaceId) {
    const ws = await getWorkspaceForUser(userId, workspaceId);
    return ws?._id || null;
  }
  if (organizationId) {
    const builtins = await ensureOrgBuiltinWorkspaces(organizationId, userId);
    const internal =
      builtins.find((ws) => ws.kind === "internal") || builtins[0];
    return internal?._id || null;
  }
  const personalWs = await ensurePersonalWorkspace(userId);
  return personalWs._id;
}

module.exports = {
  toPlainWorkspace,
  ensurePersonalWorkspace,
  ensureOrgBuiltinWorkspaces,
  listWorkspacesForUser,
  createWorkspace,
  getWorkspaceForUser,
  applyWorkspaceFilter,
  backfillLegacyProjectWorkspaces,
  backfillLegacyRequestFormWorkspaces,
  resolveDefaultWorkspaceId,
};
