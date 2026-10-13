const crypto = require("crypto");
const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const User = require("../models/user");
const Task = require("../models/Task");
const Project = require("../models/Project");
const CustomField = require("../models/CustomField");
const Workspace = require("../models/Workspace");
const { ALLOWED_CUSTOM_FIELD_TYPES } = require("./kanbanCardPreview");
const { resolveMemberOrgPermissions } = require("./roleDefinitions");
const {
  ensureOrgBuiltinWorkspaces,
  ensurePersonalWorkspace,
} = require("./workspaces");

function emptyValueForType(type) {
  if (type === "checkbox") return false;
  if (type === "multiple_select") return [];
  return null;
}

function normalizeNumberConfig(raw, type) {
  if (type !== "number") return undefined;
  const src = raw && typeof raw === "object" ? raw : {};
  const aggregation = String(src.defaultAggregation || "none");
  const allowed = ["none", "sum", "avg", "min", "max"];
  let decimalPlaces = Number(src.decimalPlaces);
  if (!Number.isFinite(decimalPlaces) || decimalPlaces < 0) decimalPlaces = 0;
  if (decimalPlaces > 6) decimalPlaces = 6;
  return {
    defaultAggregation: allowed.includes(aggregation) ? aggregation : "none",
    decimalPlaces: Math.floor(decimalPlaces),
    sample: String(src.sample ?? "5000").slice(0, 32),
    useThousandsSeparator: Boolean(src.useThousandsSeparator),
    showConditionalMarker: Boolean(src.showConditionalMarker),
  };
}

function normalizePermissions(raw) {
  return raw === "admins" ? "admins" : "everyone";
}

function normalizeScope(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return ["tasks"];
  const allowed = new Set(["tasks", "projects", "folders"]);
  const cleaned = [
    ...new Set(raw.map((s) => String(s)).filter((s) => allowed.has(s))),
  ];
  return cleaned.length ? cleaned : ["tasks"];
}

const SPACE_TYPES = ["internal", "external", "specific"];

/**
 * Derive Wrike-style location from stored fields (including legacy rows).
 * Prefer workspaceId when present; otherwise fall back to spaceType / org scopes.
 */
function deriveSpaceLocation(obj) {
  const rawType = String(obj?.spaceType || "").trim();
  if (SPACE_TYPES.includes(rawType)) {
    return {
      spaceType: rawType,
      spaceId: obj.spaceId ? String(obj.spaceId) : null,
      workspaceId: obj.workspaceId ? String(obj.workspaceId) : null,
    };
  }

  const orgIds = (obj?.organizationIds || []).map((id) => String(id));
  const includePersonal = Boolean(obj?.includePersonal);

  if (includePersonal && orgIds.length === 0) {
    return {
      spaceType: "internal",
      spaceId: null,
      workspaceId: obj.workspaceId ? String(obj.workspaceId) : null,
    };
  }
  if (!includePersonal && orgIds.length >= 1) {
    return {
      spaceType: "specific",
      spaceId: orgIds[0],
      workspaceId: obj.workspaceId ? String(obj.workspaceId) : null,
    };
  }
  if (includePersonal && orgIds.length > 0) {
    return {
      spaceType: "specific",
      spaceId: orgIds[0],
      workspaceId: obj.workspaceId ? String(obj.workspaceId) : null,
    };
  }
  return {
    spaceType: "internal",
    spaceId: null,
    workspaceId: obj.workspaceId ? String(obj.workspaceId) : null,
  };
}

/**
 * Resolve availability scopes + normalized location from create/update payload.
 * Prefers workspaceId (new); also accepts spaceType/spaceId or legacy org scopes.
 */
