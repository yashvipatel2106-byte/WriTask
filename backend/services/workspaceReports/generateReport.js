const dayjs = require("dayjs");
const mongoose = require("mongoose");
const Folder = require("../../models/Folder");
const Project = require("../../models/Project");
const Task = require("../../models/Task");
const TimeEntry = require("../../models/TimeEntry");
const Organization = require("../../models/Organization");
const CustomField = require("../../models/CustomField");
const { resolveProjectRoleForUser } = require("../../utils/projectAccess");
const { expandSources, toId } = require("./resolveSources");
const {
  BUILTIN_COLUMNS,
  CALCULATED_COLUMNS,
  customColumnKey,
  calculatedColumnKey,
  normalizeColumnKeys,
  orderSelectedColumns,
  parseCustomFieldId,
} = require("./columns");
const { buildTaskHierarchyRows } = require("./taskTree");

const DEFAULT_STATUSES = [
  { id: "todo", label: "To Do", group: "active" },
  { id: "in-progress", label: "In Progress", group: "active" },
  { id: "review", label: "Review", group: "active" },
  { id: "completed", label: "Completed", group: "completed" },
];

function memberUserId(member) {
  if (!member?.user) return null;
  const u = member.user;
  if (typeof u === "object" && u._id) return String(u._id);
  return String(u);
}

function classifyStatusGroup(id, label) {
  const text = `${id} ${label}`.toLowerCase();
  if (/\bcancel/.test(text)) return "canceled";
  if (/\bdefer|\bon hold|\bhold\b/.test(text)) return "deferred";
  if (/\bcomplet/.test(text) || id === "completed") return "completed";
  return "active";
}

function statusGroupLabel(group) {
  if (group === "completed") return "Completed";
  if (group === "canceled") return "Canceled";
  if (group === "deferred") return "Deferred";
  return "Active";
}

function formatDate(value) {
  if (!value) return "";
  const d = dayjs(value);
  return d.isValid() ? d.format("DD/MM/YYYY") : "";
}

function formatDurationHours(hours) {
  if (hours == null || hours === "") return "";
  const n = Number(hours);
  if (!Number.isFinite(n)) return "";
  return String(n);
}

