const User = require("../models/User");
const { getIO } = require("../socket/socket");
const presenceService = require("../utils/presenceService");
const {
  computeEffectiveStatus,
  MANUAL_STATUS_VALUES,
} = require("../utils/statusLogic");

/*
 * Duration presets accepted from the client — the client sends one of
 * these keys (or "custom" with an explicit expiresAt), the backend is
 * the one that actually computes/validates the expiry timestamp.
 */
function resolveExpiresAt(durationKey, customExpiresAt) {
  const now = new Date();

  switch (durationKey) {
    case "1h":
      return new Date(now.getTime() + 60 * 60 * 1000);
    case "4h":
      return new Date(now.getTime() + 4 * 60 * 60 * 1000);
    case "today": {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      return endOfDay;
    }
    case "week": {
      const endOfWeek = new Date(now);
      const daysUntilSunday = 7 - endOfWeek.getDay();
      endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
      endOfWeek.setHours(23, 59, 59, 999);
      return endOfWeek;
    }
    case "custom": {
      if (!customExpiresAt) return null;
      const parsed = new Date(customExpiresAt);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= now.getTime()) {
        return null;
      }
      return parsed;
    }
    default:
      return null;
  }
}

/** GET /api/presence/me — my own persisted preference + effective status. */
async function getMyStatus(req, res) {
  try {
    const rawPresence = await presenceService.getRawPresence(
      req.user._id.toString()
    );

    const effective = computeEffectiveStatus(req.user, rawPresence);

    // Lazily reset an expired manual status on read, so the very next
    // fetch already reflects automatic mode even if the sweep job
    // hasn't ticked yet.
    if (
      req.user.statusMode === "manual" &&
      req.user.statusExpiresAt &&
      req.user.statusExpiresAt.getTime() <= Date.now() &&
      effective.statusMode === "automatic"
    ) {
      req.user.statusMode = "automatic";
      req.user.manualStatus = null;
      req.user.statusExpiresAt = null;
      await req.user.save();
    }

    return res.json({
      userId: req.user._id.toString(),
      ...effective,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/*
 * PATCH /api/presence/me — set a manual status (optionally with a
 * duration). A user may only ever change their own status — there is
 * no target-user parameter here at all, it always acts on req.user
 * from the authenticated JWT.
 */
async function updateMyStatus(req, res) {
  try {
    const { manualStatus, duration, expiresAt } = req.body || {};

    if (!MANUAL_STATUS_VALUES.includes(manualStatus)) {
      return res.status(400).json({
        message: `manualStatus must be one of: ${MANUAL_STATUS_VALUES.join(", ")}`,
      });
    }

    let resolvedExpiresAt = null;
    if (duration && duration !== "none") {
      resolvedExpiresAt = resolveExpiresAt(duration, expiresAt);
      if (!resolvedExpiresAt) {
        return res.status(400).json({ message: "Invalid duration." });
      }
    }

    req.user.statusMode = "manual";
    req.user.manualStatus = manualStatus;
    req.user.statusExpiresAt = resolvedExpiresAt;
    await req.user.save();

    let io = null;
    try {
      io = getIO();
    } catch {
      /* socket layer not initialized (e.g. tests) — status still saved */
    }

    if (io) {
      await presenceService.recomputeAndBroadcast(
        io,
        User,
        req.user._id.toString()
      );
    }

    const rawPresence = await presenceService.getRawPresence(
      req.user._id.toString()
    );

    return res.json({
      userId: req.user._id.toString(),
      ...computeEffectiveStatus(req.user, rawPresence),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/** POST /api/presence/me/reset — back to automatic. */
async function resetMyStatus(req, res) {
  try {
    req.user.statusMode = "automatic";
    req.user.manualStatus = null;
    req.user.statusExpiresAt = null;
    await req.user.save();

    let io = null;
    try {
      io = getIO();
    } catch {
      /* socket layer not initialized (e.g. tests) — status still saved */
    }

    if (io) {
      await presenceService.recomputeAndBroadcast(
        io,
        User,
        req.user._id.toString()
      );
    }

    const rawPresence = await presenceService.getRawPresence(
      req.user._id.toString()
    );

    return res.json({
      userId: req.user._id.toString(),
      ...computeEffectiveStatus(req.user, rawPresence),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/*
 * PATCH /api/presence/me/visibility — show/hide the status badge from
 * everyone else. Independent of statusMode/manualStatus: a user can be
 * "busy" or just automatically "available" and still choose not to
 * broadcast it at all.
 */
async function updateVisibility(req, res) {
  try {
    const { visible } = req.body || {};

    if (typeof visible !== "boolean") {
      return res.status(400).json({ message: "visible must be a boolean." });
    }

    req.user.statusVisible = visible;
    await req.user.save();

    let io = null;
    try {
      io = getIO();
    } catch {
      /* socket layer not initialized (e.g. tests) — preference still saved */
    }

    if (io) {
      await presenceService.recomputeAndBroadcast(
        io,
        User,
        req.user._id.toString()
      );
    }

    const rawPresence = await presenceService.getRawPresence(
      req.user._id.toString()
    );

    return res.json({
      userId: req.user._id.toString(),
      ...computeEffectiveStatus(req.user, rawPresence),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/*
 * GET /api/presence?userIds=a,b,c — bulk effective-status lookup, used
 * to paint badges for a list of users (e.g. a members page) without
 * waiting on a socket broadcast for every one of them. Users who have
 * turned their status off are simply omitted — callers treat a missing
 * entry the same as "no status to show".
 */
async function getBulkPresence(req, res) {
  try {
    const raw = String(req.query.userIds || "");
    const userIds = raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 200); // sane upper bound per request

    if (userIds.length === 0) {
      return res.json({});
    }

    const users = await User.find({ _id: { $in: userIds } }).select(
      "statusMode manualStatus statusExpiresAt statusVisible"
    );

    const result = {};

    await Promise.all(
      users.map(async (user) => {
        const rawPresence = await presenceService.getRawPresence(
          user._id.toString()
        );
        const effective = computeEffectiveStatus(user, rawPresence);
        if (effective.visible) {
          result[user._id.toString()] = effective.effective;
        }
      })
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getMyStatus,
  updateMyStatus,
  resetMyStatus,
  updateVisibility,
  getBulkPresence,
};
