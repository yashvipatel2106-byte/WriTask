// Pure helpers for importing public holidays from Calendarific into an
// organization's stored holiday list. No database access happens here: callers
// pass in the current holidays and persist the returned list themselves.

const CALENDARIFIC_URL = "https://calendarific.com/api/v2/holidays";

function toDateKey(item) {
  const iso = item && item.date && item.date.iso;
  return iso ? String(iso).slice(0, 10) : null;
}

function isRelevantPublicHoliday(item) {
  if (!item) return false;
  const types = [item.primary_type, ...(Array.isArray(item.type) ? item.type : [])]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase());
  if (!types.length) return false;
  // Observances (Halloween, etc.) are not days off.
  if (types.every((t) => t.includes("observance"))) return false;
  return types.some(
    (t) => t.includes("national") || t.includes("public") || t.includes("bank")
  );
}

function externalIdFor(item) {
  return item.urlid || `${toDateKey(item)}:${item.name}`;
}

// Merge incoming Calendarific items into existing holidays.
// Matches on externalId (falling back to dateKey + name); matches are updated
// in place, new ones are appended.
function upsertHolidays(existing = [], incoming = []) {
  const holidays = existing.map((h) => ({ ...h }));
  let imported = 0;
  let updated = 0;

  for (const item of incoming) {
    const dateKey = toDateKey(item);
    if (!dateKey || !item.name) continue;
    const externalId = externalIdFor(item);

    const index = holidays.findIndex(
      (h) =>
        (h.externalId && h.externalId === externalId) ||
        (h.dateKey === dateKey && h.name === item.name)
    );

    const next = {
      name: item.name,
      dateKey,
      description: item.description || "",
      source: "calendarific",
      externalId,
      isActive: true,
    };

    if (index >= 0) {
      holidays[index] = { ...holidays[index], ...next };
      updated += 1;
    } else {
      holidays.push(next);
      imported += 1;
    }
  }

  return { holidays, imported, updated };
}

// Fetch a year of public holidays and merge them. Rejects when the provider
// cannot be reached so callers keep using the holidays already stored.
async function syncPublicHolidays(
  organization,
  { year, apiKey, country = "IN", fetchImpl = globalThis.fetch } = {}
) {
  if (!apiKey) throw new Error("Calendarific API key is required");
  if (!year) throw new Error("year is required");

  const url = `${CALENDARIFIC_URL}?${new URLSearchParams({
    api_key: apiKey,
    country,
    year: String(year),
  })}`;

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Holiday provider responded with ${response.status}`);
  }
  const body = await response.json();
  const items = (body?.response?.holidays || []).filter(isRelevantPublicHoliday);

  return upsertHolidays(organization?.holidays || [], items);
}

module.exports = { upsertHolidays, isRelevantPublicHoliday, syncPublicHolidays };
