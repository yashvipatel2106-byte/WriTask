const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const { getRoleDefinition } = require("../utils/roleDefinitions");
const Report = require("../models/Report");
const { getWorkspaceForUser } = require("../utils/workspaces");
const { expandSources, toId } = require("../services/workspaceReports/resolveSources");
const {
  loadWorkspaceGraph,
  generateReportData,
  buildReportMeta,
  sourceTreeFromGraph,
  assertSourcesInWorkspace,
} = require("../services/workspaceReports/generateReport");
const {
  buildWorkbookBuffer,
  sanitizeFilename,
} = require("../services/workspaceReports/exportExcel");
const { DEFAULT_REPORT_COLUMNS } = require("../services/workspaceReports/columns");
const pdfService = require("../services/reports/pdfService");

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function handleError(res, error) {
  const status = error.status || 500;
  const message =
    status >= 500 ? "Something went wrong." : error.message;
  if (status >= 500) console.error(error);
  return res.status(status).json({ success: false, message });
}

async function requireWorkspace(req) {
  const workspaceId =
    req.query.workspaceId ||
    req.body?.workspaceId ||
    req.params?.workspaceId;
  if (!workspaceId || !mongoose.Types.ObjectId.isValid(String(workspaceId))) {
    throw httpError(400, "Workspace is required.");
  }
  const ws = await getWorkspaceForUser(req.user._id, workspaceId);
  if (!ws) {
    throw httpError(403, "You don't have permission to access this workspace.");
  }
  return ws;
}

function normalizeSources(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    throw httpError(400, "No data source selected.");
  }
  return raw.map((item) => {
    const type = item?.type;
    const id = item?.id;
    if (!["workspace", "folder", "project"].includes(type)) {
      throw httpError(400, "Invalid data source.");
    }
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      throw httpError(400, "Invalid data source.");
    }
    return { type, id };
  });
}

function normalizeExcluded(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw httpError(400, "Invalid excluded projects.");
  return raw.map((id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      throw httpError(400, "Invalid excluded projects.");
    }
    return String(id);
  });
}

function normalizeBasedOn(value) {
  if (!value || value === "tasks") return "tasks";
  if (value === "projects" || value === "time_entries") return value;
  throw httpError(400, "Invalid based-on value.");
}

function normalizeLayout(value) {
  if (!value || value === "table") return "table";
  if (value === "column") return "column";
  throw httpError(400, "Invalid layout.");
}

function normalizeColumns(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    throw httpError(400, "Please select at least one column.");
  }
  return raw.map((key) => String(key));
}

function pruneExclusions(excluded, expandedBeforeExclude) {
  const allowed = new Set(expandedBeforeExclude);
  return excluded.filter((id) => allowed.has(String(id)));
}

async function validateConfigAgainstWorkspace(workspace, config) {
  const { folders, projects } = await loadWorkspaceGraph(workspace._id);
  await assertSourcesInWorkspace({
    sources: config.dataSources,
    excludedProjectIds: config.excludedProjects,
    folders,
    projects,
    workspaceId: workspace._id,
  });
  const beforeExclude = expandSources({
    folders,
    projects,
    sources: config.dataSources,
    excludedProjectIds: [],
    workspaceId: workspace._id,
  });
  const excluded = pruneExclusions(
    (config.excludedProjects || []).map(String),
    beforeExclude.projectIds
  );
  return {
    ...config,
    excludedProjects: excluded,
  };
}

