const Task = require("../models/Task");

const getWorkload = async (req, res) => {
  try {
    const projectId = req.params.projectId;

    const tasks = await Task.find({
      project: projectId,
      isDeleted: { $ne: true },
    })
      .populate("assignee", "username email designation avatarColor")
      .lean();

    const members = {};

    tasks.forEach((task) => {
      if (!task.assignee) return;

      const id = task.assignee._id.toString();

      if (!members[id]) {
        members[id] = {
          id,
          name: task.assignee.username,
          email: task.assignee.email,
          role: task.assignee.designation || "Developer",

          assignedTasks: 0,
          completedTasks: 0,

          totalHours: 0,

          completion: 0,
        };
      }

      members[id].assignedTasks++;

      if (task.status === "done") {
        members[id].completedTasks++;
      }

      members[id].totalHours +=
        task.durationHours ||
        task.effortHours ||
        0;
    });

    Object.values(members).forEach((member) => {
      member.completion =
        member.assignedTasks === 0
          ? 0
          : Math.round(
              (member.completedTasks /
                member.assignedTasks) *
                100
            );
    });

    res.json(Object.values(members));
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: err.message,
    });
  }
};

module.exports = {
  getWorkload,
};