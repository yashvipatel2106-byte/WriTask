"use client";

import dynamic from "next/dynamic";
import { useSocket } from "@/components/context/SocketProvider";
import { EVENTS } from "@/services/socket/events";
import { useRef, useState, useEffect, type MouseEvent as ReactMouseEvent } from "react";

import { authFetch } from "@/lib/validation/authFetch";
import { apiUrl } from "@/lib/validation/api";
import { confirmDialog } from "@/components/ui/confirm";
import {
  buildStatusColumns,
  buildStatusOptions,
  slugifyStatusLabel,
  type CustomStatus,
} from "@/lib/taskStatuses";
import { Plus, GripVertical, Trash2, Calendar, Paperclip, ListChecks, Flag, Tag as TagIcon, User, X } from "lucide-react";
import { avatarBg, avatarInitials } from "@/lib/avatarColor";
import { PRIORITY_CHIP } from "@/lib/constants/taskPriority";
import type { TaskTab } from "./TaskDetailDialog";

const TaskDetailDialog = dynamic(() => import("./TaskDetailDialog"), {
  ssr: false,
});

export type { CustomStatus, TaskTab };

export type TaskAttachment = {
  _id: string;
  originalName: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: string;
  inDescription?: boolean;
  filename?: string;
};

export type Subtask = {
  _id: string;
  title: string;
  description?: string;
  status?: string;
  completed: boolean;
  priority?: string;
  startDate?: string | null;
  dueDate?: string | null;
  assignee?: { _id: string; username: string; email?: string; avatarColor?: string } | null;
  assignees?: Array<{ _id: string; username: string; email?: string; avatarColor?: string }>;
};

export type TaskItem = {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  startDate?: string;
  tags?: string[];
  attachments?: TaskAttachment[];
  subtasks?: Subtask[];
  assignee?: { _id: string; username: string; email: string; avatarColor?: string } | null;
  assignees?: Array<{ _id: string; username: string; email?: string; avatarColor?: string }>;
  createdBy?: { username: string };
  updatedAt?: string;
};

/** First image attachment's thumbnail on a task card. Attachments are served
 * through an authenticated API route (not a static /uploads URL), so a plain
 * <img src="..."> can't reach them directly — this fetches the file as a
 * blob (same pattern as TaskDetailDialog's attachment preview) and points
 * the <img> at the resulting object URL. */
function TaskCardThumbnail({
  projectId,
  taskId,
  attachment,
}: {
  projectId: string;
  taskId: string;
  attachment: TaskAttachment;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(
          apiUrl(
            `/projects/${projectId}/tasks/${taskId}/attachments/${attachment._id}?inline=1`
          ),
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
      } catch {
        // Silently skip — the card just shows without a thumbnail.
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, taskId, attachment._id]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt={attachment.originalName || "Attachment"}
      className="w-full h-28 object-cover rounded-lg mb-2 border border-slate-200 dark:border-slate-700"
    />
  );
}

type Props = {
  projectId: string;
  tasks: TaskItem[];
  canEdit: boolean;
  canCreate: boolean;
  customStatuses?: CustomStatus[];
  canAddStatus?: boolean;
  canDeleteStatus?: boolean;
  onCustomStatusesChange?: (statuses: CustomStatus[]) => void;
  initialTaskId?: string | null;
  initialSubtaskId?: string | null;
  /** Tab to land on when initialTaskId opens the dialog — e.g. "activity" from a mention/comment notification. */
  initialTaskTab?: TaskTab | null;
  onTaskUrlChange?: (taskId: string | null, subtaskId?: string | null) => void;
  onTasksChange: (tasks: TaskItem[]) => void;
};

