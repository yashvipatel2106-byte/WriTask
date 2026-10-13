"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import { authFetch } from "@/lib/validation/authFetch";
import { toast } from "@/components/ui/toast";
import {
  ORG_PERMISSION_ITEMS,
  PROJECT_PERMISSION_ITEMS,
  togglePermission,
  type RoleDefinition,
} from "@/lib/rbac";
import { PermissionGroup, TickCheckbox } from "@/components/rbac/PermissionEditor";

type OrgMember = {
  user: { _id: string; username: string; email: string } | null;
  role: string;
  permissionOverrides?: {
    useCustom?: boolean;
    orgPermissions?: string[];
    projectPermissions?: string[];
  };
};

/**
 * Per-member permission-override editor — lets an org admin customize one
 * member's org/project permissions away from their role's defaults.
 * Self-contained: fetches the org's member list itself to seed from the
 * current role/overrides, so it can be dropped in anywhere a memberId +
 * the org's role list are known (originally lived inline in the
 * Administration page; moved here so it's usable from the Team Members
 * page too).
 */
export default function MemberPermissionsDialog({
  orgId,
  memberId,
  memberName,
  roles,
  onClose,
  onSaved,
}: {
  orgId: string;
  memberId: string;
  memberName: string;
  roles: RoleDefinition[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberRole, setMemberRole] = useState("");
  const [memberCustom, setMemberCustom] = useState(false);
  const [memberOrgPerms, setMemberOrgPerms] = useState<string[]>([]);
  const [memberProjectPerms, setMemberProjectPerms] = useState<string[]>([]);

  const seedFromRole = (roleId: string) => {
    const role = roles.find((item) => item.id === roleId);
    if (!role) return;
    setMemberOrgPerms([...(role.orgPermissions || [])]);
    setMemberProjectPerms([...(role.projectPermissions || [])]);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/organizations/${orgId}/members`);
        if (!res.ok || cancelled) return;
        const list: OrgMember[] = await res.json();
        const member = list.find((m) => m.user?._id === memberId);
        if (!member || cancelled) return;

        const role = roles.find((item) => item.id === member.role);
        const useCustom = !!member.permissionOverrides?.useCustom;
        setMemberRole(member.role);
        setMemberCustom(useCustom);
        setMemberOrgPerms(
          useCustom
            ? [...(member.permissionOverrides?.orgPermissions || [])]
            : [...(role?.orgPermissions || [])]
        );
        setMemberProjectPerms(
          useCustom
            ? [...(member.permissionOverrides?.projectPermissions || [])]
            : [...(role?.projectPermissions || [])]
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, memberId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch(
        `/organizations/${orgId}/members/${memberId}/role`,
        {
          method: "PATCH",
          body: JSON.stringify({
            role: memberRole,
            useCustomPermissions: memberCustom,
            orgPermissions: memberOrgPerms,
            projectPermissions: memberProjectPerms,
          }),
        }
      );
      if (res.ok) {
        toast.success("Member permissions updated");
        onSaved?.();
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Failed to update member");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      maxWidth="3xl"
      zIndexClassName="z-[60]"
      className="max-h-[90vh] flex flex-col overflow-hidden"
    >
      <div className="px-6 pt-6 pb-4 border-b border-slate-200 shrink-0 dark:border-slate-800">
        <ModalHeader
          title="Edit member access"
          subtitle={`${memberName} · assign a role, then customize permissions if needed.`}
          onClose={onClose}
          className="mb-0"
        />
      </div>

      {loading ? (
        <div className="px-6 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Loading…
        </div>
      ) : (
        <>
          <div className="px-6 py-5 overflow-y-auto flex-1">
            <div className="mb-4">
              <label className="block text-xs text-slate-500 mb-1.5 dark:text-slate-400">Role</label>
              <p className="field-input bg-slate-50 text-slate-700 cursor-default dark:bg-slate-800 dark:text-slate-200">
                {roles.find((item) => item.id === memberRole)?.name || memberRole}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Change this member&apos;s role from the row&apos;s Edit Member action.
              </p>
            </div>

            <div className="mb-4">
              <TickCheckbox
                label="Customize permissions for this member"
                checked={memberCustom}
                onChange={(enabled) => {
                  setMemberCustom(enabled);
                  // Always seed from the member's role so Custom starts from
                  // (or reverts to) the latest role-based permissions
                  seedFromRole(memberRole);
                }}
              />
              {!memberCustom && (
                <p className="text-xs text-slate-400 mt-2">
                  Showing permissions from the{" "}
                  <span className="text-slate-600 dark:text-slate-300">
                    {roles.find((item) => item.id === memberRole)?.name || memberRole}
                  </span>{" "}
                  role. Enable customize to override for this member only.
                </p>
              )}
            </div>

            <div className="space-y-4">
              <PermissionGroup
                title="Organization permissions"
                items={ORG_PERMISSION_ITEMS}
                selected={memberOrgPerms}
                disabled={!memberCustom}
                onToggle={(key, enabled) =>
                  setMemberOrgPerms((prev) => togglePermission(prev, key, enabled))
                }
                onSelectAll={() =>
                  setMemberOrgPerms(ORG_PERMISSION_ITEMS.map((item) => item.key))
                }
              />
              <PermissionGroup
                title="Project & task permissions"
                items={PROJECT_PERMISSION_ITEMS}
                selected={memberProjectPerms}
                disabled={!memberCustom}
                onToggle={(key, enabled) =>
                  setMemberProjectPerms((prev) =>
                    togglePermission(prev, key, enabled)
                  )
                }
                onSelectAll={() =>
                  setMemberProjectPerms(PROJECT_PERMISSION_ITEMS.map((item) => item.key))
                }
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/80 flex justify-end gap-2 shrink-0 dark:border-slate-800 dark:bg-slate-800/60">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn btn-primary"
            >
              <Check size={14} />
              {saving ? "Saving..." : "Save member"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}
