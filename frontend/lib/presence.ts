import { authFetch } from "@/lib/validation/authFetch";

export type StatusMode = "automatic" | "manual";

/**
 * Every value a status badge can render. "available"/"offline" are also
 * what automatic mode resolves to (online -> available, offline ->
 * offline) — mirrors backend/utils/statusLogic.js, keep both in sync.
 */
export type ManualStatus =
  | "available"
  | "busy"
  | "dnd"
  | "brb"
  | "away"
  | "offline";

export type EffectiveStatus = {
  userId: string;
  statusMode: StatusMode;
  manualStatus: ManualStatus | null;
  statusExpiresAt: string | null;
  presence: "online" | "offline";
  effective: ManualStatus;
  /** Whether the status badge is shown to other users at all. */
  visible: boolean;
};

export type DurationKey = "1h" | "4h" | "today" | "week" | "custom";

export const MANUAL_STATUS_OPTIONS: {
  value: ManualStatus;
  label: string;
}[] = [
  { value: "available", label: "Available" },
  { value: "busy", label: "Busy" },
  { value: "dnd", label: "Do not disturb" },
  { value: "brb", label: "Be right back" },
  { value: "away", label: "Appear away" },
  { value: "offline", label: "Appear offline" },
];

export const DURATION_OPTIONS: { value: DurationKey; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "custom", label: "Custom" },
];

/** Colors/labels for each displayed status — the small circular badge look. */
export const STATUS_META: Record<
  ManualStatus,
  { label: string; dotClass: string; icon: "check" | "solid" | "minus" | "clock" | "moon" | "x" }
> = {
  available: {
    label: "Available",
    dotClass: "bg-emerald-500",
    icon: "check",
  },
  busy: {
    label: "Busy",
    dotClass: "bg-red-500",
    icon: "solid",
  },
  dnd: {
    label: "Do not disturb",
    dotClass: "bg-red-600",
    icon: "minus",
  },
  brb: {
    label: "Be right back",
    dotClass: "bg-amber-500",
    icon: "clock",
  },
  away: {
    label: "Appear away",
    dotClass: "bg-amber-500",
    icon: "moon",
  },
  offline: {
    label: "Offline",
    dotClass: "bg-slate-400 dark:bg-slate-500",
    icon: "x",
  },
};

export async function fetchMyStatus(): Promise<EffectiveStatus | null> {
  try {
    const res = await authFetch("/presence/me");
    if (!res.ok) return null;
    return (await res.json()) as EffectiveStatus;
  } catch {
    return null;
  }
}

export async function setManualStatus(
  manualStatus: ManualStatus,
  duration?: DurationKey | "none",
  expiresAt?: string
): Promise<EffectiveStatus | null> {
  try {
    const res = await authFetch("/presence/me", {
      method: "PATCH",
      body: JSON.stringify({
        manualStatus,
        duration: duration || "none",
        expiresAt,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as EffectiveStatus;
  } catch {
    return null;
  }
}

export async function resetStatus(): Promise<EffectiveStatus | null> {
  try {
    const res = await authFetch("/presence/me/reset", { method: "POST" });
    if (!res.ok) return null;
    return (await res.json()) as EffectiveStatus;
  } catch {
    return null;
  }
}

/** Shows/hides the status badge from everyone else — independent of statusMode. */
export async function setStatusVisibility(
  visible: boolean
): Promise<EffectiveStatus | null> {
  try {
    const res = await authFetch("/presence/me/visibility", {
      method: "PATCH",
      body: JSON.stringify({ visible }),
    });
    if (!res.ok) return null;
    return (await res.json()) as EffectiveStatus;
  } catch {
    return null;
  }
}

/**
 * Bulk lookup — returns a map of userId -> effective status string. A
 * user who has turned their status off simply has no entry.
 */
export async function fetchPresenceBulk(
  userIds: string[]
): Promise<Record<string, ManualStatus>> {
  if (userIds.length === 0) return {};

  try {
    const res = await authFetch(
      `/presence?userIds=${encodeURIComponent(userIds.join(","))}`
    );
    if (!res.ok) return {};
    return (await res.json()) as Record<string, ManualStatus>;
  } catch {
    return {};
  }
}
