function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseBaselineName(value) {
  const name = String(value || "").trim();

  if (!name) throw httpError("Baseline name is required");

  if (name.length > 120) {
    throw httpError("Baseline name must be 120 characters or fewer");
  }

  return name;
}

function calendarDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function buildScheduleBaselineItems(tasks) {
  return tasks.flatMap((task) => {
    const startDate = calendarDate(task.startDate);
    const dueDate = calendarDate(task.dueDate);

    if (!startDate || !dueDate || dueDate < startDate) return [];

    const durationDays =
      Math.floor((dueDate.getTime() - startDate.getTime()) / 86400000) + 1;

    return [
      {
        taskId: task._id,
        startDate,
        dueDate,
        durationDays,
      },
    ];
  });
}

module.exports = {
  parseBaselineName,
  buildScheduleBaselineItems,
  httpError,
};