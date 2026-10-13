"use client";

import Sidebar from "@/components/sidebar/sidebar";
import Navbar from "@/components/navbar/Navbar";
import KanbanBoard, { type CustomStatus, type TaskItem, type TaskTab } from "@/components/projects/KanbanBoard";
import TableView from "@/components/projects/TableView";
import ProjectInviteDialog from "@/components/projects/ProjectInviteDialog";
import { authFetch } from "@/lib/validation/authFetch";
import { buildTaskUrl } from "@/lib/taskUrls";
import { hasPermission, type ProjectRole } from "@/lib/rbac";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, Table2, Upload, Users } from "lucide-react";
import ImportTasksDialog from "@/components/tasks/ImportTasksDialog";
import { toast } from "@/components/ui/toast";
type Project = {
  _id: string;
  title: string;
  description?: string;
  myRole?: string;
  myPermissions?: string[];
  organization?: { _id: string; name: string };
  createdBy?: { _id: string; username?: string; name?: string; email?: string; avatarColor?: string };
  members?: Array<{ user: { _id: string; username: string; email: string }; role: string }>;
  customStatuses?: CustomStatus[];
};

export default function ProjectBoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const openTaskId = searchParams.get("task");
  const openSubtaskId = searchParams.get("subtask");
  const openTaskTab = searchParams.get("tab") as TaskTab | null;
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([]);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState(
    "You do not have access to this task or project."
  );
  const [urlTaskError, setUrlTaskError] = useState<string | null>(null);
  const tasksRef = useRef<TaskItem[]>([]);
  const resolvedUrlTaskRef = useRef<string | null>(null);
  const accessToastShownRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const [showImportDialog, setShowImportDialog] = useState(false);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const showAccessToastOnce = useCallback((msg: string) => {
    if (accessToastShownRef.current) return;
    accessToastShownRef.current = true;
    toast.error(msg);
  }, []);

  const syncTaskUrl = useCallback(
    (taskId: string | null, subtaskId: string | null = null) => {
      if (!projectId) return;

      const currentTask = searchParams.get("task");
      const currentSubtask = searchParams.get("subtask");

      if (!taskId) {
        if (!currentTask && !currentSubtask) return;
        resolvedUrlTaskRef.current = null;
        router.replace(`/projects/${projectId}`, { scroll: false });
        return;
      }

      const nextSubtask = subtaskId || null;
      if (currentTask === taskId && (currentSubtask || null) === nextSubtask) {
        return;
      }

      router.replace(buildTaskUrl(projectId, taskId, nextSubtask), {
        scroll: false,
      });
    },
    [projectId, router, searchParams]
  );

  const resolveUrlTask = useCallback(
    async (taskId: string) => {
      const local = tasksRef.current.find((task) => task._id === taskId);
      if (local) {
        setUrlTaskError(null);
        return local;
      }

      const res = await authFetch(`/projects/${projectId}/tasks/${taskId}`);
      if (res.status === 403 || res.status === 404) {
        const msg = "You do not have access to this task or project.";
        setUrlTaskError(msg);
        showAccessToastOnce(msg);
        return null;
      }
      if (!res.ok) return null;

      const task = (await res.json()) as TaskItem;
      setUrlTaskError(null);
      setTasks((current) => {
        if (current.some((row) => row._id === task._id)) {
          return current.map((row) => (row._id === task._id ? task : row));
        }
        return [...current, task];
      });
      return task;
    },
    [projectId, showAccessToastOnce]
  );

  useEffect(() => {
    if (!projectId) return;

    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const generation = ++loadGenerationRef.current;
    accessToastShownRef.current = false;
    setAccessDenied(false);
    setUrlTaskError(null);
    setProject(null);
    setTasks([]);
    setLoading(true);

    const load = async () => {
      const res = await authFetch(`/projects/${projectId}`);
      if (generation !== loadGenerationRef.current) return;

      if (res.status === 401 || res.status === 403 || res.status === 404) {
        const err = await res.json().catch(() => ({} as { message?: string }));
        const msg =
          err.message || "You do not have access to this task or project.";
        setAccessDenied(true);
        setAccessDeniedMessage(msg);
        showAccessToastOnce(msg);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setAccessDenied(true);
        setAccessDeniedMessage("You do not have access to this task or project.");
        showAccessToastOnce("You do not have access to this task or project.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (generation !== loadGenerationRef.current) return;

      setProject(data);
      setCustomStatuses(Array.isArray(data.customStatuses) ? data.customStatuses : []);

      const tasksRes = await authFetch(`/projects/${projectId}/tasks`);
      if (generation !== loadGenerationRef.current) return;
      if (tasksRes.ok) setTasks(await tasksRes.json());
      setLoading(false);
    };

    void load();
  }, [projectId, router, showAccessToastOnce]);

  const handleImportTasks = async (file: File) => {
    const formData = new FormData();

    formData.append("file", file);
    formData.append("projectId", projectId);

    const response = await authFetch("/tasks/import", {
      method: "POST",
      body: formData,
    });

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(
        text.startsWith("<!DOCTYPE") || text.startsWith("<html")
          ? "Import API is unavailable. Make sure the backend server is running and restarted after the latest update."
          : text.slice(0, 200) || "Import failed — server returned a non-JSON response."
      );
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Import failed");
    }

    const tasksRes = await authFetch(`/projects/${projectId}/tasks`);
    if (tasksRes.ok) setTasks(await tasksRes.json());
    return data;
  };

  const reloadProject = useCallback(async () => {
    if (!projectId) return;
    const res = await authFetch(`/projects/${projectId}`);
    if (!res.ok) return;
    const data = await res.json();
    setProject(data);
    setCustomStatuses(Array.isArray(data.customStatuses) ? data.customStatuses : []);
  }, [projectId]);

  useEffect(() => {
    if (!openTaskId || loading || accessDenied || !project) return;
    if (resolvedUrlTaskRef.current === openTaskId) return;
    resolvedUrlTaskRef.current = openTaskId;
    resolveUrlTask(openTaskId);
  }, [openTaskId, loading, accessDenied, project, resolveUrlTask]);

  const role = (project?.myRole as ProjectRole | undefined) ?? null;
  const can = useCallback(
    (action: string) => hasPermission(project?.myPermissions ?? [], action),
    [project?.myPermissions]
  );

  const canEditTasks = can("task:update");
  const canCreateTasks = can("task:create");
  const canAddStatus = can("status:add");
  const canDeleteStatus = can("status:delete");
  const canInvite = can("member:invite");

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F9FC] text-slate-900 flex items-center justify-center dark:bg-slate-950 dark:text-slate-100">
        Loading project board...
      </div>
    );
  }

  if (accessDenied || !project) {
    return (
      <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />
        <div className="flex h-full">
          <Sidebar />
          <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-4 sm:p-6 lg:p-10 dark:bg-slate-950 dark:text-slate-100">
            <div className="max-w-lg mx-auto mt-16 text-center">
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {accessDeniedMessage}
              </p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Ask a project admin to invite you, or open a project you belong to.
              </p>
              <Link
                href="/projects"
                className="inline-flex mt-6 px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-500 transition"
              >
                Back to projects
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
           <Navbar />
     <div className="flex h-full">
           <Sidebar />
      <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-4 sm:p-6 lg:p-10 dark:bg-slate-950 dark:text-slate-100">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
            Loading project board...
          </div>
        ) : !project ? (
          <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
            Project not found or access denied.
          </div>
        ) : (
        <>
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <div>
            <p className="text-cyan-600/80 text-sm mb-1 dark:text-cyan-400/80">
              {project.organization?.name || "Personal workspace"}
            </p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{project.title}</h1>
            <p className="text-slate-500 text-sm mt-1 capitalize dark:text-slate-400">
              Created By : {project.createdBy?.username || project.createdBy?.name || "Unknown"} · {project.members?.length || 0} members
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-white rounded-xl border border-slate-200 shadow-sm p-1 dark:bg-slate-900 dark:border-slate-800">
              <button
                onClick={() => setView("kanban")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  view === "kanban" ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-400" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                <LayoutGrid size={16} /> Kanban
              </button>
              <button
                onClick={() => setView("table")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  view === "table" ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-400" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                <Table2 size={16} /> Table
              </button>
            </div>
            {canInvite && (
              <ProjectInviteDialog
                projectId={projectId}
                projectName={project.title}
                organizationId={project.organization?._id}
                onInvited={reloadProject}
              />
            )}
            {canCreateTasks && <button
              type="button"
              onClick={() => setShowImportDialog(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
            >
              <Upload size={16} />
              Import
            </button>}
            <Link
              href={`/projects/${projectId}/members`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan-300 bg-white text-cyan-700 text-sm hover:bg-cyan-50 dark:border-cyan-400/30 dark:bg-slate-900 dark:text-cyan-400 dark:hover:bg-cyan-400/10"
            >
              <Users size={16} /> Members
            </Link>
          </div>
        </div>

        {urlTaskError && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20">
            {urlTaskError}
          </p>
        )}

        {view === "kanban" ? (
          <KanbanBoard
            projectId={projectId}
            tasks={tasks}
            canEdit={canEditTasks}
            canCreate={canCreateTasks}
            customStatuses={customStatuses}
            canAddStatus={canAddStatus}
            canDeleteStatus={canDeleteStatus}
            onCustomStatusesChange={setCustomStatuses}
            initialTaskId={openTaskId}
            initialSubtaskId={openSubtaskId}
            initialTaskTab={openTaskTab}
            onTaskUrlChange={syncTaskUrl}
            onTasksChange={setTasks}
          />
        ) : (
          <TableView
            projectId={projectId}
            tasks={tasks}
            canEdit={canEditTasks}
            customStatuses={customStatuses}
            onTasksChange={setTasks}
          />
        )}
        <ImportTasksDialog
          open={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          onImport={handleImportTasks}
          />
        </>
        )}
      </main>
    </div>
    </div>
  );
}
