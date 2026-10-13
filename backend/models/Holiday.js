const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    date: {
      type: Date,
      required: true,
    },

    dateKey: {
      type: String,
      required: true,
    },

    year: {
      type: Number,
      required: true,
      index: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    country: {
      type: String,
      default: "India",
      immutable: true,
    },

    state: {
      type: String,
      default: "Gujarat",
      immutable: true,
    },

    source: {
      type: String,
      enum: ["government", "manual"],
      default: "government",
    },

    isEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

holidaySchema.index(
  {
    organizationId: 1,
    dateKey: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

holidaySchema.index({
  organizationId: 1,
  year: 1,
  isEnabled: 1,
  dateKey: 1,
});

module.exports =
  mongoose.models.Holiday ||
  mongoose.model("Holiday", holidaySchema);