import type { StoredUser } from "@/lib/validation/authStorage";
import { getStoredUser, setStoredUser } from "@/lib/validation/authStorage";
import { writeStoredOrgId, clearStoredProjectId } from "@/lib/orgStorage";
import { clearStoredWorkspaceId } from "@/lib/workspaceStorage";
import type { UserProfile } from "@/store/types/auth";

export function normalizeUserProfile(data: Record<string, unknown>): UserProfile {
  const id = String(data._id ?? data.id ?? "");
  return {
    _id: id,
    username: String(data.username ?? ""),
    email: String(data.email ?? ""),
    phone: data.phone ? String(data.phone) : "",
    designation: data.designation ? String(data.designation) : "",
    department: data.department ? String(data.department) : "",
    location: data.location ? String(data.location) : "",
    bio: data.bio ? String(data.bio) : "",
    avatarColor: data.avatarColor ? String(data.avatarColor) : "",
    systemRole: data.systemRole ? String(data.systemRole) : undefined,
    colorTheme: typeof data.colorTheme === "string"
      ? data.colorTheme
      : (data.settings as { colorTheme?: string } | undefined)?.colorTheme ?? null,
    profileMeta: data.profileMeta as UserProfile["profileMeta"],
  };
}

export function profileToStoredUser(user: UserProfile): StoredUser {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    systemRole: user.systemRole,
    avatarColor: user.avatarColor,
    colorTheme: user.colorTheme ?? null,
  };
}

export function storedUserToProfile(stored: StoredUser | null): UserProfile | null {
  if (!stored?.id && !stored?.username && !stored?.email) return null;

  return {
    _id: stored.id || "",
    username: stored.username || "",
    email: stored.email || "",
    systemRole: stored.systemRole,
    avatarColor: stored.avatarColor || "",
    colorTheme: stored.colorTheme ?? null,
  };
}

export function readHydratedUser(): UserProfile | null {
  return storedUserToProfile(getStoredUser());
}

export function persistUserProfile(user: UserProfile) {
  setStoredUser(profileToStoredUser(user));
  if (user._id) {
    localStorage.setItem("userId", user._id);
  }
}

type LoginSuccessData = {
  token: string;
  user: Record<string, unknown>;
  organizationId?: string | null;
  needsOnboarding?: boolean;
  next?: string | null;
};

/**
 * Shared "finish signing the user in" step for every auth entry point
 * (password login, Google Sign-In, ...): persist the session, open the
 * organization returned by the server when present, otherwise Personal
 * Workspace, then redirect.
 */
export function completeLoginRedirect(data: LoginSuccessData) {
  localStorage.setItem("token", data.token);
  const profile = normalizeUserProfile(data.user);
  persistUserProfile(profile);
  try {
    const stored = {
      ...profileToStoredUser(profile),
      hasPassword:
        typeof data.user.hasPassword === "boolean"
          ? data.user.hasPassword
          : true,
    };
    localStorage.setItem("user", JSON.stringify(stored));
  } catch {
    /* ignore */
  }

  const orgId = data.organizationId || null;
  writeStoredOrgId(orgId);
  clearStoredProjectId();
  if (orgId) {
    clearStoredWorkspaceId();
  }

  const pendingInvite = localStorage.getItem("pendingInviteToken");
  const pendingProjectInvite = localStorage.getItem("pendingProjectInviteToken");
  const safeNext =
    data.next && data.next.startsWith("/") && !data.next.startsWith("//")
      ? data.next
      : null;

  window.location.href = pendingProjectInvite
    ? `/invitations/project?token=${pendingProjectInvite}`
    : pendingInvite
      ? `/invitations/accept?token=${pendingInvite}`
      : safeNext || "/dashboard";
}