async function resolveLocationScopes(userId, payload) {
  if (payload.workspaceId) {
    const {
      getWorkspaceForUser,
      ensurePersonalWorkspace,
    } = require("./workspaces");
    const ws = await getWorkspaceForUser(userId, payload.workspaceId);
    if (!ws) {
      throw new Error("Select a valid workspace for this custom field.");
    }

    if (ws.kind === "personal" || !ws.organization) {
      await ensurePersonalWorkspace(userId);
      return {
        spaceType: "internal",
        spaceId: null,
        workspaceId: String(ws._id),
        includePersonal: true,
        organizationIds: [],
      };
    }

    const organizationIds = await assertCanManageScopes(
      userId,
      [ws.organization],
      false
    );
    const spaceType =
      ws.kind === "internal"
        ? "specific"
        : ws.kind === "external"
          ? "external"
          : "specific";
    return {
      spaceType,
      spaceId: organizationIds[0],
      workspaceId: String(ws._id),
      includePersonal: false,
      organizationIds,
    };
  }

  const hasLocation =
    payload.spaceType !== undefined || payload.spaceId !== undefined;

  if (hasLocation) {
    const spaceType = String(payload.spaceType || "").trim();
    if (!SPACE_TYPES.includes(spaceType)) {
      throw new Error(
        "Select where this field should exist (a workspace is required)."
      );
    }

    if (spaceType === "internal") {
      const { ensurePersonalWorkspace } = require("./workspaces");
      const personal = await ensurePersonalWorkspace(userId);
      await assertCanManageScopes(userId, [], true);
      return {
        spaceType: "internal",
        spaceId: null,
        workspaceId: String(personal._id),
        includePersonal: true,
        organizationIds: [],
      };
    }

    const spaceIdRaw = payload.spaceId;
    const isPersonalPick =
      spaceIdRaw === null ||
      spaceIdRaw === undefined ||
      spaceIdRaw === "" ||
      spaceIdRaw === "personal";

    if (spaceType === "external") {
      if (isPersonalPick) {
        throw new Error("External Space requires selecting an organization.");
      }
      const { ensureOrgBuiltinWorkspaces } = require("./workspaces");
      const organizationIds = await assertCanManageScopes(
        userId,
        [spaceIdRaw],
        false
      );
      const builtins = await ensureOrgBuiltinWorkspaces(
        organizationIds[0],
        userId
      );
      const external = builtins.find((w) => w.kind === "external") || builtins[0];
      return {
        spaceType: "external",
        spaceId: organizationIds[0],
        workspaceId: external ? String(external._id) : null,
        includePersonal: false,
        organizationIds,
      };
    }

    // specific
    if (isPersonalPick) {
      const { ensurePersonalWorkspace } = require("./workspaces");
      const personal = await ensurePersonalWorkspace(userId);
      await assertCanManageScopes(userId, [], true);
      return {
        spaceType: "specific",
        spaceId: null,
        workspaceId: String(personal._id),
        includePersonal: true,
        organizationIds: [],
      };
    }
    const { ensureOrgBuiltinWorkspaces } = require("./workspaces");
    const organizationIds = await assertCanManageScopes(
      userId,
      [spaceIdRaw],
      false
    );
    const builtins = await ensureOrgBuiltinWorkspaces(
      organizationIds[0],
      userId
    );
    const internal = builtins.find((w) => w.kind === "internal") || builtins[0];
    return {
      spaceType: "specific",
      spaceId: organizationIds[0],
      workspaceId: internal ? String(internal._id) : null,
      includePersonal: false,
      organizationIds,
    };
  }

  // Legacy path: organizationIds / includePersonal
  const includePersonal = Boolean(payload.includePersonal);
  const organizationIds = await assertCanManageScopes(
    userId,
    payload.organizationIds || [],
    includePersonal
  );
  const derived = deriveSpaceLocation({
    includePersonal,
    organizationIds,
  });
  let workspaceId = null;
  try {
    const {
      ensurePersonalWorkspace,
      ensureOrgBuiltinWorkspaces,
    } = require("./workspaces");
    if (includePersonal && organizationIds.length === 0) {
      const personal = await ensurePersonalWorkspace(userId);
      workspaceId = String(personal._id);
    } else if (organizationIds[0]) {
      const builtins = await ensureOrgBuiltinWorkspaces(
        organizationIds[0],
        userId
      );
      const pick = builtins.find((w) => w.kind === "internal") || builtins[0];
      workspaceId = pick ? String(pick._id) : null;
    }
  } catch (_) {
    /* ignore */
  }
  return {
    ...derived,
    workspaceId,
    includePersonal,
    organizationIds,
  };
}

function toPlainDefinition(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const type = obj.type;
  const location = deriveSpaceLocation(obj);
  return {
    id: String(obj._id || obj.id),
    name: obj.name,
    type,
    description: obj.description || "",
    options: Array.isArray(obj.options) ? obj.options : [],
    numberConfig: normalizeNumberConfig(obj.numberConfig, type),
    permissions: normalizePermissions(obj.permissions),
    scope: normalizeScope(obj.scope),
    spaceType: location.spaceType,
    spaceId: location.spaceId,
    workspaceId: location.workspaceId || (obj.workspaceId ? String(obj.workspaceId) : null),
    organizationIds: (obj.organizationIds || []).map((id) => id.toString()),
    includePersonal: Boolean(obj.includePersonal),
    createdBy: (() => {
      if (!obj.createdBy) return null;
      if (typeof obj.createdBy === "object" && obj.createdBy._id) {
        return String(obj.createdBy._id);
      }
      return String(obj.createdBy);
    })(),
    authorName: (() => {
      if (!obj.createdBy || typeof obj.createdBy !== "object") return null;
      return obj.createdBy.username || obj.createdBy.email || null;
    })(),
    isActive: obj.isActive !== false,
    createdAt: obj.createdAt || null,
    updatedAt: obj.updatedAt || null,
    source: "catalog",
  };
}

function normalizeCustomFieldDefinition(raw) {
  const id = String(raw?.id || raw?._id || "").trim();
  const name = String(raw?.name || "").trim();
  const type = String(raw?.type || "").trim();
  if (!id || !name || !ALLOWED_CUSTOM_FIELD_TYPES.includes(type)) return null;
  const options = Array.isArray(raw.options)
    ? raw.options.map((opt) => String(opt).trim()).filter(Boolean)
    : [];
  const organizationIds = Array.isArray(raw.organizationIds)
    ? raw.organizationIds.map((oid) => String(oid))
    : [];
  const includePersonal = Boolean(raw.includePersonal);
  const location = deriveSpaceLocation({
    spaceType: raw.spaceType,
    spaceId: raw.spaceId,
    organizationIds,
    includePersonal,
  });
  return {
    id,
    name,
    type,
    description: String(raw.description || "").trim(),
    options,
    numberConfig: normalizeNumberConfig(raw.numberConfig, type),
    permissions: normalizePermissions(raw.permissions),
    scope: normalizeScope(raw.scope),
    spaceType: location.spaceType,
    spaceId: location.spaceId,
    workspaceId: location.workspaceId || null,
    organizationIds,
    includePersonal,
    createdAt: raw.createdAt || new Date(),
    updatedAt: raw.updatedAt || null,
    source: raw.source || "legacy",
  };
}

