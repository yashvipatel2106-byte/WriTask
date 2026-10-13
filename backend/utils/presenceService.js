/*
 * Real-time presence: tracks connected sockets + last activity per user
 * (via presenceStore) and derives a simple "online" | "offline" raw
 * presence value. This is deliberately separate from manual status —
 * see statusLogic.js for how the two are combined into what the UI
 * actually shows.
 */
const store = require("./presenceStore");
const { computeEffectiveStatus } = require("./statusLogic");
const EVENTS = require("../socket/events");

const INACTIVITY_TIMEOUT_MS =
  Number(process.env.PRESENCE_INACTIVITY_TIMEOUT_MS) || 5 * 60 * 1000; // 5 minutes

async function connectSocket(userId, socketId) {
  await store.addSocket(userId, socketId);
  await store.touchActivity(userId);
}

/** Returns the number of sockets still open for this user after removal. */
async function disconnectSocket(userId, socketId) {
  return store.removeSocket(userId, socketId);
}

async function touchActivity(userId) {
  await store.touchActivity(userId);
}

/** Raw real-time presence: "online" or "offline". No manual status involved. */
async function getRawPresence(userId) {
  const [socketCount, lastActivity] = await Promise.all([
    store.getSocketCount(userId),
    store.getLastActivity(userId),
  ]);

  if (socketCount <= 0) return "offline";
  if (!lastActivity) return "offline";
  if (Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) return "offline";

  return "online";
}

/*
 * Recomputes a user's effective status and, if it changed since the
 * last broadcast, emits it to every connected client. Used both from
 * socket connect/disconnect/heartbeat handlers and from the periodic
 * sweep job (for idle timeouts / manual-status expiry that happen
 * without any socket event firing).
 *
 * Broadcasts globally (io.emit) rather than to a scoped audience —
 * simplest correct option given there's no existing "who can see this
 * user" list to reuse; any connected client can look the user up by id.
 */
async function recomputeAndBroadcast(io, User, userId) {
  const user = await User.findById(userId).select(
    "statusMode manualStatus statusExpiresAt statusVisible"
  );
  if (!user) return null;

  const rawPresence = await getRawPresence(userId);
  const effective = computeEffectiveStatus(user, rawPresence);

  // null means "hidden" — other clients clear the badge for this user.
  const broadcastStatus = effective.visible ? effective.effective : null;

  const previous = await store.getLastBroadcastStatus(userId);
  if (previous !== broadcastStatus) {
    await store.setLastBroadcastStatus(userId, broadcastStatus);

    try {
      io.emit(EVENTS.PRESENCE_UPDATE, {
        userId: userId.toString(),
        status: broadcastStatus,
        statusMode: effective.statusMode,
      });
    } catch (error) {
      console.error("[presence] broadcast error:", error.message);
    }
  }

  return effective;
}

module.exports = {
  INACTIVITY_TIMEOUT_MS,
  connectSocket,
  disconnectSocket,
  touchActivity,
  getRawPresence,
  recomputeAndBroadcast,
  getTrackedUserIds: store.getTrackedUserIds,
  getLastBroadcastStatus: store.getLastBroadcastStatus,
  setLastBroadcastStatus: store.setLastBroadcastStatus,
};