function serializeReport(report, workspaceName, canEdit = false) {
  const obj = typeof report.toObject === "function" ? report.toObject() : report;
  const createdBy = obj.createdBy;
  return {
    id: String(obj._id || obj.id),
    title: obj.title,
    workspaceId: String(obj.workspace),
    workspaceName: workspaceName || null,
    organizationId: obj.organization ? String(obj.organization) : null,
    type: obj.type,
    basedOn: obj.basedOn,
    layout: obj.layout,
    dataSources: (obj.dataSources || []).map((s) => ({
      type: s.type,
      id: String(s.id),
    })),
    excludedProjects: (obj.excludedProjects || []).map(String),
    filters: obj.filters || {},
    columns: obj.columns?.length
      ? obj.columns
      : ["title", "assignee", "author", "startDate", "dueDate", "status"],
    sharing: sharingLabel(obj.sharing),
    sharingKey: normalizeSharingKey(obj.sharing),
    sharedWith: (obj.sharedWith || []).map((id) => String(id._id || id)),
    canEdit: Boolean(canEdit),
    createdBy: createdBy
      ? {
          id: String(createdBy._id || createdBy),
          name: createdBy.username || createdBy.email || "Unknown",
        }
      : null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function normalizeSharingKey(value) {
  if (value === "workspace" || value === "organization") return "organization";
  if (value === "custom") return "custom";
  return "private";
}

function sharingLabel(value) {
  const key = normalizeSharingKey(value);
  if (key === "organization") return "Everyone";
  if (key === "custom") return "Custom";
  return "Only me";
}

function isReportManagerRole(roleId, organization) {
  if (!roleId) return false;
  if (roleId === "owner" || roleId === "admin") return true;
  const def = getRoleDefinition(organization, roleId);
  const name = String(def?.name || "").toLowerCase();
  return name === "owner" || name === "admin";
}

async function userCanManageReports(userId, workspace) {
  if (!workspace?.organization) {
    return (
      String(workspace.accountUserId || "") === String(userId) ||
      String(workspace.createdBy || "") === String(userId)
    );
  }
  const org = await Organization.findById(workspace.organization).select(
    "owner members roleDefinitions"
  );
  if (!org) return false;
  return isReportManagerRole(org.getMemberRole(userId), org);
}

function canViewReport(report, userId) {
  const creator = report.createdBy;
  const creatorId = creator?._id || creator;
  if (creatorId && String(creatorId) === String(userId)) {
    return true;
  }
  const sharing = normalizeSharingKey(report.sharing);
  if (sharing === "organization") return true;
  if (sharing === "custom") {
    return (report.sharedWith || []).some(
      (id) => String(id._id || id) === String(userId)
    );
  }
  return false;
}

async function loadReportForUser(req, { requireEdit = false } = {}) {
  const id = req.params.id;
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw httpError(400, "Invalid report.");
  }
  const report = await Report.findById(id).populate(
    "createdBy",
    "username email"
  );
  if (!report) throw httpError(404, "Report not found.");

  const ws = await getWorkspaceForUser(req.user._id, report.workspace);
  if (!ws) {
    throw httpError(403, "You don't have permission to access this report.");
  }
  if (!canViewReport(report, req.user._id)) {
    throw httpError(403, "You don't have permission to access this report.");
  }
  if (requireEdit && !(await userCanManageReports(req.user._id, ws))) {
    throw httpError(403, "You don't have permission to edit this report.");
  }
  const canEdit = await userCanManageReports(req.user._id, ws);
  return { report, workspace: ws, canEdit };
}

exports.listDataSources = async (req, res) => {
  try {
    const ws = await requireWorkspace(req);
    const { folders, projects } = await loadWorkspaceGraph(ws._id);
    const tree = sourceTreeFromGraph(folders, projects, ws);
    res.json({ success: true, ...tree });
  } catch (error) {
    handleError(res, error);
  }
};

exports.listExcludableProjects = async (req, res) => {
  try {
    const ws = await requireWorkspace(req);
    const sources = normalizeSources(
      typeof req.query.sources === "string"
        ? JSON.parse(req.query.sources)
        : req.body?.dataSources || []
    );
    const { folders, projects } = await loadWorkspaceGraph(ws._id);
    await assertSourcesInWorkspace({
      sources,
      excludedProjectIds: [],
      folders,
      projects,
      workspaceId: ws._id,
    });
    const expanded = expandSources({
      folders,
      projects,
      sources,
      excludedProjectIds: [],
      workspaceId: ws._id,
    });
    const projectById = new Map(projects.map((p) => [toId(p._id), p]));
    const items = expanded.projectIds
      .map((id) => {
        const p = projectById.get(id);
        return p ? { id, name: p.title } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, projects: items });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return handleError(res, httpError(400, "Invalid data source."));
    }
    handleError(res, error);
  }
};

