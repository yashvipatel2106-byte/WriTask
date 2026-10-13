const express = require("express");
const router  = express.Router({ mergeParams: true }); // inherits :orgId from parent
const authMiddleware             = require("../middleware/authMiddleware");
const { requireOrgRole }         = require("../middleware/orgRbacMiddleware");


const {
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getOrgMembersWithStats,
  getMemberAssignedTasks,
  syncTasksToCalendar,
  startMeeting,
  endMeeting,
  joinMeeting,
  getMeetingByRoomId,
} = require("../controllers/Calendarcontroller");


// All routes require a logged-in user
router.use(authMiddleware);

// ── members (for populating the sidebar panel) ────────────────────────────
// GET  /api/organisations/:orgId/calendar/members
router.get("/:orgId/calendar/members", requireOrgRole("org:read"), getOrgMembersWithStats);

// GET  /api/organisations/:orgId/calendar/members/:memberId/tasks
router.get(
  "/:orgId/calendar/members/:memberId/tasks",
  requireOrgRole("org:read"),
  getMemberAssignedTasks
);

// ── task sync ─────────────────────────────────────────────────────────────
// POST /api/organisations/:orgId/calendar/sync-tasks
router.post(
  "/:orgId/calendar/sync-tasks",
  requireOrgRole("org:read"),
  syncTasksToCalendar
);

// Meeting by room (must be before :eventId routes that could collide)
router.get(
  "/:orgId/calendar/meeting/:roomId",
  requireOrgRole("org:read"),
  getMeetingByRoomId
);

// ── events CRUD ───────────────────────────────────────────────────────────
// GET  /api/organisations/:orgId/calendar          ?month=YYYY-MM  [&userId=xxx]
router.get("/:orgId/calendar",                requireOrgRole("org:read"),   getCalendarEvents);

// POST /api/organisations/:orgId/calendar
router.post("/:orgId/calendar",               requireOrgRole("org:read"),   createCalendarEvent);

// PUT  /api/organisations/:orgId/calendar/:eventId
router.put("/:orgId/calendar/:eventId",        requireOrgRole("org:read"),   updateCalendarEvent);

// DELETE /api/organisations/:orgId/calendar/:eventId
router.delete("/:orgId/calendar/:eventId",     requireOrgRole("org:read"),   deleteCalendarEvent);

// Meeting Routes 
router.post("/:orgId/calendar/:eventId/start",requireOrgRole("org:read"),startMeeting );
router.post("/:orgId/calendar/:eventId/end",requireOrgRole("org:read"),endMeeting);  
router.post("/:orgId/calendar/:eventId/join", requireOrgRole("org:read"), joinMeeting);

module.exports = router;