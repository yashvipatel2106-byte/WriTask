"use client";

import WorkspaceHeader from "@/components/sidebar/WorkspaceHeader";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import { useSidebar } from "@/components/context/sidebarContext";
import { authFetch } from "@/lib/validation/authFetch";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Inbox,
  LayoutDashboard,
  Gauge,
  FolderKanban,
  FolderPlus,
  CalendarRange,
  ListPlus,
  UserPlus,
  Users,
  Calendar,
  BarChart3,
  ShieldCheck,
  Trash2,
  Building2,
  Settings,
  X,
} from "lucide-react";

type SidebarProject = {
  _id: string;
  title: string;
  isDeleted?: boolean;
};

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
      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <div className="skeleton h-4 w-4 shrink-0 rounded" />
          <div className="skeleton h-3.5 w-32 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close, projectsOpen, toggleProjects } = useSidebar();
  const {
    canCreateProject,
    canViewMembers,
    canViewAdmin,
    canViewGlobalMembers,
    inOrgContext,
    currentOrg,
    orgReady,
    loading,
  } = useOrgPermission();

  const [projects, setProjects] = useState<SidebarProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const permissionsPending = loading || !orgReady;

  const isActive = (path: string) => pathname === path;

  const linkClass = (active: boolean) =>
    `sidebar-item ${active ? "active-sidebar" : ""}`;

  const loadProjects = useCallback(async () => {
    if (!orgReady) return;
    setProjectsLoading(true);
    try {
      const query = currentOrg
        ? `?organizationId=${currentOrg.organizationId}`
        : "?personal=true";
      const res = await authFetch(`/projects${query}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(
          Array.isArray(data)
            ? data.filter((project: SidebarProject) => !project.isDeleted)
            : []
        );
      } else {
        setProjects([]);
      }
    } catch {
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, [orgReady, currentOrg?.organizationId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Other pages (create/delete/restore a project) dispatch this so the
  // persistent sidebar stays in sync without needing a full page reload.
  useEffect(() => {
    window.addEventListener("projects-updated", loadProjects);
    return () => window.removeEventListener("projects-updated", loadProjects);
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
      {/* Scroll lives on this inner layer (no transform of its own) — a
          transform on the same element as overflow-y:auto can make iOS
          Safari fail to recognize touch-drag as a scroll gesture. */}
      <div className="h-full w-full bg-white border-r border-slate-200 overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar momentum-scroll dark:bg-slate-900 dark:border-slate-800">
      <div className="px-3 py-5">
        <div className="flex items-center justify-between mb-2 lg:hidden">
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Menu</span>
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

            <Link href="/dashboard" className={linkClass(isActive("/dashboard"))}>
              <LayoutDashboard size={17} />
              Dashboard
            </Link>

            {canViewGlobalMembers && (
              <Link href="/workload" className={linkClass(isActive("/workload"))}>
                <Gauge size={17} />
                Workload
              </Link>
            )}

            <div className="sidebar-heading">Project</div>

            <Link
              href="/projects"
              onClick={toggleProjects}
              aria-expanded={projectsOpen}
              className={linkClass(isActive("/projects"))}
            >
              <FolderKanban size={17} />
              Project List
            </Link>

            {projectsOpen && (
              <div className="ml-4 pl-3 border-l border-slate-200 space-y-0.5 mb-1 dark:border-slate-800">
                {projectsLoading ? (
                  <div className="space-y-1.5 py-1.5 px-2.5" aria-busy="true">
                    <div className="skeleton h-3 w-28" />
                    <div className="skeleton h-3 w-24" />
                    <div className="skeleton h-3 w-32" />
                  </div>
                ) : projects.length === 0 ? (
                  <p className="text-xs text-slate-400 py-1.5 px-2.5 dark:text-slate-500">No projects yet</p>
                ) : (
                  projects.map((project) => (
                    <Link
                      key={project._id}
                      href={`/projects/${project._id}`}
                      title={project.title}
                      className={`block truncate px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
                        isActive(`/projects/${project._id}`)
                          ? "bg-cyan-50 text-cyan-700 font-medium dark:bg-cyan-400/10 dark:text-cyan-400"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      }`}
                    >
                      {project.title}
                    </Link>
                  ))
                )}
              </div>
            )}

            {canCreateProject && (
              <Link
                href="/projects/create"
                className={linkClass(isActive("/projects/create"))}
              >
                <FolderPlus size={17} />
                Create Project
              </Link>
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
                <Link href="/tasks" className={linkClass(isActive("/tasks"))}>
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

            {canViewGlobalMembers && (
              <>
                <div className="sidebar-heading">Organization</div>
                <Link href="/members" className={linkClass(isActive("/members"))}>
                  <Users size={17} />
                  Organization members
                </Link>
              </>
            )}

            <div className="sidebar-heading">Insights</div>

            <Link href="/calendar" className={linkClass(isActive("/calendar"))}>
              <Calendar size={17} />
              Calendar
            </Link>

            <Link href="/reports" className={linkClass(isActive("/reports"))}>
              <BarChart3 size={17} />
              My Report
            </Link>

            {canViewAdmin && (
              <>
                <div className="sidebar-heading">Admin</div>
                <Link
                  href="/admin"
                  className={linkClass(pathname === "/admin")}
                >
                  <ShieldCheck size={17} />
                  Administration
                </Link>

                <Link
                  href="/admin/reports"
                  className={linkClass(isActive("/admin/reports"))}
                >
                  <BarChart3 size={17} />
                  Org Reports
                </Link>

                <Link href="/trash" className={linkClass(isActive("/trash"))}>
                  <Trash2 size={17} />
                  Trash Bin
                </Link>
              </>
            )}

            {inOrgContext && canViewMembers && currentOrg && (
              <Link
                href={`/organizations/${currentOrg.organizationId}/members`}
                className={`${linkClass(
                  pathname.includes("/organizations/") && pathname.endsWith("/members")
                )} mt-2`}
              >
                <Building2 size={17} />
                Organization members
              </Link>
            )}

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Link
                href="/settings/account"
                className={linkClass(pathname.startsWith("/settings"))}
              >
                <Settings size={17} />
                Account settings
              </Link>
            </div>
          </>
        )}
      </div>
      </div>
      </aside>
    </>
  );
}
