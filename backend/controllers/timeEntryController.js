const TimeEntry = require("../models/TimeEntry");
const Task = require("../models/Task");
const {
  getTimerBlockReason,
  sumTrackedMsForTask,
  effortLimitMs,
  finalizeRunningEntry,
  reconcileRunningEntry,
  findActiveForUser,
  serializeEntry,
  buildTimeSummary,
  appendTaskActivity,
  isInProgressStatus,
  pauseEntry,
  resumeEntry,
  getLiveElapsedMs,
  ACTIVE_STATUSES,
} = require("../utils/timeTracking");

function populateEntry(query) {
  return query
    .populate("user", "username email avatarColor")
    .populate("task", "title status dueDate effortHours")
    .populate("project", "name");
}

const startTimer = async (req, res) => {
  try {
    const task = req.task;
    const userId = req.user._id;
    const projectId = req.project._id;
    const now = new Date();

    const trackedMs = await sumTrackedMsForTask(task._id);
    const block = getTimerBlockReason(task, { trackedMs, now });
    if (block) {
      return res.status(400).json({ message: block });
    }

    const existing = await TimeEntry.findOne({
      user: userId,
      status: { $in: ACTIVE_STATUSES },
    });

    let switchedFrom = null;
    if (existing) {
      if (String(existing.task) === String(task._id)) {
        if (existing.status === "paused") {
          await resumeEntry(existing, { actorId: userId, now });
          const populated = await populateEntry(TimeEntry.findById(existing._id));
          return res.status(200).json({
            entry: serializeEntry(populated),
            switchedFrom: null,
            summary: await buildTimeSummary(task._id, task),
            message: "Timer resumed",
          });
        }
        const populated = await populateEntry(TimeEntry.findById(existing._id));
        return res.status(200).json({
          entry: serializeEntry(populated),
          switchedFrom: null,
          summary: await buildTimeSummary(task._id, task),
          message: "Timer already running for this task",
        });
      }

      const otherTask = await Task.findById(existing.task);
      await finalizeRunningEntry(existing, {
        endedAt: now,
        stopReason: "switched_task",
        actorId: userId,
        task: otherTask,
      });
      switchedFrom = {
        taskId: String(existing.task),
        entryId: String(existing._id),
      };
    }

    let created;
    try {
      created = await TimeEntry.create({
        task: task._id,
        project: projectId,
        user: userId,
        startedAt: now,
        runningSince: now,
        accumulatedMs: 0,
        status: "running",
        activeSession: true,
      });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({
          message: "You already have an active timer. Refresh and try again.",
        });
      }
      throw err;
    }

    await appendTaskActivity(task._id, userId, {
      action: "timer_started",
      message: "started the timer.",
      field: "timer",
      meta: { timeEntryId: String(created._id) },
    });

    const populated = await populateEntry(TimeEntry.findById(created._id));
    const summary = await buildTimeSummary(task._id, task);

    res.status(201).json({
      entry: serializeEntry(populated),
      switchedFrom,
      summary,
      message: "Timer started",
    });
  } catch (error) {
    console.error("startTimer error:", error);
    res.status(500).json({ message: "Unable to start timer. Please try again." });
  }
};

const pauseTimer = async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user._id;
    const now = new Date();

    const entry = await TimeEntry.findById(entryId);
    if (!entry || String(entry.task) !== String(req.task._id)) {
      return res.status(404).json({ message: "Time entry not found" });
    }
    if (String(entry.user) !== String(userId)) {
      return res.status(403).json({ message: "You can only pause your own timer" });
    }
    if (entry.status === "paused") {
      const populated = await populateEntry(TimeEntry.findById(entry._id));
      return res.status(200).json({
        entry: serializeEntry(populated),
        summary: await buildTimeSummary(req.task._id, req.task),
        message: "Timer already paused",
      });
    }
    if (entry.status !== "running") {
      return res.status(400).json({ message: "Timer is not running" });
    }

    let current = await reconcileRunningEntry(entry, req.task, now);
    if (current.status !== "running") {
      const populated = await populateEntry(TimeEntry.findById(current._id));
      return res.status(200).json({
        entry: serializeEntry(populated),
        summary: await buildTimeSummary(req.task._id, req.task),
        message: "Timer was automatically stopped",
      });
    }

    current = await pauseEntry(current, { actorId: userId, now });
    const populated = await populateEntry(TimeEntry.findById(current._id));
    res.status(200).json({
      entry: serializeEntry(populated),
      summary: await buildTimeSummary(req.task._id, req.task),
      message: "Timer paused",
    });
  } catch (error) {
    console.error("pauseTimer error:", error);
    res.status(500).json({ message: "Unable to pause timer. Please try again." });
  }
};

const resumeTimer = async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user._id;
    const now = new Date();

    const entry = await TimeEntry.findById(entryId);
    if (!entry || String(entry.task) !== String(req.task._id)) {
      return res.status(404).json({ message: "Time entry not found" });
    }
    if (String(entry.user) !== String(userId)) {
      return res.status(403).json({ message: "You can only resume your own timer" });
    }

    const trackedMs = await sumTrackedMsForTask(req.task._id);
    const block = getTimerBlockReason(req.task, { trackedMs, now });
    if (block) {
      return res.status(400).json({ message: block });
    }

    if (entry.status === "running") {
      const populated = await populateEntry(TimeEntry.findById(entry._id));
      return res.status(200).json({
        entry: serializeEntry(populated),
        summary: await buildTimeSummary(req.task._id, req.task),
        message: "Timer already running",
      });
    }
    if (entry.status !== "paused") {
      return res.status(400).json({ message: "Timer is not paused" });
    }

    const current = await resumeEntry(entry, { actorId: userId, now });
    const populated = await populateEntry(TimeEntry.findById(current._id));
    res.status(200).json({
      entry: serializeEntry(populated),
      summary: await buildTimeSummary(req.task._id, req.task),
      message: "Timer resumed",
    });
  } catch (error) {
    console.error("resumeTimer error:", error);
    res.status(500).json({ message: "Unable to resume timer. Please try again." });
  }
};