exports.getMeta = async (req, res) => {
  try {
    const ws = await requireWorkspace(req);
    const meta = await buildReportMeta(ws, req.user._id);
    res.json({ success: true, ...meta });
  } catch (error) {
    handleError(res, error);
  }
};

exports.listReports = async (req, res) => {
  try {
    const ws = await requireWorkspace(req);
    const reports = await Report.find({ workspace: ws._id })
      .populate("createdBy", "username email")
      .sort({ updatedAt: -1 });
    const visible = reports.filter((r) => canViewReport(r, req.user._id));
    const canEdit = await userCanManageReports(req.user._id, ws);
    res.json({
      success: true,
      canCreate: canEdit,
      reports: visible.map((r) => serializeReport(r, ws.name, canEdit)),
    });
  } catch (error) {
    handleError(res, error);
  }
};

function normalizeSharing(rawSharing, rawSharedWith) {
  const key = normalizeSharingKey(rawSharing);
  if (key !== "custom") {
    return { sharing: key, sharedWith: [] };
  }
  if (!Array.isArray(rawSharedWith) || !rawSharedWith.length) {
    throw httpError(400, "Select at least one member for custom access.");
  }
  const sharedWith = [];
  const seen = new Set();
  for (const raw of rawSharedWith) {
    const id = String(raw || "").trim();
    if (!id || !mongoose.Types.ObjectId.isValid(id) || seen.has(id)) continue;
    seen.add(id);
    sharedWith.push(id);
  }
  if (!sharedWith.length) {
    throw httpError(400, "Select at least one member for custom access.");
  }
  return { sharing: "custom", sharedWith };
}

async function parseBodyConfig(body) {
  const title = String(body.title || "").trim();
  if (!title) throw httpError(400, "Title is required.");
  const dataSources = normalizeSources(body.dataSources);
  const excludedProjects = normalizeExcluded(body.excludedProjects);
  const basedOn = normalizeBasedOn(body.basedOn);
  const layout = normalizeLayout(body.layout);
  const columns = normalizeColumns(body.columns);
  const filters =
    body.filters && typeof body.filters === "object" ? body.filters : {};
  const { sharing, sharedWith } = normalizeSharing(body.sharing, body.sharedWith);
  return {
    title,
    dataSources,
    excludedProjects,
    basedOn,
    layout,
    columns,
    filters,
    sharing,
    sharedWith,
    type: "custom",
  };
}

exports.createReport = async (req, res) => {
  try {
    const ws = await requireWorkspace(req);
    if (!(await userCanManageReports(req.user._id, ws))) {
      throw httpError(403, "Only owners and admins can create reports.");
    }
    const parsed = await parseBodyConfig(req.body || {});
    const mergedColumns = [...DEFAULT_REPORT_COLUMNS];
    for (const key of parsed.columns || []) {
      if (!mergedColumns.includes(key)) mergedColumns.push(key);
    }
    parsed.columns = mergedColumns;
    const config = await validateConfigAgainstWorkspace(ws, parsed);
    const report = await Report.create({
      title: config.title,
      workspace: ws._id,
      organization: ws.organization || null,
      type: "custom",
      basedOn: config.basedOn,
      layout: config.layout,
      dataSources: config.dataSources,
      excludedProjects: config.excludedProjects,
      filters: config.filters,
      columns: config.columns,
      sharing: config.sharing,
      sharedWith: config.sharedWith,
      createdBy: req.user._id,
    });
    const populated = await Report.findById(report._id).populate(
      "createdBy",
      "username email"
    );
    res.status(201).json({
      success: true,
      report: serializeReport(populated, ws.name, true),
    });
  } catch (error) {
    handleError(res, error);
  }
};

