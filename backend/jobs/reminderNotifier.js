const cron = require("node-cron");
const CalendarEvent = require("../models/Calendarevent");
const User = require("../models/user");
const { createNotification, notifyRecipients } = require("../utils/notificationService");

/** "YYYY-MM-DD" for the given Date, in server-local time — matches how
 * CalendarEvent.date is stored/entered elsewhere in this app (plain local
 * date/time strings, no timezone handling). */
function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Finds reminder events whose date/time has arrived and haven't notified
 * yet, sends the creator + assignees a notification, and marks them done.
 * Exported standalone (not just the cron wrapper) so it can be triggered
 * manually/tested without waiting on the schedule. */
async function checkDueReminders() {
  const now = new Date();
  const todayKey = toDateKey(now);

  // Narrow with the DB query (date <= today), then confirm the exact
  // date+time cutoff in JS — date/time live as separate plain strings on
  // the document, so a single Mongo query can't compare the combined
  // instant directly.
  const candidates = await CalendarEvent.find({
    type: "reminder",
    reminderNotified: { $ne: true },
    date: { $lte: todayKey },
  }).select("title date time assignees createdBy priority");

  for (const event of candidates) {
    const due = new Date(`${event.date}T${event.time || "09:00"}:00`);
    if (due > now) continue;

    try {
      const creator = await User.findById(event.createdBy).select("username");
      const creatorName = creator?.username || "Someone";
      const reminderPriority = event.priority === "high" ? "High" : "Medium";
      const assigneeIds = (event.assignees || []).map((id) => id.toString());

      if (assigneeIds.length > 0) {
        // notifyRecipients auto-skips the creator if they assigned
        // themselves — they get their own confirmation below instead.
        await notifyRecipients({
          userIds: assigneeIds,
          actorId: event.createdBy,
          type: "reminder",
          title: "Reminder",
          message: `${creatorName} reminded you: "${event.title}".`,
          priority: reminderPriority,
          link: "/calendar",
        });
      }

      // The creator always gets their own notification too — notifyRecipients
      // would filter them out as the actor, so call createNotification
      // directly with no actor to skip against.
      await createNotification({
        userId: event.createdBy,
        actorId: null,
        type: "reminder",
        title: "Reminder",
        message: `Your reminder "${event.title}" is due now.`,
        priority: reminderPriority,
        link: "/calendar",
      });

      event.reminderNotified = true;
      await event.save();
    } catch (error) {
      // One bad reminder shouldn't block the rest of the sweep — it stays
      // reminderNotified:false and gets retried on the next tick.
      console.error(`[reminder-notifier] Failed to notify for event ${event._id}:`, error);
    }
  }
}

let scheduledTask = null;

function startReminderScheduler() {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule("* * * * *", () => {
    checkDueReminders().catch((error) => {
      console.error("[reminder-notifier] Sweep failed:", error);
    });
  });

  console.log("[reminder-notifier] Scheduler started (every minute)");
  return scheduledTask;
}

function stopReminderScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  checkDueReminders,
  startReminderScheduler,
  stopReminderScheduler,
};
