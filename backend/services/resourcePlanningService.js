const { normalizeHoursPerDay, DEFAULT_HOURS_PER_DAY } = require("../utils/workHours");

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const DEFAULT_TASK_WORKING_DAYS = [1, 2, 3, 4, 5];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dateFromKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0));
}

function normalizeDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function eachDateInclusive(start, end) {
  const dates = [];
  if (!start || !end) return dates;
  const current = normalizeDate(start);
  const last = normalizeDate(end);
  if (last < current) return dates;
  while (current <= last) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function parseTimeToHours(value) {
  const parts = String(value || "00:00").split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] || 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h + m / 60;
}

function defaultDaySchedule(enabled, startTime = "09:00", endTime = "18:00", breakMinutes = 60) {
  return {
    enabled: Boolean(enabled),
    startTime,
    endTime,
    breakMinutes,
  };
}

function defaultWorkingSchedule() {
  return {
    timezone: "Asia/Kolkata",
    monday: defaultDaySchedule(true),
    tuesday: defaultDaySchedule(true),
    wednesday: defaultDaySchedule(true),
    thursday: defaultDaySchedule(true),
    friday: defaultDaySchedule(true, "09:00", "18:00", 60),
    saturday: defaultDaySchedule(false, "09:00", "18:00", 0),
    sunday: defaultDaySchedule(false, "09:00", "18:00", 0),
  };
}

function mergeWorkingSchedule(input) {
  const base = defaultWorkingSchedule();
  if (!input || typeof input !== "object") return base;
  const next = { ...base, timezone: input.timezone || base.timezone };
  for (const key of WEEKDAY_KEYS) {
    const day = input[key];
    if (!day || typeof day !== "object") continue;
    next[key] = {
      enabled: day.enabled !== undefined ? Boolean(day.enabled) : base[key].enabled,
      startTime: day.startTime || base[key].startTime,
      endTime: day.endTime || base[key].endTime,
      breakMinutes:
        day.breakMinutes == null ? base[key].breakMinutes : Math.max(0, Number(day.breakMinutes) || 0),
    };
  }
  return next;
}

function hoursFromDaySchedule(day) {
  if (!day?.enabled) return 0;
  const start = parseTimeToHours(day.startTime);
  const end = parseTimeToHours(day.endTime);
  const breakHours = (Number(day.breakMinutes) || 0) / 60;
  return Math.max(0, end - start - breakHours);
}

function enabledWorkingDayCount(schedule) {
  const sched = mergeWorkingSchedule(schedule);
  return WEEKDAY_KEYS.filter((key) => sched[key]?.enabled).length;
}

function normalizeResourceSettings(
  settings,
  orgHoursPerDay,
  schedule
) {
  const hoursPerDay =
    settings?.hoursPerDay != null &&
    Number.isFinite(
      Number(settings.hoursPerDay)
    )
      ? Math.min(
          24,
          Math.max(
            0,
            Number(settings.hoursPerDay)
          )
        )
      : normalizeHoursPerDay(
          orgHoursPerDay
        );

  const sched =
    mergeWorkingSchedule(schedule);

  /*
   * Weekly capacity is derived from the
   * actual working schedule.
   *
   * This prevents contradictory values such as:
   *
   * Daily = 8h
   * Schedule = Mon-Fri
   * Weekly = 30h
   *
   * The schedule is the source of truth.
   */
  const hoursPerWeek =
    WEEKDAY_KEYS.reduce(
      (total, key) => {
        const day = sched[key];

        if (!day?.enabled) {
          return total;
        }

        const scheduledHours =
          hoursFromDaySchedule(day);

        const effectiveHours =
          scheduledHours > 0
            ? Math.min(
                scheduledHours,
                hoursPerDay
              )
            : hoursPerDay;

        return total + effectiveHours;
      },
      0
    );

  const utilizationTarget =
    settings?.utilizationTarget != null &&
    Number.isFinite(
      Number(
        settings.utilizationTarget
      )
    )
      ? Math.min(
          200,
          Math.max(
            1,
            Number(
              settings.utilizationTarget
            )
          )
        )
      : 80;

  return {
    enabled:
      settings?.enabled !== false,

    hoursPerDay,

    hoursPerWeek:
      Number(
        hoursPerWeek.toFixed(2)
      ),

    utilizationTarget,
  };
}

