/**
 * Timed probe for notification APIs. Token via env WRITASK_BEARER (never logged).
 * Usage: node scripts/probe-notifications.js
 */
const http = require("http");

const TOKEN = process.env.WRITASK_BEARER || "";
const ORG = process.env.WRITASK_ORG || "6a571bc0122adf38c1de7f9e";
const HOST = "localhost";
const PORT = Number(process.env.PORT || 5000);

if (!TOKEN) {
  console.error("Set WRITASK_BEARER env var");
  process.exit(1);
}

function request(method, path, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const started = process.hrtime.bigint();
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path,
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const ms = Number(process.hrtime.bigint() - started) / 1e6;
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            /* keep raw */
          }
          resolve({
            method,
            path,
            status: res.statusCode,
            timeMs: Math.round(ms),
            requestBody: body || null,
            payload: parsed,
          });
        });
      }
    );
    req.on("error", (err) => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      resolve({
        method,
        path,
        status: 0,
        timeMs: Math.round(ms),
        requestBody: body || null,
        payload: { error: err.message },
      });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function summarizePayload(payload) {
  if (Array.isArray(payload)) {
    return {
      type: "array",
      count: payload.length,
      sample: payload[0]
        ? {
            _id: payload[0]._id,
            type: payload[0].type,
            title: payload[0].title,
            read: payload[0].read,
            createdAt: payload[0].createdAt,
          }
        : null,
    };
  }
  if (payload && typeof payload === "object") {
    const copy = { ...payload };
    if (copy._id) return { type: "object", keys: Object.keys(copy), _id: copy._id, message: copy.message, unreadCount: copy.unreadCount, title: copy.title, read: copy.read, archived: copy.archived };
    return { type: "object", keys: Object.keys(copy), value: copy };
  }
  return payload;
}

(async () => {
  const list = await request(
    "GET",
    `/api/notifications?limit=10&organizationId=${ORG}`
  );
  const summary = await request(
    "GET",
    `/api/notifications/summary?organizationId=${ORG}`
  );

  let createdId = null;
  const created = await request("POST", "/api/notifications", {
    title: "Swagger probe",
    message: "Temporary notification for API timing table",
    type: "system",
    priority: "Low",
  });
  if (created.payload && created.payload._id) createdId = created.payload._id;

  let readOne = null;
  let archived = null;
  if (createdId) {
    readOne = await request("PUT", `/api/notifications/${createdId}/read`);
    archived = await request("PUT", `/api/notifications/${createdId}/archive`);
  }

  // Avoid marking ALL user notifications read in prod-like probe — skip read-all
  // unless explicitly enabled.
  let readAll = null;
  if (process.env.PROBE_READ_ALL === "1") {
    readAll = await request("PUT", "/api/notifications/read-all");
  }

  const rows = [list, summary, created, readOne, archived, readAll].filter(Boolean);
  const out = rows.map((r) => ({
    method: r.method,
    endpoint: r.path,
    status: r.status,
    timeMs: r.timeMs,
    requestBody: r.requestBody,
    responseSummary: summarizePayload(r.payload),
  }));

  console.log(JSON.stringify({ probedAt: new Date().toISOString(), rows: out }, null, 2));
})();
