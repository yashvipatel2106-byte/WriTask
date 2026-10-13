export type ReportSourceType = "workspace" | "folder" | "project";

export type ReportDataSource = {
  type: ReportSourceType;
  id: string;
};

export type DateFilter = {
  operator?: "" | "is" | "before" | "after" | "between";
  value?: string;
  value2?: string;
};

export type NumberFilter = DateFilter;

export type ReportFilters = {
  customItemType?: string[];
  status?: string[];
  assignee?: string[];
  tasksToDo?: boolean;
  taskType?: string[];
  importance?: string[];
  effort?: NumberFilter;
  createdDate?: DateFilter;
  startDate?: DateFilter;
  dueDate?: DateFilter;
  completedDate?: DateFilter;
  lastModifiedDate?: DateFilter;
  author?: string[];
};

export type ReportBasedOn = "projects" | "tasks" | "time_entries";
export type ReportLayout = "table" | "column";

export type ReportSharing = "private" | "organization" | "custom";

export type SavedReport = {
  id: string;
  title: string;
  workspaceId: string;
  workspaceName?: string | null;
  organizationId?: string | null;
  type: string;
  basedOn: ReportBasedOn;
  layout: ReportLayout;
  dataSources: ReportDataSource[];
  excludedProjects: string[];
  filters: ReportFilters;
  columns: string[];
  sharing: string;
  sharingKey?: ReportSharing;
  sharedWith?: string[];
  canEdit?: boolean;
  createdBy?: { id: string; name: string } | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ReportColumn = {
  key: string;
  label: string;
  category?: string;
};

export type SourceNode = {
  type: ReportSourceType;
  id: string;
  name: string;
  children?: SourceNode[];
};

export type ReportMeta = {
  workspace: { id: string; name: string };
  columns: ReportColumn[];
  statuses: { id: string; label: string; group: string }[];
  statusGroups: { id: string; label: string; group: string }[];
  assignees: { _id: string; name: string }[];
  authors: { _id: string; name: string }[];
  taskTypes: string[];
  importance: { id: string; label: string }[];
  customItemTypes: { id: string; label: string }[];
  members?: { _id: string; name: string }[];
};

export type ReportRowKind = "folder" | "project" | "task" | "subtask" | "time_entry";

export type ReportRow = {
  id: string;
  parentId?: string | null;
  kind?: ReportRowKind;
  hasChildren?: boolean;
  depth?: number;
  cells: Record<string, string>;
};

export type ReportData = {
  columns: ReportColumn[];
  rows: ReportRow[];
  total: number;
  basedOn?: ReportBasedOn;
  report?: SavedReport;
};

export const EMPTY_FILTERS: ReportFilters = {
  customItemType: [],
  status: [],
  assignee: [],
  tasksToDo: false,
  taskType: [],
  importance: [],
  effort: { operator: "", value: "", value2: "" },
  createdDate: { operator: "", value: "", value2: "" },
  startDate: { operator: "", value: "", value2: "" },
  dueDate: { operator: "", value: "", value2: "" },
  completedDate: { operator: "", value: "", value2: "" },
  lastModifiedDate: { operator: "", value: "", value2: "" },
  author: [],
};

export const DEFAULT_REPORT_COLUMNS = [
  "title",
  "assignee",
  "author",
  "startDate",
  "dueDate",
  "status",
] as const;

export const DEFAULT_EDITOR_STATE = {
  title: "",
  type: "custom" as const,
  basedOn: "tasks" as ReportBasedOn,
  layout: "table" as ReportLayout,
  dataSources: [] as ReportDataSource[],
  excludedProjects: [] as string[],
  columns: [...DEFAULT_REPORT_COLUMNS],
  filters: EMPTY_FILTERS,
};