function cleanSelectOptions(fieldType, options) {
  if (
    fieldType !== "single_select" &&
    fieldType !== "multiple_select"
  ) {
    return [];
  }
  if (!Array.isArray(options)) {
    throw new Error("Options must be an array");
  }
  const cleaned = [
    ...new Set(
      options.map((option) => String(option).trim()).filter(Boolean)
    ),
  ];
  if (cleaned.length === 0) {
    throw new Error("At least one option is required for select fields");
  }
  return cleaned;
}

async function resolveWorkspaceDoc(project) {
  if (project.organization) {
    const orgId = project.organization._id || project.organization;
    return Organization.findById(orgId);
  }
  const ownerId = project.owner?._id || project.owner;
  return User.findById(ownerId);
}

function projectOrgId(project) {
  if (!project?.organization) return null;
  return (project.organization._id || project.organization).toString();
}

/**
 * Fields available to a project:
 * - Catalog fields scoped to the project's organization, or personal when org is null
 * - Legacy embedded definitions on Organization / User (scoped to that workspace only)
 */
async function resolveProjectWorkspaceId(project) {
  const raw = project.workspace?._id || project.workspace;
  if (raw) return String(raw);

  const orgId = projectOrgId(project);
  const ownerId = project.owner?._id || project.owner;
  if (orgId && ownerId) {
    const builtins = await ensureOrgBuiltinWorkspaces(orgId, ownerId);
    const internal =
      builtins.find((ws) => ws.kind === "internal") || builtins[0];
    return internal ? String(internal._id) : null;
  }
  if (ownerId) {
    const personal = await ensurePersonalWorkspace(ownerId);
    return String(personal._id);
  }
  return null;
}

function fieldBelongsToWorkspace(field, projectWorkspaceId) {
  const wsId = field.workspaceId ? String(field.workspaceId) : null;
  const orgIds = field.organizationIds || [];
  const isPersonalField =
    Boolean(field.includePersonal) && orgIds.length === 0;

  if (isPersonalField) {
    if (!projectWorkspaceId) return true;
    return !wsId || wsId === String(projectWorkspaceId);
  }

  if (!projectWorkspaceId) return !wsId;
  if (!wsId) return true;
  return wsId === String(projectWorkspaceId);
}

async function enrichFieldsWithWorkspaceNames(fields) {
  const wsIds = [...new Set(fields.map((f) => f.workspaceId).filter(Boolean))];
  if (wsIds.length === 0) return fields;
  const workspaces = await Workspace.find({
    _id: { $in: wsIds },
    isDeleted: { $ne: true },
  }).select("name");
  const nameById = new Map(workspaces.map((w) => [String(w._id), w.name]));
  return fields.map((field) => ({
    ...field,
    workspaceName: field.workspaceId
      ? nameById.get(field.workspaceId) || null
      : null,
  }));
}

async function getWorkspaceCustomFieldDefinitions(project) {
  const grouped = await getProjectCustomFieldDefinitionsGrouped(project);
  return grouped.currentWorkspaceFields;
}

/**
 * Custom fields editable on tasks: current workspace + other-workspace fields
 * enabled in this project's card preview config.
 */
async function getTaskEditableCustomFieldDefinitions(project) {
  const grouped = await getProjectCustomFieldDefinitionsGrouped(project);
  const enabled = project.cardPreviewConfig?.customFields || {};
  const adopted = new Set(
    (project.adoptedCustomFieldIds || []).map((id) => String(id))
  );
  const current = grouped.currentWorkspaceFields;
  const enabledOther = grouped.otherWorkspaceFields.filter(
    (field) => enabled[field.id] || adopted.has(field.id)
  );
  const seen = new Set(current.map((field) => field.id));
  const merged = [...current];
  for (const field of enabledOther) {
    if (!seen.has(field.id)) {
      merged.push(field);
      seen.add(field.id);
    }
  }
  return merged;
}

/**
 * Custom fields for card preview / settings: current workspace vs other workspaces.
 */
