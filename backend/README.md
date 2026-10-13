# WriTask Backend

Express + MongoDB API for **WriTask** — organisations, projects, tasks, calendar, live meetings, workload, reports, and notifications.

## Stack

- **Node.js** 22.x · **Express** 5 · **MongoDB** via **Mongoose** 9
- **Socket.IO** (meeting rooms / WebRTC signaling)
- **JWT** auth · **Google** ID token verification
- **BullMQ** / Redis (queues where configured) · **node-cron** (weekly reports)
- **Nodemailer** · **Puppeteer** (PDF reports) · **multer** / **xlsx** (imports)

## Prerequisites

- Node.js **22.x**
- MongoDB (local or Atlas)
- Optional: Redis (BullMQ), SMTP credentials, Google OAuth client

## Setup

```bash
cd backend
npm install
```

Create `.env` in this folder:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/writask
JWT_SECRET=replace-with-a-long-random-string
FRONTEND_URL=http://localhost:3000

# Optional — Google Sign-In (must match frontend NEXT_PUBLIC_GOOGLE_CLIENT_ID)
GOOGLE_CLIENT_ID=

# Optional — email
SMTP_HOST=
SMTP_PORT=587
SMTP_EMAIL=
SMTP_PASSWORD=

# Optional — weekly reports
WEEKLY_REPORT_ENABLED=true
WEEKLY_REPORT_CRON=0 9 * * 1
WEEKLY_REPORT_TZ=Asia/Kolkata
```

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Signs access tokens |
| `PORT` | No | Default `5000` |
| `FRONTEND_URL` | Recommended | Used for meeting links, invites, password reset URLs |
| `GOOGLE_CLIENT_ID` | No | Google OAuth audience |
| `SMTP_*` | No | Outbound mail |
| `WEEKLY_REPORT_*` | No | Cron schedule for weekly reports |

## Scripts

```bash
npm run dev      # nodemon → config/server.js
npm start        # node config/server.js
```

Health check: `GET http://localhost:5000/` → `{ "message": "Login backend is running" }`

## API surface (prefix `/api`)

| Mount | Purpose |
|---|---|
| `/auth` | Register, login, Google, password reset |
| `/profile`, `/settings`, `/change-password` | User account |
| `/organizations` | Orgs, members, roles |
| `/organisations` | **Calendar** + meeting start/join/end (org-scoped) |
| `/meetings` | Resolve shareable meeting by `roomId` |
| `/projects`, `/tasks`, `/tasks/import` | Projects, tasks, Excel import |
| `/dashboard` | Stats, charts, workload, deadlines |
| `/workload` | Capacity views |
| `/members`, `/notifications`, `/activity` | People & activity |
| `/search`, `/trash`, `/reports` | Search, soft-delete, reports |

Auth: `Authorization: Bearer <jwt>` on protected routes. Org RBAC via `requireOrgRole(...)`.

## Notable features

### Calendar

- `GET /organisations/:orgId/calendar?month=YYYY-MM` — aggregation (`$match` + `$lookup`) for events, assignees, creator, and linked tasks
- `GET …/calendar/members` — members + monthly event counts in one pipeline
- `POST …/calendar/sync-tasks` — task due-dates → calendar events (`bulkWrite`); also synced incrementally when tasks change
- Meeting events: start / join / end + shareable room links

### Dashboard

Aggregation / batched queries for:

- `/dashboard/overview` — one dashboard-screen request. Use `include=stats,workload,upcomingDeadlines,missedDeadlines,notifications` with `organizationId` or `personal=true`, plus optional workload `startDate` / `endDate`.
- `/dashboard/stats` (`$facet` task counts)
- `/dashboard/task-overview` (`$group` by status)
- `/dashboard/project-progress` (project → task `$lookup`)
- `/dashboard/team-workload` (capacity per member; also included via `/overview`)
- upcoming / missed deadlines (`$lookup` project titles)

### Meetings (Socket.IO)

Initialized in `config/server.js` via `socket/`. Clients connect to the server origin (no `/api` suffix). Room signaling lives under `socket/meetingHandler.js`.

## Project layout

```
backend/
├── config/          # server.js, db.js
├── controllers/     # route handlers (calendar, dashboard, tasks, …)
├── models/          # Mongoose schemas + indexes
├── routes/          # Express routers
├── middleware/      # auth, RBAC, uploads
├── socket/          # Socket.IO + meeting WebRTC signaling
├── utils/           # queries, calendar sync, email, access helpers
├── jobs/ · scheduler/ · services/
└── .env             # local secrets (not committed)
```

## Indexes

Calendar and task collections include compound indexes for org + date range, assignee visibility, and due-date / status filters. Indexes are declared on the Mongoose schemas and applied when the app connects.

## Related

Frontend docs: [`../frontend/README.md`](../frontend/README.md)
