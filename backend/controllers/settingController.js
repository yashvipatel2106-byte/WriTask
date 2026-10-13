const User = require("../models/user");

exports.getSettings = async (req, res) => {
  try {

    const user =
      await User.findById(
        req.user._id
      );

    res.json(user.settings);

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};

exports.updateSettings = async (req, res) => {
  try {

    const user =
      await User.findById(
        req.user._id
      );

    user.settings = {
      ...user.settings,
      ...req.body,
    };

    await user.save();

    res.json({
      success: true,
      message:
        "Settings Updated Successfully",
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};