function getMemberWorkingSchedule(member, organization) {
  return mergeWorkingSchedule(
    member?.workingSchedule || organization?.defaultWorkingSchedule
  );
}

function getMemberCapacity(member, organization) {
  const schedule = getMemberWorkingSchedule(member, organization);
  const orgHours = normalizeHoursPerDay(organization?.hoursPerDay ?? DEFAULT_HOURS_PER_DAY);
  return normalizeResourceSettings(member?.resourceSettings, orgHours, schedule);
}

function getOrganizationHolidays(
  organization,
  year
) {
  const holidays = Array.isArray(
    organization?.holidays
  )
    ? organization.holidays
    : [];

  const list = holidays.filter(
    (holiday) =>
      holiday &&
      holiday.isEnabled !== false
  );

  if (year == null) {
    return list;
  }

  const yearNum = Number(year);

  return list.filter((holiday) => {
    const key =
      holiday.dateKey ||
      toDateKey(holiday.date);

    return (
      key &&
      key.startsWith(`${yearNum}-`)
    );
  });
}
function isOrganizationHoliday(date, holidays) {
  const key = toDateKey(date);
  if (!key) return false;
  const monthDay = key.slice(5);
  return (holidays || []).some((holiday) => {
    if (holiday?.isActive === false) return false;
    const holidayKey = holiday.dateKey || toDateKey(holiday.date);
    if (!holidayKey) return false;
    if (holidayKey === key) return true;
    return Boolean(holiday.isRecurring) && holidayKey.slice(5) === monthDay;
  });
}

function isApprovedLeave(date, leaves) {
  const day = normalizeDate(date).getTime();
  return (leaves || []).some((leave) => {
    if (leave?.status && leave.status !== "approved") return false;
    const start = normalizeDate(leave.startDate).getTime();
    const end = normalizeDate(leave.endDate).getTime();
    return day >= start && day <= end;
  });
}

function getApprovedLeaveOnDate(date, leaves) {
  const day = normalizeDate(date).getTime();
  return (leaves || []).find((leave) => {
    if (leave?.status && leave.status !== "approved") return false;
    const start = normalizeDate(leave.startDate).getTime();
    const end = normalizeDate(leave.endDate).getTime();
    return day >= start && day <= end;
  }) || null;
}

function getHolidayOnDate(date, holidays) {
  const key = toDateKey(date);
  if (!key) return null;
  const monthDay = key.slice(5);
  return (
    (holidays || []).find((holiday) => {
      if (holiday?.isActive === false) return false;
      const holidayKey = holiday.dateKey || toDateKey(holiday.date);
      if (!holidayKey) return false;
      if (holidayKey === key) return true;
      return Boolean(holiday.isRecurring) && holidayKey.slice(5) === monthDay;
    }) || null
  );
}

function getDailyCapacity({
  date,
  schedule,
  resourceSettings,
  holidays = [],
  leaves = [],
}) {
  const sched = mergeWorkingSchedule(schedule);
  const settings = normalizeResourceSettings(resourceSettings, resourceSettings?.hoursPerDay, sched);
  const weekday = WEEKDAY_KEYS[date.getDay()];
  const day = sched[weekday];
  const scheduledHours = hoursFromDaySchedule(day);
  let capacityHours = 0;
  let reason = "non_working";

  if (settings.enabled && day?.enabled) {
    capacityHours = scheduledHours > 0 ? scheduledHours : settings.hoursPerDay;
    if (settings.hoursPerDay > 0 && scheduledHours > 0) {
      capacityHours = Math.min(scheduledHours, settings.hoursPerDay);
    }
    reason = date.getDay() === 0 || date.getDay() === 6 ? "weekend" : "working";
    if (capacityHours > 0 && (date.getDay() === 0 || date.getDay() === 6)) {
      reason = "working";
    }
  } else if (date.getDay() === 0 || date.getDay() === 6) {
    reason = "weekend";
  }

  const holiday = getHolidayOnDate(date, holidays);
  if (holiday) {
    return {
      dateKey: toDateKey(date),
      capacityHours: 0,
      reason: "holiday",
      holidayName: holiday.name || "Holiday",
    };
  }

  const leave = getApprovedLeaveOnDate(date, leaves);
  if (leave) {
    return {
      dateKey: toDateKey(date),
      capacityHours: 0,
      reason: "leave",
      leaveType: leave.leaveType || null,
    };
  }

  return {
    dateKey: toDateKey(date),
    capacityHours: Number(capacityHours.toFixed(4)),
    reason,
  };
}

