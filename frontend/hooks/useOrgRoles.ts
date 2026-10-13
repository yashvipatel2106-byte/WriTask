"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchOrganizationRoles,
  formatRoleLabel,
  type RoleDefinition,
} from "@/lib/rbac";

export { formatRoleLabel as getRoleLabel };

export function useOrgRoles(orgId: string | null | undefined) {
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRoles = useCallback(async () => {
    if (!orgId) {
      setRoles([]);
      return;
    }

    setLoading(true);
    try {
      setRoles(await fetchOrganizationRoles(orgId));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  return {
    roles,
    assignableRoles: roles.filter((role) => role.id !== "owner"),
    loading,
    loadRoles,
    getLabel: (roleId: string) => formatRoleLabel(roleId, roles),
  };
}
