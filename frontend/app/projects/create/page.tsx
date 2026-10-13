"use client";

import Sidebar from "@/components/sidebar/sidebar";
import Navbar from "@/components/navbar/Navbar";
import PermissionGate from "@/components/auth/PermissionGate";
import { useOrganization } from "@/components/context/organizationContext";
import { authFetch } from "@/lib/validation/authFetch";
import { readStoredWorkspaceId } from "@/lib/workspaceStorage";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FolderPlus } from "lucide-react";
import ProjectScheduleBudgetFields, {
  DEFAULT_PROJECT_SCHEDULE_BUDGET,
  type ProjectScheduleBudgetValues,
} from "@/components/projects/ProjectScheduleBudgetFields";
import {
  buildProjectScheduleBudgetPayload,
  validateProjectScheduleBudget,
} from "@/lib/projectScheduleBudget";

function CreateProjectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentOrg } = useOrganization();
  const [form, setForm] = useState({ title: "", description: "" });
  const [scheduleBudget, setScheduleBudget] =
    useState<ProjectScheduleBudgetValues>(DEFAULT_PROJECT_SCHEDULE_BUDGET);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [parentTitle, setParentTitle] = useState("");

  const folderId = searchParams.get("folderId") || undefined;
  const fileId = searchParams.get("fileId") || undefined;
  const parentProjectId = searchParams.get("parentProjectId") || undefined;

  const placementLabel = useMemo(() => {
    if (parentProjectId) {
      return parentTitle
        ? `Creating a subproject inside ${parentTitle}`
        : "Creating a subproject";
    }
    if (folderId) return "Creating a project inside a folder";
    if (fileId) return "Creating a project inside a file";
    return currentOrg
      ? `Creating in organization: ${currentOrg.name}`
      : "Creating in your personal workspace";
  }, [currentOrg, folderId, fileId, parentProjectId, parentTitle]);

  useEffect(() => {
    if (!parentProjectId) {
      setParentTitle("");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await authFetch(`/projects/${parentProjectId}`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (!cancelled) setParentTitle(data.title || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [parentProjectId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Project title is required");
      return;
    }

    const scheduleError = validateProjectScheduleBudget(scheduleBudget);
    if (scheduleError) {
      setError(scheduleError);
      return;
    }

    setLoading(true);
    setError("");
    const res = await authFetch("/projects", {
      method: "POST",
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        organizationId: currentOrg?.organizationId || undefined,
        workspaceId: readStoredWorkspaceId() || undefined,
        ...(parentProjectId
          ? { parentProjectId }
          : { folderId, fileId }),
        ...buildProjectScheduleBudgetPayload(scheduleBudget),
      }),
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      window.dispatchEvent(new Event("projects-updated"));
      const id = data._id || data.id;
      if (id) {
        router.push(`/projects/${id}`);
      } else {
        router.push("/projects");
      }
    } else {
      setError(data.message || "Failed to create project");
    }
  };

  return (
    <PermissionGate permission="org:createProject">
      <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />
        <div className="flex h-full">
          <Sidebar />

          <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-10 dark:bg-slate-950 dark:text-slate-100">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 text-sm text-cyan-700/80 hover:text-cyan-600 mb-6 dark:text-cyan-400/80 dark:hover:text-cyan-300"
            >
              <ArrowLeft size={16} />
              Back to projects
            </Link>

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center shrink-0 dark:bg-cyan-400/10 dark:border-cyan-400/20">
                <FolderPlus size={18} className="text-cyan-600 dark:text-cyan-400" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {parentProjectId ? "Create Subproject" : "Create Project"}
              </h1>
            </div>
            <p className="text-slate-500 text-sm mb-8 dark:text-slate-400">
              {placementLabel}
            </p>

            <form
              onSubmit={submit}
              className="bg-white border border-slate-200 shadow-sm p-8 rounded-2xl max-w-3xl space-y-5 dark:bg-slate-900 dark:border-slate-800"
            >
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20">
                  {error}
                </p>
              )}

              <div>
                <label className="block text-sm text-slate-500 mb-2 dark:text-slate-400">
                  Project title
                </label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Website Redesign"
                  className="w-full p-4 rounded-xl bg-slate-50 text-slate-900 border border-slate-200 outline-none focus:ring-4 focus:ring-cyan-100 focus:border-cyan-400 focus:bg-white transition-all dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:focus:bg-slate-800 dark:focus:ring-cyan-500/20 dark:focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-500 mb-2 dark:text-slate-400">
                  Description <span className="text-slate-400 dark:text-slate-500">(optional)</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="What is this project about?"
                  rows={5}
                  className="w-full p-4 rounded-xl bg-slate-50 text-slate-900 border border-slate-200 outline-none focus:ring-4 focus:ring-cyan-100 focus:border-cyan-400 focus:bg-white transition-all resize-none dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:focus:bg-slate-800 dark:focus:ring-cyan-500/20 dark:focus:border-cyan-500"
                />
              </div>

              <ProjectScheduleBudgetFields
                values={scheduleBudget}
                onChange={(next) =>
                  setScheduleBudget((prev) => ({ ...prev, ...next }))
                }
              />

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => router.push("/projects")}
                  className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !form.title.trim()}
                  className="bg-gradient-to-r bg-cyan-600  text-white px-6 py-3 rounded-xl font-medium disabled:opacity-60 hover:bg-cyan-700  transition-opacity"
                >
                  {loading
                    ? "Creating..."
                    : parentProjectId
                    ? "Create Subproject"
                    : "Create Project"}
                </button>
              </div>
            </form>
          </main>
        </div>
      </div>
    </PermissionGate>
  );
}

export default function CreateProject() {
  return (
    <Suspense
      fallback={
        <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950" />
      }
    >
      <CreateProjectContent />
    </Suspense>
  );
}
