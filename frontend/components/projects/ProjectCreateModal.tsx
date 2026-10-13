"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Folder,
  GanttChart,
  HelpCircle,
  LayoutGrid,
  Lock,
  Table2,
  X,
} from "lucide-react";
import { ModalShell } from "@/components/ui/Modal";
import { authFetch } from "@/lib/validation/authFetch";
import {
  type ProjectViewMode,
  writeStoredProjectView,
} from "@/lib/projectViewStorage";
import { readStoredWorkspaceId } from "@/lib/workspaceStorage";
import type { FolderCreateOpts } from "@/components/projects/ProjectTreeNav";
import ProjectScheduleBudgetFields, {
  DEFAULT_PROJECT_SCHEDULE_BUDGET,
  type ProjectScheduleBudgetValues,
} from "@/components/projects/ProjectScheduleBudgetFields";
import {
  buildProjectScheduleBudgetPayload,
  validateProjectScheduleBudget,
} from "@/lib/projectScheduleBudget";

export type ProjectCreateContext = FolderCreateOpts & {
  /** Place new project inside this folder */
  folderId?: string;
};

type CreateType = "project" | "folder";

type WorkspaceOption = {
  id: string;
  name: string;
  kind: string;
};

type Props = {
  open: boolean;
  initialType?: CreateType;
  context?: ProjectCreateContext | null;
  organizationId?: string | null;
  organizationName?: string | null;
  onClose: () => void;
};

function TypeOption({
  active,
  name,
  title,
  description,
  onSelect,
}: {
  active: boolean;
  name: string;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
        active
          ? "border-cyan-500/60 bg-cyan-500/5 dark:border-cyan-400/50 dark:bg-cyan-400/10"
          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={active}
        onChange={onSelect}
        className="mt-1 h-4 w-4 shrink-0 accent-cyan-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </span>
      </span>
    </label>
  );
}

