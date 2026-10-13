"use client";

import { Plus } from "lucide-react";
import Select from "@/components/ui/Select";
import FormLabel from "@/components/ui/FormLabel";
import type { RoleDefinition } from "@/lib/rbac";

type OrgRoleSelectProps = {
  roles: RoleDefinition[];
  value: string;
  onChange: (roleId: string) => void;
  disabled?: boolean;
  excludeOwner?: boolean;
  canCreateRole?: boolean;
  onRequestCreateRole?: () => void;
  label?: string;
  className?: string;
  triggerClassName?: string | ((open: boolean) => string);
  menuClassName?: string;
  useNativeSelect?: boolean;
};

export default function OrgRoleSelect({
  roles,
  value,
  onChange,
  disabled = false,
  excludeOwner = true,
  canCreateRole = false,
  onRequestCreateRole,
  label = "Role",
  className = "",
  triggerClassName,
  menuClassName,
  useNativeSelect = false,
}: OrgRoleSelectProps) {
  const options = roles
    .filter((role) => !excludeOwner || role.id !== "owner")
    .map((role) => ({ value: role.id, label: role.name }));

  return (
    <div className={className}>
      {label && <FormLabel>{label}</FormLabel>}
      {useNativeSelect ? (
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="field-input"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Select
          value={value}
          onChange={onChange}
          options={options}
          disabled={disabled || options.length === 0}
          className="w-full"
          triggerClassName={triggerClassName}
          menuClassName={menuClassName}
        />
      )}

      {canCreateRole && onRequestCreateRole && (
        <button
          type="button"
          onClick={onRequestCreateRole}
          disabled={disabled}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-600 transition-colors disabled:opacity-50"
        >
          <Plus size={14} />
          Create new role
        </button>
      )}
    </div>
  );
}