const stopTimer = async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user._id;
    const now = new Date();

    const entry = await TimeEntry.findById(entryId);
    if (!entry || String(entry.task) !== String(req.task._id)) {
      return res.status(404).json({ message: "Time entry not found" });
    }
    if (String(entry.user) !== String(userId)) {
      return res.status(403).json({ message: "You can only stop your own timer" });
    }
    if (!ACTIVE_STATUSES.includes(entry.status)) {
      const populated = await populateEntry(TimeEntry.findById(entry._id));
      return res.status(200).json({
        entry: serializeEntry(populated),
        summary: await buildTimeSummary(req.task._id, req.task),
        message: "Timer already stopped",
      });
    }

    let current = entry;
    if (entry.status === "running") {
      current = await reconcileRunningEntry(entry, req.task, now);
    }

    if (ACTIVE_STATUSES.includes(current.status)) {
      const trackedBefore = await sumTrackedMsForTask(req.task._id, {
        excludeEntryId: current._id,
      });
      const limit = effortLimitMs(req.task.effortHours);
      let endedAt = now;
      let stopReason = "manual";
      if (limit != null && current.status === "running") {
        const live = getLiveElapsedMs(current, now);
        if (trackedBefore + live >= limit) {
          const remaining = Math.max(0, limit - trackedBefore);
          const since = new Date(current.runningSince || current.startedAt);
          const already = Number(current.accumulatedMs) || 0;
          endedAt = new Date(since.getTime() + Math.max(0, remaining - already));
          stopReason = "effort_reached";
        }
      }
      current = await finalizeRunningEntry(current, {
        endedAt,
        stopReason,
        actorId: userId,
        task: req.task,
        notifyEffort: stopReason === "effort_reached",
      });
    }

    const populated = await populateEntry(TimeEntry.findById(current._id));
    const summary = await buildTimeSummary(req.task._id, req.task);

    res.status(200).json({
      entry: serializeEntry(populated),
      summary,
      message: "Timer stopped",
    });
  } catch (error) {
    console.error("stopTimer error:", error);
    res.status(500).json({ message: "Unable to stop timer. Please try again." });
  }
};

const getActiveTimer = async (req, res) => {
  try {
    let entry = await findActiveForUser(req.user._id);
    if (!entry) {
      return res.status(200).json({ entry: null, summary: null });
    }

    const task =
      entry.task && entry.task.title
        ? entry.task
        : await Task.findById(entry.task);

    if (task && entry.status === "running") {
      entry = await reconcileRunningEntry(entry, task, new Date());
      if (!ACTIVE_STATUSES.includes(entry.status)) {
        return res.status(200).json({
          entry: null,
          summary: task ? await buildTimeSummary(task._id, task) : null,
          autoStopped: serializeEntry(entry),
        });
      }
    }

    entry = await populateEntry(TimeEntry.findById(entry._id));
    const taskId = entry.task?._id || entry.task;
    const taskDoc = await Task.findById(taskId);
    res.status(200).json({
      entry: serializeEntry(entry),
      summary: taskDoc ? await buildTimeSummary(taskDoc._id, taskDoc) : null,
    });
  } catch (error) {
    console.error("getActiveTimer error:", error);
    res.status(500).json({ message: "Unable to load active timer" });
  }
};

const listTaskTimeEntries = async (req, res) => {
  try {
    const entries = await populateEntry(
      TimeEntry.find({ task: req.task._id }).sort({ startedAt: -1 })
    );

    const running = entries.find((e) => e.status === "running");
    if (running) {
      await reconcileRunningEntry(running, req.task, new Date());
    }

    const refreshed = await populateEntry(
      TimeEntry.find({ task: req.task._id }).sort({ startedAt: -1 })
    );

    res.status(200).json({
      entries: refreshed.map(serializeEntry),
      summary: await buildTimeSummary(req.task._id, req.task),
    });
  } catch (error) {
    console.error("listTaskTimeEntries error:", error);
    res.status(500).json({ message: "Unable to load time log" });
  }
};

const getTaskTimeSummary = async (req, res) => {
  try {
    const running = await TimeEntry.findOne({
      task: req.task._id,
      status: "running",
    });
    if (running) {
      await reconcileRunningEntry(running, req.task, new Date());
    }
    const summary = await buildTimeSummary(req.task._id, req.task);
    const blockReason = getTimerBlockReason(req.task, {
      trackedMs: summary.trackedMs,
    });
    res.status(200).json({
      summary,
      canStart: !blockReason && isInProgressStatus(req.task.status),
      blockReason,
    });
  } catch (error) {
    console.error("getTaskTimeSummary error:", error);
    res.status(500).json({ message: "Unable to load time summary" });
  }
};

module.exports = {
  startTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  getActiveTimer,
  listTaskTimeEntries,
  getTaskTimeSummary,
};
