"use client";

import { authFetch } from "@/lib/validation/authFetch";
import { buildStatusLabels, buildStatusOptions, type CustomStatus } from "@/lib/taskStatuses";
import type { CardPreviewConfig, ProjectCustomField } from "@/lib/kanbanCardPreview";
import type { TaskItem } from "./KanbanBoard";
import TaskDetailDialog from "./TaskDetailDialog";
import { useMemo, useState } from "react";
import { ClipboardList, Search, X } from "lucide-react";
import { avatarBg, avatarInitials } from "@/lib/avatarColor";
import Select from "@/components/ui/Select";
import { confirmDialog } from "@/components/ui/confirm";
import { PRIORITY_CHIP } from "@/lib/constants/taskPriority";

type Props = {
  projectId: string;
  tasks: TaskItem[];
  canEdit: boolean;
  customStatuses?: CustomStatus[];
  customFields?: ProjectCustomField[];
  otherCustomFields?: ProjectCustomField[];
  cardPreviewConfig?: CardPreviewConfig | null;
  adoptedCustomFieldIds?: string[];
  organizationId?: string | null;
  onTasksChange: (tasks: TaskItem[]) => void;
};

function creatorId(task: TaskItem): string | null {
  const cb = task.createdBy as { _id?: string; username?: string } | undefined;
  if (!cb) return null;
  return cb._id ? String(cb._id) : cb.username || null;
}

function taskAssigneeIds(task: TaskItem): string[] {
  const ids = new Set<string>();
  if (task.assignee?._id) ids.add(task.assignee._id);
  for (const a of task.assignees || []) {
    if (a._id) ids.add(a._id);
  }
  return [...ids];
}

