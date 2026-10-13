import type { StoredUser } from "@/lib/validation/authStorage";
import { getStoredUser, setStoredUser } from "@/lib/validation/authStorage";
import { writeStoredOrgId } from "@/lib/orgStorage";
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
};

/**
 * Shared "finish signing the user in" step for every auth entry point
 * (password login, Google Sign-In, ...): persist the session, then send
 * them wherever they were actually headed — a pending org/project
 * invitation if one exists, otherwise dashboard.
 * Starter wizard is only entered from the home "Get started" CTA.
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

  if (data.organizationId) {
    writeStoredOrgId(data.organizationId);
  } else {
    localStorage.removeItem("organizationId");
  }

  const pendingInvite = localStorage.getItem("pendingInviteToken");
  const pendingProjectInvite = localStorage.getItem("pendingProjectInviteToken");

  window.location.href = pendingProjectInvite
    ? `/invitations/project?token=${pendingProjectInvite}`
    : pendingInvite
      ? `/invitations/accept?token=${pendingInvite}`
      : "/dashboard";
}
