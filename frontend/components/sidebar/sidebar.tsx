"use client";

import WorkspaceHeader from "@/components/sidebar/WorkspaceHeader";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import { useSidebar } from "@/components/context/sidebarContext";
import { authFetch } from "@/lib/validation/authFetch";
import { buildScopeQuery, readStoredWorkspaceId } from "@/lib/workspaceStorage";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import {
  EMPTY_PROJECT_TREE,
  flattenTreeFolders,
  flattenTreeProjects,
  type ProjectTree,
} from "@/lib/projectTree";
import ProjectTreeNav, {
  type FolderCreateOpts,
} from "@/components/projects/ProjectTreeNav";
import ProjectCreateModal, {
  type ProjectCreateContext,
} from "@/components/projects/ProjectCreateModal";
import ProjectEditModal from "@/components/projects/ProjectEditModal";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Inbox,
  LayoutDashboard,
  Gauge,
  FolderKanban,
  CalendarRange,
  ListPlus,
  UserPlus,
  Calendar,
  BarChart3,
  Trash2,
  Settings,
  Building2,
  Tags,
  X,
  Plus,
  ClipboardList,
} from "lucide-react";
import {
  pinsStorageKey,
  readProjectPins,
  toggleProjectPin,
  writeProjectPins,
  type ProjectPin,
} from "@/lib/projectPins";

