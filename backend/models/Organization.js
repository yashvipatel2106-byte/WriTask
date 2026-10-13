const mongoose = require("mongoose");

const weekdayScheduleSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    startTime: { type: String, default: "09:00" },
    endTime: { type: String, default: "18:00" },
    breakMinutes: { type: Number, default: 60, min: 0, max: 24 * 60 },
  },
  { _id: false }
);

const workingScheduleSchema = new mongoose.Schema(
  {
    timezone: { type: String, default: "Asia/Kolkata" },
    monday: { type: weekdayScheduleSchema, default: () => ({}) },
    tuesday: { type: weekdayScheduleSchema, default: () => ({}) },
    wednesday: { type: weekdayScheduleSchema, default: () => ({}) },
    thursday: { type: weekdayScheduleSchema, default: () => ({}) },
    friday: { type: weekdayScheduleSchema, default: () => ({}) },
    saturday: {
      type: weekdayScheduleSchema,
      default: () => ({
        enabled: false,
        startTime: "09:00",
        endTime: "18:00",
        breakMinutes: 0,
      }),
    },
    sunday: {
      type: weekdayScheduleSchema,
      default: () => ({
        enabled: false,
        startTime: "09:00",
        endTime: "18:00",
        breakMinutes: 0,
      }),
    },
  },
  { _id: false }
);

const resourceSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    hoursPerDay: { type: Number, default: null, min: 0, max: 24 },
    hoursPerWeek: { type: Number, default: null, min: 0, max: 168 },
    utilizationTarget: { type: Number, default: 80, min: 1, max: 200 },
  },
  { _id: false }
);


  
// sub Schema for organization members
const orgMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      default: "developer",
    },
    department: {
      type: String,
      default: "",
    },
    permissionOverrides: {
      useCustom: { type: Boolean, default: false },
      orgPermissions: { type: [String], default: [] },
      projectPermissions: { type: [String], default: [] },
    },
    resourceSettings: {
      type: resourceSettingsSchema,
      default: () => ({}),
    },
    workingSchedule: {
      type: workingScheduleSchema,
      default: undefined,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    // Organization-specific login password (bcrypt hash). Optional until
    // migrated from the legacy global User.password. Never expose via APIs.
    password: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

// 
const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    logo: {
      filename: { type: String, default: null },
      originalName: { type: String, default: "" },
      mimeType: { type: String, default: "" },
      updatedAt: { type: Date, default: null },
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [orgMemberSchema],
    roleDefinitions: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        isBuiltin: { type: Boolean, default: false },
        level: { type: Number, default: 1 },
        orgPermissions: { type: [String], default: [] },
        projectPermissions: { type: [String], default: [] },
      },
    ],

    hoursPerDay: {
      type: Number,
      default: 8,
      min: 1,
      max: 24,
    },

    defaultWorkingSchedule: {
      type: workingScheduleSchema,
      default: undefined,
    },

  holidayLocation: {
  country: { type: String, default: "IN" },
  countryName: { type: String, default: "India" },
  state: { type: String, default: "GJ" },
  stateName: { type: String, default: "Gujarat" },
},
   

    customFieldDefinitions: {
      type: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          type: {
            type: String,
            enum: [
              "text",
              "number",
              "single_select",
              "percentage",
              "multiple_select",
              "checkbox",
            ],
            required: true,
          },
          options: { type: [String], default: [] },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

function resolveOrgMemberUserId(member) {
  if (!member?.user) return null;
  const u = member.user;
  if (typeof u === "object" && u._id) return u._id.toString();
  return u.toString();
}

organizationSchema.methods.getMemberRole = function (userId) {
  const id = userId.toString();
  if (this.owner && this.owner.toString() === id) return "owner";
  const member = this.members.find((m) => resolveOrgMemberUserId(m) === id);
  return member ? member.role : null;
};

organizationSchema.methods.isMember = function (userId) {
  const id = userId.toString();
  if (this.owner && this.owner.toString() === id) return true;
  return this.members.some((m) => resolveOrgMemberUserId(m) === id);
};

module.exports = mongoose.model("Organization", organizationSchema);
