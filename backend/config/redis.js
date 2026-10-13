/*
 * Redis client for ephemeral presence data (socket counts, last-activity
 * timestamps). `ioredis` was already a listed dependency but unused
 * anywhere in the codebase — this is the first real connection.
 *
 * Presence must never become a single point of failure for the app, so
 * this client is intentionally forgiving:
 * - No REDIS_URL configured → we never even try to connect; callers fall
 *   back to the in-memory store (see utils/presenceStore.js).
 * - Connection fails/drops → logged once via the "error" listener (ioredis
 *   retries on its own retryStrategy), callers check isRedisReady() first.
 */
const IORedis = require("ioredis");

let redis = null;
let ready = false;

if (process.env.REDIS_URL) {
  redis = new IORedis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 3000)),
  });

  redis.on("ready", () => {
    ready = true;
    console.log("[redis] Connected");
  });

  redis.on("error", (error) => {
    if (ready) {
      console.error("[redis] Connection error:", error.message);
    }
    ready = false;
  });

  redis.on("end", () => {
    ready = false;
  });

  redis.connect().catch((error) => {
    console.error(
      "[redis] Initial connect failed — presence will use the in-memory fallback store:",
      error.message
    );
  });
} else {
  console.warn(
    "[redis] REDIS_URL not set — presence will use the in-memory fallback store (single-instance only)."
  );
}

function getRedis() {
  return redis;
}

function isRedisReady() {
  return ready && !!redis;
}

module.exports = { getRedis, isRedisReady };
