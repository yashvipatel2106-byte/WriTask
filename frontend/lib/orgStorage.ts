/** Canonical localStorage key for the active organization */
export const ORG_STORAGE_KEY = "currentOrgId";

const LEGACY_ORG_KEYS = ["organizationId", "orgId"] as const;

/** Read saved org id (migrates legacy keys into `currentOrgId`). */
export function readStoredOrgId(): string | null {
  if (typeof window === "undefined") return null;

  const primary = localStorage.getItem(ORG_STORAGE_KEY);
  if (primary) return primary;

  for (const key of LEGACY_ORG_KEYS) {
    const legacy = localStorage.getItem(key);
    if (legacy) {
      localStorage.setItem(ORG_STORAGE_KEY, legacy);
      localStorage.removeItem(key);
      return legacy;
    }
  }

  return null;
}

export function writeStoredOrgId(orgId: string | null) {
  if (typeof window === "undefined") return;

  if (orgId) {
    localStorage.setItem(ORG_STORAGE_KEY, orgId);
  } else {
    localStorage.removeItem(ORG_STORAGE_KEY);
  }

  for (const key of LEGACY_ORG_KEYS) {
    localStorage.removeItem(key);
  }
}

export function clearStoredOrgId() {
  writeStoredOrgId(null);
}

/** Project id cached for workload/timeline views — must not leak across orgs */
export const PROJECT_STORAGE_KEY = "currentProjectId";

export function clearStoredProjectId() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PROJECT_STORAGE_KEY);
}