async function getProjectCustomFieldDefinitionsGrouped(project) {
  const orgId = projectOrgId(project);
  const projectWorkspaceId = await resolveProjectWorkspaceId(project);

  let catalogQuery;
  if (orgId) {
    const adoptedIds = (project.adoptedCustomFieldIds || []).map((id) =>
      String(id)
    );
    const orgClauses = [{ organizationIds: orgId }];
    if (adoptedIds.length) {
      orgClauses.push({ _id: { $in: adoptedIds } });
    }
    catalogQuery = { $or: orgClauses };
  } else {
    const ownerId = project.owner?._id || project.owner;
    const personalOrClauses = [{ includePersonal: true }];
    if (projectWorkspaceId) {
      personalOrClauses.push({ workspaceId: projectWorkspaceId });
    }
    catalogQuery = {
      accountUserId: ownerId,
      $or: personalOrClauses,
    };
  }

  const catalog = await CustomField.find(catalogQuery).sort({ name: 1 });
  const fromCatalog = catalog
    .map(toPlainDefinition)
    .filter((field) => field && field.isActive !== false);

  const doc = await resolveWorkspaceDoc(project);
  const legacy = Array.isArray(doc?.customFieldDefinitions)
    ? doc.customFieldDefinitions
        .map((row) =>
          normalizeCustomFieldDefinition({
            ...((typeof row.toObject === "function" ? row.toObject() : row) ||
              {}),
            organizationIds: orgId ? [orgId] : [],
            includePersonal: !orgId,
            source: "legacy",
          })
        )
        .filter(Boolean)
    : [];

  const currentWorkspaceFields = [];
  const otherWorkspaceFields = [];
  const seen = new Set();

  for (const field of fromCatalog) {
    seen.add(field.id);
    if (fieldBelongsToWorkspace(field, projectWorkspaceId)) {
      currentWorkspaceFields.push(field);
    } else {
      otherWorkspaceFields.push(field);
    }
  }

  for (const field of legacy) {
    if (seen.has(field.id)) continue;
    seen.add(field.id);
    if (fieldBelongsToWorkspace(field, projectWorkspaceId)) {
      currentWorkspaceFields.push(field);
    } else {
      otherWorkspaceFields.push(field);
    }
  }

  // Include adopted / card-preview fields even when the catalog query above
  // missed them (e.g. personal-workspace fields on an org project).
  const adoptedIds = (project.adoptedCustomFieldIds || []).map((id) =>
    String(id)
  );
  const previewEnabledIds = Object.entries(
    project.cardPreviewConfig?.customFields || {}
  )
    .filter(([, enabled]) => Boolean(enabled))
    .map(([id]) => id);
  const missingIds = [...new Set([...adoptedIds, ...previewEnabledIds])].filter(
    (id) => id && !seen.has(id)
  );

  if (missingIds.length > 0) {
    const extras = await CustomField.find({ _id: { $in: missingIds } }).sort({
      name: 1,
    });
    for (const doc of extras) {
      const field = toPlainDefinition(doc);
      if (!field || field.isActive === false) continue;
      seen.add(field.id);
      if (fieldBelongsToWorkspace(field, projectWorkspaceId)) {
        currentWorkspaceFields.push(field);
      } else {
        otherWorkspaceFields.push(field);
      }
    }
  }

  return {
    currentWorkspaceFields,
    otherWorkspaceFields: await enrichFieldsWithWorkspaceNames(
      otherWorkspaceFields
    ),
    projectWorkspaceId,
  };
}

async function userCanManageOrg(userId, organizationId) {
  const org = await Organization.findOne({
    _id: organizationId,
    isDeleted: { $ne: true },
  });
  if (!org) return false;
  if (org.owner?.toString() === userId.toString()) return true;
  const perms = resolveMemberOrgPermissions(org, userId);
  return perms.includes("org:update");
}

async function assertCanManageScopes(userId, organizationIds, includePersonal) {
  const orgIds = [...new Set((organizationIds || []).map((id) => String(id)))];
  if (!includePersonal && orgIds.length === 0) {
    throw new Error("Select at least one space (organization or Personal).");
  }
  for (const orgId of orgIds) {
    const allowed = await userCanManageOrg(userId, orgId);
    if (!allowed) {
      throw new Error(
        "You need admin access in every selected organization to manage this field."
      );
    }
  }
  return orgIds;
}

