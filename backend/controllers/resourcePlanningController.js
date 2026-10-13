const {
  getMemberCapacity,
  getMemberWorkingSchedule: resolveMemberWorkingSchedule,
  mergeWorkingSchedule,
  getOrganizationHolidays: resolveOrganizationHolidays,
  toDateKey,
  dateFromKey,
} = require("../services/resourcePlanningService");

const Holiday = require("../models/Holiday");

const {
  ensureOrganizationHolidays,
  getOrganizationHolidays:
    getStoredOrganizationHolidays,
} = require("../services/holidayService");
const { getTeamWorkloadData } = require("./dashboardController");

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function getMemberByUserId(organization, memberId) {
  if (!organization?.members || !memberId) return null;

  const id = String(memberId);

  return (
    organization.members.find((member) => {
      const userId = member?.user?._id || member?.user;
      return userId && String(userId) === id;
    }) || null
  );
}

function normalizeNumber(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function sanitizeResourceSettings(input = {}, current = {}) {
  return {
    enabled:
      input.enabled === undefined
        ? current.enabled !== false
        : Boolean(input.enabled),

    hoursPerDay: normalizeNumber(
      input.hoursPerDay,
      current.hoursPerDay ?? null,
      0,
      24
    ),

    hoursPerWeek: normalizeNumber(
      input.hoursPerWeek,
      current.hoursPerWeek ?? null,
      0,
      168
    ),

    utilizationTarget: normalizeNumber(
      input.utilizationTarget,
      current.utilizationTarget ?? 80,
      1,
      200
    ),
  };
}

function sanitizeDay(day = {}, fallback = {}) {
  return {
    enabled:
      day.enabled === undefined
        ? Boolean(fallback.enabled)
        : Boolean(day.enabled),

    startTime:
      typeof day.startTime === "string" &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(day.startTime)
        ? day.startTime
        : fallback.startTime || "09:00",

    endTime:
      typeof day.endTime === "string" &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(day.endTime)
        ? day.endTime
        : fallback.endTime || "18:00",

    breakMinutes: normalizeNumber(
      day.breakMinutes,
      fallback.breakMinutes ?? 60,
      0,
      1440
    ),
  };
}

function sanitizeWorkingSchedule(input, fallback) {
  const base = mergeWorkingSchedule(fallback);

  const source =
    input && typeof input === "object"
      ? input
      : {};

  const schedule = {
    timezone:
      typeof source.timezone === "string" &&
      source.timezone.trim()
        ? source.timezone.trim()
        : base.timezone,
  };

  for (const key of WEEKDAY_KEYS) {
    schedule[key] = sanitizeDay(
      source[key] || {},
      base[key]
    );
  }

  return schedule;
}

function sendError(res, error, fallback = "Server error") {
  console.error(
    "Resource planning controller error:",
    error
  );

  return res.status(error?.status || 500).json({
    message: error?.message || fallback,
  });
}

function validateHolidayDate(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) {
    return null;
  }

  const date = dateFromKey(dateKey);

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function buildHolidayPayload(body = {}) {
  const name = String(body.name || "").trim();
  const dateKey = String(body.dateKey || "").trim();

  const date = validateHolidayDate(dateKey);

  if (!name) {
    throw Object.assign(
      new Error("Holiday name is required"),
      { status: 400 }
    );
  }

  if (!date) {
    throw Object.assign(
      new Error(
        "A valid holiday date is required (YYYY-MM-DD)"
      ),
      { status: 400 }
    );
  }

  return {
    name,
    date,
    dateKey,

    description: String(
      body.description || ""
    ).trim(),

    source: "manual",

    externalId: "",

    isRecurring: Boolean(
      body.isRecurring
    ),

    isActive:
      body.isActive === undefined
        ? true
        : Boolean(body.isActive),
  };
}

function filterHolidaysByYear(holidays, year) {
  const targetYear = Number(year);

  if (!Number.isInteger(targetYear)) {
    return holidays;
  }

  return holidays.filter((holiday) => {
    const key =
      holiday.dateKey ||
      toDateKey(holiday.date);

    if (!key) {
      return false;
    }

    return (
      key.startsWith(`${targetYear}-`) ||
      Boolean(holiday.isRecurring)
    );
  });
}

/* -------------------------------------------------------------------------- */
/* MEMBER RESOURCE SETTINGS                                                   */
/* -------------------------------------------------------------------------- */

async function getMemberResourceSettings(req, res) {
  try {
    const organization = req.organization;

    const member = getMemberByUserId(
      organization,
      req.params.memberId
    );

    if (!member) {
      return res.status(404).json({
        message: "Organization member not found",
      });
    }

    return res.json({
      resourceSettings: getMemberCapacity(
        member,
        organization
      ),

      workingSchedule:
        resolveMemberWorkingSchedule(
          member,
          organization
        ),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function updateMemberResourceSettings(req, res) {
  try {
    const organization = req.organization;

    const member = getMemberByUserId(
      organization,
      req.params.memberId
    );

    if (!member) {
      return res.status(404).json({
        message: "Organization member not found",
      });
    }

    const current =
      member.resourceSettings || {};

    const incoming =
      req.body?.resourceSettings ||
      req.body ||
      {};

    member.resourceSettings =
      sanitizeResourceSettings(
        incoming,
        current
      );

    organization.markModified("members");

    await organization.save();

    return res.json({
      message:
        "Resource settings updated",

      resourceSettings:
        getMemberCapacity(
          member,
          organization
        ),

      workingSchedule:
        resolveMemberWorkingSchedule(
          member,
          organization
        ),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

/* -------------------------------------------------------------------------- */
/* MEMBER WORKING SCHEDULE                                                    */
/* -------------------------------------------------------------------------- */

async function getMemberWorkingSchedule(req, res) {
  try {
    const organization = req.organization;

    const member = getMemberByUserId(
      organization,
      req.params.memberId
    );

    if (!member) {
      return res.status(404).json({
        message: "Organization member not found",
      });
    }

    return res.json({
      workingSchedule:
        resolveMemberWorkingSchedule(
          member,
          organization
        ),

      resourceSettings:
        getMemberCapacity(
          member,
          organization
        ),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function updateMemberWorkingSchedule(req, res) {
  try {
    const organization = req.organization;

    const member = getMemberByUserId(
      organization,
      req.params.memberId
    );

    if (!member) {
      return res.status(404).json({
        message: "Organization member not found",
      });
    }

    const current =
      resolveMemberWorkingSchedule(
        member,
        organization
      );

    const incoming =
      req.body?.workingSchedule ||
      req.body ||
      {};

    member.workingSchedule =
      sanitizeWorkingSchedule(
        incoming,
        current
      );

    organization.markModified("members");

    await organization.save();

    return res.json({
      message:
        "Working schedule updated",

      workingSchedule:
        resolveMemberWorkingSchedule(
          member,
          organization
        ),

      resourceSettings:
        getMemberCapacity(
          member,
          organization
        ),
    });
  } catch (error) {
    return sendError(res, error);
  }
}
/* -------------------------------------------------------------------------- */
/* ORGANIZATION HOLIDAYS                                                       */
/* -------------------------------------------------------------------------- */

async function getOrganizationHolidays(req, res) {
  try {
    const organization = req.organization;

    const year = Number(req.query.year);

    let holidays =
      await getStoredOrganizationHolidays(
        organization._id,
        Number.isInteger(year)
          ? year
          : null
      );

    // Owner can see all holidays, including disabled holidays.
    // Other members can only see enabled holidays.
    if (req.orgRole !== "owner") {
      holidays = holidays.filter(
        (holiday) =>
          holiday.isEnabled !== false
      );
    }

    return res.json({
      calendar: {
        country: "India",
        state: "Gujarat",
      },

      holidays,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function createOrganizationHoliday(
  req,
  res
) {
  try {
    const organization = req.organization;

    const name = String(
      req.body?.name || ""
    ).trim();

    const dateKey = String(
      req.body?.dateKey || ""
    ).trim();

    const date = validateHolidayDate(
      dateKey
    );

    if (!name) {
      return res.status(400).json({
        message: "Holiday name is required",
      });
    }

    if (!date) {
      return res.status(400).json({
        message:
          "A valid holiday date is required (YYYY-MM-DD)",
      });
    }

    const duplicate =
      await Holiday.findOne({
        organizationId:
          organization._id,
        dateKey,
        name,
      });

    if (duplicate) {
      return res.status(409).json({
        message:
          "This organization holiday already exists",
      });
    }

    const holiday =
      await Holiday.create({
        organizationId:
          organization._id,

        name,

        date,

        dateKey,

        year: Number(
          dateKey.slice(0, 4)
        ),

        description: String(
          req.body?.description || ""
        ).trim(),

        country: "India",

        state: "Gujarat",

        source: "manual",

        isEnabled:
  req.body?.isEnabled !== undefined
    ? Boolean(req.body.isEnabled)
    : req.body?.isActive !== undefined
      ? Boolean(req.body.isActive)
      : true,
      });

    return res.status(201).json({
      message:
        "Organization holiday created",

      holiday,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function updateOrganizationHoliday(
  req,
  res
) {
  try {
    const organization = req.organization;

    const holiday =
      await Holiday.findOne({
        _id:
          req.params.holidayId,

        organizationId:
          organization._id,
      });

    if (!holiday) {
      return res.status(404).json({
        message: "Holiday not found",
      });
    }

    if (
      req.body.name !== undefined
    ) {
      const name = String(
        req.body.name || ""
      ).trim();

      if (!name) {
        return res.status(400).json({
          message:
            "Holiday name is required",
        });
      }

      holiday.name = name;
    }

    if (
      req.body.dateKey !== undefined
    ) {
      const dateKey = String(
        req.body.dateKey || ""
      ).trim();

      const date =
        validateHolidayDate(
          dateKey
        );

      if (!date) {
        return res.status(400).json({
          message:
            "A valid holiday date is required (YYYY-MM-DD)",
        });
      }

      holiday.dateKey =
        dateKey;

      holiday.date =
        date;

      holiday.year =
        Number(
          dateKey.slice(0, 4)
        );
    }

    if (
      req.body.description !== undefined
    ) {
      holiday.description =
        String(
          req.body.description || ""
        ).trim();
    }

    /*
     * The frontend currently calls the field isActive.
     *
     * Keep accepting it so we don't unnecessarily
     * change the existing UI/form structure.
     *
     * Database uses isEnabled.
     */
    if (req.body.isEnabled !== undefined) {
  holiday.isEnabled = Boolean(
    req.body.isEnabled
  );
} else if (req.body.isActive !== undefined) {
  // Backward compatibility with the existing frontend.
  holiday.isEnabled = Boolean(
    req.body.isActive
  );
}

    await holiday.save();

    return res.json({
      message:
        "Organization holiday updated",

      holiday,
    });
  } catch (error) {
    return sendError(res, error);
  }
}



/* -------------------------------------------------------------------------- */
/* RESOURCE WORKLOAD / AVAILABILITY / UTILIZATION                             */
/* -------------------------------------------------------------------------- */

async function getResourceWorkload(req, res) {
  try {
    const data =
      await getTeamWorkloadData(
        req.user._id,
        {
          ...req.query,
          organizationId:
            req.params.orgId,
        }
      );

    return res.json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function getResourceAvailability(req, res) {
  try {
    const data =
      await getTeamWorkloadData(
        req.user._id,
        {
          ...req.query,
          organizationId:
            req.params.orgId,
        }
      );

    return res.json({
      members: data.members.map(
        (member) => ({
          _id: member._id,
          username: member.username,
          role: member.role,

          capacityHours:
            member.availableHours,

          allocatedEffortHours:
            member.allocatedHours,

          availableHours:
            member.remainingCapacity,

          utilization:
            member.utilization,

          utilizationTarget:
            member.utilizationTarget,

          overallocated:
            member.overallocated,

          overBy:
            member.overBy,

          resourceStatus:
            member.resourceStatus,

          dailyRows:
            member.dailyRows,
        })
      ),

      totalMembers:
        data.totalMembers,

      availableRoles:
        data.availableRoles,

      hoursPerDay:
        data.hoursPerDay,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function getResourceUtilization(req, res) {
  try {
    const data =
      await getTeamWorkloadData(
        req.user._id,
        {
          ...req.query,
          organizationId:
            req.params.orgId,
        }
      );

    return res.json({
      members: data.members.map(
        (member) => ({
          _id: member._id,
          username: member.username,
          role: member.role,

          capacityHours:
            member.availableHours,

          allocatedEffortHours:
            member.allocatedHours,

          utilization:
            member.utilization,

          utilizationTarget:
            member.utilizationTarget,

          aboveTarget:
            member.aboveTarget,

          overallocated:
            member.overallocated,

          overBy:
            member.overBy,

          resourceStatus:
            member.resourceStatus,
        })
      ),

      totalMembers:
        data.totalMembers,

      availableRoles:
        data.availableRoles,

      hoursPerDay:
        data.hoursPerDay,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  getMemberResourceSettings,
  updateMemberResourceSettings,

  getMemberWorkingSchedule,
  updateMemberWorkingSchedule,

  getOrganizationHolidays,
  createOrganizationHoliday,
  updateOrganizationHoliday,

  getResourceAvailability,
  getResourceUtilization,
  getResourceWorkload,
};