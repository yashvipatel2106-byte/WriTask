/**
 * OpenAPI 3 definition for WriTask API.
 * Served at GET /api/docs (Swagger UI) and GET /api/docs.json (raw spec).
 */
const swaggerJsdoc = require("swagger-jsdoc");

const PORT = process.env.PORT || 5000;
const serverUrl =
  process.env.API_PUBLIC_URL?.replace(/\/+$/, "") ||
  `http://localhost:${PORT}`;

const definition = {
  openapi: "3.0.3",
  info: {
    title: "WriTask API",
    version: "1.0.0",
    description:
      "REST API for WriTask — organisations, projects, tasks, calendar, leave, meetings, dashboard, and reports.\n\n" +
      "Most routes require `Authorization: Bearer <JWT>` from `/api/auth/login` or `/api/auth/google`.",
  },
  servers: [{ url: `${serverUrl}/api`, description: "API base" }],
  tags: [
    { name: "Auth" },
    { name: "Profile" },
    { name: "Organizations" },
    { name: "Projects" },
    { name: "Tasks" },
    { name: "Calendar" },
    { name: "Leave" },
    { name: "Dashboard" },
    { name: "Meetings" },
    { name: "Notifications" },
    { name: "Search" },
    { name: "Trash" },
    { name: "Reports" },
    { name: "Workload" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Paste the JWT from login / Google auth",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { message: { type: "string" } },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password" },
        },
      },
      NotificationActor: {
        type: "object",
        nullable: true,
        properties: {
          _id: { type: "string" },
          username: { type: "string" },
          email: { type: "string", format: "email" },
        },
      },
      Notification: {
        type: "object",
        properties: {
          _id: { type: "string" },
          user: { type: "string" },
          actor: { $ref: "#/components/schemas/NotificationActor" },
          type: {
            type: "string",
            enum: [
              "assignment",
              "mention",
              "comment",
              "status",
              "due_date",
              "invite",
              "system",
              "reply",
              "leave_requested",
              "leave_approved",
              "leave_rejected",
              "reminder",
            ],
          },
          title: { type: "string" },
          message: { type: "string" },
          taskId: { type: "string", nullable: true },
          projectId: { type: "string", nullable: true },
          priority: { type: "string", enum: ["Low", "Medium", "High"] },
          link: { type: "string" },
          read: { type: "boolean" },
          archived: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateNotificationRequest: {
        type: "object",
        required: ["title", "message"],
        properties: {
          title: { type: "string" },
          message: { type: "string" },
          type: { type: "string", default: "reply" },
          taskId: { type: "string", nullable: true },
          projectId: { type: "string", nullable: true },
          priority: { type: "string", enum: ["Low", "Medium", "High"], default: "Medium" },
          link: { type: "string" },
        },
      },
      NotificationSummary: {
        type: "object",
        properties: {
          unreadCount: { type: "integer", example: 3 },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        security: [],
        summary: "Register (sends OTP)",
        responses: { 200: { description: "OTP sent" } },
      },
    },
    "/auth/verify-otp": {
      post: {
        tags: ["Auth"],
        security: [],
        summary: "Verify signup OTP",
        responses: { 200: { description: "Account verified" } },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        security: [],
        summary: "Email / password login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
            },
          },
        },
        responses: { 200: { description: "JWT issued" }, 401: { description: "Invalid credentials" } },
      },
    },
    "/auth/google": {
      post: {
        tags: ["Auth"],
        security: [],
        summary: "Google Sign-In",
        responses: { 200: { description: "JWT issued" } },
      },
    },
    "/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        security: [],
        summary: "Request password reset email",
        responses: { 200: { description: "Email sent if account exists" } },
      },
    },
    "/auth/reset-password": {
      post: {
        tags: ["Auth"],
        security: [],
        summary: "Reset password with token",
        responses: { 200: { description: "Password updated" } },
      },
    },
    "/profile": {
      get: {
        tags: ["Profile"],
        summary: "Get current user profile",
        responses: { 200: { description: "Profile" } },
      },
    },
    "/organizations": {
      get: { tags: ["Organizations"], summary: "List my organisations", responses: { 200: { description: "List" } } },
      post: { tags: ["Organizations"], summary: "Create organisation", responses: { 201: { description: "Created" } } },
    },
    "/organizations/{orgId}": {
      get: {
        tags: ["Organizations"],
        summary: "Get organisation",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Organisation" } },
      },
    },
    "/organizations/{orgId}/members": {
      get: {
        tags: ["Organizations"],
        summary: "List organisation members",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Members" } },
      },
    },
    "/projects": {
      get: {
        tags: ["Projects"],
        summary: "List projects",
        parameters: [
          { name: "organizationId", in: "query", schema: { type: "string" } },
          { name: "personal", in: "query", schema: { type: "boolean" } },
        ],
        responses: { 200: { description: "Projects" } },
      },
      post: { tags: ["Projects"], summary: "Create project", responses: { 201: { description: "Created" } } },
    },
    "/projects/{projectId}": {
      get: {
        tags: ["Projects"],
        summary: "Get project",
        parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Project" }, 403: { description: "Not a member" } },
      },
      put: {
        tags: ["Projects"],
        summary: "Update project",
        parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Updated" } },
      },
    },
    "/projects/{projectId}/tasks": {
      get: {
        tags: ["Tasks"],
        summary: "List tasks in a project",
        parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Tasks" } },
      },
      post: {
        tags: ["Tasks"],
        summary: "Create task",
        parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 201: { description: "Created" }, 400: { description: "Validation / assignee on leave" } },
      },
    },
    "/projects/{projectId}/tasks/{taskId}": {
      get: {
        tags: ["Tasks"],
        summary: "Get one task",
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
          { name: "taskId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "Task" } },
      },
      put: {
        tags: ["Tasks"],
        summary: "Update task",
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
          { name: "taskId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Updated" },
          400: { description: "e.g. Assignee is on leave for the selected date" },
        },
      },
    },
    "/organisations/{orgId}/calendar": {
      get: {
        tags: ["Calendar"],
        summary: "List calendar events for a month",
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string" } },
          { name: "month", in: "query", schema: { type: "string", example: "2026-07" } },
        ],
        responses: { 200: { description: "Events" } },
      },
      post: {
        tags: ["Calendar"],
        summary: "Create calendar event",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 201: { description: "Created" } },
      },
    },
    "/organisations/{orgId}/calendar/sync-tasks": {
      post: {
        tags: ["Calendar"],
        summary: "Sync task due dates into calendar",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Sync result" } },
      },
    },
    "/organisations/{orgId}/calendar/{eventId}/start": {
      post: {
        tags: ["Calendar"],
        summary: "Start meeting",
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string" } },
          { name: "eventId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "Meeting live" } },
      },
    },
    "/organisations/{orgId}/leaves": {
      post: {
        tags: ["Leave"],
        summary: "Apply for leave",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 201: { description: "Requested" } },
      },
    },
    "/organisations/{orgId}/leaves/mine": {
      get: {
        tags: ["Leave"],
        summary: "My leave requests",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Leaves" } },
      },
    },
    "/organisations/{orgId}/leaves/on-leave": {
      get: {
        tags: ["Leave"],
        summary: "Users on approved leave",
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string" } },
          { name: "date", in: "query", schema: { type: "string", example: "2026-07-29" } },
        ],
        responses: { 200: { description: "On-leave entries" } },
      },
    },
    "/dashboard/overview": {
      get: {
        tags: ["Dashboard"],
        summary: "Batched dashboard overview",
        description:
          "One request for stats, workload, deadlines, and notification preview. Use `include` to select sections.",
        parameters: [
          { name: "organizationId", in: "query", schema: { type: "string" } },
          { name: "personal", in: "query", schema: { type: "boolean" } },
          {
            name: "include",
            in: "query",
            schema: {
              type: "string",
              example: "stats,workload,upcomingDeadlines,missedDeadlines,notifications",
            },
          },
          { name: "startDate", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: { 200: { description: "Overview sections object" } },
      },
    },
    "/dashboard/stats": {
      get: {
        tags: ["Dashboard"],
        summary: "Dashboard summary stats",
        parameters: [{ name: "organizationId", in: "query", schema: { type: "string" } }],
        responses: { 200: { description: "Stats" } },
      },
    },
    "/dashboard/task-overview": {
      get: {
        tags: ["Dashboard"],
        summary: "Task counts by status",
        parameters: [{ name: "organizationId", in: "query", schema: { type: "string" } }],
        responses: { 200: { description: "Overview" } },
      },
    },
    "/dashboard/team-workload": {
      get: {
        tags: ["Dashboard"],
        summary: "Team workload",
        parameters: [
          { name: "organizationId", in: "query", schema: { type: "string" } },
          { name: "startDate", in: "query", schema: { type: "string" } },
          { name: "endDate", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: { description: "Workload" } },
      },
    },
    "/meetings/{roomId}": {
      get: {
        tags: ["Meetings"],
        summary: "Resolve shareable meeting link",
        parameters: [{ name: "roomId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Meeting details" } },
      },
    },
    "/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "List notifications",
        description: "Returns the current user's notifications (newest first).",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 100 }, example: 10 },
          { name: "organizationId", in: "query", schema: { type: "string" } },
          { name: "personal", in: "query", schema: { type: "boolean" } },
          { name: "unread", in: "query", schema: { type: "boolean" } },
          {
            name: "type",
            in: "query",
            schema: { type: "string" },
            description: "Single type or comma-separated list",
          },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "archived", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          200: {
            description: "Notification list",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Notification" },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
        },
      },
      post: {
        tags: ["Notifications"],
        summary: "Create notification",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateNotificationRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Notification" },
              },
            },
          },
          400: { description: "Title and message are required" },
        },
      },
    },
    "/notifications/summary": {
      get: {
        tags: ["Notifications"],
        summary: "Unread notification count",
        parameters: [
          { name: "organizationId", in: "query", schema: { type: "string" } },
          { name: "personal", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          200: {
            description: "Summary",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NotificationSummary" },
              },
            },
          },
        },
      },
    },
    "/notifications/read-all": {
      put: {
        tags: ["Notifications"],
        summary: "Mark all notifications as read",
        responses: {
          200: {
            description: "All marked read",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
    "/notifications/{id}/read": {
      put: {
        tags: ["Notifications"],
        summary: "Mark one notification as read",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Updated notification",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Notification" },
              },
            },
          },
          404: { description: "Notification not found" },
        },
      },
    },
    "/notifications/{id}/archive": {
      put: {
        tags: ["Notifications"],
        summary: "Archive one notification",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Archived notification",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Notification" },
              },
            },
          },
          404: { description: "Notification not found" },
        },
      },
    },
    "/search": {
      get: {
        tags: ["Search"],
        summary: "Search",
        parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Results" } },
      },
    },
    "/trash": {
      get: { tags: ["Trash"], summary: "List soft-deleted items", responses: { 200: { description: "Trash" } } },
    },
    "/workload": {
      get: { tags: ["Workload"], summary: "Workload views", responses: { 200: { description: "Data" } } },
    },
    "/reports": {
      get: { tags: ["Reports"], summary: "Reports entrypoints", responses: { 200: { description: "Reports" } } },
    },
  },
};

const swaggerSpec = swaggerJsdoc({
  definition,
  apis: [],
});

module.exports = {
  swaggerSpec,
  swaggerUiOptions: {
    customSiteTitle: "WriTask API Docs",
    customCss: ".swagger-ui .topbar { display: none }",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  },
};
