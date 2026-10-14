const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

  username: {
    type: String,
    required: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },

  // Not required — Google-signed-in users have no password of their own.
  password: {
    type: String,
  },

  // Set when the account was created (or later linked) via Google Sign-In.
  googleId: {
    type: String,
    default: null,
  },

  // ── profile ──────────────────────────────────────────────────────────────
  phone: {
    type: String,
    default: "",
  },

  designation: {
    type: String,
    default: "",
  },

  department: {
    type: String,
    default: "",
  },

  location: {
    type: String,
    default: "",
  },

  bio: {
    type: String,
    default: "",
  },

  avatarColor: {
    type: String,
    default: "",
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

  // ── workspace role & status ──────────────────────────────────────────────
  status: {
    type: String,
    enum: ["Active", "Idle", "Offline", "Suspended"],
    default: "Active",
  },

  /*
   * ── presence / status preference ─────────────────────────────────────
   * Separate from `status` above (account lifecycle — Active/Suspended/…)
   * and separate from real-time presence (tracked ephemerally in Redis,
   * see utils/presenceService.js). This is only the user's persisted
   * preference:
   * - "automatic": displayed status follows real-time presence
   *   (online -> Available, offline -> Offline).
   * - "manual": displayed status is pinned to `manualStatus` until reset
   *   or `statusExpiresAt` passes.
   */
  statusMode: {
    type: String,
    enum: ["automatic", "manual"],
    default: "automatic",
  },

  manualStatus: {
    type: String,
    enum: ["available", "busy", "dnd", "brb", "away", "offline", null],
    default: null,
  },

  // When set, a background sweep resets statusMode/manualStatus back to
  // automatic once this passes (also checked lazily on read).
  statusExpiresAt: {
    type: Date,
    default: null,
  },

  lastSeenAt: {
    type: Date,
    default: null,
  },

  // User-controlled visibility toggle — when false, other users never
  // see this person's status badge at all (regardless of statusMode).
  statusVisible: {
    type: Boolean,
    default: true,
  },

  // ── account settings ─────────────────────────────────────────────────────
  settings: {
    emailNotifications: {
      type: Boolean,
      default: true,
    },

    taskNotifications: {
      type: Boolean,
      default: true,
    },

    projectNotifications: {
      type: Boolean,
      default: true,
    },

    twoFactorAuth: {
      type: Boolean,
      default: false,
    },

    language: {
      type: String,
      default: "English",
    },

    theme: {
      type: String,
      default: "dark",
    },

    // A user-owned palette, independent from the browser/device used to sign in.
    // Null means the user has not picked one yet, so the client follows system mode.
    colorTheme: {
      type: String,
      enum: [
        "white",
        "black",
        "blue",
        "purple",
        "emerald",
        "teal",
        "orange",
        "red",
        "pink",
        "amber",
        // Legacy ids still accepted so older saved prefs can load and migrate.
        "navy",
        "azure",
        "lavender",
        "softRed",
        "yellow",
        "mint",
        null,
      ],
      default: null,
    },
  },

  // ── auth / verification ──────────────────────────────────────────────────
  otp: String,

  otpExpiry: Date,

  otpAttempts: {
    type: Number,
    default: 0,
  },

  resetToken: String,

  resetTokenExpiry: Date,

  // Organization membership this reset token applies to (null = personal User.password).
  // Set only by the server during forgot-password after validating membership.
  resetOrganizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    default: null,
  },

  verified: {
    type: Boolean,
    default: false,
  },

  systemRole: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
});

// Indexes for fast search queries (email already indexed via unique: true)
userSchema.index({ username: 1 });
userSchema.index({
  username: "text",
  email: "text",
  designation: "text",
  department: "text",
  bio: "text",
});

module.exports =
  mongoose.models.User ||
  mongoose.model("User", userSchema);
