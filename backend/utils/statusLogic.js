/*
 * Single source of truth for turning (manual status preference, raw
 * real-time presence) into the status the UI should actually display.
 * Mirrored on the frontend in lib/presence.ts — keep both in sync if
 * this logic ever changes.
 *
 * Effective status values: "available" | "busy" | "dnd" | "brb" |
 * "away" | "offline". These are also the valid `manualStatus` values
 * (plus null, meaning "no manual status set").
 */

const MANUAL_STATUS_VALUES = [
  "available",
  "busy",
  "dnd",
  "brb",
  "away",
  "offline",
];

/** True when a manual status was set with a duration that has passed. */
function isManualStatusExpired(user, now = new Date()) {
  return (
    user.statusMode === "manual" &&
    !!user.statusExpiresAt &&
    user.statusExpiresAt.getTime() <= now.getTime()
  );
}

/*
 * Combines the user's persisted preference with their current raw
 * real-time presence ("online" | "offline") into what should be shown.
 *
 * IF statusMode === "manual" (and not expired): show manualStatus.
 * IF statusMode === "automatic" (or the manual status just expired):
 *   online  -> "available"
 *   offline -> "offline"
 */
function computeEffectiveStatus(user, rawPresence) {
  const expired = isManualStatusExpired(user);
  // Opt-in field — missing/undefined (existing users before this field
  // existed) must default to visible, only an explicit false hides it.
  const visible = user.statusVisible !== false;

  if (user.statusMode === "manual" && user.manualStatus && !expired) {
    return {
      statusMode: "manual",
      manualStatus: user.manualStatus,
      statusExpiresAt: user.statusExpiresAt || null,
      presence: rawPresence,
      effective: user.manualStatus,
      visible,
    };
  }

  return {
    statusMode: "automatic",
    manualStatus: null,
    statusExpiresAt: null,
    presence: rawPresence,
    effective: rawPresence === "online" ? "available" : "offline",
    visible,
  };
}

module.exports = {
  MANUAL_STATUS_VALUES,
  isManualStatusExpired,
  computeEffectiveStatus,
};