async function listAccountCustomFields(userId) {
  const orgs = await Organization.find({
    "members.user": userId,
    isDeleted: { $ne: true },
  }).select("_id name slug members owner");

  const manageableOrgIds = [];
  const orgMeta = [];
  for (const org of orgs) {
    const canManage =
      org.owner?.toString() === userId.toString() ||
      resolveMemberOrgPermissions(org, userId).includes("org:update");
    orgMeta.push({
      organizationId: org._id.toString(),
      name: org.name,
      slug: org.slug,
      canManage,
    });
    if (canManage) manageableOrgIds.push(org._id);
  }

  const catalog = await CustomField.find({
    $or: [
      { accountUserId: userId },
      { organizationIds: { $in: manageableOrgIds } },
      { includePersonal: true, accountUserId: userId },
    ],
  })
    .populate("createdBy", "username email")
    .sort({ name: 1 });

  // Also surface legacy embedded defs the user can manage
  const legacyFields = [];
  for (const org of orgs) {
    if (!manageableOrgIds.some((id) => id.toString() === org._id.toString())) {
      continue;
    }
    const full = await Organization.findById(org._id);
    for (const row of full?.customFieldDefinitions || []) {
      const normalized = normalizeCustomFieldDefinition({
        ...(typeof row.toObject === "function" ? row.toObject() : row),
        organizationIds: [org._id.toString()],
        includePersonal: false,
        source: "legacy",
      });
      if (normalized) legacyFields.push(normalized);
    }
  }
  const user = await User.findById(userId).select("customFieldDefinitions username email");
  for (const row of user?.customFieldDefinitions || []) {
    const normalized = normalizeCustomFieldDefinition({
      ...(typeof row.toObject === "function" ? row.toObject() : row),
      organizationIds: [],
      includePersonal: true,
      source: "legacy",
    });
    if (normalized) legacyFields.push(normalized);
  }

  const fields = catalog.map(toPlainDefinition);
  const seen = new Set(fields.map((f) => f.id));
  for (const field of legacyFields) {
    if (!seen.has(field.id)) {
      fields.push({
        ...field,
        isActive: true,
        authorName: user?.username || user?.email || null,
        createdBy: String(userId),
        timesUsedTotal: 0,
        addedTo: [],
      });
      seen.add(field.id);
    }
  }

  const fieldIds = fields.map((f) => f.id);
  const usageByField = new Map();
  const addedToByField = new Map();

  if (fieldIds.length > 0) {
    const [usageRows, adoptedProjects] = await Promise.all([
      Task.aggregate([
        {
          $match: {
            isDeleted: { $ne: true },
            "customFieldValues.fieldId": { $in: fieldIds },
          },
        },
        { $unwind: "$customFieldValues" },
        {
          $match: {
            "customFieldValues.fieldId": { $in: fieldIds },
            "customFieldValues.value": { $nin: [null, ""] },
          },
        },
        {
          $group: {
            _id: "$customFieldValues.fieldId",
            count: { $sum: 1 },
          },
        },
      ]),
      Project.find({
        isDeleted: { $ne: true },
        adoptedCustomFieldIds: { $in: fieldIds },
      })
        .select("title adoptedCustomFieldIds")
        .lean(),
    ]);

    for (const row of usageRows) {
      usageByField.set(String(row._id), row.count);
    }
    for (const project of adoptedProjects) {
      const title = project.title || "Untitled project";
      for (const fid of project.adoptedCustomFieldIds || []) {
        const id = String(fid);
        if (!seen.has(id)) continue;
        if (!addedToByField.has(id)) addedToByField.set(id, []);
        addedToByField.get(id).push(title);
      }
    }
  }

  for (const field of fields) {
    field.timesUsedTotal = usageByField.get(field.id) || 0;
    field.addedTo = addedToByField.get(field.id) || [];
    if (!field.authorName && field.createdBy === String(userId)) {
      field.authorName = user?.username || user?.email || null;
    }
  }

  const enrichedFields = await enrichFieldsWithWorkspaceNames(fields);

  return {
    fields: enrichedFields,
    spaces: [
      ...orgMeta,
      {
        organizationId: null,
        name: "Personal Workspace",
        slug: "personal",
        canManage: true,
        isPersonal: true,
      },
    ],
  };
}

async function createAccountCustomField(userId, payload) {
  const name = String(payload.name || "").trim();
  const type = String(payload.type || "").trim();
  const description = String(payload.description || "").trim();

  if (!name) throw new Error("Field name is required");
  if (!ALLOWED_CUSTOM_FIELD_TYPES.includes(type)) {
    throw new Error(
      `Invalid field type. Allowed: ${ALLOWED_CUSTOM_FIELD_TYPES.join(", ")}`
    );
  }

  const location = await resolveLocationScopes(userId, payload);
  const options = cleanSelectOptions(type, payload.options || []);
  const numberConfig = normalizeNumberConfig(payload.numberConfig, type);
  const permissions = normalizePermissions(payload.permissions);
  const scope = normalizeScope(payload.scope);

  const duplicate = await CustomField.findOne({
    accountUserId: userId,
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  });
  if (duplicate) {
    throw new Error(`A custom field named "${name}" already exists`);
  }

  const field = await CustomField.create({
    accountUserId: userId,
    name,
    type,
    description,
    options,
    numberConfig,
    permissions,
    scope,
    spaceType: location.spaceType,
    spaceId: location.spaceId,
    workspaceId: location.workspaceId || null,
    organizationIds: location.organizationIds,
    includePersonal: location.includePersonal,
    createdBy: userId,
  });

  await adoptFieldOntoMatchingProjects(field);
  return toPlainDefinition(field);
}

