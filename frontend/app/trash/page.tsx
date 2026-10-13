"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useOrganization } from "@/components/context/organizationContext";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import { authFetch } from "@/lib/validation/authFetch";
import { RotateCcw, Trash2, FolderKanban, ClipboardList, Eye } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import type { TaskItem } from "@/components/projects/KanbanBoard";

const TaskDetailDialog = dynamic(
  () => import("@/components/projects/TaskDetailDialog"),
  { ssr: false }
);

type TrashProject = {
  _id: string;
  title: string;
  deletedAt?: string;
  organization?: { name?: string; isDeleted?: boolean } | null;
};

type TrashTask = {
  _id: string;
  title: string;
  deletedAt?: string;
  project?: { _id?: string; title?: string; isDeleted?: boolean } | null;
  priority?: string;
};

type TrashOrganization = {
  _id: string;
  name: string;
  deletedAt?: string;
  slug?: string;
};

type TrashSubtask = {
  _id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  startDate?: string | null;
  dueDate?: string | null;
  completed?: boolean;
  assignees?: Array<{ _id: string; username: string; email?: string }>;
  deletedAt?: string;
  deletedBy?: { username?: string; email?: string } | null;
  deletedWithTask?: boolean;
  // Immediate parent SUBTASK, when this entry is nested more than one level
  // deep — null/undefined for a subtask whose parent is the task itself.
  parentSubtaskId?: string | null;
  parentSubtaskName?: string | null;
  // True only when that immediate parent subtask is itself in trash.
  parentSubtaskDeleted?: boolean;
  // Every ancestor subtask between the task and this subtask's immediate
  // parent, root-most first — e.g. ["Test 1", "Test sub"] for a subtask
  // nested Task > Test 1 > Test sub > (this one).
  ancestorSubtaskNames?: string[];
  task: { _id: string; title: string; isDeleted?: boolean; project?: string };
};

type Tab = "projects" | "tasks" | "organizations" | "subtasks";

function formatDeletedAt(value?: string) {
  if (!value) return "Unknown date";
  return new Date(value).toLocaleString();
}

