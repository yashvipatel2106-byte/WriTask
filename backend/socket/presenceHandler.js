const EVENTS = require("./events");
const User = require("../models/User");
const presenceService = require("../utils/presenceService");

/*
 * Registers presence tracking for one socket. No-ops entirely for a
 * socket that didn't authenticate (socket.data.userId unset) — see
 * socket.js's soft-auth middleware — so nothing about presence can be
 * spoofed by a client claiming to be a given user.
 */
function registerPresenceHandlers(io, socket) {
  const userId = socket.data?.userId;
  if (!userId) return;

  socket.join(`user:${userId}`);

  presenceService
    .connectSocket(userId, socket.id)
    .then(() => presenceService.recomputeAndBroadcast(io, User, userId))
    .catch((error) =>
      console.error("[presence] connect handling error:", error.message)
    );

  socket.on(EVENTS.PRESENCE_HEARTBEAT, () => {
    presenceService
      .touchActivity(userId)
      .then(() => presenceService.recomputeAndBroadcast(io, User, userId))
      .catch((error) =>
        console.error("[presence] heartbeat handling error:", error.message)
      );
  });

  socket.on("disconnect", () => {
    presenceService
      .disconnectSocket(userId, socket.id)
      .then(() => presenceService.recomputeAndBroadcast(io, User, userId))
      .catch((error) =>
        console.error("[presence] disconnect handling error:", error.message)
      );
  });
}

module.exports = { registerPresenceHandlers };
