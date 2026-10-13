const Notification = require("../models/Notification");
const Project = require("../models/Project");

async function getScopedProjectIds(userId, { organizationId, personal }) {
  const baseFilter = {
    isDeleted: { $ne: true },
    "members.user": userId,
  };

  if (organizationId) {
    return Project.find({
      ...baseFilter,
      organization: organizationId,
    }).distinct("_id");
  }

  if (personal === "true") {
    return Project.find({
      ...baseFilter,
      organization: null,
    }).distinct("_id");
  }

  return null;
}

async function buildUserFilter(userId, query) {
  const filter = {
    user: userId,
    archived: query.archived === "true" ? true : { $ne: true },
  };

  if (query.unread === "true") {
    filter.read = false;
  }

  if (query.type && query.type !== "all") {
    // Supports a comma-separated list (e.g. "leave_requested,leave_approved,leave_rejected")
    // so a single filter option can group several related notification types.
    filter.type = query.type.includes(",")
      ? { $in: query.type.split(",").map((t) => t.trim()).filter(Boolean) }
      : query.type;
  }

  if (query.search?.trim()) {
    const term = query.search.trim();
    filter.$or = [
      { title: { $regex: term, $options: "i" } },
      { message: { $regex: term, $options: "i" } },
    ];
  }

  const projectIds = await getScopedProjectIds(userId, query);
  if (projectIds) {
    // Include `null` alongside the org's actual project ids — otherwise
    // any notification with no projectId (leave requests/approvals, which
    // aren't tied to a project) gets silently excluded from every org-scoped
    // view, even though it was created successfully. `$in` with `null`
    // matches both a literal null value and a missing field.
    filter.projectId = { $in: [...projectIds, null] };
  }

  return filter;
}

exports.getNotificationSummary = async (req, res) => {
  try {
    const filter = await buildUserFilter(req.user._id, req.query);

    const unreadCount = await Notification.countDocuments({
      ...filter,
      read: false,
    });

    res.json({ unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const filter = await buildUserFilter(req.user._id, req.query);

    const notifications = await Notification.find(filter)
      .populate("actor", "username email")
      .sort({ createdAt: -1 })
      .limit(limit);

    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createNotification = async (req, res) => {
  try {
    const { title, message, type, taskId, projectId, priority, link } = req.body;

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    const notification = await Notification.create({
      user: req.user._id,
      actor: req.user._id,
      type: type || "reply",
      title: title.trim(),
      message: message.trim(),
      taskId: taskId || null,
      projectId: projectId || null,
      priority: priority || "Medium",
      link: link || "",
    });

    const populated = await Notification.findById(notification._id).populate(
      "actor",
      "username email"
    );

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    ).populate("actor", "username email");

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.status(200).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false, archived: { $ne: true } },
      { read: true }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.archiveNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { archived: true, read: true },
      { new: true }
    ).populate("actor", "username email");

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.status(200).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
