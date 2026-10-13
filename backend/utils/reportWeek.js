const dayjs = require("dayjs");

/** Calendar week: Sunday 00:00:00 through Saturday 23:59:59.999 (local). */
function getWeekRange(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/** A reference date that falls inside the calendar week before `now`. */
function getPreviousWeekReference(now = new Date()) {
  const { start } = getWeekRange(now);
  const previous = new Date(start);
  previous.setDate(previous.getDate() - 1);
  return previous;
}

function getWeekLabel(referenceDate = new Date()) {
  const { start, end } = getWeekRange(referenceDate);
  const sameMonth = start.getMonth() === end.getMonth();
  const startFmt = dayjs(start).format(sameMonth ? "MMM D" : "MMM D, YYYY");
  const endFmt = dayjs(end).format("MMM D, YYYY");
  return `${startFmt} - ${endFmt}`;
}

module.exports = {
  getWeekRange,
  getPreviousWeekReference,
  getWeekLabel,
};