function normalizeWorkingDays(days) {
  if (!Array.isArray(days) || days.length === 0) return [...DEFAULT_TASK_WORKING_DAYS];
  const cleaned = [
    ...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
  ].sort((a, b) => a - b);
  return cleaned.length > 0 ? cleaned : [...DEFAULT_TASK_WORKING_DAYS];
}

function collectAssigneeIds(task) {
  const ids = new Set();
  const push = (value) => {
    if (!value) return;
    if (typeof value === "object" && value._id) {
      ids.add(String(value._id));
      return;
    }
    ids.add(String(value));
  };
  push(task.assignee);
  if (Array.isArray(task.assignees)) {
    for (const assignee of task.assignees) push(assignee);
  }
  return [...ids];
}

function explicitEffortHours(task) {
  if (task?.effortHours == null || task.effortHours === "") return 0;
  const hours = Number(task.effortHours);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return hours;
}

function effortShareForUser(task, userId) {
  const effort = explicitEffortHours(task);
  if (effort <= 0) return 0;
  const assigneeIds = collectAssigneeIds(task);
  if (!assigneeIds.includes(String(userId))) return 0;
  return effort / Math.max(assigneeIds.length, 1);
}

function isValidAllocationDay({ date, taskWorkingDays, schedule, resourceSettings, holidays, leaves }) {
  const workingDays = normalizeWorkingDays(taskWorkingDays);
  if (!workingDays.includes(date.getDay())) return false;
  const daily = getDailyCapacity({ date, schedule, resourceSettings, holidays, leaves });
  return daily.capacityHours > 0;
}

function calculateTaskAllocation({
  task,
  userId,
  schedule,
  resourceSettings,
  holidays = [],
  leaves = [],
}) {
  const share = effortShareForUser(task, userId);
  const perDay = new Map();
  if (share <= 0 || !task?.startDate || !task?.dueDate) {
    return { share, hoursPerDay: 0, validDayCount: 0, perDay, unallocated: share };
  }

  const validDates = eachDateInclusive(task.startDate, task.dueDate).filter((date) =>
    isValidAllocationDay({
      date,
      taskWorkingDays: task.workingDays,
      schedule,
      resourceSettings,
      holidays,
      leaves,
    })
  );

  if (validDates.length === 0) {
    return { share, hoursPerDay: 0, validDayCount: 0, perDay, unallocated: share };
  }

  const hoursPerDay = share / validDates.length;
  for (const date of validDates) {
    perDay.set(toDateKey(date), hoursPerDay);
  }
  return { share, hoursPerDay, validDayCount: validDates.length, perDay, unallocated: 0 };
}

function calculateMemberAvailability(capacityHours, allocatedEffortHours) {
  return capacityHours - allocatedEffortHours;
}

function calculateMemberUtilization(capacityHours, allocatedEffortHours) {
  if (!capacityHours || capacityHours <= 0) return 0;
  return (allocatedEffortHours / capacityHours) * 100;
}

function calculateOverallocation(capacityHours, allocatedEffortHours) {
  const overallocated = allocatedEffortHours > capacityHours && capacityHours >= 0;
  const overBy = overallocated ? allocatedEffortHours - capacityHours : 0;
  return {
    overallocated,
    overBy,
    status: overallocated ? "OVERALLOCATED" : "Healthy",
  };
}

