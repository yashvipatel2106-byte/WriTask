import type { Country } from "@/lib/constants/countries";

export const COUNTRY_DIAL_CODES: Record<Country, string> = {
  Afghanistan: "+93",
  Albania: "+355",
  Algeria: "+213",
  Argentina: "+54",
  Australia: "+61",
  Austria: "+43",
  Bangladesh: "+880",
  Belgium: "+32",
  Brazil: "+55",
  Canada: "+1",
  Chile: "+56",
  China: "+86",
  Colombia: "+57",
  Denmark: "+45",
  Egypt: "+20",
  Finland: "+358",
  France: "+33",
  Germany: "+49",
  Greece: "+30",
  "Hong Kong": "+852",
  India: "+91",
  Indonesia: "+62",
  Ireland: "+353",
  Israel: "+972",
  Italy: "+39",
  Japan: "+81",
  Kenya: "+254",
  Malaysia: "+60",
  Mexico: "+52",
  Netherlands: "+31",
  "New Zealand": "+64",
  Nigeria: "+234",
  Norway: "+47",
  Pakistan: "+92",
  Philippines: "+63",
  Poland: "+48",
  Portugal: "+351",
  Qatar: "+974",
  Russia: "+7",
  "Saudi Arabia": "+966",
  Singapore: "+65",
  "South Africa": "+27",
  "South Korea": "+82",
  Spain: "+34",
  "Sri Lanka": "+94",
  Sweden: "+46",
  Switzerland: "+41",
  Taiwan: "+886",
  Thailand: "+66",
  Turkey: "+90",
  Ukraine: "+380",
  "United Arab Emirates": "+971",
  "United Kingdom": "+44",
  "United States": "+1",
  Vietnam: "+84",
};

/** Unique dial codes for the standalone country-code dropdown, sorted numerically. */
export const DIAL_CODE_OPTIONS = Array.from(
  new Set(Object.values(COUNTRY_DIAL_CODES))
).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

/**
 * Reverse lookup for auto-selecting a country from a chosen dial code. A few
 * dial codes are shared by multiple countries (e.g. +1 for Canada/United
 * States) — first entry declared in COUNTRY_DIAL_CODES wins as the default.
 */
export const DIAL_CODE_TO_COUNTRY: Record<string, Country> = Object.entries(
  COUNTRY_DIAL_CODES
).reduce(
  (acc, [country, dialCode]) => {
    if (!(dialCode in acc)) acc[dialCode] = country as Country;
    return acc;
  },
  {} as Record<string, Country>
);
