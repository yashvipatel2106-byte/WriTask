const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  defaultWorkingSchedule,
  mergeWorkingSchedule,
  calculateResourceWorkload,
  calculateTaskAllocation,
  calculateMemberAvailability,
  calculateMemberUtilization,
  calculateOverallocation,
  getDailyCapacity,
  effortShareForUser,
  toDateKey,
} = require("./resourcePlanningService");
const { upsertHolidays, isRelevantPublicHoliday, syncPublicHolidays } = require("./holidaySyncService");

function d(iso) {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function weekRange() {
  return { rangeStart: d("2026-09-07"), rangeEnd: d("2026-09-13") };
}

function memberFixture({ hoursPerDay = 8, schedule } = {}) {
  return {
    _id: "amit",
    user: "amit",
    resourceSettings: {
      enabled: true,
      hoursPerDay,
      utilizationTarget: 80,
    },
    workingSchedule: schedule || defaultWorkingSchedule(),
  };
}

describe("resource planning capacity", () => {
  it("test 1: 8h/day member has 40h weekly capacity", () => {
    const { rangeStart, rangeEnd } = weekRange();
    const result = calculateResourceWorkload({
      member: memberFixture({ hoursPerDay: 8 }),
      organization: { hoursPerDay: 8, holidays: [] },
      tasks: [],
      leaves: [],
      rangeStart,
      rangeEnd,
    });
    assert.equal(result.capacityHours, 40);
  });

  it("test 2: 6h/day member has 30h weekly capacity", () => {
    const { rangeStart, rangeEnd } = weekRange();
    const result = calculateResourceWorkload({
      member: memberFixture({ hoursPerDay: 6 }),
      organization: { hoursPerDay: 8, holidays: [] },
      tasks: [],
      leaves: [],
      rangeStart,
      rangeEnd,
    });
    assert.equal(result.capacityHours, 30);
  });

  it("test 3: organization holiday capacity is 0", () => {
    const date = d("2026-09-09");
    const daily = getDailyCapacity({
      date,
      schedule: defaultWorkingSchedule(),
      resourceSettings: { hoursPerDay: 8 },
      holidays: [{ name: "Holiday", dateKey: "2026-09-09", isActive: true }],
      leaves: [],
    });
    assert.equal(daily.capacityHours, 0);
    assert.equal(daily.reason, "holiday");
  });

  it("test 4: approved leave capacity is 0", () => {
    const date = d("2026-09-10");
    const daily = getDailyCapacity({
      date,
      schedule: defaultWorkingSchedule(),
      resourceSettings: { hoursPerDay: 8 },
      holidays: [],
      leaves: [
        {
          status: "approved",
          startDate: d("2026-09-10"),
          endDate: d("2026-09-10"),
        },
      ],
    });
    assert.equal(daily.capacityHours, 0);
    assert.equal(daily.reason, "leave");
  });

  it("test 5: holiday + leave same day does not double-subtract", () => {
    const { rangeStart, rangeEnd } = weekRange();
    const result = calculateResourceWorkload({
      member: memberFixture({ hoursPerDay: 8 }),
      organization: {
        hoursPerDay: 8,
        holidays: [{ name: "Holiday", dateKey: "2026-09-09", isActive: true }],
      },
      tasks: [],
      leaves: [
        {
          status: "approved",
          startDate: d("2026-09-09"),
          endDate: d("2026-09-09"),
        },
      ],
      rangeStart,
      rangeEnd,
    });
    assert.equal(result.capacityHours, 32);
  });

  it("pending leave does not reduce capacity", () => {
    const date = d("2026-09-10");
    const daily = getDailyCapacity({
      date,
      schedule: defaultWorkingSchedule(),
      resourceSettings: { hoursPerDay: 8 },
      holidays: [],
      leaves: [
        {
          status: "pending",
          startDate: d("2026-09-10"),
          endDate: d("2026-09-10"),
        },
      ],
    });
    assert.equal(daily.capacityHours, 8);
  });
});

describe("resource planning allocation", () => {
  it("test 6: 20h effort over 5 valid days is 4h/day", () => {
    const task = {
      effortHours: 20,
      assignee: "amit",
      startDate: d("2026-09-07"),
      dueDate: d("2026-09-11"),
      workingDays: [1, 2, 3, 4, 5],
    };
    const result = calculateTaskAllocation({
      task,
      userId: "amit",
      schedule: defaultWorkingSchedule(),
      resourceSettings: { hoursPerDay: 8 },
      holidays: [],
      leaves: [],
    });
    assert.equal(result.validDayCount, 5);
    assert.equal(result.hoursPerDay, 4);
  });

  it("test 7: holiday redistributes remaining valid dates", () => {
    const task = {
      effortHours: 20,
      assignee: "amit",
      startDate: d("2026-09-07"),
      dueDate: d("2026-09-11"),
      workingDays: [1, 2, 3, 4, 5],
    };
    const result = calculateTaskAllocation({
      task,
      userId: "amit",
      schedule: defaultWorkingSchedule(),
      resourceSettings: { hoursPerDay: 8 },
      holidays: [{ name: "Holiday", dateKey: "2026-09-09", isActive: true }],
      leaves: [],
    });
    assert.equal(result.validDayCount, 4);
    assert.equal(result.hoursPerDay, 5);
    assert.equal(result.perDay.get("2026-09-09"), undefined);
  });

  it("test 8: overallocation availability and utilization", () => {
    const availability = calculateMemberAvailability(8, 10);
    const utilization = calculateMemberUtilization(8, 10);
    const over = calculateOverallocation(8, 10);
    assert.equal(availability, -2);
    assert.equal(utilization, 125);
    assert.equal(over.status, "OVERALLOCATED");
  });

  it("test 9: multiple assignees split effort equally", () => {
    const task = {
      effortHours: 20,
      assignees: ["amit", "rahul"],
      startDate: d("2026-09-07"),
      dueDate: d("2026-09-11"),
      workingDays: [1, 2, 3, 4, 5],
    };
    assert.equal(effortShareForUser(task, "amit"), 10);
    assert.equal(effortShareForUser(task, "rahul"), 10);
    const amit = calculateTaskAllocation({
      task,
      userId: "amit",
      schedule: defaultWorkingSchedule(),
      resourceSettings: { hoursPerDay: 8 },
    });
    assert.equal(amit.hoursPerDay, 2);
  });

  it("does not use duration as effort", () => {
    const task = {
      durationHours: 72,
      effortHours: 18,
      assignee: "amit",
      startDate: d("2026-09-07"),
      dueDate: d("2026-09-18"),
      workingDays: [1, 2, 3, 4, 5],
    };
    const result = calculateTaskAllocation({
      task,
      userId: "amit",
      schedule: defaultWorkingSchedule(),
      resourceSettings: { hoursPerDay: 8 },
    });
    assert.equal(result.share, 18);
  });
});

describe("holiday sync", () => {
  it("test 10: calculations keep using stored holidays when Calendarific is down", async () => {
    await assert.rejects(
      () =>
        syncPublicHolidays(
          { holidays: [{ name: "Stored", dateKey: "2026-01-26", isActive: true }] },
          {
            year: 2026,
            apiKey: "test",
            fetchImpl: async () => {
              throw new Error("network");
            },
          }
        ),
      /network/
    );

    const daily = getDailyCapacity({
      date: d("2026-01-26"),
      schedule: defaultWorkingSchedule(),
      resourceSettings: { hoursPerDay: 8 },
      holidays: [{ name: "Republic Day", dateKey: "2026-01-26", isActive: true }],
      leaves: [],
    });
    assert.equal(daily.capacityHours, 0);
    assert.equal(daily.reason, "holiday");
  });

  it("test 11: duplicate holiday sync updates instead of inserting", () => {
    const existing = [
      {
        name: "Republic Day",
        dateKey: "2026-01-26",
        source: "calendarific",
        externalId: "in/republic-day",
        isActive: true,
      },
    ];
    const incoming = [
      {
        name: "Republic Day",
        primary_type: "National holiday",
        type: ["National holiday"],
        date: { iso: "2026-01-26" },
        urlid: "in/republic-day",
        description: "Updated",
      },
    ];
    const first = upsertHolidays(existing, incoming);
    const second = upsertHolidays(first.holidays, incoming);
    assert.equal(second.holidays.length, 1);
    assert.equal(second.imported, 0);
    assert.equal(second.updated, 1);
  });

  it("test 12: 2026 holidays do not affect 2027 unless recurring", () => {
    const holidays = [
      { name: "Diwali", dateKey: "2026-11-08", isActive: true, isRecurring: false },
      { name: "Independence Day", dateKey: "2026-08-15", isActive: true, isRecurring: true },
    ];
    const diwali2027 = getDailyCapacity({
      date: d("2027-11-08"),
      schedule: defaultWorkingSchedule(),
      resourceSettings: { hoursPerDay: 8 },
      holidays,
      leaves: [],
    });
    assert.equal(diwali2027.reason, "working");
    assert.equal(diwali2027.capacityHours, 8);

    const independence2027 = getDailyCapacity({
      date: d("2027-08-15"),
      schedule: mergeWorkingSchedule({ saturday: { enabled: false }, sunday: { enabled: false } }),
      resourceSettings: { hoursPerDay: 8 },
      holidays,
      leaves: [],
    });
    assert.equal(independence2027.reason, "holiday");
    assert.equal(independence2027.capacityHours, 0);
  });

  it("skips observances that are not public holidays", () => {
    assert.equal(
      isRelevantPublicHoliday({
        name: "Halloween",
        primary_type: "Observance",
        type: ["Observance"],
      }),
      false
    );
    assert.equal(
      isRelevantPublicHoliday({
        name: "Independence Day",
        primary_type: "National holiday",
        type: ["National holiday"],
      }),
      true
    );
  });
});
