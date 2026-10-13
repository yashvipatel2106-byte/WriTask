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

  // ── workspace role & status ──────────────────────────────────────────────
  status: {
    type: String,
    enum: ["Active", "Idle", "Offline", "Suspended"],
    default: "Active",
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
  },

  // ── auth / verification ──────────────────────────────────────────────────
  otp: String,

  otpExpiry: Date,

  resetToken: String,

  resetTokenExpiry: Date,

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