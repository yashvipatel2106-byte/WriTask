"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useOrganization } from "@/components/context/organizationContext";
import Select, { type SelectOption } from "@/components/ui/Select";
import { authFetch } from "@/lib/validation/authFetch";
import {
  readStoredWorkspaceId,
  redirectFromProjectRoutesIfNeeded,
  redirectFromRequestFormRoutesIfNeeded,
  writeStoredWorkspaceId,
} from "@/lib/workspaceStorage";
import { toast } from "@/components/ui/toast";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import FormLabel from "@/components/ui/FormLabel";

export type WorkspaceOption = {
  id: string;
  name: string;
  kind: string;
  organizationId: string | null;
};

export default function WorkspaceHeader() {
  const { currentOrg, loading, orgReady, personalWorkspace } =
    useOrganization();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loadingWs, setLoadingWs] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadWorkspaces = useCallback(async () => {
    if (!orgReady) return;
    setLoadingWs(true);
    try {
      const q = currentOrg
        ? `?organizationId=${currentOrg.organizationId}`
        : "";
      const res = await authFetch(`/workspaces${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to load workspaces");
      const list: WorkspaceOption[] = Array.isArray(data.workspaces)
        ? data.workspaces
        : [];
      setWorkspaces(list);

      const stored = readStoredWorkspaceId();
      const stillValid = stored && list.some((w) => w.id === stored);
      let nextId: string | null = stillValid ? stored : null;
      if (!nextId) {
        if (!currentOrg) {
          nextId =
            list.find((w) => w.kind === "personal")?.id || list[0]?.id || null;
        } else {
          nextId =
            list.find((w) => w.kind === "internal")?.id ||
            list.find((w) => w.kind !== "personal")?.id ||
            list[0]?.id ||
            null;
        }
      }
      setWorkspaceId(nextId);
      writeStoredWorkspaceId(nextId);
      window.dispatchEvent(
        new CustomEvent("workspace-changed", { detail: { workspaceId: nextId } })
      );
    } catch (e) {
      setWorkspaces([]);
      toast.error(e instanceof Error ? e.message : "Failed to load workspaces");
    } finally {
      setLoadingWs(false);
    }
  }, [orgReady, currentOrg?.organizationId]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const options: SelectOption[] = useMemo(
    () => workspaces.map((w) => ({ value: w.id, label: w.name })),
    [workspaces]
  );

  const currentName =
    workspaces.find((w) => w.id === workspaceId)?.name ||
    (currentOrg ? "Internal" : "Personal");

  const handleChange = (value: string) => {
    const selected = workspaces.find((w) => w.id === value);
    if (!selected) return;

    // Selecting Personal while in an org → switch JWT to personal
    if (selected.kind === "personal" && currentOrg) {
      void (async () => {
        const res = await authFetch("/auth/switch-personal", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.token) {
          localStorage.setItem("token", data.token);
        }
        writeStoredWorkspaceId(selected.id);
        // Org context refresh happens via page listeners; force org clear via event
        window.dispatchEvent(new CustomEvent("switch-to-personal-workspace"));
        window.location.href = "/dashboard";
      })();
      return;
    }

    setWorkspaceId(value);
    writeStoredWorkspaceId(value);
    window.dispatchEvent(
      new CustomEvent("workspace-changed", { detail: { workspaceId: value } })
    );
    redirectFromProjectRoutesIfNeeded();
    redirectFromRequestFormRoutesIfNeeded();
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreateError("Workspace name is required");
      return;
    }
    if (!currentOrg) {
      setCreateError("Switch into an organization to create workspaces.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res = await authFetch("/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: trimmed,
          organizationId: currentOrg.organizationId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to create workspace");
      const created = data.workspace as WorkspaceOption;
      setWorkspaces((prev) => [...prev, created]);
      setWorkspaceId(created.id);
      writeStoredWorkspaceId(created.id);
      window.dispatchEvent(
        new CustomEvent("workspace-changed", {
          detail: { workspaceId: created.id },
        })
      );
      redirectFromProjectRoutesIfNeeded();
      redirectFromRequestFormRoutesIfNeeded();
      toast.success("Workspace created");
      setShowCreate(false);
      setNewName("");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  if (loading || !orgReady) {
    return (
      <div className="mb-6 px-1" aria-hidden="true">
        <div className="skeleton h-3 w-24 mb-3 mx-1" />
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="skeleton h-4 w-36 mb-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 px-1">
      <div className="flex items-center justify-between px-1 mb-3">
        <p className="text-[15px] font-bold uppercase tracking-[0.2em] text-slate-900 dark:text-slate-100">
          Workspace
        </p>
        <button
          type="button"
          onClick={() => {
            setCreateError("");
            setNewName("");
            setShowCreate(true);
          }}
          aria-label="Create workspace"
          className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          title={
            currentOrg
              ? "Create workspace"
              : "Switch to an organization to create workspaces"
          }
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/15 dark:bg-cyan-400/10 dark:border-cyan-400/20">
        {loadingWs ? (
          <div className="skeleton h-4 w-28" />
        ) : options.length > 1 ? (
          <Select
            value={workspaceId || options[0]?.value || ""}
            onChange={handleChange}
            options={options}
            className="w-full"
            menuClassName="min-w-[220px]"
            triggerClassName={(open) =>
              `flex items-center justify-between gap-2 w-full text-sm text-slate-800 dark:text-slate-100 bg-transparent border-0 p-0 outline-none cursor-pointer transition-colors ${
                open ? "text-cyan-700 dark:text-cyan-300" : ""
              }`
            }
          />
        ) : (
          <p className="text-sm text-slate-800 dark:text-slate-100">
            {currentName}
          </p>
        )}
        {personalWorkspace && !currentOrg && (
          <p className="text-gray-400 text-xs mt-1 dark:text-slate-500">
            Personal
          </p>
        )}
      </div>

      {showCreate && (
        <ModalShell
          onClose={() => !creating && setShowCreate(false)}
          maxWidth="md"
          zIndexClassName="z-[200]"
          className="overflow-hidden isolate bg-white dark:bg-slate-900"
        >
          <div className="px-6 pt-5">
            <ModalHeader
              title="Create workspace"
              onClose={() => !creating && setShowCreate(false)}
              className="mb-0"
            />
          </div>
          {!currentOrg ? (
            <div className="px-6 py-5">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Switch into an organization from the top navigation to create
                additional workspaces. Your Personal workspace is already
                available.
              </p>
            </div>
          ) : (
            <>
              <div className="px-6 py-5">
                <FormLabel>Workspace name</FormLabel>
                <input
                  id="ws-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="field-input"
                  placeholder="e.g. Marketing"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCreate();
                    }
                  }}
                />
                {createError ? (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {createError}
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/80">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={creating}
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={creating || !newName.trim()}
                  onClick={() => void handleCreate()}
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </>
          )}
        </ModalShell>
      )}
    </div>
  );
}
