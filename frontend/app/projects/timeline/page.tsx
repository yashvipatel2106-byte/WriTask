"use client";

import Sidebar from "@/components/sidebar/sidebar";
import Navbar from "@/components/navbar/Navbar";
import { useOrganization } from "@/components/context/organizationContext";
import { authFetch } from "@/lib/validation/authFetch";
import { buildScopeQuery } from "@/lib/workspaceStorage";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GanttChart, FolderKanban } from "lucide-react";

type Project = {
  _id: string;
  title: string;
  description?: string;
  status?: string;
  organization?: { name?: string };
};

export default function TimelinePage() {
  const { currentOrg } = useOrganization();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const query = buildScopeQuery(currentOrg?.organizationId || null);
    const res = await authFetch(`/projects${query}`);
    if (res.ok) {
      const data = await res.json();
      setProjects(
        (Array.isArray(data) ? data : []).filter(
          (p: Project & { isDeleted?: boolean }) => !p.isDeleted
        )
      );
    } else {
      setProjects([]);
    }
    setLoading(false);
  }, [currentOrg?.organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-4 sm:p-6 lg:p-10 dark:bg-slate-950 dark:text-slate-100">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              Project Timeline
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Open a project&apos;s Gantt view to schedule tasks, drag dates, and
              link finish-to-start dependencies. Multi-project rollup comes next.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {loading ? (
              <p className="p-8 text-sm text-slate-500">Loading projects…</p>
            ) : projects.length === 0 ? (
              <div className="p-10 text-center">
                <FolderKanban className="mx-auto mb-3 text-slate-300" size={36} />
                <p className="text-slate-600 dark:text-slate-300">
                  No projects yet.
                </p>
                <Link
                  href="/projects"
                  className="mt-4 inline-flex text-sm font-medium text-cyan-700 hover:text-cyan-800 dark:text-cyan-400"
                >
                  Go to projects
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {projects.map((project) => (
                  <li
                    key={project._id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {project.title}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {project.organization?.name ||
                          project.description ||
                          "Open Gantt to plan the schedule"}
                      </p>
                    </div>
                    <Link
                      href={`/projects/${project._id}?view=gantt`}
                      className="inline-flex items-center gap-2 rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-800 hover:bg-cyan-100 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-300 dark:hover:bg-cyan-400/20"
                    >
                      <GanttChart size={16} />
                      Open Gantt
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
