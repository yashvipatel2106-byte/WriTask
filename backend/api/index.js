// Vercel auto-detects any file under /api as a serverless function (zero
// config, no "builds" entry needed) — this just re-exports the existing
// Express app so nothing about config/server.js has to move or change.
module.exports = require("../config/server.js");