function formatMs(ms) {
  if (!ms) return "";
  const hours = ms / 3600000;
  if (hours < 1) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(hours * 10) / 10}h`;
}

function displayName(user) {
  if (!user) return "";
  return user.username || user.email || "";
}

function startOfDay(value) {
  return dayjs(value).startOf("day");
}

function matchDateFilter(date, filter) {
  if (!filter || !filter.operator) return true;
  const op = filter.operator;
  if (!date) return false;
  const d = startOfDay(date);
  if (!d.isValid()) return false;
  if (op === "is") {
    if (!filter.value) return true;
    return d.isSame(startOfDay(filter.value), "day");
  }
  if (op === "before") {
    if (!filter.value) return true;
    return d.isBefore(startOfDay(filter.value), "day");
  }
  if (op === "after") {
    if (!filter.value) return true;
    return d.isAfter(startOfDay(filter.value), "day");
  }
  if (op === "between") {
    if (!filter.value && !filter.value2) return true;
    const from = filter.value ? startOfDay(filter.value) : null;
    const to = filter.value2 ? startOfDay(filter.value2) : null;
    if (from && d.isBefore(from, "day")) return false;
    if (to && d.isAfter(to, "day")) return false;
    return true;
  }
  return true;
}

function matchNumberFilter(num, filter) {
  if (!filter || !filter.operator) return true;
  if (num == null || num === "") return false;
  const n = Number(num);
  if (!Number.isFinite(n)) return false;
  const v = Number(filter.value);
  const v2 = Number(filter.value2);
  if (filter.operator === "is") return !Number.isFinite(v) || n === v;
  if (filter.operator === "before") return !Number.isFinite(v) || n < v;
  if (filter.operator === "after") return !Number.isFinite(v) || n > v;
  if (filter.operator === "between") {
    if (Number.isFinite(v) && n < v) return false;
    if (Number.isFinite(v2) && n > v2) return false;
    return true;
  }
  return true;
}

function formatCustomValue(value, field) {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field?.type === "number" || field?.type === "percentage") return String(value);
  return String(value);
}

async function loadWorkspaceGraph(workspaceId) {
  const [folders, projects] = await Promise.all([
    Folder.find({
      workspace: workspaceId,
      isDeleted: { $ne: true },
    })
      .select("name parentFolder parentProject workspace")
      .lean(),
    Project.find({
      workspace: workspaceId,
      isDeleted: { $ne: true },
    })
      .select(
        "title folder parentProject workspace organization owner members customStatuses status createdAt updatedAt"
      )
      .lean(),
  ]);
  return { folders, projects };
}

async function ownedOrganizationIds(userId) {
  const orgs = await Organization.find({
    owner: userId,
    isDeleted: { $ne: true },
  }).select("_id");
  return new Set(orgs.map((o) => String(o._id)));
}

function canAccessProjectDoc(project, userId, ownedOrgIds) {
  const id = String(userId);
  if (String(project.owner) === id) return true;
  if ((project.members || []).some((m) => memberUserId(m) === id)) return true;
  if (project.organization && ownedOrgIds.has(String(project.organization))) {
    return true;
  }
  return false;
}

async function assertSourcesInWorkspace({
  sources,
  excludedProjectIds,
  folders,
  projects,
  workspaceId,
}) {
  const folderById = new Map(folders.map((f) => [toId(f._id), f]));
  const projectById = new Map(projects.map((p) => [toId(p._id), p]));
  const wsId = String(workspaceId);

  for (const source of sources || []) {
    const id = toId(source.id);
    if (source.type === "workspace") {
      if (id !== wsId) {
        const err = new Error("You don't have permission to access this folder.");
        err.status = 403;
        throw err;
      }
    } else if (source.type === "folder") {
      const folder = folderById.get(id);
      if (!folder) {
        const err = new Error("You don't have permission to access this folder.");
        err.status = 403;
        throw err;
      }
    } else if (source.type === "project") {
      const project = projectById.get(id);
      if (!project) {
        const err = new Error("You don't have permission to access this folder.");
        err.status = 403;
        throw err;
      }
    } else {
      const err = new Error("Invalid data source.");
      err.status = 400;
      throw err;
    }
  }

  for (const raw of excludedProjectIds || []) {
    const id = toId(raw);
    if (!projectById.has(id)) {
      const err = new Error("Some selected projects are no longer available.");
      err.status = 400;
      throw err;
    }
  }
}

function buildStatusCatalog(projects) {
  const byId = new Map(DEFAULT_STATUSES.map((s) => [s.id, { ...s }]));
  for (const project of projects) {
    for (const status of project.customStatuses || []) {
      const id = String(status.id || "").trim();
      const label = String(status.label || id).trim();
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        label,
        group: classifyStatusGroup(id, label),
      });
    }
  }
  return [...byId.values()];
}

function collectAssignees(projects) {
  const users = new Map();
  for (const project of projects) {
    for (const member of project.members || []) {
      const user = member.user;
      if (!user) continue;
      const id = typeof user === "object" ? String(user._id || "") : String(user);
      if (!id) continue;
      const name =
        typeof user === "object"
          ? user.username || user.email || id
          : id;
      users.set(id, { _id: id, name });
    }
  }
  return [...users.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function customFieldsForWorkspace(workspace) {
  const wsId = String(workspace._id);
  const orgId = workspace.organization ? String(workspace.organization) : null;
  const query = { isActive: { $ne: false } };
  const or = [{ workspaceId: workspace._id }];
  if (orgId) or.push({ organizationIds: workspace.organization });
  if (!orgId) or.push({ includePersonal: true, workspaceId: { $in: [null, workspace._id] } });
  query.$or = or;
  const fields = await CustomField.find(query).select("name type options workspaceId").lean();
  return fields
    .filter((field) => {
      if (field.workspaceId && String(field.workspaceId) !== wsId) return false;
      return true;
    })
    .map((field) => ({
      id: String(field._id),
      name: field.name,
      type: field.type,
    }));
}

function buildColumnCatalog(customFields) {
  const catalog = [
    ...BUILTIN_COLUMNS,
    ...CALCULATED_COLUMNS.map((c) => ({
      ...c,
      key: calculatedColumnKey(c.key),
    })),
    ...customFields.map((field) => ({
      key: customColumnKey(field.id),
      label: field.name,
      category: "custom",
      fieldId: field.id,
      fieldType: field.type,
    })),
  ];
  return catalog;
}

function folderPath(folderId, folderById) {
  const names = [];
  let current = folderById.get(toId(folderId));
  const seen = new Set();
  while (current) {
    const id = toId(current._id);
    if (seen.has(id)) break;
    seen.add(id);
    names.unshift(current.name);
    current = folderById.get(toId(current.parentFolder));
  }
  return names.join(" / ");
}

function projectLocation(project, folderById) {
  const folderName = project.folder ? folderPath(project.folder, folderById) : "";
  if (folderName) return `${folderName} / ${project.title}`;
  return project.title;
}

function taskCompletedDate(task) {
  if (String(task.status) === "completed") return task.updatedAt || null;
  return null;
}

function applyRowFilters(row, filters, statusById) {
  const f = filters || {};
  if (Array.isArray(f.customItemType) && f.customItemType.length) {
    if (!f.customItemType.includes(row.itemTypeKey)) return false;
  }
  if (Array.isArray(f.status) && f.status.length) {
    if (!f.status.includes(row.statusId)) return false;
  }
  if (Array.isArray(f.assignee) && f.assignee.length) {
    const ids = row.assigneeIds || [];
    if (!ids.some((id) => f.assignee.includes(id))) return false;
  }
  if (f.tasksToDo === true) {
    const group = statusById.get(row.statusId)?.group || "active";
    if (group === "completed" || group === "canceled") return false;
  }
  if (Array.isArray(f.importance) && f.importance.length) {
    if (!f.importance.includes(row.importanceKey)) return false;
  }
  if (Array.isArray(f.author) && f.author.length) {
    if (!f.author.includes(row.authorId)) return false;
  }
  if (Array.isArray(f.taskType) && f.taskType.length) {
    const tags = row.tags || [];
    if (!tags.some((t) => f.taskType.includes(t))) return false;
  }
  if (!matchNumberFilter(row.effortHours, f.effort)) return false;
  if (!matchDateFilter(row.createdAt, f.createdDate)) return false;
  if (!matchDateFilter(row.startDate, f.startDate)) return false;
  if (!matchDateFilter(row.dueDate, f.dueDate)) return false;
  if (!matchDateFilter(row.completedDate, f.completedDate)) return false;
  if (!matchDateFilter(row.updatedAt, f.lastModifiedDate)) return false;
  return true;
}

function daysSince(from, to = new Date()) {
  if (!from) return "";
  const a = dayjs(from).startOf("day");
  const b = dayjs(to).startOf("day");
  if (!a.isValid() || !b.isValid()) return "";
  return String(b.diff(a, "day"));
}

function pickCells(row, columns, customFieldById) {
  const cells = {};
  for (const col of columns) {
    const key = col.key;
    if (key === "title") cells[key] = row.title || "";
    else if (key === "itemType") cells[key] = row.itemType || "";
    else if (key === "assignee") cells[key] = row.assignee || "";
    else if (key === "importance") cells[key] = row.importance || "";
    else if (key === "statusGroup") cells[key] = row.statusGroup || "";
    else if (key === "status") cells[key] = row.status || "";
    else if (key === "projectOrFolder") cells[key] = row.projectOrFolder || "";
    else if (key === "createdDate") cells[key] = formatDate(row.createdAt);
    else if (key === "startDate") cells[key] = formatDate(row.startDate);
    else if (key === "dueDate") cells[key] = formatDate(row.dueDate);
    else if (key === "completedDate") cells[key] = formatDate(row.completedDate);
    else if (key === "lastModifiedDate") cells[key] = formatDate(row.updatedAt);
    else if (key === "duration") cells[key] = formatDurationHours(row.durationHours);
    else if (key === "durationHours") cells[key] = formatDurationHours(row.durationHours);
    else if (key === "effort") cells[key] = formatDurationHours(row.effortHours);
    else if (key === "timeSpent") cells[key] = row.timeSpent || "";
    else if (key === "author") cells[key] = row.author || "";
    else if (key === "id") cells[key] = row.id || "";
    else if (key === "workflow") cells[key] = row.workflow || "";
    else if (key === calculatedColumnKey("daysSinceOpen")) {
      cells[key] = daysSince(row.createdAt);
    } else if (key === calculatedColumnKey("overdueSince")) {
      const due = row.dueDate ? dayjs(row.dueDate) : null;
      const completed = row.statusId === "completed";
      if (!due || !due.isValid() || completed || !due.isBefore(dayjs(), "day")) {
        cells[key] = "";
      } else {
        cells[key] = daysSince(row.dueDate);
      }
    } else if (key.startsWith("custom:")) {
      const fieldId = parseCustomFieldId(key);
      const field = customFieldById.get(fieldId);
      cells[key] = formatCustomValue(row.customValues?.[fieldId], field);
    } else {
      cells[key] = "";
    }
  }
  return cells;
}

async function timeSpentByTask(projectObjectIds) {
  if (!projectObjectIds.length) return new Map();
  const rows = await TimeEntry.aggregate([
    { $match: { project: { $in: projectObjectIds } } },
    {
      $group: {
        _id: "$task",
        durationMs: { $sum: { $ifNull: ["$durationMs", 0] } },
        accumulatedMs: { $sum: { $ifNull: ["$accumulatedMs", 0] } },
      },
    },
  ]);
  const map = new Map();
  for (const row of rows) {
    map.set(String(row._id), formatMs((row.durationMs || 0) + (row.accumulatedMs || 0)));
  }
  return map;
}

function flattenSubtasks(subtasks) {
  const list = [];
  const walk = (node, depth) => {
    list.push({ node, depth });
    const children = (subtasks || []).filter(
      (s) => String(s.parentSubtaskId || "") === String(node._id)
    );
    for (const child of children) walk(child, depth + 1);
  };
  const roots = (subtasks || []).filter((s) => !s.parentSubtaskId);
  for (const root of roots) walk(root, 0);
  // Orphans (parent missing) still appear
  const seen = new Set(list.map((x) => String(x.node._id)));
  for (const node of subtasks || []) {
    if (!seen.has(String(node._id))) list.push({ node, depth: 0 });
  }
  return list;
}

async function generateReportData({
  workspace,
  userId,
  config,
}) {
  const { folders, projects } = await loadWorkspaceGraph(workspace._id);
  await assertSourcesInWorkspace({
    sources: config.dataSources,
    excludedProjectIds: config.excludedProjects,
    folders,
    projects,
    workspaceId: workspace._id,
  });

  const expanded = expandSources({
    folders,
    projects,
    sources: config.dataSources,
    excludedProjectIds: config.excludedProjects,
    workspaceId: workspace._id,
  });

  const ownedOrgIds = await ownedOrganizationIds(userId);
  const projectById = new Map(projects.map((p) => [toId(p._id), p]));
  const folderById = new Map(folders.map((f) => [toId(f._id), f]));

  const accessibleIds = expanded.projectIds.filter((id) => {
    const project = projectById.get(id);
    return project && canAccessProjectDoc(project, userId, ownedOrgIds);
  });

  // Org-owner path already covered. If a project wasn't in members array
  // but resolveProjectRoleForUser would allow it, check remaining ids.
  const missing = expanded.projectIds.filter((id) => !accessibleIds.includes(id));
  for (const id of missing) {
    const project = projectById.get(id);
    if (!project) continue;
    const role = await resolveProjectRoleForUser(project, userId);
    if (role) accessibleIds.push(id);
  }

  const customFields = await customFieldsForWorkspace(workspace);
  const catalog = buildColumnCatalog(customFields);
  const allowedKeys = catalog.map((c) => c.key);
  const selectedKeys = normalizeColumnKeys(config.columns, allowedKeys);
  const selectedColumns = orderSelectedColumns(selectedKeys, catalog);
  const customFieldById = new Map(customFields.map((f) => [f.id, f]));
  const statusCatalog = buildStatusCatalog(
    accessibleIds.map((id) => projectById.get(id)).filter(Boolean)
  );
  const statusById = new Map(statusCatalog.map((s) => [s.id, s]));

  const objectIds = accessibleIds.map((id) => new mongoose.Types.ObjectId(id));
  const basedOn = config.basedOn || "tasks";
  const filters = config.filters || {};
  const rawRows = [];

  if (basedOn === "time_entries") {
    const entries = objectIds.length
      ? await TimeEntry.find({ project: { $in: objectIds } })
          .populate("user", "username email")
          .populate("task", "title")
          .lean()
      : [];
    for (const entry of entries) {
      const project = projectById.get(toId(entry.project));
      if (!project) continue;
      const duration =
        entry.durationMs ||
        entry.accumulatedMs ||
        0;
      rawRows.push({
        id: String(entry._id),
        title: entry.task?.title || "Time entry",
        itemType: "Time entry",
        itemTypeKey: "time_entry",
        assignee: displayName(entry.user),
        assigneeIds: entry.user ? [String(entry.user._id || entry.user)] : [],
        importance: "",
        importanceKey: "",
        statusId: entry.status,
        status: entry.status,
        statusGroup: entry.status === "completed" ? "Completed" : "Active",
        projectOrFolder: projectLocation(project, folderById),
        createdAt: entry.createdAt,
        startDate: entry.startedAt,
        dueDate: entry.endedAt,
        completedDate: entry.endedAt,
        updatedAt: entry.updatedAt,
        durationHours: duration ? duration / 3600000 : null,
        effortHours: null,
        timeSpent: formatMs(duration),
        author: displayName(entry.user),
        authorId: entry.user ? String(entry.user._id || entry.user) : "",
        workflow: "",
        tags: [],
        customValues: {},
      });
    }
  } else {
    const tasks = objectIds.length
      ? await Task.find({
          project: { $in: objectIds },
          isDeleted: { $ne: true },
        })
          .populate("assignee", "username email")
          .populate("assignees", "username email")
          .populate("createdBy", "username email")
          .lean()
      : [];
    const spent = await timeSpentByTask(objectIds);

    for (const task of tasks) {
      const project = projectById.get(toId(task.project));
      if (!project) continue;
      const statusMeta = statusById.get(task.status) || {
        id: task.status,
        label: task.status,
        group: classifyStatusGroup(task.status, task.status),
      };
      const assignees = [
        ...(task.assignees || []),
        ...(task.assignee ? [task.assignee] : []),
      ];
      const uniqueAssignees = [];
      const seenA = new Set();
      for (const a of assignees) {
        const id = toId(a._id || a);
        if (!id || seenA.has(id)) continue;
        seenA.add(id);
        uniqueAssignees.push(a);
      }
      const customValues = {};
      for (const row of task.customFieldValues || []) {
        customValues[String(row.fieldId)] = row.value;
      }
      const base = {
        projectOrFolder: projectLocation(project, folderById),
        workflow: "Default Workflow",
        timeSpent: spent.get(String(task._id)) || "",
        customValues,
      };
      const taskRow = {
        ...base,
        id: String(task._id),
        projectId: toId(task.project),
        parentId: null,
        title: task.title,
        itemType: "Task",
        itemTypeKey: "task",
        assignee: uniqueAssignees.map(displayName).filter(Boolean).join(", "),
        assigneeIds: uniqueAssignees.map((a) => toId(a._id || a)),
        importance: task.priority || "",
        importanceKey: task.priority || "",
        statusId: task.status,
        status: statusMeta.label,
        statusGroup: statusGroupLabel(statusMeta.group),
        createdAt: task.createdAt,
        startDate: task.startDate,
        dueDate: task.dueDate,
        completedDate: taskCompletedDate(task),
        updatedAt: task.updatedAt,
        durationHours: task.durationHours,
        effortHours: task.effortHours,
        author: displayName(task.createdBy),
        authorId: toId(task.createdBy?._id || task.createdBy),
        tags: task.tags || [],
      };
      rawRows.push(taskRow);

      for (const { node } of flattenSubtasks(task.subtasks || [])) {
        const stStatus = statusById.get(node.status) || {
          id: node.status,
          label: node.status || (node.completed ? "Completed" : "To Do"),
          group: node.completed ? "completed" : "active",
        };
        const stAssignees = [
          ...(node.assignees || []),
          ...(node.assignee ? [node.assignee] : []),
        ];
        rawRows.push({
          ...base,
          id: String(node._id),
          projectId: toId(task.project),
          parentId: toId(node.parentSubtaskId) || String(task._id),
          title: node.title,
          itemType: "Subtask",
          itemTypeKey: "subtask",
          assignee: stAssignees.map(displayName).filter(Boolean).join(", "),
          assigneeIds: stAssignees.map((a) => toId(a._id || a)).filter(Boolean),
          importance: node.priority || "",
          importanceKey: node.priority || "",
          statusId: node.status || (node.completed ? "completed" : "todo"),
          status: stStatus.label,
          statusGroup: statusGroupLabel(stStatus.group),
          createdAt: node.createdAt || task.createdAt,
          startDate: node.startDate,
          dueDate: node.dueDate,
          completedDate: node.completed || node.status === "completed" ? node.createdAt : null,
          updatedAt: node.createdAt || task.updatedAt,
          durationHours: node.durationHours,
          effortHours: node.effortHours,
          author: displayName(task.createdBy),
          authorId: toId(task.createdBy?._id || task.createdBy),
          tags: [],
        });
      }
    }
  }

  const filtered = rawRows.filter((row) => applyRowFilters(row, filters, statusById));
  const mapped = filtered.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId || null,
    kind: row.itemTypeKey || "task",
    title: row.title,
    cells: pickCells(row, selectedColumns, customFieldById),
  }));

  const rows =
    basedOn === "time_entries"
      ? mapped.map((row) => ({
          id: row.id,
          parentId: null,
          kind: row.kind,
          hasChildren: false,
          depth: 0,
          cells: row.cells,
        }))
      : buildTaskHierarchyRows({
          folders,
          projects,
          sources: config.dataSources,
          folderIds: expanded.folderIds,
          projectIds: accessibleIds,
          taskRows: mapped,
          keepProjectRows: basedOn === "projects",
        });

  const total =
    basedOn === "time_entries"
      ? rows.length
      : rows.filter((row) => row.kind === "task" || row.kind === "subtask").length;

  return {
    columns: selectedColumns.map((c) => ({ key: c.key, label: c.label })),
    rows,
    total,
    basedOn,
  };
}

async function buildReportMeta(workspace, userId) {
  const { folders, projects } = await loadWorkspaceGraph(workspace._id);
  const ownedOrgIds = await ownedOrganizationIds(userId);
  const accessible = projects.filter((p) => canAccessProjectDoc(p, userId, ownedOrgIds));
  const populated = await Project.find({
    _id: { $in: accessible.map((p) => p._id) },
  })
    .populate("members.user", "username email")
    .select("customStatuses members title")
    .lean();

  const customFields = await customFieldsForWorkspace(workspace);
  const catalog = buildColumnCatalog(customFields);
  const statuses = buildStatusCatalog(populated);
  const assignees = collectAssignees(populated);
  const authors = [...assignees];

  const tags = await Task.distinct("tags", {
    project: { $in: accessible.map((p) => p._id) },
    isDeleted: { $ne: true },
    tags: { $exists: true, $ne: [] },
  });

  const members = [];
  if (workspace.organization) {
    const org = await Organization.findById(workspace.organization)
      .populate("owner", "username email")
      .populate("members.user", "username email")
      .lean();
    if (org) {
      const seen = new Set();
      const pushMember = (user) => {
        if (!user) return;
        const id = String(user._id || user);
        if (!id || seen.has(id)) return;
        seen.add(id);
        members.push({
          _id: id,
          name: user.username || user.email || id,
        });
      };
      pushMember(org.owner);
      for (const member of org.members || []) pushMember(member.user);
      members.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return {
    workspace: {
      id: String(workspace._id),
      name: workspace.name,
    },
    columns: catalog,
    statuses,
    statusGroups: [
      { id: "all_active", label: "All active", group: "active" },
      { id: "all_completed", label: "All completed", group: "completed" },
      { id: "all_deferred", label: "All deferred", group: "deferred" },
      { id: "all_canceled", label: "All canceled", group: "canceled" },
    ],
    assignees,
    authors,
    taskTypes: (tags || []).filter(Boolean).sort(),
    importance: [
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
      { id: "high", label: "High" },
    ],
    customItemTypes: [
      { id: "task", label: "Task" },
      { id: "subtask", label: "Subtask" },
    ],
    members,
    hasTimeEntries: true,
    availableFilters: {
      approvals: false,
      billingType: false,
    },
  };
}

function sourceTreeFromGraph(folders, projects, workspace) {
  const maps = require("./resolveSources").buildHierarchyMaps(folders, projects);
  const folderById = new Map(folders.map((f) => [toId(f._id), f]));
  const projectById = new Map(projects.map((p) => [toId(p._id), p]));

  function projectNode(id) {
    const project = projectById.get(id);
    if (!project) return null;
    return {
      type: "project",
      id,
      name: project.title,
      children: [
        ...(maps.foldersByParentProject.get(id) || []).map(folderNode).filter(Boolean),
        ...(maps.projectsByParent.get(id) || []).map(projectNode).filter(Boolean),
      ],
    };
  }

  function folderNode(id) {
    const folder = folderById.get(id);
    if (!folder) return null;
    return {
      type: "folder",
      id,
      name: folder.name,
      children: [
        ...(maps.foldersByParentFolder.get(id) || []).map(folderNode).filter(Boolean),
        ...(maps.projectsByFolder.get(id) || []).map(projectNode).filter(Boolean),
      ],
    };
  }

  return {
    workspace: {
      type: "workspace",
      id: String(workspace._id),
      name: workspace.name,
    },
    tree: [
      ...maps.rootFolders.map(folderNode).filter(Boolean),
      ...maps.standaloneProjects.map(projectNode).filter(Boolean),
    ],
  };
}

module.exports = {
  loadWorkspaceGraph,
  generateReportData,
  buildReportMeta,
  sourceTreeFromGraph,
  assertSourcesInWorkspace,
  canAccessProjectDoc,
  ownedOrganizationIds,
  buildColumnCatalog,
  customFieldsForWorkspace,
};
