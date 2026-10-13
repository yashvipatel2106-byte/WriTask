const Holiday = require("../models/Holiday");

const HOLIDAY_COUNTRY = "India";
const HOLIDAY_STATE = "Gujarat";

const HOLIDAY_YEARS = [2026, 2027];

/*
 * 2026:
 * Gujarat Government General/Public Holiday notification.
 *
 * 2027:
 * Preloaded Gujarat holiday calendar data.
 *
 * IMPORTANT:
 * When the official Gujarat Government 2027 notification
 * is published, update only this data array.
 *
 * Do not reintroduce an external holiday API.
 */
const PUBLIC_HOLIDAYS = [
  // -----------------------------------------------------------------------
  // 2026
  // -----------------------------------------------------------------------

  {
    year: 2026,
    dateKey: "2026-01-14",
    name: "Makar Sankranti",
  },
  {
    year: 2026,
    dateKey: "2026-01-26",
    name: "Republic Day",
  },
  {
    year: 2026,
    dateKey: "2026-03-04",
    name: "Holi - 2nd Day (Dhuleti)",
  },
  {
    year: 2026,
    dateKey: "2026-03-21",
    name: "Ramzan-Eid (Eid-Ul-Fitra)",
  },
  {
    year: 2026,
    dateKey: "2026-03-26",
    name: "Shree Ram Navmi",
  },
  {
    year: 2026,
    dateKey: "2026-03-31",
    name: "Mahavir Janma Kalyanak",
  },
  {
    year: 2026,
    dateKey: "2026-04-03",
    name: "Good Friday",
  },
  {
    year: 2026,
    dateKey: "2026-04-14",
    name: "Dr. Baba Saheb Ambedkar's Birthday",
  },
  {
    year: 2026,
    dateKey: "2026-05-27",
    name: "Eid-Ul-Adha (Bakri-Eid)",
  },
  {
    year: 2026,
    dateKey: "2026-08-15",
    name: "Independence Day / Parsi New Year",
  },
  {
    year: 2026,
    dateKey: "2026-08-28",
    name: "Raksha Bandhan",
  },
  {
    year: 2026,
    dateKey: "2026-09-04",
    name: "Janmashtami",
  },
  {
    year: 2026,
    dateKey: "2026-09-15",
    name: "Samvatsari",
  },
  {
    year: 2026,
    dateKey: "2026-10-02",
    name: "Mahatma Gandhi Jayanti",
  },
  {
    year: 2026,
    dateKey: "2026-10-20",
    name: "Dusshera (Vijaya Dashmi)",
  },
  {
    year: 2026,
    dateKey: "2026-10-31",
    name: "Sardar Vallabhbhai Patel's Birthday",
  },
  {
    year: 2026,
    dateKey: "2026-11-10",
    name: "Vikram Samvat New Year Day",
  },
  {
    year: 2026,
    dateKey: "2026-12-25",
    name: "Christmas",
  },

  // -----------------------------------------------------------------------
  // 2027
  // -----------------------------------------------------------------------

  {
    year: 2027,
    dateKey: "2027-01-01",
    name: "New Year's Day",
  },
  {
    year: 2027,
    dateKey: "2027-01-14",
    name: "Makar Sankranti",
  },
  {
    year: 2027,
    dateKey: "2027-01-26",
    name: "Republic Day",
  },
  {
    year: 2027,
    dateKey: "2027-03-06",
    name: "Maha Shivratri",
  },
  {
    year: 2027,
    dateKey: "2027-03-10",
    name: "Ramzan-Eid (Eid-Ul-Fitra)",
  },
  {
    year: 2027,
    dateKey: "2027-03-22",
    name: "Holi - 2nd Day (Dhuleti)",
  },
  {
    year: 2027,
    dateKey: "2027-03-26",
    name: "Good Friday",
  },
  {
    year: 2027,
    dateKey: "2027-04-14",
    name: "Dr. Baba Saheb Ambedkar's Birthday",
  },
  {
    year: 2027,
    dateKey: "2027-04-15",
    name: "Shree Ram Navmi",
  },
  {
    year: 2027,
    dateKey: "2027-05-17",
    name: "Eid-Ul-Adha (Bakri-Eid)",
  },
  {
    year: 2027,
    dateKey: "2027-06-15",
    name: "Muharram (Ashoora)",
  },
  {
    year: 2027,
    dateKey: "2027-08-15",
    name: "Independence Day / Parsi New Year / Eid-e-Milad",
  },
  {
    year: 2027,
    dateKey: "2027-08-17",
    name: "Raksha Bandhan",
  },
  {
    year: 2027,
    dateKey: "2027-08-25",
    name: "Janmashtami",
  },
  {
    year: 2027,
    dateKey: "2027-09-04",
    name: "Samvatsari / Ganesh Chaturthi",
  },
  {
    year: 2027,
    dateKey: "2027-10-02",
    name: "Mahatma Gandhi Jayanti",
  },
  {
    year: 2027,
    dateKey: "2027-10-10",
    name: "Dusshera (Vijaya Dashmi)",
  },
  {
    year: 2027,
    dateKey: "2027-10-29",
    name: "Diwali",
  },
  {
    year: 2027,
    dateKey: "2027-10-30",
    name: "Vikram Samvat New Year Day",
  },
  {
    year: 2027,
    dateKey: "2027-10-31",
    name: "Sardar Vallabhbhai Patel's Birthday / Bhai Bij",
  },
  {
    year: 2027,
    dateKey: "2027-11-14",
    name: "Guru Nanak's Birthday",
  },
  {
    year: 2027,
    dateKey: "2027-12-25",
    name: "Christmas",
  },
];

function dateFromKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      12,
      0,
      0
    )
  );
}

async function ensureOrganizationHolidays(organizationId) {
  if (!organizationId) {
    throw new Error("Organization ID is required");
  }

  const operations = PUBLIC_HOLIDAYS.map((holiday) => ({
    updateOne: {
      filter: {
        organizationId,
        dateKey: holiday.dateKey,
        name: holiday.name,
      },
      update: {
        $setOnInsert: {
          organizationId,
          name: holiday.name,
          date: dateFromKey(holiday.dateKey),
          dateKey: holiday.dateKey,
          year: holiday.year,
          description: "",
          country: HOLIDAY_COUNTRY,
          state: HOLIDAY_STATE,
          source: "government",
          isEnabled: true,
        },
      },
      upsert: true,
    },
  }));

  if (operations.length) {
    await Holiday.bulkWrite(operations, {
      ordered: false,
    });
  }

  return Holiday.find({
    organizationId,
    year: { $in: HOLIDAY_YEARS },
  })
    .sort({ dateKey: 1 })
    .lean();
}

async function getOrganizationHolidays(
  organizationId,
  year
) {
  const filter = {
    organizationId,
  };

  if (year) {
    filter.year = Number(year);
  }

  return Holiday.find(filter)
    .sort({
      dateKey: 1,
      name: 1,
    })
    .lean();
}

async function getEnabledOrganizationHolidays(
  organizationId,
  year
) {
  const filter = {
    organizationId,
    isEnabled: true,
  };

  if (year) {
    filter.year = Number(year);
  }

  return Holiday.find(filter)
    .sort({
      dateKey: 1,
    })
    .lean();
}

module.exports = {
  HOLIDAY_YEARS,
  PUBLIC_HOLIDAYS,
  ensureOrganizationHolidays,
  getOrganizationHolidays,
  getEnabledOrganizationHolidays,
};