export default function KanbanBoard({
  projectId,
  tasks,
  canEdit,
  canCreate,
  customStatuses = [],
  canAddStatus = false,
  canDeleteStatus = false,
  onCustomStatusesChange,
  initialTaskId = null,
  initialSubtaskId = null,
  initialTaskTab = null,
  onTaskUrlChange,
  onTasksChange,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  // Only set when opening via the initialTaskId URL flow (e.g. a notification
  // link) — manual task clicks always reset this so they open on Details.
  const [pendingTab, setPendingTab] = useState<TaskTab | null>(null);
  const socket = useSocket();

  const [activeSubtaskId, setActiveSubtaskId] = useState<string | null>(
    initialSubtaskId
  );
  const [addingStatus, setAddingStatus] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const wasDraggedRef = useRef(false);
  const tasksRef = useRef(tasks);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // -1/0/1 = scroll left / hold / scroll right. Updated continuously from
  // dragover position (native HTML5 DnD has no drag-move event of its own),
  // consumed by the rAF loop below.
  const autoScrollDirRef = useRef<-1 | 0 | 1>(0);
  const handledInitialTaskIdRef = useRef<string | null>(null);
  // Floating "subtasks" preview popover — fixed-position (viewport
  // coordinates from the trigger button's rect) so it isn't clipped by the
  // column's own overflow-y-auto scroll area.
  const [subtaskPreview, setSubtaskPreview] = useState<{
    taskId: string;
    top: number;
    left: number;
  } | null>(null);
  const subtaskPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Auto-scrolls the board horizontally while a task card is dragged near
  // its left/right edge, so dropping on an off-screen column (5th, 6th...)
  // doesn't require manually working the scrollbar mid-drag.
  useEffect(() => {
    if (!dragId) {
      autoScrollDirRef.current = 0;
      return;
    }
    let rafId: number;
    const step = () => {
      const el = scrollContainerRef.current;
      if (el && autoScrollDirRef.current !== 0) {
        el.scrollLeft += autoScrollDirRef.current * 14;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [dragId]);

  const handleBoardDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const el = scrollContainerRef.current;
    if (!el || !dragId) return;
    const rect = el.getBoundingClientRect();
    const edge = 80;
    if (e.clientX < rect.left + edge) {
      autoScrollDirRef.current = -1;
    } else if (e.clientX > rect.right - edge) {
      autoScrollDirRef.current = 1;
    } else {
      autoScrollDirRef.current = 0;
    }
  };

  const columns = buildStatusColumns(customStatuses);
  const statusOptions = buildStatusOptions(customStatuses);

  useEffect(() => {
    if (!initialTaskId) {
      handledInitialTaskIdRef.current = null;
      return;
    }
    // Guards against a close/save racing the URL update: closing sets
    // selectedTask to null synchronously, but initialTaskId (from the URL)
    // only catches up a render or two later via router.replace. Without this
    // ref, that stale initialTaskId would look "unhandled" during that gap
    // and this effect would immediately reopen the task it was just closed.
    if (handledInitialTaskIdRef.current === initialTaskId) return;
    handledInitialTaskIdRef.current = initialTaskId;

    if (selectedTask?._id === initialTaskId) return;
    const match = tasks.find((task) => task._id === initialTaskId);
    if (match) {
      setSelectedTask(match);
      setActiveSubtaskId(initialSubtaskId || null);
      setPendingTab(initialTaskTab || null);
    }
  }, [initialTaskId, initialSubtaskId, initialTaskTab, tasks, selectedTask]);

  useEffect(() => {
    if (!initialSubtaskId) return;
    setActiveSubtaskId(initialSubtaskId);
  }, [initialSubtaskId]);
  // Project Room
  useEffect(() => {
  if (!projectId) return;

  socket.emit(EVENTS.PROJECT_JOIN, projectId);

  return () => {
    socket.emit(EVENTS.PROJECT_LEAVE, projectId);
  };
}, [projectId, socket]);
// Task Created
useEffect(() => {
  const handleTaskCreated = (task: TaskItem) => {
    if (tasksRef.current.some((t) => t._id === task._id)) return;
    onTasksChange([task, ...tasksRef.current]);
  };

  socket.on(EVENTS.TASK_CREATED, handleTaskCreated);

  return () => {
    socket.off(EVENTS.TASK_CREATED, handleTaskCreated);
  };
}, [socket, onTasksChange]);
//Listen For Task Updated
useEffect(() => {
  const handleTaskUpdatedSocket = (updatedTask: TaskItem) => {
    const existing = tasksRef.current.find((task) => task._id === updatedTask._id);
    if (existing?.updatedAt && existing.updatedAt === updatedTask.updatedAt) {
      // Echo of a change this client already applied locally (e.g. via the
      // Save button) — skip re-applying it to avoid a redundant re-render.
      return;
    }

    onTasksChange(
      tasksRef.current.map((task) =>
        task._id === updatedTask._id ? updatedTask : task
      )
    );

    if (selectedTask?._id === updatedTask._id) {
      setSelectedTask(updatedTask);
    }
  };

  socket.on(EVENTS.TASK_UPDATED, handleTaskUpdatedSocket);

  return () => {
    socket.off(EVENTS.TASK_UPDATED, handleTaskUpdatedSocket);
  };
}, [socket, onTasksChange, selectedTask]);
// For Task Deleted
useEffect(() => {
  const handleTaskDeletedSocket = (taskId: string) => {
    onTasksChange(
      tasksRef.current.filter((task) => task._id !== taskId)
    );

    if (selectedTask?._id === taskId) {
      closeTask();
    }
  };

  socket.on(EVENTS.TASK_DELETED, handleTaskDeletedSocket);

  return () => {
    socket.off(EVENTS.TASK_DELETED, handleTaskDeletedSocket);
  };
}, [socket, onTasksChange, selectedTask]);
// For Task Moved
useEffect(() => {
  const handleTaskMoved = (updatedTask: TaskItem) => {
    const existing = tasksRef.current.find((task) => task._id === updatedTask._id);
    if (existing?.updatedAt && existing.updatedAt === updatedTask.updatedAt) {
      return;
    }

    onTasksChange(
      tasksRef.current.map((task) =>
        task._id === updatedTask._id ? updatedTask : task
      )
    );

    if (selectedTask?._id === updatedTask._id) {
      setSelectedTask(updatedTask);
    }
  };

  socket.on(EVENTS.TASK_MOVED, handleTaskMoved);

  return () => {
    socket.off(EVENTS.TASK_MOVED, handleTaskMoved);
  };
}, [socket, onTasksChange, selectedTask]);

  useEffect(() => {
    if (!subtaskPreview) return;

    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setSubtaskPreview(null);
        return;
      }
      if (!subtaskPreviewRef.current?.contains(e.target as Node)) {
        setSubtaskPreview(null);
      }
    };

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [subtaskPreview]);

  const moveTask = async (taskId: string, status: string) => {
    const res = await authFetch(`/projects/${projectId}/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      const next = tasksRef.current.map((t) =>
        t._id === taskId ? { ...t, ...updated } : t
      );
      onTasksChange(next);
      if (selectedTask?._id === taskId) {
        setSelectedTask({ ...selectedTask, ...updated });
      }
    }
  };

  const onDrop = (status: string) => {
    if (dragId && canEdit) {
      moveTask(dragId, status);
    }
    setDragId(null);
  };

  const createTask = async (status: string) => {
    const title = newTitle.trim();
    if (!title || creating) return;

    setCreating(true);
    setCreateError("");
    try {
      const res = await authFetch(`/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title, status }),
      });
      if (res.ok) {
        const task = await res.json();
        if (!tasksRef.current.some((t) => t._id === task._id)) {
          onTasksChange([task, ...tasksRef.current]);
        }
        setNewTitle("");
        setAddingToColumn(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.message || "Could not create task");
      }
    } catch {
      setCreateError("Could not create task");
    } finally {
      setCreating(false);
    }
  };

  const cancelAdd = () => {
    setAddingToColumn(null);
    setNewTitle("");
    setCreateError("");
  };

  const openTask = (task: TaskItem) => {
    if (wasDraggedRef.current) return;
    handledInitialTaskIdRef.current = task._id;
    setSelectedTask(task);
    setActiveSubtaskId(null);
    setPendingTab(null);
    onTaskUrlChange?.(task._id, null);
  };

  const openTaskSubtask = (task: TaskItem, subtaskId: string) => {
    handledInitialTaskIdRef.current = task._id;
    setSelectedTask(task);
    setActiveSubtaskId(subtaskId);
    setPendingTab(null);
    onTaskUrlChange?.(task._id, subtaskId);
    setSubtaskPreview(null);
  };

  const closeTask = () => {
    setSelectedTask(null);
    setActiveSubtaskId(null);
    onTaskUrlChange?.(null, null);
  };

  const openSubtask = (subtaskId: string) => {
    if (!selectedTask) return;
    setActiveSubtaskId(subtaskId);
    onTaskUrlChange?.(selectedTask._id, subtaskId);
  };

  const navigateToParent = () => {
    if (!selectedTask) return;
    setActiveSubtaskId(null);
    onTaskUrlChange?.(selectedTask._id, null);
  };

  const handleTaskUpdated = (updated: TaskItem) => {
    const next = tasksRef.current.map((t) =>
      t._id === updated._id ? updated : t
    );
    onTasksChange(next);
    setSelectedTask(updated);
  };

  const handleTaskDeleted = (taskId: string) => {
    onTasksChange(tasks.filter((t) => t._id !== taskId));
    closeTask();
  };

  // Lets a task be moved to trash straight from its card, without opening
  // the full detail dialog first — same endpoint/confirmation as the
  // dialog's own "Move to trash" action.
  const deleteTaskFromCard = async (task: TaskItem, e: ReactMouseEvent) => {
    e.stopPropagation();
    if (!canEdit || deletingTaskId) return;
    const ok = await confirmDialog({
      title: "Move this task to trash?",
      description: "You can restore it later from Trash.",
      confirmLabel: "Move to trash",
      variant: "danger",
    });
    if (!ok) return;

    setDeletingTaskId(task._id);
    try {
      const res = await authFetch(`/projects/${projectId}/tasks/${task._id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        handleTaskDeleted(task._id);
      }
    } finally {
      setDeletingTaskId(null);
    }
  };

  // Strictly tied to the specific status:add/status:delete permissions —
  // no broader permission (e.g. project:update) should bypass an explicit
  // deny of these, or an admin unchecking "Add"/"Delete" would have no effect.
  const allowAddStatus = canAddStatus;
  const allowDeleteStatus = canDeleteStatus;

  const addCustomStatus = async () => {
    const label = newStatusLabel.trim();
    if (!label || savingStatus || !allowAddStatus) return;

    const reserved = [
      ...columns.map((column) => column.id),
      ...customStatuses.map((status) => status.id),
    ];
    const id = slugifyStatusLabel(label, reserved);
    const nextStatuses = [...customStatuses, { id, label }];

    setSavingStatus(true);
    setStatusError("");
    try {
      const res = await authFetch(`/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({ customStatuses: nextStatuses }),
      });

      if (res.ok) {
        onCustomStatusesChange?.(nextStatuses);
        setNewStatusLabel("");
        setAddingStatus(false);
      } else {
        const err = await res.json().catch(() => ({}));
        setStatusError(err.message || "Could not add status");
      }
    } finally {
      setSavingStatus(false);
    }
  };

  const cancelAddStatus = () => {
    setAddingStatus(false);
    setNewStatusLabel("");
    setStatusError("");
  };

  const deleteCustomStatus = async (
    statusId: string,
    statusLabel: string
  ) => {
    if (!allowDeleteStatus || savingStatus) return;

    const affected = tasks.filter((task) => task.status === statusId);
    const confirmed = await confirmDialog({
      title:
        affected.length > 0
          ? `Delete "${statusLabel}"?`
          : `Delete status "${statusLabel}"?`,
      description:
        affected.length > 0
          ? `${affected.length} task(s) will move to To Do.`
          : undefined,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    setSavingStatus(true);
    setStatusError("");
    try {
      if (affected.length > 0) {
        await Promise.all(
          affected.map((task) =>
            authFetch(`/projects/${projectId}/tasks/${task._id}`, {
              method: "PUT",
              body: JSON.stringify({ status: "todo" }),
            })
          )
        );
        onTasksChange(
          tasks.map((task) =>
            task.status === statusId ? { ...task, status: "todo" } : task
          )
        );
      }

      const nextStatuses = customStatuses.filter(
        (status) => status.id !== statusId
      );
      const res = await authFetch(`/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({ customStatuses: nextStatuses }),
      });

      if (res.ok) {
        onCustomStatusesChange?.(nextStatuses);
      } else {
        const err = await res.json().catch(() => ({}));
        setStatusError(err.message || "Could not delete status");
      }
    } finally {
      setSavingStatus(false);
    }
  };

  const renderColumn = (col: (typeof columns)[number]) => {
    const colTasks = tasks.filter((t) => t.status === col.id);
    const isAdding = addingToColumn === col.id;

    return (
      <div
        key={col.id}
        className={`flex flex-col bg-white rounded-2xl border ${col.border} shadow-sm min-h-[480px] w-full min-w-[280px] max-w-[320px] shrink-0 dark:bg-slate-900`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDrop(col.id)}
      >
        <div
          className={`flex justify-between items-center px-4 py-3 rounded-t-2xl ${col.headerBg} border-b ${col.border}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${col.accent}`} />
            <h3 className="font-semibold text-slate-800 text-sm truncate dark:text-slate-100">
              {col.label}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  setAddingToColumn(col.id);
                  setNewTitle("");
                  setCreateError("");
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors dark:text-slate-500 dark:hover:text-cyan-400 dark:hover:bg-cyan-400/10"
                title="Add task"
              >
                <Plus size={14} />
              </button>
            )}
            {allowDeleteStatus && col.custom && (
              <button
                type="button"
                onClick={() => deleteCustomStatus(col.id, col.label)}
                disabled={savingStatus}
                className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10"
                title={`Delete status "${col.label}"`}
              >
                <Trash2 size={13} />
              </button>
            )}
            <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full font-medium dark:text-slate-400 dark:bg-slate-800">
              {colTasks.length}
            </span>
          </div>
        </div>

        <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
          {colTasks.length === 0 && !isAdding && (
            <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
              <div className={`w-1.5 h-1.5 rounded-full ${col.accent} opacity-40`} />
              <p className="text-xs text-slate-400 dark:text-slate-500">No tasks yet</p>
            </div>
          )}

          {isAdding && (
            <div className="bg-white border border-cyan-300 rounded-xl p-3 shadow-sm dark:bg-slate-900 dark:border-cyan-500/40">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createTask(col.id);
                  if (e.key === "Escape") cancelAdd();
                }}
                placeholder="Task title..."
                disabled={creating}
                className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
                suppressHydrationWarning
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => createTask(col.id)}
                  disabled={!newTitle.trim() || creating}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-cyan-500 to-purple-600 disabled:opacity-40"
                >
                  {creating ? "Adding..." : "Add"}
                </button>
                <button
                  onClick={cancelAdd}
                  disabled={creating}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  Cancel
                </button>
              </div>
              {createError && (
                <p className="mt-2 text-xs text-red-500 dark:text-red-400">{createError}</p>
              )}
            </div>
          )}

          {colTasks.map((task) => {
            const assignees = task.assignees?.length
              ? task.assignees
              : task.assignee
                ? [task.assignee]
                : [];
            const isSelected = selectedTask?._id === task._id;
            const imageAttachment = task.attachments?.find((a) =>
              a.mimeType?.startsWith("image/")
            );

            return (
            <div
              key={task._id}
              draggable={canEdit}
              onDragStart={() => {
                wasDraggedRef.current = false;
                setDragId(task._id);
              }}
              onDrag={() => {
                wasDraggedRef.current = true;
              }}
              onDragEnd={() => {
                setDragId(null);
                setTimeout(() => {
                  wasDraggedRef.current = false;
                }, 0);
              }}
              onClick={() => openTask(task)}
              className={`group bg-slate-50 border rounded-xl p-3 transition-all duration-150 cursor-pointer dark:bg-slate-800 ${
                isSelected
                  ? "border-cyan-400 bg-white shadow-md ring-2 ring-cyan-100 dark:border-cyan-500 dark:bg-slate-900 dark:ring-cyan-500/20"
                  : "border-slate-200 dark:border-slate-700"
              } ${
                canEdit
                  ? "hover:border-cyan-300 hover:bg-white hover:shadow-md hover:-translate-y-0.5 active:cursor-grabbing dark:hover:border-cyan-600 dark:hover:bg-slate-900"
                  : "hover:border-cyan-200 hover:bg-white dark:hover:border-cyan-500/40 dark:hover:bg-slate-900"
              } ${dragId === task._id ? "opacity-50 scale-[0.98] rotate-1" : ""}`}
            >
              <div className="flex items-start gap-2">
                {canEdit && (
                  <GripVertical
                    size={14}
                    className="text-slate-400 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-500"
                  />
                )}
                <div className="flex-1 min-w-0">
                  {imageAttachment && (
                    <TaskCardThumbnail
                      projectId={projectId}
                      taskId={task._id}
                      attachment={imageAttachment}
                    />
                  )}
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                        PRIORITY_CHIP[task.priority] || "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800"
                      }`}
                    >
                      <Flag size={9} />
                      {task.priority}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={(e) => deleteTaskFromCard(task, e)}
                        disabled={deletingTaskId === task._id}
                        title="Move to trash"
                        className="p-1 rounded-md text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  <p className="font-medium text-sm text-slate-800 leading-snug dark:text-slate-100">
                    {task.title}
                  </p>

                  {task.tags && task.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {task.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md dark:text-slate-400 dark:bg-slate-800"
                        >
                          <TagIcon size={9} />
                          {tag}
                        </span>
                      ))}
                      {task.tags.length > 3 && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">+{task.tags.length - 3}</span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between mt-2.5 gap-2">
                    <div className="flex flex-wrap items-center gap-2.5 text-[10px] text-slate-400 min-w-0 dark:text-slate-500">
                      {task.dueDate && (
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <Calendar size={11} />
                          {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {(task.attachments?.length ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <Paperclip size={11} />
                          {task.attachments!.length}
                        </span>
                      )}
                      {(task.subtasks?.length ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setSubtaskPreview((prev) =>
                              prev?.taskId === task._id
                                ? null
                                : { taskId: task._id, top: rect.bottom + 6, left: rect.left }
                            );
                          }}
                          className="inline-flex items-center gap-1 shrink-0 rounded px-1 -mx-1 hover:bg-slate-200/70 hover:text-cyan-700 transition-colors dark:hover:bg-slate-700 dark:hover:text-cyan-400"
                          title="View subtasks"
                        >
                          <ListChecks size={11} />
                          {task.subtasks!.filter((s) => s.completed).length}/{task.subtasks!.length}
                        </button>
                      )}
                    </div>

                    {assignees.length > 0 && (
                      <div className="flex items-center -space-x-1.5 shrink-0" title={assignees.map((a) => a.username).join(", ")}>
                        {assignees.slice(0, 3).map((a) => (
                          <div
                            key={a._id}
                            className={`w-5 h-5 rounded-full ${avatarBg(a.avatarColor, a._id || a.username).className} ring-2 ring-white flex items-center justify-center text-[9px] font-semibold text-white dark:ring-slate-800`}
                            style={avatarBg(a.avatarColor, a._id || a.username).style}
                          >
                            {avatarInitials(a.username)}
                          </div>
                        ))}
                        {assignees.length > 3 && (
                          <div className="w-5 h-5 rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center text-[9px] font-semibold text-slate-600 dark:bg-slate-700 dark:ring-slate-800 dark:text-slate-300">
                            +{assignees.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {task.createdBy?.username && (
                    <p className="flex items-center gap-1 text-[10px] text-slate-400 mt-1.5 truncate dark:text-slate-500">
                      <User size={11} className="shrink-0" />
                      Created by <span className="font-medium text-slate-500 dark:text-slate-400">{task.createdBy.username}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {statusError && !addingStatus && (
        <p className="text-xs text-red-500 mb-3 dark:text-red-400">{statusError}</p>
      )}
      <div
        ref={scrollContainerRef}
        onDragOver={handleBoardDragOver}
        className="flex gap-5 overflow-x-auto pb-2"
      >
        {columns.map((col) => renderColumn(col))}

        {allowAddStatus && (
          <div className="flex flex-col min-h-[480px] w-full min-w-[220px] max-w-[260px] shrink-0">
            {addingStatus ? (
              <div className="bg-white border border-cyan-300 rounded-2xl p-4 h-full shadow-sm dark:bg-slate-900 dark:border-cyan-500/40">
                <h3 className="font-semibold text-slate-800 text-sm mb-3 dark:text-slate-100">
                  New status
                </h3>
                <input
                  autoFocus
                  value={newStatusLabel}
                  onChange={(e) => setNewStatusLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addCustomStatus();
                    if (e.key === "Escape") cancelAddStatus();
                  }}
                  placeholder="Status name..."
                  disabled={savingStatus}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                {statusError && (
                  <p className="text-xs text-red-500 mt-2 dark:text-red-400">{statusError}</p>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={addCustomStatus}
                    disabled={!newStatusLabel.trim() || savingStatus}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-cyan-500 to-purple-600 disabled:opacity-40"
                  >
                    {savingStatus ? "Adding..." : "Add status"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelAddStatus}
                    disabled={savingStatus}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAddingStatus(true);
                  setStatusError("");
                }}
                className="flex flex-col items-center justify-center gap-2 h-full min-h-[480px] rounded-2xl border border-dashed border-slate-300 text-slate-500 hover:text-cyan-600 hover:border-cyan-400 hover:bg-cyan-50 transition-colors dark:border-slate-700 dark:text-slate-400 dark:hover:text-cyan-400 dark:hover:border-cyan-500 dark:hover:bg-cyan-400/10"
              >
                <Plus size={18} />
                <span className="text-sm font-medium">Add status</span>
              </button>
            )}
          </div>
        )}
      </div>

      {subtaskPreview && (() => {
        const previewTask = tasks.find((t) => t._id === subtaskPreview.taskId);
        const subtasks = previewTask?.subtasks || [];
        return (
          <div
            ref={subtaskPreviewRef}
            className="fixed z-50 w-72 max-h-96 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden dark:bg-slate-900 dark:border-slate-800 max-sm:left-1/2! max-sm:top-1/2! max-sm:-translate-x-1/2! max-sm:-translate-y-1/2! max-sm:w-[calc(100vw-2rem)]! max-sm:max-w-sm!"
            style={{ top: subtaskPreview.top, left: subtaskPreview.left }}
          >
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <ListChecks size={14} className="text-cyan-600 dark:text-cyan-400" />
                Subtasks
                <span className="text-cyan-600 dark:text-cyan-400">{subtasks.length}</span>
              </div>
              <button
                type="button"
                onClick={() => setSubtaskPreview(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {subtasks.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                  No subtasks yet.
                </p>
              ) : (
                subtasks.map((s) => {
                  const a = s.assignees?.length ? s.assignees[0] : s.assignee || null;
                  return (
                    <button
                      key={s._id}
                      type="button"
                      onClick={() => previewTask && openTaskSubtask(previewTask, s._id)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
                    >
                      {a ? (
                        <div
                          className={`w-6 h-6 rounded-full shrink-0 ${avatarBg(a.avatarColor, a._id || a.username).className} flex items-center justify-center text-[10px] font-bold text-white`}
                          style={avatarBg(a.avatarColor, a._id || a.username).style}
                        >
                          {avatarInitials(a.username)}
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full shrink-0 bg-slate-200 dark:bg-slate-700" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800 truncate dark:text-slate-100">
                          {s.title}
                        </p>
                        <p
                          className={`text-xs mt-0.5 ${
                            s.completed
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-400 dark:text-slate-500"
                          }`}
                        >
                          {s.completed
                            ? "Completed"
                            : (s.status || "To do").replace(/-/g, " ")}
                        </p>
                      </div>
                      {s.dueDate && (
                        <span className="text-[11px] text-slate-400 shrink-0 dark:text-slate-500">
                          {new Date(s.dueDate).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })()}

      {selectedTask && (
        <TaskDetailDialog
          // Remount when the task identity changes so `initialTab` (and all the
          // dialog's other task-seeded state) is freshly re-applied instead of
          // carrying over stale state from whichever task was open before —
          // otherwise a notification link to a different task while one is
          // already open would swap the content in place but stay on whatever
          // tab was active, ignoring the requested "activity" tab.
          key={selectedTask._id}
          task={selectedTask}
          projectId={projectId}
          canEdit={canEdit}
          statusOptions={statusOptions}
          activeSubtaskId={activeSubtaskId}
          onSubtaskOpen={openSubtask}
          onNavigateParent={navigateToParent}
          onClose={closeTask}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
          initialTab={pendingTab || "details"}
        />
      )}
    </>
  );
}