async function updateAccountCustomField(userId, fieldId, payload) {
  let field = null;
  let legacy = null;

  if (mongoose.Types.ObjectId.isValid(fieldId)) {
    field = await CustomField.findById(fieldId);
  }

  if (!field) {
    // Legacy embedded field update: migrate into catalog then update
    legacy = await findLegacyField(userId, fieldId);
    if (!legacy) throw new Error("Custom field not found");
    field = await CustomField.create({
      accountUserId: userId,
      name: legacy.name,
      type: legacy.type,
      description: legacy.description || "",
      options: legacy.options || [],
      organizationIds: legacy.organizationIds || [],
      includePersonal: Boolean(legacy.includePersonal),
      createdBy: userId,
    });
    // Keep same public id by using legacy id isn't possible with ObjectId —
    // remove legacy after migrate and rewrite task values? Safer: update legacy in place for legacy ids.
    await CustomField.deleteOne({ _id: field._id });
    return updateLegacyField(userId, fieldId, payload, legacy);
  }

  const nextOrgIds =
    payload.organizationIds !== undefined
      ? payload.organizationIds
      : field.organizationIds;
  const nextPersonal =
    payload.includePersonal !== undefined
      ? Boolean(payload.includePersonal)
      : field.includePersonal;

  const locationFieldsChanging =
    payload.workspaceId !== undefined ||
    payload.spaceType !== undefined ||
    payload.spaceId !== undefined ||
    payload.organizationIds !== undefined ||
    payload.includePersonal !== undefined;

  if (locationFieldsChanging) {
    const locationPayload =
      payload.workspaceId !== undefined ||
      payload.spaceType !== undefined ||
      payload.spaceId !== undefined
        ? payload
        : {
            organizationIds: nextOrgIds,
            includePersonal: nextPersonal,
          };
    const location = await resolveLocationScopes(userId, locationPayload);
    field.spaceType = location.spaceType;
    field.spaceId = location.spaceId;
    field.workspaceId = location.workspaceId || null;
    field.organizationIds = location.organizationIds;
    field.includePersonal = location.includePersonal;
  }

  if (payload.name !== undefined) {
    const name = String(payload.name).trim();
    if (!name) throw new Error("Field name is required");
    field.name = name;
  }
  if (payload.description !== undefined) {
    field.description = String(payload.description || "").trim();
  }
  if (payload.type !== undefined && String(payload.type) !== field.type) {
    throw new Error(
      "Changing field type is not allowed because existing task values may become invalid."
    );
  }
  if (payload.options !== undefined) {
    field.options = cleanSelectOptions(field.type, payload.options);
  }
  if (payload.numberConfig !== undefined && field.type === "number") {
    field.numberConfig = normalizeNumberConfig(
      payload.numberConfig,
      field.type
    );
  }
  if (payload.permissions !== undefined) {
    field.permissions = normalizePermissions(payload.permissions);
  }
  if (payload.scope !== undefined) {
    field.scope = normalizeScope(payload.scope);
  }
  if (payload.isActive !== undefined) {
    field.isActive = Boolean(payload.isActive);
  }
  await field.save();
  if (locationFieldsChanging) {
    await adoptFieldOntoMatchingProjects(field);
  }
  return toPlainDefinition(field);
}

async function findLegacyField(userId, fieldId) {
  const { fields } = await listAccountCustomFields(userId);
  return fields.find((f) => f.id === fieldId && f.source === "legacy") || null;
}

async function updateLegacyField(userId, fieldId, payload, legacyMeta) {
  if (payload.type !== undefined && String(payload.type) !== legacyMeta.type) {
    throw new Error(
      "Changing field type is not allowed because existing task values may become invalid."
    );
  }

  const locationPayload =
    payload.workspaceId !== undefined ||
    payload.spaceType !== undefined ||
    payload.spaceId !== undefined
      ? payload
      : {
          organizationIds:
            payload.organizationIds !== undefined
              ? payload.organizationIds
              : legacyMeta.organizationIds || [],
          includePersonal:
            payload.includePersonal !== undefined
              ? Boolean(payload.includePersonal)
              : Boolean(legacyMeta.includePersonal),
        };
  const location = await resolveLocationScopes(userId, locationPayload);

  const name =
    payload.name !== undefined
      ? String(payload.name).trim()
      : legacyMeta.name;
  if (!name) throw new Error("Field name is required");

  const options =
    payload.options !== undefined
      ? cleanSelectOptions(legacyMeta.type, payload.options)
      : legacyMeta.options || [];

  const description =
    payload.description !== undefined
      ? String(payload.description || "").trim()
      : legacyMeta.description || "";

  // Remove from legacy stores
  await removeLegacyFieldEverywhere(fieldId);

  const created = await CustomField.create({
    accountUserId: userId,
    name,
    type: legacyMeta.type,
    description,
    options,
    spaceType: location.spaceType,
    spaceId: location.spaceId,
    workspaceId: location.workspaceId || null,
    organizationIds: location.organizationIds,
    includePersonal: location.includePersonal,
    createdBy: userId,
  });

  // Rewrite task/project references from old legacy id → new catalog id
  if (created._id.toString() !== fieldId) {
    await Task.updateMany(
      { "customFieldValues.fieldId": fieldId },
      { $set: { "customFieldValues.$[elem].fieldId": created._id.toString() } },
      { arrayFilters: [{ "elem.fieldId": fieldId }] }
    );
    const projectsWithAdopt = await Project.find({
      adoptedCustomFieldIds: fieldId,
    });
    for (const project of projectsWithAdopt) {
      project.adoptedCustomFieldIds = (project.adoptedCustomFieldIds || []).map(
        (id) => (id === fieldId ? created._id.toString() : id)
      );
      if (project.cardPreviewConfig?.customFields?.[fieldId] !== undefined) {
        const next = { ...(project.cardPreviewConfig.customFields || {}) };
        next[created._id.toString()] = next[fieldId];
        delete next[fieldId];
        project.cardPreviewConfig.customFields = next;
        project.markModified("cardPreviewConfig");
      }
      await project.save();
    }
  }

  await adoptFieldOntoMatchingProjects(created);
  return toPlainDefinition(created);
}

