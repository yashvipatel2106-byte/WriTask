"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Filter,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import { authFetch } from "@/lib/validation/authFetch";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import CreateCustomFieldDialog from "@/components/projects/CreateCustomFieldDialog";
import Select, { fieldSelectTriggerClass } from "@/components/ui/Select";
import {
  CUSTOM_FIELD_TYPE_LABELS,
  type ProjectCustomField,
} from "@/lib/kanbanCardPreview";
import { useOrganization } from "@/components/context/organizationContext";

type WorkspaceRow = {
  id: string;
  name: string;
  kind: string;
  organizationId: string | null;
};

function formatAddedTo(names: string[] | undefined): string {
  if (!names?.length) return "—";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/** Map a field to the workspace section it belongs in on this page. */
function fieldWorkspaceKey(
  field: ProjectCustomField,
  workspaces: WorkspaceRow[]
): string {
  if (field.workspaceId) {
    const match = workspaces.find((ws) => ws.id === field.workspaceId);
    if (match) return match.id;
  }

  const isPersonalField =
    Boolean(field.includePersonal) && !(field.organizationIds?.length);
  if (isPersonalField) {
    const personal = workspaces.find((ws) => ws.kind === "personal");
    if (personal) return personal.id;
  }

  return field.workspaceId || "__unassigned__";
}

/** Shared column widths so headers align across every workspace section. */
function CustomFieldTableColGroup() {
  return (
    <colgroup>
      <col style={{ width: "72px" }} />
      <col style={{ width: "13%" }} />
      <col style={{ width: "16%" }} />
      <col style={{ width: "9%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "11%" }} />
      <col style={{ width: "11%" }} />
      <col style={{ width: "16%" }} />
      <col style={{ width: "88px" }} />
    </colgroup>
  );
}

function CustomFieldTableHead() {
  return (
    <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide dark:bg-slate-800/80 dark:text-slate-400">
      <tr>
        <th className="px-3 py-3 font-medium">Status</th>
        <th className="px-3 py-3 font-medium">Name</th>
        <th className="px-3 py-3 font-medium">Description</th>
        <th className="px-3 py-3 font-medium">Type</th>
        <th className="px-3 py-3 font-medium">Author</th>
        <th className="px-3 py-3 font-medium whitespace-nowrap">
          Total time used
        </th>
        <th className="px-3 py-3 font-medium">Belongs to</th>
        <th className="px-3 py-3 font-medium">Added to</th>
        <th className="px-3 py-3 font-medium text-right">Actions</th>
      </tr>
    </thead>
  );
}

function StatusToggle({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} status`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-cyan-600" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function CustomFieldsPage() {
  const { currentOrg } = useOrganization();
  const [fields, setFields] = useState<ProjectCustomField[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingField, setEditingField] = useState<ProjectCustomField | null>(
    null
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = currentOrg
        ? `?organizationId=${currentOrg.organizationId}`
        : "";
      const [cfRes, wsRes] = await Promise.all([
        authFetch("/custom-fields"),
        authFetch(`/workspaces${q}`),
      ]);
      const cfData = await cfRes.json().catch(() => ({}));
      const wsData = await wsRes.json().catch(() => ({}));
      if (!cfRes.ok) {
        throw new Error(cfData.message || "Failed to load custom fields");
      }
      setFields(Array.isArray(cfData.fields) ? cfData.fields : []);
      setWorkspaces(Array.isArray(wsData.workspaces) ? wsData.workspaces : []);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to load custom fields"
      );
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ws of workspaces) map.set(ws.id, ws.name);
    return map;
  }, [workspaces]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return fields.filter((field) => {
      if (workspaceFilter !== "all") {
        const key = fieldWorkspaceKey(field, workspaces);
        if (key !== workspaceFilter) return false;
      }
      if (!needle) return true;
      const wsName = field.workspaceId
        ? workspaceNameById.get(field.workspaceId) || ""
        : "";
      const author = field.authorName || "";
      const added = (field.addedTo || []).join(" ");
      return (
        field.name.toLowerCase().includes(needle) ||
        field.type.toLowerCase().includes(needle) ||
        (field.description || "").toLowerCase().includes(needle) ||
        wsName.toLowerCase().includes(needle) ||
        author.toLowerCase().includes(needle) ||
        added.toLowerCase().includes(needle)
      );
    });
  }, [fields, search, workspaceFilter, workspaceNameById, workspaces]);

  const grouped = useMemo(() => {
    const groups: Array<{
      key: string;
      title: string;
      fields: ProjectCustomField[];
    }> = [];
    const byId = new Map<string, ProjectCustomField[]>();

    for (const field of filtered) {
      const key = fieldWorkspaceKey(field, workspaces);
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key)!.push(field);
    }

    for (const ws of workspaces) {
      const rows = byId.get(ws.id);
      if (!rows?.length) continue;
      if (workspaceFilter !== "all" && workspaceFilter !== ws.id) continue;
      groups.push({ key: ws.id, title: ws.name, fields: rows });
      byId.delete(ws.id);
    }

    for (const [key, rows] of byId) {
      groups.push({
        key,
        title:
          key === "__unassigned__"
            ? "Unassigned"
            : workspaceNameById.get(key) || "Workspace",
        fields: rows,
      });
    }

    return groups;
  }, [filtered, workspaces, workspaceFilter, workspaceNameById]);

  const handleStatusToggle = async (
    field: ProjectCustomField,
    isActive: boolean
  ) => {
    setTogglingId(field.id);
    setFields((current) =>
      current.map((row) =>
        row.id === field.id ? { ...row, isActive } : row
      )
    );
    try {
      const res = await authFetch(`/custom-fields/${field.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to update status");
      }
      if (data.field) {
        setFields((current) =>
          current.map((row) =>
            row.id === field.id ? { ...row, ...data.field } : row
          )
        );
      }
    } catch (e) {
      setFields((current) =>
        current.map((row) =>
          row.id === field.id ? { ...row, isActive: !isActive } : row
        )
      );
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (field: ProjectCustomField) => {
    const wsLabel = field.workspaceId
      ? workspaceNameById.get(field.workspaceId) || "workspace"
      : "its workspace";
    const ok = await confirmDialog({
      title: "Delete custom field?",
      description: `“${field.name}” will be removed from ${wsLabel}. Task values for this field will be cleared. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await authFetch(`/custom-fields/${field.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to delete field");
      }
      toast.success("Custom field deleted");
      setFields((current) => current.filter((row) => row.id !== field.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete field");
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-4 sm:p-6 lg:p-10 dark:bg-[#0B1120] dark:text-slate-100">
          <div className="mx-auto w-full max-w-7xl">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                  Custom Fields
                </h1>
                <p className="text-slate-500 mt-1 dark:text-slate-400">
                  Fields are grouped by the workspace where they exist.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingField(null);
                  setShowCreate(true);
                }}
                className="btn btn-primary inline-flex items-center gap-2 shrink-0"
              >
                <Plus size={16} />
                Create custom field
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4 text-sm text-slate-600 dark:text-slate-300">
              <div className="relative flex-1 min-w-[180px] max-w-md">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="field-input pl-10"
                />
              </div>
              <div className="relative sm:w-52">
                <Filter
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400"
                />
                <Select
                  value={workspaceFilter}
                  onChange={setWorkspaceFilter}
                  ariaLabel="Filter by workspace"
                  className="w-full"
                  triggerClassName={(open) =>
                    fieldSelectTriggerClass(open, "pl-9")
                  }
                  options={[
                    { value: "all", label: "All workspaces" },
                    ...workspaces.map((ws) => ({
                      value: ws.id,
                      label: ws.name,
                    })),
                  ]}
                />
              </div>
             
            </div>

            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-3">
              Account
            </p>

            {loading ? (
              <p className="p-8 text-sm text-slate-500 text-center">Loading…</p>
            ) : grouped.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center dark:bg-slate-900 dark:border-slate-800">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {fields.length === 0
                    ? "No custom fields yet. Create one and choose where it should exist."
                    : "No fields match your search or filter."}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {grouped.map((group) => (
                  <section key={group.key}>
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
                      {group.title}
                    </h2>
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden dark:bg-slate-900 dark:border-slate-800">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[960px] table-fixed text-sm text-left">
                          <CustomFieldTableColGroup />
                          <CustomFieldTableHead />
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {group.fields.map((field) => {
                              const isActive = field.isActive !== false;
                              return (
                                <tr
                                  key={field.id}
                                  className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                                    !isActive ? "opacity-60" : ""
                                  }`}
                                >
                                  <td className="px-3 py-3">
                                    <StatusToggle
                                      checked={isActive}
                                      label={field.name}
                                      disabled={togglingId === field.id}
                                      onChange={(next) =>
                                        void handleStatusToggle(field, next)
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-3">
                                    <p className="font-medium text-slate-900 truncate dark:text-slate-100">
                                      {field.name}
                                    </p>
                                  </td>
                                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                                    <p className="line-clamp-2 break-words">
                                      {field.description?.trim() || "—"}
                                    </p>
                                  </td>
                                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                    {CUSTOM_FIELD_TYPE_LABELS[field.type] ||
                                      field.type}
                                  </td>
                                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300 truncate">
                                    {field.authorName || "—"}
                                  </td>
                                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                                    {field.timesUsedTotal ?? 0}
                                  </td>
                                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300 truncate">
                                    {group.title}
                                  </td>
                                  <td
                                    className="px-3 py-3 text-slate-600 dark:text-slate-300"
                                    title={(field.addedTo || []).join(", ")}
                                  >
                                    <p className="line-clamp-2 break-words">
                                      {formatAddedTo(field.addedTo)}
                                    </p>
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex justify-end gap-1">
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-sm !px-2"
                                        aria-label={`Edit ${field.name}`}
                                        onClick={() => {
                                          setEditingField(field);
                                          setShowCreate(true);
                                        }}
                                      >
                                        <Pencil size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-sm !px-2 text-red-600 hover:text-red-700 dark:text-red-400"
                                        aria-label={`Delete ${field.name}`}
                                        onClick={() => void handleDelete(field)}
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          {(showCreate || editingField) && (
            <CreateCustomFieldDialog
              editingField={editingField}
              initialOrganizationId={currentOrg?.organizationId || null}
              initialIncludePersonal={!currentOrg}
              onClose={() => {
                setShowCreate(false);
                setEditingField(null);
              }}
              onSaved={(field) => {
                setShowCreate(false);
                setEditingField(null);
                setFields((current) => {
                  const index = current.findIndex((row) => row.id === field.id);
                  if (index >= 0) {
                    const next = [...current];
                    next[index] = { ...next[index], ...field };
                    return next;
                  }
                  return [...current, field];
                });
                toast.success(
                  editingField
                    ? "Custom field updated"
                    : "Custom field created"
                );
                void load();
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
