// Deterministic solid avatar color per user, based on a stable id/name hash.
// Same user always gets the same color; different users get different colors.
export const AVATAR_COLORS = [
  "bg-purple-500", "bg-green-500", "bg-orange-500", "bg-pink-500", "bg-teal-500",
  "bg-blue-500", "bg-red-500", "bg-indigo-500", "bg-yellow-500", "bg-cyan-500",
  "bg-rose-500", "bg-amber-500", "bg-lime-600", "bg-violet-500", "bg-emerald-500",
  "bg-sky-500", "bg-fuchsia-500", "bg-orange-600", "bg-pink-600", "bg-yellow-600",
];

export function avatarColor(seed: string) {
  const str = seed ?? "";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatarInitials(name: string) {
  const parts = (name ?? "").trim().split(" ");
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

/** Resolve the background for an avatar chip: a user's persisted custom
 * color (hex or CSS gradient, saved via Edit Profile) when set, otherwise
 * the deterministic hash-based fallback. Spread `style` and append
 * `className` so existing avatar markup only needs a two-line change. */
export function avatarBg(customColor: string | null | undefined, seed: string) {
  if (customColor) {
    return { className: "", style: { background: customColor } as const };
  }
  return { className: avatarColor(seed), style: undefined };
}