function ViewCard({
  title,
  description,
  selected,
  icon,
  onSelect,
}: {
  title: string;
  description: string;
  selected?: boolean;
  icon: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border p-3 text-left transition-colors ${
        selected
          ? "border-cyan-500 ring-1 ring-cyan-500/30 bg-cyan-500/5 dark:border-cyan-400 dark:ring-cyan-400/30 dark:bg-cyan-400/10"
          : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
      }`}
    >
      <div className="mb-2 flex h-16 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </button>
  );
}

export default function ProjectCreateModal({
  open,
  initialType = "project",
  context = null,
  organizationId,
  organizationName,
  onClose,
}: Props) {
  const router = useRouter();
  const [createType, setCreateType] = useState<CreateType>(initialType);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleBudget, setScheduleBudget] =
    useState<ProjectScheduleBudgetValues>(DEFAULT_PROJECT_SCHEDULE_BUDGET);
  const [defaultView, setDefaultView] = useState<ProjectViewMode>("kanban");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);

  const loadWorkspaceLabel = useCallback(async () => {
    const storedId = readStoredWorkspaceId();
    if (!storedId) {
      setWorkspaceName(null);
      return;
    }
    try {
      const q = organizationId ? `?organizationId=${organizationId}` : "";
      const res = await authFetch(`/workspaces${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const list: WorkspaceOption[] = Array.isArray(data.workspaces)
        ? data.workspaces
        : [];
      setWorkspaceName(
        list.find((w) => w.id === storedId)?.name || null
      );
    } catch {
      setWorkspaceName(null);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!open) return;
    setCreateType(initialType);
    setName("");
    setDescription("");
    setScheduleBudget(DEFAULT_PROJECT_SCHEDULE_BUDGET);
    setDefaultView("kanban");
    setError("");
    void loadWorkspaceLabel();
  }, [open, initialType, loadWorkspaceLabel]);

  const locationLabel = useMemo(() => {
    const base = organizationName || "Personal";
    if (workspaceName && workspaceName !== base) {
      return `${base} · ${workspaceName}`;
    }
    return workspaceName || base;
  }, [organizationName, workspaceName]);

  const placementHint = useMemo(() => {
    if (context?.parentProjectId) {
      return "This will be created as a subproject inside the selected project.";
    }
    if (context?.parentFolderId) {
      return "This folder will be nested inside the selected folder.";
    }
    if (context?.folderId) {
      return "This project will be created inside the selected folder.";
    }
    return null;
  }, [context]);

  const modalTitle =
    createType === "folder" ? "Create folder" : "Create project";

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(
        createType === "folder"
          ? "Folder name is required"
          : "Project name is required"
      );
      return;
    }

    if (createType === "project") {
      const scheduleError = validateProjectScheduleBudget(scheduleBudget);
      if (scheduleError) {
        setError(scheduleError);
        return;
      }
    }

    setSaving(true);
    setError("");

    try {
      if (createType === "folder") {
        const res = await authFetch("/folders", {
          method: "POST",
          body: JSON.stringify({
            name: trimmed,
            organizationId: organizationId || undefined,
            workspaceId: readStoredWorkspaceId() || undefined,
            parentFolderId: context?.parentFolderId || undefined,
            parentProjectId: context?.parentProjectId || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.message || "Failed to create folder");
          return;
        }
        window.dispatchEvent(new Event("projects-updated"));
        onClose();
        return;
      }

      const parentProjectId = context?.parentProjectId;
      const res = await authFetch("/projects", {
        method: "POST",
        body: JSON.stringify({
          title: trimmed,
          description: description.trim(),
          organizationId: organizationId || undefined,
          workspaceId: readStoredWorkspaceId() || undefined,
          ...(parentProjectId
            ? { parentProjectId }
            : { folderId: context?.folderId || undefined }),
          ...buildProjectScheduleBudgetPayload(scheduleBudget),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Failed to create project");
        return;
      }

      window.dispatchEvent(new Event("projects-updated"));
      onClose();
      const id = data._id || data.id;
      if (id) {
        writeStoredProjectView(String(id), defaultView);
        router.push(`/projects/${id}?view=${defaultView}`);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <ModalShell onClose={onClose} maxWidth="5xl" className="overflow-hidden">
      <div className="flex max-h-[min(90vh,720px)] flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {modalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Left panel — basics */}
          <div className="w-full shrink-0 border-b border-slate-200 bg-slate-50/80 p-6 dark:border-slate-800 dark:bg-slate-900/60 lg:w-[300px] lg:border-b-0 lg:border-r">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                createType === "folder" ? "Folder name" : "Project name"
              }
              className="mb-5 w-full border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-lg font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500 dark:border-slate-600 dark:text-slate-100 dark:focus:border-cyan-400"
            />

            <div className="mb-5">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Location
              </p>
              <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                {locationLabel}
              </span>
            </div>

            <div className="space-y-2.5">
              <TypeOption
                name="create-type"
                active={createType === "project"}
                title="Project"
                description="Manage tasks toward a goal. Projects can have their own Kanban board, members, and due dates separate from individual tasks."
                onSelect={() => setCreateType("project")}
              />
              <TypeOption
                name="create-type"
                active={createType === "folder"}
                title="Folder"
                description="Organize and group projects in your workspace. Folders are containers only — they do not have tasks or boards of their own."
                onSelect={() => setCreateType("folder")}
              />
            </div>
          </div>

          {/* Right panel — project details */}
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {error ? (
              <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            ) : null}

            {placementHint ? (
              <p className="mb-5 rounded-xl border border-cyan-200/60 bg-cyan-50/80 px-3 py-2 text-sm text-cyan-900 dark:border-cyan-500/20 dark:bg-cyan-400/10 dark:text-cyan-100">
                {placementHint}
              </p>
            ) : null}

            {createType === "project" ? (
              <div className="space-y-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Description{" "}
                    <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="What is this project about?"
                    className="field-input min-h-[88px] resize-none"
                  />
                </div>

                <ProjectScheduleBudgetFields
                  values={scheduleBudget}
                  onChange={(next) =>
                    setScheduleBudget((prev) => ({ ...prev, ...next }))
                  }
                />

                <div>
                  <div className="mb-3 flex items-center gap-1.5">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Default view
                    </p>
                    <HelpCircle
                      size={14}
                      className="text-slate-400"
                      aria-hidden
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <ViewCard
                      title="Kanban"
                      description="Organize work by status on a Kanban board."
                      selected={defaultView === "kanban"}
                      onSelect={() => setDefaultView("kanban")}
                      icon={
                        <LayoutGrid
                          size={28}
                          className={
                            defaultView === "kanban"
                              ? "text-cyan-600 dark:text-cyan-400"
                              : "text-slate-400"
                          }
                        />
                      }
                    />
                    <ViewCard
                      title="Table"
                      description="See tasks in a spreadsheet-style list."
                      selected={defaultView === "table"}
                      onSelect={() => setDefaultView("table")}
                      icon={
                        <Table2
                          size={28}
                          className={
                            defaultView === "table"
                              ? "text-cyan-600 dark:text-cyan-400"
                              : "text-slate-400"
                          }
                        />
                      }
                    />
                    <ViewCard
                      title="Gantt"
                      description="Plan dates, drag schedule, and link dependencies."
                      selected={defaultView === "gantt"}
                      onSelect={() => setDefaultView("gantt")}
                      icon={
                        <GanttChart
                          size={28}
                          className={
                            defaultView === "gantt"
                              ? "text-cyan-600 dark:text-cyan-400"
                              : "text-slate-400"
                          }
                        />
                      }
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    The project opens in your selected view. Switch anytime from
                    the project page.
                  </p>
                </div>

                <div>
                  <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Sharing
                  </p>
                  <label className="flex items-start gap-3 rounded-xl border border-cyan-500/50 bg-cyan-500/5 p-3 dark:border-cyan-400/40 dark:bg-cyan-400/10">
                    <input
                      type="radio"
                      checked
                      readOnly
                      className="mt-0.5 accent-cyan-600"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        <Lock size={14} />
                        Private
                      </span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                        Only you can access this project initially. Invite
                        teammates from the project Members page after creation.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-800/30">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-500/15">
                  <Folder
                    size={28}
                    className="text-amber-600 dark:text-amber-400"
                  />
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Folders group related projects
                </p>
                <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                  After creating this folder, add projects inside it using the
                  + button or the folder&apos;s menu in the project tree.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSubmit()}
            className="rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 disabled:opacity-60"
          >
            {saving
              ? "Creating…"
              : createType === "folder"
                ? "Create folder"
                : "Create project"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
