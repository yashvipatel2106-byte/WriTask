"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Folder, FolderKanban, Plus, Search, X } from "lucide-react";
import FormLabel from "@/components/ui/FormLabel";
import {
  fetchExcludableProjects,
  fetchReportDataSources,
  fetchReportMeta,
} from "@/lib/reports/api";
import {
  DEFAULT_EDITOR_STATE,
  DEFAULT_REPORT_COLUMNS,
  EMPTY_FILTERS,
  type ReportBasedOn,
  type ReportDataSource,
  type ReportFilters,
  type ReportLayout,
  type ReportMeta,
  type ReportSharing,
  type SavedReport,
  type SourceNode,
} from "@/lib/reports/types";
import ReportColumnPicker from "./ReportColumnPicker";
import ReportFilterPanel from "./ReportFilterPanel";

type EditorValue = {
  title: string;
  basedOn: ReportBasedOn;
  layout: ReportLayout;
  dataSources: ReportDataSource[];
  excludedProjects: string[];
  columns: string[];
  filters: ReportFilters;
  sharing: ReportSharing;
  sharedWith: string[];
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  initial?: SavedReport | null;
  submitting?: boolean;
  error?: string;
  submitLabel: string;
  /** Constrain height and pin actions when nested in the create/edit dialog. */
  inDialog?: boolean;
  onCancel: () => void;
  onSubmit: (value: EditorValue) => void;
};

function sourceKey(s: ReportDataSource) {
  return `${s.type}:${s.id}`;
}

