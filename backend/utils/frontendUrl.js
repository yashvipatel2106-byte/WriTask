/**
 * Canonical email form for invite / login comparisons.
 */
function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

/**
 * Prefer the Origin of the app that sent the invite (localhost or tunnel),
 * so email links match where the team is actually working.
 * Falls back to FRONTEND_URL, then localhost.
 */
function resolveFrontendUrl(req) {
  const headerOrigin = req?.get?.("origin");
  const referer = req?.get?.("referer");

  for (const raw of [headerOrigin, referer]) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return `${url.protocol}//${url.host}`;
      }
    } catch {
      // ignore invalid header
    }
  }

  const fromEnv = process.env.FRONTEND_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }

  return "http://localhost:3000";
}

module.exports = {
  normalizeEmail,
  resolveFrontendUrl,
};
