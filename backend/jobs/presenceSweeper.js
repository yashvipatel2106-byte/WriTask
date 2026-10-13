/*
 * Backend-side safety net for presence, run on an interval (not
 * node-cron, since this needs sub-minute granularity — mirrors the
 * setInterval style already used for meeting room cleanup):
 *
 * 1. Expires manual statuses whose statusExpiresAt has passed, even if
 *    the user's browser/tab isn't open to run a frontend timer.
 * 2. Recomputes automatic-mode presence for every user we currently
 *    have presence data for, so someone who goes idle (activity
 *    timeout) without disconnecting still flips to Offline for
 *    everyone watching, not just on their next heartbeat.
 */
const User = require("../models/User");
const { getIO } = require("../socket/socket");
const presenceService = require("./../utils/presenceService");

async function sweepExpiredManualStatuses() {
  const now = new Date();

  const expired = await User.find({
    statusMode: "manual",
    statusExpiresAt: { $ne: null, $lte: now },
  }).select("_id");

  if (expired.length === 0) return;

  await User.updateMany(
    { _id: { $in: expired.map((u) => u._id) } },
    { $set: { statusMode: "automatic", manualStatus: null, statusExpiresAt: null } }
  );

  let io = null;
  try {
    io = getIO();
  } catch {
    return; // socket layer not up — statuses are still corrected in Mongo
  }

  for (const user of expired) {
    try {
      await presenceService.recomputeAndBroadcast(io, User, user._id.toString());
    } catch (error) {
      console.error(
        `[presence-sweeper] broadcast failed for ${user._id}:`,
        error.message
      );
    }
  }
}

async function sweepAutomaticTransitions() {
  let io = null;
  try {
    io = getIO();
  } catch {
    return;
  }

  const userIds = await presenceService.getTrackedUserIds();

  for (const userId of userIds) {
    try {
      await presenceService.recomputeAndBroadcast(io, User, userId);
    } catch (error) {
      console.error(
        `[presence-sweeper] recompute failed for ${userId}:`,
        error.message
      );
    }
  }
}

async function runSweep() {
  await sweepExpiredManualStatuses().catch((error) =>
    console.error("[presence-sweeper] Expiry sweep failed:", error.message)
  );

  await sweepAutomaticTransitions().catch((error) =>
    console.error("[presence-sweeper] Transition sweep failed:", error.message)
  );
}

let intervalHandle = null;

function startPresenceSweeper() {
  if (intervalHandle) return intervalHandle;

  const intervalMs = Number(process.env.PRESENCE_SWEEP_INTERVAL_MS) || 30 * 1000;
  intervalHandle = setInterval(() => {
    runSweep().catch((error) =>
      console.error("[presence-sweeper] Sweep failed:", error.message)
    );
  }, intervalMs);

  console.log(`[presence-sweeper] Started (every ${intervalMs / 1000}s)`);
  return intervalHandle;
}

function stopPresenceSweeper() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  runSweep,
  startPresenceSweeper,
  stopPresenceSweeper,
};