async function removeLegacyFieldEverywhere(fieldId) {
  const orgs = await Organization.find({
    "customFieldDefinitions.id": fieldId,
  });
  for (const org of orgs) {
    org.customFieldDefinitions = (org.customFieldDefinitions || []).filter(
      (f) => f.id !== fieldId
    );
    org.markModified("customFieldDefinitions");
    await org.save();
  }
  const users = await User.find({ "customFieldDefinitions.id": fieldId });
  for (const user of users) {
    user.customFieldDefinitions = (user.customFieldDefinitions || []).filter(
      (f) => f.id !== fieldId
    );
    user.markModified("customFieldDefinitions");
    await user.save();
  }
}

async function deleteAccountCustomField(userId, fieldId) {
  if (mongoose.Types.ObjectId.isValid(fieldId)) {
    const field = await CustomField.findById(fieldId);
    if (field) {
      await assertCanManageScopes(
        userId,
        field.organizationIds,
        field.includePersonal
      );
      await cleanupFieldFromProjectsAndTasks(fieldId);
      await field.deleteOne();
      return true;
    }
  }

  const legacy = await findLegacyField(userId, fieldId);
  if (!legacy) throw new Error("Custom field not found");
  await assertCanManageScopes(
    userId,
    legacy.organizationIds || [],
    Boolean(legacy.includePersonal)
  );
  await removeLegacyFieldEverywhere(fieldId);
  await cleanupFieldFromProjectsAndTasks(fieldId);
  return true;
}

async function cleanupFieldFromProjectsAndTasks(fieldId) {
  const projects = await Project.find({
    $or: [
      { adoptedCustomFieldIds: fieldId },
      { [`cardPreviewConfig.customFields.${fieldId}`]: { $exists: true } },
    ],
  });

  for (const project of projects) {
    let dirty = false;
    const before = (project.adoptedCustomFieldIds || []).length;
    project.adoptedCustomFieldIds = (project.adoptedCustomFieldIds || []).filter(
      (id) => id !== fieldId
    );
    if (project.adoptedCustomFieldIds.length !== before) dirty = true;
    if (project.cardPreviewConfig?.customFields?.[fieldId] !== undefined) {
      const next = { ...(project.cardPreviewConfig.customFields || {}) };
      delete next[fieldId];
      project.cardPreviewConfig.customFields = next;
      project.markModified("cardPreviewConfig");
      dirty = true;
    }
    if (dirty) await project.save();
  }

  await Task.updateMany(
    { "customFieldValues.fieldId": fieldId },
    { $pull: { customFieldValues: { fieldId } } }
  );
}

async function adoptFieldOntoMatchingProjects(field) {
  const wsId = field.workspaceId;
  let query;
  if (wsId) {
    query = { workspace: wsId, isDeleted: { $ne: true } };
  } else {
    const orgIds = (field.organizationIds || []).map((id) => id.toString());
    query = { $or: [] };
    if (orgIds.length) {
      query.$or.push({ organization: { $in: orgIds } });
    }
    if (field.includePersonal) {
      query.$or.push({
        organization: null,
        owner: field.accountUserId,
      });
    }
    if (!query.$or.length) return;
  }

  const projects = await Project.find(query);
  for (const project of projects) {
    await adoptCustomFieldOnProject(project, {
      id: field._id.toString(),
      type: field.type,
    });
  }
}

/**
 * Create from a project context: scopes default to that project's space,
 * optionally overridden by organizationIds / includePersonal in the body.
 */
async function createWorkspaceCustomField(
  project,
  {
    name,
    type,
    options = [],
    description = "",
    organizationIds,
    includePersonal,
    spaceType,
    spaceId,
    workspaceId,
    numberConfig,
    permissions,
    scope,
    actorUserId,
  }
) {
  const actorId = actorUserId || project.owner?._id || project.owner;
  const orgId = projectOrgId(project);

  // Prefer explicit location from the create dialog.
  if (workspaceId !== undefined || spaceType !== undefined) {
    return createAccountCustomField(actorId, {
      name,
      type,
      options,
      description,
      workspaceId,
      spaceType,
      spaceId,
      numberConfig,
      permissions,
      scope,
    });
  }

  let scopesOrgIds;
  let scopesPersonal;
  if (organizationIds !== undefined || includePersonal !== undefined) {
    scopesOrgIds = organizationIds || [];
    scopesPersonal = Boolean(includePersonal);
  } else if (orgId) {
    scopesOrgIds = [orgId];
    scopesPersonal = false;
  } else {
    scopesOrgIds = [];
    scopesPersonal = true;
  }

  return createAccountCustomField(actorId, {
    name,
    type,
    options,
    description,
    organizationIds: scopesOrgIds,
    includePersonal: scopesPersonal,
    numberConfig,
    permissions,
    scope,
  });
}

async function deleteWorkspaceCustomField(project, fieldId, actorUserId) {
  const actorId = actorUserId || project.owner?._id || project.owner;
  return deleteAccountCustomField(actorId, fieldId);
}

