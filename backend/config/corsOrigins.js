// Allowed browser origins come from CORS_ORIGINS (comma-separated).
// When unset, the request origin is reflected (previous behaviour) and a
// warning is logged in production so the gap is visible.
function getAllowedOrigins() {
  return (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function corsOriginOption() {
  const allowed = getAllowedOrigins();
  if (allowed.length) return allowed;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[security] CORS_ORIGINS is not set - allowing every origin. Set it to your frontend URL(s)."
    );
  }
  return true;
}

module.exports = { getAllowedOrigins, corsOriginOption };
