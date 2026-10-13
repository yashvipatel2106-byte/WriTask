"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ModalShell } from "@/components/ui/Modal";
import { authFetch } from "@/lib/validation/authFetch";
import ProjectScheduleBudgetFields, {
  type ProjectScheduleBudgetValues,
} from "@/components/projects/ProjectScheduleBudgetFields";
import {
  buildProjectScheduleBudgetPayload,
  validateProjectScheduleBudget,
} from "@/lib/projectScheduleBudget";

export type EditableProject = {
  _id: string;
  title: string;
  description?: string;
  startDate?: string | null;
  dueDate?: string | null;
  billing?: "billable" | "non_billable";
  budget?: number | null;
};

type Props = {
  /** Project to edit, or null/undefined to keep the modal closed. */
  projectId: string | null | undefined;
  onClose: () => void;
  /** Called with the updated project after a successful save. */
  onSaved: (updated: EditableProject) => void;
};

/** "2026-10-01T00:00:00.000Z" (or similar) -> "2026-10-01" for ThemedDatePicker. */
function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Edit Project — reuses the exact same fields/components as
 * ProjectCreateModal (title input style, Description textarea, and the
 * shared ProjectScheduleBudgetFields) instead of a separate one-off form.
 * Opened from the sidebar's 3-dot menu; gated by project:update, enforced
 * again server-side by PUT /api/projects/:projectId.
 *
 * The sidebar tree only carries minimal project fields (title/folder/
 * order), so this modal fetches the full project itself by id rather
 * than requiring the caller to have a fully-populated project on hand.
 */
export default function ProjectEditModal({ projectId, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleBudget, setScheduleBudget] = useState<ProjectScheduleBudgetValues>({
    startDate: "",
    dueDate: "",
    billing: "billable",
    budget: "",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    authFetch(`/projects/${projectId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.message || "Failed to load project");
          return;
        }
        setTitle(data.title || "");
        setDescription(data.description || "");
        setScheduleBudget({
          startDate: toDateInputValue(data.startDate),
          dueDate: toDateInputValue(data.dueDate),
          billing: data.billing || "billable",
          budget: data.budget != null ? String(data.budget) : "",
        });
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load project");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) return null;

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Project title is required");
      return;
    }

    const scheduleError = validateProjectScheduleBudget(scheduleBudget);
    if (scheduleError) {
      setError(scheduleError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await authFetch(`/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: trimmed,
          description: description.trim(),
          ...buildProjectScheduleBudgetPayload(scheduleBudget),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Failed to update project");
        return;
      }

      window.dispatchEvent(new Event("projects-updated"));
      onSaved(data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} maxWidth="2xl">
      <div className="flex max-h-[min(90vh,680px)] flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Edit project
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

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {error ? (
            <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              Loading project…
            </p>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Project name
                </label>
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Project name"
                  className="field-input"
                />
              </div>

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
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSubmit()}
            className="rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
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
