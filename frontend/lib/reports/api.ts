import { authFetch } from "@/lib/validation/authFetch";
import type {
  ReportData,
  ReportDataSource,
  ReportMeta,
  SavedReport,
  SourceNode,
} from "./types";

function qs(workspaceId: string) {
  const params = new URLSearchParams();
  params.set("workspaceId", workspaceId);
  return `?${params.toString()}`;
}

function optionalWorkspaceQs(workspaceId?: string | null) {
  if (!workspaceId) return "";
  return qs(workspaceId);
}

export async function fetchReportDataSources(workspaceId: string): Promise<{
  workspace: SourceNode;
  tree: SourceNode[];
}> {
  const res = await authFetch(`/reports/data-sources${qs(workspaceId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to load folders.");
  return {
    workspace: data.workspace,
    tree: Array.isArray(data.tree) ? data.tree : [],
  };
}

export async function fetchExcludableProjects(
  workspaceId: string,
  dataSources: ReportDataSource[]
): Promise<{ id: string; name: string }[]> {
  const res = await authFetch(`/reports/excludable-projects${qs(workspaceId)}`, {
    method: "POST",
    body: JSON.stringify({ dataSources, workspaceId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to load projects.");
  return Array.isArray(data.projects) ? data.projects : [];
}

export async function fetchReportMeta(workspaceId: string): Promise<ReportMeta> {
  const res = await authFetch(`/reports/meta${qs(workspaceId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to load report options.");
  return data as ReportMeta;
}

export async function fetchReports(workspaceId: string): Promise<{
  reports: SavedReport[];
  canCreate: boolean;
}> {
  const res = await authFetch(`/reports${qs(workspaceId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to load reports.");
  return {
    reports: Array.isArray(data.reports) ? data.reports : [],
    canCreate: Boolean(data.canCreate),
  };
}

export async function fetchReport(
  id: string,
  workspaceId?: string | null
): Promise<SavedReport> {
  const res = await authFetch(
    `/reports/saved/${id}${optionalWorkspaceQs(workspaceId)}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to load report.");
  return data.report;
}

export async function fetchReportRows(
  id: string,
  workspaceId?: string | null
): Promise<ReportData> {
  const res = await authFetch(
    `/reports/saved/${id}/data${optionalWorkspaceQs(workspaceId)}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Unable to generate report.");
  return data as ReportData;
}

export async function createReport(
  workspaceId: string,
  payload: Record<string, unknown>
): Promise<SavedReport> {
  const res = await authFetch(`/reports${qs(workspaceId)}`, {
    method: "POST",
    body: JSON.stringify({ ...payload, workspaceId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Unable to create report.");
  return data.report;
}

export async function updateReport(
  id: string,
  payload: Record<string, unknown>,
  workspaceId?: string | null
): Promise<SavedReport> {
  const res = await authFetch(
    `/reports/saved/${id}${optionalWorkspaceQs(workspaceId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ ...payload, workspaceId }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Unable to save report.");
  return data.report;
}

export async function deleteReport(workspaceId: string, id: string) {
  const res = await authFetch(`/reports/saved/${id}${qs(workspaceId)}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Unable to delete report.");
}

export async function downloadReportExport(
  id: string,
  kind: "excel" | "pdf",
  fallbackName: string,
  workspaceId?: string | null
) {
  const res = await authFetch(
    `/reports/saved/${id}/export/${kind}${optionalWorkspaceQs(workspaceId)}`
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Unable to export report.");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] || fallbackName;
  link.click();
  URL.revokeObjectURL(url);
}
