const DEFAULT_HOURS_PER_DAY = 8;

function normalizeHoursPerDay(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_HOURS_PER_DAY;
  const clamped = Math.min(24, Math.max(1, n));
  return Math.round(clamped * 2) / 2;
}

module.exports = {
  DEFAULT_HOURS_PER_DAY,
  normalizeHoursPerDay,
};