function flattenTree(nodes: SourceNode[]): SourceNode[] {
  const out: SourceNode[] = [];
  const walk = (list: SourceNode[]) => {
    for (const node of list) {
      out.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

function Chip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 text-cyan-800 px-2.5 py-1 text-xs font-medium dark:bg-cyan-500/10 dark:text-cyan-300">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}>
        <X size={12} />
      </button>
    </span>
  );
}

export default function ReportEditor({
  workspaceId,
  workspaceName,
  initial,
  submitting,
  error,
  submitLabel,
  inDialog = false,
  onCancel,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState(initial?.title || "");
  const [basedOn, setBasedOn] = useState<ReportBasedOn>(initial?.basedOn || "tasks");
  const [layout, setLayout] = useState<ReportLayout>(initial?.layout || "table");
  const [sharing, setSharing] = useState<ReportSharing>(
    initial?.sharingKey || "private"
  );
  const [sharedWith, setSharedWith] = useState<string[]>(
    initial?.sharedWith || []
  );
  const [dataSources, setDataSources] = useState<ReportDataSource[]>(
    initial?.dataSources || []
  );
  const [excludedProjects, setExcludedProjects] = useState<string[]>(
    initial?.excludedProjects || []
  );
  const [columns, setColumns] = useState<string[]>(
    initial?.columns?.length ? initial.columns : DEFAULT_EDITOR_STATE.columns
  );
  const [filters, setFilters] = useState<ReportFilters>(
    initial?.filters ? { ...EMPTY_FILTERS, ...initial.filters } : EMPTY_FILTERS
  );
  const [typeQuery, setTypeQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const excludeRef = useRef<HTMLDivElement>(null);
  const accessRef = useRef<HTMLDivElement>(null);
  const [sourceSearch, setSourceSearch] = useState("");
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingExclude, setLoadingExclude] = useState(false);
  const [tree, setTree] = useState<SourceNode[]>([]);
  const [workspaceNode, setWorkspaceNode] = useState<SourceNode | null>(null);
  const [excludable, setExcludable] = useState<{ id: string; name: string }[]>(
    []
  );
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchReportDataSources(workspaceId),
      fetchReportMeta(workspaceId),
    ])
      .then(([ds, m]) => {
        if (cancelled) return;
        setWorkspaceNode(ds.workspace);
        setTree(ds.tree);
        setMeta(m);
        setLoadingTree(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load");
        setLoadingTree(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!dataSources.length) return;
    let cancelled = false;
    fetchExcludableProjects(workspaceId, dataSources)
      .then((projects) => {
        if (cancelled) return;
        setExcludable(projects);
        const allowed = new Set(projects.map((p) => p.id));
        setExcludedProjects((prev) => prev.filter((id) => allowed.has(id)));
        setLoadingExclude(false);
      })
      .catch(() => {
        if (cancelled) return;
        setExcludable([]);
        setLoadingExclude(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, dataSources]);

  useEffect(() => {
    if (!pickerOpen && !excludeOpen && !accessOpen) return;
    const closeIfOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        pickerOpen &&
        pickerRef.current &&
        !pickerRef.current.contains(target)
      ) {
        setPickerOpen(false);
      }
      if (
        excludeOpen &&
        excludeRef.current &&
        !excludeRef.current.contains(target)
      ) {
        setExcludeOpen(false);
      }
      if (
        accessOpen &&
        accessRef.current &&
        !accessRef.current.contains(target)
      ) {
        setAccessOpen(false);
      }
    };
    document.addEventListener("mousedown", closeIfOutside);
    return () => document.removeEventListener("mousedown", closeIfOutside);
  }, [pickerOpen, excludeOpen, accessOpen]);

  const selectedSet = useMemo(
    () => new Set(dataSources.map(sourceKey)),
    [dataSources]
  );

  const nameBySource = useMemo(() => {
    const map = new Map<string, string>();
    if (workspaceNode) {
      map.set(sourceKey({ type: "workspace", id: workspaceNode.id }), workspaceNode.name);
    }
    for (const node of flattenTree(tree)) {
      map.set(sourceKey({ type: node.type, id: node.id }), node.name);
    }
    return map;
  }, [tree, workspaceNode]);

  const pickerNodes = useMemo(() => {
    const all: SourceNode[] = workspaceNode
      ? [workspaceNode, ...flattenTree(tree)]
      : flattenTree(tree);
    const q = sourceSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((n) => n.name.toLowerCase().includes(q));
  }, [workspaceNode, tree, sourceSearch]);

  const addSource = (node: SourceNode) => {
    const next: ReportDataSource = { type: node.type, id: node.id };
    const key = sourceKey(next);
    if (selectedSet.has(key)) return;
    setDataSources((prev) => [...prev, next]);
    setPickerOpen(false);
    setSourceSearch("");
  };

  const removeSource = (key: string) => {
    setDataSources((prev) => prev.filter((s) => sourceKey(s) !== key));
  };

  const typeMatches =
    !typeQuery.trim() || "custom report".includes(typeQuery.trim().toLowerCase());

  const handleSubmit = () => {
    const required = initial ? ["title"] : [...DEFAULT_REPORT_COLUMNS];
    const nextColumns = [...required];
    for (const key of columns) {
      if (!nextColumns.includes(key)) nextColumns.push(key);
    }
    onSubmit({
      title: title.trim(),
      basedOn,
      layout,
      dataSources,
      excludedProjects: dataSources.length ? excludedProjects : [],
      columns: nextColumns,
      filters,
      sharing,
      sharedWith: sharing === "custom" ? sharedWith : [],
    });
  };

  function renderTree(nodes: SourceNode[], depth = 0): ReactNode {
    return nodes.map((node) => {
      const key = sourceKey({ type: node.type, id: node.id });
      const selected = selectedSet.has(key);
      return (
        <div key={key}>
          <button
            type="button"
            disabled={selected}
            onClick={() => addSource(node)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
              selected
                ? "text-slate-400"
                : "hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            {node.type === "folder" ? (
              <Folder size={14} className="text-amber-500" />
            ) : (
              <FolderKanban size={14} className="text-cyan-600" />
            )}
            {node.name}
          </button>
          {node.children?.length ? renderTree(node.children, depth + 1) : null}
        </div>
      );
    });
  }

  return (
    <div
      className={`flex flex-col ${inDialog ? "min-h-0 flex-1" : ""}`}
    >
      <div
        className={`min-h-0 ${inDialog ? "flex-1 overflow-y-auto px-5 sm:px-6" : "overflow-visible px-1"}`}
      >
        {loadError && (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400">{loadError}</p>
        )}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,0.95fr)]">
          <div className="space-y-4">
            <div>
              <FormLabel>Title</FormLabel>
              <input
                id="report-title"
                className="field-input"
                placeholder="Report name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <FormLabel>Type</FormLabel>
              <div className="relative mb-2">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="field-input pl-9"
                  placeholder="Search"
                  value={typeQuery}
                  onChange={(e) => setTypeQuery(e.target.value)}
                />
              </div>
              {typeMatches && (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl bg-cyan-50 px-3 py-2.5 text-left text-sm font-medium text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-300"
                >
                  <Plus size={16} />
                  Custom report
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <FormLabel>Location</FormLabel>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-700">
                <Folder size={15} className="text-cyan-600" />
                {workspaceName}
              </div>
            </div>

            <div>
              <FormLabel>Data source</FormLabel>
              <div className="flex flex-wrap gap-2 mb-2">
                {dataSources.map((s) => (
                  <Chip
                    key={sourceKey(s)}
                    label={nameBySource.get(sourceKey(s)) || s.id}
                    onRemove={() => removeSource(sourceKey(s))}
                  />
                ))}
              </div>
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => {
                    setExcludeOpen(false);
                    setPickerOpen((o) => !o);
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  <Plus size={14} /> Add source
                </button>
                {pickerOpen && (
                  <div className="absolute z-20 mt-2 w-full min-w-[240px] rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <input
                      className="field-input mb-2"
                      placeholder="Select project, folder or space"
                      value={sourceSearch}
                      onChange={(e) => setSourceSearch(e.target.value)}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {loadingTree ? (
                        <p className="px-2 py-3 text-sm text-slate-400">
                          Loading folders…
                        </p>
                      ) : pickerNodes.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-slate-400">
                          No folders or projects in this workspace.
                        </p>
                      ) : sourceSearch ? (
                        pickerNodes.map((node) => (
                          <button
                            key={sourceKey({ type: node.type, id: node.id })}
                            type="button"
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                            onClick={() => addSource(node)}
                          >
                            {node.name}
                          </button>
                        ))
                      ) : (
                        <>
                          {workspaceNode && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                              onClick={() => addSource(workspaceNode)}
                              disabled={selectedSet.has(
                                sourceKey({
                                  type: "workspace",
                                  id: workspaceNode.id,
                                })
                              )}
                            >
                              {workspaceNode.name} (space)
                            </button>
                          )}
                          {renderTree(tree)}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <FormLabel>Exclude projects</FormLabel>
              <div className="flex flex-wrap gap-2 mb-2">
                {excludedProjects.map((id) => (
                  <Chip
                    key={id}
                    label={excludable.find((p) => p.id === id)?.name || id}
                    onRemove={() =>
                      setExcludedProjects((prev) => prev.filter((x) => x !== id))
                    }
                  />
                ))}
              </div>
              <div className="relative" ref={excludeRef}>
                <button
                  type="button"
                  disabled={!dataSources.length}
                  onClick={() => {
                    setPickerOpen(false);
                    setExcludeOpen((o) => !o);
                  }}
                  className="btn btn-secondary btn-sm disabled:opacity-50"
                >
                  {loadingExclude ? "Loading projects…" : "Select projects"}
                </button>
                {excludeOpen && dataSources.length > 0 && (
                  <div className="absolute z-20 mt-2 w-full min-w-[220px] max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    {excludable.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-slate-400">
                        No projects in the selected sources.
                      </p>
                    ) : (
                      excludable.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={excludedProjects.includes(p.id)}
                            onChange={() =>
                              setExcludedProjects((prev) =>
                                prev.includes(p.id)
                                  ? prev.filter((x) => x !== p.id)
                                  : [...prev, p.id]
                              )
                            }
                          />
                          {p.name}
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <FormLabel>Based on</FormLabel>
              <div className="space-y-2 text-sm">
                {(
                  [
                    ["projects", "Projects"],
                    ["tasks", "Tasks and subtasks"],
                    ["time_entries", "Time entries"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="basedOn"
                      checked={basedOn === value}
                      onChange={() => setBasedOn(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <FormLabel>Layout</FormLabel>
              <div className="space-y-2 text-sm">
                {(
                  [
                    ["table", "Table"],
                    ["column", "Column"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="layout"
                      checked={layout === value}
                      onChange={() => setLayout(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <FormLabel>Access</FormLabel>
              <div className="space-y-2 text-sm">
                {(
                  [
                    ["private", "Only for me"],
                    ["organization", "Everyone"],
                    ["custom", "Custom"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="report-access"
                      checked={sharing === value}
                      onChange={() => setSharing(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {sharing === "custom" && (
                <div className="relative mt-2" ref={accessRef}>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {sharedWith.map((id) => {
                      const member = (meta?.members || []).find(
                        (m) => m._id === id
                      );
                      return (
                        <Chip
                          key={id}
                          label={member?.name || id}
                          onRemove={() =>
                            setSharedWith((prev) => prev.filter((x) => x !== id))
                          }
                        />
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAccessOpen((o) => !o)}
                    className="btn btn-secondary btn-sm"
                  >
                    Select members
                  </button>
                  {accessOpen && (
                    <div className="absolute z-20 mt-2 w-full min-w-[220px] max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      {(meta?.members || []).length === 0 ? (
                        <p className="px-2 py-3 text-sm text-slate-400">
                          No organization members found.
                        </p>
                      ) : (
                        (meta?.members || []).map((member) => (
                          <label
                            key={member._id}
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={sharedWith.includes(member._id)}
                              onChange={() =>
                                setSharedWith((prev) =>
                                  prev.includes(member._id)
                                    ? prev.filter((x) => x !== member._id)
                                    : [...prev, member._id]
                                )
                              }
                            />
                            {member.name}
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <ReportFilterPanel
              meta={meta}
              filters={filters}
              onChange={setFilters}
            />
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
          <ReportColumnPicker
            columns={meta?.columns || []}
            selected={columns}
            onChange={setColumns}
            mode={initial ? "edit" : "create"}
          />
        </div>
      </div>

      <div
        className={`flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${
          inDialog ? "px-5 py-4 sm:px-6" : "mt-4 pt-4"
        }`}
      >
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { EditorValue };
