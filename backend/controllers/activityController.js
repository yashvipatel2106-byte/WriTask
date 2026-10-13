const Activity = require("../models/activity");

// GET /api/activities
// Query params: type, search, limit, page
const getActivities = async (req, res) => {
  try {
    const { type, search, limit = 50, page = 1 } = req.query;

    const filter = {};

    // Filter by type
    if (type && type !== "All") {
      filter.type = type;
    }

    // Filter by action text
    if (search) {
      filter.action = { $regex: search, $options: "i" };
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Activity.countDocuments(filter);

    const activities = await Activity
      .find(filter)
      .populate("user", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      activities,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error("getActivities error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/activities  (internal helper — called from other controllers)
const logActivity = async (userId, action, type = "General") => {
  try {
    await Activity.create({ user: userId, action, type });
  } catch (error) {
    console.error("logActivity error:", error);
  }
};

module.exports = { getActivities, logActivity };
