"use client";

import { useMemo } from "react";
import { useOrganization } from "@/components/context/organizationContext";
import Select, { type SelectOption } from "@/components/ui/Select";
import { formatRoleLabel } from "@/lib/rbac";

export default function WorkspaceHeader() {
  const {
    access,
    currentOrg,
    personalWorkspace,
    loading,
    orgReady,
    setCurrentOrgId,
  } = useOrganization();

  const options = useMemo(() => {
    const items: SelectOption[] = [];
    if (personalWorkspace) {
      items.push({ value: "personal", label: "Personal Workspace" });
    }
    access?.organizations.forEach((org) => {
      items.push({ value: org.organizationId, label: org.name });
    });
    return items;
  }, [access?.organizations, personalWorkspace]);

  if (loading || !orgReady) {
    return (
      <div className="mb-6 px-1" aria-hidden="true">
        <div className="skeleton h-3 w-24 mb-3 mx-1" />
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="skeleton h-4 w-36 mb-2" />
          <div className="skeleton h-3 w-20" />
        </div>
      </div>
    );
  }

  const workspaceName = currentOrg
    ? currentOrg.name
    : personalWorkspace
      ? "Personal Workspace"
      : "Workspace";

  const roleLabel = currentOrg ? formatRoleLabel(currentOrg.role) : null;
  const currentValue = currentOrg?.organizationId ?? "personal";
  const canSwitch = options.length > 1;

  return (
    <div className="mb-6 px-1">
      <p className="px-1 mb-3 text-[15px] font-bold uppercase tracking-[0.2em] text-slate-900 dark:text-slate-100">
        Workspace
      </p>
      <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/15 dark:bg-cyan-400/10 dark:border-cyan-400/20">
        {canSwitch ? (
          <Select
            value={currentValue}
            onChange={(value) =>
              setCurrentOrgId(value === "personal" ? null : value)
            }
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
          <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
            {workspaceName}
          </p>
        )}
        {roleLabel && (
          <p className="text-gray-400 text-xs mt-1 capitalize dark:text-slate-500">
            {roleLabel}
          </p>
        )}
      </div>
    </div>
  );
}
        