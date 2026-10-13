"use client";

import Sidebar from "@/components/sidebar/sidebar";
import Navbar from "@/components/navbar/Navbar";
import { useOrganization } from "@/components/context/organizationContext";
import { authFetch } from "@/lib/validation/authFetch";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import { avatarColor } from "@/lib/avatarColor";
import UserAvatar from "@/components/ui/UserAvatar";
import { Search, FolderKanban } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";

type Project = {
  _id: string;
  title: string;
  description?: string;
  status: string;
  myRole?: string;
  createdBy?: { _id: string; username: string; email?: string; avatarColor?: string };
  organization?: { name: string; slug: string };
};

export default function ProjectsPage() {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const { canCreateProject } = useOrgPermission();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [progressByProjectId, setProgressByProjectId] = useState<Record<string, number>>({});

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const query = currentOrg
      ? `?organizationId=${currentOrg.organizationId}`
      : "?personal=true";

    const loadProjects = async () => {
      const response = await authFetch(`/projects${query}`);
      if (response.ok) {
       const data = await response.json();
        setProjects(
          data.filter((project: any) => !project.isDeleted)
        );
      }
    };

    const loadProgress = async () => {
      const response = await authFetch(`/dashboard/project-progress${query}`);
      if (response.ok) {
        const data = await response.json();
        const map: Record<string, number> = {};
        if (Array.isArray(data)) {
          data.forEach((entry: any) => {
            if (entry.projectId) map[entry.projectId] = entry.progress;
          });
        }
        setProgressByProjectId(map);
      }
    };

    loadProjects();
    loadProgress();
  }, [currentOrg, router]);

  const deriveStatus = (
    projectId: string
  ): "active" | "completed" | "pending" => {
    const progress = progressByProjectId[projectId] ?? 0;
    if (progress >= 100) return "completed"; // every task in Done
    if (progress <= 0) return "pending";     // nothing started
    return "active";                          // some done, not all
  };

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.title
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    const matchesStatus =
      statusFilter === "all" || deriveStatus(project._id) === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
  <Navbar />
  <div className="flex h-full">
      <Sidebar />

      <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] px-4 py-5 sm:px-8 sm:py-7 dark:bg-slate-950">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Projects</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              {currentOrg
                ? `Projects in ${currentOrg.name} — you only see projects you belong to`
                : "Personal workspace projects"}
            </p>
          </div>

          {canCreateProject && (
            <Link
              href="/projects/create"
              className="rounded-xl bg-cyan-600 px-5 py-2.5 text-sm text-white font-semibold shadow-sm transition-all duration-200 hover:bg-cyan-700 hover:shadow-md">
              + Create Project
            </Link>
          )}
        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900 dark:border-slate-800">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
  Total Projects
</h3>
            <p className="mt-2 text-4xl font-bold text-slate-800 dark:text-slate-100">{projects.length}</p>
          </div>
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900 dark:border-slate-800">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Active</h3>
            <p className="mt-2 text-4xl font-bold text-slate-800 dark:text-slate-100">
              {projects.filter((p) => deriveStatus(p._id) === "active").length}
            </p>
          </div>
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900 dark:border-slate-800">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Completed</h3>
            <p className="mt-2 text-4xl font-bold text-slate-800 dark:text-slate-100">
              {projects.filter((p) => deriveStatus(p._id) === "completed").length}
            </p>
          </div>
           <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900 dark:border-slate-800">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Pending</h3>
            <p className="mt-2 text-4xl font-bold text-slate-800 dark:text-slate-100">
              {projects.filter((p) => deriveStatus(p._id) === "pending").length}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 sm:max-w-xs">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="field-input pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "active", "completed", "pending"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-400/10 dark:text-cyan-400 dark:border-cyan-400/20"
                    : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800 dark:hover:bg-slate-800"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredProjects.map((project) => {
             const progress = progressByProjectId[project._id] ?? 0;
            const derivedStatus = deriveStatus(project._id);
            return (
            <div
  key={project._id}
  className="group flex flex-col rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
>
  <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
    <div className="flex items-center gap-4 min-w-0">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600 border border-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-400 dark:border-cyan-400/20">
        <FolderKanban size={24} />
      </div>

      <div className="min-w-0">
        <h2 className="text-xl font-bold text-slate-800 truncate dark:text-slate-100">
          {project.title}
        </h2>

        {project.organization && (
          <p className="mt-1 text-sm text-cyan-700 font-medium truncate dark:text-cyan-400">
            {project.organization.name}
          </p>
        )}
      </div>
    </div>

    <span
  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
    derivedStatus === "active"
      ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400"
      : derivedStatus === "completed"
      ? "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400"
      : "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
  }`}
>
  {derivedStatus}
</span>
  </div>

  <div className="flex items-center gap-3 mb-5 min-w-0">
    <UserAvatar
      name={project.createdBy?.username}
      color={project.createdBy?.avatarColor}
      seed={project.createdBy?._id ?? project._id}
      size={40}
    />

    <div className="min-w-0">
      <p className="font-semibold text-slate-800 truncate dark:text-slate-100">
        {project.createdBy?.username ?? "Unknown"}
      </p>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Created this project
      </p>
    </div>
  </div>

  <div className="mb-5">
    <div className="flex justify-between text-sm mb-2">
      <span className="text-slate-500 dark:text-slate-400">
        Progress
      </span>

      <span className="font-semibold text-cyan-700 dark:text-cyan-400">
        {progress}%
      </span>
    </div>

    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600"
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  </div>

  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
    <div className="flex flex-wrap gap-4">
      
      <button
  onClick={() => {
    localStorage.setItem("currentProjectId", project._id);
    router.push(`/projects/${project._id}`);
  }}
  className="font-medium text-cyan-700 transition hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-300"
>
  Open Board →
</button>

      <Link
        href={`/projects/${project._id}/members`}
        className="font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        Members
      </Link>
    </div>

    <button
  onClick={async () => {
    const ok = await confirmDialog({
      title: "Move project to trash?",
      description: "You can restore it later from Trash.",
      confirmLabel: "Move to trash",
      variant: "danger",
    });
    if (!ok) return;

    await authFetch(
      `/projects/${project._id}/trash`,
      {
        method: "PATCH",
      }
    );

    window.location.reload();
  }}
  className="font-medium text-red-500 transition hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
>
  Delete
</button>
  </div>
</div>
            );
          })}
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <FolderKanban size={26} />
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              No projects yet.
              {canCreateProject ? " Create one to get started." : " Ask an admin or manager to add you."}
            </p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <Search size={22} />
            </div>
            <p className="text-slate-500 dark:text-slate-400">No projects match your search or filter.</p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
              className="text-cyan-700 text-sm font-medium hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-300"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </main>
        </div>
  </div>
  );
}
