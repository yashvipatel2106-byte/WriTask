"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import { authFetch } from "@/lib/validation/authFetch";
import { confirmDialog } from "@/components/ui/confirm";
import {
  ORG_PERMISSION_ITEMS,
  PROJECT_PERMISSION_ITEMS,
  createOrganizationRole,
  togglePermission,
  viewerDefaults,
  type RoleDefinition,
} from "@/lib/rbac";
import { PermissionGroup } from "@/components/rbac/PermissionEditor";
import { ArrowLeft, Plus, Save, Trash2, RefreshCw } from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const { canViewAdmin } = useOrgPermission();
  const { currentOrg, personalWorkspace, refreshAccess } = useOrganization();

  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [draftOrgPerms, setDraftOrgPerms] = useState<string[]>([]);
  const [draftProjectPerms, setDraftProjectPerms] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const orgId = currentOrg?.organizationId;
  const selectedRole = roles.find((role) => role.id === selectedRoleId) || null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rolesRes = await authFetch(`/organizations/${orgId}/roles`);
      if (rolesRes.ok) {
        const roleData = await rolesRes.json();
        const list = Array.isArray(roleData) ? roleData : [];
        setRoles(list);
        setSelectedRoleId((current) => current || list[0]?.id || null);
      }
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    if (!canViewAdmin) {
      router.push("/dashboard");
      return;
    }
    loadData();
  }, [router, canViewAdmin, loadData]);

  useEffect(() => {
  if (!selectedRole) return;

  setDraftOrgPerms(selectedRole.orgPermissions || []);

  // Owner should have every project/task permission enabled by default
  if (selectedRole.id === "owner") {
    setDraftProjectPerms(
      PROJECT_PERMISSION_ITEMS.map((permission) => permission.key)
    );
  } else {
    setDraftProjectPerms(selectedRole.projectPermissions || []);
  }
}, [selectedRole]);

  const saveRole = async () => {
    if (!orgId || !selectedRole) return;
    setSaving(true);
    try {
      const res = await authFetch(
        `/organizations/${orgId}/roles/${selectedRole.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            orgPermissions: draftOrgPerms,
            projectPermissions: draftProjectPerms,
          }),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        setRoles((prev) =>
          prev.map((role) => (role.id === updated.id ? updated : role))
        );
        await refreshAccess();
        showToast("Role permissions saved");
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || "Failed to save role");
      }
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    if (!orgId || !newRoleName.trim()) return;
    setSaving(true);
    try {
      const created = await createOrganizationRole(orgId, {
        name: newRoleName.trim(),
        ...viewerDefaults(roles),
      });
      if (created) {
        setRoles((prev) => [...prev, created]);
        setSelectedRoleId(created.id);
        setNewRoleName("");
        showToast(`Role "${created.name}" created`);
      } else {
        showToast("Failed to create role");
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (roleId: string) => {
    if (!orgId) return;
    const role = roles.find((item) => item.id === roleId);
    if (!role || role.isBuiltin) return;
    const ok = await confirmDialog({
      title: `Delete role "${role.name}"?`,
      description: "Members using this role may lose custom permissions.",
      confirmLabel: "Delete role",
      variant: "danger",
    });
    if (!ok) return;

    setSaving(true);
    try {
      const res = await authFetch(`/organizations/${orgId}/roles/${roleId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRoles((prev) => prev.filter((item) => item.id !== roleId));
        setSelectedRoleId(roles[0]?.id || null);
        showToast("Role deleted");
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || "Failed to delete role");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] px-8 py-7 dark:bg-[#0B1120]">
          <div className="max-w-6xl mx-auto">
            <Link
              href="/settings/organization"
              className="inline-flex items-center gap-2 text-sm text-cyan-700/80 hover:text-cyan-600 mb-6 dark:text-cyan-400/80 dark:hover:text-cyan-300"
            >
              <ArrowLeft size={16} />
              Back to Organization Settings
            </Link>

            <div className="mb-8">
              <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">Administration</h1>
              <p className="text-slate-500 mt-2 dark:text-slate-400">
                Manage organization roles and default permissions. Member
                access customization now lives on the Team Members page.
              </p>
            </div>

            {personalWorkspace && !orgId && (
              <div className="dashboard-widget text-slate-600 dark:text-slate-300">
                <p className="font-medium text-slate-900 mb-2 dark:text-slate-100">Personal workspace</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Role-based access is configured per organization. Create an
                  organization to define roles, assign viewers with read-only
                  access, and customize permissions from here.
                </p>
              </div>
            )}

            {orgId && (
              loading ? (
                <div className="dashboard-widget text-center py-16 text-slate-400 dark:text-slate-500">
                  Loading administration…
                </div>
              ) : (
                <div className="grid items-start lg:grid-cols-[260px_1fr] gap-6">
                  <div className="dashboard-widget space-y-3">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Roles</h3>
                    {roles.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setSelectedRoleId(role.id)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-sm transition cursor-pointer ${
                          selectedRoleId === role.id
                            ? "bg-cyan-50 text-cyan-700 border border-cyan-300 dark:bg-cyan-400/10 dark:text-cyan-400 dark:border-cyan-500/30"
                            : "text-slate-600 hover:bg-slate-50 border border-transparent dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span>{role.name}</span>
                        {role.isBuiltin && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">Built-in</span>
                        )}
                      </button>
                    ))}

                    <div className="pt-3 border-t border-slate-200 space-y-2 dark:border-slate-800">
                      <input
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="New role name"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => void createRole()}
                        disabled={!newRoleName.trim() || saving}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm bg-cyan-50 text-cyan-700 border border-cyan-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed dark:bg-cyan-400/10 dark:text-cyan-400 dark:border-cyan-500/30"
                      >
                        <Plus size={14} />
                        Create role
                      </button>
                    </div>
                  </div>

                  {selectedRole && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{selectedRole.name}</h2>
                          <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
                            Default permissions applied when this role is assigned.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={loadData}
                            disabled={loading}
                            title="Refresh"
                            aria-label="Refresh"
                            className="flex items-center justify-center p-2 rounded-xl text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 dark:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                          >
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                          </button>
                          {!selectedRole.isBuiltin && (
                            <button
                              type="button"
                              onClick={() => deleteRole(selectedRole.id)}
                              className="btn btn-danger btn-sm"
                            >
                              <Trash2 size={14} />
                              Delete role
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={saveRole}
                            disabled={saving}
                            className="btn btn-primary btn-sm"
                          >
                            <Save size={14} />
                            {saving ? "Saving..." : "Save role"}
                          </button>
                        </div>
                      </div>

                      <PermissionGroup
                        title="Organization permissions"
                        items={ORG_PERMISSION_ITEMS}
                        selected={draftOrgPerms}
                        onToggle={(key, enabled) =>
                          setDraftOrgPerms((prev) =>
                            togglePermission(prev, key, enabled)
                          )
                        }
                        onSelectAll={() =>
                          setDraftOrgPerms(ORG_PERMISSION_ITEMS.map((item) => item.key))
                        }
                      />

                      <PermissionGroup
                        title="Project & task permissions"
                        items={PROJECT_PERMISSION_ITEMS}
                        selected={draftProjectPerms}
                        onToggle={(key, enabled) =>
                          setDraftProjectPerms((prev) =>
                            togglePermission(prev, key, enabled)
                          )
                        }
                        onSelectAll={() =>
                          setDraftProjectPerms(PROJECT_PERMISSION_ITEMS.map((item) => item.key))
                        }
                      />
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-cyan-700 shadow-xl dark:bg-slate-900 dark:border-slate-800 dark:text-cyan-400">
          {toast}
        </div>
      )}
    </div>
  );
}