function rangeDayIndex(date, rangeStart, totalDays) {
  const index = Math.floor(
    (normalizeDate(date).getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (index < 0 || index >= totalDays) return -1;
  return index;
}

function calculateResourceWorkload({
  member,
  organization,
  tasks = [],
  leaves = [],
  rangeStart,
  rangeEnd,
}) {
  const schedule = getMemberWorkingSchedule(member, organization);
  const settings = getMemberCapacity(member, organization);
  const holidays = getOrganizationHolidays(organization);
  const userId = member?.user?._id || member?.user || member?._id;
  const dates = eachDateInclusive(rangeStart, rangeEnd);
  const totalDays = dates.length;

  const dailyCapacity = [];
  const dailyMeta = [];
  for (const date of dates) {
    const daily = getDailyCapacity({
      date,
      schedule,
      resourceSettings: settings,
      holidays,
      leaves,
    });
    dailyCapacity.push(daily.capacityHours);
    dailyMeta.push(daily);
  }

  const dailyAllocated = new Array(totalDays).fill(0);
  const allocations = [];

  for (const task of tasks) {
    const result = calculateTaskAllocation({
      task,
      userId,
      schedule,
      resourceSettings: settings,
      holidays,
      leaves,
    });
    allocations.push({ task, ...result });
    for (const date of dates) {
      const key = toDateKey(date);
      const hours = result.perDay.get(key);
      if (!hours) continue;
      const index = rangeDayIndex(date, rangeStart, totalDays);
      if (index >= 0) dailyAllocated[index] += hours;
    }
  }

  const capacityHours = dailyCapacity.reduce((sum, hours) => sum + hours, 0);
  const allocatedEffortHours = dailyAllocated.reduce((sum, hours) => sum + hours, 0);
  const availableHours = calculateMemberAvailability(capacityHours, allocatedEffortHours);
  const utilization = calculateMemberUtilization(capacityHours, allocatedEffortHours);
  const overallocation = calculateOverallocation(capacityHours, allocatedEffortHours);
  const aboveTarget = utilization > settings.utilizationTarget;

  let resourceStatus = "Healthy";
  if (!settings.enabled) resourceStatus = "Disabled";
  else if (overallocation.overallocated) resourceStatus = "Overallocated";
  else if (aboveTarget) resourceStatus = "Above target";
  else if (utilization < 70) resourceStatus = "Available";

  let workloadStatus = "Available";
  if (utilization > 150) workloadStatus = "Overloaded";
  else if (utilization > 100) workloadStatus = "High Load";
  else if (utilization >= 70) workloadStatus = "Healthy";

  const dailyRows = dates.map((date, index) => {
    const meta = dailyMeta[index];
    const allocated = dailyAllocated[index];
    const capacity = dailyCapacity[index];
    const available = calculateMemberAvailability(capacity, allocated);
    const dayUtil = calculateMemberUtilization(capacity, allocated);
    const dayOver = calculateOverallocation(capacity, allocated);
    return {
      dateKey: meta.dateKey,
      capacityHours: Number(capacity.toFixed(2)),
      allocatedHours: Number(allocated.toFixed(2)),
      availableHours: Number(available.toFixed(2)),
      utilization: capacity > 0 ? Math.round(dayUtil) : null,
      reason: meta.reason,
      holidayName: meta.holidayName || null,
      leaveType: meta.leaveType || null,
      overallocated: dayOver.overallocated,
    };
  });

  return {
    settings,
    schedule,
    capacityHours: Number(capacityHours.toFixed(2)),
    allocatedEffortHours: Number(allocatedEffortHours.toFixed(2)),
    availableHours: Number(availableHours.toFixed(2)),
    utilization: Math.round(utilization),
    utilizationExact: utilization,
    utilizationTarget: settings.utilizationTarget,
    aboveTarget,
    resourceStatus,
    workloadStatus,
    overallocation,
    dailyCapacity,
    dailyAllocated,
    dailyRows,
    allocations,
  };
}

module.exports = {
  WEEKDAY_KEYS,
  toDateKey,
  dateFromKey,
  normalizeDate,
  eachDateInclusive,
  defaultWorkingSchedule,
  mergeWorkingSchedule,
  hoursFromDaySchedule,
  enabledWorkingDayCount,
  normalizeResourceSettings,
  getMemberCapacity,
  getMemberWorkingSchedule,
  getOrganizationHolidays,
  getDailyCapacity,
  isOrganizationHoliday,
  isApprovedLeave,
  isValidAllocationDay,
  collectAssigneeIds,
  explicitEffortHours,
  effortShareForUser,
  calculateTaskAllocation,
  calculateMemberAvailability,
  calculateMemberUtilization,
  calculateOverallocation,
  calculateResourceWorkload,
  normalizeWorkingDays,
};
