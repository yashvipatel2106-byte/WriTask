export type StoredUser = {
  id?: string;
  username?: string;
  email?: string;
  avatarColor?: string;
  systemRole?: string;
  colorTheme?: string | null;
};

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem("user");
  if (!raw || raw === "undefined" || raw === "null") return null;

  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    localStorage.removeItem("user");
    return null;
  }
}

export function setStoredUser(user: StoredUser) {
  localStorage.setItem("user", JSON.stringify(user));
}

import { clearStoredOrgId } from "@/lib/orgStorage";

export function clearAuthStorage() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("userId");
  clearStoredOrgId();
}
