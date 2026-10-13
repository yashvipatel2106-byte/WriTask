const { getWeekRange } = require("../../utils/reportWeek");

class ActivityService {
  /** Calendar week containing `now`: Sunday 00:00:00 through Saturday 23:59:59.999 (local). */
  getCurrentWeekRange(now = new Date()) {
    return getWeekRange(now);
  }

  inRange(value, start, end) {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return false;
    return time >= start.getTime() && time <= end.getTime();
  }

  build(tasks, now = new Date()) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const weekly = days.map((day) => ({
      day,
      completed: 0,
      created: 0,
    }));

    const { start, end } = this.getCurrentWeekRange(now);

    tasks.forEach((task) => {
      if (task.createdAt && this.inRange(task.createdAt, start, end)) {
        const createdDay = new Date(task.createdAt).getDay();
        weekly[createdDay].created++;
      }

      if (!task.activityLog?.length) return;

      // Count each task at most once per day it was marked completed this week
      const completedDays = new Set();

      task.activityLog.forEach((activity) => {
        if (
          activity.field !== "status" ||
          activity.newValue !== "completed" ||
          !activity.createdAt ||
          !this.inRange(activity.createdAt, start, end)
        ) {
          return;
        }

        const completedDay = new Date(activity.createdAt).getDay();
        if (completedDays.has(completedDay)) return;
        completedDays.add(completedDay);
        weekly[completedDay].completed++;
      });
    });

    return weekly;
  }
}

module.exports = new ActivityService();
