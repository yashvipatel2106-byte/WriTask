import { useState, useEffect } from "react";
import { authFetch } from "@/lib/validation/authFetch";
import { hasPermission, type ProjectRole } from "@/lib/rbac";

export type { ProjectRole };

export function useRole(projectId: string | null) {
  const [role, setRole] = useState<ProjectRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    const fetchRole = async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setRole(data.myRole ?? null);
          setPermissions(
            Array.isArray(data.myPermissions) ? data.myPermissions : []
          );
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    void fetchRole();
  }, [projectId]);

  const can = (action: string): boolean => hasPermission(permissions, action);

  return { role, loading, can, permissions };
}