function SidebarNavSkeleton() {
  const rows = [1, 0.72, 0.88, 0.65, 0.8, 0.7, 0.9, 0.6, 0.75, 0.85];
  return (
    <div className="space-y-2 mt-1" aria-busy="true" aria-label="Loading menu">
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-2 mb-4">
          {section > 0 && <div className="skeleton h-2.5 w-16 mx-1 mb-1" />}
          {rows.slice(section * 3, section * 3 + 3).map((width, i) => (
            <div
              key={`${section}-${i}`}
              className="flex items-center gap-3 px-2.5 py-2"
            >
              <div className="skeleton h-4 w-4 shrink-0 rounded" />
              <div
                className="skeleton h-3.5 rounded"
                style={{ width: `${width * 100}%` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, close, projectsOpen, toggleProjects } = useSidebar();
  const {
    canCreateProject,
    canViewGlobalMembers,
    currentOrg,
    currentOrgId,
    inOrgContext,
    orgReady,
    loading,
    can,
  } = useOrgPermission();

  const [tree, setTree] = useState<ProjectTree>(EMPTY_PROJECT_TREE);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<"project" | "folder">(
    "project"
  );
  const [createContext, setCreateContext] =
    useState<ProjectCreateContext | null>(null);
  const [pins, setPins] = useState<ProjectPin[]>([]);
  const [accessibleProjectIds, setAccessibleProjectIds] = useState<Set<string>>(
    new Set()
  );
  const [editableProjectIds, setEditableProjectIds] = useState<Set<string>>(
    new Set()
  );
  const [editProjectId, setEditProjectId] = useState<string | null>(null);

  const permissionsPending = loading || !orgReady;

  const isActive = (path: string) => pathname === path;

  const linkClass = (active: boolean) =>
    `sidebar-item ${active ? "active-sidebar" : ""}`;

  const loadProjects = useCallback(async () => {
    if (!orgReady) return;
    setProjectsLoading(true);
    try {
      const query = buildScopeQuery(currentOrg?.organizationId || null);
      const res = await authFetch(`/projects/tree${query}`);
      if (res.ok) {
        const data = await res.json();
        const nextTree = {
          folders: Array.isArray(data.folders) ? data.folders : [],
          files: Array.isArray(data.files) ? data.files : [],
          projects: Array.isArray(data.projects) ? data.projects : [],
        };
        setTree(nextTree);
        setAccessibleProjectIds(
          new Set(
            Array.isArray(data.memberProjectIds)
              ? data.memberProjectIds.map(String)
              : flattenTreeProjects(nextTree).map((p) => p._id)
          )
        );
        setEditableProjectIds(
          new Set(
            Array.isArray(data.editableProjectIds)
              ? data.editableProjectIds.map(String)
              : []
          )
        );

        const key = pinsStorageKey(
          currentOrg?.organizationId || null,
          readStoredWorkspaceId()
        );
        setPins((prev) => {
          const folderIds = new Set(
            flattenTreeFolders(nextTree.folders).map((f) => f._id)
          );
          const projectIds = new Set(
            flattenTreeProjects(nextTree).map((p) => p._id)
          );
          const next = prev.filter(
            (pin) =>
              (pin.type === "folder" && folderIds.has(pin.id)) ||
              (pin.type === "project" && projectIds.has(pin.id))
          );
          if (next.length !== prev.length) writeProjectPins(key, next);
          return next;
        });
      } else {
        setTree(EMPTY_PROJECT_TREE);
        setAccessibleProjectIds(new Set());
        setEditableProjectIds(new Set());
      }
    } catch {
      setTree(EMPTY_PROJECT_TREE);
      setAccessibleProjectIds(new Set());
      setEditableProjectIds(new Set());
    } finally {
      setProjectsLoading(false);
    }
  }, [orgReady, currentOrg?.organizationId]);

  const handleDeleteFolder = useCallback(
    async (folderId: string, folderName: string) => {
      const ok = await confirmDialog({
        title: `Move "${folderName}" to trash?`,
        description:
          "All projects and subprojects inside this folder will also be moved to trash. You can restore the folder and its projects from Trash Bin.",
        confirmLabel: "Move to trash",
        variant: "danger",
      });
      if (!ok) return;

      const res = await authFetch(`/folders/${folderId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || "Failed to delete folder");
        return;
      }
      toast.success(data.message || "Folder moved to trash");
      window.dispatchEvent(new Event("projects-updated"));
      if (pathname.startsWith("/projects/")) {
        router.push("/projects");
      }
    },
    [pathname, router]
  );

  const handleDeleteProject = useCallback(
    async (projectId: string, projectTitle: string) => {
      const ok = await confirmDialog({
        title: `Move "${projectTitle}" to trash?`,
        description:
          "All subprojects and tasks inside this project will also be moved to trash. You can restore them from Trash Bin.",
        confirmLabel: "Move to trash",
        variant: "danger",
      });
      if (!ok) return;

      const res = await authFetch(`/projects/${projectId}/trash`, {
        method: "PATCH",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || "Failed to delete project");
        return;
      }
      toast.success(data.message || "Project moved to trash");
      window.dispatchEvent(new Event("projects-updated"));
      if (pathname === `/projects/${projectId}` || pathname.startsWith(`/projects/${projectId}/`)) {
        router.push("/projects");
      }
    },
    [pathname, router]
  );

  const pinsKey = pinsStorageKey(
    currentOrg?.organizationId || null,
    readStoredWorkspaceId()
  );

  const handleTogglePin = useCallback(
    (entry: ProjectPin) => {
      setPins((prev) => {
        const next = toggleProjectPin(prev, entry);
        writeProjectPins(pinsKey, next);
        return next;
      });
    },
    [pinsKey]
  );

  const openCreateFolderDialog = useCallback((opts?: FolderCreateOpts) => {
    setCreateContext(opts || null);
    setCreateModalType("folder");
    setCreateModalOpen(true);
  }, []);

  const openCreateProject = useCallback(
    (opts?: { folderId?: string; parentProjectId?: string }) => {
      setCreateContext({
        folderId: opts?.folderId,
        parentProjectId: opts?.parentProjectId,
      });
      setCreateModalType("project");
      setCreateModalOpen(true);
    },
    []
  );

  const openCreateModal = useCallback(() => {
    setCreateContext(null);
    setCreateModalType("project");
    setCreateModalOpen(true);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    setPins(readProjectPins(pinsKey));
  }, [pinsKey]);

  useEffect(() => {
    window.addEventListener("projects-updated", loadProjects);
    window.addEventListener("workspace-changed", loadProjects);
    return () => {
      window.removeEventListener("projects-updated", loadProjects);
      window.removeEventListener("workspace-changed", loadProjects);
    };
  }, [loadProjects]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed left-0 top-18 w-72 h-[calc(100dvh-72px)] z-40 shadow-sm transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="app-sidebar h-full w-full bg-white border-r border-slate-200 overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar momentum-scroll dark:bg-slate-900 dark:border-slate-800">
          <div className="px-3 py-5">
            <div className="flex items-center justify-between mb-2 lg:hidden">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                Menu
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="btn btn-ghost btn-sm px-2!"
              >
                <X size={18} />
              </button>
            </div>
            <WorkspaceHeader />

            {permissionsPending ? (
              <SidebarNavSkeleton />
            ) : (
              <>
 

                <Link href="/inbox" className={linkClass(isActive("/inbox"))}>
                  <Inbox size={17} />
                  Inbox
                </Link>

                <Link
                  href="/dashboard"
                  className={linkClass(isActive("/dashboard"))}
                >
                  <LayoutDashboard size={17} />
                  Dashboard
                </Link>

                {canViewGlobalMembers && (
                  <Link
                    href="/workload"
                    className={linkClass(isActive("/workload"))}
                  >
                    <Gauge size={17} />
                    Workload
                  </Link>
                )}

                {inOrgContext &&
                  (can("requestForm:submit") ||
                    can("requestForm:manage") ||
                    can("requestForm:review")) && (
                  <Link
                    href="/request-forms"
                    className={linkClass(isActive("/request-forms"))}
                  >
                    <ClipboardList size={17} />
                    Request Forms
                  </Link>
                )}

                <div className="sidebar-heading">Project</div>

                <div className="flex items-center gap-0.5">
                  <Link
                    href="/projects"
                    onClick={toggleProjects}
                    aria-expanded={projectsOpen}
                    className={`${linkClass(isActive("/projects"))} min-w-0 flex-1`}
                  >
                    <FolderKanban size={17} />
                    Project List
                  </Link>
                  {canCreateProject && (
                    <button
                      type="button"
                      aria-label="Create folder or project"
                      onClick={openCreateModal}
                      className="shrink-0 rounded-lg p-1.5 pr-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-400"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>

                {projectsOpen && (
                  <div className="ml-4 pl-3 border-l border-slate-200 space-y-0.5 mb-1 dark:border-slate-800">
                    {projectsLoading ? (
                      <div
                        className="space-y-1.5 py-1.5 px-2.5"
                        aria-busy="true"
                      >
                        <div className="skeleton h-3 w-28" />
                        <div className="skeleton h-3 w-24" />
                      </div>
                    ) : (
                      <ProjectTreeNav
                        folders={tree.folders}
                        projects={tree.projects}
                        activePath={pathname}
                        canCreate={canCreateProject}
                        accessibleProjectIds={accessibleProjectIds}
                        editableProjectIds={editableProjectIds}
                        pins={pins}
                        onTogglePin={handleTogglePin}
                        onCreateFolder={openCreateFolderDialog}
                        onCreateProject={openCreateProject}
                        onDeleteFolder={
                          canCreateProject ? handleDeleteFolder : undefined
                        }
                        onDeleteProject={
                          canCreateProject ? handleDeleteProject : undefined
                        }
                        onEditProject={setEditProjectId}
                      />
                    )}
                  </div>
                )}

                {canViewGlobalMembers && (
                  <Link
                    href="/projects/timeline"
                    className={linkClass(isActive("/projects/timeline"))}
                  >
                    <CalendarRange size={17} />
                    Timeline
                  </Link>
                )}

                {canViewGlobalMembers && (
                  <>
                    <div className="sidebar-heading">Task</div>
                    <Link
                      href="/tasks"
                      className={linkClass(isActive("/tasks"))}
                    >
                      <ListPlus size={17} />
                      Create Task
                    </Link>
                    <Link
                      href="/assign-task"
                      className={linkClass(isActive("/assign-task"))}
                    >
                      <UserPlus size={17} />
                      Assign Task
                    </Link>
                  </>
                )}

                <div className="sidebar-heading">Insights</div>

                <Link
                  href="/calendar"
                  className={linkClass(isActive("/calendar"))}
                >
                  <Calendar size={17} />
                  Calendar
                </Link>

                <Link
                  href="/reports"
                  className={linkClass(
                    pathname === "/reports" ||
                      (pathname.startsWith("/reports/") &&
                        !pathname.startsWith("/reports/weekly"))
                  )}
                >
                  <BarChart3 size={17} />
                  Reports
                </Link>

                <Link
                  href="/reports/weekly"
                  className={linkClass(
                    pathname === "/reports/weekly" ||
                      pathname.startsWith("/reports/weekly/")
                  )}
                >
                  <BarChart3 size={17} />
                  My Report
                </Link>

                <Link href="/trash" className={linkClass(isActive("/trash"))}>
                  <Trash2 size={17} />
                  Trash Bin
                </Link>

                <Link
                  href="/settings/custom-fields"
                  className={linkClass(
                    pathname.startsWith("/settings/custom-fields")
                  )}
                >
                  <Tags size={17} />
                  Custom Fields
                </Link>

                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-0.5">
                  <Link
                    href="/settings/account"
                    className={linkClass(
                      (pathname.startsWith("/settings/account") ||
                        pathname.startsWith("/profile") ||
                        pathname.startsWith("/change-password") ||
                        pathname.startsWith("/settings/leave")) &&
                        !pathname.startsWith("/settings/organization") &&
                        !pathname.startsWith("/settings/create-organization") &&
                        !pathname.startsWith("/settings/appearance") &&
                        !pathname.startsWith("/settings/custom-fields")
                    )}
                  >
                    <Settings size={17} />
                    Account Settings
                  </Link>
                  <Link
                    href="/settings/organization"
                    className={linkClass(
                      pathname.startsWith("/settings/organization") ||
                        pathname.startsWith("/settings/create-organization") ||
                        pathname.startsWith("/settings/appearance") ||
                        pathname === "/admin" ||
                        (pathname.includes("/organizations/") &&
                          pathname.endsWith("/members"))
                    )}
                  >
                    <Building2 size={17} />
                    Organization Settings
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
      <ProjectCreateModal
        open={createModalOpen}
        initialType={createModalType}
        context={createContext}
        organizationId={currentOrg?.organizationId || currentOrgId}
        organizationName={currentOrg?.name || null}
        onClose={() => {
          setCreateModalOpen(false);
          setCreateContext(null);
        }}
      />
      <ProjectEditModal
        projectId={editProjectId}
        onClose={() => setEditProjectId(null)}
        onSaved={() => {
          // ProjectEditModal already dispatches "projects-updated", which
          // this component listens for via loadProjects — nothing else to do.
        }}
      />
    </>
  );
}
