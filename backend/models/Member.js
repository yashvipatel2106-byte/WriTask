const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    role: {
      type: String,
      default: "Developer",
    },

    status: {
      type: String,
      default: "Active",
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

    phone: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.Member ||
  mongoose.model("Member", memberSchema);