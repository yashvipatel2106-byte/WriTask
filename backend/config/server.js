const path = require('node:path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { corsOriginOption } = require('./corsOrigins');
const dotenv = require('dotenv');
const connectDB = require('./db');
const authRoutes = require('../routes/authRoutes');
const profileRoutes = require("../routes/profileRoutes");
const settingsRoutes = require("../routes/settingsRoutes");
const passwordRoutes = require("../routes/passwordRoutes");
const activityRoutes = require("../routes/activityRoutes");
const projectRoutes = require("../routes/projectRoutes");
const notificationRoutes = require('../routes/notificationRoutes');
const authMiddleware = require('../middleware/authMiddleware');
const { getUpcomingTasks } = require('../controllers/taskController');
const memberRoutes = require('../routes/memberRoutes');
const taskRoutes = require("../routes/taskRoutes");
const organizationRoutes = require("../routes/organizationRoutes");
const searchRoutes = require("../routes/searchRoutes");
const dashboardRoutes = require('../routes/dashboardRoutes');
const trashRoutes = require('../routes/trashRoutes');
const calendarRoutes = require("../routes/calendarRoutes");
const leaveRoutes = require("../routes/leaveRoutes");
const workloadRoutes = require("../routes/workloadRoutes");
const testRoutes = require('../routes/testRoutes'); // Import the test routes
const reportRoutes = require('../routes/reportRoutes'); // Import the report routes
const taskImportRoutes = require('../routes/taskImportRoutes'); // Import the task import routes
const { getMetricsRequestHandler } = require('./telemetry');
const contactRoutes = require('../routes/contactRoutes');
const customFieldRoutes = require('../routes/customFieldRoutes');
const requestFormRoutes = require("../routes/requestFormRoutes");
const presenceRoutes = require("../routes/presenceRoutes");
 
dotenv.config({ path: path.resolve(__dirname, '../.env') });
// Fallback: directly parse the backend .env file if dotenv didn't set variables
if (!process.env.MONGO_URI) {
  try {
    const fs = require('fs');
    const parsed = require('dotenv').parse(
      fs.readFileSync(path.resolve(__dirname, '../.env'))
    );
    Object.keys(parsed).forEach((k) => {
      if (!process.env[k]) process.env[k] = parsed[k];
    });
  } catch (e) {
    console.error('fallback .env load failed:', e.message);
  }
}
const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);
const { initializeSocket } = require('../socket/socket');

initializeSocket(server);



// Fail fast when required secrets are missing.
const missingEnv = ['JWT_SECRET', 'MONGO_URI'].filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  if (!process.env.VERCEL) process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

// Needed so rate limiting sees the real client IP behind a proxy / Vercel.
app.set('trust proxy', 1);
app.use(
  helmet({
    // Swagger UI needs inline scripts; uploads are loaded cross-origin.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors({ origin: corsOriginOption(), credentials: true }));
app.use(express.json());
app.use(require('../middleware/sanitizeServerErrors'));

// Prometheus metrics: in production require METRICS_TOKEN (Bearer); disabled if unset.
const metricsGuard = (req, res, next) => {
  if (!isProduction) return next();
  const token = process.env.METRICS_TOKEN;
  if (!token) return res.status(404).end();
  if (req.get('authorization') !== `Bearer ${token}`) return res.status(401).end();
  next();
};
app.get(['/metrics', '/api/metrics'], metricsGuard, getMetricsRequestHandler);

// Swagger / OpenAPI docs: hidden in production unless ENABLE_API_DOCS=true
if (!isProduction || process.env.ENABLE_API_DOCS === 'true') {
  const swaggerUi = require("swagger-ui-express");
  const { swaggerSpec, swaggerUiOptions } = require("./swagger");
  app.get("/api/docs.json", (_req, res) => res.json(swaggerSpec));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
}

// Log requests only in development
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/notifications', notificationRoutes);
app.get('/api/tasks/upcoming', authMiddleware, getUpcomingTasks);
app.use("/api/tasks/import", taskImportRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/time-entries", require("../routes/timeEntriesGlobalRoutes"));
app.use('/api/members', memberRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/change-password",passwordRoutes);
app.use("/api/activity",activityRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/organisations", calendarRoutes); // Mount calendar routes under /api/organisations
app.use("/api/organisations", leaveRoutes); // Mount leave routes under /api/organisations
app.use("/api/meetings", require("../routes/meetingRoutes"));
app.use("/api/trash", trashRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/workload", workloadRoutes);
// Dev-only email test endpoint (never mounted in production).
if (!isProduction) app.use('/api/test', authMiddleware, require('../routes/testRoutes'));
app.use("/api/reports", reportRoutes); // Mount report routes under /api/reports
app.use("/api/contact", contactRoutes);
app.use("/api/custom-fields", customFieldRoutes);
app.use("/api/request-forms", requestFormRoutes);
app.use("/api/presence", presenceRoutes);
app.use("/api/workspaces", require("../routes/workspaceRoutes"));
app.use("/api/folders", require("../routes/folderRoutes"));
app.use("/api/workspace-files", require("../routes/workspaceFileRoutes"));
// app.use(metricsMiddleware); // Add metrics middleware after all other routes
// Add this line to include the test routes
app.get('/', (req, res) => {
  res.json({
    message: 'WriTask backend is running',
    docs: '/api/docs',
    openapi: '/api/docs.json',
  });
});

// On Vercel, the exported `app` is invoked per-request by @vercel/node — it
// must never call server.listen() (no port to bind in a serverless runtime)
// or start long-running timers (cron/scheduler), since those don't survive
// between invocations and an unhandled rejection here previously crashed
// the whole function (FUNCTION_INVOCATION_FAILED) whenever listen() failed.
const isServerless = !!process.env.VERCEL;

connectDB()
  .then(() => {
    if (isServerless) return;

    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      try {
        const { startWeeklyReportScheduler } = require("../scheduler/cron");
        startWeeklyReportScheduler();
      } catch (error) {
        console.error("Failed to start weekly report scheduler:", error.message);
      }
      try {
        const { startReminderScheduler } = require("../jobs/reminderNotifier");
        startReminderScheduler();
      } catch (error) {
        console.error("Failed to start reminder scheduler:", error.message);
      }
      try {
        const { startPresenceSweeper } = require("../jobs/presenceSweeper");
        startPresenceSweeper();
      } catch (error) {
        console.error("Failed to start presence sweeper:", error.message);
      }
    });
    require('../jobs/scheduler').start();
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB:", error.message);
    if (!isServerless) process.exit(1);
  });

module.exports = app;