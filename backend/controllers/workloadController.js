const { getTeamWorkloadData } = require("./dashboardController");

const getWorkload = async (req, res) => {
  try {
    const projectId = req.query.projectId || req.params.projectId;
    const organizationId = req.query.organizationId;
    if (!projectId && !organizationId) {
      return res.status(400).json({
        message: "projectId or organizationId is required",
      });
    }

    const data = await getTeamWorkloadData(req.user._id, {
      ...req.query,
      projectId,
      organizationId,
    });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

module.exports = {
  getWorkload,
};