function validateCustomFieldValue(field, value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  switch (field.type) {
    case "text":
      if (typeof value !== "string") {
        throw new Error(`Value for "${field.name}" must be text`);
      }
      if (/\d/.test(value)) {
        throw new Error(
          `Value for "${field.name}" must not contain numbers`
        );
      }
      return value;

    case "number": {
      const numericValue =
        typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numericValue)) {
        throw new Error(`Value for "${field.name}" must be a number`);
      }
      return numericValue;
    }

    case "percentage": {
      const percentage =
        typeof value === "number" ? value : Number(value);
      if (
        !Number.isFinite(percentage) ||
        percentage < 0 ||
        percentage > 100
      ) {
        throw new Error(
          `Value for "${field.name}" must be between 0 and 100`
        );
      }
      return percentage;
    }

    case "single_select": {
      const selected = String(value);
      if (!(field.options || []).includes(selected)) {
        throw new Error(`Invalid option selected for "${field.name}"`);
      }
      return selected;
    }

    case "multiple_select": {
      if (!Array.isArray(value)) {
        throw new Error(`Value for "${field.name}" must be an array`);
      }
      const selected = [...new Set(value.map((item) => String(item)))];
      const invalid = selected.some(
        (item) => !(field.options || []).includes(item)
      );
      if (invalid) {
        throw new Error(
          `One or more selected options are invalid for "${field.name}"`
        );
      }
      return selected;
    }

    case "checkbox":
      if (typeof value !== "boolean") {
        throw new Error(
          `Value for "${field.name}" must be true or false`
        );
      }
      return value;

    default:
      throw new Error(`Unsupported custom field type: ${field.type}`);
  }
}

function upsertTaskCustomFieldValue(task, fieldId, value) {
  if (!Array.isArray(task.customFieldValues)) task.customFieldValues = [];
  const existing = task.customFieldValues.find((row) => row.fieldId === fieldId);
  if (existing) {
    existing.value = value;
  } else {
    task.customFieldValues.push({ fieldId, value });
  }
}

function buildInitialCustomFieldValues(fieldIds, definitions) {
  const byId = new Map(definitions.map((field) => [field.id, field]));
  return fieldIds.map((fieldId) => {
    const def = byId.get(fieldId);
    return {
      fieldId,
      value: def ? emptyValueForType(def.type) : null,
    };
  });
}

async function adoptCustomFieldOnProject(project, fieldDefinition) {
  const fieldId = fieldDefinition.id || fieldDefinition._id?.toString();
  if (!fieldId) return;

  const projectId = project._id || project;
  const adopted = new Set(project.adoptedCustomFieldIds || []);
  if (!adopted.has(fieldId)) {
    const cardPreviewConfig = {
      ...(project.cardPreviewConfig &&
      typeof project.cardPreviewConfig === "object"
        ? project.cardPreviewConfig
        : {}),
    };
    cardPreviewConfig.customFields = {
      ...(cardPreviewConfig.customFields || {}),
      [fieldId]: true,
    };

    // Set the whole cardPreviewConfig object — dot notation fails when the
    // stored value is null (Cannot create field 'customFields' in element
    // {cardPreviewConfig: null}).
    await Project.findByIdAndUpdate(projectId, {
      $addToSet: { adoptedCustomFieldIds: fieldId },
      $set: { cardPreviewConfig },
    });
    adopted.add(fieldId);
    project.adoptedCustomFieldIds = [...adopted];
    project.cardPreviewConfig = cardPreviewConfig;
  }

  // Use targeted updateMany (not full document save) so legacy task fields
  // with invalid enum values (e.g. priority "High") cannot block adoption.
  await Task.updateMany(
    {
    project: project._id,
    isDeleted: { $ne: true },
      customFieldValues: { $not: { $elemMatch: { fieldId } } },
    },
    {
      $push: {
        customFieldValues: {
          fieldId,
          value: emptyValueForType(fieldDefinition.type),
        },
      },
    }
  );
}

function seedTaskCustomFieldValues(task, project, definitions) {
  const adopted = project.adoptedCustomFieldIds || [];
  const fieldIds =
    adopted.length > 0 ? adopted : (definitions || []).map((d) => d.id);
  if (!fieldIds.length) return;
  const byId = new Map((definitions || []).map((field) => [field.id, field]));
  if (!Array.isArray(task.customFieldValues)) task.customFieldValues = [];
  for (const fieldId of fieldIds) {
    const exists = task.customFieldValues.some((row) => row.fieldId === fieldId);
    if (exists) continue;
    const def = byId.get(fieldId);
    task.customFieldValues.push({
      fieldId,
      value: def ? emptyValueForType(def.type) : null,
    });
  }
}

module.exports = {
  emptyValueForType,
  resolveWorkspaceDoc,
  getWorkspaceCustomFieldDefinitions,
  getTaskEditableCustomFieldDefinitions,
  getProjectCustomFieldDefinitionsGrouped,
  resolveProjectWorkspaceId,
  normalizeCustomFieldDefinition,
  createWorkspaceCustomField,
  deleteWorkspaceCustomField,
  validateCustomFieldValue,
  upsertTaskCustomFieldValue,
  buildInitialCustomFieldValues,
  adoptCustomFieldOnProject,
  seedTaskCustomFieldValues,
  listAccountCustomFields,
  createAccountCustomField,
  updateAccountCustomField,
  deleteAccountCustomField,
  toPlainDefinition,
  userCanManageOrg,
};