exports.getReport = async (req, res) => {
  try {
    const { report, workspace, canEdit } = await loadReportForUser(req);
    res.json({
      success: true,
      report: serializeReport(report, workspace.name, canEdit),
    });
  } catch (error) {
    handleError(res, error);
  }
};

exports.updateReport = async (req, res) => {
  try {
    const { report, workspace } = await loadReportForUser(req, {
      requireEdit: true,
    });
    const parsed = await parseBodyConfig(req.body || {});
    const config = await validateConfigAgainstWorkspace(workspace, parsed);
    report.title = config.title;
    report.basedOn = config.basedOn;
    report.layout = config.layout;
    report.dataSources = config.dataSources;
    report.excludedProjects = config.excludedProjects;
    report.filters = config.filters;
    report.columns = config.columns.includes("title")
      ? config.columns
      : ["title", ...config.columns];
    report.sharing = config.sharing;
    report.sharedWith = config.sharedWith;
    await report.save();
    const populated = await Report.findById(report._id).populate(
      "createdBy",
      "username email"
    );
    res.json({
      success: true,
      report: serializeReport(populated, workspace.name, true),
    });
  } catch (error) {
    handleError(res, error);
  }
};

exports.deleteReport = async (req, res) => {
  try {
    const { report } = await loadReportForUser(req, { requireEdit: true });
    await report.deleteOne();
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
};

exports.getReportData = async (req, res) => {
  try {
    const { report, workspace, canEdit } = await loadReportForUser(req);
    const data = await generateReportData({
      workspace,
      userId: req.user._id,
      config: {
        dataSources: report.dataSources,
        excludedProjects: report.excludedProjects,
        basedOn: report.basedOn,
        filters: report.filters,
        columns: report.columns,
      },
    });
    res.json({
      success: true,
      report: serializeReport(report, workspace.name, canEdit),
      ...data,
    });
  } catch (error) {
    handleError(res, error);
  }
};

exports.exportExcel = async (req, res) => {
  try {
    const { report, workspace } = await loadReportForUser(req);
    const data = await generateReportData({
      workspace,
      userId: req.user._id,
      config: {
        dataSources: report.dataSources,
        excludedProjects: report.excludedProjects,
        basedOn: report.basedOn,
        filters: report.filters,
        columns: report.columns,
      },
    });
    const buffer = buildWorkbookBuffer({
      title: report.title,
      columns: data.columns,
      rows: data.rows,
    });
    const filename = `${sanitizeFilename(report.title)}.xlsx`;
    res.set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    return res.send(buffer);
  } catch (error) {
    handleError(res, error);
  }
};

exports.exportPdf = async (req, res) => {
  try {
    const { report, workspace } = await loadReportForUser(req);
    const data = await generateReportData({
      workspace,
      userId: req.user._id,
      config: {
        dataSources: report.dataSources,
        excludedProjects: report.excludedProjects,
        basedOn: report.basedOn,
        filters: report.filters,
        columns: report.columns,
      },
    });
    let organizationName = workspace.name;
    if (workspace.organization) {
      const org = await Organization.findById(workspace.organization)
        .select("name")
        .lean();
      if (org?.name) organizationName = org.name;
    }
    const basedOnLabel =
      report.basedOn === "projects"
        ? "Project Report"
        : report.basedOn === "time_entries"
          ? "Time Entry Report"
          : "Tasks and Subtasks Report";
    const createdBy =
      report.createdBy?.username || report.createdBy?.email || "";
    const pdf = await pdfService.generateTablePdf({
      title: report.title,
      columns: data.columns,
      rows: data.rows,
      workspaceName: workspace.name,
      organizationName,
      basedOnLabel,
      createdBy,
    });
    const filename = `${sanitizeFilename(report.title)}.pdf`;
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    return res.send(pdf);
  } catch (error) {
    const friendly = httpError(500, "Unable to export report.");
    if (!error.status) return handleError(res, friendly);
    handleError(res, error);
  }
};