function dueDateKey(task: TaskItem): string | null {
  if (!task.dueDate) return null;
  const d = new Date(task.dueDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export default function TableView({
  projectId,
  tasks,
  canEdit,
  customStatuses = [],
  customFields = [],
  otherCustomFields = [],
  cardPreviewConfig = null,
  adoptedCustomFieldIds = [],
  organizationId = null,
  onTasksChange,
}: Props) {
  const statusLabels = buildStatusLabels(customStatuses);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const statusOptions = buildStatusOptions(customStatuses);

  const [searchQuery, setSearchQuery] = useState("");
  const [createdByFilter, setCreatedByFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const creatorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      const id = creatorId(task);
      const label = task.createdBy?.username;
      if (id && label) map.set(id, label);
    }
    return [
      { value: "", label: "All creators" },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [tasks]);

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      const people = [
        ...(task.assignees || []),
        ...(task.assignee ? [task.assignee] : []),
      ];
      for (const person of people) {
        if (person._id && person.username) {
          map.set(person._id, person.username);
        }
      }
    }
    return [
      { value: "", label: "All assignees" },
      { value: "__unassigned__", label: "Unassigned" },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [tasks]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    createdByFilter !== "" ||
    assigneeFilter !== "" ||
    dateFrom !== "" ||
    dateTo !== "";

  const filteredTasks = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();

    return tasks.filter((task) => {
      if (createdByFilter) {
        const id = creatorId(task);
        if (id !== createdByFilter) return false;
      }

      if (assigneeFilter) {
        const ids = taskAssigneeIds(task);
        if (assigneeFilter === "__unassigned__") {
          if (ids.length > 0) return false;
        } else if (!ids.includes(assigneeFilter)) {
          return false;
        }
      }

      if (dateFrom || dateTo) {
        const due = dueDateKey(task);
        if (!due) return false;
        if (dateFrom && due < dateFrom) return false;
        if (dateTo && due > dateTo) return false;
      }

      if (needle) {
        const haystack = [
          task.title,
          task.description,
          task.status,
          statusLabels[task.status],
          task.priority,
          task.createdBy?.username,
          task.assignee?.username,
          ...(task.assignees || []).map((a) => a.username),
          task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "",
          task.startDate ? new Date(task.startDate).toLocaleDateString() : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  }, [
    tasks,
    searchQuery,
    createdByFilter,
    assigneeFilter,
    dateFrom,
    dateTo,
    statusLabels,
  ]);

  const clearFilters = () => {
    setSearchQuery("");
    setCreatedByFilter("");
    setAssigneeFilter("");
    setDateFrom("");
    setDateTo("");
  };

  const updateStatus = async (taskId: string, status: string) => {
    const res = await authFetch(`/projects/${projectId}/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      onTasksChange(
        tasks.map((t) => (t._id === taskId ? { ...t, ...updated } : t))
      );
    }
  };

  const deleteTask = async (taskId: string) => {
    const ok = await confirmDialog({
      title: "Move this task to trash?",
      description: "You can restore it later from Trash.",
      confirmLabel: "Move to trash",
      variant: "danger",
    });
    if (!ok) return;
    const res = await authFetch(`/projects/${projectId}/tasks/${taskId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onTasksChange(tasks.filter((t) => t._id !== taskId));
    }
  };

  const openTask = (task: TaskItem) => {
    setSelectedTask(task);
  };

  const handleTaskUpdated = (updated: TaskItem) => {
    onTasksChange(tasks.map((t) => (t._id === updated._id ? updated : t)));
    setSelectedTask(updated);
  };

  const handleTaskDeleted = (taskId: string) => {
    onTasksChange(tasks.filter((t) => t._id !== taskId));
    setSelectedTask(null);
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks…"
              aria-label="Search tasks"
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-9 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-medium text-cyan-700 hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-slate-500 mb-1 dark:text-slate-400">
              Created by
            </label>
            <Select
              value={createdByFilter}
              onChange={setCreatedByFilter}
              options={creatorOptions}
              className="w-full"
              menuClassName="min-w-[180px]"
            />
          </div>

          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-slate-500 mb-1 dark:text-slate-400">
              Assigned to
            </label>
            <Select
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              options={assigneeOptions}
              className="w-full"
              menuClassName="min-w-[180px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1 dark:text-slate-400">
              Due from
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 dark:[color-scheme:dark]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1 dark:text-slate-400">
              Due to
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 dark:[color-scheme:dark]"
            />
          </div>

          {hasActiveFilters && (
            <span className="text-xs text-slate-500 pb-2 dark:text-slate-400">
              {filteredTasks.length} of {tasks.length} task
              {tasks.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden dark:bg-slate-900 dark:border-slate-800">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 uppercase text-xs dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Task</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Assignee</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                {canEdit && <th className="px-4 py-3 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => {
                const isSelected = selectedTask?._id === task._id;
                return (
                  <tr
                    key={task._id}
                    className={`border-t border-slate-200 transition-colors dark:border-slate-800 ${
                      isSelected
                        ? "bg-cyan-50/60 dark:bg-cyan-500/10"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <td
                      className="px-4 py-3 text-slate-800 font-medium cursor-pointer dark:text-slate-100"
                      onClick={() => openTask(task)}
                    >
                      {task.title}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <Select
                          value={task.status}
                          onChange={(status) => updateStatus(task._id, status)}
                          options={Object.entries(statusLabels).map(([k, v]) => ({
                            value: k,
                            label: v,
                          }))}
                          triggerClassName={(open) =>
                            `flex items-center justify-between gap-1.5 bg-white border rounded-lg px-2 py-1.5 text-slate-700 text-xs outline-none transition-all cursor-pointer dark:bg-slate-800 dark:text-slate-200 ${
                              open
                                ? "border-cyan-400 ring-4 ring-cyan-100 dark:border-cyan-500 dark:ring-cyan-500/20"
                                : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                            }`
                          }
                          menuClassName="min-w-[140px]"
                        />
                      ) : (
                        <span className="text-slate-600 capitalize dark:text-slate-300">
                          {statusLabels[task.status] || task.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          PRIORITY_CHIP[task.priority] ||
                          "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800"
                        }`}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {task.assignee ? (
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-full ${avatarBg(task.assignee.avatarColor, task.assignee._id || task.assignee.username).className} flex items-center justify-center text-[10px] font-semibold text-white shrink-0`}
                            style={
                              avatarBg(
                                task.assignee.avatarColor,
                                task.assignee._id || task.assignee.username
                              ).style
                            }
                          >
                            {avatarInitials(task.assignee.username)}
                          </div>
                          <span className="text-slate-600 truncate max-w-[140px] dark:text-slate-300">
                            {task.assignee.username}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString()
                        : "—"}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => deleteTask(task._id)}
                          className="text-red-500 text-xs font-medium hover:text-red-600 hover:underline dark:text-red-400 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <ClipboardList size={22} />
            </div>
            <p className="text-slate-500 text-sm dark:text-slate-400">
              No tasks yet. Switch to Kanban view to add tasks.
            </p>
          </div>
        )}

        {tasks.length > 0 && filteredTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <Search size={22} />
            </div>
            <p className="text-slate-500 text-sm dark:text-slate-400">
              No tasks match your search or filters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-medium text-cyan-700 hover:text-cyan-600 dark:text-cyan-400"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          projectId={projectId}
          customFields={customFields}
          otherCustomFields={otherCustomFields}
          cardPreviewConfig={cardPreviewConfig}
          adoptedCustomFieldIds={adoptedCustomFieldIds}
          isPersonalProject={!organizationId}
          canEdit={canEdit}
          organizationId={organizationId}
          statusOptions={statusOptions}
          onClose={() => setSelectedTask(null)}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
        />
      )}
    </>
  );
}
