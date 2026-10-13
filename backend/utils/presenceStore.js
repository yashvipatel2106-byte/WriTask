/*
 * Low-level presence storage: which sockets a user currently has open,
 * and when they were last active. Backed by Redis when available
 * (`REDIS_URL` set and connected), otherwise an in-process Map so
 * presence still works on a single dev instance with no Redis running.
 *
 * Key convention (Redis):
 *   presence:sockets:<userId>   — SET of connected socket ids
 *   presence:activity:<userId>  — STRING, last-activity epoch ms (with TTL)
 *
 * MongoDB is never touched here — this is purely ephemeral, matching
 * the existing project convention of keeping hot/volatile data out of
 * the primary database.
 */
const { getRedis, isRedisReady } = require("../config/redis");

// Generous TTL on the activity key — just housekeeping so keys for users
// who never come back eventually disappear; the actual "is this stale"
// decision is made by comparing the timestamp value, not key expiry.
const ACTIVITY_KEY_TTL_SECONDS = 60 * 60 * 24;

const memSockets = new Map(); // userId -> Set<socketId>
const memActivity = new Map(); // userId -> epoch ms

function socketsKey(userId) {
  return `presence:sockets:${userId}`;
}

function activityKey(userId) {
  return `presence:activity:${userId}`;
}

async function addSocket(userId, socketId) {
  if (isRedisReady()) {
    try {
      await getRedis().sadd(socketsKey(userId), socketId);
      return;
    } catch (error) {
      console.error("[presence] addSocket redis error:", error.message);
    }
  }

  if (!memSockets.has(userId)) memSockets.set(userId, new Set());
  memSockets.get(userId).add(socketId);
}

/** Removes the socket and returns the number of sockets still open for this user. */
async function removeSocket(userId, socketId) {
  if (isRedisReady()) {
    try {
      const redis = getRedis();
      await redis.srem(socketsKey(userId), socketId);
      return await redis.scard(socketsKey(userId));
    } catch (error) {
      console.error("[presence] removeSocket redis error:", error.message);
    }
  }

  const set = memSockets.get(userId);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) memSockets.delete(userId);
  return set.size;
}

async function getSocketCount(userId) {
  if (isRedisReady()) {
    try {
      return await getRedis().scard(socketsKey(userId));
    } catch (error) {
      console.error("[presence] getSocketCount redis error:", error.message);
    }
  }

  return memSockets.get(userId)?.size || 0;
}

async function touchActivity(userId) {
  const now = Date.now();

  if (isRedisReady()) {
    try {
      await getRedis().set(
        activityKey(userId),
        String(now),
        "EX",
        ACTIVITY_KEY_TTL_SECONDS
      );
      return;
    } catch (error) {
      console.error("[presence] touchActivity redis error:", error.message);
    }
  }

  memActivity.set(userId, now);
}

async function getLastActivity(userId) {
  if (isRedisReady()) {
    try {
      const value = await getRedis().get(activityKey(userId));
      return value ? Number(value) : null;
    } catch (error) {
      console.error("[presence] getLastActivity redis error:", error.message);
    }
  }

  return memActivity.get(userId) || null;
}

/*
 * All userIds this process currently has some presence data for — used
 * only by the periodic sweep to find automatic-mode transitions (e.g. a
 * user going idle without disconnecting). Redis-backed deployments scan
 * the activity-key namespace; the in-memory fallback just knows its own
 * Map keys.
 */
async function getTrackedUserIds() {
  if (isRedisReady()) {
    try {
      const redis = getRedis();
      const ids = new Set();
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          "MATCH",
          "presence:activity:*",
          "COUNT",
          200
        );
        cursor = nextCursor;
        for (const key of keys) {
          ids.add(key.slice("presence:activity:".length));
        }
      } while (cursor !== "0");
      return Array.from(ids);
    } catch (error) {
      console.error("[presence] getTrackedUserIds redis error:", error.message);
    }
  }

  return Array.from(
    new Set([...memActivity.keys(), ...memSockets.keys()])
  );
}

/*
 * Remembers the last effective status we broadcast for a user, so the
 * sweep only emits `presence:update` on an actual change instead of
 * spamming every connected client every tick.
 */
const memLastBroadcast = new Map();

async function getLastBroadcastStatus(userId) {
  if (isRedisReady()) {
    try {
      return await getRedis().get(`presence:lastEffective:${userId}`);
    } catch (error) {
      console.error(
        "[presence] getLastBroadcastStatus redis error:",
        error.message
      );
    }
  }

  return memLastBroadcast.get(userId) || null;
}

async function setLastBroadcastStatus(userId, status) {
  // null means "hidden" — store absence-of-key rather than the string
  // "null", so a later get() reads back the real JS value null either way.
  if (status === null) {
    if (isRedisReady()) {
      try {
        await getRedis().del(`presence:lastEffective:${userId}`);
        return;
      } catch (error) {
        console.error(
          "[presence] setLastBroadcastStatus redis error:",
          error.message
        );
      }
    }
    memLastBroadcast.delete(userId);
    return;
  }

  if (isRedisReady()) {
    try {
      await getRedis().set(
        `presence:lastEffective:${userId}`,
        status,
        "EX",
        ACTIVITY_KEY_TTL_SECONDS
      );
      return;
    } catch (error) {
      console.error(
        "[presence] setLastBroadcastStatus redis error:",
        error.message
      );
    }
  }

  memLastBroadcast.set(userId, status);
}

module.exports = {
  addSocket,
  removeSocket,
  getSocketCount,
  touchActivity,
  getLastActivity,
  getTrackedUserIds,
  getLastBroadcastStatus,
  setLastBroadcastStatus,
};