export default function TrashPage() {
  const router = useRouter();
  const { currentOrgId, orgReady } = useOrganization();
  const [tab, setTab] = useState<Tab>("tasks");
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<TrashProject[]>([]);
  const [tasks, setTasks] = useState<TrashTask[]>([]);
  const [organizations, setOrganizations] = useState<TrashOrganization[]>([]);
  const [subtasks, setSubtasks] = useState<TrashSubtask[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  // Full task record for the read-only TaskDetailDialog opened via "Open" —
  // fetched on demand since the trash list only carries a summary.
  const [openTaskData, setOpenTaskData] = useState<{
    task: TaskItem & { isDeleted?: boolean };
    projectId: string;
  } | null>(null);
  const [openingTaskId, setOpeningTaskId] = useState<string | null>(null);
  // Which subtask's own Details panel the open TaskDetailDialog should jump
  // to — null means show the task's own Details panel.
  const [openTaskActiveSubtaskId, setOpenTaskActiveSubtaskId] = useState<string | null>(null);
  const [restoringOpenTask, setRestoringOpenTask] = useState(false);
  // Set when jumping to the Projects/Tasks tab from a "parent is also in
  // trash" link, so that row can be scrolled to and highlighted.
  const [highlightProjectId, setHighlightProjectId] = useState<string | null>(null);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);

  // Walks a trashed subtask's parentSubtaskId chain, collecting every
  // ancestor that's ALSO in trash (stops as soon as an ancestor isn't found
  // in the trash list — that one's still active, so it's already present
  // in the real task once fetched). Needed so injecting one deep subtask
  // doesn't leave its trashed ancestors missing — the dialog's own
  // breadcrumb/parent lookups walk `parentSubtaskId` through whatever's in
  // `task.subtasks`, so a broken link there falls back to the task title.
  const trashedAncestorChain = (subtask: TrashSubtask): TrashSubtask[] => {
    const chain: TrashSubtask[] = [];
    let parentId = subtask.parentSubtaskId;
    while (parentId) {
      const parent = subtasks.find((s) => s._id === parentId);
      if (!parent) break;
      chain.push(parent);
      parentId = parent.parentSubtaskId;
    }
    return chain;
  };

  // Opens the real TaskDetailDialog (read-only, with a Restore button when
  // the task/subtask being shown is itself trashed) for any task — whether
  // it's in the trash, or still active. Pass focusSubtaskId to land
  // straight on one of its subtasks' Details panel; injectSubtask carries
  // that subtask's own snapshot (from the trash list), plus its full
  // trashed-ancestor chain, so a *trashed* subtask — absent from the task's
  // real active `subtasks` array — can still be spliced in locally and
  // found (along with its parents) by the dialog's own lookups. Read-only
  // (canEdit=false), so nothing about this injection ever reaches the server.
  const openTaskById = async (
    taskId: string,
    projectId?: string | null,
    focusSubtaskId?: string | null,
    injectSubtask?: TrashSubtask | null
  ) => {
    if (!projectId) {
      toast.error("This task's project could not be found.");
      return;
    }
    setOpeningTaskId(focusSubtaskId || taskId);
    try {
      const res = await authFetch(`/projects/${projectId}/tasks/${taskId}`);
      if (res.ok) {
        const full = await res.json();
        if (injectSubtask) {
          const toInject = [injectSubtask, ...trashedAncestorChain(injectSubtask)];
          const existingIds = new Set((full.subtasks || []).map((s: { _id: string }) => s._id));
          const missing = toInject.filter((s) => !existingIds.has(s._id));
          if (missing.length > 0) {
            full.subtasks = [
              ...(full.subtasks || []),
              ...missing.map((s) => ({
                _id: s._id,
                title: s.title,
                description: s.description || "",
                status: s.status || "todo",
                priority: s.priority || "medium",
                startDate: s.startDate || null,
                dueDate: s.dueDate || null,
                completed: s.completed || false,
                assignees: s.assignees || [],
                parentSubtaskId: s.parentSubtaskId || null,
              })),
            ];
          }
        }
        setOpenTaskData({ task: full, projectId });
        setOpenTaskActiveSubtaskId(focusSubtaskId || null);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || "Failed to load task.");
      }
    } finally {
      setOpeningTaskId(null);
    }
  };

  const openTaskDetail = (task: TrashTask) => openTaskById(task._id, task.project?._id);

  // A trashed subtask's own "Open" action.
  const openSubtaskDetail = (subtask: TrashSubtask) =>
    openTaskById(subtask.task._id, subtask.task.project, subtask._id, subtask);

  // "Parent task"/"Parent subtask" link from a deleted subtask.
  //  - direct child of the task, task still active → open the dialog
  //  - direct child of the task, task ALSO in trash → jump to its row in
  //    the Tasks tab (same "restore the parent first" pattern as the
  //    Parent project/organization links)
  //  - nested under a subtask → open the dialog either way (see below)
  const goToParentTask = (subtask: TrashSubtask) => {
    if (!subtask.parentSubtaskId) {
      if (subtask.task.isDeleted) {
        setTab("tasks");
        setHighlightTaskId(subtask.task._id);
        return;
      }
      openTaskById(subtask.task._id, subtask.task.project);
      return;
    }
    if (subtask.parentSubtaskDeleted) {
      const parentRecord = subtasks.find((s) => s._id === subtask.parentSubtaskId);
      if (parentRecord) {
        openSubtaskDetail(parentRecord);
      } else {
        openTaskById(subtask.task._id, subtask.task.project);
      }
      return;
    }
    openTaskById(subtask.task._id, subtask.task.project, subtask.parentSubtaskId);
  };

  // Restore target for whatever the open dialog is currently showing — the
  // task itself, or (if navigated to one) a trashed subtask of it.
  const openDialogSubtaskInTrash = openTaskActiveSubtaskId
    ? subtasks.find((s) => s._id === openTaskActiveSubtaskId) || null
    : null;

  const restoreOpenTask = async () => {
    if (!openTaskData) return;
    setRestoringOpenTask(true);
    const res = await authFetch(`/trash/tasks/${openTaskData.task._id}/restore`, {
      method: "PATCH",
    });
    setRestoringOpenTask(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(data.message || "Task restored.");
      setOpenTaskData(null);
      loadTrash();
    } else {
      toast.error(data.message || "Failed to restore.");
    }
  };

  const restoreOpenSubtask = async (subtask: TrashSubtask) => {
    setRestoringOpenTask(true);
    const res = await authFetch(
      `/trash/tasks/${subtask.task._id}/subtasks/${subtask._id}/restore`,
      { method: "PATCH" }
    );
    setRestoringOpenTask(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(data.message || "Subtask restored.");
      setOpenTaskData(null);
      setOpenTaskActiveSubtaskId(null);
      loadTrash();
    } else {
      toast.error(data.message || "Failed to restore subtask.");
    }
  };

  const loadTrash = useCallback(async () => {
    setLoading(true);
    const scope = currentOrgId
      ? `?organizationId=${encodeURIComponent(currentOrgId)}`
      : "?personal=true";
    const res = await authFetch(`/trash${scope}`);
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects || []);
      setTasks(data.tasks || []);
      setOrganizations(data.organizations || []);
      setSubtasks(data.subtasks || []);
    } else {
      setProjects([]);
      setTasks([]);
      setOrganizations([]);
      setSubtasks([]);
    }
    setLoading(false);
  }, [currentOrgId]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    if (!orgReady) return;

    setProjects([]);
    setTasks([]);
    setOrganizations([]);
    setSubtasks([]);
    loadTrash();
  }, [router, loadTrash, orgReady]);

  useEffect(() => {
    if (!highlightProjectId && !highlightTaskId) return;
    const timer = setTimeout(() => {
      setHighlightProjectId(null);
      setHighlightTaskId(null);
    }, 2500);
    return () => clearTimeout(timer);
  }, [highlightProjectId, highlightTaskId]);

  useEffect(() => {
    if (!highlightProjectId || tab !== "projects") return;
    document
      .getElementById(`trash-project-${highlightProjectId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightProjectId, tab, projects]);

  useEffect(() => {
    if (!highlightTaskId || tab !== "tasks") return;
    document
      .getElementById(`trash-task-${highlightTaskId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightTaskId, tab, tasks]);

  const restore = async (type: "tasks" | "projects" | "organizations", id: string) => {
    // Check the immediate parent locally first, so the user gets a clear
    // "restore the parent first" message instead of a generic failed
    // request — the backend enforces the same rule as a fallback.
    if (type === "tasks") {
      const task = tasks.find((t) => t._id === id);
      if (task?.project?.isDeleted) {
        await confirmDialog({
          title: "Parent project is still in trash",
          description: `"${task.project.title || "This project"}" has been deleted. Restore the project first, then you'll be able to restore this task.`,
          confirmLabel: "OK",
        });
        return;
      }
    }
    if (type === "projects") {
      const project = projects.find((p) => p._id === id);
      if (project?.organization?.isDeleted) {
        await confirmDialog({
          title: "Parent organization is still in trash",
          description: `"${project.organization.name || "This organization"}" has been deleted. Restore the organization first, then you'll be able to restore this project.`,
          confirmLabel: "OK",
        });
        return;
      }
    }

    setActionId(id);
    const res = await authFetch(`/trash/${type}/${id}/restore`, {
      method: "PATCH",
    });
    setActionId(null);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(data.message || "Restored.");
      loadTrash();
      if (type === "projects") window.dispatchEvent(new Event("projects-updated"));
    } else {
      toast.error(data.message || "Failed to restore.");
    }
  };

  const permanentDelete = async (
    type: "tasks" | "projects" | "organizations",
    id: string,
    name: string
  ) => {
    const ok = await confirmDialog({
      title: `Permanently delete "${name}"?`,
      description: "This cannot be undone.",
      confirmLabel: "Delete permanently",
      variant: "danger",
    });
    if (!ok) return;

    setActionId(id);
    const res = await authFetch(`/trash/${type}/${id}`, {
      method: "DELETE",
    });
    setActionId(null);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(data.message || "Permanently deleted.");
      loadTrash();
      if (type === "projects") window.dispatchEvent(new Event("projects-updated"));
    } else {
      toast.error(data.message || "Failed to delete.");
    }
  };

  const restoreSubtask = async (subtask: TrashSubtask) => {
    if (subtask.task.isDeleted) {
      await confirmDialog({
        title: "Parent task is still in trash",
        description: `"${subtask.task.title}" has been deleted. Restore the task first, then you'll be able to restore this subtask.`,
        confirmLabel: "OK",
      });
      return;
    }

    setActionId(subtask._id);
    const res = await authFetch(
      `/trash/tasks/${subtask.task._id}/subtasks/${subtask._id}/restore`,
      { method: "PATCH" }
    );
    setActionId(null);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(data.message || "Subtask restored.");
      loadTrash();
    } else {
      toast.error(data.message || "Failed to restore subtask.");
    }
  };

  const permanentDeleteSubtask = async (subtask: TrashSubtask) => {
    const ok = await confirmDialog({
      title: `Permanently delete "${subtask.title}"?`,
      description: "This cannot be undone.",
      confirmLabel: "Delete permanently",
      variant: "danger",
    });
    if (!ok) return;

    setActionId(subtask._id);
    const res = await authFetch(
      `/trash/tasks/${subtask.task._id}/subtasks/${subtask._id}`,
      { method: "DELETE" }
    );
    setActionId(null);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(data.message || "Subtask permanently deleted.");
      loadTrash();
    } else {
      toast.error(data.message || "Failed to delete subtask.");
    }
  };

  const tabClass = (value: Tab) =>
    `px-5 py-2.5 rounded-xl text-sm font-medium border transition ${
      tab === value
        ? "bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-400/10 dark:text-cyan-400 dark:border-cyan-500/30"
        : "bg-white text-slate-500 border-slate-200 hover:border-cyan-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 dark:hover:border-cyan-500/40"
    }`;

  const itemClass =
    "flex flex-wrap items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 dark:bg-slate-800 dark:border-slate-700";

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />

        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-10 dark:bg-[#0B1120] dark:text-slate-100">
          <h1 className="text-3xl font-bold mb-2">Trash Bin</h1>
          <p className="text-slate-500 text-sm mb-8 dark:text-slate-400">
            Restore items or delete them permanently.
          </p>

          <div className="flex flex-wrap gap-3 mb-8">
            <button onClick={() => setTab("tasks")} className={tabClass("tasks")}>
              Tasks ({tasks.length})
            </button>
            <button onClick={() => setTab("subtasks")} className={tabClass("subtasks")}>
              Subtasks ({subtasks.length})
            </button>
            <button onClick={() => setTab("projects")} className={tabClass("projects")}>
              Projects ({projects.length})
            </button>
            <button
              onClick={() => setTab("organizations")}
              className={tabClass("organizations")}
            >
              Organizations ({organizations.length})
            </button>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 dark:bg-slate-900 dark:border-slate-800">
            {loading ? (
              <p className="text-slate-500 text-center py-12 dark:text-slate-400">Loading trash...</p>
            ) : tab === "projects" ? (
              projects.length === 0 ? (
                <p className="text-slate-400 text-center py-12 dark:text-slate-500">No deleted projects</p>
              ) : (
                <div className="space-y-3">
                  {projects.map((project) => (
                    <div
                      key={project._id}
                      id={`trash-project-${project._id}`}
                      className={`${itemClass} ${
                        highlightProjectId === project._id
                          ? "ring-2 ring-amber-400 dark:ring-amber-500"
                          : ""
                      }`}
                    >
                      <div>
                        {project.organization?.isDeleted && (
                          <div className="mb-1">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                              Parent organization &quot;{project.organization.name}&quot; is also in trash
                            </span>
                          </div>
                        )}
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{project.title}</h3>
                        <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
                          {project.organization?.name || "Personal workspace"}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
                          Deleted {formatDeletedAt(project.deletedAt)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => restore("projects", project._id)}
                          disabled={actionId === project._id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-cyan-700 border border-cyan-300 hover:bg-cyan-50 disabled:opacity-50 dark:text-cyan-400 dark:border-cyan-500/30 dark:hover:bg-cyan-400/10"
                        >
                          <RotateCcw size={14} />
                          Restore
                        </button>
                        <button
                          onClick={() =>
                            permanentDelete("projects", project._id, project.title)
                          }
                          disabled={actionId === project._id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-500 border border-red-300 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10"
                        >
                          <Trash2 size={14} />
                          Delete Permanently
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : tab === "tasks" ? (
              tasks.length === 0 ? (
                <p className="text-slate-400 text-center py-12 dark:text-slate-500">No deleted tasks</p>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div
                      key={task._id}
                      id={`trash-task-${task._id}`}
                      className={`${itemClass} ${
                        highlightTaskId === task._id
                          ? "ring-2 ring-amber-400 dark:ring-amber-500"
                          : ""
                      }`}
                    >
                      <div>
                        {task.project && (
                          <div className="mb-1">
                            {task.project.isDeleted ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setTab("projects");
                                  setHighlightProjectId(task.project!._id || null);
                                }}
                                title="Open in the Projects tab to restore it"
                                className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 hover:underline dark:text-amber-400 dark:hover:text-amber-300"
                              >
                                <FolderKanban size={12} />
                                Parent project &quot;{task.project.title}&quot; is also in trash
                              </button>
                            ) : task.project._id ? (
                              <button
                                type="button"
                                onClick={() => router.push(`/projects/${task.project!._id}`)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-600 hover:underline dark:text-cyan-400 dark:hover:text-cyan-300"
                              >
                                <FolderKanban size={12} />
                                {task.project.title || "Parent project"}
                              </button>
                            ) : null}
                          </div>
                        )}
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{task.title}</h3>
                        <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
                          {task.project?.title || "Unknown project"}
                          {task.priority ? ` · ${task.priority}` : ""}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
                          Deleted {formatDeletedAt(task.deletedAt)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openTaskDetail(task)}
                          disabled={openingTaskId === task._id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-600 border border-slate-300 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700"
                        >
                          <Eye size={14} />
                          {openingTaskId === task._id ? "Opening..." : "Open"}
                        </button>
                        <button
                          onClick={() => restore("tasks", task._id)}
                          disabled={actionId === task._id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-cyan-700 border border-cyan-300 hover:bg-cyan-50 disabled:opacity-50 dark:text-cyan-400 dark:border-cyan-500/30 dark:hover:bg-cyan-400/10"
                        >
                          <RotateCcw size={14} />
                          Restore
                        </button>
                        <button
                          onClick={() =>
                            permanentDelete("tasks", task._id, task.title)
                          }
                          disabled={actionId === task._id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-500 border border-red-300 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10"
                        >
                          <Trash2 size={14} />
                          Delete Permanently
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : tab === "subtasks" ? (
              subtasks.length === 0 ? (
                <p className="text-slate-400 text-center py-12 dark:text-slate-500">No deleted subtasks</p>
              ) : (
                <div className="space-y-3">
                  {subtasks.map((subtask) => (
                    <div key={subtask._id} className={itemClass}>
                      <div>
                        <div className="mb-1">
                          {subtask.task.isDeleted ? (
                            <button
                              type="button"
                              onClick={() => goToParentTask(subtask)}
                              title="Jump to it in the Tasks tab — restore it before restoring this subtask"
                              className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 hover:underline dark:text-amber-400 dark:hover:text-amber-300"
                            >
                              <ClipboardList size={12} />
                              Parent task &quot;{subtask.task.title}&quot; is also in trash
                            </button>
                          ) : subtask.parentSubtaskDeleted ? (
                            <button
                              type="button"
                              onClick={() => goToParentTask(subtask)}
                              title="Open it — restore it before restoring this subtask"
                              className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 hover:underline dark:text-amber-400 dark:hover:text-amber-300"
                            >
                              <ClipboardList size={12} />
                              Parent subtask &quot;{subtask.parentSubtaskName}&quot; is also in trash
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => goToParentTask(subtask)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-600 hover:underline dark:text-cyan-400 dark:hover:text-cyan-300"
                            >
                              <ClipboardList size={12} />
                              {subtask.parentSubtaskName || subtask.task.title}
                            </button>
                          )}
                        </div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{subtask.title}</h3>
                        <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
                          {[subtask.task.title, ...(subtask.ancestorSubtaskNames || [])].join(" > ")}
                          {subtask.priority ? ` · ${subtask.priority}` : ""}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
                          Deleted {formatDeletedAt(subtask.deletedAt)}
                          {subtask.deletedBy?.username ? ` by ${subtask.deletedBy.username}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openSubtaskDetail(subtask)}
                          disabled={openingTaskId === subtask._id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-600 border border-slate-300 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700"
                        >
                          <Eye size={14} />
                          {openingTaskId === subtask._id ? "Opening..." : "Open"}
                        </button>
                        <button
                          onClick={() => restoreSubtask(subtask)}
                          disabled={actionId === subtask._id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-cyan-700 border border-cyan-300 hover:bg-cyan-50 disabled:opacity-50 dark:text-cyan-400 dark:border-cyan-500/30 dark:hover:bg-cyan-400/10"
                        >
                          <RotateCcw size={14} />
                          Restore
                        </button>
                        <button
                          onClick={() => permanentDeleteSubtask(subtask)}
                          disabled={actionId === subtask._id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-500 border border-red-300 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10"
                        >
                          <Trash2 size={14} />
                          Delete Permanently
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : organizations.length === 0 ? (
              <p className="text-slate-400 text-center py-12 dark:text-slate-500">No deleted organizations</p>
            ) : (
              <div className="space-y-3">
                {organizations.map((org) => (
                  <div key={org._id} className={itemClass}>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{org.name}</h3>
                      <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">{org.slug}</p>
                      <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
                        Deleted {formatDeletedAt(org.deletedAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => restore("organizations", org._id)}
                        disabled={actionId === org._id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-cyan-700 border border-cyan-300 hover:bg-cyan-50 disabled:opacity-50 dark:text-cyan-400 dark:border-cyan-500/30 dark:hover:bg-cyan-400/10"
                      >
                        <RotateCcw size={14} />
                        Restore
                      </button>
                      <button
                        onClick={() =>
                          permanentDelete("organizations", org._id, org.name)
                        }
                        disabled={actionId === org._id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-500 border border-red-300 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                        Delete Permanently
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {openTaskData && (
        <TaskDetailDialog
          task={openTaskData.task}
          projectId={openTaskData.projectId}
          canEdit={false}
          activeSubtaskId={openTaskActiveSubtaskId}
          onSubtaskOpen={(subtaskId) => setOpenTaskActiveSubtaskId(subtaskId)}
          onNavigateParent={() => setOpenTaskActiveSubtaskId(null)}
          onClose={() => {
            setOpenTaskData(null);
            setOpenTaskActiveSubtaskId(null);
          }}
          onUpdated={() => {}}
          onDeleted={() => {}}
          onRestore={
            openDialogSubtaskInTrash
              ? () => restoreOpenSubtask(openDialogSubtaskInTrash)
              : openTaskData.task.isDeleted
                ? restoreOpenTask
                : undefined
          }
          restoring={restoringOpenTask}
        />
      )}
    </div>
  );
}
