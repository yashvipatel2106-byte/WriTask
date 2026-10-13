"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Folder, FolderKanban } from "lucide-react";
import type { ReportColumn, ReportRow } from "@/lib/reports/types";

function rowsForParent(rows: ReportRow[]) {
  const children = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const parent = row.parentId || "";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(row);
  }
  return children;
}

function descendantIds(rows: ReportRow[], id: string) {
  const children = rowsForParent(rows);
  const out: string[] = [];
  const walk = (parentId: string) => {
    for (const child of children.get(parentId) || []) {
      out.push(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

function visibleRows(rows: ReportRow[], expanded: Set<string>) {
  const children = rowsForParent(rows);
  const out: { row: ReportRow; depth: number }[] = [];
  const walk = (parentId: string, depth: number) => {
    for (const row of children.get(parentId) || []) {
      out.push({ row, depth });
      if (row.hasChildren && expanded.has(row.id)) {
        walk(row.id, depth + 1);
      }
    }
  };
  walk("", 0);
  return out;
}

export default function ReportResultsTable({
  columns,
  rows,
  hierarchical,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  hierarchical: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const display = useMemo(() => {
    if (!hierarchical) {
      return rows.map((row) => ({ row, depth: 0 }));
    }
    return visibleRows(rows, expanded);
  }, [rows, hierarchical, expanded]);

  const toggle = (id: string, kind?: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const descendants = descendantIds(rows, id);
      if (next.has(id)) {
        next.delete(id);
        for (const childId of descendants) next.delete(childId);
      } else {
        next.add(id);
        if (kind === "folder" || kind === "project") {
          const byId = new Map(rows.map((row) => [row.id, row]));
          for (const childId of descendants) {
            if (byId.get(childId)?.hasChildren) next.add(childId);
          }
        }
      }
      return next;
    });
  };

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-800">
          {columns.map((col) => (
            <th
              key={col.key}
              className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400"
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
        {display.map(({ row, depth }) => {
          const group = row.kind === "folder" || row.kind === "project";
          return (
            <tr
              key={row.id}
              className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              {columns.map((col) => {
                if (col.key === "title") {
                  return (
                    <td
                      key={col.key}
                      className="py-2.5 pr-4 text-slate-700 dark:text-slate-200"
                    >
                      <div
                        className="flex min-w-0 items-center gap-1"
                        style={{ paddingLeft: depth * 16 }}
                      >
                        {hierarchical && row.hasChildren ? (
                          <button
                            type="button"
                            aria-label={
                              expanded.has(row.id)
                                ? `Collapse ${row.cells?.title || "row"}`
                                : `Expand ${row.cells?.title || "row"}`
                            }
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            onClick={() => toggle(row.id, row.kind)}
                          >
                            <ChevronRight
                              size={14}
                              className={`transition-transform ${
                                expanded.has(row.id) ? "rotate-90" : ""
                              }`}
                            />
                          </button>
                        ) : hierarchical ? (
                          <span className="inline-block h-5 w-5 shrink-0" />
                        ) : null}
                        {row.kind === "folder" ? (
                          <Folder
                            size={14}
                            className="shrink-0 text-amber-500"
                          />
                        ) : row.kind === "project" ? (
                          <FolderKanban
                            size={14}
                            className="shrink-0 text-cyan-600 dark:text-cyan-400"
                          />
                        ) : null}
                        <span
                          className={`truncate ${
                            group
                              ? "font-semibold text-slate-900 dark:text-slate-100"
                              : ""
                          }`}
                        >
                          {row.cells?.[col.key] || "—"}
                        </span>
                      </div>
                    </td>
                  );
                }
                return (
                  <td
                    key={col.key}
                    className="py-2.5 pr-4 text-slate-700 dark:text-slate-200"
                  >
                    {group ? "" : row.cells?.[col.key] || "—"}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
