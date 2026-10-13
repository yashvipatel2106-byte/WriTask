"use client";

import { useEffect, useState } from "react";
import { Plus, Shield } from "lucide-react";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import FormLabel from "@/components/ui/FormLabel";
import {
  ORG_PERMISSION_ITEMS,
  PROJECT_PERMISSION_ITEMS,
  createOrganizationRole,
  togglePermission,
  viewerDefaults,
  type RoleDefinition,
} from "@/lib/rbac";
import { PermissionGroup } from "@/components/rbac/PermissionEditor";

type CreateRoleDialogProps = {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (role: RoleDefinition) => void;
  roles?: RoleDefinition[];
};

export default function CreateRoleDialog({
  orgId,
  open,
  onClose,
  onCreated,
  roles = [],
}: CreateRoleDialogProps) {
  const [name, setName] = useState("");
  const [orgPerms, setOrgPerms] = useState<string[]>(["org:read"]);
  const [projectPerms, setProjectPerms] = useState<string[]>([
    "project:read",
    "task:read",
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const defaults = viewerDefaults(roles);
    setName("");
    setError("");
    setOrgPerms(defaults.orgPermissions);
    setProjectPerms(defaults.projectPermissions);
  }, [open, roles]);

  if (!open) return null;

  const resetForm = () => {
    const defaults = viewerDefaults(roles);
    setName("");
    setError("");
    setOrgPerms(defaults.orgPermissions);
    setProjectPerms(defaults.projectPermissions);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Role name is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const created = await createOrganizationRole(orgId, {
        name: name.trim(),
        orgPermissions: orgPerms,
        projectPermissions: projectPerms,
      });

      if (!created) {
        setError("Failed to create role");
        return;
      }

      onCreated?.(created);
      resetForm();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      onClose={() => {
        resetForm();
        onClose();
      }}
      maxWidth="3xl"
      zIndexClassName="z-[60]"
      className="max-h-[90vh] flex flex-col overflow-hidden"
    >
      <div className="px-6 pt-6 pb-4 border-b border-slate-200 shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center shrink-0">
            <Shield size={18} className="text-cyan-600" />
          </div>
          <div className="flex-1 min-w-0">
            <ModalHeader
              title="Create new role"
              subtitle="Name the role and set the default organization and project permissions members will receive."
              onClose={() => {
                resetForm();
                onClose();
              }}
              className="mb-0"
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
        <div>
          <FormLabel>Role name</FormLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Content Editor"
            className="field-input"
            autoFocus
          />
        </div>

        <PermissionGroup
          title="Organization permissions"
          items={ORG_PERMISSION_ITEMS}
          selected={orgPerms}
          onToggle={(key, enabled) =>
            setOrgPerms((prev) => togglePermission(prev, key, enabled))
          }
        />

        <PermissionGroup
          title="Project & task permissions"
          items={PROJECT_PERMISSION_ITEMS}
          selected={projectPerms}
          onToggle={(key, enabled) =>
            setProjectPerms((prev) => togglePermission(prev, key, enabled))
          }
        />

        {error && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </p>
        )}
      </div>

      <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/80 flex justify-end gap-3 shrink-0 dark:border-slate-800 dark:bg-slate-800/60">
        <button
          type="button"
          onClick={() => {
            resetForm();
            onClose();
          }}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !name.trim()}
          className="btn btn-primary"
        >
          <Plus size={14} />
          {saving ? "Creating…" : "Create role"}
        </button>
      </div>
    </ModalShell>
  );
}
